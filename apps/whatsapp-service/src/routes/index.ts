import { Router } from 'express';
import sessionController from '../controllers/SessionController';
import healthRoutes from './health';
import redisRoutes from './redis';
import {
  validateCreateSession,
  validateSendMessage,
  validateSessionId,
  validateWhatsAppSendMessage,
  rateLimit,
  rateLimitBySession,
  type SessionThrottleContext,
} from '../middleware/validation';

const router: Router = Router();

// Apply rate limiting to all routes
router.use(rateLimit);

// Basic health check (legacy)
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'whatsapp-service',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// Advanced health check routes
router.use('/health', healthRoutes);

// Redis management and monitoring routes
router.use('/redis', redisRoutes);

// Enhanced session management routes (must be before parameterized routes)
router.post('/sessions/restore', sessionController.restoreSessions.bind(sessionController));
router.get('/sessions/health', sessionController.getSessionsHealth.bind(sessionController));
router.get('/sessions/backup', sessionController.backupSessions.bind(sessionController));
router.get('/sessions/enhanced', sessionController.getEnhancedSessions.bind(sessionController));
router.get('/sessions/stats', async (req, res) => {
  try {
    const { default: SessionPersistenceService } =
      await import('../services/SessionPersistenceService');
    const stats = await SessionPersistenceService.getSessionStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error getting session statistics',
    });
  }
});
router.get('/sessions/socket-stats', sessionController.getSocketStats.bind(sessionController));

// Session routes
router.post(
  '/sessions',
  validateCreateSession,
  sessionController.createSession.bind(sessionController)
);
router.get('/sessions', sessionController.getAllSessions.bind(sessionController));
router.get(
  '/sessions/:sessionId',
  validateSessionId,
  sessionController.getSession.bind(sessionController)
);
router.delete(
  '/sessions/:sessionId',
  validateSessionId,
  sessionController.deleteSession.bind(sessionController)
);

// 💪 Force disconnect session endpoint
router.post(
  '/sessions/:sessionId/force-disconnect',
  validateSessionId,
  sessionController.forceDisconnectSession.bind(sessionController)
);

// QR code route (with Redis fast-read fallback)
router.get(
  '/sessions/:sessionId/qr',
  validateSessionId,
  async (req, res, next) => {
    try {
      // Try Redis first for fast access
      const { redisClient, REDIS_KEYS } = await import('../config/redis');
      const qr = await redisClient.get(`${REDIS_KEYS.SESSION_QR}${req.params.sessionId}`);
      if (qr) {
        return res.json({ success: true, qrCode: qr, source: 'redis' });
      }
    } catch {
      /* fall through to controller */
    }
    next();
  },
  sessionController.getQRCode.bind(sessionController)
);

// ── Session Backup / Restore / Health endpoints ──────────────────

// Force backup a session
router.post('/sessions/:sessionId/backup', validateSessionId, async (req, res) => {
  try {
    const { default: WhatsAppService } = await import('../services/WhatsAppServiceSimple');
    const result = await WhatsAppService.forceBackup(req.params.sessionId);
    if (result.success) {
      res.json({ success: true, data: { sizeBytes: result.sizeBytes } });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error creating backup' });
  }
});

// Restore backup for a session
router.post('/sessions/:sessionId/restore-backup', validateSessionId, async (req, res) => {
  try {
    const { default: WhatsAppService } = await import('../services/WhatsAppServiceSimple');
    const result = await WhatsAppService.restoreBackup(req.params.sessionId);
    if (result.success) {
      res.json({ success: true, message: 'Backup restored successfully' });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error restoring backup' });
  }
});

// Get backup status for a session
router.get('/sessions/:sessionId/backup-status', validateSessionId, async (req, res) => {
  try {
    const { default: WhatsAppService } = await import('../services/WhatsAppServiceSimple');
    const status = await WhatsAppService.getBackupStatus(req.params.sessionId);
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error getting backup status' });
  }
});

// Get session health
router.get('/sessions/:sessionId/health', validateSessionId, async (req, res) => {
  try {
    const { default: WhatsAppService } = await import('../services/WhatsAppServiceSimple');
    const health = await WhatsAppService.getSessionHealth(req.params.sessionId);
    res.json({ success: true, data: health });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error getting session health' });
  }
});

// Message routes
router.post(
  '/sessions/:sessionId/send',
  validateSendMessage,
  sessionController.sendMessage.bind(sessionController)
);
// Direct message sending (without session in URL)
router.post(
  '/messages/send',
  validateSendMessage,
  sessionController.sendDirectMessage.bind(sessionController)
);

// WhatsApp direct send endpoint (for compatibility with frontend)
router.post(
  '/whatsapp/send',
  validateWhatsAppSendMessage,
  sessionController.sendDirectMessage.bind(sessionController)
);

// Analytics routes (for dashboard integration)
router.get('/analytics/messages', sessionController.getAnalytics.bind(sessionController));
router.get(
  '/sessions/:sessionId/status',
  validateSessionId,
  sessionController.getSessionStatus.bind(sessionController)
);

// Session monitoring endpoints

// AI Management endpoints
router.get('/ai/status', async (req, res) => {
  try {
    const { default: AIService } = await import('../services/AIService');
    const status = AIService.getStatus();
    const currentProvider = AIService.getCurrentProvider();

    res.json({
      success: true,
      data: {
        ...status,
        currentProvider,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error getting AI status',
    });
  }
});

router.post('/ai/switch', async (req, res) => {
  try {
    const { provider } = req.body;

    if (!provider || !['openrouter', 'gemini'].includes(provider)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid provider. Use "openrouter" or "gemini"',
      });
    }

    const { default: AIService } = await import('../services/AIService');
    const switched = AIService.switchProvider(provider);

    if (switched) {
      res.json({
        success: true,
        message: `Switched to ${provider}`,
        currentProvider: AIService.getCurrentProvider(),
      });
    } else {
      res.status(400).json({
        success: false,
        error: `Failed to switch to ${provider}. Check configuration.`,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error switching AI provider',
    });
  }
});

router.post('/ai/test', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required',
      });
    }

    const { default: AIService } = await import('../services/AIService');
    const response = await AIService.generateResponse(message);

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error testing AI response',
    });
  }
});

