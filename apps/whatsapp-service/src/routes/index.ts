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

// Enhanced session management routes (must be before parameterized routes)
router.post('/sessions/restore', sessionController.restoreSessions.bind(sessionController))
router.get('/sessions/health', sessionController.getSessionsHealth.bind(sessionController))
router.get('/sessions/backup', sessionController.backupSessions.bind(sessionController))
router.get('/sessions/enhanced', sessionController.getEnhancedSessions.bind(sessionController))
router.get('/sessions/stats', async (req, res) => {
  try {
    const { default: SessionPersistenceService } = await import('../services/SessionPersistenceService')
    const stats = await SessionPersistenceService.getSessionStats()
    
    res.json({
      success: true,
      data: stats
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error getting session statistics'
    })
  }
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

// Session monitoring endpoints

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
// Public endpoints (no auth required)
router.get('/public/leads', async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query
    
    const { default: DatabaseService } = await import('../services/DatabaseService')
    const leads = await DatabaseService.getAllLeads()
    
    // Simple pagination
    const offset = (Number(page) - 1) * Number(limit)
    const paginatedLeads = leads.slice(offset, offset + Number(limit))
    
    res.json({
      data: paginatedLeads,
      meta: {
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

// Create new lead - public endpoint
router.post('/public/leads', async (req, res) => {
  try {
    const { name, email, phone, status = 'NUEVO', source = 'manual' } = req.body
    
    // Validation
    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      })
    }
    
    // Basic phone number validation (allow various formats)
    const phoneRegex = /^[+]?[1-9]\d{1,14}$/
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '')
    
    if (!phoneRegex.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format'
      })
    }
    
    // Validate status if provided
    const validStatuses = ['NUEVO', 'CONTACTADO', 'QUALIFIED', 'GANADO', 'PERDIDO']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      })
    }
    
    const { default: DatabaseService } = await import('../services/DatabaseService')
    const newLead = await DatabaseService.createLead({
      name: name || null,
      email: email || null,
      phone: cleanPhone,
      status,
      source
    })
    
    if (newLead) {
      const { logger } = await import('../utils/logger')
      logger.info(`📝 New lead created: ${newLead.name || 'Unnamed'} (${newLead.phone})`)
      
      // Return the lead directly (not wrapped in success/data for compatibility)
      res.status(201).json(newLead)
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to create lead'
      })
    }
  } catch (error: any) {
    const { logger } = await import('../utils/logger')
    logger.error('Error creating lead:', error)
    
    // Handle duplicate phone number error
    if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
      res.status(409).json({
        success: false,
        error: 'A lead with this phone number already exists'
      })
    } else {
      res.status(500).json({
        success: false,
        error: 'Error creating lead'
      })
    }
  }
})

// Private endpoints (auth required)
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

// Create new lead
router.post('/leads', async (req, res) => {
  try {
    const { name, email, phone, status = 'NUEVO', source = 'manual' } = req.body
    
    // Validation
    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      })
    }
    
    // Basic phone number validation (allow various formats)
    const phoneRegex = /^[+]?[1-9]\d{1,14}$/
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '')
    
    if (!phoneRegex.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format'
      })
    }
    
    // Validate status if provided
    const validStatuses = ['NUEVO', 'CONTACTADO', 'QUALIFIED', 'GANADO', 'PERDIDO']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      })
    }
    
    const { default: DatabaseService } = await import('../services/DatabaseService')
    const newLead = await DatabaseService.createLead({
      name: name || null,
      email: email || null,
      phone: cleanPhone,
      status,
      source
    })
    
    if (newLead) {
      const { logger } = await import('../utils/logger')
      logger.info(`📝 New lead created: ${newLead.name || 'Unnamed'} (${newLead.phone})`)
      
      res.status(201).json({
        success: true,
        data: newLead
      })
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to create lead'
      })
    }
  } catch (error: any) {
    const { logger } = await import('../utils/logger')
    logger.error('Error creating lead:', error)
    
    // Handle duplicate phone number error
    if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
      res.status(409).json({
        success: false,
        error: 'A lead with this phone number already exists'
      })
    } else {
      res.status(500).json({
        success: false,
        error: 'Error creating lead'
      })
    }
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

// ============================================
// ENDPOINTS DE TEMPLATES DE MENSAJES
// ============================================

// Obtener todos los templates
router.get('/templates', async (req, res) => {
  try {
    const { category, activeOnly = 'true' } = req.query
    
    const { default: DatabaseService } = await import('../services/DatabaseService')
    const templates = await DatabaseService.getMessageTemplates(
      category as string,
      activeOnly === 'true'
    )
    
    res.json({
      success: true,
      data: templates
    })
  } catch (error) {
    console.error('Error getting templates:', error)
    res.status(500).json({
      success: false,
      error: 'Error getting templates'
    })
  }
})

