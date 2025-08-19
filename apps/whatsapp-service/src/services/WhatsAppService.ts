import { Client, LocalAuth, Message } from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import logger from '../utils/logger'
import redis from '../utils/redis'
import { WhatsAppMessage, WhatsAppSession, WebhookPayload, SendMessageResponse } from '../types'

class WhatsAppService {
  private clients: Map<string, Client> = new Map()
  private sessions: Map<string, WhatsAppSession> = new Map()
  private webhookUrl: string | undefined

  constructor() {
    this.webhookUrl = process.env.WEBHOOK_URL
  }

  async initialize(): Promise<void> {
    try {
      // Try to connect to Redis, but don't fail if it's not available in development
      if (process.env.REDIS_URL && process.env.REDIS_URL !== 'redis://localhost:6379') {
        await redis.connect()
        logger.info('Connected to Redis')
      } else {
        logger.warn('Redis not configured or not available - running without Redis')
      }
      logger.info('WhatsApp service initialized successfully')
    } catch (error) {
      logger.warn('Redis connection failed, continuing without Redis:', error instanceof Error ? error.message : String(error))
    }
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
          headless: process.env.NODE_ENV === 'production',
          executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined,
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

      // Store in Redis
      await redis.setSession(sessionId, session)

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

      // Store QR code in Redis and session
      await redis.setQRCode(sessionId, qr)
      await this.updateSessionStatus(sessionId, 'connecting', { qrCode: qr })

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
      await redis.deleteQRCode(sessionId)
      await this.updateSessionStatus(sessionId, 'ready', { 
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
      await this.updateSessionStatus(sessionId, 'authenticated')
    })

    // Authentication failure event
    client.on('auth_failure', async (msg) => {
      logger.error(`Authentication failed for session ${sessionId}:`, msg)
      await redis.deleteQRCode(sessionId)
      await this.updateSessionStatus(sessionId, 'auth_failure')

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
      await this.updateSessionStatus(sessionId, 'disconnected')

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

        // Send webhook with message
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
    return this.sessions.get(sessionId) || await redis.getSession(sessionId)
  }

  async getAllSessions(): Promise<WhatsAppSession[]> {
    const sessions: WhatsAppSession[] = []
    
    // Get from memory
    this.sessions.forEach(session => sessions.push(session))
    
    // Get from Redis (for sessions not in memory)
    const redisSessions = await redis.getAllSessions()
    Object.values(redisSessions).forEach(session => {
      if (!sessions.find(s => s.id === session.id)) {
        sessions.push(session as WhatsAppSession)
      }
    })

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
      await redis.deleteSession(sessionId)
      await redis.deleteQRCode(sessionId)

      logger.info(`Session ${sessionId} destroyed successfully`)
    } catch (error) {
      logger.error(`Error destroying session ${sessionId}:`, error)
      throw error
    }
  }

  private async updateSessionStatus(sessionId: string, status: WhatsAppSession['status'], data?: any): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.status = status
      session.lastSeen = new Date()
      if (data) {
        Object.assign(session, data)
      }
      await redis.setSession(sessionId, session)
    }
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
    await redis.disconnect()
    
    logger.info('WhatsApp service shutdown completed')
  }
}

export default new WhatsAppService()
