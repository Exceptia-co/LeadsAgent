import type { Express } from 'express';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';
import { logger } from './utils/logger';
import { initializeSocketService } from './services/SocketService';
import { validateEnv } from './config/env';

// Fase A6 (2026-04-19): capturar errores no manejados pero NO matar el proceso.
// Antes un uncaughtException en una sesión WhatsApp tumbaba todas las demás
// (cada sesión = 1 Chromium; si whatsapp-web.js dispara un error, el proceso
// entero se moría). Ahora loguear y continuar; la sesión problemática se
// recupera vía SessionRecoveryService. El graceful recovery por sesión
// específica se afinará en Fase C8 (detached frame healthcheck).
process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
  logger.error('Uncaught Exception — keeping process alive to protect other sessions:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', { promise, reason });
  logger.error('Unhandled Rejection — keeping process alive to protect other sessions:', {
    promise,
    reason,
  });
});

logger.info('🏁 Starting bootstrap process...');

const rootEnvPath = path.resolve(process.cwd(), '../../.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
  logger.info(`📁 Loaded root .env from: ${rootEnvPath}`);
} else {
  logger.info('📁 No root .env found, using system environment variables');
}

// Fase A5: validación centralizada con zod. Corre AQUÍ (tras dotenv.config, antes
// de crear el Express app) para que un fallo crítico en prod termine el proceso
// antes de abrir puertos o registrar listeners.
validateEnv();

