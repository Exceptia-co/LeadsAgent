/**
 * @fileoverview WhatsAppServiceRefactored - Refactored version using modular components
 * Replaces the monolithic WhatsAppServiceSimple with a clean, modular architecture
 */

import { logger } from '../utils/logger';
import { LogExecutionTime, SafeExecutor } from '../utils/decorators';
import { serviceLocator } from '../core/ServiceLocator';
import { eventBus } from '../events/EventBus';
import { WhatsAppUtils } from '../utils/whatsappUtils';
import {
  SessionManager,
  ConnectionManager,
  MessageProcessor,
  EventHandler,
  MediaHandler,
  ContactManager,
} from './whatsapp';
import type {
  WhatsAppSession,
  WhatsAppMessage,
  SendMessageRequest,
  SendMessageResponse,
  IWhatsAppService,
  WebhookPayload,
} from '../types';
import { isFailure, SendMediaMessageRequest } from '../types';

// Import legacy services for AI processing (will be refactored in Phase 3)
import SessionRecoveryService from './SessionRecoveryService';
import SessionHealthCheckService from './SessionHealthCheckService';
import PhoneNumberService from './PhoneNumberService';

/**
 * Refactored WhatsApp Service using modular architecture
 * Delegates responsibilities to specialized components following SRP
 */
export class WhatsAppServiceRefactored implements IWhatsAppService {
  private webhookUrl: string | undefined;
  private isInitialized: boolean = false;

  // Component references (injected via ServiceLocator)
  private sessionManager!: SessionManager;
  private connectionManager!: ConnectionManager;
  private messageProcessor!: MessageProcessor;
  private eventHandler!: EventHandler;
  private mediaHandler!: MediaHandler;
  private contactManager!: ContactManager;

  constructor() {
    this.webhookUrl = process.env.WEBHOOK_URL;
  }

  /**
   * Initialize the WhatsApp service and all components
   */
  @LogExecutionTime({ operationId: 'whatsapp-service-init' })
  public async initialize(): Promise<void> {
    return SafeExecutor.execute(
      async () => {
        if (this.isInitialized) {
          logger.warn('⚠️ WhatsApp service already initialized');
          return;
        }

        logger.info('🚀 Initializing WhatsApp service with modular architecture...');

        // Initialize all components and register them in ServiceLocator
        await this.initializeComponents();

        // Setup event listeners for service-level events
        this.setupServiceEventListeners();

        // Recover existing sessions if enabled
        if (process.env.WHATSAPP_ENABLE_AUTO_RECOVERY === 'true') {
          await this.recoverExistingSessions();
        } else {
          logger.info(
            '⏸️ Auto-recovery disabled. Sessions must be created manually from dashboard.'
          );
        }

        // Start health monitoring
        this.startHealthMonitoring();

        this.isInitialized = true;
        logger.info('✅ WhatsApp service initialized successfully with modular architecture');

        // Emit service started event
        await eventBus.publish('system:service-started', {
          serviceName: 'WhatsAppServiceRefactored',
          version: '2.0.0',
          timestamp: new Date(),
        });
      },
      {
        operationName: 'whatsapp-service-init',
        timeout: 60000,
      }
    ).then(result => {
      if (isFailure(result)) {
        logger.error('❌ Failed to initialize WhatsApp service:', result.error);
        throw result.error;
      }
    });
  }

  /**
   * Create a new WhatsApp session
   */
  @LogExecutionTime({ operationId: 'create-session' })
  public async createSession(sessionId: string): Promise<WhatsAppSession> {
    return SafeExecutor.execute(
      async () => {
        logger.info(`📱 Creating session ${sessionId} with modular components...`);

        // Create session using SessionManager
        const session = await this.sessionManager.createSession(sessionId);

        // Create connection using ConnectionManager
        const client = await this.connectionManager.createConnection(sessionId, {
          headless:
            process.env.PUPPETEER_HEADLESS === 'true' || process.env.NODE_ENV === 'production',
          executablePath: process.env.CHROME_EXECUTABLE_PATH,
        });

        // Setup event handlers for the client
        this.eventHandler.setupEventListeners(sessionId, client);

        // Initialize the client
        await this.connectionManager.initializeConnection(sessionId);

        logger.info(`✅ Session ${sessionId} created successfully`);
        return session;
      },
      {
        operationName: 'create-session',
        context: { sessionId },
        timeout: 120000, // 2 minutes for initialization
      }
    ).then(result => {
      if (isFailure(result)) {
        logger.error(`❌ Failed to create session ${sessionId}:`, result.error);
        throw result.error;
      }
      return result.data;
    });
  }

