import type { Request, Response } from 'express';
import WhatsAppService from '../services/WhatsAppService';
import SessionPersistenceService from '../services/SessionPersistenceService';
import SessionRecoveryService from '../services/SessionRecoveryService';
import { logger } from '../utils/logger';

/**
 * PR5a-bis (Codex finding #1): every session endpoint is now tenant-scoped.
 * `req.tenantId` is set by the HMAC middleware (see `middleware/auth.ts`)
 * after it validates that the dashboard signed the request with a real
 * Tenant.id. Requests without a tenant context never reach these handlers.
 */
export class SessionController {
  /**
   * Asserts that `sessionId` exists and is owned by `tenantId`. Returns
   *   "ok"        — caller may proceed
   *   "not_found" — session row doesn't exist (404)
   *   "forbidden" — session exists but belongs to another tenant (404 to
   *                 the client to avoid id-existence leak; logged as
   *                 forbidden internally)
   */
  private async assertSessionOwnership(
    sessionId: string,
    tenantId: string
  ): Promise<'ok' | 'not_found' | 'forbidden'> {
    const ownerTenantId = await SessionPersistenceService.getSessionTenantId(sessionId);
    if (ownerTenantId === null) return 'not_found';
    if (ownerTenantId !== tenantId) {
      logger.warn(
        `[TENANT-GUARD] tenant ${tenantId} attempted to access session ${sessionId} owned by ${ownerTenantId}`
      );
      return 'forbidden';
    }
    return 'ok';
  }

  private requireTenant(req: Request, res: Response): string | null {
    if (!req.tenantId) {
      // The HMAC middleware should have rejected this already; defense in
      // depth in case a route is mounted before the middleware.
      res.status(403).json({ success: false, error: 'tenant context required' });
      return null;
    }
    return req.tenantId;
  }

