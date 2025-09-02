import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import { createServer } from 'http'
import { logger } from './utils/logger'
import { initializeSocketService } from './services/SocketService'

// Capturar errores no manejados ANTES de cualquier otro código
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
  logger.error('Uncaught Exception:', error)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', { promise, reason })
  logger.error('Unhandled Rejection at:', { promise, reason })
  process.exit(1)
})

logger.info('🏁 Starting bootstrap process...')

// Load environment variables from project root and local
const rootEnvPath = path.resolve(process.cwd(), '../../.env');
const localEnvPath = path.resolve(process.cwd(), '.env');

// Try to load local .env first (higher priority)
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
  logger.info(`📁 Loaded local .env from: ${localEnvPath}`);
}

// Then load root .env (will not override existing vars)
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
  logger.info(`📁 Loaded root .env from: ${rootEnvPath}`);
}

const app = express()
const PORT = process.env.WHATSAPP_SERVICE_PORT || process.env.PORT || 3002

// Trust proxy for rate limiting
app.set('trust proxy', 1)

// Start server
async function bootstrap() {
  try {
    logger.info('🚀 Starting WhatsApp service bootstrap...')
    logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`)
    logger.info(`🔧 Port: ${PORT}`)
    logger.info(`📁 Current working directory: ${process.cwd()}`)
    
    // Check if .env file exists
    const envPath = path.resolve(process.cwd(), '../../.env')
    logger.info(`🔍 Looking for .env file at: ${envPath}`)
    
    if (fs.existsSync(envPath)) {
      logger.info('✅ .env file found')
    } else {
      logger.warn('⚠️  .env file not found, using system environment variables')
    }

    logger.info('📦 Loading middleware and routes...')

    // Import middleware and routes dynamically for better error handling
    const { logRequest, rateLimit } = await import('./middleware/validation')
    const routes = await import('./routes')
    
    logger.info('✅ Middleware and routes loaded')

    // Middleware
    logger.info('🔧 Configuring middleware...')
    
    app.use(cors({
      origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003'],
      credentials: true
    }))

    app.use(express.json({ limit: '10mb' }))
    app.use(express.urlencoded({ extended: true, limit: '10mb' }))

    // Custom middleware
    app.use(logRequest)
    app.use(rateLimit) // Rate limiting middleware
    
    // Serve static files from public directory
    const publicPath = path.join(__dirname, 'public')
    logger.info(`📂 Setting up static file serving from: ${publicPath}`)
    app.use('/public', express.static(publicPath))
    app.use(express.static(publicPath)) // Also serve directly from root

    // API routes
    app.use('/api', routes.default)
    app.use('/', routes.default) // Also allow direct access

    // Error handling middleware
    app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error:', error)
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      })
    })

    // 404 handler
    app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found'
      })
    })

    logger.info('✅ Middleware configured')

    logger.info('🔄 Loading services...')
    
    // Import services
    const WhatsAppServiceModule = await import('./services/WhatsAppService')
    const AIServiceModule = await import('./services/AIService')
    const DatabaseServiceModule = await import('./services/DatabaseService')
    const { redisClient } = await import('./config/redis')
    
    const WhatsAppService = WhatsAppServiceModule.default
    const AIService = AIServiceModule.default
    const DatabaseService = DatabaseServiceModule.default
    
    logger.info('✅ Services loaded')
    
    logger.info('🔄 Initializing Redis service...')
    try {
      await redisClient.connect()
      const pingResult = await redisClient.ping()
      logger.info(`✅ Redis service initialized successfully (ping: ${pingResult})`)
    } catch (error) {
      logger.warn('⚠️  Redis connection failed, running without cache:', error)
    }
    
    logger.info('🔄 Initializing database service...')
    await DatabaseService.testConnection()
    await DatabaseService.initializeTable()
    logger.info('✅ Database service initialized')
    
    logger.info('🔄 Initializing AI service...')
    const aiStatus = AIService.getStatus()
    logger.info(`IA Status: OpenRouter=${aiStatus.openrouter}, Gemini=${aiStatus.gemini}, Current=${aiStatus.current}`)
    logger.info('✅ AI service initialized')
    
    logger.info('🔄 Initializing WhatsApp service...')
    const whatsappService = new WhatsAppService()
    await whatsappService.initialize()
    logger.info('✅ WhatsApp service initialized successfully')
    
    // Graceful shutdown handlers
    const gracefulShutdown = async () => {
      logger.info('🛑 Shutting down gracefully...')
      
      // Set shutdown timeout - force exit after 45 seconds
      const shutdownTimeout = setTimeout(() => {
        logger.error('⏰ Shutdown timeout reached, forcing exit...')
        process.exit(1)
      }, 45000);

      try {
        // Shutdown Socket.IO service first
        logger.info('🔌 Shutting down WebSocket service...')
        await socketServiceForShutdown.shutdown()
        
        
        logger.info('📱 Shutting down WhatsApp service...')
        await whatsappService.shutdown()
        
        logger.info('🔴 Shutting down Redis service...')
        try {
          await redisClient.disconnect()
          logger.info('✅ Redis disconnected successfully')
        } catch (redisError) {
          logger.warn('⚠️ Redis disconnect warning (non-critical):', redisError)
        }
        
        clearTimeout(shutdownTimeout)
        logger.info('🏁 All services shut down successfully')
      } catch (error) {
        logger.error('❌ Error during shutdown:', error)
        clearTimeout(shutdownTimeout)
      }
      
      process.exit(0)
    }

    // Register shutdown handlers
    process.on('SIGTERM', () => {
      logger.info('🚨 SIGTERM received, starting graceful shutdown...')
      gracefulShutdown()
    })
    
    process.on('SIGINT', () => {
      logger.info('🚨 SIGINT received (Ctrl+C), starting graceful shutdown...')
      gracefulShutdown()
    })

    // Handle Windows-specific signals
    if (process.platform === 'win32') {
      process.on('SIGBREAK', () => {
        logger.info('🚨 SIGBREAK received (Windows), starting graceful shutdown...')
        gracefulShutdown()
      })
    }

    logger.info('🌐 Starting HTTP server...')
    const httpServer = createServer(app)
    
    // Initialize Socket.IO for real-time updates
    logger.info('🔌 Initializing WebSocket service...')
    const socketService = initializeSocketService(httpServer)
    logger.info('✅ WebSocket service initialized')
    
    // Make socketService available for shutdown
    let socketServiceForShutdown = socketService
    
    const server = httpServer.listen(PORT, () => {
      logger.info(`🟢 WhatsApp service running on port ${PORT}`)
      logger.info(`📱 Ready to handle WhatsApp sessions`)
      logger.info(`🔗 API endpoints available at http://localhost:${PORT}/api`)
      logger.info(`🔌 WebSocket endpoints available at ws://localhost:${PORT}/whatsapp-socket/`)
      logger.info('✨ Service startup completed successfully')
    })

    server.on('error', (error: any) => {
      logger.error('Server error:', error)
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use. Please choose a different port.`)
      }
      process.exit(1)
    })

  } catch (error) {
    logger.error('❌ Failed to start WhatsApp service:', error)
    logger.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available')
    process.exit(1)
  }
}

bootstrap().catch((error) => {
  logger.error('❌ Bootstrap failed with unhandled error:', error)
  process.exit(1)
})

export default app
