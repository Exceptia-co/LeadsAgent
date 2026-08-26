import { logger } from '../utils/logger';
import type { WhatsAppSession, SendMessageResponse } from '../types';
import type { HealthAlert } from './session-health-check/AlertManager';
import SessionRecoveryService from './SessionRecoveryService';
import SessionHealthCheckService from './SessionHealthCheckService';
import redisClient, { REDIS_KEYS } from '../config/redis';
import { SESSION_CONSTANTS } from '../config/session-constants';

// Import modular components
import MessageHandler from './whatsapp-core/MessageHandler';
import SessionManager from './whatsapp-core/SessionManager';
import { IncomingMessagePipeline } from './whatsapp-core/IncomingMessagePipeline';
import { WhatsAppEventPublisher } from './WhatsAppEventPublisher';
import { BaileysSessionManager } from './baileys/BaileysSessionManager';
import { sessionCredentialsStore } from './session-credentials/SessionCredentialsStore';

/**
 * WhatsAppServiceSimple - WhatsApp Service Facade (Baileys)
 *
 * The engine lives in BaileysSessionManager: sockets, the in-memory session
 * map, the reconnect policy and the credential lifecycle are all its. This
 * class keeps the pieces that are not engine-specific and wires them together:
 * - MessageHandler: AI processing of an inbound message (via IncomingMessagePipeline)
 * - SessionManager: persisted session row, status writes, disconnect policy
 * - WhatsAppEventPublisher: Socket.IO + HMAC-signed webhook emission
 *
 * The public API is unchanged from the whatsapp-web.js era, so the REST
 * routes, the Socket.IO payloads and the message webhook contract are all
 * untouched.
 */
class WhatsAppServiceSimple {
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

  // Module instances. Declaration order matters: the pipeline and the session
  // manager below read the three above during field initialisation.
  private messageHandler = MessageHandler;
  private sessionManager = SessionManager;
  private publisher = new WhatsAppEventPublisher(process.env.WEBHOOK_URL);

  private pipeline = new IncomingMessagePipeline({
    authChecker: {
      checkPhoneNumberAllowedWithLog: this.checkPhoneNumberAllowedWithLog.bind(this),
    },
    messageHandler: {
      processMessageWithAI: this.messageHandler.processMessageWithAI.bind(this.messageHandler),
    },
    sessionManager: {
      updateSessionStatus: this.sessionManager.updateSessionStatus.bind(this.sessionManager),
    },
    sendWebhook: this.publisher.sendWebhook.bind(this.publisher),
  });

  private baileys = new BaileysSessionManager({
    store: sessionCredentialsStore,
    publisher: this.publisher,
    pipeline: this.pipeline,
    updateSessionStatus: this.sessionManager.updateSessionStatus.bind(this.sessionManager),
    handleSessionDisconnect: this.sessionManager.handleSessionDisconnect.bind(this.sessionManager),
  });

