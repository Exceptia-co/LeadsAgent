import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
// import WhatsAppService from './services/WhatsAppService'
import routes from './routes'
import { logRequest, rateLimit } from './middleware/validation'
import { logger } from './utils/logger'

// Load environment variables from project root
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') })

const app = express()
const PORT = process.env.WHATSAPP_SERVICE_PORT || process.env.PORT || 3002

// Trust proxy for rate limiting
app.set('trust proxy', 1)

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Custom middleware
app.use(logRequest)
app.use(rateLimit) // Rate limiting middleware

// API routes
app.use('/api', routes)
app.use('/', routes) // Also allow direct access

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

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...')
  // await WhatsAppService.shutdown()
  process.exit(0)
})

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...')
  // await WhatsAppService.shutdown()
  process.exit(0)
})

// Capturar errores no manejados para debugging
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason })
  process.exit(1)
})

// Start server
async function bootstrap() {
  try {
    logger.info('🚀 Starting WhatsApp service bootstrap (DEBUG MODE)...')
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

    logger.info('🔄 Skipping WhatsApp service initialization for debugging...')
    // Initialize WhatsApp service
    // await WhatsAppService.initialize()
    logger.info('✅ WhatsApp service initialization skipped')
    
    logger.info('🌐 Starting HTTP server...')
    const server = app.listen(PORT, () => {
      logger.info(`🟢 WhatsApp service running on port ${PORT} (DEBUG MODE)`)
      logger.info(`📱 WhatsApp features disabled for debugging`)
      logger.info(`🔗 API endpoints available at http://localhost:${PORT}/api`)
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

logger.info('🏁 Starting bootstrap process...')
bootstrap().catch((error) => {
  logger.error('❌ Bootstrap failed with unhandled error:', error)
  process.exit(1)
})

export default app
