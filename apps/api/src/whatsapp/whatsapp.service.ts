import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
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

  constructor(private prisma: PrismaService) {}

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

      // Find or create lead
      let lead = await this.prisma.lead.findUnique({
        where: { phone: phoneNumber },
        include: {
          messages: {
            orderBy: { timestamp: 'desc' },
            take: 1
          }
        }
      })

      if (!lead) {
        // Create new lead
        lead = await this.prisma.lead.create({
          data: {
            name: `Lead ${phoneNumber}`, // Default name, can be updated later
            phone: phoneNumber,
            status: LeadStatus.NUEVO
          },
          include: {
            messages: true
          }
        })

        this.logger.log(`Created new lead for ${phoneNumber}`)
      }

      // Store message directly associated with the lead
      await this.prisma.message.create({
        data: {
          leadId: lead.id,
          content: messageData.body,
          type: MessageType.TEXT,
          direction: MessageDirection.INBOUND,
          status: MessageStatus.READ,
          timestamp: new Date(messageData.timestamp),
          externalId: messageData.id,
          vendor: 'whatsapp'
        }
      })

      // Update lead status if it's the first message and currently NUEVO
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

      this.logger.log(`Message stored for lead ${lead.id}`)

      // TODO: Trigger AI analysis for lead classification
      // TODO: Generate automatic responses if configured
      
    } catch (error) {
      this.logger.error('Error handling incoming message:', error)
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
              type: MessageType.TEXT,
              direction: MessageDirection.OUTBOUND,
              status: MessageStatus.SENT,
              timestamp: new Date(),
              vendor: 'whatsapp'
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
