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

// Leads management endpoints
router.get('/leads', async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query
    
    const { default: DatabaseService } = await import('../services/DatabaseService')
    const leads = await DatabaseService.getAllLeads()
    
    // Simple pagination
    const offset = (Number(page) - 1) * Number(limit)
    const paginatedLeads = leads.slice(offset, offset + Number(limit))
    
    res.json({
      success: true,
      leads: paginatedLeads,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: leads.length,
        totalPages: Math.ceil(leads.length / Number(limit)),
        hasPrev: Number(page) > 1,
        hasNext: Number(page) < Math.ceil(leads.length / Number(limit))
      }
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error getting leads'
    })
  }
})

// Toggle WhatsApp authorization for a lead
router.patch('/leads/:leadId/whatsapp', async (req, res) => {
  try {
    const { leadId } = req.params
    const { whatsappAuthorized } = req.body
    
    if (typeof whatsappAuthorized !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'whatsappAuthorized must be a boolean'
      })
    }
    
    const { default: DatabaseService } = await import('../services/DatabaseService')
    const updated = await DatabaseService.updateLeadWhatsAppAuth(leadId, whatsappAuthorized)
    
    if (updated) {
      // Log the authorization change
      const { logger } = await import('../utils/logger')
      logger.info(`📱 Lead ${leadId} WhatsApp authorization ${whatsappAuthorized ? 'enabled' : 'disabled'}`)
      
      res.json({
        success: true,
        message: `WhatsApp authorization ${whatsappAuthorized ? 'enabled' : 'disabled'} for lead`,
        data: { leadId, whatsappAuthorized }
      })
    } else {
      res.status(404).json({
        success: false,
        error: 'Lead not found'
      })
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error updating lead WhatsApp authorization'
    })
  }
})

// ============================================
// ENDPOINTS DE CONVERSACIONES (NUEVOS)
// ============================================

// Obtener todas las conversaciones con paginación
router.get('/conversations', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query
    
    const { default: DatabaseService } = await import('../services/DatabaseService')
    const conversations = await DatabaseService.getConversations(Number(limit), Number(offset))
    
    res.json(conversations) // Retornar directamente el array para compatibilidad
  } catch (error) {
    console.error('Error getting conversations:', error)
    res.status(500).json({
      success: false,
      error: 'Error getting conversations'
    })
  }
})

// Obtener mensajes de una conversación específica
router.get('/conversations/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params
    const { limit = 50, offset = 0 } = req.query
    
    const { default: DatabaseService } = await import('../services/DatabaseService')
    const result = await DatabaseService.getConversationMessages(
      conversationId, 
      Number(limit), 
      Number(offset)
    )
    
    if (!result.conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      })
    }
    
    res.json(result)
  } catch (error) {
    console.error('Error getting conversation messages:', error)
    res.status(500).json({
      success: false,
      error: 'Error getting conversation messages'
    })
  }
})

// Enviar mensaje en una conversación específica
router.post('/conversations/:conversationId/send', async (req, res) => {
  try {
    const { conversationId } = req.params
    const { sessionId, message, type = 'text' } = req.body
    
    if (!sessionId || !message) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and message are required'
      })
    }

    // Extraer número de teléfono del ID de conversación
    const phoneNumber = conversationId.replace('conv_', '')
    
    // Importar el servicio de WhatsApp
    const { default: WhatsAppService } = await import('../services/WhatsAppServiceSimple')
    
    // Formatear número para WhatsApp
    const formattedNumber = phoneNumber.includes('@c.us') ? phoneNumber : `${phoneNumber}@c.us`
    
    // Enviar mensaje
    const result = await WhatsAppService.sendMessage(sessionId, formattedNumber, message)
    
    if (result.success) {
      res.json({
        success: true,
        messageId: result.messageId
      })
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to send message'
      })
    }
  } catch (error) {
    console.error('Error sending message in conversation:', error)
    res.status(500).json({
      success: false,
      error: 'Error sending message'
    })
  }
})

// Conversations management endpoints (ORIGINALES - mantener para compatibilidad)
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

// Search conversations with filters
router.post('/conversations', async (req, res) => {
  try {
    const { searchTerm, sessionId, limit = 50 } = req.body
    
    const { default: DatabaseService } = await import('../services/DatabaseService')
    let conversations
    
    if (searchTerm) {
      conversations = await DatabaseService.searchConversations(searchTerm, sessionId, Number(limit))
    } else {
      // Get recent conversations if no search term
      conversations = await DatabaseService.getRecentConversations(sessionId, Number(limit))
    }
    
    res.json({
      success: true,
      conversations: conversations
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error searching conversations'
    })
  }
})

// Statistics endpoints
router.get('/stats', async (req, res) => {
  try {
    const { sessionId } = req.query
    
    const { default: DatabaseService } = await import('../services/DatabaseService')
    const stats = await DatabaseService.getStats(sessionId as string)
    
    res.json({
      success: true,
      ...stats // Return stats directly instead of wrapping in data
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error getting statistics'
    })
  }
})

// WhatsApp authorization statistics
router.get('/stats/whatsapp-auth', async (req, res) => {
  try {
    const { default: DatabaseService } = await import('../services/DatabaseService')
    const leads = await DatabaseService.getAllLeads()
    
    const authorizedCount = leads.filter(lead => lead.whatsappAuthorized).length
    const unauthorizedCount = leads.length - authorizedCount
    
    res.json({
      success: true,
      data: {
        totalLeads: leads.length,
        authorizedLeads: authorizedCount,
        unauthorizedLeads: unauthorizedCount,
        authorizationRate: leads.length > 0 ? (authorizedCount / leads.length * 100).toFixed(1) : '0'
      }
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error getting WhatsApp authorization statistics'
    })
  }
})

// Whitelist logs and statistics
router.get('/logs/whitelist', async (req, res) => {
  try {
    const { 
      limit = 50, 
      offset = 0, 
      phoneNumber, 
      sessionId, 
      decision, 
      startDate, 
      endDate 
    } = req.query
    
    const { default: DatabaseService } = await import('../services/DatabaseService')
    const logs = await DatabaseService.getWhitelistLogs({
      limit: Number(limit),
      offset: Number(offset),
      phoneNumber: phoneNumber as string,
      sessionId: sessionId as string,
      decision: decision as 'ALLOWED' | 'BLOCKED',
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined
    })
    
    res.json({
      success: true,
      data: logs
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error getting whitelist logs'
    })
  }
})

router.get('/stats/whitelist', async (req, res) => {
  try {
    const { sessionId, startDate, endDate } = req.query
    
    const { default: DatabaseService } = await import('../services/DatabaseService')
    const stats = await DatabaseService.getWhitelistStats({
      sessionId: sessionId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined
    })
    
    res.json({
      success: true,
      ...stats
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error getting whitelist statistics'
    })
  }
})

export default router