  // Create a new WhatsApp session
  async createSession(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.requireTenant(req, res);
      if (!tenantId) return;

      const { sessionId } = req.body;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'Session ID is required',
        });
        return;
      }

      // PR5a-bis: if the sessionId is already registered to another
      // tenant, refuse — sessionId is a global identifier today (PR5b
      // will compose it with tenantId). Returning 409 is friendlier than
      // letting WhatsAppService.createSession blow up on its uniqueness
      // check.
      const existingOwner = await SessionPersistenceService.getSessionTenantId(sessionId);
      if (existingOwner !== null && existingOwner !== tenantId) {
        res.status(409).json({
          success: false,
          error: 'Session ID is already registered to another tenant',
        });
        return;
      }

      const session = await WhatsAppService.createSession(sessionId, tenantId);

      res.status(201).json({
        success: true,
        data: session,
      });
    } catch (error) {
      logger.error('Error creating session:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Get session status.
  //
  // PR5a-sexies (Codex round 6 #1 follow-up): if the session is owned by
  // the caller's tenant in DB but not currently loaded in memory (e.g.
  // after a service restart, before lazy reconnection completes), fall
  // back to the persisted snapshot. Without this fallback the controller
  // returned 404 indistinguishably from a real not-found, which masked
  // the cross-tenant smoke check.
  async getSession(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.requireTenant(req, res);
      if (!tenantId) return;

      const { sessionId } = req.params;

      const ownership = await this.assertSessionOwnership(sessionId, tenantId);
      if (ownership !== 'ok') {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      const session = await WhatsAppService.getSessionStatus(sessionId);

      if (session) {
        res.json({ success: true, data: session });
        return;
      }

      // In-memory miss but ownership confirmed -> return persisted view.
      const persisted = await SessionPersistenceService.getSession(sessionId);
      if (!persisted) {
        // Race: ownership lookup found a row but it just got deleted.
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }
      res.json({
        success: true,
        data: {
          id: persisted.sessionId,
          status: persisted.status,
          phoneNumber: persisted.connectedNumber,
          qrCode: persisted.qrCode,
          lastSeen: persisted.lastSeen,
          inMemory: false,
        },
      });
    } catch (error) {
      logger.error('Error getting session:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Get all sessions (tenant-scoped)
  async getAllSessions(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.requireTenant(req, res);
      if (!tenantId) return;

      // PR5a-bis: build the visible set from DB-by-tenant, then enrich
      // with in-memory state. The previous code returned in-memory
      // sessions globally — sessions of other tenants were leaking.
      const persisted = await SessionPersistenceService.loadActiveSessionsForTenant(tenantId);
      const memorySessions = await WhatsAppService.getAllSessions();

      const sessions = persisted.map(p => {
        const mem = memorySessions.find(m => m.id === p.sessionId);
        return {
          id: p.sessionId,
          name: p.name || p.sessionId,
          status: this.mapStatusToDashboard(mem?.status ?? p.status),
          phoneNumber: mem?.connectedNumber ?? p.connectedNumber,
          qr: mem?.qrCode ?? p.qrCode,
          createdAt: (p.lastSeen ?? new Date()).toISOString(),
          updatedAt: (p.lastSeen ?? new Date()).toISOString(),
          lastSeen: p.lastSeen?.toISOString(),
        };
      });

      res.json({
        success: true,
        sessions,
      });
    } catch (error) {
      logger.error('Error getting all sessions:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Helper method to map service status to dashboard status
  private mapStatusToDashboard(status: string): string {
    switch (status) {
      case 'ready':
      case 'authenticated':
        return 'CONNECTED';
      case 'connecting':
        return 'CONNECTING';
      case 'disconnected':
        return 'DISCONNECTED';
      case 'auth_failure':
        return 'AUTH_INVALID';
      default:
        return 'QR_READY';
    }
  }

  // Delete a session
  async deleteSession(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.requireTenant(req, res);
      if (!tenantId) return;

      const { sessionId } = req.params;

      const ownership = await this.assertSessionOwnership(sessionId, tenantId);
      if (ownership !== 'ok') {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      await WhatsAppService.destroySession(sessionId);

      res.json({
        success: true,
        message: `Session ${sessionId} deleted successfully`,
      });
    } catch (error) {
      logger.error('Error deleting session:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Force disconnect a session
  async forceDisconnectSession(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.requireTenant(req, res);
      if (!tenantId) return;

      const { sessionId } = req.params;

      const ownership = await this.assertSessionOwnership(sessionId, tenantId);
      if (ownership !== 'ok') {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      logger.info(`🔌 Force disconnect requested for session: ${sessionId}`);
      await WhatsAppService.forceDisconnectSession(sessionId);

      res.json({
        success: true,
        message: `Session ${sessionId} forcefully disconnected`,
        data: {
          sessionId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error force disconnecting session:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to force disconnect session',
      });
    }
  }

  // Get QR code for session
  async getQRCode(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.requireTenant(req, res);
      if (!tenantId) return;

      const { sessionId } = req.params;

      const ownership = await this.assertSessionOwnership(sessionId, tenantId);
      if (ownership !== 'ok') {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      const session = await WhatsAppService.getSessionStatus(sessionId);

      if (!session) {
        res.status(404).json({
          success: false,
          error: 'Session not found',
        });
        return;
      }

      if (!session.qrCode) {
        res.status(404).json({
          success: false,
          error: 'QR code not available. Session might be already authenticated or not connecting.',
        });
        return;
      }

      res.json({
        success: true,
        data: {
          qrCode: session.qrCode,
          status: session.status,
        },
      });
    } catch (error) {
      logger.error('Error getting QR code:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Send message
  async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.requireTenant(req, res);
      if (!tenantId) return;

      const { sessionId } = req.params;
      const { to, message } = req.body;

      if (!to || !message) {
        res.status(400).json({
          success: false,
          error: 'Both "to" and "message" fields are required',
        });
        return;
      }

      const ownership = await this.assertSessionOwnership(sessionId, tenantId);
      if (ownership !== 'ok') {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      const result = await WhatsAppService.sendMessage(sessionId, to, message);

      if (result.success) {
        res.json({
          success: true,
          data: result,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      logger.error('Error sending message:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Restore sessions from database (admin/tenant-scoped)
  async restoreSessions(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.requireTenant(req, res);
      if (!tenantId) return;

      logger.info(`🔄 Manual session restore requested for tenant ${tenantId}`);

      // PR5a-bis: SessionRecoveryService.recoverAllSessions still
      // operates globally on boot. The tenant-scoped HTTP path here is
      // narrowed to the caller's sessions only. If we ever expose this
      // route to non-admin users, this scoping is what stops one tenant
      // from triggering reconnection loops on another tenant's sessions.
      const tenantSessions = await SessionPersistenceService.loadActiveSessionsForTenant(tenantId);

      let recovered = 0;
      for (const s of tenantSessions) {
        try {
          await WhatsAppService.createSession(s.sessionId, tenantId);
          recovered++;
        } catch (e) {
          logger.warn(`Failed to recover session ${s.sessionId}: ${String(e)}`);
        }
      }

      res.json({
        success: true,
        data: {
          totalSessions: tenantSessions.length,
          recoveredSessions: recovered,
        },
        message: `Restored ${recovered}/${tenantSessions.length} sessions`,
      });
    } catch (error) {
      logger.error('Error restoring sessions:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Get session health status (global — operator/observability route)
  async getSessionsHealth(req: Request, res: Response): Promise<void> {
    try {
      // PR5a-bis: this endpoint reports infra-level health (DB stats,
      // recovery stats, in-memory health). It is NOT tenant-scoped on
      // purpose — it's effectively an operator/SRE view. The HMAC
      // middleware still requires a tenant on the call; we just don't
      // scope the data. If we ever expose this to end-user dashboards,
      // wrap the result with tenant filters.
      const _tenantId = this.requireTenant(req, res);
      if (!_tenantId) return;

      const [dbStats, recoveryStats, serviceHealth] = await Promise.all([
        SessionPersistenceService.getSessionStats(),
        SessionRecoveryService.getRecoveryStats(),
        SessionRecoveryService.checkRecoveredSessionsHealth(WhatsAppService),
      ]);

      res.json({
        success: true,
        data: {
          database: dbStats,
          recovery: recoveryStats,
          service: serviceHealth,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error getting session health:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Backup session data (tenant-scoped)
  async backupSessions(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.requireTenant(req, res);
      if (!tenantId) return;

      const sessions = await SessionPersistenceService.loadActiveSessionsForTenant(tenantId);

      const backup = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        tenantId,
        sessions,
        metadata: {
          total: sessions.length,
          active: sessions.filter(s => s.isActive).length,
          connected: sessions.filter(s => s.status === 'ready').length,
        },
      };

      res.json({
        success: true,
        data: backup,
        message: `Backup created with ${sessions.length} sessions`,
      });
    } catch (error) {
      logger.error('Error creating session backup:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Get enhanced sessions list with persistence data (tenant-scoped)
  async getEnhancedSessions(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.requireTenant(req, res);
      if (!tenantId) return;

      const { limit = 20, offset = 0, status, isActive } = req.query;

      const persistedSessions =
        await SessionPersistenceService.loadActiveSessionsForTenant(tenantId);

      let filteredSessions = persistedSessions;

      if (status && typeof status === 'string') {
        filteredSessions = filteredSessions.filter(s => s.status === status);
      }

      if (isActive !== undefined) {
        const activeFilter = isActive === 'true';
        filteredSessions = filteredSessions.filter(s => s.isActive === activeFilter);
      }

      const startIndex = Number(offset);
      const endIndex = startIndex + Number(limit);
      const paginatedSessions = filteredSessions.slice(startIndex, endIndex);

      // Enrich with in-memory state. Cross-reference is safe because
      // memorySessions of OTHER tenants won't match any sessionId in the
      // tenant-scoped paginatedSessions list.
      const memorySessions = await WhatsAppService.getAllSessions();

      const enhancedSessions = paginatedSessions.map(persistedSession => {
        const memorySession = memorySessions.find(m => m.id === persistedSession.sessionId);

        return {
          ...persistedSession,
          inMemory: !!memorySession,
          memoryStatus: memorySession?.status || 'not_loaded',
          syncStatus: memorySession?.status === persistedSession.status ? 'synced' : 'out_of_sync',
        };
      });

      res.json({
        success: true,
        sessions: enhancedSessions,
        pagination: {
          total: filteredSessions.length,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: endIndex < filteredSessions.length,
        },
      });
    } catch (error) {
      logger.error('Error getting enhanced sessions:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Get WebSocket connection statistics (operator)
  async getSocketStats(req: Request, res: Response): Promise<void> {
    try {
      const _tenantId = this.requireTenant(req, res);
      if (!_tenantId) return;

      const { getSocketService } = await import('../services/SocketService');
      const socketService = getSocketService();

      if (!socketService) {
        res.status(503).json({
          success: false,
          error: 'WebSocket service not available',
        });
        return;
      }

      const stats = socketService.getStats();

      res.json({
        success: true,
        data: {
          ...stats,
          timestamp: new Date().toISOString(),
          status: 'active',
        },
      });
    } catch (error) {
      logger.error('Error getting socket stats:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Send direct message (without session in URL)
  async sendDirectMessage(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.requireTenant(req, res);
      if (!tenantId) return;

      const { sessionId, phone, message } = req.body;

      if (!sessionId || !phone || !message) {
        res.status(400).json({
          success: false,
          error: 'sessionId, phone, and message fields are required',
        });
        return;
      }

      const ownership = await this.assertSessionOwnership(sessionId, tenantId);
      if (ownership !== 'ok') {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      const result = await WhatsAppService.sendMessage(sessionId, phone, message);

      if (result.success) {
        res.json({
          success: true,
          data: result,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      logger.error('Error sending direct message:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Get session status
  async getSessionStatus(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.requireTenant(req, res);
      if (!tenantId) return;

      const { sessionId } = req.params;

      const ownership = await this.assertSessionOwnership(sessionId, tenantId);
      if (ownership !== 'ok') {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      const session = await WhatsAppService.getSessionStatus(sessionId);

      if (!session) {
        res.status(404).json({
          success: false,
          error: 'Session not found',
        });
        return;
      }

      res.json({
        success: true,
        data: {
          id: sessionId,
          status: session.status,
          phoneNumber: session.phoneNumber,
          qr: session.qrCode,
          lastSeen: session.lastSeen,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        },
      });
    } catch (error) {
      logger.error('Error getting session status:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Get analytics for dashboard integration (tenant-scoped)
  async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = this.requireTenant(req, res);
      if (!tenantId) return;

      const { sessionId } = req.query;

      // If a sessionId is provided, verify it belongs to the tenant.
      if (typeof sessionId === 'string' && sessionId) {
        const ownership = await this.assertSessionOwnership(sessionId, tenantId);
        if (ownership !== 'ok') {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }
      }

      // Mock analytics data for now.
      // TODO: replace with real per-tenant aggregates once metrics
      // pipeline supports tenant tagging.
      const analytics = {
        totalSent: Math.floor(Math.random() * 100),
        totalReceived: Math.floor(Math.random() * 150),
        topContacts: [
          {
            phone: '+34658333517',
            count: Math.floor(Math.random() * 20) + 1,
            lastMessage: 'Último mensaje enviado...',
          },
        ],
        byStatus: {
          sent: Math.floor(Math.random() * 50),
          delivered: Math.floor(Math.random() * 40),
          read: Math.floor(Math.random() * 30),
        },
      };

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      logger.error('Error getting analytics:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export default new SessionController();