  /**
   * Send a text message
   */
  @LogExecutionTime({ operationId: 'send-message' })
  public async sendMessage(
    sessionId: string,
    to: string,
    message: string
  ): Promise<SendMessageResponse> {
    return SafeExecutor.execute(
      async () => {
        // Validate session is ready
        if (!this.sessionManager.isSessionReady(sessionId)) {
          return {
            success: false,
            error: `Session ${sessionId} is not ready`,
          };
        }

        // Use MessageProcessor to send the message
        const request: SendMessageRequest = { to, message };
        return await this.messageProcessor.sendMessage(sessionId, request);
      },
      {
        operationName: 'send-message',
        context: { sessionId, to },
        timeout: 30000,
      }
    ).then(result => {
      if (isFailure(result)) {
        logger.error(`❌ Failed to send message:`, result.error);
        return {
          success: false,
          error: result.error.message,
        };
      }
      return result.data;
    });
  }

  /**
   * Send a media message
   */
  @LogExecutionTime({ operationId: 'send-media-message' })
  public async sendMediaMessage(
    sessionId: string,
    request: SendMediaMessageRequest
  ): Promise<SendMessageResponse> {
    return SafeExecutor.execute(
      async () => {
        // Validate session is ready
        if (!this.sessionManager.isSessionReady(sessionId)) {
          return {
            success: false,
            error: `Session ${sessionId} is not ready`,
          };
        }

        // Use MessageProcessor to send the media message
        return await this.messageProcessor.sendMediaMessage(sessionId, request);
      },
      {
        operationName: 'send-media-message',
        context: { sessionId, to: request.to },
        timeout: 60000,
      }
    ).then(result => {
      if (isFailure(result)) {
        logger.error(`❌ Failed to send media message:`, result.error);
        return {
          success: false,
          error: result.error.message,
        };
      }
      return result.data;
    });
  }

  /**
   * Get session status
   */
  public async getSessionStatus(sessionId: string): Promise<WhatsAppSession | null> {
    return this.sessionManager.getSession(sessionId);
  }

  /**
   * Get all sessions
   */
  public async getAllSessions(): Promise<WhatsAppSession[]> {
    return this.sessionManager.getAllSessions();
  }

  /**
   * Destroy a session
   */
  @LogExecutionTime({ operationId: 'destroy-session' })
  public async destroySession(sessionId: string): Promise<void> {
    return SafeExecutor.execute(
      async () => {
        logger.info(`🗑️ Destroying session ${sessionId} using modular components...`);

        // Clean up event listeners first
        const client = this.sessionManager.getClient(sessionId);
        if (client) {
          this.eventHandler.cleanup(sessionId);
        }

        // Destroy connection
        await this.connectionManager.destroyConnection(sessionId);

        // Clean up session
        await this.sessionManager.destroySession(sessionId);

        // Clean up contact cache
        this.contactManager.cleanup(sessionId);

        logger.info(`✅ Session ${sessionId} destroyed successfully`);
      },
      {
        operationName: 'destroy-session',
        context: { sessionId },
        timeout: 30000,
      }
    ).then(result => {
      if (isFailure(result)) {
        logger.error(`❌ Failed to destroy session ${sessionId}:`, result.error);
        throw result.error;
      }
    });
  }

  /**
   * Get session metrics and statistics
   */
  public getSessionMetrics(sessionId: string): {
    session: any;
    connection: any;
    messages: any;
    contacts: any;
    events: any;
  } {
    return {
      session: this.sessionManager.getSessionMetrics(sessionId),
      connection: this.connectionManager.getConnectionMetrics(sessionId),
      messages: this.messageProcessor.getMessageStats(sessionId),
      contacts: this.contactManager.getContactStats(sessionId),
      events: this.eventHandler.getEventListenerCount(sessionId),
    };
  }

