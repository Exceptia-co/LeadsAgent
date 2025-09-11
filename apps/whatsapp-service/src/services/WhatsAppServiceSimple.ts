import { Client } from 'whatsapp-web.js';
import { logger } from '../utils/logger';
import { WhatsAppSession, SendMessageResponse } from '../types';
import SessionRecoveryService from './SessionRecoveryService';
import SessionHealthCheckService from './SessionHealthCheckService';

// Import modular components
import MessageHandler from './whatsapp-core/MessageHandler';
import SessionManager from './whatsapp-core/SessionManager';
import ConnectionManager from './whatsapp-core/ConnectionManager';
import EventDispatcher from './whatsapp-core/EventDispatcher';
import AuthenticationManager from './whatsapp-core/AuthenticationManager';

/**
 * WhatsAppServiceSimple - Modular WhatsApp Service Facade
 *
 * Now uses 5 specialized modules:
 * - MessageHandler: Message processing, sending, AI integration
 * - SessionManager: Session lifecycle, persistence, status management
 * - ConnectionManager: Browser management, monitoring, health checks
 * - EventDispatcher: Event handling, webhooks, Socket.IO
 * - AuthenticationManager: LocalAuth management, validation, cleanup
 *
 * This facade maintains 100% API compatibility with the original monolithic service
 * while providing better organization, testability, and maintainability.
 */
class WhatsAppServiceSimple {
  private clients: Map<string, Client> = new Map();
  private useModularArchitecture: boolean;

  // Module instances
  private messageHandler: typeof MessageHandler;
  private sessionManager: typeof SessionManager;
  private connectionManager: typeof ConnectionManager;
  private eventDispatcher: EventDispatcher;
  private authenticationManager: typeof AuthenticationManager;

  constructor() {
    // Force modular architecture to true - Legacy services removed
    this.useModularArchitecture = true;

    if (this.useModularArchitecture) {
      logger.info('🚀 WhatsApp Service initialized with MODULAR architecture');

      // Initialize modular components
      this.messageHandler = MessageHandler;
      this.sessionManager = SessionManager;
      this.connectionManager = ConnectionManager;
      this.eventDispatcher = new EventDispatcher(process.env.WEBHOOK_URL);
      this.authenticationManager = AuthenticationManager;
    } else {
      logger.info('🚀 WhatsApp Service initialized with LEGACY architecture');
      // Legacy mode will fall back to the original implementation
    }
  }

  async initialize(): Promise<void> {
    if (!this.useModularArchitecture) {
      // Import and delegate to legacy service
      
      // return LegacyService.initialize();
    }

    logger.info('🚀 Iniciando WhatsApp service con persistencia y monitoreo avanzado (MODULAR)...');

    // Recover existing sessions from database using smart filtering
    if (process.env.WHATSAPP_ENABLE_AUTO_RECOVERY === 'true') {
      try {
        logger.info('🤖 Using smart session recovery with intelligent filtering...');
        const recoveryResult = await SessionRecoveryService.recoverSessionsWithSmartFiltering(
          this,
          {
            validateAuthFiles: true,
            cleanupCorruptedAuth: true,
            maxReconnectAttempts: 3,
          }
        );
        logger.info(
          `📊 Smart recovery completed: ${recoveryResult.recoveredSessions}/${recoveryResult.totalSessions} sessions recovered, ${recoveryResult.skippedSessions} skipped`
        );

        if (recoveryResult.errors.length > 0) {
          logger.warn('⚠️ Errors during smart recovery:', recoveryResult.errors);
        }
      } catch (error) {
        logger.error('❌ Error during smart session recovery:', error);
      }
    } else {
      logger.info('⏸️ Auto-recovery disabled. Sessions must be created manually from dashboard.');
    }

    // Start periodic health checks (legacy)
    SessionRecoveryService.scheduleHealthChecks(this);

    // Start advanced health monitoring
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

    logger.info('✅ WhatsApp service initialized successfully with modular architecture');
  }

