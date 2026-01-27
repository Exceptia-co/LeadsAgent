/**
 * @fileoverview EventHandler - Handles WhatsApp client events
 * Part of WhatsAppServiceSimple refactoring following SRP
 */

import type { Client } from 'whatsapp-web.js';
import { Message, MessageAck } from 'whatsapp-web.js';
import { logger } from '../../utils/logger';
import { LogExecutionTime, SafeExecutor } from '../../utils/decorators';
import { ErrorFactory } from '../../errors';
import { eventBus } from '../../events/EventBus';
import { serviceLocator } from '../../core/ServiceLocator';
import type { IEventHandler, WhatsAppMessage, SessionStatus } from '../../types';

/**
 * EventHandler manages WhatsApp client event listeners
 * Responsible for setting up and handling all WhatsApp Web.js events
 */
export class EventHandler implements IEventHandler {
  private eventListeners: Map<string, Set<Function>> = new Map();

  /**
   * Setup all event listeners for a WhatsApp client
   */
  public setupEventListeners(sessionId: string, client: Client): void {
    logger.info(`🔧 Setting up event listeners for session ${sessionId}`);

    try {
      // Store listeners for cleanup
      const listeners = new Set<Function>();
      this.eventListeners.set(sessionId, listeners);

      // Ready event
      const onReady = (...args: any[]) => {
        this.handleReady(sessionId).catch(error => {
          logger.error(`Error in ready handler for session ${sessionId}:`, error);
        });
      };
      client.on('ready', onReady);
      listeners.add(onReady);

      // Authentication events
      const onQR = (...args: any[]) => {
        const qr = args[0] as string;
        this.handleQR(sessionId, qr).catch(error => {
          logger.error(`Error in QR handler for session ${sessionId}:`, error);
        });
      };
      client.on('qr', onQR);
      listeners.add(onQR);

      const onAuthenticated = (...args: any[]) => {
        this.handleAuthenticated(sessionId).catch(error => {
          logger.error(`Error in authenticated handler for session ${sessionId}:`, error);
        });
      };
      client.on('authenticated', onAuthenticated);
      listeners.add(onAuthenticated);

      const onAuthFailure = (...args: any[]) => {
        const msg = args[0] as string;
        this.handleAuthFailure(sessionId, msg).catch(error => {
          logger.error(`Error in auth failure handler for session ${sessionId}:`, error);
        });
      };
      client.on('auth_failure', onAuthFailure);
      listeners.add(onAuthFailure);

      // Connection events
      const onDisconnected = (...args: any[]) => {
        const reason = args[0] as string;
        this.handleDisconnected(sessionId, reason).catch(error => {
          logger.error(`Error in disconnected handler for session ${sessionId}:`, error);
        });
      };
      client.on('disconnected', onDisconnected);
      listeners.add(onDisconnected);

      // Message events
      const onMessage = (...args: any[]) => {
        const message = args[0] as Message;
        this.handleMessage(sessionId, message).catch(error => {
          logger.error(`Error in message handler for session ${sessionId}:`, error);
        });
      };
      client.on('message', onMessage);
      listeners.add(onMessage);

      const onMessageCreate = (...args: any[]) => {
        const message = args[0] as Message;
        this.handleMessageCreate(sessionId, message).catch(error => {
          logger.error(`Error in message create handler for session ${sessionId}:`, error);
        });
      };
      client.on('message_create', onMessageCreate);
      listeners.add(onMessageCreate);

      const onMessageAck = (...args: any[]) => {
        const message = args[0] as Message;
        const ack = args[1] as MessageAck;
        this.handleMessageAck(sessionId, message, ack).catch(error => {
          logger.error(`Error in message ack handler for session ${sessionId}:`, error);
        });
      };
      client.on('message_ack', onMessageAck);
      listeners.add(onMessageAck);

      // Group events
      const onGroupJoin = (...args: any[]) => {
        const notification = args[0];
        this.handleGroupJoin(sessionId, notification).catch(error => {
          logger.error(`Error in group join handler for session ${sessionId}:`, error);
        });
      };
      client.on('group_join', onGroupJoin);
      listeners.add(onGroupJoin);

      const onGroupLeave = (...args: any[]) => {
        const notification = args[0];
        this.handleGroupLeave(sessionId, notification).catch(error => {
          logger.error(`Error in group leave handler for session ${sessionId}:`, error);
        });
      };
      client.on('group_leave', onGroupLeave);
      listeners.add(onGroupLeave);

      // Loading state events
      const onLoadingScreen = (...args: any[]) => {
        const percent = args[0] as number;
        const message = args[1] as string;
        this.handleLoadingScreen(sessionId, percent, message).catch(error => {
          logger.error(`Error in loading screen handler for session ${sessionId}:`, error);
        });
      };
      client.on('loading_screen', onLoadingScreen);
      listeners.add(onLoadingScreen);

      logger.info(`✅ Event listeners setup completed for session ${sessionId}`);
    } catch (error) {
      logger.error(`❌ Failed to setup event listeners for session ${sessionId}:`, error);
      throw ErrorFactory.whatsapp(
        'Failed to setup event listeners',
        'EVENT_SETUP_FAILED',
        sessionId,
        error
      );
    }
  }