// Lead CRUD lives in the NestJS API (apps/api/src/leads) and is consumed via
// Clerk-authenticated endpoints. The whatsapp-service must not expose lead
// endpoints directly — see PRD T0.7.

// ============================================
// ENDPOINTS DE CONVERSACIONES (NUEVOS)
// ============================================

// Obtener todas las conversaciones con paginación
router.get('/conversations', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const { default: DatabaseService } = await import('../services/DatabaseService');
    const conversations = await DatabaseService.getConversations(Number(limit), Number(offset));

    res.json(conversations); // Retornar directamente el array para compatibilidad
  } catch (error) {
    console.error('Error getting conversations:', error);
    res.status(500).json({
      success: false,
      error: 'Error getting conversations',
    });
  }
});

// Obtener mensajes de una conversación específica
router.get('/conversations/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const { default: DatabaseService } = await import('../services/DatabaseService');
    const result = await DatabaseService.getConversationMessages(
      conversationId,
      Number(limit),
      Number(offset)
    );

    if (!result.conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found',
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Error getting conversation messages:', error);
    res.status(500).json({
      success: false,
      error: 'Error getting conversation messages',
    });
  }
});

// Enviar mensaje en una conversación específica
router.post('/conversations/:conversationId/send', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { sessionId, message, type = 'text' } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and message are required',
      });
    }

    // Extraer número de teléfono del ID de conversación
    const phoneNumber = conversationId.replace('conv_', '');

    // Importar el servicio de WhatsApp
    const { default: WhatsAppService } = await import('../services/WhatsAppServiceSimple');

    // Formatear número para WhatsApp
    const formattedNumber = phoneNumber.includes('@c.us') ? phoneNumber : `${phoneNumber}@c.us`;

    // Enviar mensaje
    const result = await WhatsAppService.sendMessage(sessionId, formattedNumber, message);

    if (result.success) {
      res.json({
        success: true,
        messageId: result.messageId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to send message',
      });
    }
  } catch (error) {
    console.error('Error sending message in conversation:', error);
    res.status(500).json({
      success: false,
      error: 'Error sending message',
    });
  }
});

// Conversations management endpoints (ORIGINALES - mantener para compatibilidad)
router.get('/conversations/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { limit = 50 } = req.query;

    const { default: DatabaseService } = await import('../services/DatabaseService');
    const history = await DatabaseService.getConversationHistory(phoneNumber, Number(limit));

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error getting conversation history',
    });
  }
});

// Search conversations with filters
router.post('/conversations', async (req, res) => {
  try {
    const { searchTerm, sessionId, limit = 50 } = req.body;

    const { default: DatabaseService } = await import('../services/DatabaseService');
    let conversations;

    if (searchTerm) {
      conversations = await DatabaseService.searchConversations(
        searchTerm,
        sessionId,
        Number(limit)
      );
    } else {
      // Get recent conversations if no search term
      conversations = await DatabaseService.getRecentConversations(sessionId, Number(limit));
    }

    res.json({
      success: true,
      conversations: conversations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error searching conversations',
    });
  }
});

// Statistics endpoints
router.get('/stats', async (req, res) => {
  try {
    const { sessionId } = req.query;

    const { default: DatabaseService } = await import('../services/DatabaseService');
    const stats = await DatabaseService.getStats(sessionId as string);

    res.json({
      success: true,
      ...stats, // Return stats directly instead of wrapping in data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error getting statistics',
    });
  }
});