  async createSession(sessionId: string): Promise<WhatsAppSession> {
    if (!this.useModularArchitecture) {
      
      // return LegacyService.createSession(sessionId);
    }

    try {
      if (this.clients.has(sessionId)) {
        throw new Error(`Session ${sessionId} already exists`);
      }

      logger.info(`🚀 Creating session ${sessionId} with modular architecture`);

      // Setup authentication using AuthenticationManager
      const authDataPath = './wwebjs_auth';
      const { authFileInfo } = await this.authenticationManager.setupSessionAuth(
        sessionId,
        authDataPath
      );

      // Create WhatsApp client using ConnectionManager
      const client = await this.connectionManager.createClient(sessionId, authDataPath);

      // Create session object using SessionManager
      const session = this.sessionManager.createSessionObject(sessionId, process.env.WEBHOOK_URL);

      // Store client in memory
      this.clients.set(sessionId, client);

      // Persist session to database
      await this.sessionManager.persistSession(sessionId, process.env.WEBHOOK_URL, authFileInfo);

      // Setup event listeners using EventDispatcher
      this.eventDispatcher.setupClientEventListeners(
        client,
        sessionId,
        {
          parseMessage: this.messageHandler.parseMessage.bind(this.messageHandler),
          processMessageWithAI: this.messageHandler.processMessageWithAI.bind(this.messageHandler),
        },
        {
          updateSessionStatus: this.sessionManager.updateSessionStatus.bind(this.sessionManager),
          handleSessionDisconnect: this.sessionManager.handleSessionDisconnect.bind(
            this.sessionManager
          ),
        },
        {
          checkPhoneNumberAllowedWithLog: this.checkPhoneNumberAllowedWithLog.bind(this),
        }
      );

      // Initialize client with monitoring using ConnectionManager
      await this.connectionManager.initializeClient(
        client,
        sessionId,
        this.handleBrowserDisconnect.bind(this)
      );

      logger.info(`✅ Session ${sessionId} created successfully with modular architecture`);
      return session;
    } catch (error) {
      logger.error(`Error creating session ${sessionId}:`, error);
      throw error;
    }
  }

  getSession(sessionId: string): WhatsAppSession | null {
    if (!this.useModularArchitecture) {
      // Delegate to legacy - note: this is a sync method so we can't use dynamic import
      // We'll need to handle this differently or ensure the legacy service is available
      return null; // For now, return null in legacy mode to avoid errors
    }

    return this.sessionManager.getSession(sessionId);
  }

