import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { WhitelistService } from './whitelist.service'
import { LeadStatus, MessageType, MessageDirection, MessageStatus } from '@prisma/client'

interface WhatsAppMessage {
  id: string
  from: string
  to: string
  body: string
  timestamp: number
  type: string
  isGroup: boolean
  fromMe: boolean
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name)

  constructor(
    private prisma: PrismaService,
    private whitelistService: WhitelistService
  ) {}

  async handleIncomingMessage(sessionId: string, messageData: WhatsAppMessage): Promise<void> {
    try {
      // Skip messages from self
      if (messageData.fromMe) {
        return
      }

      // Skip group messages for now
      if (messageData.isGroup) {
        this.logger.log('Skipping group message')
        return
      }

      // Extract phone number (remove @c.us suffix)
      const phoneNumber = messageData.from.replace('@c.us', '')
      
      this.logger.log(`Processing message from ${phoneNumber}: ${messageData.body.substring(0, 50)}...`)

      // 🔒 CRITICAL: Check whitelist authorization BEFORE creating any leads
      const whitelistResult = await this.whitelistService.isNumberAuthorized(
        phoneNumber, 
        sessionId, 
        messageData.body
      )

      if (!whitelistResult.allowed) {
        this.logger.warn(`🚫 Message from ${phoneNumber} BLOCKED by whitelist: ${whitelistResult.reason}`)
        // Exit early - DO NOT create lead or store message
        return
      }

      this.logger.log(`✅ Message from ${phoneNumber} AUTHORIZED: ${whitelistResult.reason}`)

      // Find existing lead (whitelist check already verified this is safe)
      let lead = await this.prisma.lead.findUnique({
        where: { phone: phoneNumber },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      })

      // Create lead ONLY if authorized and doesn't exist
      if (!lead) {
        // Lead creation is now safe because whitelist was checked first
        lead = await this.prisma.lead.create({
          data: {
            name: `Lead ${phoneNumber}`, // Default name, can be updated later
            phone: phoneNumber,
            status: LeadStatus.NUEVO,
            whatsappAuthorized: whitelistResult.leadInfo?.whatsappAuthorized ?? true, // Default to authorized if passed whitelist
            source: 'whatsapp-inbound'
          },
          include: {
            messages: true
          }
        })

        this.logger.log(`✅ Created new AUTHORIZED lead for ${phoneNumber}`)
      }

      // Store message - now safe because lead is authorized
      await this.prisma.message.create({
        data: {
          leadId: lead.id,
          content: messageData.body,
          messageType: MessageType.TEXT,
          direction: MessageDirection.INBOUND,
          status: MessageStatus.READ,
          whatsappMessageId: messageData.id,
          createdAt: new Date(messageData.timestamp)
        }
      })

      // Update lead status and contact time
      if (lead.status === LeadStatus.NUEVO) {
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: { 
            status: LeadStatus.CONTACTADO,
            lastContact: new Date()
          }
        })
      } else {
        // Just update last contact time
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: { lastContact: new Date() }
        })
      }

      this.logger.log(`✅ Message stored for authorized lead ${lead.id}`)
      
    } catch (error) {
      this.logger.error('❌ Error handling incoming message:', error)
    }
  }

  async handleSessionAuthenticated(sessionId: string, data: any): Promise<void> {
    this.logger.log(`Session ${sessionId} authenticated successfully`)
    // TODO: Update session status in database
    // TODO: Notify dashboard via WebSocket/SSE
  }

  async handleSessionDisconnected(sessionId: string, data: any): Promise<void> {
    this.logger.log(`Session ${sessionId} disconnected: ${data.reason}`)
    // TODO: Update session status in database
    // TODO: Notify dashboard
  }

  async handleStatusChange(sessionId: string, data: any): Promise<void> {
    this.logger.log(`Session ${sessionId} status changed:`, data)
    // TODO: Update session status in database
  }

  // Method to send message through WhatsApp service
  async sendMessage(sessionId: string, to: string, message: string): Promise<boolean> {
    try {
      const whatsappServiceUrl = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3002'
      
      const response = await fetch(`${whatsappServiceUrl}/api/sessions/${sessionId}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ to, message })
      })

      const result = await response.json()
      
      if (result.success) {
        this.logger.log(`Message sent successfully to ${to}`)
        
        // Store outgoing message in database
        const lead = await this.prisma.lead.findUnique({
          where: { phone: to }
        })

        if (lead) {
          await this.prisma.message.create({
            data: {
              leadId: lead.id,
              content: message,
              messageType: MessageType.TEXT,
              direction: MessageDirection.OUTBOUND,
              status: MessageStatus.SENT,
              createdAt: new Date()
            }
          })

          // Update last contact time
          await this.prisma.lead.update({
            where: { id: lead.id },
            data: { lastContact: new Date() }
          })
        }
        
        return true
      } else {
        this.logger.error(`Failed to send message: ${result.error}`)
        return false
      }
    } catch (error) {
      this.logger.error('Error sending message:', error)
      return false
    }
  }
}
