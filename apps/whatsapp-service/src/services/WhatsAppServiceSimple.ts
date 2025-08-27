import { Client, LocalAuth, Message } from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import { logger } from '../utils/logger';
import advancedLogger from '../utils/advancedLogger';
import { WhatsAppMessage, WhatsAppSession, WebhookPayload, SendMessageResponse } from '../types'
import { SessionCleanupUtil } from '../utils/sessionCleanup'
import PhoneNumberService from './PhoneNumberService'
import SessionPersistenceService from './SessionPersistenceService'
import SessionRecoveryService from './SessionRecoveryService'
import SessionHealthCheckService from './SessionHealthCheckService'
import fs from 'fs'
import path from 'path'

class WhatsAppServiceSimple {
  private clients: Map<string, Client> = new Map()
  private sessions: Map<string, WhatsAppSession> = new Map()
  private webhookUrl: string | undefined

  constructor() {
    this.webhookUrl = process.env.WEBHOOK_URL
  }

  async initialize(): Promise<void> {
    logger.info('🚀 Iniciando WhatsApp service con persistencia y monitoreo avanzado...')
    
    // Recover existing sessions from database
    try {
      const recoveryResult = await SessionRecoveryService.recoverAllSessions(this)
      logger.info(`📊 Recuperación completada: ${recoveryResult.recoveredSessions}/${recoveryResult.totalSessions} sesiones`)
      
      if (recoveryResult.errors.length > 0) {
        logger.warn('⚠️ Errores durante recuperación:', recoveryResult.errors)
      }
    } catch (error) {
      logger.error('❌ Error durante recuperación de sesiones:', error)
    }
    
    // Start periodic health checks (legacy)
    SessionRecoveryService.scheduleHealthChecks(this)
    
    // Start advanced health monitoring
    SessionHealthCheckService.startMonitoring(this)
    
    // Register alert callback for logging
    SessionHealthCheckService.onAlert((alert) => {
      logger.warn(`🚨 Health Alert [${alert.severity.toUpperCase()}] ${alert.sessionId}: ${alert.message}`, {
        type: alert.type,
        recommendation: alert.recommendation,
        timestamp: alert.timestamp
      })
    })
    
    logger.info('✅ WhatsApp service initialized successfully with database persistence and health monitoring')
  }

