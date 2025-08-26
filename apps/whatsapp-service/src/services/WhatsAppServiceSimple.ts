import { Client, LocalAuth, Message } from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import { logger } from '../utils/logger'
import { WhatsAppMessage, WhatsAppSession, WebhookPayload, SendMessageResponse } from '../types'
import { SessionCleanupUtil } from '../utils/sessionCleanup'

class WhatsAppServiceSimple {
  private clients: Map<string, Client> = new Map()
  private sessions: Map<string, WhatsAppSession> = new Map()
  private webhookUrl: string | undefined

  constructor() {
    this.webhookUrl = process.env.WEBHOOK_URL
  }

  async initialize(): Promise<void> {
    logger.info('WhatsApp service initialized successfully (no Redis)')
  }

  async createSession(sessionId: string): Promise<WhatsAppSession> {
    try {
      if (this.clients.has(sessionId)) {
        throw new Error(`Session ${sessionId} already exists`)
      }

      // Create WhatsApp client with session authentication
      const client = new Client({
        authStrategy: new LocalAuth({
          clientId: sessionId,
          dataPath: './sessions'
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

      // Store client and session
      this.clients.set(sessionId, client)
      this.sessions.set(sessionId, session)

      // Initialize the client
      client.initialize()

      logger.info(`WhatsApp session ${sessionId} created successfully`)
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
      logger.info(`Starting destruction of session ${sessionId}`)
      
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

      // Remover de la lista de sesiones
      this.sessions.delete(sessionId)
      
      // Usar la utilidad de limpieza segura para archivos
      try {
        await SessionCleanupUtil.cleanupSession(sessionId, './sessions')
        logger.info(`Session ${sessionId} files cleaned up successfully`)
      } catch (cleanupError) {
        logger.error(`Error cleaning up session ${sessionId} files:`, cleanupError)
        // No lanzar el error para permitir que la aplicación continúe
      }
      
      logger.info(`Session ${sessionId} destroyed successfully`)
    } catch (error) {
      logger.error(`Error destroying session ${sessionId}:`, error)
      
      // Aún así, intentar limpiar la sesión de las estructuras de datos
      this.clients.delete(sessionId)
      this.sessions.delete(sessionId)
      
      // Intentar limpieza de archivos como último recurso
      try {
        await SessionCleanupUtil.cleanupSession(sessionId, './sessions')
      } catch (cleanupError) {
        logger.error(`Final cleanup attempt failed for session ${sessionId}:`, cleanupError)
      }
      
      throw error
    }
  }

  private updateSessionStatus(sessionId: string, status: WhatsAppSession['status'], data?: any): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.status = status
      session.lastSeen = new Date()
      if (data) {
        Object.assign(session, data)
      }
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
      
      // Extract knowledge base IDs used (if available in thinking result)
      knowledgeBaseIdsUsed = thinkingResult.knowledgeBaseIds || [];
      
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
        }, 30000); // Wait 30 seconds before calculating success metrics
        
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
      const { default: AILearningService } = await import('./AILearningService');
      
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
      await AILearningService.saveTrainingInteraction({
        userMessage,
        aiResponse,
        knowledgeBaseIds,
        phoneNumber,
        sessionId,
        successScore: initialSuccessScore,
        contextMetrics,
        feedbackMetrics: {}, // Empty initially, can be updated later with user feedback
        timestamp: new Date()
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
    // Scale: 0-10000ms is good, 10000-30000ms is ok, >30000ms is slow
    if (responseTimeMs < 10000) {
      score += 0.1; // Fast response bonus
    } else if (responseTimeMs > 30000) {
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
      
      // Check if the phone number matches any lead with improved comparison
      let matchedLead: any = null
      const incomingClean = phoneNumber.replace(/[^0-9]/g, '')
      
      const isAllowed = leads.some(lead => {
        if (!lead.phone || !lead.whatsappAuthorized) return false
        
        // Clean lead phone number
        const leadPhoneClean = lead.phone.replace(/[^0-9]/g, '')
        
        // Try multiple comparison methods:
        // 1. Exact match
        if (leadPhoneClean === incomingClean) {
          matchedLead = lead
          logger.debug(`✅ Exact phone match: ${lead.phone} === ${phoneNumber}`);
          return true
        }
        
        // 2. Compare last 10 digits (for domestic numbers)
        const leadLast10 = leadPhoneClean.slice(-10)
        const incomingLast10 = incomingClean.slice(-10)
        if (leadLast10 === incomingLast10 && leadLast10.length === 10) {
          matchedLead = lead
          logger.debug(`✅ Last 10 digits match: ${lead.phone} ≈ ${phoneNumber}`);
          return true
        }
        
        // 3. Compare last 11 digits (for numbers with country code)
        const leadLast11 = leadPhoneClean.slice(-11)
        const incomingLast11 = incomingClean.slice(-11)
        if (leadLast11 === incomingLast11 && leadLast11.length === 11) {
          matchedLead = lead
          logger.debug(`✅ Last 11 digits match: ${lead.phone} ≈ ${phoneNumber}`);
          return true
        }
        
        // 4. Handle common international formats (remove country codes)
        if (leadPhoneClean.length >= 10 && incomingClean.length >= 10) {
          // Remove common country codes and compare
          const leadWithoutCountry = leadPhoneClean.replace(/^(1|52|34|54|55)/, '')
          const incomingWithoutCountry = incomingClean.replace(/^(1|52|34|54|55)/, '')
          
          if (leadWithoutCountry === incomingWithoutCountry && leadWithoutCountry.length >= 8) {
            matchedLead = lead
            logger.debug(`✅ Country code normalized match: ${lead.phone} ≈ ${phoneNumber}`);
            return true
          }
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
          const leadPhone = lead.phone.replace(/[^0-9]/g, '')
          const incomingPhone = phoneNumber.replace(/[^0-9]/g, '')
          const leadLast10 = leadPhone.slice(-10)
          const incomingLast10 = incomingPhone.slice(-10)
          return leadLast10 === incomingLast10
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
    
    const destroyPromises = Array.from(this.clients.keys()).map(sessionId =>
      this.destroySession(sessionId).catch(error =>
        logger.error(`Error destroying session ${sessionId} during shutdown:`, error)
      )
    )

    await Promise.all(destroyPromises)
    logger.info('WhatsApp service shutdown completed')
  }
}

export default new WhatsAppServiceSimple()
