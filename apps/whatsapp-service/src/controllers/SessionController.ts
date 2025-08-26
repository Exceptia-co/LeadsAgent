import { Request, Response } from 'express'
import WhatsAppService from '../services/WhatsAppServiceSimple'
import SessionPersistenceService from '../services/SessionPersistenceService'
import SessionRecoveryService from '../services/SessionRecoveryService'
import { logger } from '../utils/logger'

export class SessionController {
  // Create a new WhatsApp session
  async createSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.body

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'Session ID is required'
        })
        return
      }

      const session = await WhatsAppService.createSession(sessionId)
      
      res.status(201).json({
        success: true,
        data: session
      })
    } catch (error) {
      logger.error('Error creating session:', error)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  // Get session status
  async getSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params

      const session = await WhatsAppService.getSessionStatus(sessionId)
      
      if (!session) {
        res.status(404).json({
          success: false,
          error: 'Session not found'
        })
        return
      }

      res.json({
        success: true,
        data: session
      })
    } catch (error) {
      logger.error('Error getting session:', error)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  // Get all sessions
  async getAllSessions(req: Request, res: Response): Promise<void> {
    try {
      const rawSessions = await WhatsAppService.getAllSessions()
      
      // Map session data to dashboard format
      const sessions = rawSessions.map(session => ({
        id: session.id,
        name: session.name || session.clientId,
        status: this.mapStatusToDashboard(session.status),
        phoneNumber: session.connectedNumber,
        qr: session.qrCode,
        createdAt: session.lastSeen?.toISOString() || new Date().toISOString(),
        updatedAt: session.lastSeen?.toISOString() || new Date().toISOString(),
        lastSeen: session.lastSeen?.toISOString()
      }))
      
      res.json({
        success: true,
        sessions: sessions
      })
    } catch (error) {
      logger.error('Error getting all sessions:', error)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  // Helper method to map service status to dashboard status
  private mapStatusToDashboard(status: string): string {
    switch (status) {
      case 'ready':
        return 'CONNECTED'
      case 'connecting':
      case 'authenticated':
        return 'CONNECTING'
      case 'disconnected':
      case 'auth_failure':
        return 'DISCONNECTED'
      default:
        return 'QR_READY'
    }
  }

  // Delete a session
  async deleteSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params

      await WhatsAppService.destroySession(sessionId)
      
      res.json({
        success: true,
        message: `Session ${sessionId} deleted successfully`
      })
    } catch (error) {
      logger.error('Error deleting session:', error)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  // Get QR code for session
  async getQRCode(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params

      const session = await WhatsAppService.getSessionStatus(sessionId)
      
      if (!session) {
        res.status(404).json({
          success: false,
          error: 'Session not found'
        })
        return
      }

      if (!session.qrCode) {
        res.status(404).json({
          success: false,
          error: 'QR code not available. Session might be already authenticated or not connecting.'
        })
        return
      }

      res.json({
        success: true,
        data: {
          qrCode: session.qrCode,
          status: session.status
        }
      })
    } catch (error) {
      logger.error('Error getting QR code:', error)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  // Send message
  async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params
      const { to, message } = req.body

      if (!to || !message) {
        res.status(400).json({
          success: false,
          error: 'Both "to" and "message" fields are required'
        })
        return
      }

      const result = await WhatsAppService.sendMessage(sessionId, to, message)
      
      if (result.success) {
        res.json({
          success: true,
          data: result
        })
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        })
      }
    } catch (error) {
      logger.error('Error sending message:', error)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  // Restore sessions from database
  async restoreSessions(req: Request, res: Response): Promise<void> {
    try {
      logger.info('🔄 Manual session restore requested')
      
      const recoveryResult = await SessionRecoveryService.recoverAllSessions(WhatsAppService)
      
      res.json({
        success: true,
        data: recoveryResult,
        message: `Restored ${recoveryResult.recoveredSessions}/${recoveryResult.totalSessions} sessions`
      })
    } catch (error) {
      logger.error('Error restoring sessions:', error)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  // Get session health status
  async getSessionsHealth(req: Request, res: Response): Promise<void> {
    try {
      const [dbStats, recoveryStats, serviceHealth] = await Promise.all([
        SessionPersistenceService.getSessionStats(),
        SessionRecoveryService.getRecoveryStats(),
        SessionRecoveryService.checkRecoveredSessionsHealth(WhatsAppService)
      ])

      res.json({
        success: true,
        data: {
          database: dbStats,
          recovery: recoveryStats,
          service: serviceHealth,
          timestamp: new Date().toISOString()
        }
      })
    } catch (error) {
      logger.error('Error getting session health:', error)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  // Backup session data
  async backupSessions(req: Request, res: Response): Promise<void> {
    try {
      const sessions = await SessionPersistenceService.loadActiveSessions()
      
      // Create backup with timestamp
      const backup = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        sessions: sessions,
        metadata: {
          total: sessions.length,
          active: sessions.filter(s => s.isActive).length,
          connected: sessions.filter(s => s.status === 'ready').length
        }
      }

      res.json({
        success: true,
        data: backup,
        message: `Backup created with ${sessions.length} sessions`
      })
    } catch (error) {
      logger.error('Error creating session backup:', error)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  // Get enhanced sessions list with persistence data
  async getEnhancedSessions(req: Request, res: Response): Promise<void> {
    try {
      const { limit = 20, offset = 0, status, isActive } = req.query
      
      // Get sessions from persistence service with filtering
      const persistedSessions = await SessionPersistenceService.loadActiveSessions()
      
      // Apply filters
      let filteredSessions = persistedSessions
      
      if (status && typeof status === 'string') {
        filteredSessions = filteredSessions.filter(s => s.status === status)
      }
      
      if (isActive !== undefined) {
        const activeFilter = isActive === 'true'
        filteredSessions = filteredSessions.filter(s => s.isActive === activeFilter)
      }
      
      // Apply pagination
      const startIndex = Number(offset)
      const endIndex = startIndex + Number(limit)
      const paginatedSessions = filteredSessions.slice(startIndex, endIndex)
      
      // Get current memory sessions for comparison
      const memorySessions = await WhatsAppService.getAllSessions()
      
      // Enhance with memory status
      const enhancedSessions = paginatedSessions.map(persistedSession => {
        const memorySession = memorySessions.find(m => m.id === persistedSession.sessionId)
        
        return {
          ...persistedSession,
          inMemory: !!memorySession,
          memoryStatus: memorySession?.status || 'not_loaded',
          syncStatus: memorySession?.status === persistedSession.status ? 'synced' : 'out_of_sync'
        }
      })
      
      res.json({
        success: true,
        sessions: enhancedSessions,
        pagination: {
          total: filteredSessions.length,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: endIndex < filteredSessions.length
        }
      })
    } catch (error) {
      logger.error('Error getting enhanced sessions:', error)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  // Send direct message (without session in URL)
  async sendDirectMessage(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId, phone, message } = req.body

      if (!sessionId || !phone || !message) {
        res.status(400).json({
          success: false,
          error: 'sessionId, phone, and message fields are required'
        })
        return
      }

      const result = await WhatsAppService.sendMessage(sessionId, phone, message)
      
      if (result.success) {
        res.json({
          success: true,
          data: result
        })
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        })
      }
    } catch (error) {
      logger.error('Error sending direct message:', error)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  // Get session status
  async getSessionStatus(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params

      const session = await WhatsAppService.getSessionStatus(sessionId)
      
      if (!session) {
        res.status(404).json({
          success: false,
          error: 'Session not found'
        })
        return
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
          updatedAt: session.updatedAt
        }
      })
    } catch (error) {
      logger.error('Error getting session status:', error)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  // Get analytics for dashboard integration
  async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId, startDate, endDate } = req.query
      const sessions = await WhatsAppService.getAllSessions()
      
      // Mock analytics data for now
      // In a real implementation, this would come from a database
      const analytics = {
        totalSent: Math.floor(Math.random() * 100),
        totalReceived: Math.floor(Math.random() * 150),
        topContacts: [
          {
            phone: '+34658333517',
            count: Math.floor(Math.random() * 20) + 1,
            lastMessage: 'Último mensaje enviado...'
          }
        ],
        byStatus: {
          sent: Math.floor(Math.random() * 50),
          delivered: Math.floor(Math.random() * 40),
          read: Math.floor(Math.random() * 30)
        }
      }
      
      res.json({
        success: true,
        data: analytics
      })
    } catch (error) {
      logger.error('Error getting analytics:', error)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
}

export default new SessionController()