  /**
   * Initialize all modular components
   */
  private async initializeComponents(): Promise<void> {
    logger.info('🔧 Initializing modular components...');

    // Create component instances
    this.sessionManager = new SessionManager();
    this.connectionManager = new ConnectionManager();
    this.messageProcessor = new MessageProcessor();
    this.eventHandler = new EventHandler();
    this.mediaHandler = new MediaHandler('./media');
    this.contactManager = new ContactManager();

    // Register components in ServiceLocator for cross-component communication
    serviceLocator.register('sessionManager', this.sessionManager);
    serviceLocator.register('connectionManager', this.connectionManager);
    serviceLocator.register('messageProcessor', this.messageProcessor);
    serviceLocator.register('eventHandler', this.eventHandler);
    serviceLocator.register('mediaHandler', this.mediaHandler);
    serviceLocator.register('contactManager', this.contactManager);

    logger.info('✅ All modular components initialized and registered');
  }

  /**
   * Setup service-level event listeners
   */
  private setupServiceEventListeners(): void {
    logger.info('📡 Setting up service-level event listeners...');

    // Listen to session events for service orchestration
    eventBus.subscribe('whatsapp:session-ready', async event => {
      logger.info(`🎉 Session ${event.sessionId} is ready for messaging`);
      await this.onSessionReady(event.sessionId);
    });

    eventBus.subscribe('whatsapp:session-disconnected', async event => {
      logger.warn(`🔌 Session ${event.sessionId} disconnected: ${event.reason}`);
      await this.onSessionDisconnected(event.sessionId, event.reason);
    });

    eventBus.subscribe('whatsapp:message-received', async event => {
      logger.info(`📨 Message received in session ${event.sessionId} from ${event.from}`);
      await this.onMessageReceived(event);
    });

    eventBus.subscribe('whatsapp:session-auth-failed', async event => {
      logger.error(`🔒 Authentication failed for session ${event.sessionId}: ${event.reason}`);
      await this.onAuthenticationFailed(event.sessionId, event.reason);
    });

    // Listen to system events
    eventBus.subscribe('whatsapp:event-error', async event => {
      logger.error(`❌ Event error in session ${event.sessionId}:`, event.error);
      await this.onEventError(event.sessionId, event.eventName, event.error);
    });

    logger.info('✅ Service-level event listeners setup completed');
  }

  /**
   * Handle session ready event
   */
  private async onSessionReady(sessionId: string): Promise<void> {
    try {
      // Send webhook notification
      const webhookPayload = {
        event: 'authenticated' as const,
        sessionId,
        data: { status: 'ready' },
        timestamp: WhatsAppUtils.getTimestamp(),
      };

      await this.sendWebhook(webhookPayload);

      // Notify SocketService for real-time updates
      await this.notifySocketEvent(webhookPayload);

      // Start additional monitoring if needed
      // This is where you could integrate with external systems
    } catch (error) {
      logger.error(`❌ Error handling session ready for ${sessionId}:`, error);
    }
  }

  /**
   * Handle session disconnected event
   */
  private async onSessionDisconnected(sessionId: string, reason: string): Promise<void> {
    try {
      // Send webhook notification
      const webhookPayload = {
        event: 'disconnected' as const,
        sessionId,
        data: { reason },
        timestamp: WhatsAppUtils.getTimestamp(),
      };

      await this.sendWebhook(webhookPayload);

      // Notify SocketService for real-time updates
      await this.notifySocketEvent(webhookPayload);

      // Handle reconnection logic through ConnectionManager if needed
      // The ConnectionManager already handles auto-reconnection internally
    } catch (error) {
      logger.error(`❌ Error handling session disconnect for ${sessionId}:`, error);
    }
  }

  /**
   * Handle incoming message received event
   */
  private async onMessageReceived(event: any): Promise<void> {
    try {
      // Send webhook for message received
      await this.sendWebhook({
        event: 'message_received',
        sessionId: event.sessionId,
        data: {
          messageId: event.messageId,
          from: event.from,
          to: event.to,
          body: event.body,
          type: event.type,
        },
        timestamp: WhatsAppUtils.getTimestamp(),
      });

      // Check if we should process with AI
      if (await this.shouldProcessWithAI(event)) {
        await this.processMessageWithAI(event);
      }
    } catch (error) {
      logger.error(`❌ Error handling message received for ${event.sessionId}:`, error);
    }
  }

