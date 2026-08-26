import { logger } from '../../utils/logger';
import type { WhatsAppSession } from '../../types';
import SessionPersistenceService from '../SessionPersistenceService';
import redisClient, { REDIS_KEYS } from '../../config/redis';

/**
 * Structural stand-in for the engine client this class used to receive
 * directly. Post-cutover, every real call site passes `undefined` (or an
 * empty Map) here -- BaileysSessionManager owns the live socket -- so this
 * only needs to describe the one method destroySession ever called.
 */
type DestroyableClient = { destroy(): Promise<void> };

/**
 * SessionManager - Handles session lifecycle, status management, and persistence operations
 *
 * Responsibilities:
 * - Session creation, retrieval, and destruction
 * - Session status updates and health tracking
 * - Integration with persistence layer
 * - Session cleanup and memory management
 * - Session recovery and validation
 *
 * Extracted from WhatsAppServiceSimple lines: 83-227, 232-234, 635-707, 709-731
 */
export class SessionManager {
  /**
   * No longer populated after the Baileys cutover: BaileysSessionManager owns
   * the live session map, and WhatsAppServiceSimple reads it from there. This
   * map, and every accessor over it (getSession, getAllSessions, hasSession,
   * createSessionObject, …), is dead weight -- this class's remaining live
   * role is the persisted session row (status writes, disconnect policy), not
   * the in-memory map. Do not add a reader: it will always be empty.
   */
  private sessions: Map<string, WhatsAppSession> = new Map();
  private heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
  private statusUpdateLocks: Map<string, Promise<void>> = new Map();

  /**
   * Promise-chaining mutex to prevent concurrent status updates for the same session
   */
  private async withSessionLock(sessionId: string, fn: () => Promise<void>): Promise<void> {
    const prev = this.statusUpdateLocks.get(sessionId) || Promise.resolve();
    const current = prev.then(fn, fn);
    this.statusUpdateLocks.set(sessionId, current);
    try {
      await current;
    } finally {
      if (this.statusUpdateLocks.get(sessionId) === current) {
        this.statusUpdateLocks.delete(sessionId);
      }
    }
  }

