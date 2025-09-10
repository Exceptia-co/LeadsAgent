import { logger } from '../utils/logger'
import SessionPersistenceService from './SessionPersistenceService'
import { WhatsAppSession } from '../types'
import fs from 'fs'
import path from 'path'

export interface HealthCheckOptions {
  enablePingTests: boolean
  pingTestPhoneNumber?: string
  connectionTimeoutMs: number
  responseTimeoutMs: number
  maxConsecutiveFailures: number
  alertThresholds: {
    responseTime: number
    failureRate: number
    authIssueRate: number
  }
  checkIntervalMs: number
}

export interface SessionHealthStatus {
  sessionId: string
  status: 'healthy' | 'warning' | 'critical' | 'offline'
  lastCheckTime: Date
  metrics: {
    responseTimeMs: number
    isConnected: boolean
    isAuthenticated: boolean
    authFileHealth: 'valid' | 'corrupted' | 'missing'
    consecutiveFailures: number
    lastSuccessfulPing?: Date
    uptime: number
    messagesSent24h: number
    messagesReceived24h: number
  }
  issues: string[]
  recommendations: string[]
}

export interface OverallHealthReport {
  totalSessions: number
  healthySessions: number
  warningSessions: number
  criticalSessions: number
  offlineSessions: number
  averageResponseTime: number
  overallHealth: 'healthy' | 'degraded' | 'critical'
  alerts: HealthAlert[]
  timestamp: Date
}

export interface HealthAlert {
  id: string
  sessionId: string
  type: 'connection' | 'auth' | 'performance' | 'functionality'
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  timestamp: Date
  resolved: boolean
  recommendation: string
}

/**
 * Advanced health check service for WhatsApp sessions
 * Provides comprehensive monitoring, alerting and diagnostics
 */
export class SessionHealthCheckService {
  private healthStatuses: Map<string, SessionHealthStatus> = new Map()
  private activeAlerts: Map<string, HealthAlert> = new Map()
  private healthCheckTimer?: NodeJS.Timeout
  private alertCallbacks: Array<(alert: HealthAlert) => void> = []

  private defaultOptions: HealthCheckOptions = {
    enablePingTests: false, // Disabled by default to avoid spam
    connectionTimeoutMs: 10000,
    responseTimeoutMs: 30000,
    maxConsecutiveFailures: 3,
    alertThresholds: {
      responseTime: 5000, // 5 seconds
      failureRate: 0.3, // 30%
      authIssueRate: 0.2 // 20%
    },
    checkIntervalMs: 5 * 60 * 1000 // 5 minutes
  }

  constructor(
    private persistenceService = SessionPersistenceService,
    private options: Partial<HealthCheckOptions> = {}
  ) {
    this.options = { ...this.defaultOptions, ...options }
  }

