import { Controller, Post, Body, Headers, Logger, BadRequestException } from '@nestjs/common'
import { WhatsAppService } from './whatsapp.service'

interface WebhookPayload {
  event: 'message' | 'status_change' | 'qr_updated' | 'authenticated' | 'disconnected'
  sessionId: string
  data: any
  timestamp: string
}

@Controller('whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name)

  constructor(private readonly whatsAppService: WhatsAppService) {}

  @Post('webhook')
  async handleWebhook(
    @Body() payload: WebhookPayload,
    @Headers('x-whatsapp-service') serviceHeader: string
  ) {
    this.logger.log(`Webhook received: ${payload.event} for session ${payload.sessionId}`)

    // Validate that request comes from WhatsApp service
    if (!serviceHeader) {
      throw new BadRequestException('Missing WhatsApp service header')
    }

    try {
      switch (payload.event) {
        case 'message':
          await this.whatsAppService.handleIncomingMessage(payload.sessionId, payload.data)
          break
          
        case 'authenticated':
          await this.whatsAppService.handleSessionAuthenticated(payload.sessionId, payload.data)
          break
          
        case 'disconnected':
          await this.whatsAppService.handleSessionDisconnected(payload.sessionId, payload.data)
          break
          
        case 'status_change':
          await this.whatsAppService.handleStatusChange(payload.sessionId, payload.data)
          break
          
        case 'qr_updated':
          // QR code updated - could be stored or forwarded to frontend
          this.logger.log(`QR code updated for session ${payload.sessionId}`)
          break
          
        default:
          this.logger.warn(`Unhandled webhook event: ${payload.event}`)
      }

      return { success: true, message: 'Webhook processed successfully' }
    } catch (error) {
      this.logger.error('Error processing webhook:', error)
      throw error
    }
  }
}
