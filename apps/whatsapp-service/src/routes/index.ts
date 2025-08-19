import { Router } from 'express'
import sessionController from '../controllers/SessionController'
import { 
  validateCreateSession, 
  validateSendMessage, 
  validateSessionId, 
  rateLimit 
} from '../middleware/validation'

const router = Router()

// Apply rate limiting to all routes
router.use(rateLimit)

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'whatsapp-service',
    uptime: process.uptime(),
    memory: process.memoryUsage()
  })
})

// Session routes
router.post('/sessions', validateCreateSession, sessionController.createSession.bind(sessionController))
router.get('/sessions', sessionController.getAllSessions.bind(sessionController))
router.get('/sessions/:sessionId', validateSessionId, sessionController.getSession.bind(sessionController))
router.delete('/sessions/:sessionId', validateSessionId, sessionController.deleteSession.bind(sessionController))

// QR code route
router.get('/sessions/:sessionId/qr', validateSessionId, sessionController.getQRCode.bind(sessionController))

// Message routes
router.post('/sessions/:sessionId/send', validateSendMessage, sessionController.sendMessage.bind(sessionController))

export default router