  /**
   * Start continuous health monitoring
   */
  startMonitoring(whatsAppService: any): void {
    if (this.healthCheckTimer) {
      this.stopMonitoring()
    }

    logger.info(`🏥 Iniciando monitoreo avanzado de salud cada ${this.options.checkIntervalMs! / 1000}s`)

    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.performHealthChecks(whatsAppService)
      } catch (error) {
        logger.error('Error during scheduled health check:', error)
      }
    }, this.options.checkIntervalMs)

    // Perform initial health check
    setTimeout(() => this.performHealthChecks(whatsAppService), 5000)
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = undefined
      logger.info('🏥 Health monitoring stopped')
    }
  }

  /**
   * Perform comprehensive health checks on all sessions
   */
  async performHealthChecks(whatsAppService: any): Promise<OverallHealthReport> {
    const startTime = Date.now()
    logger.info('🏥 Iniciando health checks avanzados...')

    try {
      // Get all sessions
      const allSessions = await whatsAppService.getAllSessions()
      const healthResults: SessionHealthStatus[] = []

      // Check each session individually
      for (const session of allSessions) {
        try {
          const healthStatus = await this.checkSessionHealth(whatsAppService, session)
          healthResults.push(healthStatus)
          this.healthStatuses.set(session.id, healthStatus)

          // Generate alerts if needed
          await this.evaluateAlerts(healthStatus)
        } catch (error) {
          logger.error(`Error checking health for session ${session.id}:`, error)
        }
      }

      // Generate overall report
      const report = this.generateOverallReport(healthResults)
      
      // Log summary
      const checkDuration = Date.now() - startTime
      logger.info(`🏥 Health checks completados en ${checkDuration}ms: ${report.healthySessions}/${report.totalSessions} sesiones saludables`)
      
      if (report.alerts.length > 0) {
        logger.warn(`⚠️ ${report.alerts.length} alertas activas detectadas`)
      }

      return report
    } catch (error) {
      logger.error('Error performing health checks:', error)
      throw error
    }
  }

  /**
   * Check health of a single session
   */
  async checkSessionHealth(whatsAppService: any, session: WhatsAppSession): Promise<SessionHealthStatus> {
    const checkStartTime = Date.now()
    const sessionId = session.id

    logger.debug(`🔍 Checking health for session ${sessionId}`)

    const healthStatus: SessionHealthStatus = {
      sessionId,
      status: 'healthy',
      lastCheckTime: new Date(),
      metrics: {
        responseTimeMs: 0,
        isConnected: false,
        isAuthenticated: false,
        authFileHealth: 'missing',
        consecutiveFailures: 0,
        uptime: 0,
        messagesSent24h: 0,
        messagesReceived24h: 0
      },
      issues: [],
      recommendations: []
    }

    try {
      // 1. Basic connection check
      const isConnected = session.status === 'ready' || session.status === 'authenticated'
      healthStatus.metrics.isConnected = isConnected
      healthStatus.metrics.isAuthenticated = session.status === 'authenticated' || session.status === 'ready'

      if (!isConnected) {
        healthStatus.issues.push(`Session not connected (status: ${session.status})`)
        healthStatus.recommendations.push('Check network connection and restart session if needed')
      }

      // 2. Auth file health check
      healthStatus.metrics.authFileHealth = await this.checkAuthFileHealth(sessionId)
      
      if (healthStatus.metrics.authFileHealth === 'corrupted') {
        healthStatus.issues.push('Authentication files are corrupted')
        healthStatus.recommendations.push('Clean up corrupted auth files and re-authenticate')
      }

      // 3. Response time check (ping test if enabled)
      if (this.options.enablePingTests && this.options.pingTestPhoneNumber && isConnected) {
        try {
          healthStatus.metrics.responseTimeMs = await this.performPingTest(whatsAppService, sessionId)
        } catch (pingError) {
          healthStatus.issues.push('Ping test failed - session may not be responding')
          healthStatus.metrics.responseTimeMs = this.options.responseTimeoutMs!
        }
      } else {
        // Estimate response time based on session responsiveness
        healthStatus.metrics.responseTimeMs = await this.estimateResponseTime(whatsAppService, sessionId)
      }

      // 4. Check uptime and activity metrics
      await this.checkActivityMetrics(healthStatus)

      // 5. Get consecutive failures from previous checks
      const previousStatus = this.healthStatuses.get(sessionId)
      if (previousStatus && healthStatus.issues.length > 0) {
        healthStatus.metrics.consecutiveFailures = previousStatus.metrics.consecutiveFailures + 1
      } else if (healthStatus.issues.length === 0) {
        healthStatus.metrics.consecutiveFailures = 0
      }

      // 6. Determine overall status
      healthStatus.status = this.calculateOverallStatus(healthStatus)

      logger.debug(`✅ Health check for ${sessionId}: ${healthStatus.status} (${Date.now() - checkStartTime}ms)`)

    } catch (error) {
      logger.error(`Error in health check for session ${sessionId}:`, error)
      healthStatus.status = 'critical'
      healthStatus.issues.push(`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      healthStatus.recommendations.push('Investigate and restart session if necessary')
    }

    return healthStatus
  }

  /**
   * Check authentication file health
   */
  private async checkAuthFileHealth(sessionId: string): Promise<'valid' | 'corrupted' | 'missing'> {
    try {
      const authDataPath = path.resolve('./wwebjs_auth')
      const sessionAuthPath = path.join(authDataPath, `session-${sessionId}`)

      if (!fs.existsSync(sessionAuthPath)) {
        return 'missing'
      }

      // Check for essential files
      const essentialFiles = ['Default', 'RemoteAuth', 'Session Storage']
      let foundFiles = 0

      for (const fileName of essentialFiles) {
        const filePath = path.join(sessionAuthPath, fileName)
        if (fs.existsSync(filePath)) {
          foundFiles++
        }
      }

      // Check for lock files (corruption indicators)
      const lockFiles = await this.findLockFiles(sessionAuthPath)
      const hasStalelocks = lockFiles.some(lockFile => {
        const stats = fs.statSync(lockFile)
        return Date.now() - stats.mtime.getTime() > 5 * 60 * 1000 // Older than 5 minutes
      })

      if (foundFiles === 0) {
        return 'missing'
      } else if (hasStalelocks || foundFiles < essentialFiles.length / 2) {
        return 'corrupted'
      } else {
        return 'valid'
      }
    } catch (error) {
      logger.debug(`Error checking auth file health for ${sessionId}:`, error)
      return 'corrupted'
    }
  }

  /**
   * Find lock files in directory
   */
  private async findLockFiles(dirPath: string): Promise<string[]> {
    const lockFiles: string[] = []

    try {
      if (!fs.existsSync(dirPath)) return lockFiles

      const items = fs.readdirSync(dirPath)
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item)
        const stat = fs.statSync(itemPath)
        
        if (stat.isDirectory()) {
          const subLockFiles = await this.findLockFiles(itemPath)
          lockFiles.push(...subLockFiles)
        } else if (item === 'LOCK' || item === 'lockfile' || item.endsWith('.lock')) {
          lockFiles.push(itemPath)
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return lockFiles
  }

  /**
   * Perform ping test by sending a test message
   */
  private async performPingTest(whatsAppService: any, sessionId: string): Promise<number> {
    if (!this.options.pingTestPhoneNumber) {
      throw new Error('Ping test phone number not configured')
    }

    const startTime = Date.now()

    try {
      // Send a simple ping message
      const pingMessage = `Health check ping - ${new Date().toISOString()}`
      const response = await whatsAppService.sendMessage(
        sessionId,
        this.options.pingTestPhoneNumber,
        pingMessage
      )

      if (!response.success) {
        throw new Error(`Ping failed: ${response.error}`)
      }

      const responseTime = Date.now() - startTime
      logger.debug(`📡 Ping test for ${sessionId}: ${responseTime}ms`)

      return responseTime
    } catch (error) {
      logger.debug(`Ping test failed for ${sessionId}:`, error)
      throw error
    }
  }

  /**
   * Estimate response time based on session operations
   */
  private async estimateResponseTime(whatsAppService: any, sessionId: string): Promise<number> {
    const startTime = Date.now()

    try {
      // Try to get session status as a simple operation
      await whatsAppService.getSessionStatus(sessionId)
      return Date.now() - startTime
    } catch (error) {
      return this.options.responseTimeoutMs! // Return timeout value if operation fails
    }
  }

  /**
   * Check activity metrics from database
   */
  private async checkActivityMetrics(healthStatus: SessionHealthStatus): Promise<void> {
    try {
      // Get session data from database
      const sessionData = await this.persistenceService.getSession(healthStatus.sessionId)
      
      if (sessionData) {
        // Calculate uptime based on last seen
        const lastSeen = new Date(sessionData.lastSeen)
        const now = new Date()
        healthStatus.metrics.uptime = now.getTime() - lastSeen.getTime()

        // Note: Message counts would require additional database queries
        // This is a placeholder for when conversation history is available
        healthStatus.metrics.messagesSent24h = 0
        healthStatus.metrics.messagesReceived24h = 0
      }
    } catch (error) {
      logger.debug(`Error checking activity metrics for ${healthStatus.sessionId}:`, error)
    }
  }

  /**
   * Calculate overall health status based on metrics and issues
   */
  private calculateOverallStatus(healthStatus: SessionHealthStatus): 'healthy' | 'warning' | 'critical' | 'offline' {
    const { metrics, issues } = healthStatus

    // Critical conditions
    if (!metrics.isConnected) {
      return 'offline'
    }

    if (metrics.authFileHealth === 'corrupted' || 
        metrics.consecutiveFailures >= this.options.maxConsecutiveFailures!) {
      return 'critical'
    }

    // Warning conditions
    if (metrics.responseTimeMs > this.options.alertThresholds!.responseTime ||
        metrics.authFileHealth === 'missing' ||
        issues.length > 0) {
      return 'warning'
    }

    return 'healthy'
  }

  /**
   * Evaluate and generate alerts based on health status
   */
  private async evaluateAlerts(healthStatus: SessionHealthStatus): Promise<void> {
    const { sessionId, metrics, issues, status } = healthStatus

    // High response time alert
    if (metrics.responseTimeMs > this.options.alertThresholds!.responseTime) {
      await this.generateAlert({
        sessionId,
        type: 'performance',
        severity: 'medium',
        message: `High response time: ${metrics.responseTimeMs}ms (threshold: ${this.options.alertThresholds!.responseTime}ms)`,
        recommendation: 'Check network connectivity and session load'
      })
    }

    // Authentication issues
    if (metrics.authFileHealth === 'corrupted') {
      await this.generateAlert({
        sessionId,
        type: 'auth',
        severity: 'high',
        message: 'Authentication files are corrupted',
        recommendation: 'Clean up auth files and re-authenticate the session'
      })
    }

    // Connection issues
    if (!metrics.isConnected) {
      await this.generateAlert({
        sessionId,
        type: 'connection',
        severity: 'critical',
        message: 'Session is not connected to WhatsApp',
        recommendation: 'Check network connectivity and restart session'
      })
    }

    // Consecutive failures
    if (metrics.consecutiveFailures >= this.options.maxConsecutiveFailures!) {
      await this.generateAlert({
        sessionId,
        type: 'functionality',
        severity: 'high',
        message: `${metrics.consecutiveFailures} consecutive health check failures`,
        recommendation: 'Session may need to be restarted or reconfigured'
      })
    }

    // Resolve alerts if session is healthy
    if (status === 'healthy') {
      await this.resolveSessionAlerts(sessionId)
    }
  }

  /**
   * Generate a new alert
   */
  private async generateAlert(alertData: {
    sessionId: string
    type: HealthAlert['type']
    severity: HealthAlert['severity']
    message: string
    recommendation: string
  }): Promise<void> {
    const alertId = `${alertData.sessionId}-${alertData.type}-${Date.now()}`
    
    const alert: HealthAlert = {
      id: alertId,
      sessionId: alertData.sessionId,
      type: alertData.type,
      severity: alertData.severity,
      message: alertData.message,
      timestamp: new Date(),
      resolved: false,
      recommendation: alertData.recommendation
    }

    // Check if similar alert already exists
    const existingAlert = Array.from(this.activeAlerts.values()).find(a => 
      a.sessionId === alert.sessionId && 
      a.type === alert.type && 
      !a.resolved
    )

    if (!existingAlert) {
      this.activeAlerts.set(alertId, alert)
      logger.warn(`🚨 New alert: [${alert.severity.toUpperCase()}] ${alert.sessionId}: ${alert.message}`)

      // Notify alert callbacks
      this.alertCallbacks.forEach(callback => {
        try {
          callback(alert)
        } catch (error) {
          logger.error('Error in alert callback:', error)
        }
      })

      // Save alert to database (if needed)
      await this.saveAlertToDatabase(alert)
    }
  }

  /**
   * Resolve all alerts for a session
   */
  private async resolveSessionAlerts(sessionId: string): Promise<void> {
    let resolvedCount = 0

    for (const [alertId, alert] of this.activeAlerts.entries()) {
      if (alert.sessionId === sessionId && !alert.resolved) {
        alert.resolved = true
        resolvedCount++
        logger.info(`✅ Alert resolved: ${alert.sessionId}: ${alert.message}`)
      }
    }

    if (resolvedCount > 0) {
      logger.info(`✅ Resolved ${resolvedCount} alerts for session ${sessionId}`)
    }
  }

  /**
   * Save alert to database
   */
  private async saveAlertToDatabase(alert: HealthAlert): Promise<void> {
    try {
      // Update session metadata with alert information
      await this.persistenceService.updateSessionStatus(alert.sessionId, undefined, {
        metadata: {
          lastAlertTime: alert.timestamp.toISOString(),
          lastAlertType: alert.type,
          lastAlertSeverity: alert.severity,
          alertsGenerated: Date.now() // Could be incremented
        }
      })
    } catch (error) {
      logger.error('Error saving alert to database:', error)
    }
  }

  /**
   * Generate overall health report
   */
  private generateOverallReport(healthResults: SessionHealthStatus[]): OverallHealthReport {
    const totalSessions = healthResults.length
    const healthyCounts = {
      healthy: healthResults.filter(h => h.status === 'healthy').length,
      warning: healthResults.filter(h => h.status === 'warning').length,
      critical: healthResults.filter(h => h.status === 'critical').length,
      offline: healthResults.filter(h => h.status === 'offline').length
    }

    const averageResponseTime = healthResults.length > 0
      ? healthResults.reduce((sum, h) => sum + h.metrics.responseTimeMs, 0) / healthResults.length
      : 0

    // Determine overall health
    let overallHealth: 'healthy' | 'degraded' | 'critical'
    if (healthyCounts.critical > 0 || healthyCounts.offline > totalSessions * 0.5) {
      overallHealth = 'critical'
    } else if (healthyCounts.warning > totalSessions * 0.3 || healthyCounts.offline > 0) {
      overallHealth = 'degraded'
    } else {
      overallHealth = 'healthy'
    }

    return {
      totalSessions,
      healthySessions: healthyCounts.healthy,
      warningSessions: healthyCounts.warning,
      criticalSessions: healthyCounts.critical,
      offlineSessions: healthyCounts.offline,
      averageResponseTime,
      overallHealth,
      alerts: Array.from(this.activeAlerts.values()).filter(a => !a.resolved),
      timestamp: new Date()
    }
  }

  // === Public API Methods ===

  /**
   * Get current health status for a specific session
   */
  getSessionHealth(sessionId: string): SessionHealthStatus | null {
    return this.healthStatuses.get(sessionId) || null
  }

  /**
   * Get all current health statuses
   */
  getAllHealthStatuses(): SessionHealthStatus[] {
    return Array.from(this.healthStatuses.values())
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(): HealthAlert[] {
    return Array.from(this.activeAlerts.values()).filter(a => !a.resolved)
  }

  /**
   * Register alert callback
   */
  onAlert(callback: (alert: HealthAlert) => void): void {
    this.alertCallbacks.push(callback)
  }

  /**
   * Get health dashboard data
   */
  async getHealthDashboard(): Promise<{
    overview: OverallHealthReport
    sessionDetails: SessionHealthStatus[]
    alerts: HealthAlert[]
  }> {
    const sessionDetails = this.getAllHealthStatuses()
    const overview = this.generateOverallReport(sessionDetails)
    const alerts = this.getActiveAlerts()

    return {
      overview,
      sessionDetails,
      alerts
    }
  }

  /**
   * Manual health check trigger
   */
  async runHealthCheck(whatsAppService: any): Promise<OverallHealthReport> {
    return await this.performHealthChecks(whatsAppService)
  }
}

// Export singleton instance
export default new SessionHealthCheckService()
