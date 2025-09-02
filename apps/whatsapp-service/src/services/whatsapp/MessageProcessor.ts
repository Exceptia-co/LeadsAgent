/**
 * @fileoverview MessageProcessor - Handles WhatsApp message processing
 * Part of WhatsAppServiceSimple refactoring following SRP
 */

import type { Message } from 'whatsapp-web.js';
import { logger } from '../../utils/logger';
import { LogExecutionTime, SafeExecutor, isSuccess, isFailure } from '../../utils/decorators';
import { ErrorFactory } from '../../errors';
import { eventBus } from '../../events/EventBus';
import { serviceLocator } from '../../core/ServiceLocator';
import type { 
  IMessageProcessor,
  WhatsAppMessage, 
  SendMessageRequest,
  SendMessageResponse,
  SendMediaMessageRequest,
  Result
} from '../../types';

/**
 * MessageProcessor handles all message-related operations
 * Responsible for sending, receiving, and processing WhatsApp messages
 */
export class MessageProcessor implements IMessageProcessor {
  /**
   * Send a text message through WhatsApp
   */
  @LogExecutionTime({ operationId: 'send-message' })
  public async sendMessage(
    sessionId: string, 
    request: SendMessageRequest
  ): Promise<SendMessageResponse> {
    return SafeExecutor.execute(
      async () => {
        // Get session manager to access client
        const sessionManager = serviceLocator.get('sessionManager');
        if (!sessionManager) {
          throw ErrorFactory.whatsapp('Session manager not available', 'SERVICE_UNAVAILABLE', sessionId);
        }

        // Validate session is ready
        if (!sessionManager.isSessionReady(sessionId)) {
          throw ErrorFactory.session(`Session ${sessionId} is not ready for messaging`, sessionId);
        }

        // Get WhatsApp client
        const client = sessionManager.getClient(sessionId);
        if (!client) {
          throw ErrorFactory.session(`No active client for session ${sessionId}`, sessionId);
        }

        // Normalize phone number
        const normalizedNumber = this.normalizePhoneNumber(request.to);
        
        // Validate message content
        this.validateMessageContent(request.message);

        logger.info(`📤 Sending message from ${sessionId} to ${normalizedNumber}`);

        // Send the message
        const sentMessage = await client.sendMessage(normalizedNumber, request.message);

        // Create response
        const response: SendMessageResponse = {
          success: true,
          messageId: sentMessage.id.id || sentMessage.id._serialized,
        };

        // Emit message sent event
        await eventBus.publish('whatsapp:message-sent', {
          sessionId,
          messageId: response.messageId!,
          to: normalizedNumber,
          body: request.message,
          success: true,
          timestamp: new Date(),
        });

        logger.info(`✅ Message sent successfully: ${response.messageId}`);
        return response;
      },
      {
        operationName: 'send-message',
        context: { sessionId, to: request.to },
        timeout: 30000,
      }
    ).then(result => {
      if (isFailure(result)) {
        // Create error response
        const errorResponse: SendMessageResponse = {
          success: false,
          error: result.error.message,
        };

        // Emit failed message event
        eventBus.publish('whatsapp:message-sent', {
          sessionId,
          messageId: 'failed',
          to: request.to,
          body: request.message,
          success: false,
          timestamp: new Date(),
        }).catch(eventError => {
          logger.warn('Failed to emit message-sent event:', eventError);
        });

        return errorResponse;
      }
      return result.data;
    });
  }

