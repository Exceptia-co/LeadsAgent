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
// Direct message sending (without session in URL)
router.post('/messages/send', validateSendMessage, sessionController.sendDirectMessage.bind(sessionController))

// Analytics routes (for dashboard integration)
router.get('/analytics/messages', sessionController.getAnalytics.bind(sessionController))
router.get('/sessions/:sessionId/status', validateSessionId, sessionController.getSessionStatus.bind(sessionController))

// AI Management endpoints
router.get('/ai/status', async (req, res) => {
  try {
    const { default: AIService } = await import('../services/AIService')
    const status = AIService.getStatus()
    const currentProvider = AIService.getCurrentProvider()
    
    res.json({
      success: true,
      data: {
        ...status,
        currentProvider
      }
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error getting AI status'
    })
  }
})

router.post('/ai/switch', async (req, res) => {
  try {
    const { provider } = req.body
    
    if (!provider || !['openrouter', 'gemini'].includes(provider)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid provider. Use "openrouter" or "gemini"'
      })
    }
    
    const { default: AIService } = await import('../services/AIService')
    const switched = AIService.switchProvider(provider)
    
    if (switched) {
      res.json({
        success: true,
        message: `Switched to ${provider}`,
        currentProvider: AIService.getCurrentProvider()
      })
    } else {
      res.status(400).json({
        success: false,
        error: `Failed to switch to ${provider}. Check configuration.`
      })
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error switching AI provider'
    })
  }
})

router.post('/ai/test', async (req, res) => {
  try {
    const { message } = req.body
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      })
    }
    
    const { default: AIService } = await import('../services/AIService')
    const response = await AIService.generateResponse(message)
    
    res.json({
      success: true,
      data: response
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error testing AI response'
    })
  }
})

// Leads endpoint for dashboard
router.get('/leads', async (req, res) => {
  try {
    const { limit = 50 } = req.query
    
    // Simple in-memory leads for testing
    const mockLeads = [
      {
        id: '1',
        name: 'Dianita',
        phone: '+34658333517',
        status: 'NUEVO',
        email: 'dianita@test.com',
        createdAt: new Date().toISOString()
      },
      {
        id: '2',
        name: 'Test Lead',
        phone: '+34123456789',
        status: 'CONTACTADO',
        email: 'test@example.com',
        createdAt: new Date(Date.now() - 24*60*60*1000).toISOString()
      }
    ]
    
    res.json({
      success: true,
      leads: mockLeads.slice(0, Number(limit))
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error getting leads'
    })
  }
})

// Database and statistics endpoints
router.get('/conversations/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params
    const { limit = 50 } = req.query
    
    const { default: DatabaseService } = await import('../services/DatabaseService')
    const history = await DatabaseService.getConversationHistory(phoneNumber, Number(limit))
    
    res.json({
      success: true,
      data: history
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error getting conversation history'
    })
  }
})

router.get('/stats', async (req, res) => {
  try {
    const { sessionId } = req.query
    
    const { default: DatabaseService } = await import('../services/DatabaseService')
    const stats = await DatabaseService.getStats(sessionId as string)
    
    res.json({
      success: true,
      data: stats
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error getting statistics'
    })
  }
})

export default router