// WhatsApp authorization statistics
router.get('/stats/whatsapp-auth', async (req, res) => {
  try {
    const { default: DatabaseService } = await import('../services/DatabaseService');
    const leads = await DatabaseService.getAllLeads();

    const authorizedCount = leads.filter(lead => lead.whatsappAuthorized).length;
    const unauthorizedCount = leads.length - authorizedCount;

    res.json({
      success: true,
      data: {
        totalLeads: leads.length,
        authorizedLeads: authorizedCount,
        unauthorizedLeads: unauthorizedCount,
        authorizationRate:
          leads.length > 0 ? ((authorizedCount / leads.length) * 100).toFixed(1) : '0',
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error getting WhatsApp authorization statistics',
    });
  }
});

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
      endDate,
    } = req.query;

    const { default: DatabaseService } = await import('../services/DatabaseService');
    const logs = await DatabaseService.getWhitelistLogs({
      limit: Number(limit),
      offset: Number(offset),
      phoneNumber: phoneNumber as string,
      sessionId: sessionId as string,
      decision: decision as 'ALLOWED' | 'BLOCKED',
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error getting whitelist logs',
    });
  }
});

router.get('/stats/whitelist', async (req, res) => {
  try {
    const { sessionId, startDate, endDate } = req.query;

    const { default: DatabaseService } = await import('../services/DatabaseService');
    const stats = await DatabaseService.getWhitelistStats({
      sessionId: sessionId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json({
      success: true,
      ...stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error getting whitelist statistics',
    });
  }
});

// ============================================
// ENDPOINTS DE TEMPLATES DE MENSAJES
// ============================================
//
// CRUD y preview se consolidaron en la API Nest (/templates) con Clerk JWT
// tras T2.2 (PRD v5.11). Este archivo sólo conserva los helpers AI y el
// lookup de variables disponibles, que siguen dependiendo de servicios locales
// (DatabaseService, AIThinkingService). Ver apps/api/src/templates/* para CRUD.

// ============================================
// ENDPOINTS DE MENSAJES PROACTIVOS
// ============================================

// Crear y enviar mensaje proactivo
router.post('/proactive-messages', rateLimitBySession, async (req, res) => {
  try {
    const { leadId, templateId, sessionId = 'default-session', content, variables = {} } = req.body;

    if (!leadId || !content) {
      return res.status(400).json({
        success: false,
        error: 'leadId and content are required',
      });
    }

    const { default: DatabaseService } = await import('../services/DatabaseService');
    const { default: WhatsAppService } = await import('../services/WhatsAppServiceSimple');

    // Obtener información del lead
    const leads = await DatabaseService.getAllLeads();
    const lead = leads.find(l => l.id === leadId);

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found',
      });
    }

    if (!lead.whatsappAuthorized) {
      return res.status(400).json({
        success: false,
        error: 'Lead has not authorized WhatsApp messages',
      });
    }

    // Procesar content con variables - SIEMPRE aplicar reemplazo de variables
    let finalContent = content;
    let validTemplateId: string | undefined = undefined;

    // Crear objeto base de variables que siempre incluye datos del lead
    const baseLeadVariables = {
      nombre: lead.name || 'Usuario',
      telefono: lead.phone,
      email: lead.email || '',
      estado: lead.status || '',
      origen: lead.source || '',
      ...variables, // Las variables custom sobrescriben las por defecto
    };

    // Validar que templateId sea un UUID válido
    if (templateId) {
      // Regex simple para validar UUID
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      if (uuidRegex.test(templateId)) {
        validTemplateId = templateId;
        // Incrementar contador de uso del template
        await DatabaseService.incrementTemplateUsage(templateId);
      } else {
        console.log(`⚠️ Invalid template ID format: ${templateId}, treating as custom content`);
      }
    }

    // SIEMPRE aplicar reemplazo de variables (incluye sistema + lead + dinámicas + custom)
    finalContent = DatabaseService.replaceTemplateVariables(content, baseLeadVariables);

    // Crear registro del mensaje proactivo
    const proactiveMessageId = await DatabaseService.createProactiveMessage({
      leadId,
      templateId: validTemplateId, // Solo usar si es un UUID válido
      sessionId,
      phoneNumber: lead.phone,
      content: finalContent,
      createdBy: 'admin', // TODO: Get from auth
    });

    if (!proactiveMessageId) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create proactive message record',
      });
    }

    // Formatear número para WhatsApp
    const formattedNumber = lead.phone.includes('@c.us') ? lead.phone : `${lead.phone}@c.us`;

    // Log para debugging
    console.log('Sending proactive message:', {
      sessionId,
      formattedNumber,
      contentLength: finalContent.length,
    });

    // Check if we're in demo mode (no real WhatsApp session required)
    // Only use demo mode if:
    // 1. Explicitly using demo-session, OR
    // 2. DEMO_MODE is explicitly set to true, OR
    // 3. No real session is available (fallback)
    const isDemoMode =
      sessionId === 'demo-session' ||
      process.env.DEMO_MODE === 'true' ||
      sessionId === 'default-session';

    let sendResult;

    if (isDemoMode) {
      // Simulate successful sending in demo mode
      console.log('DEMO MODE: Simulating message send to', formattedNumber);
      sendResult = {
        success: true,
        messageId: `demo_msg_${Date.now()}`,
      };

      // Add a small delay to simulate real sending
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      try {
        // Real WhatsApp sending with error handling
        console.log('REAL MODE: Attempting to send via WhatsApp session:', sessionId);
        sendResult = await WhatsAppService.sendMessage(sessionId, formattedNumber, finalContent);
      } catch (whatsappError: any) {
        console.warn('WhatsApp sending failed, falling back to demo mode:', whatsappError.message);

        // Fallback to demo mode if WhatsApp fails
        sendResult = {
          success: true,
          messageId: `fallback_demo_${Date.now()}`,
          note: 'Sent in demo mode due to WhatsApp error',
        };
      }
    }

    console.log('Send result:', sendResult);

    if (sendResult.success) {
      // Actualizar estado a enviado
      await DatabaseService.updateProactiveMessageStatus(proactiveMessageId, 'sent');

      res.status(201).json({
        success: true,
        data: {
          proactiveMessageId,
          messageId: sendResult.messageId,
          content: finalContent,
          lead: {
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
          },
        },
      });
    } else {
      // Actualizar estado a fallido
      await DatabaseService.updateProactiveMessageStatus(
        proactiveMessageId,
        'failed',
        sendResult.error || 'Unknown error'
      );

      res.status(500).json({
        success: false,
        error: sendResult.error || 'Failed to send WhatsApp message',
      });
    }
  } catch (error) {
    console.error('Error sending proactive message:', error);
    res.status(500).json({
      success: false,
      error: 'Error sending proactive message',
    });
  }
});

