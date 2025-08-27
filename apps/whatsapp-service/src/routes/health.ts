import express from 'express'
import path from 'path'
import { logger } from '../utils/logger'
import SessionHealthCheckService, { 
  SessionHealthCheckService as HealthService,
  HealthCheckOptions 
} from '../services/SessionHealthCheckService'
import WhatsAppServiceSimple from '../services/WhatsAppServiceSimple'

const router = express.Router()

/**
 * GET /health/overview
 * Get overall health status and summary
 */
router.get('/overview', async (req, res) => {
  try {
    const dashboard = await SessionHealthCheckService.getHealthDashboard()
    
    res.json({
      success: true,
      data: {
        overview: dashboard.overview,
        summary: {
          totalSessions: dashboard.overview.totalSessions,
          healthyPercentage: dashboard.overview.totalSessions > 0 
            ? Math.round((dashboard.overview.healthySessions / dashboard.overview.totalSessions) * 100)
            : 0,
          averageResponseTime: Math.round(dashboard.overview.averageResponseTime),
          activeAlerts: dashboard.alerts.length,
          overallStatus: dashboard.overview.overallHealth
        }
      }
    })
  } catch (error) {
    logger.error('Error getting health overview:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get health overview'
    })
  }
})

/**
 * GET /health/sessions
 * Get detailed health status for all sessions
 */
router.get('/sessions', async (req, res) => {
  try {
    const sessionStatuses = SessionHealthCheckService.getAllHealthStatuses()
    
    const formattedSessions = sessionStatuses.map(status => ({
      sessionId: status.sessionId,
      status: status.status,
      lastCheck: status.lastCheckTime,
      metrics: {
        responseTime: Math.round(status.metrics.responseTimeMs),
        isConnected: status.metrics.isConnected,
        isAuthenticated: status.metrics.isAuthenticated,
        authFileHealth: status.metrics.authFileHealth,
        consecutiveFailures: status.metrics.consecutiveFailures,
        uptime: Math.round(status.metrics.uptime / 1000 / 60), // Convert to minutes
        messageActivity: {
          sent24h: status.metrics.messagesSent24h,
          received24h: status.metrics.messagesReceived24h
        }
      },
      issues: status.issues,
      recommendations: status.recommendations
    }))

    res.json({
      success: true,
      data: {
        sessions: formattedSessions,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    logger.error('Error getting session health details:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get session health details'
    })
  }
})

/**
 * GET /health/session/:sessionId
 * Get detailed health status for a specific session
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params
    const healthStatus = SessionHealthCheckService.getSessionHealth(sessionId)
    
    if (!healthStatus) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not monitored'
      })
    }

    res.json({
      success: true,
      data: {
        session: healthStatus,
        lastUpdated: healthStatus.lastCheckTime
      }
    })
  } catch (error) {
    logger.error(`Error getting health for session ${req.params.sessionId}:`, error)
    res.status(500).json({
      success: false,
      error: 'Failed to get session health'
    })
  }
})

/**
 * GET /health/alerts
 * Get all active alerts
 */
router.get('/alerts', async (req, res) => {
  try {
    const alerts = SessionHealthCheckService.getActiveAlerts()
    
    // Group alerts by severity
    const alertsBySeverity = alerts.reduce((acc, alert) => {
      if (!acc[alert.severity]) {
        acc[alert.severity] = []
      }
      acc[alert.severity].push(alert)
      return acc
    }, {} as Record<string, typeof alerts>)

    res.json({
      success: true,
      data: {
        alerts,
        summary: {
          total: alerts.length,
          critical: alertsBySeverity.critical?.length || 0,
          high: alertsBySeverity.high?.length || 0,
          medium: alertsBySeverity.medium?.length || 0,
          low: alertsBySeverity.low?.length || 0
        },
        groupedBySeverity: alertsBySeverity
      }
    })
  } catch (error) {
    logger.error('Error getting alerts:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get alerts'
    })
  }
})

/**
 * POST /health/check
 * Trigger manual health check for all sessions
 */
router.post('/check', async (req, res) => {
  try {
    logger.info('🏥 Manual health check triggered via API')
    
    const report = await SessionHealthCheckService.runHealthCheck(WhatsAppServiceSimple)
    
    res.json({
      success: true,
      data: {
        report,
        message: 'Health check completed successfully'
      }
    })
  } catch (error) {
    logger.error('Error running manual health check:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to run health check'
    })
  }
})

/**
 * POST /health/check/:sessionId
 * Trigger manual health check for a specific session
 */
router.post('/check/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params
    logger.info(`🏥 Manual health check triggered for session ${sessionId}`)
    
    // Get session from WhatsApp service
    const session = await WhatsAppServiceSimple.getSessionStatus(sessionId)
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      })
    }

    // Perform health check on specific session
    const healthStatus = await SessionHealthCheckService.checkSessionHealth(WhatsAppServiceSimple, session)
    
    res.json({
      success: true,
      data: {
        sessionHealth: healthStatus,
        message: `Health check completed for session ${sessionId}`
      }
    })
  } catch (error) {
    logger.error(`Error running health check for session ${req.params.sessionId}:`, error)
    res.status(500).json({
      success: false,
      error: 'Failed to run session health check'
    })
  }
})