  constructor() {
    logger.info('🚀 WhatsApp Service initialized with Baileys engine');
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
    logger.info('🚀 Iniciando WhatsApp service con persistencia y monitoreo avanzado...');

    // Recover existing sessions from database using smart filtering
    if (process.env.WHATSAPP_ENABLE_AUTO_RECOVERY === 'true') {
      try {
        logger.info('🤖 Using smart session recovery with intelligent filtering...');
        const recoveryResult = await SessionRecoveryService.recoverSessionsWithSmartFiltering(
          this,
          {
            validateAuthFiles: true,
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

    // Start Redis heartbeat updates for session health tracking. The engine
    // owns the session map now, so the heartbeat has to read from it — left
    // pointing at SessionManager's own (permanently empty) map it would
    // silently stop writing session:hb: keys, and getSessionHealth would
    // report no heartbeatAge for every session.
    this.sessionManager.startHeartbeatUpdates(() => this.baileys.getAllSessions());

    // Register alert callback (stable identity so AlertManager dedupes and we
    // can unregister on shutdown).
    SessionHealthCheckService.onAlert(this.alertCallback);

    logger.info('✅ WhatsApp service initialized successfully');
  }

  async createSession(sessionId: string, tenantId?: string): Promise<WhatsAppSession> {
    // Only the caller that took the lock may release it. Releasing
    // unconditionally means the racer that just lost to `SET NX` erases the
    // winner's key on its way out -- and a third concurrent create then walks
    // straight into the manager's `sockets.has` TOCTOU, which this lock is the
    // only defence against.
    let lockAcquired = false;
    try {
      // BaileysSessionManager's own `sockets.has` guard is the authority on
      // "already live", but it only runs after persistSession below — and
      // saveSession's update branch would reset a live row to 'connecting'
      // and wipe its connectedNumber before that throw ever landed. A session
      // still in the manager's map and not 'disconnected' either holds a
      // socket or has a reconnect pending; a 'disconnected' one (paused, or
      // out of retries) is legitimately re-creatable, which is what the
      // dashboard's reconnect button does.
      const existing = this.baileys.getSession(sessionId);
      if (existing && existing.status !== 'disconnected') {
        throw new Error(`Session ${sessionId} already exists`);
      }

      // Acquire lock to prevent double initialization (Redis primary, in-memory fallback).
      // This is what serialises a double-clicked connect button and a boot-time
      // recovery overlapping a manual create — and, unlike an in-process Map,
      // it also serialises across pm2 processes.
      try {
        const lockKey = `${REDIS_KEYS.SESSION_LOCK}${sessionId}`;
        const redisLock = await redisClient
          .getClient()
          .set(lockKey, process.pid.toString(), 'EX', 300, 'NX');
        if (!redisLock) {
          throw new Error(`Session ${sessionId} is already being initialized (lock exists)`);
        }
        lockAcquired = true;
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
        lockAcquired = true;
      }

      logger.info(`🚀 Creating session ${sessionId} with Baileys`);

      // Persist the session row BEFORE the socket exists (PR5a-bis: bind
      // tenantId on first create). whatsapp_auth_keys.session_id is a foreign
      // key onto whatsapp_sessions(session_id) and Baileys writes creds during
      // the handshake, so creating the socket first makes the very first
      // creds.update fail on a constraint violation — during pairing, where it
      // reads as "the QR did not work".
      await this.sessionManager.persistSession(sessionId, tenantId, process.env.WEBHOOK_URL);

      const session = await this.baileys.createSession(sessionId, tenantId);

      logger.info(`✅ Session ${sessionId} created successfully with Baileys`);
      return session;
    } catch (error) {
      // Release locks on failure -- ours only. A failure before the lock was
      // taken (the "already exists" guard, or losing the SET NX) owns nothing
      // to release.
      if (lockAcquired) {
        this.sessionInitLocks.delete(sessionId);
        try {
          await redisClient.del(`${REDIS_KEYS.SESSION_LOCK}${sessionId}`);
        } catch {
          /* ignore */
        }
      }
      logger.error(`Error creating session ${sessionId}:`, error);
      throw error;
    }
  }

  getSession(sessionId: string): WhatsAppSession | null {
    return this.baileys.getSession(sessionId);
  }

  async sendMessage(sessionId: string, to: string, message: string): Promise<SendMessageResponse> {
    try {
      const session = this.baileys.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: `Session ${sessionId} not found`,
        };
      }

      if (session.status !== 'ready') {
        return {
          success: false,
          error: `Session ${sessionId} is not ready. Status: ${session.status}`,
        };
      }

      // `to` may arrive bare, as @c.us or as @s.whatsapp.net — the manager
      // normalises all three. Do not normalise again here.
      return await this.baileys.sendMessage(sessionId, to, message);
    } catch (error) {
      logger.error(`Error in sendMessage for session ${sessionId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getSessionStatus(sessionId: string): Promise<WhatsAppSession | null> {
    return this.baileys.getSession(sessionId);
  }

  async getAllSessions(): Promise<WhatsAppSession[]> {
    return this.baileys.getAllSessions();
  }

  async destroySession(sessionId: string): Promise<void> {
    try {
      logger.info(`🗑️ Destroying session ${sessionId}`);

      // 'delete' is explicit: this is the REST delete, the one path that is
      // allowed to log the tenant out and wipe the stored credentials.
      await this.baileys.destroySession(sessionId, 'delete');

      // Deactivate the persisted row. No auth-cleanup callback: credentials
      // live in Postgres now and destroySession('delete') already cleared them.
      await this.sessionManager.destroySession(sessionId, undefined, undefined, 'delete');

      // Release locks
      this.sessionInitLocks.delete(sessionId);
      try {
        await redisClient.del(`${REDIS_KEYS.SESSION_LOCK}${sessionId}`);
      } catch {
        /* ignore */
      }

      logger.info(`✅ Session ${sessionId} destroyed completely`);
    } catch (error) {
      logger.error(`❌ Error destroying session ${sessionId}:`, error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    logger.info('🛑 Starting graceful shutdown...');

    // Stop health monitoring and periodic tasks
    try {
      SessionHealthCheckService.stopMonitoring();
      SessionHealthCheckService.offAlert(this.alertCallback);
      this.sessionManager.stopHeartbeatUpdates();
      logger.info('✅ Health monitoring and periodic tasks stopped');
    } catch (error) {
      logger.error('Error stopping health monitoring:', error);
    }

    // Close every socket. shutdownAll routes through mode 'shutdown', which
    // never clears credentials: a restart must not look like a session
    // deletion.
    await this.baileys.shutdownAll();

    // Mark the persisted rows disconnected so the dashboard does not keep
    // showing a 'ready' session for a process that is gone. The map argument
    // is empty on purpose — the sockets are already closed above.
    await this.sessionManager.shutdownAllSessions(new Map());

    logger.info('🏁 WhatsApp service graceful shutdown completed');
  }

  async forceDisconnectSession(sessionId: string): Promise<void> {
    logger.info(`💪 Force disconnecting (pause) session ${sessionId}`);

    try {
      // Closes the socket and writes the 'disconnected' status itself — the
      // facade must not write it a second time (two writers, same row, same
      // field). Credentials are kept, so no new QR is needed to resume.
      await this.baileys.forceDisconnect(sessionId);

      // The webhook is the facade's, and it is not part of what the manager
      // took over.
      await this.publisher.sendForceDisconnectWebhook(sessionId);

      logger.info(`✅ Session ${sessionId} paused successfully — credentials preserved`);
    } catch (error) {
      logger.error(`❌ Error pausing session ${sessionId}:`, error);
      throw error;
    }
  }

  // Private helper methods

  /**
   * `phoneNumber` arrives as bare E.164 digits, never a JID: the only caller is
   * IncomingMessagePipeline, which passes `dto.senderPhone`, and both
   * normalizers resolve that through a `toPhone` that strips the domain and
   * the device suffix and then rejects anything that is not E.164. The suffix
   * strips that used to live here were vestigial from before the ReplyPort
   * seam and matched nothing.
   */
  private async checkPhoneNumberAllowedWithLog(
    phoneNumber: string,
    sessionId: string,
    messagePreview?: string
  ): Promise<{ allowed: boolean; reason: string; leadInfo?: any }> {
    try {
      // Import the enhanced WhatsApp Authorization Service
      const { default: WhatsAppAuthorizationService } =
        await import('./WhatsAppAuthorizationService');

      logger.debug(`🔍 Checking authorization for phone number: ${phoneNumber}`);

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

      logger.info(`🔐 Authorization result for ${phoneNumber}: ${authorizationResult.decision}`, {
        reason: authorizationResult.reason,
        confidence: authorizationResult.confidence,
        leadId: authorizationResult.leadInfo?.id,
        leadName: authorizationResult.leadInfo?.name,
      });

      // Convert to legacy format for compatibility
      return {
        allowed: authorizationResult.decision === 'ALLOWED',
        reason: authorizationResult.reason,
        leadInfo: authorizationResult.leadInfo,
      };
    } catch (error) {
      logger.error('Error in enhanced authorization check:', error);

      // Fallback to conservative approach
      return {
        allowed: false,
        reason: 'Error en sistema de autorización - bloqueado por seguridad',
      };
    }
  }

  // Session recovery entry point kept for API compatibility
  async recoverSessionWithAuthValidation(
    sessionId: string,
    _persistedData?: any
  ): Promise<boolean> {
    try {
      logger.info(`🔄 Recovering session ${sessionId}`);
      await this.createSession(sessionId);
      return true;
    } catch (error) {
      logger.error(`Error recovering session ${sessionId}:`, error);
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
   * Get module status
   */
  getModuleStatus(): any {
    return {
      architecture: 'modular',
      engine: 'baileys',
      modules: {
        messageHandler: !!this.messageHandler,
        sessionManager: !!this.sessionManager,
        publisher: !!this.publisher,
        baileys: !!this.baileys,
      },
      webhookUrl: this.publisher.getWebhookUrl(),
    };
  }

  /**
   * Test webhook connectivity
   */
  async testWebhook(): Promise<{ success: boolean; error?: string }> {
    return await this.publisher.testWebhook();
  }

  /**
   * Get health info for a specific session.
   *
   * `hasLocalAuth` keeps its name but is now `store.hasCredentials` — a
   * Postgres read, not a file on disk. A database error propagates rather
   * than degrading to `false`: a pooler timeout means *unknown*, and
   * answering "no credentials" would mark a healthy session auth_failure and
   * demand a QR that was never needed.
   */
  async getSessionHealth(sessionId: string): Promise<{
    status: string;
    hasLocalAuth: boolean;
    heartbeatAge?: number;
    authInvalidated?: boolean;
  }> {
    return this.baileys.getSessionHealth(sessionId);
  }
}

export default new WhatsAppServiceSimple();