// Enviar mensajes proactivos masivos
router.post('/proactive-messages/bulk', rateLimitBySession, async (req, res) => {
  try {
    const { leadIds, templateId, sessionId, content, variables } = req.body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere un array de leadIds',
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required',
      });
    }

    // T2.4: throttle adaptativo según uso actual de la cuota por sesión
    const throttleCtx = (req as typeof req & { sessionThrottle?: SessionThrottleContext })
      .sessionThrottle;
    const baseDelayMs = 2000;
    const adaptiveDelayMs = baseDelayMs * (throttleCtx?.throttleFactor ?? 1);
    if (throttleCtx && throttleCtx.throttleFactor > 1) {
      console.log(
        `⚠️ Session ${throttleCtx.sessionId} at ${throttleCtx.usageAfter}/${throttleCtx.quota} → delay x${throttleCtx.throttleFactor}`
      );
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Importar servicios
    const { default: DatabaseService } = await import('../services/DatabaseService');
    const { default: WhatsAppService } = await import('../services/WhatsAppServiceSimple');

    // Procesar cada lead
    for (const leadId of leadIds) {
      try {
        console.log(`🔄 Processing lead: ${leadId}`);

        // Obtener información del lead
        const lead = await DatabaseService.findLeadById(leadId);
        if (!lead) {
          console.log(`❌ Lead not found: ${leadId}`);
          results.failed++;
          results.errors.push(`Lead ${leadId}: Lead no encontrado`);
          continue;
        }

        console.log(`📋 Lead found: ${lead.name} (${lead.phone})`);
        let messageContent = content || '';

        // Si se especifica un template, procesarlo
        if (templateId) {
          const template = await DatabaseService.getTemplate(templateId);
          if (template) {
            messageContent = template.content;
          }
        }

        // SIEMPRE reemplazar variables usando el servicio mejorado
        const leadVariables = {
          nombre: lead.name || 'Usuario',
          telefono: lead.phone,
          email: lead.email || '',
          estado: lead.status || '',
          origen: lead.source || '',
          ...variables, // Las variables custom sobrescriben las por defecto
        };

        // Usar el método de DatabaseService que incluye todas las variables (sistema + dinámicas)
        messageContent = DatabaseService.replaceTemplateVariables(messageContent, leadVariables);

        // Guardar el mensaje en la base de datos
        const proactiveMessageId = await DatabaseService.createProactiveMessage({
          leadId,
          templateId: templateId || undefined,
          sessionId,
          phoneNumber: lead.phone,
          content: messageContent,
          createdBy: 'system',
        });

        // Enviar el mensaje vía WhatsApp
        console.log(`📤 Sending message to: ${lead.phone} via session: ${sessionId}`);
        console.log(`💬 Message content: ${messageContent.substring(0, 50)}...`);

        // Add delay (adaptive based on session quota usage — see T2.4)
        if (leadIds.indexOf(leadId) > 0) {
          console.log(`⏱️ Adding ${adaptiveDelayMs}ms delay to avoid rate limiting...`);
          await new Promise(resolve => setTimeout(resolve, adaptiveDelayMs));
        }

        const sendResult = await WhatsAppService.sendMessage(sessionId, lead.phone, messageContent);

        console.log(`📧 Message sent result for ${lead.phone}:`, sendResult);

        if (sendResult.success && proactiveMessageId) {
          await DatabaseService.updateProactiveMessageStatus(proactiveMessageId, 'sent');
          results.success++;
        } else {
          if (proactiveMessageId) {
            await DatabaseService.updateProactiveMessageStatus(
              proactiveMessageId,
              'failed',
              sendResult.error || 'Error sending message via WhatsApp'
            );
          }
          results.failed++;
          results.errors.push(
            `Lead ${leadId}: ${sendResult.error || 'Error enviando vía WhatsApp'}`
          );
        }
      } catch (error) {
        console.error(`Error processing lead ${leadId}:`, error);
        results.failed++;
        results.errors.push(
          `Lead ${leadId}: ${error instanceof Error ? error.message : 'Error desconocido'}`
        );
      }
    }

    res.json({
      success: true,
      data: {
        total: leadIds.length,
        successful: results.success,
        failed: results.failed,
        errors: results.errors,
      },
    });
  } catch (error) {
    console.error('Error sending bulk proactive messages:', error);
    res.status(500).json({
      success: false,
      error: 'Error sending bulk proactive messages',
    });
  }
});