/**
 * GET /health/dashboard
 * Get comprehensive dashboard data (overview + sessions + alerts)
 */
router.get('/dashboard', async (req, res) => {
  try {
    const dashboard = await SessionHealthCheckService.getHealthDashboard()
    
    // Add some computed metrics for the dashboard
    const computedMetrics = {
      healthScore: dashboard.overview.totalSessions > 0 
        ? Math.round((dashboard.overview.healthySessions / dashboard.overview.totalSessions) * 100)
        : 0,
      responseTimeStatus: dashboard.overview.averageResponseTime < 2000 ? 'good' :
                         dashboard.overview.averageResponseTime < 5000 ? 'warning' : 'poor',
      alertSeverityDistribution: dashboard.alerts.reduce((acc, alert) => {
        acc[alert.severity] = (acc[alert.severity] || 0) + 1
        return acc
      }, {} as Record<string, number>),
      sessionStatusDistribution: {
        healthy: dashboard.overview.healthySessions,
        warning: dashboard.overview.warningSessions,
        critical: dashboard.overview.criticalSessions,
        offline: dashboard.overview.offlineSessions
      }
    }

    res.json({
      success: true,
      data: {
        ...dashboard,
        computedMetrics,
        lastUpdated: new Date().toISOString()
      }
    })
  } catch (error) {
    logger.error('Error getting health dashboard:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get health dashboard'
    })
  }
})

/**
 * GET /health/metrics
 * Get real-time metrics for monitoring integration
 */
router.get('/metrics', async (req, res) => {
  try {
    const dashboard = await SessionHealthCheckService.getHealthDashboard()
    const sessionStatuses = SessionHealthCheckService.getAllHealthStatuses()
    
    // Calculate additional metrics
    const responseTimeBuckets = sessionStatuses.reduce((buckets, status) => {
      const responseTime = status.metrics.responseTimeMs
      if (responseTime < 1000) buckets.fast++
      else if (responseTime < 3000) buckets.normal++
      else if (responseTime < 5000) buckets.slow++
      else buckets.timeout++
      return buckets
    }, { fast: 0, normal: 0, slow: 0, timeout: 0 })

    const authHealthDistribution = sessionStatuses.reduce((dist, status) => {
      dist[status.metrics.authFileHealth] = (dist[status.metrics.authFileHealth] || 0) + 1
      return dist
    }, {} as Record<string, number>)

    // Prometheus-style metrics format
    const metrics = {
      'whatsapp_sessions_total': dashboard.overview.totalSessions,
      'whatsapp_sessions_healthy': dashboard.overview.healthySessions,
      'whatsapp_sessions_warning': dashboard.overview.warningSessions,
      'whatsapp_sessions_critical': dashboard.overview.criticalSessions,
      'whatsapp_sessions_offline': dashboard.overview.offlineSessions,
      'whatsapp_average_response_time_ms': Math.round(dashboard.overview.averageResponseTime),
      'whatsapp_active_alerts_total': dashboard.alerts.length,
      'whatsapp_health_score_percentage': dashboard.overview.totalSessions > 0 
        ? Math.round((dashboard.overview.healthySessions / dashboard.overview.totalSessions) * 100)
        : 0,
      'whatsapp_response_time_fast': responseTimeBuckets.fast,
      'whatsapp_response_time_normal': responseTimeBuckets.normal,
      'whatsapp_response_time_slow': responseTimeBuckets.slow,
      'whatsapp_response_time_timeout': responseTimeBuckets.timeout,
      'whatsapp_auth_files_valid': authHealthDistribution.valid || 0,
      'whatsapp_auth_files_corrupted': authHealthDistribution.corrupted || 0,
      'whatsapp_auth_files_missing': authHealthDistribution.missing || 0
    }

    res.json({
      success: true,
      data: {
        metrics,
        timestamp: new Date().toISOString(),
        responseTimeBuckets,
        authHealthDistribution
      }
    })
  } catch (error) {
    logger.error('Error getting health metrics:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get health metrics'
    })
  }
})

/**
 * GET /health-dashboard
 * Serve the static HTML dashboard page
 */
router.get('/health-dashboard', (req, res) => {
  try {
    const dashboardPath = path.join(__dirname, '..', 'public', 'health-dashboard.html')
    res.sendFile(dashboardPath)
  } catch (error) {
    logger.error('Error serving health dashboard HTML:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to serve health dashboard'
    })
  }
})

/**
 * GET /health/status
 * Simple status endpoint for uptime monitoring
 */
router.get('/status', async (req, res) => {
  try {
    const dashboard = await SessionHealthCheckService.getHealthDashboard()
    const isHealthy = dashboard.overview.overallHealth === 'healthy'
    
    res.status(isHealthy ? 200 : 503).json({
      status: dashboard.overview.overallHealth,
      healthy: isHealthy,
      sessions: {
        total: dashboard.overview.totalSessions,
        healthy: dashboard.overview.healthySessions,
        issues: dashboard.overview.criticalSessions + dashboard.overview.offlineSessions
      },
      alerts: dashboard.alerts.length,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Error getting health status:', error)
    res.status(503).json({
      status: 'error',
      healthy: false,
      error: 'Health check service unavailable',
      timestamp: new Date().toISOString()
    })
  }
})

export default router
