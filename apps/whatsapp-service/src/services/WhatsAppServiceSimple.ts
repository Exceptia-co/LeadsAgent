import type { Client } from 'whatsapp-web.js';
import { logger } from '../utils/logger';
import type { WhatsAppSession, SendMessageResponse } from '../types';
import type { HealthAlert } from './session-health-check/AlertManager';
import SessionRecoveryService from './SessionRecoveryService';
import SessionHealthCheckService from './SessionHealthCheckService';
import SessionPersistenceService from './SessionPersistenceService';
import redisClient, { REDIS_KEYS } from '../config/redis';
import { SESSION_CONSTANTS } from '../config/session-constants';

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
  private destroyingSessions: Set<string> = new Set();
  private sessionInitLocks: Set<string> = new Set();
  private initialized: boolean = false;
  private initializePromise: Promise<void> | null = null;
  // Stable callback identity so it can be unregistered at shutdown and dedupe
  // works in AlertManager. Defined as an arrow property (not inline at register
  // time) so the same reference is reused across calls.
  private alertCallback = (alert: HealthAlert): void => {
    logger.warn(
      `🚨 Health Alert [${alert.severity.toUpperCase()}] ${alert.sessionId}: ${alert.message}`,
      {
        type: alert.type,
        recommendation: alert.recommendation,
        timestamp: alert.timestamp,
      }
    );
  };

  // Module instances
  private messageHandler = MessageHandler;
  private sessionManager = SessionManager;
  private connectionManager = ConnectionManager;
  private eventDispatcher = new EventDispatcher(process.env.WEBHOOK_URL);
  private authenticationManager = AuthenticationManager;

  constructor() {
    logger.info('🚀 WhatsApp Service initialized with MODULAR architecture');
  }

  // Lazy idempotent init: same pattern as the WhatsAppService facade. Direct
  // callers (e.g. tests) and the facade share the singleton, so the guard
  // protects both paths even though the facade's own guard already prevents
  // duplicate calls in the normal boot path.
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializePromise) return this.initializePromise;

    this.initializePromise = this.runInitialize().then(
      () => {
        this.initialized = true;
      },
      err => {
        this.initializePromise = null;
        throw err;
      }
    );
    return this.initializePromise;
  }

  private async runInitialize(): Promise<void> {
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
            maxReconnectAttempts: SESSION_CONSTANTS.MAX_RECONNECT_ATTEMPTS,
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

    // Start advanced health monitoring (the legacy SessionRecoveryService.scheduleHealthChecks
    // was removed: nobody downstream consumed metadata.lastHealthCheck, and the
    // active signals — Redis heartbeat + reactive lastHealthCheck on session events —
    // already cover the same need.)
    SessionHealthCheckService.startMonitoring(this);

    // Start Redis heartbeat updates for session health tracking
    this.sessionManager.startHeartbeatUpdates();

    // Register alert callback (stable identity so AlertManager dedupes and we
    // can unregister on shutdown).
    SessionHealthCheckService.onAlert(this.alertCallback);

    logger.info('✅ WhatsApp service initialized successfully with modular architecture');
  }

  async createSession(sessionId: string, tenantId?: string): Promise<WhatsAppSession> {
    try {
      if (this.clients.has(sessionId)) {
        throw new Error(`Session ${sessionId} already exists`);
      }

      // Acquire lock to prevent double initialization (Redis primary, in-memory fallback)
      try {
        const lockKey = `${REDIS_KEYS.SESSION_LOCK}${sessionId}`;
        const redisLock = await redisClient
          .getClient()
          .set(lockKey, process.pid.toString(), 'EX', 300, 'NX');
        if (!redisLock) {
          throw new Error(`Session ${sessionId} is already being initialized (lock exists)`);
        }
      } catch (lockError: any) {
        if (lockError.message?.includes('already being initialized')) throw lockError;
        // Redis unavailable — use in-memory lock as fallback
        logger.warn(
          `Redis lock unavailable for ${sessionId}, using in-memory lock:`,
          lockError.message
        );
        if (this.sessionInitLocks.has(sessionId)) {
          throw new Error(`Session ${sessionId} is already being initialized (in-memory lock)`);
        }
        this.sessionInitLocks.add(sessionId);
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

      // Persist session to database (PR5a-bis: bind tenantId on first create)
      await this.sessionManager.persistSession(
        sessionId,
        tenantId,
        process.env.WEBHOOK_URL,
        authFileInfo
      );

      // Setup event listeners using EventDispatcher (with snapshot trigger callback)
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
        },
        this.handleAuthInvalidated.bind(this),
        (id: string) => this.destroyingSessions.has(id)
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
      // Release locks on failure
      this.sessionInitLocks.delete(sessionId);
      try {
        await redisClient.del(`${REDIS_KEYS.SESSION_LOCK}${sessionId}`);
      } catch {
        /* ignore */
      }
      logger.error(`Error creating session ${sessionId}:`, error);
      throw error;
    }
  }

  getSession(sessionId: string): WhatsAppSession | null {
    return this.sessionManager.getSession(sessionId);
  }

  async sendMessage(sessionId: string, to: string, message: string): Promise<SendMessageResponse> {
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
    return this.sessionManager.getSession(sessionId);
  }

  async getAllSessions(): Promise<WhatsAppSession[]> {
    return this.sessionManager.getAllSessions();
  }

  async destroySession(sessionId: string): Promise<void> {
    this.destroyingSessions.add(sessionId);
    try {
      logger.info(`🗑️ Destroying session ${sessionId} with modular architecture`);

      const client = this.clients.get(sessionId);
      if (client) {
        // Remove tracked event listeners surgically (prevents disconnect/destroy race)
        this.eventDispatcher.cleanupSessionListeners(client, sessionId);

        // Clean up client using ConnectionManager
        await this.connectionManager.destroyClient(client, sessionId);
        this.clients.delete(sessionId);
      }

      // Destroy session using SessionManager with auth cleanup
      await this.sessionManager.destroySession(
        sessionId,
        undefined, // client already handled above
        async (sid: string) => {
          await this.authenticationManager.cleanupSessionAuth(sid);
        }
      );

      // Release locks
      this.sessionInitLocks.delete(sessionId);
      try {
        await redisClient.del(`${REDIS_KEYS.SESSION_LOCK}${sessionId}`);
      } catch {
        /* ignore */
      }

      logger.info(`✅ Session ${sessionId} destroyed completely with modular architecture`);
    } catch (error) {
      logger.error(`❌ Error destroying session ${sessionId} with modular architecture:`, error);
      throw error;
    } finally {
      this.destroyingSessions.delete(sessionId);
    }
  }

  async shutdown(): Promise<void> {
    logger.info('🛑 Starting graceful shutdown with modular architecture...');

    // Stop health monitoring and periodic tasks
    try {
      SessionHealthCheckService.stopMonitoring();
      SessionHealthCheckService.offAlert(this.alertCallback);
      this.sessionManager.stopHeartbeatUpdates();
      logger.info('✅ Health monitoring and periodic tasks stopped');
    } catch (error) {
      logger.error('Error stopping health monitoring:', error);
    }

    // Shutdown all sessions using SessionManager. No auth cleanup here on
    // purpose: a restart must not look like a session deletion.
    await this.sessionManager.shutdownAllSessions(this.clients);

    // Clean up all connection monitoring
    this.connectionManager.cleanupAllMonitoring();

    logger.info('🏁 WhatsApp service graceful shutdown completed (modular)');
  }

  async forceDisconnectSession(sessionId: string): Promise<void> {
    this.destroyingSessions.add(sessionId);
    logger.info(`💪 Force disconnecting (pause) session ${sessionId} with modular architecture`);

    try {
      // 1. Close the WhatsApp client (browser) WITHOUT destroying session data
      const client = this.clients.get(sessionId);
      if (client) {
        // Remove tracked event listeners surgically (prevents disconnect/destroy race)
        this.eventDispatcher.cleanupSessionListeners(client, sessionId);
        try {
          await client.destroy();
        } catch (clientErr) {
          logger.warn(`Error closing client for session ${sessionId}:`, clientErr);
        }
        this.clients.delete(sessionId);
      }

      // 2. Clean up browser monitoring (intervals) for this session
      this.connectionManager.cleanupMonitoring(sessionId);

      // 3. Update status to 'disconnected' in all 3 layers (memory, DB, Redis)
      //    but keep the session in memory Map and isActive=true in DB
      await this.sessionManager.forceDisconnectSession(sessionId);

      // 4. Send webhook notification
      await this.eventDispatcher.sendForceDisconnectWebhook(sessionId);

      logger.info(`✅ Session ${sessionId} paused successfully — auth files preserved (modular)`);
    } catch (error) {
      logger.error(`❌ Error pausing session ${sessionId} (modular):`, error);
      throw error;
    } finally {
      this.destroyingSessions.delete(sessionId);
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
      const { default: WhatsAppAuthorizationService } =
        await import('./WhatsAppAuthorizationService');

      // Remove WhatsApp suffix to get clean phone number
      const phoneNumber = phoneNumberWithSuffix.replace('@c.us', '').replace('@g.us', '');

      logger.debug(`🔍 Checking authorization for phone number: ${phoneNumber} (modular)`);

      // B2.0 follow-up: resolve tenantId for authorization pipeline scoping
      const { default: DatabaseServiceMod } = await import('./DatabaseService');
      const tenantId = await DatabaseServiceMod.getSessionTenantId(sessionId);

      const authorizationResult = await WhatsAppAuthorizationService.authorize({
        phoneNumber,
        sessionId,
        tenantId: tenantId ?? undefined,
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
  getArchitectureMode(): 'modular' {
    return 'modular';
  }

  /**
   * Get module status (only available in modular mode)
   */
  getModuleStatus(): any {
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
    return await this.eventDispatcher.testWebhook();
  }

  /**
   * Handle auth invalidation (unpaired from phone or auth_failure).
   * Cleans up stale auth files so next reconnect generates a fresh QR.
   */
  private async handleAuthInvalidated(sessionId: string, reason: string): Promise<void> {
    logger.warn(`🔑 Auth invalidated for session ${sessionId} — reason: ${reason}`);

    // 1. Clean up stale local auth files
    try {
      await this.authenticationManager.cleanupSessionAuth(sessionId);
      logger.info(`Stale auth files cleaned for session ${sessionId}`);
    } catch (err) {
      logger.warn(`Error cleaning auth files for ${sessionId}:`, err);
    }

    logger.info(
      `✅ Auth invalidation cleanup done for ${sessionId} — reconnect will require fresh QR`
    );
  }

  /**
   * Get health info for a specific session
   */
  async getSessionHealth(sessionId: string): Promise<{
    status: string;
    hasLocalAuth: boolean;
    heartbeatAge?: number;
    authInvalidated?: boolean;
  }> {
    const session = this.sessionManager.getSession(sessionId);
    const authInfo = await this.authenticationManager.getAuthFileInfo(sessionId, './wwebjs_auth');
    const hasLocalAuth = authInfo.exists;

    let heartbeatAge: number | undefined;
    try {
      const hb = await redisClient.get(`${REDIS_KEYS.SESSION_HEARTBEAT}${sessionId}`);
      if (hb) {
        heartbeatAge = Date.now() - parseInt(hb, 10);
      }
    } catch {
      /* ignore */
    }

    // Check if auth was invalidated (unpaired from phone or auth_failure)
    const authInvalidated =
      session?.metadata?.authInvalidated === true || session?.status === 'auth_failure';

    return {
      status: session?.status || 'unknown',
      hasLocalAuth,
      heartbeatAge,
      authInvalidated,
    };
  }
}

export default new WhatsAppServiceSimple();