  /**
   * Remove all event listeners for a session
   */
  public removeEventListeners(sessionId: string, client: Client): void {
    logger.info(`🧹 Removing event listeners for session ${sessionId}`);

    try {
      const listeners = this.eventListeners.get(sessionId);
      if (listeners) {
        // Remove all listeners
        listeners.forEach(listener => {
          client.removeAllListeners();
        });

        // Clear stored listeners
        this.eventListeners.delete(sessionId);

        logger.info(`✅ Event listeners removed for session ${sessionId}`);
      }
    } catch (error) {
      logger.warn(`⚠️ Error removing event listeners for session ${sessionId}:`, error);
    }
  }

  /**
   * Create a wrapped event listener with error handling
   */
  private createEventListener(eventName: string, sessionId: string, handler: Function): Function {
    return async (...args: any[]) => {
      try {
        await handler(...args);
      } catch (error) {
        logger.error(`❌ Error in ${eventName} event handler for session ${sessionId}:`, error);

        // Emit error event
        eventBus
          .publish('whatsapp:event-error', {
            sessionId,
            eventName,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date(),
          })
          .catch(eventError => {
            logger.warn('Failed to emit event-error:', eventError);
          });
      }
    };
  }

  /**
   * Handle client ready event
   */
  @LogExecutionTime({ operationId: 'handle-ready' })
  private async handleReady(sessionId: string, clientInfo?: any): Promise<void> {
    logger.info(`🟢 WhatsApp client ready for session ${sessionId}`);

    // Update session status
    const sessionManager = serviceLocator.get('sessionManager');
    if (sessionManager) {
      await sessionManager.updateSessionStatus(sessionId, 'ready');
    }

    // Emit ready event
    await eventBus.publish('whatsapp:session-ready', {
      sessionId,
      phoneNumber: clientInfo?.wid?.user || 'unknown',
      clientInfo: clientInfo || {},
      timestamp: new Date(),
    });
  }

  /**
   * Handle QR code generation event
   */
  @LogExecutionTime({ operationId: 'handle-qr' })
  private async handleQR(sessionId: string, qrCode: string): Promise<void> {
    logger.info(`📱 QR code generated for session ${sessionId}`);

    // Update session status
    const sessionManager = serviceLocator.get('sessionManager');
    if (sessionManager) {
      await sessionManager.updateSessionStatus(sessionId, 'waiting_qr');
    }

    // Emit QR event
    await eventBus.publish('whatsapp:qr-received', {
      sessionId,
      qrCode,
      timestamp: new Date(),
    });
  }

  /**
   * Handle authentication success event
   */
  @LogExecutionTime({ operationId: 'handle-authenticated' })
  private async handleAuthenticated(sessionId: string, clientInfo?: any): Promise<void> {
    logger.info(`🔐 Authentication successful for session ${sessionId}`);

    // Update session status
    const sessionManager = serviceLocator.get('sessionManager');
    if (sessionManager) {
      await sessionManager.updateSessionStatus(sessionId, 'authenticated');
    }

    // Emit authenticated event
    await eventBus.publish('whatsapp:session-authenticated', {
      sessionId,
      phoneNumber: clientInfo?.wid?.user || 'unknown',
      clientInfo: clientInfo || {},
      timestamp: new Date(),
    });
  }

  /**
   * Handle authentication failure event
   */
  @LogExecutionTime({ operationId: 'handle-auth-failure' })
  private async handleAuthFailure(sessionId: string, message: string): Promise<void> {
    logger.error(`🔒 Authentication failed for session ${sessionId}: ${message}`);

    // Update session status
    const sessionManager = serviceLocator.get('sessionManager');
    if (sessionManager) {
      await sessionManager.updateSessionStatus(sessionId, 'auth_failed');
    }

    // Emit auth failure event
    await eventBus.publish('whatsapp:session-auth-failed', {
      sessionId,
      reason: message,
      timestamp: new Date(),
    });
  }

