import { Client, LocalAuth, Message } from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import { logger } from '../utils/logger'
import { WhatsAppMessage, WhatsAppSession, WebhookPayload, SendMessageResponse } from '../types'

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
      const client = this.clients.get(sessionId)
      if (client) {
        await client.destroy()
        this.clients.delete(sessionId)
      }

      this.sessions.delete(sessionId)
      logger.info(`Session ${sessionId} destroyed successfully`)
    } catch (error) {
      logger.error(`Error destroying session ${sessionId}:`, error)
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
    try {
      logger.info(`Processing message with AI for session ${sessionId}`);
      
      // Import AI service dynamically to avoid circular dependencies
      const { default: AIService } = await import('./AIService');
      const { default: DatabaseService } = await import('./DatabaseService');
      
      // Get phone number without WhatsApp suffix
      const phoneNumber = whatsappMessage.from.replace('@c.us', '');
      
      // Get conversation history for context (only last message for efficiency)
      const conversationHistory = await DatabaseService.getRecentContext(phoneNumber, sessionId, 1);
      
      // Generate AI response
      const aiResponse = await AIService.generateResponse(whatsappMessage.body, {
        from: whatsappMessage.from,
        sessionId: sessionId,
        conversationHistory: conversationHistory,
        phoneNumber: phoneNumber
      });
      
      if (aiResponse.success && aiResponse.content) {
        // Add humanized delay before responding
        await this.addHumanizedDelay(whatsappMessage.body);
        
        // Send AI response back to WhatsApp
        await originalMessage.reply(aiResponse.content);
        
        // Save conversation to database
        await DatabaseService.saveConversation({
          sessionId: sessionId,
          phoneNumber: phoneNumber,
          messageText: whatsappMessage.body,
          responseText: aiResponse.content,
          messageType: whatsappMessage.type,
          aiProvider: aiResponse.provider,
          tokensUsed: aiResponse.tokensUsed || 0,
          isFromUser: true
        });
        
        // Also save our response
        await DatabaseService.saveConversation({
          sessionId: sessionId,
          phoneNumber: phoneNumber,
          messageText: aiResponse.content,
          responseText: undefined,
          messageType: 'text',
          aiProvider: aiResponse.provider,
          tokensUsed: 0,
          isFromUser: false
        });
        
        logger.info(`AI response sent successfully to ${phoneNumber}:`, {
          messageLength: aiResponse.content.length,
          provider: aiResponse.provider,
          tokensUsed: aiResponse.tokensUsed
        });
      } else {
        logger.error('Failed to generate AI response:', aiResponse.error);
        
        // Send fallback message
        await originalMessage.reply('Disculpa, en este momento no puedo procesar tu mensaje. Un agente se pondrá en contacto contigo pronto. 😊');
      }
    } catch (error) {
      logger.error('Error in processMessageWithAI:', error);
      
      // Send fallback message on error
      try {
        await originalMessage.reply('Gracias por tu mensaje. Un representante te contactará pronto. 👍');
      } catch (replyError) {
        logger.error('Error sending fallback message:', replyError);
      }
    }
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
      
      // Check if the phone number matches any lead
      let matchedLead: any = null
      const isAllowed = leads.some(lead => {
        if (!lead.phone || !lead.whatsappAuthorized) return false
        
        // Clean both numbers for comparison
        const leadPhone = lead.phone.replace(/[^0-9]/g, '')
        const incomingPhone = phoneNumber.replace(/[^0-9]/g, '')
        
        // Compare last 10 digits (to handle country codes)
        const leadLast10 = leadPhone.slice(-10)
        const incomingLast10 = incomingPhone.slice(-10)
        
        if (leadLast10 === incomingLast10) {
          matchedLead = lead
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