  /**
   * Send a media message (image, audio, video, document)
   */
  @LogExecutionTime({ operationId: 'send-media-message' })
  public async sendMediaMessage(
    sessionId: string, 
    request: SendMediaMessageRequest
  ): Promise<SendMessageResponse> {
    return SafeExecutor.execute(
      async () => {
        // Get session manager to access client
        const sessionManager = serviceLocator.get('sessionManager');
        if (!sessionManager) {
          throw ErrorFactory.whatsapp('Session manager not available', 'SERVICE_UNAVAILABLE', sessionId);
        }

        // Validate session is ready
        if (!sessionManager.isSessionReady(sessionId)) {
          throw ErrorFactory.session(`Session ${sessionId} is not ready for messaging`, sessionId);
        }

        // Get WhatsApp client
        const client = sessionManager.getClient(sessionId);
        if (!client) {
          throw ErrorFactory.session(`No active client for session ${sessionId}`, sessionId);
        }

        // Normalize phone number
        const normalizedNumber = this.normalizePhoneNumber(request.to);
        
        // Validate media file
        await this.validateMediaFile(request.mediaPath, request.mediaType);

        logger.info(`📤 Sending media message from ${sessionId} to ${normalizedNumber}: ${request.mediaType}`);

        // Prepare media message
        const messageData: any = {
          media: request.mediaPath,
          caption: request.caption || '',
        };

        if (request.filename) {
          messageData.filename = request.filename;
        }

        // Send the media message
        const sentMessage = await client.sendMessage(normalizedNumber, messageData);

        // Create response
        const response: SendMessageResponse = {
          success: true,
          messageId: sentMessage.id.id || sentMessage.id._serialized,
        };

        // Emit message sent event
        await eventBus.publish('whatsapp:message-sent', {
          sessionId,
          messageId: response.messageId!,
          to: normalizedNumber,
          body: `[${request.mediaType.toUpperCase()}] ${request.caption || request.filename || 'Media file'}`,
          success: true,
          timestamp: new Date(),
        });

        logger.info(`✅ Media message sent successfully: ${response.messageId}`);
        return response;
      },
      {
        operationName: 'send-media-message',
        context: { sessionId, to: request.to, mediaType: request.mediaType },
        timeout: 60000, // Media uploads can take longer
      }
    ).then(result => {
      if (isFailure(result)) {
        // Create error response
        const errorResponse: SendMessageResponse = {
          success: false,
          error: result.error.message,
        };

        // Emit failed message event
        eventBus.publish('whatsapp:message-sent', {
          sessionId,
          messageId: 'failed',
          to: request.to,
          body: `[${request.mediaType.toUpperCase()}] ${request.caption || 'Media file'}`,
          success: false,
          timestamp: new Date(),
        }).catch(eventError => {
          logger.warn('Failed to emit message-sent event:', eventError);
        });

        return errorResponse;
      }
      return result.data;
    });
  }

  /**
   * Process an incoming WhatsApp message
   */
  @LogExecutionTime({ operationId: 'process-incoming-message' })
  public async processIncomingMessage(
    sessionId: string, 
    message: WhatsAppMessage
  ): Promise<void> {
    return SafeExecutor.execute(
      async () => {
        logger.info(`📨 Processing incoming message from ${message.from} in session ${sessionId}`);

        // Parse and enrich message data
        const enrichedMessage = await this.enrichMessageData(sessionId, message);

        // Emit message received event
        await eventBus.publish('whatsapp:message-received', {
          sessionId,
          messageId: enrichedMessage.id,
          from: enrichedMessage.from,
          to: enrichedMessage.to,
          body: enrichedMessage.body,
          type: enrichedMessage.type,
          timestamp: new Date(),
        });

        // Process message based on type and content
        await this.routeMessageForProcessing(sessionId, enrichedMessage);

        logger.debug(`✅ Message processed successfully: ${enrichedMessage.id}`);
      },
      {
        operationName: 'process-incoming-message',
        context: { sessionId, messageId: message.id, from: message.from },
        timeout: 15000,
      }
    ).then(result => {
      if (isFailure(result)) {
        logger.error(`❌ Failed to process message ${message.id}:`, result.error);
        throw result.error;
      }
    });
  }

  /**
   * Convert WhatsApp Web Message to our WhatsAppMessage format
   */
  public convertWhatsAppMessage(sessionId: string, message: any): WhatsAppMessage {
    return {
      id: message.id?.id || message.id?._serialized || message.id || 'unknown',
      from: message.from || 'unknown',
      to: message.to || sessionId,
      body: message.body || '',
      timestamp: (message.timestamp || Date.now()) * (message.timestamp < 2000000000 ? 1000 : 1), // Convert to milliseconds if needed
      type: this.determineMessageType(message),
      mediaUrl: message.hasMedia ? `media://${message.id?._serialized || message.id}` : undefined,
      isGroup: message.fromMe ? false : (message.isGroup || false),
      fromMe: message.fromMe || false,
    };
  }