  /**
   * Create a new session object
   */
  createSessionObject(sessionId: string, webhookUrl?: string): WhatsAppSession {
    const session: WhatsAppSession = {
      id: sessionId,
      clientId: sessionId,
      status: 'connecting',
      lastSeen: new Date(),
      webhookUrl: webhookUrl,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): WhatsAppSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get all active sessions
   */
  async getAllSessions(): Promise<WhatsAppSession[]> {
    const sessions: WhatsAppSession[] = [];
    this.sessions.forEach(session => sessions.push(session));
    return sessions;
  }

  /**
   * Update session status in database, memory, and Redis (DB-first 3-layer sync)
   */
  async updateSessionStatus(
    sessionId: string,
    status: WhatsAppSession['status'],
    data?: any
  ): Promise<void> {
    await this.withSessionLock(sessionId, async () => {
      // Layer 1 (primary): Persist to database FIRST — DB is source of truth for recovery
      try {
        await SessionPersistenceService.updateSessionStatus(sessionId, status, data);
      } catch (dbError) {
        logger.error(`DB write failed for session ${sessionId} status update, aborting:`, dbError);
        throw dbError;
      }

      // Layer 2: Update in-memory session (only after DB succeeds)
      const session = this.sessions.get(sessionId);
      if (session) {
        session.status = status;
        session.lastSeen = new Date();
        if (data) {
          Object.assign(session, data);
        }
      }

      // Layer 3: Sync to Redis for fast dashboard access (non-blocking)
      try {
        await redisClient.setObject(
          `${REDIS_KEYS.SESSION_STATUS}${sessionId}`,
          {
            status,
            connectedNumber: data?.connectedNumber,
            lastSeen: new Date().toISOString(),
          },
          3600
        ); // 1h TTL
      } catch (redisError) {
        logger.warn(`Redis status sync failed for ${sessionId}:`, redisError);
      }
    });
  }

  /**
   * Persist session to database.
   *
   * PR5a-bis: tenantId is required when creating a NEW session row.
   * Existing rows keep their tenantId (saveSession only writes tenantId
   * on the create path). Callers that don't have a tenantId yet (legacy)
   * may pass undefined; the row will land with tenantId=null and require
   * a backfill — but the HTTP layer prevents this for new creates.
   */
  async persistSession(sessionId: string, tenantId?: string, webhookUrl?: string): Promise<void> {
    try {
      // saveSession catches its own errors and returns false, so ordering this
      // ahead of the socket is not enough on its own: a database blip would
      // leave no session row, the socket would open anyway, and the first
      // creds.update would hit the whatsapp_auth_keys -> whatsapp_sessions
      // foreign key inside a handler whose guard() swallows the rejection into
      // a log line. The session pairs, works, and silently stores no
      // credentials -- then demands a fresh QR at the next restart with
      // nothing pointing at why.
      const saved = await SessionPersistenceService.saveSession({
        sessionId: sessionId,
        tenantId,
        name: sessionId,
        status: 'connecting',
        lastSeen: new Date(),
        webhookUrl: webhookUrl,
        isActive: true,
        reconnectCount: 0,
        // The authFileInfo parameter and its four metadata fields went with
        // the disk-auth layer: nothing read them, and they described a
        // directory that no longer exists. Credentials live in
        // whatsapp_auth_keys now, keyed by this row's sessionId.
        metadata: {
          clientId: sessionId,
          sessionCreated: new Date().toISOString(),
        },
      });
      if (!saved) {
        throw new Error(`Failed to persist session ${sessionId}`);
      }

      logger.info(`📱 Session ${sessionId} persisted to database successfully`);
    } catch (error) {
      logger.error(`Error persisting session ${sessionId} to database:`, error);
      throw error;
    }
  }

  /**
   * Tear down a session's in-memory client and, depending on `mode`, its
   * persisted state. `mode: 'delete'` (the default, for backwards
   * compatibility with existing callers) deactivates the session in the
   * database and runs the auth-cleanup callback -- a real deletion.
   * `mode: 'shutdown'` only destroys the in-memory client; it deliberately
   * leaves the database row and auth files untouched, because a process
   * restart must not look like the tenant logging out.
   */
  async destroySession(
    sessionId: string,
    client?: DestroyableClient,
    cleanupCallback?: (sessionId: string) => Promise<void>,
    mode: 'shutdown' | 'delete' = 'delete'
  ): Promise<void> {
    try {
      logger.info(`🗑️ Starting ${mode} of session ${sessionId}`);

      // Destroy WhatsApp client if provided
      if (client) {
        try {
          await client.destroy();
          logger.info(`WhatsApp client for session ${sessionId} destroyed successfully`);
        } catch (clientError) {
          logger.warn(`Error destroying WhatsApp client for session ${sessionId}:`, clientError);
          // Continue with cleanup even if client destruction fails
        }
      }

      // Remove from memory
      this.sessions.delete(sessionId);

      // Shutdown is not deletion: a restart must leave the session row and its
      // credentials exactly as they were, or every deploy logs the tenant out.
      if (mode === 'delete') {
        // Deactivate session in database
        try {
          await SessionPersistenceService.deactivateSession(sessionId);
          logger.info(`Session ${sessionId} deactivated in database`);
        } catch (dbError) {
          logger.error(`Error deactivating session ${sessionId} in database:`, dbError);
          // Continue with cleanup even if database update fails
        }

        // Execute custom cleanup callback if provided
        if (cleanupCallback) {
          try {
            await cleanupCallback(sessionId);
            logger.info(`Custom cleanup completed for session ${sessionId}`);
          } catch (cleanupError) {
            logger.error(`Error in custom cleanup for session ${sessionId}:`, cleanupError);
            // Don't throw - allow cleanup to continue
          }
        }
      }

      logger.info(`✅ Session ${sessionId} destroyed completely`);
    } catch (error) {
      logger.error(`❌ Error destroying session ${sessionId}:`, error);

      // Even on error, attempt to clean up memory and database
      this.sessions.delete(sessionId);

      // Same shutdown/delete gate as the main path -- a shutdown-mode error
      // must not deactivate the session either.
      if (mode === 'delete') {
        try {
          await SessionPersistenceService.deactivateSession(sessionId);
        } catch (dbError) {
          logger.error(`Final database cleanup failed for session ${sessionId}:`, dbError);
        }
      }

      throw error;
    }
  }

  /**
   * Force disconnect a session
   */
  async forceDisconnectSession(sessionId: string): Promise<void> {
    logger.info(`💪 Force disconnecting session ${sessionId}`);

    try {
      // Mark as disconnected immediately
      await this.updateSessionStatus(sessionId, 'disconnected', {
        lastError: 'Force disconnected by user',
        metadata: {
          autoReconnect: false,
          forceDisconnected: true,
          disconnectedAt: new Date().toISOString(),
        },
      });

      logger.info(`✅ Session ${sessionId} force disconnected successfully`);
    } catch (error) {
      logger.error(`❌ Error force disconnecting session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Handle session disconnect with different strategies
   */
  async handleSessionDisconnect(
    sessionId: string,
    disconnectType: string,
    originalReason?: any
  ): Promise<void> {
    try {
      logger.info(`🔌 Handling session disconnect: ${sessionId} - Type: ${disconnectType}`);

      let shouldAutoReconnect = true;
      let authInvalidated = false;
      let errorMessage = `Session disconnected: ${disconnectType}`;

      // Determine reconnection strategy based on disconnect type
      switch (disconnectType) {
        case 'BROWSER_CLOSED':
        case 'PAGE_CLOSED':
        case 'PAGE_ERROR':
          shouldAutoReconnect = false; // User intentionally closed browser
          errorMessage = `Browser was closed by user: ${disconnectType}`;
          break;

        case 'WHATSAPP_UNPAIRED':
        case 'WHATSAPP_TIMEOUT':
        // Baileys' 401. Without this case it falls to `default`, which
        // persists 'disconnected' with authInvalidated:false — the dashboard
        // reads status, so a logged-out session would look like a plain
        // network drop instead of one that needs a new QR.
        case 'WHATSAPP_LOGGED_OUT':
          shouldAutoReconnect = false; // WhatsApp Web session expired / unlinked from phone
          authInvalidated = true;
          errorMessage = `WhatsApp Web session expired: ${disconnectType}`;
          break;

        case 'NETWORK_ERROR':
          shouldAutoReconnect = true; // Network issues might be temporary
          errorMessage = `Network error: ${originalReason || disconnectType}`;
          break;

        default:
          shouldAutoReconnect = false; // Conservative approach for unknown reasons
          errorMessage = `Unknown disconnect: ${originalReason || disconnectType}`;
      }

      // Update session status in all 3 layers (memory, DB, Redis)
      // Note: we keep the session in the memory Map so the dashboard can still see it.
      // Only destroySession() should remove from memory (intentional delete).
      await this.updateSessionStatus(sessionId, authInvalidated ? 'auth_failure' : 'disconnected', {
        lastError: errorMessage,
        metadata: {
          disconnectType,
          autoReconnect: shouldAutoReconnect,
          authInvalidated,
          lastHealthCheck: new Date().toISOString(),
          originalReason: originalReason?.toString() || 'N/A',
          disconnectedAt: new Date().toISOString(),
        },
      });

      logger.info(
        `✅ Session disconnect handled: ${sessionId} (autoReconnect: ${shouldAutoReconnect})`
      );
    } catch (error) {
      logger.error(`❌ Error handling session disconnect for ${sessionId}:`, error);
    }
  }

  /**
   * Shutdown all sessions gracefully
   */
  async shutdownAllSessions(clients: Map<string, DestroyableClient>): Promise<void> {
    logger.info('🛑 Starting graceful shutdown of all sessions...');

    const sessionIds = Array.from(this.sessions.keys());
    logger.info(`🔄 Shutting down ${sessionIds.length} active sessions...`);

    // Shutdown all sessions with timeout
    const shutdownPromises = sessionIds.map(async sessionId => {
      return new Promise<void>(resolve => {
        const timeoutId = setTimeout(() => {
          logger.warn(`⚠️ Timeout shutting down session ${sessionId}, forcing cleanup`);
          this.sessions.delete(sessionId);
          resolve();
        }, 10000); // 10 second timeout per session

        const client = clients.get(sessionId);
        this.destroySession(sessionId, client, undefined, 'shutdown')
          .then(() => {
            clearTimeout(timeoutId);
            logger.info(`✅ Session ${sessionId} shutdown complete`);
            resolve();
          })
          .catch(error => {
            clearTimeout(timeoutId);
            logger.error(`❌ Error shutting down session ${sessionId}:`, error);
            // Force cleanup even on error
            this.sessions.delete(sessionId);
            resolve();
          });
      });
    });

    try {
      // Wait for all sessions to shutdown (max 30 seconds total)
      await Promise.race([
        Promise.all(shutdownPromises),
        new Promise(resolve => setTimeout(resolve, 30000)),
      ]);

      logger.info('✅ All sessions shutdown completed');
    } catch (error) {
      logger.error('❌ Error during session shutdown:', error);
    }

    // Final cleanup - mark all remaining sessions as disconnected in database
    try {
      const remainingSessions = await SessionPersistenceService.loadActiveSessions();
      for (const session of remainingSessions) {
        await SessionPersistenceService.updateSessionStatus(session.sessionId, 'disconnected', {
          metadata: {
            ...(session.metadata ?? {}),
            shutdownReason: 'Server shutdown',
            shutdownTimestamp: new Date().toISOString(),
          },
        });
      }
      logger.info(`✅ Database cleanup completed for ${remainingSessions.length} sessions`);
    } catch (error) {
      logger.error('❌ Error during database cleanup:', error);
    }
  }

  /**
   * Check if session exists in memory
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Clear all sessions from memory (emergency cleanup)
   */
  clearAllSessions(): void {
    logger.warn('🧹 Emergency clearing all sessions from memory');
    this.sessions.clear();
  }

  /**
   * Recover session with persistence validation
   */
  async recoverSessionWithAuthValidation(
    sessionId: string,
    createSessionCallback: (sessionId: string) => Promise<WhatsAppSession>
  ): Promise<boolean> {
    try {
      logger.info(`🔄 Recovering session ${sessionId} with persistence validation`);

      // Proceed with session creation using callback
      const session = await createSessionCallback(sessionId);

      // Store in memory
      this.sessions.set(sessionId, session);

      return true;
    } catch (error) {
      logger.error(`Error recovering session ${sessionId} with validation:`, error);
      return false;
    }
  }

  /**
   * Start heartbeat updates for all ready sessions
   * Sets Redis key with TTL 120s every 30s
   *
   * `listSessions` is injected because this class no longer owns the live
   * session map — the engine does. Reading `this.sessions` here would write
   * no heartbeats at all.
   */
  startHeartbeatUpdates(listSessions: () => Promise<WhatsAppSession[]>): void {
    if (this.heartbeatIntervalId) return;

    this.heartbeatIntervalId = setInterval(async () => {
      let sessions: WhatsAppSession[];
      try {
        sessions = await listSessions();
      } catch {
        return; // Silently ignore heartbeat failures
      }
      for (const session of sessions) {
        if (session.status === 'ready') {
          try {
            await redisClient.set(
              `${REDIS_KEYS.SESSION_HEARTBEAT}${session.id}`,
              Date.now().toString(),
              120
            );
          } catch {
            // Silently ignore heartbeat failures
          }
        }
      }
    }, 30000);

    logger.info('Session heartbeat updates started (every 30s)');
  }

  /**
   * Stop heartbeat updates
   */
  stopHeartbeatUpdates(): void {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
      logger.info('Session heartbeat updates stopped');
    }
  }
}

export default new SessionManager();