  /**
   * Handle authentication failed event
   */
  private async onAuthenticationFailed(sessionId: string, reason: string): Promise<void> {
    try {
      // Send webhook notification
      await this.sendWebhook({
        event: 'auth_failed',
        sessionId,
        data: { reason },
        timestamp: WhatsAppUtils.getTimestamp(),
      });

      // Mark session as failed
      await this.sessionManager.updateSessionStatus(sessionId, 'auth_failed');
    } catch (error) {
      logger.error(`❌ Error handling auth failure for ${sessionId}:`, error);
    }
  }

  /**
   * Handle event processing errors
   */
  private async onEventError(sessionId: string, eventName: string, error: string): Promise<void> {
    logger.error(`❌ Event error in session ${sessionId} (${eventName}): ${error}`);

    // Could implement automatic recovery logic here
    // For now, just log and notify via webhook

    try {
      await this.sendWebhook({
        event: 'event_error',
        sessionId,
        data: { eventName, error },
        timestamp: WhatsAppUtils.getTimestamp(),
      });
    } catch (webhookError) {
      logger.error(`❌ Failed to send webhook for event error:`, webhookError);
    }
  }

  /**
   * Recover existing sessions from database
   */
  private async recoverExistingSessions(): Promise<void> {
    try {
      logger.info('🤖 Starting smart session recovery...');

      // Use legacy session recovery service (will be refactored in future phases)
      const recoveryResult = await SessionRecoveryService.recoverSessionsWithSmartFiltering(this, {
        validateAuthFiles: true,
        cleanupCorruptedAuth: true,
        maxReconnectAttempts: 3,
      });

      logger.info(
        `📊 Smart recovery completed: ${recoveryResult.recoveredSessions}/${recoveryResult.totalSessions} sessions recovered, ${recoveryResult.skippedSessions} skipped`
      );

      if (recoveryResult.errors.length > 0) {
        logger.warn('⚠️ Errors during smart recovery:', recoveryResult.errors);
      }
    } catch (error) {
      logger.error('❌ Error during smart session recovery:', error);
    }
  }

  /**
   * Start health monitoring services
   */
  private startHealthMonitoring(): void {
    try {
      logger.info('🏥 Starting health monitoring services...');

      // Start legacy health checks (will be refactored in future phases)
      SessionRecoveryService.scheduleHealthChecks(this);
      SessionHealthCheckService.startMonitoring(this);

      // Register alert callback for logging
      SessionHealthCheckService.onAlert(alert => {
        logger.warn(
          `🚨 Health Alert [${alert.severity.toUpperCase()}] ${alert.sessionId}: ${alert.message}`,
          {
            type: alert.type,
            recommendation: alert.recommendation,
            timestamp: alert.timestamp,
          }
        );
      });

      logger.info('✅ Health monitoring services started');
    } catch (error) {
      logger.error('❌ Error starting health monitoring:', error);
    }
  }

  /**
   * Check if message should be processed with AI
   */
  private async shouldProcessWithAI(event: any): Promise<boolean> {
    try {
      // Don't process our own messages
      if (event.from === event.to) {
        return false;
      }

      // Check if content is not empty
      if (!event.body?.trim()) {
        return false;
      }

      // Check phone number whitelist using legacy service
      const phoneNumber = WhatsAppUtils.cleanPhoneNumber(event.from);
      const whitelistResult = await this.checkPhoneNumberAllowedWithLog(
        event.from,
        event.sessionId,
        event.body
      );

      return whitelistResult.allowed;
    } catch (error) {
      logger.error('❌ Error checking if should process with AI:', error);
      return false;
    }
  }

  /**
   * Process message with AI (legacy integration - will be refactored in Phase 3)
   */
  private async processMessageWithAI(event: any): Promise<void> {
    try {
      logger.info(`🧠 Processing message with AI for session ${event.sessionId}`);

      // Import AI services dynamically to avoid circular dependencies
      const { default: AIThinkingService } = await import('./AIThinkingService');
      const { default: DatabaseService } = await import('./DatabaseService');

      const phoneNumber = WhatsAppUtils.cleanPhoneNumber(event.from);

      // Process with AI thinking service
      const thinkingResult = await AIThinkingService.processWithThinking(event.body, {
        from: event.from,
        sessionId: event.sessionId,
        phoneNumber: phoneNumber,
      });

      if (
        thinkingResult.thinkingProcess.shouldRespond &&
        thinkingResult.success &&
        thinkingResult.content
      ) {
        // Send response using MessageProcessor
        const response = await this.messageProcessor.sendMessage(event.sessionId, {
          to: event.from,
          message: thinkingResult.content,
        });

        if (response.success) {
          logger.info(`✅ AI response sent successfully to ${phoneNumber}`);

          // Save conversation to database
          await this.saveConversationToDatabase(event, thinkingResult, phoneNumber);
        }
      } else {
        logger.info(`🤐 AI decided not to respond to ${phoneNumber}`);
      }
    } catch (error) {
      logger.error('❌ Error processing message with AI:', error);
    }
  }

