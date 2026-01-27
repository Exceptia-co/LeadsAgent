import { PrismaClient } from '@leadcrm/db';
import { logger } from '../utils/logger';
import { WhatsAppSession } from '../types';

export interface SessionPersistenceData {
  id?: string;
  sessionId: string;
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
   * Load all active sessions from the database
   * @returns Promise<SessionPersistenceData[]> - Array of session data
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
   * Get session statistics
   * @returns Promise<SessionStats> - Session statistics
   */
  async getSessionStats(): Promise<{
    total: number;
    active: number;
    connected: number;
    connecting: number;
    disconnected: number;
  }> {
    try {
      const [total, active, connected, connecting, disconnected] = await Promise.all([
        this.prisma.whatsAppSession.count(),
        this.prisma.whatsAppSession.count({ where: { isActive: true } }),
        this.prisma.whatsAppSession.count({ where: { status: 'ready' } }),
        this.prisma.whatsAppSession.count({ where: { status: 'connecting' } }),
        this.prisma.whatsAppSession.count({ where: { status: 'disconnected' } }),
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
   * Close database connection
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

// Export singleton instance
export default new SessionPersistenceService();
