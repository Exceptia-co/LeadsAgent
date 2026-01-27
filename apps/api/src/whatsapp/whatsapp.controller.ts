import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Logger,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhitelistService } from './whitelist.service';

interface SendMessageDto {
  sessionId: string;
  phone: string;
  message: string;
  type?: 'text' | 'image' | 'document' | 'audio' | 'video';
}

interface WebhookPayload {
  event:
    | 'message'
    | 'status_change'
    | 'qr_updated'
    | 'authenticated'
    | 'disconnected';
  sessionId: string;
  data: any;
  timestamp: string;
}

@Controller('whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly whatsAppService: WhatsAppService,
    private readonly whitelistService: WhitelistService,
  ) {}

  @Post('webhook')
  async handleWebhook(
    @Body() payload: WebhookPayload,
    @Headers('x-whatsapp-service') serviceHeader: string,
  ) {
    this.logger.log(
      `Webhook received: ${payload.event} for session ${payload.sessionId}`,
    );

    // Validate that request comes from WhatsApp service
    if (!serviceHeader) {
      throw new BadRequestException('Missing WhatsApp service header');
    }

    try {
      switch (payload.event) {
        case 'message':
          await this.whatsAppService.handleIncomingMessage(
            payload.sessionId,
            payload.data,
          );
          break;

        case 'authenticated':
          await this.whatsAppService.handleSessionAuthenticated(
            payload.sessionId,
            payload.data,
          );
          break;

        case 'disconnected':
          await this.whatsAppService.handleSessionDisconnected(
            payload.sessionId,
            payload.data,
          );
          break;

        case 'status_change':
          await this.whatsAppService.handleStatusChange(
            payload.sessionId,
            payload.data,
          );
          break;

        case 'qr_updated':
          // QR code updated - could be stored or forwarded to frontend
          this.logger.log(`QR code updated for session ${payload.sessionId}`);
          break;

        default:
          this.logger.warn(`Unhandled webhook event: ${payload.event}`);
      }

      return { success: true, message: 'Webhook processed successfully' };
    } catch (error) {
      this.logger.error('Error processing webhook:', error);
      throw error;
    }
  }

  @Post('send')
  async sendMessage(@Body() sendMessageDto: SendMessageDto) {
    this.logger.log(
      `Sending message to ${sendMessageDto.phone} via session ${sendMessageDto.sessionId}`,
    );

    try {
      const success = await this.whatsAppService.sendMessage(
        sendMessageDto.sessionId,
        sendMessageDto.phone,
        sendMessageDto.message,
      );

      if (success) {
        return { success: true, message: 'Message sent successfully' };
      } else {
        throw new BadRequestException('Failed to send message');
      }
    } catch (error) {
      this.logger.error('Error sending message:', error);
      throw new BadRequestException('Failed to send message: ' + error.message);
    }
  }

  @Get('whitelist/stats')
  async getWhitelistStats(@Query('days') days?: string) {
    try {
      const daysNumber = days ? parseInt(days) : 7;
      const stats = await this.whitelistService.getWhitelistStats(daysNumber);

      return {
        success: true,
        data: stats,
        message: `Whitelist statistics for the last ${daysNumber} days`,
      };
    } catch (error) {
      this.logger.error('Error getting whitelist stats:', error);
      throw new BadRequestException('Failed to get whitelist statistics');
    }
  }

  @Post('whitelist/authorize')
  async updateLeadAuthorization(
    @Body() body: { leadId: string; authorized: boolean; reason?: string },
  ) {
    try {
      const success = await this.whitelistService.updateLeadAuthorization(
        body.leadId,
        body.authorized,
        body.reason,
      );

      if (success) {
        return {
          success: true,
          message: `Lead authorization updated to: ${body.authorized}`,
        };
      } else {
        throw new BadRequestException('Failed to update lead authorization');
      }
    } catch (error) {
      this.logger.error('Error updating lead authorization:', error);
      throw new BadRequestException(
        'Failed to update lead authorization: ' + error.message,
      );
    }
  }
}