  /**
   * Handle disconnection event
   */
  @LogExecutionTime({ operationId: 'handle-disconnected' })
  private async handleDisconnected(sessionId: string, reason: string): Promise<void> {
    logger.warn(`🔌 Session ${sessionId} disconnected: ${reason}`);

    // Update session status
    const sessionManager = serviceLocator.get('sessionManager');
    if (sessionManager) {
      await sessionManager.updateSessionStatus(sessionId, 'disconnected');
    }

    // Emit disconnected event
    await eventBus.publish('whatsapp:session-disconnected', {
      sessionId,
      reason,
      timestamp: new Date(),
    });

    // Try to reconnect if it's not a clean shutdown
    if (reason !== 'NAVIGATION' && reason !== 'LOGOUT') {
      logger.info(`🔄 Attempting to reconnect session ${sessionId}...`);

      // Get connection manager for reconnection
      const connectionManager = serviceLocator.get('connectionManager');
      if (connectionManager && sessionManager) {
        try {
          await connectionManager.reconnect(sessionId);
        } catch (error) {
          logger.error(`❌ Failed to reconnect session ${sessionId}:`, error);
        }
      }
    }
  }

  /**
   * Handle incoming message event
   */
  @LogExecutionTime({ operationId: 'handle-message' })
  private async handleMessage(sessionId: string, message: Message): Promise<void> {
    try {
      // Skip our own messages to avoid loops
      if (message.fromMe) {
        return;
      }

      logger.info(`📨 Received message in session ${sessionId} from ${message.from}`);

      // Get message processor
      const messageProcessor = serviceLocator.get('messageProcessor');
      if (!messageProcessor) {
        logger.warn(`⚠️ No message processor available for session ${sessionId}`);
        return;
      }

      // Convert to our message format
      const whatsAppMessage: WhatsAppMessage = {
        id: message.id._serialized,
        from: message.from,
        to: message.to,
        body: message.body,
        timestamp: message.timestamp,
        type: message.type as any,
        mediaUrl: message.hasMedia ? (message as any).mediaUrl : undefined,
        isGroup: message.from.includes('@g.us'),
        fromMe: message.fromMe,
      };

      // Process the message
      await messageProcessor.processIncomingMessage(sessionId, whatsAppMessage);
    } catch (error) {
      logger.error(`❌ Error handling message in session ${sessionId}:`, error);
    }
  }

  /**
   * Handle message creation event (sent messages)
   */
  @LogExecutionTime({ operationId: 'handle-message-create' })
  private async handleMessageCreate(sessionId: string, message: Message): Promise<void> {
    try {
      // Only handle our own messages
      if (!message.fromMe) {
        return;
      }

      logger.debug(`📤 Message created in session ${sessionId}: ${message.id._serialized}`);

      // This event can be used for tracking sent messages
      // or implementing delivery confirmations
    } catch (error) {
      logger.error(`❌ Error handling message create in session ${sessionId}:`, error);
    }
  }