  async createSession(sessionId: string): Promise<WhatsAppSession> {
    try {
      if (this.clients.has(sessionId)) {
        throw new Error(`Session ${sessionId} already exists`)
      }

      // Ensure auth directory exists
      const authDataPath = path.resolve('./wwebjs_auth')
      await this.ensureAuthDirectoryExists(authDataPath)
      
      // Validate existing authentication files for integrity
      const authIsValid = await this.validateAuthFiles(sessionId, authDataPath)
      if (!authIsValid) {
        logger.warn(`⚠️ Invalid auth files detected for session ${sessionId}, cleaning up...`)
        await this.cleanupCorruptedAuthFiles(sessionId, authDataPath)
      }

      // Create WhatsApp client with session authentication
      const client = new Client({
        authStrategy: new LocalAuth({
          clientId: sessionId,
          dataPath: authDataPath // Directorio persistente para autenticación
        }),
        puppeteer: {
          headless: process.env.PUPPETEER_HEADLESS === 'true' || process.env.NODE_ENV === 'production',
          executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined,
          devtools: process.env.NODE_ENV === 'development',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
          ]
        }
      })

      // Create session object
      const session: WhatsAppSession = {
        id: sessionId,
        clientId: sessionId,
        status: 'connecting',
        lastSeen: new Date(),
        webhookUrl: this.webhookUrl
      }

      // Set up event listeners
      this.setupClientEventListeners(client, sessionId)

      // Store client and session in memory
      this.clients.set(sessionId, client)
      this.sessions.set(sessionId, session)
      
      // Persist session to database with enhanced LocalAuth metadata
      const authFileInfo = await this.getAuthFileInfo(sessionId, authDataPath)
      await SessionPersistenceService.saveSession({
        sessionId: sessionId,
        name: sessionId,
        status: 'connecting',
        lastSeen: new Date(),
        webhookUrl: this.webhookUrl,
        isActive: true,
        reconnectCount: 0,
        metadata: {
          clientId: sessionId,
          authDataPath: authDataPath,
          authFileExists: authFileInfo.exists,
          authFileSize: authFileInfo.size,
          authFileModified: authFileInfo.modified,
          sessionCreated: new Date().toISOString(),
          localAuthVersion: '1.0'
        }
      })

      // Initialize the client
      client.initialize()

      logger.info(`📱 WhatsApp session ${sessionId} created and persisted successfully`)
      return session
    } catch (error) {
      logger.error(`Error creating session ${sessionId}:`, error)
      throw error
    }
  }

  private setupClientEventListeners(client: Client, sessionId: string): void {
    // QR Code event
    client.on('qr', async (qr) => {
      logger.info(`QR Code generated for session ${sessionId}`)
      
      // Generate QR code for terminal display (development)
      if (process.env.NODE_ENV !== 'production') {
        qrcode.generate(qr, { small: true })
      }

      // Store QR code in session
      this.updateSessionStatus(sessionId, 'connecting', { qrCode: qr })

      // Send webhook
      await this.sendWebhook({
        event: 'qr_updated',
        sessionId,
        data: { qrCode: qr },
        timestamp: new Date().toISOString()
      })
    })

    // Ready event
    client.on('ready', async () => {
      logger.info(`WhatsApp client ${sessionId} is ready`)
      
      const clientInfo = client.info
      
      // Advanced logging de evento de sesión
      advancedLogger.logSessionEvent({
        sessionId,
        eventType: 'READY',
        phoneNumber: clientInfo?.wid?.user || 'unknown',
        authState: 'AUTHENTICATED',
        metadata: {
          clientInfo: {
            number: clientInfo?.wid?.user,
            pushname: clientInfo?.pushname,
            platform: clientInfo?.platform
          }
        }
      })
      
      this.updateSessionStatus(sessionId, 'ready', { 
        connectedNumber: clientInfo?.wid?.user || 'unknown'
      })

      // Send webhook
      await this.sendWebhook({
        event: 'authenticated',
        sessionId,
        data: { number: clientInfo?.wid?.user },
        timestamp: new Date().toISOString()
      })
    })

    // Authenticated event
    client.on('authenticated', async () => {
      logger.info(`WhatsApp client ${sessionId} authenticated`)
      this.updateSessionStatus(sessionId, 'authenticated')
    })

    // Authentication failure event
    client.on('auth_failure', async (msg) => {
      logger.error(`Authentication failed for session ${sessionId}:`, msg)
      this.updateSessionStatus(sessionId, 'auth_failure')

      // Send webhook
      await this.sendWebhook({
        event: 'status_change',
        sessionId,
        data: { status: 'auth_failure', message: msg },
        timestamp: new Date().toISOString()
      })
    })

    // Disconnected event
    client.on('disconnected', async (reason) => {
      logger.info(`WhatsApp client ${sessionId} disconnected:`, reason)
      this.updateSessionStatus(sessionId, 'disconnected')

      // Send webhook
      await this.sendWebhook({
        event: 'disconnected',
        sessionId,
        data: { reason },
        timestamp: new Date().toISOString()
      })
    })

    // Message event
    client.on('message', async (message: Message) => {
      try {
        const whatsappMessage = await this.parseMessage(message, sessionId)
        logger.info(`Message received in session ${sessionId}:`, {
          from: whatsappMessage.from,
          body: whatsappMessage.body.substring(0, 100)
        })

        // Process with AI only if it's not from us AND if sender is in whitelist
        if (!whatsappMessage.fromMe && whatsappMessage.body.trim()) {
          const whitelistResult = await this.checkPhoneNumberAllowedWithLog(whatsappMessage.from, sessionId, whatsappMessage.body)
          if (whitelistResult.allowed) {
            logger.info(`📱 Respuesta automática permitida para: ${whatsappMessage.from}`)
            await this.processMessageWithAI(message, whatsappMessage, sessionId)
          } else {
            logger.info(`🚫 Respuesta automática bloqueada para: ${whatsappMessage.from} - ${whitelistResult.reason}`)
          }
        }

        // Send webhook with message (always, regardless of AI processing)
        await this.sendWebhook({
          event: 'message',
          sessionId,
          data: whatsappMessage,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        logger.error(`Error processing message in session ${sessionId}:`, error)
      }
    })
  }

  private async parseMessage(message: Message, sessionId: string): Promise<WhatsAppMessage> {
    const contact = await message.getContact()
    const chat = await message.getChat()

    return {
      id: message.id._serialized,
      from: contact.id._serialized,
      to: message.to,
      body: message.body,
      timestamp: message.timestamp,
      type: message.type as any,
      isGroup: chat.isGroup,
      fromMe: message.fromMe
    }
  }

  async sendMessage(sessionId: string, to: string, message: string): Promise<SendMessageResponse> {
    try {
      const client = this.clients.get(sessionId)
      if (!client) {
        return {
          success: false,
          error: `Session ${sessionId} not found`
        }
      }

      const session = this.sessions.get(sessionId)
      if (!session || session.status !== 'ready') {
        return {
          success: false,
          error: `Session ${sessionId} is not ready. Status: ${session?.status || 'not found'}`
        }
      }

      // Format phone number (ensure it includes country code)
      const formattedNumber = to.includes('@c.us') ? to : `${to}@c.us`

      const sentMessage = await client.sendMessage(formattedNumber, message)
      
      logger.info(`Message sent successfully in session ${sessionId}`, {
        to: formattedNumber,
        messageId: sentMessage.id._serialized
      })

      return {
        success: true,
        messageId: sentMessage.id._serialized
      }
    } catch (error) {
      logger.error(`Error sending message in session ${sessionId}:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async getSessionStatus(sessionId: string): Promise<WhatsAppSession | null> {
    return this.sessions.get(sessionId) || null
  }

  async getAllSessions(): Promise<WhatsAppSession[]> {
    const sessions: WhatsAppSession[] = []
    this.sessions.forEach(session => sessions.push(session))
    return sessions
  }

  async destroySession(sessionId: string): Promise<void> {
    try {
      logger.info(`🗑️ Starting destruction of session ${sessionId}`)
      
      const client = this.clients.get(sessionId)
      if (client) {
        try {
          // Intentar cerrar el cliente gracefully
          await client.destroy()
          logger.info(`WhatsApp client for session ${sessionId} destroyed successfully`)
        } catch (clientError) {
          logger.warn(`Error destroying WhatsApp client for session ${sessionId}:`, clientError)
          // Continuar con la limpieza aunque el cliente falle
        }
        this.clients.delete(sessionId)
      }

      // Remover de la lista de sesiones en memoria
      this.sessions.delete(sessionId)
      
      // Deactivate session in database
      try {
        await SessionPersistenceService.deactivateSession(sessionId)
        logger.info(`Session ${sessionId} deactivated in database`)
      } catch (dbError) {
        logger.error(`Error deactivating session ${sessionId} in database:`, dbError)
        // Continue with cleanup even if database update fails
      }
      
      // Usar la utilidad de limpieza segura para archivos
      try {
        await SessionCleanupUtil.cleanupSession(sessionId, './sessions')
        logger.info(`Session ${sessionId} files cleaned up successfully`)
      } catch (cleanupError) {
        logger.error(`Error cleaning up session ${sessionId} files:`, cleanupError)
        // No lanzar el error para permitir que la aplicación continúe
      }
      
      logger.info(`✅ Session ${sessionId} destroyed completely`)
    } catch (error) {
      logger.error(`❌ Error destroying session ${sessionId}:`, error)
      
      // Aún así, intentar limpiar la sesión de las estructuras de datos
      this.clients.delete(sessionId)
      this.sessions.delete(sessionId)
      
      // Try to deactivate in database even on error
      try {
        await SessionPersistenceService.deactivateSession(sessionId)
      } catch (dbError) {
        logger.error(`Final database cleanup failed for session ${sessionId}:`, dbError)
      }
      
      // Intentar limpieza de archivos como último recurso
      try {
        await SessionCleanupUtil.cleanupSession(sessionId, './sessions')
      } catch (cleanupError) {
        logger.error(`Final cleanup attempt failed for session ${sessionId}:`, cleanupError)
      }
      
      throw error
    }
  }

  private async updateSessionStatus(sessionId: string, status: WhatsAppSession['status'], data?: any): Promise<void> {
    // Update in-memory session
    const session = this.sessions.get(sessionId)
    if (session) {
      session.status = status
      session.lastSeen = new Date()
      if (data) {
        Object.assign(session, data)
      }
    }
    
    // Persist to database asynchronously
    try {
      await SessionPersistenceService.updateSessionStatus(sessionId, status, data)
    } catch (error) {
      logger.error(`Error persisting session status update for ${sessionId}:`, error)
      // Don't throw - continue execution even if persistence fails
    }
  }

  private async processMessageWithAI(originalMessage: Message, whatsappMessage: WhatsAppMessage, sessionId: string): Promise<void> {
    const startTime = Date.now();
    let aiResponse: string = '';
    let knowledgeBaseIdsUsed: string[] = [];
    
    try {
      logger.info(`🧠 Processing message with enhanced AI thinking for session ${sessionId}`);
      
      // Import services dynamically to avoid circular dependencies
      const { default: AIThinkingService } = await import('./AIThinkingService');
      const { default: DatabaseService } = await import('./DatabaseService');
      const { default: AILearningService } = await import('./AILearningService');
      
      // Get phone number without WhatsApp suffix
      const phoneNumber = whatsappMessage.from.replace('@c.us', '');
      
      // Enhanced processing with structured thinking
      const thinkingResult = await AIThinkingService.processWithThinking(whatsappMessage.body, {
        from: whatsappMessage.from,
        sessionId: sessionId,
        phoneNumber: phoneNumber
      });
      
      // Extract knowledge base IDs used from knowledge retrieval step
      const knowledgeStep = thinkingResult.thinkingProcess.steps.find(s => s.type === 'knowledge_retrieval');
      knowledgeBaseIdsUsed = knowledgeStep?.data?.map((item: any) => item.id).filter(Boolean) || [];
      
      logger.info(`🧠 [THINKING RESULT] Decision: ${thinkingResult.thinkingProcess.shouldRespond ? 'RESPOND' : 'NO RESPONSE'}`, {
        confidence: thinkingResult.thinkingProcess.confidence,
        processingTime: thinkingResult.thinkingProcess.processingTimeMs,
        steps: thinkingResult.thinkingProcess.steps.length,
        complexity: thinkingResult.thinkingProcess.estimatedComplexity,
        finalDecision: thinkingResult.thinkingProcess.finalDecision
      });
      
      // Log detailed thinking process for debugging
      thinkingResult.thinkingProcess.steps.forEach((step, index) => {
        logger.debug(`🧠 [STEP ${step.step}] ${step.title}:`, {
          type: step.type,
          content: step.content.substring(0, 150),
          confidence: step.confidence
        });
      });
      
      if (thinkingResult.thinkingProcess.shouldRespond && thinkingResult.success && thinkingResult.content) {
        aiResponse = thinkingResult.content;
        
        // Calculate enhanced delay based on thinking complexity
        const complexityDelayMultiplier = {
          'simple': 1.0,
          'medium': 1.3,
          'complex': 1.8
        }[thinkingResult.thinkingProcess.estimatedComplexity];
        
        // Add humanized delay with complexity factor
        await this.addHumanizedDelayEnhanced(
          whatsappMessage.body, 
          thinkingResult.thinkingProcess,
          complexityDelayMultiplier
        );
        
        // Determine sending method based on strategy
        const strategy = thinkingResult.thinkingProcess.responseStrategy;
        await this.sendResponseWithStrategy(
          originalMessage,
          thinkingResult.content,
          strategy
        );
        
        // Save enhanced conversation data to database
        await DatabaseService.saveConversation({
          sessionId: sessionId,
          phoneNumber: phoneNumber,
          messageText: whatsappMessage.body,
          responseText: undefined,
          messageType: whatsappMessage.type,
          intent: thinkingResult.thinkingProcess.steps[0]?.data?.intent || 'unknown',
          sentiment: thinkingResult.thinkingProcess.steps[0]?.data?.sentiment || 'neutral',
          aiProvider: thinkingResult.provider,
          tokensUsed: thinkingResult.tokensUsed || 0,
          isFromUser: true
        });
        
        // Save AI response
        await DatabaseService.saveConversation({
          sessionId: sessionId,
          phoneNumber: phoneNumber,
          messageText: thinkingResult.content,
          responseText: undefined,
          messageType: 'text',
          intent: thinkingResult.thinkingProcess.steps[0]?.data?.intent || 'response',
          sentiment: 'neutral',
          aiProvider: thinkingResult.provider,
          tokensUsed: 0,
          isFromUser: false
        });
        
        // Calculate success metrics for learning
        const responseTime = Date.now() - startTime;
        
        // Schedule success score calculation and logging after a delay
        // to allow time for user to respond (indicating conversation continuation)
        setTimeout(async () => {
          await this.logSuccessfulInteraction(
            whatsappMessage.body,
            aiResponse,
            knowledgeBaseIdsUsed,
            phoneNumber,
            sessionId,
            responseTime,
            thinkingResult.thinkingProcess.steps[0]?.data?.intent,
            thinkingResult.thinkingProcess.steps[0]?.data?.sentiment
          );
        }, 5000); // Wait 5 seconds before calculating success metrics
        
        logger.info(`✅ Enhanced AI response sent successfully to ${phoneNumber}:`, {
          messageLength: thinkingResult.content.length,
          provider: thinkingResult.provider,
          tokensUsed: thinkingResult.tokensUsed,
          thinkingTime: thinkingResult.thinkingProcess.processingTimeMs,
          confidence: thinkingResult.thinkingProcess.confidence,
          strategy: `${strategy.type} (${strategy.tone}, ${strategy.length})`
        });
      } else {
        // No response decision or error
        const reason = !thinkingResult.thinkingProcess.shouldRespond 
          ? thinkingResult.thinkingProcess.finalDecision
          : (thinkingResult.error || 'Unknown error');
          
        logger.info(`❌ No AI response sent to ${phoneNumber}. Reason: ${reason}`);
        
        // Still save the user message for record keeping
        await DatabaseService.saveConversation({
          sessionId: sessionId,
          phoneNumber: phoneNumber,
          messageText: whatsappMessage.body,
          responseText: undefined,
          messageType: whatsappMessage.type,
          intent: thinkingResult.thinkingProcess.steps[0]?.data?.intent || 'no_response',
          sentiment: thinkingResult.thinkingProcess.steps[0]?.data?.sentiment || 'neutral',
          aiProvider: thinkingResult.provider,
          tokensUsed: 0,
          isFromUser: true
        });
        
        // Send intelligent fallback when AI thinking failed with an error
        if (thinkingResult.error) {
          logger.info(`🔄 AI thinking failed with error, using intelligent fallback for ${phoneNumber}`);
          try {
            const intelligentFallback = await this.generateIntelligentFallback(originalMessage, phoneNumber);
            await originalMessage.reply(intelligentFallback);
            
            // Log the fallback usage
            await DatabaseService.saveConversation({
              sessionId: sessionId,
              phoneNumber: phoneNumber,
              messageText: intelligentFallback,
              responseText: undefined,
              messageType: 'text',
              intent: 'fallback_response',
              sentiment: 'neutral',
              aiProvider: 'intelligent_fallback',
              tokensUsed: 0,
              isFromUser: false
            });
            
            logger.info(`✅ Intelligent fallback sent to ${phoneNumber}`);
          } catch (replyError) {
            logger.error('Error sending intelligent fallback message:', replyError);
            // Only use generic fallback as last resort
            try {
              await originalMessage.reply('Disculpa, en este momento no puedo procesar tu mensaje. Un agente se pondrá en contacto contigo pronto. 😊');
            } catch (finalError) {
              logger.error('Error sending final fallback:', finalError);
            }
          }
        } else if (!thinkingResult.thinkingProcess.shouldRespond) {
          logger.info(`🤐 AI decided not to respond to ${phoneNumber}. Reason: ${thinkingResult.thinkingProcess.finalDecision}`);
        }
      }
    } catch (error) {
      logger.error('❌ Error in enhanced processMessageWithAI:', error);
      
      // Get phone number for fallback (define it here since it's in catch block)
      const phoneNumber = whatsappMessage.from.replace('@c.us', '');
      
      // Send intelligent fallback message on critical error
      try {
        const intelligentFallback = await this.generateIntelligentFallback(originalMessage, phoneNumber);
        await originalMessage.reply(intelligentFallback);
      } catch (replyError) {
        logger.error('Error sending intelligent fallback message:', replyError);
        // Last resort generic message
        try {
          await originalMessage.reply('Gracias por tu mensaje. Un representante te contactará pronto. 👍');
        } catch (finalError) {
          logger.error('Error sending final fallback:', finalError);
        }
      }
    }
  }

  // New method to log successful interactions for AI learning
  private async logSuccessfulInteraction(
    userMessage: string,
    aiResponse: string,
    knowledgeBaseIds: string[],
    phoneNumber: string,
    sessionId: string,
    responseTimeMs: number,
    intent?: string,
    sentiment?: string
  ): Promise<void> {
    try {
      // Import services dynamically
      const AILearningService = await import('./AILearningService');
      
      // Calculate initial success score based on response time and complexity
      const initialSuccessScore = this.calculateInitialSuccessScore(userMessage, aiResponse, responseTimeMs);
      
      // Prepare contextual metrics
      const contextMetrics = {
        responseTimeMs,
        messageLength: userMessage.length,
        responseLength: aiResponse.length,
        intent: intent || 'unknown',
        sentiment: sentiment || 'neutral',
        timestamp: new Date().toISOString()
      };
      
      // Log the training interaction
      await AILearningService.default.logInteraction({
        userMessage,
        aiResponse,
        knowledgeBaseIdsUsed: knowledgeBaseIds,
        successScore: initialSuccessScore,
        contextData: {
          phoneNumber,
          sessionId,
          intent,
          sentiment,
          responseTime: responseTimeMs
        },
        feedbackMetrics: {
          conversationContinued: false, // Will be updated later
          responseTime: responseTimeMs,
          followUpQuestions: 0,
          userSatisfactionIndicators: []
        }
      });
      
      logger.info(`📊 Logged training interaction for learning with score: ${initialSuccessScore.toFixed(2)}`, {
        phoneNumber,
        messageLength: userMessage.length,
        responseTime: responseTimeMs,
        knowledgeBaseCount: knowledgeBaseIds.length
      });
    } catch (error) {
      // Non-blocking error handling for learning system
      logger.error('Error logging training interaction:', error);
    }
  }
  
  // Calculate initial success score based on heuristics
  private calculateInitialSuccessScore(
    userMessage: string,
    aiResponse: string,
    responseTimeMs: number
  ): number {
    // Base score starts at 0.7 (neutral)
    let score = 0.7;
    
    // Factor 1: Response time penalty (slower = lower score)
    // Scale: 0-5000ms is good, 5000-15000ms is ok, >15000ms is slow
    if (responseTimeMs < 5000) {
      score += 0.1; // Fast response bonus
    } else if (responseTimeMs > 15000) {
      score -= 0.1; // Slow response penalty
    }
    
    // Factor 2: Response length appropriateness
    // Very short messages (<20 chars) should have concise responses
    // Longer messages might need longer responses
    const responseRatio = aiResponse.length / Math.max(userMessage.length, 1);
    if (userMessage.length < 20 && aiResponse.length > 200) {
      score -= 0.1; // Too verbose for short question
    } else if (userMessage.length > 100 && aiResponse.length < 50) {
      score -= 0.1; // Too brief for detailed question
    } else if (responseRatio > 0.5 && responseRatio < 5) {
      score += 0.1; // Good ratio of question to answer
    }
    
    // Factor 3: Presence of questions in user message
    if (userMessage.includes('?') || 
        userMessage.toLowerCase().includes('cómo') ||
        userMessage.toLowerCase().includes('qué') ||
        userMessage.toLowerCase().includes('cuándo') ||
        userMessage.toLowerCase().includes('dónde') ||
        userMessage.toLowerCase().includes('por qué')) {
      // Direct questions should be answered thoroughly
      if (aiResponse.length > 100) {
        score += 0.1; // Good detailed answer to question
      }
    }
    
    // Ensure score stays within bounds 0.0-1.0
    return Math.max(0.0, Math.min(1.0, score));
  }

  private async checkPhoneNumberAllowedWithLog(
    phoneNumberWithSuffix: string,
    sessionId: string,
    messagePreview?: string
  ): Promise<{ allowed: boolean; reason: string; leadInfo?: any }> {
    try {
      // Remove WhatsApp suffix to get clean phone number
      const phoneNumber = phoneNumberWithSuffix.replace('@c.us', '').replace('@g.us', '')
      
      // Import DatabaseService to check leads
      const { default: DatabaseService } = await import('./DatabaseService')
      
      // Get all active leads from database
      const leads = await DatabaseService.getAllLeads()
      
      // Check if the phone number matches any lead using PhoneNumberService
      let matchedLead: any = null
      
      // Normalize incoming phone number
      const normalizedIncoming = PhoneNumberService.normalizePhoneNumber(phoneNumber);
      
      const isAllowed = leads.some(lead => {
        if (!lead.phone || !lead.whatsappAuthorized) return false
        
        // Use PhoneNumberService for robust phone number comparison
        if (PhoneNumberService.arePhoneNumbersEquivalent(phoneNumber, lead.phone)) {
          matchedLead = lead
          logger.debug(`✅ Phone number match found: ${lead.phone} ≈ ${phoneNumber} (normalized: ${normalizedIncoming})`);
          return true
        }
        
        return false
      })
      
      let decision: 'ALLOWED' | 'BLOCKED'
      let reason: string
      
      if (isAllowed && matchedLead) {
        decision = 'ALLOWED'
        reason = `Lead autorizado: ${matchedLead.name || 'Sin nombre'} (ID: ${matchedLead.id})`
        logger.info(`✅ Número ${phoneNumber} PERMITIDO - ${reason}`)
      } else {
        decision = 'BLOCKED'
        const leadExists = leads.some(lead => {
          if (!lead.phone) return false
          return PhoneNumberService.arePhoneNumbersEquivalent(phoneNumber, lead.phone)
        })
        
        if (leadExists) {
          reason = 'Lead existe pero WhatsApp no autorizado'
        } else {
          reason = 'Número no encontrado en whitelist de leads'
        }
        
        logger.info(`❌ Número ${phoneNumber} BLOQUEADO - ${reason}`)
      }
      
      // Log the decision to database
      await DatabaseService.logWhitelistDecision({
        phoneNumber,
        sessionId,
        decision,
        reason,
        leadId: matchedLead?.id,
        leadName: matchedLead?.name,
        messagePreview: messagePreview?.substring(0, 200),
        aiProvider: process.env.AI_PROVIDER || 'unknown'
      })
      
      // Advanced logging de la decisión de whitelist
      advancedLogger.logWhitelistDecision({
        phoneNumber,
        sessionId,
        decision,
        reason,
        leadId: matchedLead?.id,
        leadName: matchedLead?.name,
        messagePreview: messagePreview
      }, {
        sessionId,
        phoneNumber,
        operation: 'whitelist-check',
        leadId: matchedLead?.id
      })
      
      return {
        allowed: isAllowed,
        reason,
        leadInfo: matchedLead
      }
    } catch (error) {
      logger.error('Error checking phone number whitelist:', error)
      
      // Log the error decision
      try {
        const { default: DatabaseService } = await import('./DatabaseService')
        await DatabaseService.logWhitelistDecision({
          phoneNumber: phoneNumberWithSuffix.replace('@c.us', '').replace('@g.us', ''),
          sessionId,
          decision: 'ALLOWED',
          reason: 'Error en verificación - comportamiento fail-safe',
          messagePreview: messagePreview?.substring(0, 200),
          aiProvider: process.env.AI_PROVIDER || 'unknown'
        })
      } catch (logError) {
        logger.error('Error logging whitelist decision:', logError)
      }
      
      // En caso de error, permitir la respuesta (behavior fail-safe)
      return {
        allowed: true,
        reason: 'Error en verificación - comportamiento fail-safe permitido'
      }
    }
  }

  // Add humanized delay before responding to simulate human behavior
  private async addHumanizedDelay(messageText: string): Promise<void> {
    // Get delay settings from environment variables
    const minDelay = parseInt(process.env.AI_RESPONSE_DELAY_MIN || '2000') // 2 seconds default
    const maxDelay = parseInt(process.env.AI_RESPONSE_DELAY_MAX || '6000') // 6 seconds default
    
    // Calculate delay based on message length (longer messages = longer thinking time)
    const baseDelay = Math.min(messageText.length * 50, 2000) // 50ms per character, max 2s extra
    const randomDelay = Math.random() * (maxDelay - minDelay) + minDelay
    const totalDelay = Math.min(randomDelay + baseDelay, maxDelay)
    
    logger.info(`⏱️ Adding humanized delay: ${Math.round(totalDelay)}ms (message length: ${messageText.length})`)
    
    await new Promise(resolve => setTimeout(resolve, totalDelay))
  }

  // Enhanced delay with complexity-based timing
  private async addHumanizedDelayEnhanced(
    messageText: string, 
    thinkingProcess: any,
    complexityMultiplier: number = 1.0
  ): Promise<void> {
    // Get delay settings from environment variables
    const minDelay = parseInt(process.env.AI_RESPONSE_DELAY_MIN || '2000')
    const maxDelay = parseInt(process.env.AI_RESPONSE_DELAY_MAX || '8000') // Increased max for complex thinking
    
    // Base delay from original method
    const baseDelay = Math.min(messageText.length * 50, 2000)
    
    // Add thinking complexity factor
    const thinkingDelay = Math.min(thinkingProcess.processingTimeMs * 0.3, 2000) // 30% of thinking time, max 2s
    
    // Add confidence factor (lower confidence = more "hesitation")
    const confidenceFactor = Math.max(0.5, thinkingProcess.confidence)
    const hesitationDelay = (1 - confidenceFactor) * 1500 // Up to 1.5s hesitation
    
    // Random variation for human-like behavior
    const randomVariation = Math.random() * 1000
    
    // Calculate total delay
    const calculatedDelay = (
      baseDelay + 
      thinkingDelay + 
      hesitationDelay + 
      randomVariation
    ) * complexityMultiplier
    
    const totalDelay = Math.max(
      minDelay,
      Math.min(calculatedDelay, maxDelay)
    )
    
    logger.info(`🧠⏱️ Enhanced delay: ${Math.round(totalDelay)}ms`, {
      messageLength: messageText.length,
      complexity: thinkingProcess.estimatedComplexity,
      confidence: thinkingProcess.confidence,
      thinkingTime: thinkingProcess.processingTimeMs,
      multiplier: complexityMultiplier
    })
    
    await new Promise(resolve => setTimeout(resolve, totalDelay))
  }

  // Send response with intelligent quoting strategy
  private async sendResponseWithStrategy(
    originalMessage: Message, 
    responseText: string, 
    strategy: any
  ): Promise<void> {
    try {
      if (strategy.shouldQuote || this.shouldQuoteBasedOnContext(originalMessage, responseText, strategy)) {
        // Quote the original message
        await originalMessage.reply(responseText)
        logger.debug('📝 Response sent with quote')
      } else {
        // Send without quoting
        const chat = await originalMessage.getChat()
        await chat.sendMessage(responseText)
        logger.debug('📝 Response sent without quote')
      }
    } catch (error) {
      logger.error('Error in sendResponseWithStrategy:', error)
      // Fallback to simple reply
      await originalMessage.reply(responseText)
    }
  }

  // Determine if we should quote based on message context
  private shouldQuoteBasedOnContext(
    originalMessage: Message, 
    responseText: string, 
    strategy: any
  ): boolean {
    // Always quote if strategy explicitly says so
    if (strategy.shouldQuote === true) return true
    if (strategy.shouldQuote === false) return false
    
    // Smart quoting logic
    const messageText = originalMessage.body?.toLowerCase() || ''
    
    // Quote for direct questions
    if (messageText.includes('?') || 
        messageText.includes('cuánto') || 
        messageText.includes('cómo') || 
        messageText.includes('qué') ||
        messageText.includes('dónde') ||
        messageText.includes('cuándo')) {
      return true
    }
    
    // Quote for complaints or support requests
    if (strategy.tone === 'supportive' || strategy.priority === 'high') {
      return true
    }
    
    // Don't quote for simple greetings
    if (messageText.includes('hola') || 
        messageText.includes('buenos') ||
        messageText.includes('buenas')) {
      return false
    }
    
    // Don't quote for long conversations (default)
    return false
  }

  // Mantener método original para compatibilidad
  private async isPhoneNumberAllowed(phoneNumberWithSuffix: string): Promise<boolean> {
    const result = await this.checkPhoneNumberAllowedWithLog(phoneNumberWithSuffix, 'unknown', undefined)
    return result.allowed
  }

  private async sendWebhook(payload: WebhookPayload): Promise<void> {
    if (!this.webhookUrl) {
      logger.debug('No webhook URL configured, skipping webhook')
      return
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WhatsApp-Service': 'true'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error(`Webhook failed with status: ${response.status}`)
      }

      logger.debug(`Webhook sent successfully for event ${payload.event}`)
    } catch (error) {
      logger.error('Error sending webhook:', error)
    }
  }

  private async generateIntelligentFallback(originalMessage: Message, phoneNumber: string): Promise<string> {
    try {
      logger.info(`🔍 Generating intelligent fallback for ${phoneNumber}`);
      
      // Import services
      const { default: DatabaseService } = await import('./DatabaseService');
      const { default: AIService } = await import('./AIService');
      
      const messageText = originalMessage.body || '';
      
      // Search knowledge base for relevant information
      const knowledgeResults = await DatabaseService.searchKnowledgeBase(messageText);
      
      if (knowledgeResults.length > 0) {
        logger.info(`📚 Found ${knowledgeResults.length} relevant knowledge base entries`);
        
        // Use the most relevant entry
        const mostRelevant = knowledgeResults[0];
        
        // Create a simplified context for AI response
        const context = {
          userMessage: messageText,
          knowledgeTitle: mostRelevant.title,
          knowledgeContent: mostRelevant.content,
          keywords: mostRelevant.keywords
        };
        
        // Generate contextual response using AI
        const aiResponse = await AIService.generateResponse(
          `Basándote en esta información de nuestra base de conocimientos, genera una respuesta útil y amigable para el usuario.

Pregunta del usuario: "${messageText}"

Información relevante encontrada:
Título: ${mostRelevant.title}
Contenido: ${mostRelevant.content}
Palabras clave: ${mostRelevant.keywords}

Genera una respuesta que:
1. Sea útil y directa
2. Use un tono amigable
3. Invite a continuar la conversación
4. No sea más de 200 palabras
5. Incluya información relevante de nuestra base de conocimientos

Respuesta:`,
          {
            from: phoneNumber,
            sessionId: 'fallback',
            phoneNumber: phoneNumber.replace('@c.us', '')
          }
        );
        
        if (aiResponse.success && aiResponse.content) {
          logger.info('✅ Generated intelligent fallback from knowledge base');
          return aiResponse.content;
        }
      }
      
      // If no knowledge base results, try to categorize the message and provide smart fallback
      const smartFallback = this.generateSmartGenericFallback(messageText);
      logger.info('🎯 Generated smart generic fallback');
      return smartFallback;
      
    } catch (error) {
      logger.error('Error generating intelligent fallback:', error);
      
      // Return smart generic fallback as last resort
      return this.generateSmartGenericFallback(originalMessage.body || '');
    }
  }
  
  private generateSmartGenericFallback(messageText: string): string {
    const message = messageText.toLowerCase();
    
    // Categorize message type and provide appropriate response
    if (message.includes('precio') || message.includes('costo') || message.includes('cuánto')) {
      return 'Hola! 💰 Entiendo que consultas sobre precios. Te conectaré con un especialista que puede darte información detallada sobre tarifas y servicios. Un momento por favor.';
    }
    
    if (message.includes('servicio') || message.includes('qué') || message.includes('cómo')) {
      return 'Hola! 🌟 Veo que tienes consultas sobre nuestros servicios. Te pondré en contacto con un experto que puede resolver todas tus dudas. En unos momentos te contactará.';
    }
    
    if (message.includes('ubicación') || message.includes('dónde') || message.includes('dirección')) {
      return 'Hola! 📍 Te ayudo con información de ubicación. Un agente especializado te contactará muy pronto con todos los detalles que necesitas.';
    }
    
    if (message.includes('horario') || message.includes('abierto') || message.includes('cerrado')) {
      return 'Hola! ⏰ Te ayudo con información sobre horarios. Un representante te contactará enseguida con todos los detalles.';
    }
    
    if (message.includes('hola') || message.includes('buenos') || message.includes('buenas')) {
      return 'Hola! 👋 Gracias por contactarnos. Te conectaré con uno de nuestros especialistas que podrá ayudarte de inmediato.';
    }
    
    if (message.includes('gracias') || message.includes('perfecto') || message.includes('ok')) {
      return 'De nada! 😊 Si tienes alguna otra consulta, no dudes en escribir. Un agente estará disponible para ayudarte.';
    }
    
    // Default intelligent fallback
    return 'Hola! 👋 He recibido tu mensaje y entiendo que necesitas información. Te pondré en contacto con uno de nuestros especialistas que podrá ayudarte de manera personalizada. En unos momentos te contactará. ¡Gracias por elegirnos!';
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down WhatsApp service...')
    
    // Stop health monitoring
    SessionHealthCheckService.stopMonitoring()
    
    const destroyPromises = Array.from(this.clients.keys()).map(sessionId =>
      this.destroySession(sessionId).catch(error =>
        logger.error(`Error destroying session ${sessionId} during shutdown:`, error)
      )
    )

    await Promise.all(destroyPromises)
    logger.info('WhatsApp service shutdown completed')
  }

  // === LocalAuth Synchronization Methods ===

  /**
   * Ensure the authentication directory exists
   */
  private async ensureAuthDirectoryExists(authDataPath: string): Promise<void> {
    try {
      if (!fs.existsSync(authDataPath)) {
        fs.mkdirSync(authDataPath, { recursive: true })
        logger.info(`🔐 Created auth directory: ${authDataPath}`)
      }
    } catch (error) {
      logger.error('Error creating auth directory:', error)
      throw error
    }
  }

  /**
   * Validate LocalAuth files for integrity
   */
  private async validateAuthFiles(sessionId: string, authDataPath: string): Promise<boolean> {
    try {
      const sessionAuthPath = path.join(authDataPath, `session-${sessionId}`)
      
      if (!fs.existsSync(sessionAuthPath)) {
        logger.debug(`🔍 No auth files found for session ${sessionId} (first time setup)`)
        return true // No files means clean slate, which is valid
      }

      // Check for essential auth files
      const essentialFiles = ['Default', 'RemoteAuth', 'Session Storage']
      let foundEssentialFiles = 0
      
      for (const fileName of essentialFiles) {
        const filePath = path.join(sessionAuthPath, fileName)
        if (fs.existsSync(filePath)) {
          foundEssentialFiles++
        }
      }

      // Check for common corruption indicators
      const hasLockFiles = await this.hasActiveLockFiles(sessionAuthPath)
      const hasValidStructure = foundEssentialFiles > 0
      
      const isValid = hasValidStructure && !hasLockFiles
      
      logger.debug(`🔍 Auth validation for ${sessionId}:`, {
        hasValidStructure,
        hasLockFiles,
        foundEssentialFiles,
        isValid
      })
      
      return isValid
    } catch (error) {
      logger.warn(`Error validating auth files for session ${sessionId}:`, error)
      return false // Assume invalid on error
    }
  }

  /**
   * Check for active lock files that indicate corruption
   */
  private async hasActiveLockFiles(sessionAuthPath: string): Promise<boolean> {
    try {
      const lockFiles = await this.findLockFiles(sessionAuthPath)
      
      // Check if any lock files are older than 5 minutes (likely abandoned)
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000)
      
      for (const lockFile of lockFiles) {
        const stats = fs.statSync(lockFile)
        if (stats.mtime.getTime() < fiveMinutesAgo) {
          return true // Found stale lock file
        }
      }
      
      return false
    } catch (error) {
      logger.debug('Error checking lock files:', error)
      return false
    }
  }

  /**
   * Find all lock files recursively
   */
  private async findLockFiles(dirPath: string, lockFiles: string[] = []): Promise<string[]> {
    try {
      if (!fs.existsSync(dirPath)) return lockFiles

      const items = fs.readdirSync(dirPath)
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item)
        const stat = fs.statSync(itemPath)
        
        if (stat.isDirectory()) {
          await this.findLockFiles(itemPath, lockFiles)
        } else if (item === 'LOCK' || item === 'lockfile' || item.endsWith('.lock')) {
          lockFiles.push(itemPath)
        }
      }
    } catch (error) {
      logger.debug(`Error finding lock files in ${dirPath}:`, error)
    }
    
    return lockFiles
  }

  /**
   * Clean up corrupted authentication files
   */
  private async cleanupCorruptedAuthFiles(sessionId: string, authDataPath: string): Promise<void> {
    try {
      const sessionAuthPath = path.join(authDataPath, `session-${sessionId}`)
      
      if (fs.existsSync(sessionAuthPath)) {
        logger.info(`🧹 Cleaning corrupted auth files for session ${sessionId}`)
        
        // Use the existing SessionCleanupUtil for safe cleanup
        await SessionCleanupUtil.cleanupSession(`auth-${sessionId}`, sessionAuthPath)
        
        // Update database to reflect cleanup
        await SessionPersistenceService.updateSessionStatus(sessionId, 'connecting', {
          metadata: {
            authCleanupPerformed: new Date().toISOString(),
            authCorruptionDetected: true
          }
        })
        
        logger.info(`✅ Corrupted auth files cleaned for session ${sessionId}`)
      }
    } catch (error) {
      logger.error(`Error cleaning corrupted auth files for session ${sessionId}:`, error)
      // Don't throw - allow session creation to continue
    }
  }

  /**
   * Get authentication file information
   */
  private async getAuthFileInfo(sessionId: string, authDataPath: string): Promise<{
    exists: boolean
    size: number
    modified: string | null
  }> {
    try {
      const sessionAuthPath = path.join(authDataPath, `session-${sessionId}`)
      
      if (!fs.existsSync(sessionAuthPath)) {
        return {
          exists: false,
          size: 0,
          modified: null
        }
      }
      
      const stats = fs.statSync(sessionAuthPath)
      const size = await this.getDirectorySize(sessionAuthPath)
      
      return {
        exists: true,
        size: Math.round(size / 1024), // Convert to KB
        modified: stats.mtime.toISOString()
      }
    } catch (error) {
      logger.debug(`Error getting auth file info for ${sessionId}:`, error)
      return {
        exists: false,
        size: 0,
        modified: null
      }
    }
  }

  /**
   * Calculate directory size recursively
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    try {
      let totalSize = 0
      
      const items = fs.readdirSync(dirPath)
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item)
        const stat = fs.statSync(itemPath)
        
        if (stat.isDirectory()) {
          totalSize += await this.getDirectorySize(itemPath)
        } else {
          totalSize += stat.size
        }
      }
      
      return totalSize
    } catch (error) {
      return 0
    }
  }

  /**
   * Sync auth state with database metadata
   */
  private async syncAuthStateWithDatabase(sessionId: string): Promise<void> {
    try {
      const authDataPath = path.resolve('./wwebjs_auth')
      const authFileInfo = await this.getAuthFileInfo(sessionId, authDataPath)
      const session = this.sessions.get(sessionId)
      
      if (session) {
        // Update metadata in database with current auth file state
        await SessionPersistenceService.updateSessionStatus(sessionId, session.status, {
          metadata: {
            authFileExists: authFileInfo.exists,
            authFileSize: authFileInfo.size,
            authFileModified: authFileInfo.modified,
            lastAuthSync: new Date().toISOString(),
            authDataPath: authDataPath
          }
        })
        
        logger.debug(`🔄 Auth state synced for session ${sessionId}`, authFileInfo)
      }
    } catch (error) {
      logger.error(`Error syncing auth state for session ${sessionId}:`, error)
      // Non-blocking error - continue execution
    }
  }

  /**
   * Recover session with LocalAuth validation
   */
  async recoverSessionWithAuthValidation(sessionId: string, persistedData: any): Promise<boolean> {
    try {
      logger.info(`🔄 Recovering session ${sessionId} with auth validation`)
      
      // Validate auth files before attempting recovery
      const authDataPath = path.resolve('./wwebjs_auth')
      const authIsValid = await this.validateAuthFiles(sessionId, authDataPath)
      
      if (!authIsValid) {
        logger.warn(`⚠️ Invalid auth detected for session ${sessionId} during recovery`)
        await this.cleanupCorruptedAuthFiles(sessionId, authDataPath)
        
        // Mark as requiring fresh authentication
        await SessionPersistenceService.updateSessionStatus(sessionId, 'connecting', {
          qrCode: null, // Clear old QR code
          metadata: {
            ...persistedData.metadata,
            recoveryAuthCleaned: new Date().toISOString()
          }
        })
      }
      
      // Proceed with normal session creation
      await this.createSession(sessionId)
      
      // Sync auth state after creation
      setTimeout(() => {
        this.syncAuthStateWithDatabase(sessionId)
      }, 5000) // Wait 5 seconds for client to initialize
      
      return true
    } catch (error) {
      logger.error(`Error recovering session ${sessionId} with auth validation:`, error)
      return false
    }
  }
}

export default new WhatsAppServiceSimple()
