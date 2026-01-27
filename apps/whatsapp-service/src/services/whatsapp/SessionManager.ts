/**
 * @fileoverview SessionManager - Responsible for WhatsApp session lifecycle management
 * Part of WhatsAppServiceSimple refactoring following SRP
 */

import type { Client } from 'whatsapp-web.js';
import { logger } from '../../utils/logger';
import { LogExecutionTime, SafeExecutor } from '../../utils/decorators';
import { ErrorFactory } from '../../errors';
import { eventBus } from '../../events/EventBus';
import type {
  WhatsAppSession,
  ISessionManager,
  IWhatsAppSessionManager,
  Result,
} from '../../types';
import { isSuccess, isFailure, SessionStatus } from '../../types';

/**
 * SessionManager handles the lifecycle of WhatsApp sessions
 * Responsible for creating, managing, and destroying session instances
 */
export class SessionManager implements ISessionManager, IWhatsAppSessionManager {
  private sessions = new Map<string, WhatsAppSession>();
  private clients = new Map<string, Client>();

  /**
   * Initialize the session manager
   */
  public async initialize(): Promise<void> {
    try {
      logger.info('🚀 Initializing SessionManager');
      // Add any initialization logic here if needed
      logger.info('✅ SessionManager initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize SessionManager:', error);
      throw error;
    }
  }

  /**
   * Create a new WhatsApp session
   */
  @LogExecutionTime({ operationId: 'create-session' })
  public async createSession(sessionId: string): Promise<WhatsAppSession> {
    return SafeExecutor.execute(
      async () => {
        // Validate session doesn't exist
        if (this.sessions.has(sessionId)) {
          throw ErrorFactory.session(`Session ${sessionId} already exists`, sessionId);
        }

        // Create session object
        const session: WhatsAppSession = {
          id: sessionId,
          clientId: sessionId,
          status: 'connecting',
          lastSeen: new Date(),
        };

        // Store session
        this.sessions.set(sessionId, session);

        // Emit session created event
        await eventBus.publish('whatsapp:session-created', {
          sessionId,
          timestamp: new Date(),
        });

        logger.info(`✅ Session created successfully: ${sessionId}`);
        return session;
      },
      {
        operationName: 'create-session',
        context: { sessionId },
        timeout: 30000,
      }
    ).then(result => {
      if (isFailure(result)) {
        throw result.error;
      }
      return result.data;
    });
  }

  /**
   * Destroy a WhatsApp session and cleanup resources
   */
  @LogExecutionTime({ operationId: 'destroy-session' })
  public async destroySession(sessionId: string): Promise<void> {
    return SafeExecutor.execute(
      async () => {
        const session = this.sessions.get(sessionId);
        if (!session) {
          throw ErrorFactory.session(`Session ${sessionId} not found`, sessionId);
        }

        // Get client and disconnect if exists
        const client = this.clients.get(sessionId);
        if (client) {
          try {
            await client.destroy();
            logger.debug(`🔌 Client destroyed for session: ${sessionId}`);
          } catch (error) {
            logger.warn(`⚠️ Error destroying client for session ${sessionId}:`, error);
          }
          this.clients.delete(sessionId);
        }

        // Remove from memory
        this.sessions.delete(sessionId);

        // Emit session destroyed event
        await eventBus.publish('whatsapp:session-destroyed', {
          sessionId,
          timestamp: new Date(),
        });

        logger.info(`🗑️ Session destroyed successfully: ${sessionId}`);
      },
      {
        operationName: 'destroy-session',
        context: { sessionId },
        timeout: 15000,
      }
    ).then(result => {
      if (isFailure(result)) {
        throw result.error;
      }
    });
  }