  /**
   * Handle message acknowledgment event
   */
  @LogExecutionTime({ operationId: 'handle-message-ack' })
  private async handleMessageAck(
    sessionId: string,
    message: Message,
    ack: MessageAck
  ): Promise<void> {
    try {
      const ackStatus = this.getAckStatus(ack);
      logger.debug(`📋 Message ${message.id._serialized} acknowledgment: ${ackStatus}`);

      // Emit message acknowledgment event
      await eventBus.publish('whatsapp:message-ack', {
        sessionId,
        messageId: message.id._serialized,
        ackType: ackStatus,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error(`❌ Error handling message ack in session ${sessionId}:`, error);
    }
  }

  /**
   * Handle group join event
   */
  @LogExecutionTime({ operationId: 'handle-group-join' })
  private async handleGroupJoin(sessionId: string, notification: any): Promise<void> {
    try {
      logger.info(`👥 Group join event in session ${sessionId}:`, notification);

      // Emit group join event
      await eventBus.publish('whatsapp:group-join', {
        sessionId,
        groupId: notification.chatId,
        participants: notification.recipientIds || [],
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error(`❌ Error handling group join in session ${sessionId}:`, error);
    }
  }

  /**
   * Handle group leave event
   */
  @LogExecutionTime({ operationId: 'handle-group-leave' })
  private async handleGroupLeave(sessionId: string, notification: any): Promise<void> {
    try {
      logger.info(`👥 Group leave event in session ${sessionId}:`, notification);

      // Emit group leave event
      await eventBus.publish('whatsapp:group-leave', {
        sessionId,
        groupId: notification.chatId,
        participants: notification.recipientIds || [],
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error(`❌ Error handling group leave in session ${sessionId}:`, error);
    }
  }

  /**
   * Handle loading screen updates
   */
  @LogExecutionTime({ operationId: 'handle-loading-screen' })
  private async handleLoadingScreen(
    sessionId: string,
    percent: number,
    message: string
  ): Promise<void> {
    logger.debug(`⏳ Loading progress for session ${sessionId}: ${percent}% - ${message}`);

    // Emit loading progress event
    await eventBus.publish('whatsapp:loading-progress', {
      sessionId,
      percent,
      message,
      timestamp: new Date(),
    });
  }

  /**
   * Get acknowledgment status description
   */
  private getAckStatus(ack: MessageAck): string {
    switch (ack) {
      case MessageAck.ACK_ERROR:
        return 'error';
      case MessageAck.ACK_PENDING:
        return 'pending';
      case MessageAck.ACK_SERVER:
        return 'server';
      case MessageAck.ACK_DEVICE:
        return 'device';
      case MessageAck.ACK_READ:
        return 'read';
      case MessageAck.ACK_PLAYED:
        return 'played';
      default:
        return 'unknown';
    }
  }

  /**
   * Register custom event handlers
   */
  public registerCustomHandler(sessionId: string, eventName: string, handler: Function): void {
    logger.info(`🔌 Registering custom handler for ${eventName} in session ${sessionId}`);

    try {
      const sessionManager = serviceLocator.get('sessionManager');
      const client = sessionManager?.getClient(sessionId);

      if (!client) {
        throw ErrorFactory.session(`No active client for session ${sessionId}`, sessionId);
      }

      // Wrap handler with error handling
      const wrappedHandler = this.createEventListener(eventName, sessionId, handler);

      // Add to client and track
      client.on(eventName, wrappedHandler);

      const listeners = this.eventListeners.get(sessionId) || new Set();
      listeners.add(wrappedHandler);
      this.eventListeners.set(sessionId, listeners);

      logger.info(`✅ Custom handler registered for ${eventName}`);
    } catch (error) {
      logger.error(`❌ Failed to register custom handler for ${eventName}:`, error);
      throw error;
    }
  }

  /**
   * Remove custom event handler
   */
  public removeCustomHandler(sessionId: string, eventName: string, handler: Function): void {
    logger.info(`🔌 Removing custom handler for ${eventName} in session ${sessionId}`);

    try {
      const sessionManager = serviceLocator.get('sessionManager');
      const client = sessionManager?.getClient(sessionId);

      if (!client) {
        logger.warn(`⚠️ No active client for session ${sessionId}, cannot remove handler`);
        return;
      }

      // Remove from client
      client.removeListener(eventName, handler);

      // Remove from tracking
      const listeners = this.eventListeners.get(sessionId);
      if (listeners) {
        listeners.delete(handler);
      }

      logger.info(`✅ Custom handler removed for ${eventName}`);
    } catch (error) {
      logger.error(`❌ Failed to remove custom handler for ${eventName}:`, error);
    }
  }

  /**
   * Get active event listener count for a session
   */
  public getEventListenerCount(sessionId: string): number {
    const listeners = this.eventListeners.get(sessionId);
    return listeners ? listeners.size : 0;
  }

  /**
   * Cleanup all listeners for a session
   */
  public cleanup(sessionId: string): void {
    logger.info(`🧹 Cleaning up event listeners for session ${sessionId}`);

    try {
      const sessionManager = serviceLocator.get('sessionManager');
      const client = sessionManager?.getClient(sessionId);

      if (client) {
        this.removeEventListeners(sessionId, client);
      }

      // Clear from tracking
      this.eventListeners.delete(sessionId);

      logger.info(`✅ Event listener cleanup completed for session ${sessionId}`);
    } catch (error) {
      logger.warn(`⚠️ Error during event listener cleanup for session ${sessionId}:`, error);
    }
  }

  // ===============================================
  // IEventHandler Interface Implementation
  // ===============================================

  /**
   * Handle QR code event (required by IEventHandler interface)
   */
  public async onQrCode(sessionId: string, qr: string): Promise<void> {
    await this.handleQR(sessionId, qr);
  }

  /**
   * Handle authenticated event (required by IEventHandler interface)
   */
  public async onAuthenticated(sessionId: string, clientInfo: any): Promise<void> {
    await this.handleAuthenticated(sessionId, clientInfo);
  }

  /**
   * Handle ready event (required by IEventHandler interface)
   */
  public async onReady(sessionId: string, clientInfo: any): Promise<void> {
    await this.handleReady(sessionId, clientInfo);
  }

  /**
   * Handle disconnected event (required by IEventHandler interface)
   */
  public async onDisconnected(sessionId: string, reason: string): Promise<void> {
    await this.handleDisconnected(sessionId, reason);
  }

  /**
   * Handle message event (required by IEventHandler interface)
   */
  public async onMessage(sessionId: string, message: WhatsAppMessage): Promise<void> {
    // Convert our WhatsAppMessage back to whatsapp-web.js Message if needed
    // For now, we'll use the existing handleMessage logic
    logger.info(`💬 Processing message from interface: ${message.id}`);

    const messageProcessor = serviceLocator.get('messageProcessor');
    if (messageProcessor) {
      await messageProcessor.processIncomingMessage(sessionId, message);
    }
  }
}
