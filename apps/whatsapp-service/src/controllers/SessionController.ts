import { Request, Response } from 'express'
import WhatsAppService from '../services/WhatsAppService'
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
      const sessions = await WhatsAppService.getAllSessions()
      
      res.json({
        success: true,
        data: sessions
      })
    } catch (error) {
      logger.error('Error getting all sessions:', error)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
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

  // Get analytics for dashboard integration
  async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const sessions = await WhatsAppService.getAllSessions()
      
      // Mock analytics data for now
      // In a real implementation, this would come from a database
      const analytics = {
        total: {
          messages: 0,
          inbound: 0,
          outbound: 0,
          conversations: sessions.length
        },
        responseRate: '0%',
        sessions: sessions.length
      }
      
      res.json({
        success: true,
        ...analytics
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