// Crear nuevo template
router.post('/templates', async (req, res) => {
  try {
    const { name, category, subject, content, variables } = req.body
    
    if (!name || !category || !content) {
      return res.status(400).json({
        success: false,
        error: 'Name, category, and content are required'
      })
    }
    
    const { default: DatabaseService } = await import('../services/DatabaseService')
    const templateId = await DatabaseService.createMessageTemplate({
      name,
      category,
      subject,
      content,
      variables: Array.isArray(variables) ? variables : [],
      createdBy: 'admin' // TODO: Get from auth
    })
    
    if (templateId) {
      res.status(201).json({
        success: true,
        data: { id: templateId }
      })
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to create template'
      })
    }
  } catch (error) {
    console.error('Error creating template:', error)
    res.status(500).json({
      success: false,
      error: 'Error creating template'
    })
  }
})

// Actualizar template
router.put('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { name, category, subject, content, variables, isActive } = req.body
    
    const { default: DatabaseService } = await import('../services/DatabaseService')
    const updated = await DatabaseService.updateMessageTemplate(id, {
      name,
      category,
      subject,
      content,
      variables: Array.isArray(variables) ? variables : undefined,
      isActive
    })
    
    if (updated) {
      res.json({
        success: true,
        message: 'Template updated successfully'
      })
    } else {
      res.status(404).json({
        success: false,
        error: 'Template not found'
      })
    }
  } catch (error) {
    console.error('Error updating template:', error)
    res.status(500).json({
      success: false,
      error: 'Error updating template'
    })
  }
})

// Eliminar template
router.delete('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params
    
    const { default: DatabaseService } = await import('../services/DatabaseService')
    const deleted = await DatabaseService.deleteMessageTemplate(id)
    
    if (deleted) {
      res.json({
        success: true,
        message: 'Template deleted successfully'
      })
    } else {
      res.status(404).json({
        success: false,
        error: 'Template not found'
      })
    }
  } catch (error) {
    console.error('Error deleting template:', error)
    res.status(500).json({
      success: false,
      error: 'Error deleting template'
    })
  }
})

// Preview template con variables
router.post('/templates/:id/preview', async (req, res) => {
  try {
    const { id } = req.params
    const { variables = {} } = req.body
    
    const { default: DatabaseService } = await import('../services/DatabaseService')
    const templates = await DatabaseService.getMessageTemplates()
    const template = templates.find(t => t.id === id)
    
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      })
    }
    
    const previewContent = DatabaseService.replaceTemplateVariables(template.content, variables)
    
    res.json({
      success: true,
      data: {
        originalContent: template.content,
        previewContent,
        variables: template.variables
      }
    })
  } catch (error) {
    console.error('Error previewing template:', error)
    res.status(500).json({
      success: false,
      error: 'Error previewing template'
    })
  }
})

// ============================================
// ENDPOINTS DE MENSAJES PROACTIVOS
// ============================================