  /**
   * Get a session by ID
   */
  public async getSession(sessionId: string): Promise<WhatsAppSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.debug(`Session not found: ${sessionId}`);
      return null;
    }

    // Update last seen timestamp
    session.lastSeen = new Date();
    this.sessions.set(sessionId, session);

    return { ...session }; // Return copy to prevent external mutation
  }

  /**
   * Get all active sessions
   */
  public async getAllSessions(): Promise<WhatsAppSession[]> {
    const sessions = Array.from(this.sessions.values());

    // Update last seen for all sessions
    const now = new Date();
    sessions.forEach(session => {
      session.lastSeen = now;
    });

    // Return copies to prevent external mutation
    return sessions.map(session => ({ ...session }));
  }

  /**
   * Update session status and related data
   */
  @LogExecutionTime({ operationId: 'update-session-status' })
  public async updateSessionStatus(
    sessionId: string,
    status: SessionStatus,
    data?: Partial<WhatsAppSession>
  ): Promise<void> {
    return SafeExecutor.execute(
      async () => {
        const session = this.sessions.get(sessionId);
        if (!session) {
          throw ErrorFactory.session(`Session ${sessionId} not found`, sessionId);
        }

        const previousStatus = session.status;
        const updatedSession: WhatsAppSession = {
          ...session,
          status,
          lastSeen: new Date(),
          updatedAt: new Date(),
          ...data,
        };

        this.sessions.set(sessionId, updatedSession);

        // Emit status change event if status actually changed
        if (previousStatus !== status) {
          await eventBus.publish('whatsapp:status-changed', {
            sessionId,
            oldStatus: previousStatus,
            newStatus: status,
            timestamp: new Date(),
            metadata: data,
          });

          logger.info(`📊 Session status updated: ${sessionId} (${previousStatus} → ${status})`);
        }
      },
      {
        operationName: 'update-session-status',
        context: { sessionId, status },
        timeout: 5000,
      }
    ).then(result => {
      if (isFailure(result)) {
        throw result.error;
      }
    });
  }

  /**
   * Register a WhatsApp client for a session
   */
  public registerClient(sessionId: string, client: Client): void {
    if (!this.sessions.has(sessionId)) {
      throw ErrorFactory.session(`Session ${sessionId} not found`, sessionId);
    }

    this.clients.set(sessionId, client);
    logger.debug(`🔗 Client registered for session: ${sessionId}`);
  }

  /**
   * Get WhatsApp client for session (returns any to match interface)
   */
  public getClient(sessionId: string): any {
    return this.clients.get(sessionId) || null;
  }

  /**
   * Check if session exists
   */
  public hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Check if session has an active client
   */
  public hasActiveClient(sessionId: string): boolean {
    return this.clients.has(sessionId);
  }

  /**
   * Check if session has active session
   */
  public hasActiveSession(sessionId: string): boolean {
    return this.hasActiveClient(sessionId) && this.isSessionReady(sessionId);
  }

  /**
   * Check if session is ready for operations
   */
  public isSessionReady(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.status === 'ready' && this.clients.has(sessionId);
  }

  /**
   * Get session count
   */
  public getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get active client count
   */
  public getActiveClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get sessions by status
   */
  public async getSessionsByStatus(status: SessionStatus): Promise<WhatsAppSession[]> {
    const sessions = Array.from(this.sessions.values()).filter(
      session => session.status === status
    );

    // Return copies to prevent external mutation
    return sessions.map(session => ({ ...session }));
  }

  /**
   * Restore session from persisted data
   */
  public async restoreSession(sessionId: string): Promise<boolean> {
    try {
      logger.info(`🔄 Attempting to restore session: ${sessionId}`);

      // This would typically involve loading session data from storage
      // For now, return false as restoration isn't implemented
      logger.warn(`⚠️ Session restoration not implemented for: ${sessionId}`);
      return false;
    } catch (error) {
      logger.error(`❌ Failed to restore session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Get session data for persistence
   */
  public async getSessionData(sessionId: string): Promise<any> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return null;
      }

      // Return session data that can be persisted
      return {
        id: session.id,
        status: session.status,
        connectedNumber: session.connectedNumber,
        lastSeen: session.lastSeen,
        qrCode: session.qrCode,
        metadata: session.metadata || {},
      };
    } catch (error) {
      logger.error(`❌ Failed to get session data for ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Clear session data from persistence
   */
  public async clearSessionData(sessionId: string): Promise<void> {
    try {
      logger.info(`🧹 Clearing session data for: ${sessionId}`);

      // Remove from memory
      this.sessions.delete(sessionId);
      this.clients.delete(sessionId);

      logger.info(`✅ Session data cleared for: ${sessionId}`);
    } catch (error) {
      logger.error(`❌ Failed to clear session data for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Get QR code for session
   */
  public async getQrCode(sessionId: string): Promise<string | null> {
    try {
      const session = this.sessions.get(sessionId);
      return session?.qrCode || null;
    } catch (error) {
      logger.error(`❌ Failed to get QR code for session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Get session status with extended info
   */
  public async getSessionStatus(sessionId: string): Promise<{
    id: string;
    status: SessionStatus;
    qrCode?: string;
    clientInfo?: any;
    lastSeen?: Date;
  } | null> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return null;
      }

      return {
        id: session.id,
        status: session.status,
        qrCode: session.qrCode,
        clientInfo: session.clientInfo || null,
        lastSeen: session.lastSeen,
      };
    } catch (error) {
      logger.error(`❌ Failed to get session status for ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Get basic session info without full session data
   */
  public getBasicSessionInfo(sessionId: string): {
    id: string;
    status: string;
    connectedNumber?: string;
    lastSeen?: Date;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      id: session.id,
      status: session.status,
      connectedNumber: session.connectedNumber,
      lastSeen: session.lastSeen,
    };
  }

  /**
   * Clean up inactive sessions (sessions without clients after certain time)
   */
  @LogExecutionTime({ operationId: 'cleanup-inactive-sessions' })
  public async cleanupInactiveSessions(maxInactiveTime: number = 30 * 60 * 1000): Promise<number> {
    return SafeExecutor.execute(
      async () => {
        const now = Date.now();
        const sessionsToCleanup: string[] = [];

        for (const [sessionId, session] of this.sessions.entries()) {
          const timeSinceLastSeen = now - session.lastSeen.getTime();
          const hasNoClient = !this.clients.has(sessionId);

          if (hasNoClient && timeSinceLastSeen > maxInactiveTime) {
            sessionsToCleanup.push(sessionId);
          }
        }

        // Cleanup identified sessions
        for (const sessionId of sessionsToCleanup) {
          await this.destroySession(sessionId);
        }

        if (sessionsToCleanup.length > 0) {
          logger.info(`🧹 Cleaned up ${sessionsToCleanup.length} inactive sessions`);
        }

        return sessionsToCleanup.length;
      },
      {
        operationName: 'cleanup-inactive-sessions',
        timeout: 60000,
      }
    ).then(result => {
      if (isFailure(result)) {
        throw result.error;
      }
      return result.data;
    });
  }

  /**
   * Get session metrics for a specific session
   */
  public getSessionMetrics(sessionId: string): any {
    const session = this.sessions.get(sessionId);
    const hasClient = this.clients.has(sessionId);

    if (!session) {
      return null;
    }

    const uptime = Date.now() - (session.createdAt?.getTime() || session.lastSeen.getTime());
    const lastSeenAgo = Date.now() - session.lastSeen.getTime();

    return {
      sessionId: session.id,
      status: session.status,
      hasClient,
      isReady: this.isSessionReady(sessionId),
      connectedNumber: session.connectedNumber,
      uptime: Math.floor(uptime / 1000), // seconds
      lastSeenAgo: Math.floor(lastSeenAgo / 1000), // seconds
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      metadata: session.metadata || {},
      clientInfo: session.clientInfo || null,
    };
  }

  /**
   * Get all active sessions
   */
  public getActiveSessions(): WhatsAppSession[] {
    const sessions = Array.from(this.sessions.values());

    // Filter only active sessions (those with clients and ready status)
    const activeSessions = sessions.filter(session => {
      return (
        this.clients.has(session.id) &&
        (session.status === 'ready' ||
          session.status === 'authenticated' ||
          session.status === 'connected')
      );
    });

    // Return copies to prevent external mutation
    return activeSessions.map(session => ({ ...session }));
  }

  /**
   * Get session statistics
   */
  public getStats(): {
    totalSessions: number;
    activeClients: number;
    statusBreakdown: Record<SessionStatus, number>;
  } {
    const sessions = Array.from(this.sessions.values());
    const statusBreakdown = sessions.reduce(
      (acc, session) => {
        acc[session.status] = (acc[session.status] || 0) + 1;
        return acc;
      },
      {} as Record<SessionStatus, number>
    );

    return {
      totalSessions: sessions.length,
      activeClients: this.clients.size,
      statusBreakdown,
    };
  }
}
