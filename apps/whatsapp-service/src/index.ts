import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import WhatsAppService from './services/WhatsAppService'
import routes from './routes'
import { logRequest, rateLimit } from './middleware/validation'
import logger from './utils/logger'

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
app.use(rateLimit(60000, 100)) // 100 requests per minute

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
  await WhatsAppService.shutdown()
  process.exit(0)
})

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...')
  await WhatsAppService.shutdown()
  process.exit(0)
})

// Start server
async function bootstrap() {
  try {
    // Initialize WhatsApp service
    await WhatsAppService.initialize()
    
    app.listen(PORT, () => {
      logger.info(`🟢 WhatsApp service running on port ${PORT}`)
      logger.info(`📱 Ready to handle WhatsApp sessions`)
      logger.info(`🔗 API endpoints available at http://localhost:${PORT}/api`)
    })
  } catch (error) {
    logger.error('Failed to start WhatsApp service:', error)
    process.exit(1)
  }
}

bootstrap()

export default app