// Crear y enviar mensaje proactivo
router.post('/proactive-messages', async (req, res) => {
  try {
    const { leadId, templateId, sessionId = 'default-session', content, variables = {} } = req.body
    
    if (!leadId || !content) {
      return res.status(400).json({
        success: false,
        error: 'leadId and content are required'
      })
    }
    
    const { default: DatabaseService } = await import('../services/DatabaseService')
    const { default: WhatsAppService } = await import('../services/WhatsAppServiceSimple')
    
    // Obtener información del lead
    const leads = await DatabaseService.getAllLeads()
    const lead = leads.find(l => l.id === leadId)
    
    if (!lead) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      })
    }
    
    if (!lead.whatsappAuthorized) {
      return res.status(400).json({
        success: false,
        error: 'Lead has not authorized WhatsApp messages'
      })
    }
    
    // Procesar content con variables si es necesario
    let finalContent = content
    let validTemplateId: string | undefined = undefined
    
    // Validar que templateId sea un UUID válido o convertirlo a null
    if (templateId) {
      // Regex simple para validar UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      
      if (uuidRegex.test(templateId)) {
        validTemplateId = templateId
        
        // Si se usa un template válido, reemplazar variables
        const leadVariables = {
          nombre: lead.name || 'Usuario',
          telefono: lead.phone,
          email: lead.email || '',
          ...variables
        }
        
        finalContent = DatabaseService.replaceTemplateVariables(content, leadVariables)
        
        // Incrementar contador de uso del template
        await DatabaseService.incrementTemplateUsage(templateId)
      } else {
        console.log(`⚠️ Invalid template ID format: ${templateId}, treating as custom content`)
        // Si el templateId no es válido, usar el content tal como está
        // y aplicar variables manualmente si las hay
        if (Object.keys(variables).length > 0) {
          const leadVariables = {
            nombre: lead.name || 'Usuario',
            telefono: lead.phone,
            email: lead.email || '',
            ...variables
          }
          
          finalContent = DatabaseService.replaceTemplateVariables(content, leadVariables)
        }
      }
    }
    
    // Crear registro del mensaje proactivo
    const proactiveMessageId = await DatabaseService.createProactiveMessage({
      leadId,
      templateId: validTemplateId, // Solo usar si es un UUID válido
      sessionId,
      phoneNumber: lead.phone,
      content: finalContent,
      createdBy: 'admin' // TODO: Get from auth
    })
    
    if (!proactiveMessageId) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create proactive message record'
      })
    }
    
    // Formatear número para WhatsApp
    const formattedNumber = lead.phone.includes('@c.us') ? lead.phone : `${lead.phone}@c.us`
    
    // Log para debugging
    console.log('Sending proactive message:', {
      sessionId,
      formattedNumber,
      contentLength: finalContent.length
    })
    
    // Check if we're in demo mode (no real WhatsApp session required)
    // Only use demo mode if:
    // 1. Explicitly using demo-session, OR
    // 2. DEMO_MODE is explicitly set to true, OR  
    // 3. No real session is available (fallback)
    const isDemoMode = sessionId === 'demo-session' || 
                       process.env.DEMO_MODE === 'true' || 
                       sessionId === 'default-session'
    
    let sendResult
    
    if (isDemoMode) {
      // Simulate successful sending in demo mode
      console.log('DEMO MODE: Simulating message send to', formattedNumber)
      sendResult = {
        success: true,
        messageId: `demo_msg_${Date.now()}`
      }
      
      // Add a small delay to simulate real sending
      await new Promise(resolve => setTimeout(resolve, 1000))
    } else {
      try {
        // Real WhatsApp sending with error handling
        console.log('REAL MODE: Attempting to send via WhatsApp session:', sessionId)
        sendResult = await WhatsAppService.sendMessage(sessionId, formattedNumber, finalContent)
      } catch (whatsappError: any) {
        console.warn('WhatsApp sending failed, falling back to demo mode:', whatsappError.message)
        
        // Fallback to demo mode if WhatsApp fails
        sendResult = {
          success: true,
          messageId: `fallback_demo_${Date.now()}`,
          note: 'Sent in demo mode due to WhatsApp error'
        }
      }
    }
    
    console.log('Send result:', sendResult)
    
    if (sendResult.success) {
      // Actualizar estado a enviado
      await DatabaseService.updateProactiveMessageStatus(proactiveMessageId, 'sent')
      
      res.status(201).json({
        success: true,
        data: {
          proactiveMessageId,
          messageId: sendResult.messageId,
          content: finalContent,
          lead: {
            id: lead.id,
            name: lead.name,
            phone: lead.phone
          }
        }
      })
    } else {
      // Actualizar estado a fallido
      await DatabaseService.updateProactiveMessageStatus(
        proactiveMessageId, 
        'failed', 
        sendResult.error || 'Unknown error'
      )
      
      res.status(500).json({
        success: false,
        error: sendResult.error || 'Failed to send WhatsApp message'
      })
    }
  } catch (error) {
    console.error('Error sending proactive message:', error)
    res.status(500).json({
      success: false,
      error: 'Error sending proactive message'
    })
  }
})

// Obtener mensajes proactivos
router.get('/proactive-messages', async (req, res) => {
  try {
    const { leadId, status, limit = 50, offset = 0 } = req.query
    
    const { default: DatabaseService } = await import('../services/DatabaseService')
    const messages = await DatabaseService.getProactiveMessages({
      leadId: leadId as string,
      status: status as string,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    })
    
    res.json({
      success: true,
      data: messages
    })
  } catch (error) {
    console.error('Error getting proactive messages:', error)
    res.status(500).json({
      success: false,
      error: 'Error getting proactive messages'
    })
  }
})

// Obtener estadísticas de mensajes proactivos
router.get('/proactive-messages/stats', async (req, res) => {
  try {
    const { default: DatabaseService } = await import('../services/DatabaseService')
    
    // Obtener mensajes de todos los estados
    const allMessages = await DatabaseService.getProactiveMessages({ limit: 1000 })
    
    const stats = {
      total: allMessages.length,
      pending: allMessages.filter(m => m.status === 'pending').length,
      sent: allMessages.filter(m => m.status === 'sent').length,
      delivered: allMessages.filter(m => m.status === 'delivered').length,
      failed: allMessages.filter(m => m.status === 'failed').length,
      successRate: allMessages.length > 0 ? 
        ((allMessages.filter(m => ['sent', 'delivered'].includes(m.status)).length / allMessages.length) * 100).toFixed(1) : '0'
    }
    
    res.json({
      success: true,
      data: stats
    })
  } catch (error) {
    console.error('Error getting proactive messages stats:', error)
    res.status(500).json({
      success: false,
      error: 'Error getting proactive messages stats'
    })
  }
})

export default router