// Obtener mensajes proactivos
router.get('/proactive-messages', async (req, res) => {
  try {
    const { leadId, status, limit = 50, offset = 0 } = req.query;

    const { default: DatabaseService } = await import('../services/DatabaseService');
    const messages = await DatabaseService.getProactiveMessages({
      leadId: leadId as string,
      status: status as string,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    res.json({
      success: true,
      data: messages,
    });
  } catch (error) {
    console.error('Error getting proactive messages:', error);
    res.status(500).json({
      success: false,
      error: 'Error getting proactive messages',
    });
  }
});

// Obtener estadísticas de mensajes proactivos
router.get('/proactive-messages/stats', async (req, res) => {
  try {
    const { default: DatabaseService } = await import('../services/DatabaseService');

    // Obtener mensajes de todos los estados
    const allMessages = await DatabaseService.getProactiveMessages({
      limit: 1000,
    });

    const stats = {
      total: allMessages.length,
      pending: allMessages.filter(m => m.status === 'pending').length,
      sent: allMessages.filter(m => m.status === 'sent').length,
      delivered: allMessages.filter(m => m.status === 'delivered').length,
      failed: allMessages.filter(m => m.status === 'failed').length,
      successRate:
        allMessages.length > 0
          ? (
              (allMessages.filter(m => ['sent', 'delivered'].includes(m.status)).length /
                allMessages.length) *
              100
            ).toFixed(1)
          : '0',
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error getting proactive messages stats:', error);
    res.status(500).json({
      success: false,
      error: 'Error getting proactive messages stats',
    });
  }
});

// ============================================
// ENDPOINTS DE IA PARA TEMPLATES Y MENSAJES
// ============================================

// Obtener variables disponibles para templates
router.get('/templates/variables', async (req, res) => {
  try {
    const { default: DatabaseService } = await import('../services/DatabaseService');

    const variables = DatabaseService.getAvailableTemplateVariables();

    res.json({
      success: true,
      data: variables,
      examples: {
        lead: {
          '{{nombre}}': 'Nombre del lead (ej: Juan Pérez)',
          '{{telefono}}': 'Teléfono del lead (ej: +34 612 345 678)',
          '{{email}}': 'Email del lead (ej: juan@example.com)',
          '{{estado}}': 'Estado del lead (ej: NUEVO, QUALIFIED)',
          '{{origen}}': 'Origen del lead (ej: website, referral)',
        },
        system: {
          '{{empresa}}': 'EscortsHub',
          '{{sitio_web}}': 'www.escortshub.com',
          '{{telefono_soporte}}': '+34 900 123 456',
          '{{email_soporte}}': 'soporte@escortshub.com',
        },
        dynamic: {
          '{{saludo}}': 'Buenos días / Buenas tardes / Buenas noches',
          '{{fecha_actual}}': new Date().toLocaleDateString('es-ES'),
          '{{hora_actual}}': new Date().toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          '{{dia_semana}}': new Date().toLocaleDateString('es-ES', { weekday: 'long' }),
          '{{mes_actual}}': new Date().toLocaleDateString('es-ES', { month: 'long' }),
        },
      },
    });
  } catch (error) {
    console.error('Error getting template variables:', error);
    res.status(500).json({
      success: false,
      error: 'Error getting template variables',
    });
  }
});

// Sugerir template con IA
router.post('/templates/ai-suggest', async (req, res) => {
  try {
    const {
      category,
      objective,
      tone = 'profesional',
      length = 'medio',
      context,
      variables = [],
    } = req.body;

    if (!category || !objective) {
      return res.status(400).json({
        success: false,
        error: 'Category and objective are required',
      });
    }

    const { default: AIService } = await import('../services/AIService');

    // Crear prompt especializado para generación de templates
    const prompt = `Actúas como un experto en marketing digital y copywriting para EscortsHub, la plataforma líder de escorts en España.

Genera un template de mensaje para WhatsApp con las siguientes especificaciones:

**CONTEXTO:**
- Categoría: ${category}
- Objetivo: ${objective}
- Tono: ${tone}
- Longitud: ${length}
${context ? `- Contexto adicional: ${context}` : ''}

**VARIABLES DISPONIBLES:**
Puedes usar estas variables en el template:
- Lead: {{nombre}}, {{telefono}}, {{email}}, {{estado}}, {{origen}}
- Sistema: {{empresa}}, {{sitio_web}}, {{telefono_soporte}}, {{email_soporte}}
- Dinámicas: {{saludo}}, {{fecha_actual}}, {{hora_actual}}, {{dia_semana}}

**INSTRUCCIONES:**
1. Crea un mensaje efectivo que cumpla el objetivo
2. Usa un tono ${tone} pero cercano
3. Incluye emojis relevantes para WhatsApp
4. Integra variables apropiadas del lead (especialmente {{nombre}})
5. Longitud ${length}: ${length === 'corto' ? '1-2 párrafos' : length === 'medio' ? '2-3 párrafos' : '3-4 párrafos'}
6. Incluye call-to-action claro si es apropiado
7. Mantén el estilo de EscortsHub (profesional del sector)

**FORMATO DE RESPUESTA:**
Devuelve solo el contenido del template, sin explicaciones adicionales.

Template:`;

    const aiResponse = await AIService.generateResponse(prompt, {
      from: 'template-generator',
      sessionId: 'template-ai',
      phoneNumber: 'system',
    });

    if (!aiResponse.success || !aiResponse.content) {
      return res.status(500).json({
        success: false,
        error: aiResponse.error || 'Failed to generate template suggestion',
      });
    }

    // Limpiar la respuesta
    const templateContent = aiResponse.content
      .replace(/^Template:\s*/i, '')
      .replace(/^Mensaje:\s*/i, '')
      .trim();

    // Sugerir nombre y variables detectadas
    const detectedVariables: string[] = [];
    const variablePattern = /\{\{([^}]+)\}\}/g;
    let match;
    while ((match = variablePattern.exec(templateContent)) !== null) {
      if (!detectedVariables.includes(match[1])) {
        detectedVariables.push(match[1]);
      }
    }

    // Generar nombre sugerido
    const suggestedName = `${category.charAt(0).toUpperCase() + category.slice(1)} - ${objective.substring(0, 30)}${objective.length > 30 ? '...' : ''}`;

    res.json({
      success: true,
      data: {
        name: suggestedName,
        category: category,
        content: templateContent,
        variables: detectedVariables,
        subject: objective.substring(0, 50),
        metadata: {
          tone,
          length,
          generatedAt: new Date().toISOString(),
          aiProvider: aiResponse.provider,
          tokensUsed: aiResponse.tokensUsed,
        },
      },
    });
  } catch (error) {
    console.error('Error generating AI template suggestion:', error);
    res.status(500).json({
      success: false,
      error: 'Error generating AI template suggestion',
    });
  }
});

// Mejorar template existente con IA
router.post('/templates/ai-improve', async (req, res) => {
  try {
    const { content, improvements = [], tone, objective } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Template content is required',
      });
    }

    const { default: AIService } = await import('../services/AIService');

    const improvementText =
      improvements.length > 0 ? improvements.join(', ') : 'mejorar la efectividad general';

    const prompt = `Actúas como un experto copywriter para EscortsHub. Mejora el siguiente template de WhatsApp:

**TEMPLATE ACTUAL:**
${content}

**MEJORAS SOLICITADAS:**
${improvementText}

**INSTRUCCIONES:**
1. Mantén las variables existentes {{variable}}
2. Mejora: ${improvementText}
3. Conserva el tono profesional de EscortsHub
4. Optimiza para WhatsApp (emojis, párrafos cortos)
5. Mantén call-to-action efectivos
${tone ? `6. Ajusta el tono a: ${tone}` : ''}
${objective ? `7. Enfócate en: ${objective}` : ''}

**FORMATO:**
Devuelve solo el template mejorado, sin explicaciones.

Template mejorado:`;

    const aiResponse = await AIService.generateResponse(prompt, {
      from: 'template-improver',
      sessionId: 'template-ai',
      phoneNumber: 'system',
    });

    if (!aiResponse.success || !aiResponse.content) {
      return res.status(500).json({
        success: false,
        error: aiResponse.error || 'Failed to improve template',
      });
    }

    const improvedContent = aiResponse.content
      .replace(/^Template mejorado:\s*/i, '')
      .replace(/^Mejora:\s*/i, '')
      .trim();

    // Detectar cambios y variables
    const originalVariables: string[] = [];
    const improvedVariables: string[] = [];

    const variablePattern = /\{\{([^}]+)\}\}/g;
    let match;

    // Variables originales
    while ((match = variablePattern.exec(content)) !== null) {
      if (!originalVariables.includes(match[1])) {
        originalVariables.push(match[1]);
      }
    }

    // Variables mejoradas
    variablePattern.lastIndex = 0;
    while ((match = variablePattern.exec(improvedContent)) !== null) {
      if (!improvedVariables.includes(match[1])) {
        improvedVariables.push(match[1]);
      }
    }

    res.json({
      success: true,
      data: {
        original: content,
        improved: improvedContent,
        variables: improvedVariables,
        changes: {
          addedVariables: improvedVariables.filter(v => !originalVariables.includes(v)),
          removedVariables: originalVariables.filter(v => !improvedVariables.includes(v)),
          lengthChange: improvedContent.length - content.length,
        },
        metadata: {
          improvedAt: new Date().toISOString(),
          improvements: improvements,
          aiProvider: aiResponse.provider,
          tokensUsed: aiResponse.tokensUsed,
        },
      },
    });
  } catch (error) {
    console.error('Error improving template with AI:', error);
    res.status(500).json({
      success: false,
      error: 'Error improving template with AI',
    });
  }
});