const app: Express = express();
const PORT = process.env.WHATSAPP_SERVICE_PORT || process.env.PORT || 3002;

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Start server
async function bootstrap() {
  try {
    logger.info('🚀 Starting WhatsApp service bootstrap...');
    logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`🔧 Port: ${PORT}`);
    logger.info(`📁 Current working directory: ${process.cwd()}`);

    logger.info('📦 Loading middleware and routes...');

    // Import middleware and routes dynamically for better error handling
    const { logRequest, rateLimit } = await import('./middleware/validation');
    const { verifyServiceSignature } = await import('./middleware/auth');
    const routes = await import('./routes');

    logger.info('✅ Middleware and routes loaded');

    // Middleware
    logger.info('🔧 Configuring middleware...');

    // CORS configuration - only allow localhost in development
    const isProduction = process.env.NODE_ENV === 'production';
    const corsOrigins = process.env.CORS_ORIGIN?.split(',');

    if (isProduction && !corsOrigins) {
      logger.warn('⚠️  CORS_ORIGIN not configured in production! Using restrictive defaults.');
    }

    app.use(
      cors({
        origin:
          corsOrigins ||
          (isProduction
            ? false // Block all in production if not configured
            : [
                'http://localhost:3000',
                'http://localhost:3001',
                'http://localhost:3002',
                'http://localhost:3003',
              ]),
        credentials: true,
      })
    );

    // Capture the raw body buffer so verifyServiceSignature can rebuild the
    // HMAC. express.json still parses normally for downstream middleware.
    app.use(
      express.json({
        limit: '10mb',
        verify: (req, _res, buf) => {
          (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
        },
      })
    );
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Custom middleware
    app.use(logRequest);
    app.use(rateLimit); // Rate limiting middleware (global IP)

    // T0.4-ter: HMAC service-to-service auth. Applied before the routers
    // (except for public liveness endpoints listed inside the middleware).
    app.use(verifyServiceSignature);

    // Serve static files from public directory
    const publicPath = path.join(__dirname, 'public');
    logger.info(`📂 Setting up static file serving from: ${publicPath}`);
    app.use('/public', express.static(publicPath));
    app.use(express.static(publicPath)); // Also serve directly from root

    // T0.4-ter: routes mounted on a single path. The previous double mount
    // (`/` + `/api`) duplicated the attack surface.
    app.use('/api', routes.default);

    // Error handling middleware
    app.use(
      (error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
        logger.error('Unhandled error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      }
    );

    // 404 handler
    app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
      });
    });

    logger.info('✅ Middleware configured');

    logger.info('🔄 Loading services...');

    // Import services
    const WhatsAppServiceModule = await import('./services/WhatsAppService');
    const AIServiceModule = await import('./services/AIService');
    const DatabaseServiceModule = await import('./services/DatabaseService');
    const { redisClient } = await import('./config/redis');

    const WhatsAppService = WhatsAppServiceModule.default;
    const AIService = AIServiceModule.default;
    const DatabaseService = DatabaseServiceModule.default;

    logger.info('✅ Services loaded');

    logger.info('🔄 Initializing Redis service...');
    try {
      await redisClient.connect();
      const pingResult = await redisClient.ping();
      logger.info(`✅ Redis service initialized successfully (ping: ${pingResult})`);
    } catch (error) {
      logger.warn('⚠️  Redis connection failed, running without cache:', error);
    }

    logger.info('🔄 Initializing database service...');
    await DatabaseService.testConnection();
    await DatabaseService.initializeTable();
    logger.info('✅ Database service initialized');

    logger.info('🔄 Initializing AI service...');
    const aiStatus = AIService.getStatus();
    logger.info(
      `IA Status: OpenRouter=${aiStatus.openrouter}, Gemini=${aiStatus.gemini}, Current=${aiStatus.current}`
    );
    logger.info('✅ AI service initialized');

    logger.info('🔄 Initializing WhatsApp service...');
    const whatsappService = WhatsAppService;
    await whatsappService.initialize();
    logger.info('✅ WhatsApp service initialized successfully');

    // Graceful shutdown handlers
    const gracefulShutdown = async () => {
      logger.info('🛑 Shutting down gracefully...');

      // Set shutdown timeout - force exit after 45 seconds
      const shutdownTimeout = setTimeout(() => {
        logger.error('⏰ Shutdown timeout reached, forcing exit...');
        process.exit(1);
      }, 45000);

      try {
        // Shutdown Socket.IO service first
        logger.info('🔌 Shutting down WebSocket service...');
        await socketServiceForShutdown.shutdown();

        logger.info('📱 Shutting down WhatsApp service...');
        await whatsappService.shutdown();

        logger.info('🔴 Shutting down Redis service...');
        try {
          await redisClient.disconnect();
          logger.info('✅ Redis disconnected successfully');
        } catch (redisError) {
          logger.warn('⚠️ Redis disconnect warning (non-critical):', redisError);
        }

        clearTimeout(shutdownTimeout);
        logger.info('🏁 All services shut down successfully');
      } catch (error) {
        logger.error('❌ Error during shutdown:', error);
        clearTimeout(shutdownTimeout);
      }

      process.exit(0);
    };

    // Register shutdown handlers
    process.on('SIGTERM', () => {
      logger.info('🚨 SIGTERM received, starting graceful shutdown...');
      gracefulShutdown();
    });

    process.on('SIGINT', () => {
      logger.info('🚨 SIGINT received (Ctrl+C), starting graceful shutdown...');
      gracefulShutdown();
    });

    // Handle Windows-specific signals
    if (process.platform === 'win32') {
      process.on('SIGBREAK', () => {
        logger.info('🚨 SIGBREAK received (Windows), starting graceful shutdown...');
        gracefulShutdown();
      });
    }

    logger.info('🌐 Starting HTTP server...');
    const httpServer = createServer(app);

    // Initialize Socket.IO for real-time updates
    logger.info('🔌 Initializing WebSocket service...');
    const socketService = initializeSocketService(httpServer);
    logger.info('✅ WebSocket service initialized');

    // Make socketService available for shutdown
    const socketServiceForShutdown = socketService;

    const server = httpServer.listen(PORT, () => {
      logger.info(`🟢 WhatsApp service running on port ${PORT}`);
      logger.info(`📱 Ready to handle WhatsApp sessions`);
      logger.info(`🔗 API endpoints available at http://localhost:${PORT}/api`);
      logger.info(`🔌 WebSocket endpoints available at ws://localhost:${PORT}/whatsapp-socket/`);
      logger.info('✨ Service startup completed successfully');
    });

    server.on('error', (error: any) => {
      logger.error('Server error:', error);
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use. Please choose a different port.`);
      }
      process.exit(1);
    });
  } catch (error) {
    logger.error('❌ Failed to start WhatsApp service:', error);
    logger.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
    process.exit(1);
  }
}

bootstrap().catch(error => {
  logger.error('❌ Bootstrap failed with unhandled error:', error);
  process.exit(1);
});

export default app;