  /**
   * Get message statistics for a session
   */
  public getMessageStats(sessionId: string): {
    totalSent: number;
    totalReceived: number;
    totalFailed: number;
    mediaMessages: number;
    lastMessageTime?: Date;
  } {
    // This would typically be retrieved from a database or cache
    // For now, return default values
    return {
      totalSent: 0,
      totalReceived: 0,
      totalFailed: 0,
      mediaMessages: 0,
      lastMessageTime: new Date(),
    };
  }

  /**
   * Normalize phone number for WhatsApp format
   */
  private normalizePhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // If number doesn't end with @c.us, add it
    if (!phoneNumber.includes('@c.us')) {
      return `${cleaned}@c.us`;
    }
    
    return phoneNumber;
  }

  /**
   * Validate message content
   */
  private validateMessageContent(content: string): void {
    if (!content || content.trim().length === 0) {
      throw ErrorFactory.validation('Message content cannot be empty', 'message');
    }

    if (content.length > 4096) {
      throw ErrorFactory.validation('Message content exceeds maximum length (4096 characters)', 'message', content.length);
    }

    // Check for potentially problematic content
    const suspiciousPatterns = [
      /javascript:/i,
      /<script/i,
      /eval\(/i,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(content)) {
        throw ErrorFactory.validation('Message contains potentially unsafe content', 'message', content);
      }
    }
  }

  /**
   * Validate media file
   */
  private async validateMediaFile(mediaPath: string, mediaType: string): Promise<void> {
    // This would typically involve:
    // 1. Check if file exists
    // 2. Validate file type matches declared type
    // 3. Check file size limits
    // 4. Scan for malware (in production)
    
    if (!mediaPath) {
      throw ErrorFactory.validation('Media path is required', 'mediaPath');
    }

    const allowedTypes = ['image', 'audio', 'video', 'document'];
    if (!allowedTypes.includes(mediaType)) {
      throw ErrorFactory.validation('Unsupported media type', 'mediaType', mediaType);
    }

    // TODO: Implement actual file validation
    logger.debug(`📎 Validating media file: ${mediaPath} (${mediaType})`);
  }

  /**
   * Enrich message data with additional context
   */
  private async enrichMessageData(
    sessionId: string, 
    message: WhatsAppMessage
  ): Promise<WhatsAppMessage> {
    // Add any enrichment logic here
    // For example: contact resolution, spam detection, etc.
    
    return {
      ...message,
      // Add any enriched fields
    };
  }

  /**
   * Route message for further processing based on content and type
   */
  private async routeMessageForProcessing(
    sessionId: string, 
    message: WhatsAppMessage
  ): Promise<void> {
    try {
      // Example routing logic:
      // 1. Check if message needs AI processing
      // 2. Route to appropriate handler
      // 3. Apply business rules
      
      logger.debug(`🔄 Routing message for processing: ${message.id}`);

      // This is where you'd integrate with:
      // - AI services for automatic responses
      // - Business logic for lead processing
      // - External webhooks
      // - Database persistence
      
    } catch (error) {
      logger.warn(`⚠️ Error during message routing for ${message.id}:`, error);
      // Don't throw here to avoid failing the entire message processing
    }
  }

  /**
   * Determine message type from WhatsApp Web Message
   */
  private determineMessageType(message: Message): WhatsAppMessage['type'] {
    if (message.hasMedia) {
      const mediaType = message.type;
      switch (mediaType) {
        case 'image':
          return 'image';
        case 'audio':
        case 'ptt': // Push-to-talk voice message
          return 'audio';
        case 'video':
          return 'video';
        case 'document':
          return 'document';
        default:
          return 'document'; // Default for unknown media types
      }
    }
    
    return 'text';
  }
}