// Generar mensaje proactivo personalizado
router.post('/proactive-messages/ai-generate', async (req, res) => {
  try {
    const {
      leadId,
      objective,
      context,
      tone = 'profesional',
      includeOffer = false,
      urgency = 'normal',
    } = req.body;

    if (!leadId || !objective) {
      return res.status(400).json({
        success: false,
        error: 'Lead ID and objective are required',
      });
    }

    const { default: DatabaseService } = await import('../services/DatabaseService');
    const { default: AIService } = await import('../services/AIService');

    // Obtener información del lead
    const lead = await DatabaseService.findLeadById(leadId);
    if (!lead) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found',
      });
    }

    // Crear prompt personalizado
    const prompt = `Genera un mensaje proactivo personalizado para WhatsApp desde EscortsHub.

**INFORMACIÓN DEL LEAD:**
- Nombre: ${lead.name || 'Usuario'}
- Teléfono: ${lead.phone}
- Email: ${lead.email || 'No disponible'}
- Estado: ${lead.status}
- Origen: ${lead.source}
- Puntuación: ${lead.moodScore || 'N/A'}

**ESPECIFICACIONES DEL MENSAJE:**
- Objetivo: ${objective}
- Tono: ${tone}
- Urgencia: ${urgency}
- Incluir oferta: ${includeOffer ? 'Sí' : 'No'}
${context ? `- Contexto adicional: ${context}` : ''}

**INSTRUCCIONES:**
1. Personaliza el mensaje con el nombre del lead
2. Usa tono ${tone} pero cercano y humano
3. ${urgency === 'high' ? 'Crea sensación de urgencia apropiada' : urgency === 'low' ? 'Mantén un enfoque relajado' : 'Equilibra urgencia y naturalidad'}
4. ${includeOffer ? 'Incluye una oferta o beneficio específico' : 'Enfócate en construir relación'}
5. Usa emojis apropiados para WhatsApp
6. Longitud ideal: 2-3 párrafos cortos
7. Call-to-action claro pero no agresivo
8. Refleja la profesionalidad de EscortsHub

**VARIABLES QUE PUEDES USAR:**
- {{nombre}} - Nombre del lead
- {{telefono}} - Teléfono del lead
- {{email}} - Email del lead
- {{saludo}} - Saludo según hora del día
- {{empresa}} - EscortsHub

Genera un mensaje efectivo y personalizado:`;

    const aiResponse = await AIService.generateResponse(prompt, {
      from: 'proactive-generator',
      sessionId: 'proactive-ai',
      phoneNumber: lead.phone,
    });

    if (!aiResponse.success || !aiResponse.content) {
      return res.status(500).json({
        success: false,
        error: aiResponse.error || 'Failed to generate proactive message',
      });
    }

    // Reemplazar variables con datos reales del lead
    const leadVariables = {
      nombre: lead.name || 'Usuario',
      telefono: lead.phone,
      email: lead.email || '',
      estado: lead.status,
      origen: lead.source,
    };

    const processedContent = DatabaseService.replaceTemplateVariables(
      aiResponse.content.trim(),
      leadVariables
    );

    res.json({
      success: true,
      data: {
        content: processedContent,
        rawContent: aiResponse.content.trim(),
        lead: {
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          status: lead.status,
        },
        variables: Object.keys(leadVariables),
        metadata: {
          objective,
          tone,
          urgency,
          includeOffer,
          generatedAt: new Date().toISOString(),
          aiProvider: aiResponse.provider,
          tokensUsed: aiResponse.tokensUsed,
        },
      },
    });
  } catch (error) {
    console.error('Error generating proactive message with AI:', error);
    res.status(500).json({
      success: false,
      error: 'Error generating proactive message with AI',
    });
  }
});