  async sendMessage(sessionId: string, to: string, message: string): Promise<SendMessageResponse> {
    if (!this.useModularArchitecture) {
      
      // return LegacyService.sendMessage(sessionId, to, message);
    }

    try {
      const client = this.clients.get(sessionId);
      if (!client) {
        return {
          success: false,
          error: `Session ${sessionId} not found`,
        };
      }

      const session = this.sessionManager.getSession(sessionId);
      if (!session || session.status !== 'ready') {
        return {
          success: false,
          error: `Session ${sessionId} is not ready. Status: ${session?.status || 'not found'}`,
        };
      }

      // Use MessageHandler to send message
      return await this.messageHandler.sendMessage(
        client,
        sessionId,
        to,
        message,
        this.sessionManager.updateSessionStatus.bind(this.sessionManager)
      );
    } catch (error) {
      logger.error(`Error in modular sendMessage for session ${sessionId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getSessionStatus(sessionId: string): Promise<WhatsAppSession | null> {
    if (!this.useModularArchitecture) {
      
      // return LegacyService.getSessionStatus(sessionId);
    }

    return this.sessionManager.getSession(sessionId);
  }

  async getAllSessions(): Promise<WhatsAppSession[]> {
    if (!this.useModularArchitecture) {
      
      // return LegacyService.getAllSessions();
    }

    return this.sessionManager.getAllSessions();
  }

  async destroySession(sessionId: string): Promise<void> {
    if (!this.useModularArchitecture) {
      
      // return LegacyService.destroySession(sessionId);
    }

    try {
      logger.info(`🗑️ Destroying session ${sessionId} with modular architecture`);

      const client = this.clients.get(sessionId);
      if (client) {
        // Clean up client using ConnectionManager
        await this.connectionManager.destroyClient(client, sessionId);
        this.clients.delete(sessionId);
      }

      // Destroy session using SessionManager with auth cleanup
      await this.sessionManager.destroySession(
        sessionId,
        undefined, // client already handled above
        async (sessionId: string) => {
          // Custom cleanup callback for auth files
          await this.authenticationManager.cleanupSessionAuth(sessionId);
        }
      );

      logger.info(`✅ Session ${sessionId} destroyed completely with modular architecture`);
    } catch (error) {
      logger.error(`❌ Error destroying session ${sessionId} with modular architecture:`, error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.useModularArchitecture) {
      
      // return LegacyService.shutdown();
    }

    logger.info('🛑 Starting graceful shutdown with modular architecture...');

    // Stop health monitoring
    try {
      SessionHealthCheckService.stopMonitoring();
      logger.info('✅ Health monitoring stopped');
    } catch (error) {
      logger.error('Error stopping health monitoring:', error);
    }

    // Shutdown all sessions using SessionManager
    await this.sessionManager.shutdownAllSessions(this.clients, async (sessionId: string) => {
      // Custom cleanup for each session
      await this.authenticationManager.cleanupSessionAuth(sessionId);
    });

    // Clean up all connection monitoring
    this.connectionManager.cleanupAllMonitoring();

    logger.info('🏁 WhatsApp service graceful shutdown completed (modular)');
  }

  async forceDisconnectSession(sessionId: string): Promise<void> {
    if (!this.useModularArchitecture) {
      
      // return LegacyService.forceDisconnectSession(sessionId);
    }

    logger.info(`💪 Force disconnecting session ${sessionId} with modular architecture`);

    try {
      // Force disconnect using SessionManager
      await this.sessionManager.forceDisconnectSession(sessionId);

      // Destroy the session
      await this.destroySession(sessionId);

      // Send webhook notification using EventDispatcher
      await this.eventDispatcher.sendForceDisconnectWebhook(sessionId);

      logger.info(`✅ Session ${sessionId} force disconnected successfully (modular)`);
    } catch (error) {
      logger.error(`❌ Error force disconnecting session ${sessionId} (modular):`, error);
      throw error;
    }
  }

  // Private helper methods for modular architecture

  private async handleBrowserDisconnect(sessionId: string, disconnectType: string): Promise<void> {
    try {
      logger.warn(
        `🚨 Handling browser disconnect for session ${sessionId}, type: ${disconnectType} (modular)`
      );

      // Handle disconnect using ConnectionManager
      await this.connectionManager.handleBrowserDisconnect(
        sessionId,
        disconnectType,
        this.sessionManager.updateSessionStatus.bind(this.sessionManager)
      );

      // Clean up client reference
      this.clients.delete(sessionId);

      // Send webhook notification
      await this.eventDispatcher.sendBrowserDisconnectWebhook(sessionId, disconnectType);

      logger.info(`✅ Browser disconnect handled for session ${sessionId} (modular)`);
    } catch (error) {
      logger.error(
        `❌ Error handling browser disconnect for session ${sessionId} (modular):`,
        error
      );
    }
  }

  private async checkPhoneNumberAllowedWithLog(
    phoneNumberWithSuffix: string,
    sessionId: string,
    messagePreview?: string
  ): Promise<{ allowed: boolean; reason: string; leadInfo?: any }> {
    try {
      // Import the enhanced WhatsApp Authorization Service
      const { default: WhatsAppAuthorizationService } = await import(
        './WhatsAppAuthorizationService'
      );

      // Remove WhatsApp suffix to get clean phone number
      const phoneNumber = phoneNumberWithSuffix.replace('@c.us', '').replace('@g.us', '');

      logger.debug(`🔍 Checking authorization for phone number: ${phoneNumber} (modular)`);

      // Use the enhanced authorization service
      const authorizationResult = await WhatsAppAuthorizationService.authorize({
        phoneNumber,
        sessionId,
        messagePreview,
        timestamp: new Date(),
      });

      logger.info(
        `🔐 Authorization result for ${phoneNumber}: ${authorizationResult.decision} (modular)`,
        {
          reason: authorizationResult.reason,
          confidence: authorizationResult.confidence,
          leadId: authorizationResult.leadInfo?.id,
          leadName: authorizationResult.leadInfo?.name,
        }
      );

      // Convert to legacy format for compatibility
      return {
        allowed: authorizationResult.decision === 'ALLOWED',
        reason: authorizationResult.reason,
        leadInfo: authorizationResult.leadInfo,
      };
    } catch (error) {
      logger.error('Error in enhanced authorization check (modular):', error);

      // Fallback to conservative approach
      return {
        allowed: false,
        reason: 'Error en sistema de autorización - bloqueado por seguridad',
      };
    }
  }

  // Session recovery method used by SessionRecoveryService
  async recoverSessionWithAuthValidation(sessionId: string, persistedData: any): Promise<boolean> {
    if (!this.useModularArchitecture) {
      
      // return LegacyService.recoverSessionWithAuthValidation(sessionId, persistedData);
    }

    try {
      logger.info(`🔄 Recovering session ${sessionId} with modular architecture`);

      // Use SessionManager to recover with auth validation
      return await this.sessionManager.recoverSessionWithAuthValidation(
        sessionId,
        async (sessionId: string) => {
          // Use createSession as the callback
          return await this.createSession(sessionId);
        }
      );
    } catch (error) {
      logger.error(`Error recovering session ${sessionId} with modular architecture:`, error);
      return false;
    }
  }

  // Utility methods for monitoring and debugging

  /**
   * Get service architecture mode
   */
  getArchitectureMode(): 'modular' | 'legacy' {
    return this.useModularArchitecture ? 'modular' : 'legacy';
  }

  /**
   * Get module status (only available in modular mode)
   */
  getModuleStatus(): any {
    if (!this.useModularArchitecture) {
      return { error: 'Module status only available in modular mode' };
    }

    return {
      architecture: 'modular',
      modules: {
        messageHandler: !!this.messageHandler,
        sessionManager: !!this.sessionManager,
        connectionManager: !!this.connectionManager,
        eventDispatcher: !!this.eventDispatcher,
        authenticationManager: !!this.authenticationManager,
      },
      activeSessions: this.clients.size,
      webhookUrl: this.eventDispatcher.getWebhookUrl(),
    };
  }

  /**
   * Test webhook (only available in modular mode)
   */
  async testWebhook(): Promise<{ success: boolean; error?: string }> {
    if (!this.useModularArchitecture) {
      return { success: false, error: 'Webhook testing only available in modular mode' };
    }

    return await this.eventDispatcher.testWebhook();
  }
}

export default new WhatsAppServiceSimple();