  /**
   * Save conversation data to database
   */
  private async saveConversationToDatabase(
    event: any,
    thinkingResult: any,
    phoneNumber: string
  ): Promise<void> {
    try {
      const { default: DatabaseService } = await import('./DatabaseService');

      // Save user message
      await DatabaseService.saveConversation({
        sessionId: event.sessionId,
        phoneNumber: phoneNumber,
        messageText: event.body,
        responseText: undefined,
        messageType: event.type,
        intent: thinkingResult.thinkingProcess.steps[0]?.data?.intent || 'unknown',
        sentiment: thinkingResult.thinkingProcess.steps[0]?.data?.sentiment || 'neutral',
        aiProvider: thinkingResult.provider,
        tokensUsed: thinkingResult.tokensUsed || 0,
        isFromUser: true,
      });

      // Save AI response
      await DatabaseService.saveConversation({
        sessionId: event.sessionId,
        phoneNumber: phoneNumber,
        messageText: thinkingResult.content,
        responseText: undefined,
        messageType: 'text',
        intent: thinkingResult.thinkingProcess.steps[0]?.data?.intent || 'response',
        sentiment: 'neutral',
        aiProvider: thinkingResult.provider,
        tokensUsed: 0,
        isFromUser: false,
      });
    } catch (error) {
      logger.error('❌ Error saving conversation to database:', error);
    }
  }