// ============================================
// ENDPOINTS DE VARIABLES DEL SISTEMA
// ============================================

// Obtener todas las variables del sistema
router.get('/system/variables', async (req, res) => {
  try {
    const { default: DatabaseService } = await import('../services/DatabaseService');
    const variables = await DatabaseService.getSystemVariables();

    res.json({
      success: true,
      data: variables,
    });
  } catch (error) {
    console.error('Error getting system variables:', error);
    res.status(500).json({
      success: false,
      error: 'Error getting system variables',
    });
  }
});

// Obtener una variable específica del sistema
router.get('/system/variables/:key', async (req, res) => {
  try {
    const { key } = req.params;

    const { default: DatabaseService } = await import('../services/DatabaseService');
    const value = await DatabaseService.getSystemVariable(key);

    if (value !== null) {
      res.json({
        success: true,
        data: { key, value },
      });
    } else {
      res.status(404).json({
        success: false,
        error: `System variable '${key}' not found`,
      });
    }
  } catch (error) {
    console.error('Error getting system variable:', error);
    res.status(500).json({
      success: false,
      error: 'Error getting system variable',
    });
  }
});

// Actualizar múltiples variables del sistema
router.put('/system/variables', async (req, res) => {
  try {
    const updates = req.body;

    // Validar que el body sea un objeto con al menos una variable
    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Request body must be an object with at least one variable to update',
      });
    }

    // Validar variables críticas
    const criticalVariables = ['empresa', 'sitio_web', 'telefono_soporte', 'email_soporte'];
    const providedKeys = Object.keys(updates);

    // Si se están actualizando variables críticas, validar que todas estén presentes
    const criticalKeysInUpdate = criticalVariables.filter(key => providedKeys.includes(key));
    if (criticalKeysInUpdate.length > 0) {
      const missingCritical = criticalVariables.filter(
        key => !providedKeys.includes(key) || !updates[key] || updates[key].trim() === ''
      );
      if (missingCritical.length > 0) {
        // Obtener variables actuales para completar las faltantes
        const { default: DatabaseService } = await import('../services/DatabaseService');
        const currentVariables = await DatabaseService.getSystemVariables();

        // Completar variables críticas faltantes con valores actuales
        missingCritical.forEach(key => {
          if (currentVariables[key]) {
            updates[key] = currentVariables[key];
          }
        });
      }
    }

    // Validaciones específicas
    if (updates.email_soporte && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email_soporte)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format for email_soporte',
      });
    }

    if (updates.sitio_web) {
      try {
        new URL(updates.sitio_web);
      } catch {
        return res.status(400).json({
          success: false,
          error: 'Invalid URL format for sitio_web',
        });
      }
    }

    if (
      updates.telefono_soporte &&
      !/\d{7,}/.test(updates.telefono_soporte.replace(/[^\d]/g, ''))
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format for telefono_soporte (must contain at least 7 digits)',
      });
    }

    if (
      updates.telefono_empresa &&
      !/\d{7,}/.test(updates.telefono_empresa.replace(/[^\d]/g, ''))
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format for telefono_empresa (must contain at least 7 digits)',
      });
    }

    const { default: DatabaseService } = await import('../services/DatabaseService');
    const success = await DatabaseService.updateSystemVariables(updates);

    if (success) {
      const { logger } = await import('../utils/logger');
      logger.info(`✅ System variables updated: ${Object.keys(updates).join(', ')}`);

      // Obtener las variables actualizadas para devolverlas
      const updatedVariables = await DatabaseService.getSystemVariables();

      res.json({
        success: true,
        message: `Successfully updated ${Object.keys(updates).length} system variables`,
        data: updatedVariables,
        updated: Object.keys(updates),
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to update system variables',
      });
    }
  } catch (error: any) {
    console.error('Error updating system variables:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Error updating system variables',
    });
  }
});

