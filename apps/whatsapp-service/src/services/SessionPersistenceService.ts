import { PrismaClient } from '@leadcrm/db';
import { logger } from '../utils/logger';
import { WhatsAppSession } from '../types';
import type { SnapshotData } from './auth-snapshot/types';

export interface SessionPersistenceData {
  id?: string;
  sessionId: string;
  /**
   * PR5a-bis: tenant that owns this session. Required on the FIRST save
   * (create path) so the row carries an owner. Subsequent updates do NOT
   * overwrite tenantId — once set it's immutable from this service's POV.
   */
  tenantId?: string;
  name?: string;
  status: string;
  qrCode?: string;
  connectedNumber?: string;
  authData?: any;
  lastSeen: Date;
  isActive?: boolean;
  reconnectCount?: number;
  lastError?: string;
  webhookUrl?: string;
  metadata?: any;
}

/**
 * Service for persisting WhatsApp session state to the database
 * Implements the Repository pattern for session data management
 */
export class SessionPersistenceService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Save or update a session in the database
   * @param sessionData - Session data to persist
   * @returns Promise<boolean> - Success status
   */
  async saveSession(sessionData: SessionPersistenceData): Promise<boolean> {
    try {
      await this.prisma.whatsAppSession.upsert({
        where: { sessionId: sessionData.sessionId },
        update: {
          name: sessionData.name,
          status: sessionData.status,
          qrCode: sessionData.qrCode,
          connectedNumber: sessionData.connectedNumber,
          authData: sessionData.authData,
          lastSeen: sessionData.lastSeen,
          isActive: sessionData.isActive ?? true,
          reconnectCount: sessionData.reconnectCount ?? 0,
          lastError: sessionData.lastError,
          webhookUrl: sessionData.webhookUrl,
          metadata: sessionData.metadata,
          updatedAt: new Date(),
        },
        create: {
          sessionId: sessionData.sessionId,
          tenantId: sessionData.tenantId ?? null,
          name: sessionData.name,
          status: sessionData.status,
          qrCode: sessionData.qrCode,
          connectedNumber: sessionData.connectedNumber,
          authData: sessionData.authData,
          lastSeen: sessionData.lastSeen,
          isActive: sessionData.isActive ?? true,
          reconnectCount: sessionData.reconnectCount ?? 0,
          lastError: sessionData.lastError,
          webhookUrl: sessionData.webhookUrl,
          metadata: sessionData.metadata,
        },
      });

      logger.debug(`Session ${sessionData.sessionId} saved to database`);
      return true;
    } catch (error) {
      logger.error(`Error saving session ${sessionData.sessionId}:`, error);
      return false;
    }
  }

  /**
   * Load all active sessions from the database (tenant-agnostic).
   *
   * PR5a-bis: only callable from internal restoration on boot — the HTTP
   * layer must use `loadActiveSessionsForTenant`. Kept tenant-agnostic
   * because session restoration must hydrate every persisted session
   * regardless of tenant.
   */
  async loadActiveSessions(): Promise<SessionPersistenceData[]> {
    try {
      const sessions = await this.prisma.whatsAppSession.findMany({
        where: {
          isActive: true,
        },
        orderBy: {
          lastSeen: 'desc',
        },
      });

      logger.info(`Loaded ${sessions.length} active sessions from database`);
      return sessions.map(this.mapToSessionData);
    } catch (error) {
      logger.error('Error loading active sessions:', error);
      return [];
    }
  }

  /**
   * PR5a-bis (Codex finding #1): tenant-scoped variant for HTTP callers.
   * Returns only the sessions owned by the caller's tenant. Sessions
   * with tenantId=null are EXCLUDED — they're legacy pre-backfill rows
   * that should not leak through any tenant view.
   */
  async loadActiveSessionsForTenant(
    tenantId: string
  ): Promise<SessionPersistenceData[]> {
    try {
      const sessions = await this.prisma.whatsAppSession.findMany({
        where: {
          isActive: true,
          tenantId,
        },
        orderBy: {
          lastSeen: 'desc',
        },
      });
      return sessions.map(this.mapToSessionData);
    } catch (error) {
      logger.error(
        `Error loading active sessions for tenant ${tenantId}:`,
        error
      );
      return [];
    }
  }

  /**
   * PR5a-bis: returns the tenantId that owns a session, or null if the
   * session row has no tenantId yet (pre-backfill). Used by SessionController
   * to assert ownership before any session-scoped mutation.
   */
  async getSessionTenantId(sessionId: string): Promise<string | null> {
    try {
      const row = await this.prisma.whatsAppSession.findUnique({
        where: { sessionId },
        select: { tenantId: true },
      });
      return row?.tenantId ?? null;
    } catch (error) {
      logger.error(`Error reading tenantId for session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Get a specific session by sessionId
   * @param sessionId - The session ID to retrieve
   * @returns Promise<SessionPersistenceData | null>
   */
  async getSession(sessionId: string): Promise<SessionPersistenceData | null> {
    try {
      const session = await this.prisma.whatsAppSession.findUnique({
        where: { sessionId },
      });

      if (!session) {
        return null;
      }

      return this.mapToSessionData(session);
    } catch (error) {
      logger.error(`Error getting session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Mark a session as inactive (soft delete)
   * @param sessionId - Session ID to deactivate
   * @returns Promise<boolean> - Success status
   */
  async deactivateSession(sessionId: string): Promise<boolean> {
    try {
      await this.prisma.whatsAppSession.update({
        where: { sessionId },
        data: {
          isActive: false,
          status: 'disconnected',
          updatedAt: new Date(),
        },
      });

      logger.info(`Session ${sessionId} marked as inactive`);
      return true;
    } catch (error) {
      logger.error(`Error deactivating session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Update session status and last seen
   * @param sessionId - Session ID to update
   * @param status - New status
   * @param additionalData - Additional data to update
   * @returns Promise<boolean> - Success status
   */
  async updateSessionStatus(
    sessionId: string,
    status: string,
    additionalData?: Partial<SessionPersistenceData>
  ): Promise<boolean> {
    try {
      const updateData: any = {
        status,
        lastSeen: new Date(),
        updatedAt: new Date(),
      };

      // Add optional fields if provided
      if (additionalData?.qrCode !== undefined) updateData.qrCode = additionalData.qrCode;
      if (additionalData?.connectedNumber !== undefined)
        updateData.connectedNumber = additionalData.connectedNumber;
      if (additionalData?.lastError !== undefined) updateData.lastError = additionalData.lastError;
      if (additionalData?.reconnectCount !== undefined)
        updateData.reconnectCount = additionalData.reconnectCount;
      if (additionalData?.metadata !== undefined) updateData.metadata = additionalData.metadata;

      await this.prisma.whatsAppSession.update({
        where: { sessionId },
        data: updateData,
      });

      logger.debug(`Session ${sessionId} status updated to ${status}`);
      return true;
    } catch (error) {
      logger.error(`Error updating session ${sessionId} status:`, error);
      return false;
    }
  }

  /**
   * Clean up old inactive sessions
   * @param daysOld - Days to consider old (default: 7)
   * @returns Promise<number> - Number of sessions cleaned
   */
  async cleanupOldSessions(daysOld: number = 7): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await this.prisma.whatsAppSession.deleteMany({
        where: {
          AND: [{ isActive: false }, { updatedAt: { lt: cutoffDate } }],
        },
      });

      logger.info(`Cleaned up ${result.count} old sessions`);
      return result.count;
    } catch (error) {
      logger.error('Error cleaning up old sessions:', error);
      return 0;
    }
  }

  /**
   * Get session statistics.
   *
   * PR5a-quinquies (Codex review #4): tenant scoping.
   *  - tenantId provided  -> counts scoped to that tenant only.
   *  - tenantId omitted   -> global counts (operator-only callers — the
   *                          HTTP dashboard route always passes tenantId).
   */
  async getSessionStats(tenantId?: string): Promise<{
    total: number;
    active: number;
    connected: number;
    connecting: number;
    disconnected: number;
  }> {
    try {
      const baseWhere = tenantId ? { tenantId } : {};
      const [total, active, connected, connecting, disconnected] = await Promise.all([
        this.prisma.whatsAppSession.count({ where: baseWhere }),
        this.prisma.whatsAppSession.count({
          where: { ...baseWhere, isActive: true },
        }),
        this.prisma.whatsAppSession.count({
          where: { ...baseWhere, status: 'ready' },
        }),
        this.prisma.whatsAppSession.count({
          where: { ...baseWhere, status: 'connecting' },
        }),
        this.prisma.whatsAppSession.count({
          where: { ...baseWhere, status: 'disconnected' },
        }),
      ]);

      return { total, active, connected, connecting, disconnected };
    } catch (error) {
      logger.error('Error getting session stats:', error);
      return { total: 0, active: 0, connected: 0, connecting: 0, disconnected: 0 };
    }
  }

  /**
   * Increment reconnect count for a session
   * @param sessionId - Session ID
   * @returns Promise<boolean> - Success status
   */
  async incrementReconnectCount(sessionId: string): Promise<boolean> {
    try {
      await this.prisma.whatsAppSession.update({
        where: { sessionId },
        data: {
          reconnectCount: { increment: 1 },
          updatedAt: new Date(),
        },
      });

      logger.debug(`Reconnect count incremented for session ${sessionId}`);
      return true;
    } catch (error) {
      logger.error(`Error incrementing reconnect count for ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Map database record to SessionPersistenceData
   * @private
   */
  private mapToSessionData(dbSession: any): SessionPersistenceData {
    return {
      id: dbSession.id,
      sessionId: dbSession.sessionId,
      tenantId: dbSession.tenantId ?? undefined,
      name: dbSession.name,
      status: dbSession.status,
      qrCode: dbSession.qrCode,
      connectedNumber: dbSession.connectedNumber,
      authData: dbSession.authData,
      lastSeen: dbSession.lastSeen,
      isActive: dbSession.isActive,
      reconnectCount: dbSession.reconnectCount,
      lastError: dbSession.lastError,
      webhookUrl: dbSession.webhookUrl,
      metadata: dbSession.metadata,
    };
  }

  /**
   * Get snapshot data from session's authData field
   */
  async getSnapshotData(sessionId: string): Promise<SnapshotData | null> {
    try {
      const session = await this.prisma.whatsAppSession.findUnique({
        where: { sessionId },
        select: { authData: true },
      });

      if (!session?.authData) return null;

      const authData = session.authData as any;
      if (authData?.metadata && authData?.data) {
        return authData as SnapshotData;
      }

      return null;
    } catch (error) {
      logger.error(`Error getting snapshot data for ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Save snapshot data to session's authData field
   */
  async saveSnapshotData(sessionId: string, data: SnapshotData): Promise<boolean> {
    try {
      await this.prisma.whatsAppSession.update({
        where: { sessionId },
        data: {
          authData: data as any,
          updatedAt: new Date(),
        },
      });

      logger.info(
        `Snapshot saved for session ${sessionId}: ${(data.metadata.sizeBytes / 1024 / 1024).toFixed(2)}MB`
      );
      return true;
    } catch (error) {
      logger.error(`Error saving snapshot data for ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Clear snapshot data from session's authData field
   */
  async clearSnapshotData(sessionId: string): Promise<boolean> {
    try {
      await this.prisma.whatsAppSession.update({
        where: { sessionId },
        data: {
          authData: null as any,
          updatedAt: new Date(),
        },
      });

      logger.info(`Snapshot data cleared for session ${sessionId}`);
      return true;
    } catch (error) {
      logger.error(`Error clearing snapshot data for ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Close database connection
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

// Export singleton instance
export default new SessionPersistenceService();