  /**
   * Check phone number whitelist (legacy method - will be refactored)
   */
  private async checkPhoneNumberAllowedWithLog(
    from: string,
    sessionId: string,
    body: string
  ): Promise<{ allowed: boolean; reason: string }> {
    try {
      const phoneNumber = from.replace('@c.us', '');
      const isAllowed = await PhoneNumberService.checkPhoneNumberAllowed(phoneNumber);

      if (isAllowed) {
        return { allowed: true, reason: 'Phone number is whitelisted' };
      } else {
        return { allowed: false, reason: 'Phone number not in whitelist' };
      }
    } catch (error) {
      logger.error('❌ Error checking phone number whitelist:', error);
      return { allowed: false, reason: 'Error checking whitelist' };
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhook(payload: any): Promise<void> {
    if (!this.webhookUrl) {
      return;
    }

    try {
      // Implementation would depend on your webhook system
      // For now, just log the webhook payload
      logger.debug('📡 Webhook payload:', payload);

      // You could implement actual HTTP webhook sending here:
      // await fetch(this.webhookUrl, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(payload),
      // });
    } catch (error) {
      logger.error('❌ Error sending webhook:', error);
    }
  }

  /**
   * Get service health status
   */
  public getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: Record<string, boolean>;
    activeSessions: number;
    metrics: any;
  } {
    const sessionCount = this.sessionManager?.getActiveSessions().length || 0;

    return {
      status: this.isInitialized ? 'healthy' : 'unhealthy',
      components: {
        sessionManager: !!this.sessionManager,
        connectionManager: !!this.connectionManager,
        messageProcessor: !!this.messageProcessor,
        eventHandler: !!this.eventHandler,
        mediaHandler: !!this.mediaHandler,
        contactManager: !!this.contactManager,
      },
      activeSessions: sessionCount,
      metrics: {
        totalSessions: sessionCount,
        serviceLocatorServices: serviceLocator.getRegisteredServices().length,
        eventBusStats: eventBus.getStats(),
      },
    };
  }

  /**
   * Graceful shutdown of the service
   */
  @LogExecutionTime({ operationId: 'shutdown-service' })
  public async shutdown(): Promise<void> {
    return SafeExecutor.execute(
      async () => {
        logger.info('🛑 Shutting down WhatsApp service...');

        // Get all active sessions
        const sessions = await this.getAllSessions();

        // Destroy all sessions gracefully
        const destroyPromises = sessions.map(session =>
          this.destroySession(session.id).catch(error => {
            logger.error(`❌ Error destroying session ${session.id} during shutdown:`, error);
          })
        );

        await Promise.allSettled(destroyPromises);

        // Clear service locator
        serviceLocator.clear();

        // Clear event bus
        eventBus.clear();

        this.isInitialized = false;

        logger.info('✅ WhatsApp service shutdown completed');

        // Emit service stopped event
        await eventBus.publish('system:service-stopped', {
          serviceName: 'WhatsAppServiceRefactored',
          reason: 'Graceful shutdown',
          timestamp: new Date(),
        });
      },
      {
        operationName: 'shutdown-service',
        timeout: 60000,
      }
    ).then(result => {
      if (isFailure(result)) {
        logger.error('❌ Error during service shutdown:', result.error);
        throw result.error;
      }
    });
  }

  // Legacy compatibility methods that delegate to the old service temporarily
  // These will be removed once full migration is complete

  /**
   * Legacy method compatibility - will be removed
   * @deprecated Use the modular approach instead
   */
  public async processMessageWithAILegacy(
    originalMessage: any,
    whatsappMessage: WhatsAppMessage,
    sessionId: string
  ): Promise<void> {
    logger.warn(
      '⚠️ Using legacy processMessageWithAI method - this should be migrated to event-driven approach'
    );
    await this.processMessageWithAI({
      sessionId,
      from: whatsappMessage.from,
      body: whatsappMessage.body,
      type: whatsappMessage.type,
    });
  }

  /**
   * Legacy method compatibility - will be removed
   * @deprecated Use MessageProcessor directly
   */
  public normalizePhoneNumber(phoneNumber: string): string {
    logger.warn(
      '⚠️ Using legacy normalizePhoneNumber method - use WhatsAppUtils.formatPhoneForWhatsApp instead'
    );
    return WhatsAppUtils.formatPhoneForWhatsApp(phoneNumber);
  }

  /**
   * Legacy method compatibility - will be removed
   * @deprecated Use MessageProcessor.convertWhatsAppMessage instead
   */
  public async parseMessage(message: any, sessionId: string): Promise<WhatsAppMessage> {
    logger.warn('⚠️ Using legacy parseMessage method - use MessageProcessor instead');
    return this.messageProcessor.convertWhatsAppMessage(sessionId, message);
  }

  /**
   * Get session synchronously (for backward compatibility)
   * Note: This is a legacy method needed for compatibility with existing controllers
   * Since SessionManager only has async methods, we return sync access to internal storage
   */
  public getSession(sessionId: string): WhatsAppSession | null {
    logger.warn('⚠️ Using legacy getSession method - prefer getSessionStatus for async operations');
    // Access session storage directly for synchronous operation
    const sessions = this.sessionManager['sessions'];
    return sessions.get(sessionId) || null;
  }

  /**
   * Force disconnect a session (for backward compatibility)
   * Note: This is a legacy method that delegates to destroySession
   */
  public async forceDisconnectSession(sessionId: string): Promise<void> {
    logger.warn('⚠️ Using legacy forceDisconnectSession method - prefer destroySession');
    await this.destroySession(sessionId);
  }

  // =============================================================================
  // SOCKET INTEGRATION - Real-time event notifications
  // =============================================================================

  /**
   * Notify SocketService about events for real-time updates
   * This method provides communication between refactored service and SocketService
   */
  private async notifySocketEvent(payload: WebhookPayload): Promise<void> {
    try {
      // Import WhatsApp facade to use unified notification system
      const WhatsAppServiceModule = await import('./WhatsAppService');
      const whatsappServiceFacade = WhatsAppServiceModule.default;

      await whatsappServiceFacade.notifySocketEvent(payload);
      logger.debug(
        `📡 Socket event notified via facade: ${payload.event} for session ${payload.sessionId}`
      );
    } catch (error) {
      logger.error('❌ Error notifying socket service via facade:', error);
    }
  }
}

// Export singleton instance for backward compatibility
// Note: In a full DI setup, this would be injected instead
export default new WhatsAppServiceRefactored();
