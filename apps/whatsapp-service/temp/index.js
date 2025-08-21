"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const WhatsAppService_1 = __importDefault(require("./services/WhatsAppService"));
const routes_1 = __importDefault(require("./routes"));
const validation_1 = require("./middleware/validation");
const logger_1 = require("./utils/logger");
// Load environment variables from project root
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '../../.env') });
const app = (0, express_1.default)();
const PORT = process.env.WHATSAPP_SERVICE_PORT || process.env.PORT || 3002;
// Trust proxy for rate limiting
app.set('trust proxy', 1);
// Middleware
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Custom middleware
app.use(validation_1.logRequest);
app.use(validation_1.rateLimit); // Rate limiting middleware
// API routes
app.use('/api', routes_1.default);
app.use('/', routes_1.default); // Also allow direct access
// Error handling middleware
app.use((error, req, res, next) => {
    logger_1.logger.error('Unhandled error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});
// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});
// Graceful shutdown
process.on('SIGTERM', async () => {
    logger_1.logger.info('SIGTERM received, shutting down gracefully...');
    await WhatsAppService_1.default.shutdown();
    process.exit(0);
});
process.on('SIGINT', async () => {
    logger_1.logger.info('SIGINT received, shutting down gracefully...');
    await WhatsAppService_1.default.shutdown();
    process.exit(0);
});
// Capturar errores no manejados para debugging
process.on('uncaughtException', (error) => {
    logger_1.logger.error('Uncaught Exception:', error);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    logger_1.logger.error('Unhandled Rejection at:', { promise, reason });
    process.exit(1);
});
// Start server
async function bootstrap() {
    try {
        logger_1.logger.info('🚀 Starting WhatsApp service bootstrap...');
        logger_1.logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
        logger_1.logger.info(`🔧 Port: ${PORT}`);
        logger_1.logger.info(`📁 Current working directory: ${process.cwd()}`);
        // Check if .env file exists
        const envPath = path_1.default.resolve(process.cwd(), '../../.env');
        logger_1.logger.info(`🔍 Looking for .env file at: ${envPath}`);
        if (fs_1.default.existsSync(envPath)) {
            logger_1.logger.info('✅ .env file found');
        }
        else {
            logger_1.logger.warn('⚠️  .env file not found, using system environment variables');
        }
        logger_1.logger.info('🔄 Initializing WhatsApp service...');
        // Initialize WhatsApp service
        await WhatsAppService_1.default.initialize();
        logger_1.logger.info('✅ WhatsApp service initialized successfully');
        logger_1.logger.info('🌐 Starting HTTP server...');
        const server = app.listen(PORT, () => {
            logger_1.logger.info(`🟢 WhatsApp service running on port ${PORT}`);
            logger_1.logger.info(`📱 Ready to handle WhatsApp sessions`);
            logger_1.logger.info(`🔗 API endpoints available at http://localhost:${PORT}/api`);
            logger_1.logger.info('✨ Service startup completed successfully');
        });
        server.on('error', (error) => {
            logger_1.logger.error('Server error:', error);
            if (error.code === 'EADDRINUSE') {
                logger_1.logger.error(`Port ${PORT} is already in use. Please choose a different port.`);
            }
            process.exit(1);
        });
    }
    catch (error) {
        logger_1.logger.error('❌ Failed to start WhatsApp service:', error);
        logger_1.logger.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        process.exit(1);
    }
}
logger_1.logger.info('🏁 Starting bootstrap process...');
bootstrap().catch((error) => {
    logger_1.logger.error('❌ Bootstrap failed with unhandled error:', error);
    process.exit(1);
});
exports.default = app;
