import type { Client } from 'whatsapp-web.js';
import { logger } from '../../utils/logger';
import type { WhatsAppSession } from '../../types';
import SessionPersistenceService from '../SessionPersistenceService';
import redisClient, { REDIS_KEYS } from '../../config/redis';

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
   * Persist session to database
   */
  async persistSession(sessionId: string, webhookUrl?: string, authFileInfo?: any): Promise<void> {
    try {
      await SessionPersistenceService.saveSession({
        sessionId: sessionId,
        name: sessionId,
        status: 'connecting',
        lastSeen: new Date(),
        webhookUrl: webhookUrl,
        isActive: true,
        reconnectCount: 0,
        metadata: {
          clientId: sessionId,
          authDataPath: './wwebjs_auth',
          authFileExists: authFileInfo?.exists || false,
          authFileSize: authFileInfo?.size || 0,
          authFileModified: authFileInfo?.modified || null,
          sessionCreated: new Date().toISOString(),
          localAuthVersion: '1.0',
        },
      });

      logger.info(`📱 Session ${sessionId} persisted to database successfully`);
    } catch (error) {
      logger.error(`Error persisting session ${sessionId} to database:`, error);
      throw error;
    }
  }

  /**
   * Destroy a session completely
   */
  async destroySession(
    sessionId: string,
    client?: Client,
    cleanupCallback?: (sessionId: string) => Promise<void>
  ): Promise<void> {
    try {
      logger.info(`🗑️ Starting destruction of session ${sessionId}`);

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

      logger.info(`✅ Session ${sessionId} destroyed completely`);
    } catch (error) {
      logger.error(`❌ Error destroying session ${sessionId}:`, error);

      // Even on error, attempt to clean up memory and database
      this.sessions.delete(sessionId);

      try {
        await SessionPersistenceService.deactivateSession(sessionId);
      } catch (dbError) {
        logger.error(`Final database cleanup failed for session ${sessionId}:`, dbError);
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
  async shutdownAllSessions(
    clients: Map<string, Client>,
    cleanupCallback?: (sessionId: string) => Promise<void>
  ): Promise<void> {
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
        this.destroySession(sessionId, client, cleanupCallback)
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
          lastError: 'Server shutdown',
          metadata: {
            autoReconnect: false,
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
   */
  startHeartbeatUpdates(): void {
    if (this.heartbeatIntervalId) return;

    this.heartbeatIntervalId = setInterval(async () => {
      for (const [sessionId, session] of this.sessions) {
        if (session.status === 'ready') {
          try {
            await redisClient.set(
              `${REDIS_KEYS.SESSION_HEARTBEAT}${sessionId}`,
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