// Actualizar una variable específica del sistema
router.put('/system/variables/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (!value || typeof value !== 'string' || value.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Value is required and must be a non-empty string',
      });
    }

    // Validaciones específicas por clave
    if (
      (key === 'email_soporte' || key === 'email_empresa') &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
      });
    }

    if (key === 'sitio_web') {
      try {
        new URL(value);
      } catch {
        return res.status(400).json({
          success: false,
          error: 'Invalid URL format',
        });
      }
    }

    if (
      (key === 'telefono_soporte' || key === 'telefono_empresa') &&
      !/\d{7,}/.test(value.replace(/[^\d]/g, ''))
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format (must contain at least 7 digits)',
      });
    }

    const { default: DatabaseService } = await import('../services/DatabaseService');
    const success = await DatabaseService.updateSystemVariable(key, value);

    if (success) {
      const { logger } = await import('../utils/logger');
      logger.info(`✅ System variable updated: ${key} = ${value}`);

      res.json({
        success: true,
        message: `Successfully updated system variable '${key}'`,
        data: { key, value },
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to update system variable',
      });
    }
  } catch (error: any) {
    console.error('Error updating system variable:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Error updating system variable',
    });
  }
});

// Procesar texto reemplazando variables del sistema (útil para preview)
router.post('/system/variables/process-text', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Text is required and must be a string',
      });
    }

    const { default: DatabaseService } = await import('../services/DatabaseService');
    const processedText = await DatabaseService.replaceSystemVariables(text);

    res.json({
      success: true,
      data: {
        original: text,
        processed: processedText,
        hasVariables: text.includes('{{') && text.includes('}}'),
      },
    });
  } catch (error) {
    console.error('Error processing text with system variables:', error);
    res.status(500).json({
      success: false,
      error: 'Error processing text with system variables',
    });
  }
});

// Limpiar cache de variables del sistema (útil para desarrollo/testing)
router.post('/system/variables/clear-cache', async (req, res) => {
  try {
    const { default: DatabaseService } = await import('../services/DatabaseService');
    DatabaseService.clearSystemVariablesCache();

    const { logger } = await import('../utils/logger');
    logger.info('🧹 System variables cache cleared via API');

    res.json({
      success: true,
      message: 'System variables cache cleared successfully',
    });
  } catch (error) {
    console.error('Error clearing system variables cache:', error);
    res.status(500).json({
      success: false,
      error: 'Error clearing system variables cache',
    });
  }
});

export default router;
