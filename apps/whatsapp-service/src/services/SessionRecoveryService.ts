import { logger } from '../utils/logger'
import SessionPersistenceService, { SessionPersistenceData } from './SessionPersistenceService'
import { WhatsAppSession } from '../types'

export interface RecoveryOptions {
  maxRetries: number
  retryDelayMs: number
  maxReconnectAttempts: number
  timeoutMs: number
}

export interface RecoveryResult {
  totalSessions: number
  recoveredSessions: number
  failedSessions: number
  skippedSessions: number
  errors: string[]
}

/**
 * Service for automatic recovery of WhatsApp sessions on startup
 * Implements exponential backoff and circuit breaker patterns
 */
export class SessionRecoveryService {
  private defaultOptions: RecoveryOptions = {
    maxRetries: 3,
    retryDelayMs: 5000,
    maxReconnectAttempts: 5,
    timeoutMs: 30000
  }

  constructor(
    private persistenceService = SessionPersistenceService
  ) {}

  /**
   * Recover all active sessions from database
   * @param whatsAppService - The WhatsApp service instance to restore sessions to
   * @param options - Recovery configuration options
   * @returns Promise<RecoveryResult>
   */
  async recoverAllSessions(
    whatsAppService: any,
    options: Partial<RecoveryOptions> = {}
  ): Promise<RecoveryResult> {
    const config = { ...this.defaultOptions, ...options }
    const result: RecoveryResult = {
      totalSessions: 0,
      recoveredSessions: 0,
      failedSessions: 0,
      skippedSessions: 0,
      errors: []
    }

    try {
      logger.info('🔄 Iniciando recuperación de sesiones de WhatsApp...')

      // Load active sessions from database
      const persistedSessions = await this.persistenceService.loadActiveSessions()
      result.totalSessions = persistedSessions.length

      if (persistedSessions.length === 0) {
        logger.info('📭 No se encontraron sesiones activas para recuperar')
        return result
      }

      logger.info(`📋 Encontradas ${persistedSessions.length} sesiones para recuperar`)

      // Process each session with concurrency control
      const recoveryPromises = persistedSessions.map(async (sessionData) => {
        try {
          const recovered = await this.recoverSingleSession(whatsAppService, sessionData, config)
          if (recovered) {
            result.recoveredSessions++
            logger.info(`✅ Sesión ${sessionData.sessionId} recuperada exitosamente`)
          } else {
            result.skippedSessions++
            logger.warn(`⏭️ Sesión ${sessionData.sessionId} omitida (demasiados intentos fallidos)`)
          }
        } catch (error) {
          result.failedSessions++
          const errorMsg = `❌ Error recuperando sesión ${sessionData.sessionId}: ${error instanceof Error ? error.message : 'Unknown error'}`
          result.errors.push(errorMsg)
          logger.error(errorMsg)

          // Update session with error
          await this.persistenceService.updateSessionStatus(
            sessionData.sessionId,
            'recovery_failed',
            { 
              lastError: errorMsg,
              reconnectCount: (sessionData.reconnectCount || 0) + 1
            }
          )
        }
      })

      // Wait for all recovery attempts to complete
      await Promise.allSettled(recoveryPromises)

      // Clean up sessions with too many failed attempts
      await this.cleanupFailedSessions()

      logger.info(`🏁 Recuperación completada: ${result.recoveredSessions}/${result.totalSessions} sesiones`)
      return result

    } catch (error) {
      logger.error('💥 Error crítico durante recuperación de sesiones:', error)
      result.errors.push(`Critical recovery error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return result
    }
  }

  /**
   * Recover a single session
   * @private
   */
  private async recoverSingleSession(
    whatsAppService: any,
    sessionData: SessionPersistenceData,
    config: RecoveryOptions
  ): Promise<boolean> {
    const { sessionId } = sessionData

    // Skip if too many reconnect attempts
    if ((sessionData.reconnectCount || 0) >= config.maxReconnectAttempts) {
      logger.warn(`⚠️ Sesión ${sessionId} excedió máximo de intentos de reconexión (${sessionData.reconnectCount})`)
      await this.persistenceService.deactivateSession(sessionId)
      return false
    }

    // Skip if session was updated recently (might be starting up)
    const timeSinceUpdate = Date.now() - new Date(sessionData.lastSeen).getTime()
    if (timeSinceUpdate < 60000) { // Less than 1 minute
      logger.debug(`⏱️ Sesión ${sessionId} fue actualizada recientemente, omitiendo recuperación`)
      return true
    }

    logger.info(`🔄 Intentando recuperar sesión: ${sessionId}`)

    try {
      // Check if session already exists in memory
      const existingSession = await whatsAppService.getSessionStatus(sessionId)
      if (existingSession) {
        logger.debug(`💾 Sesión ${sessionId} ya existe en memoria`)
        return true
      }

      // Attempt to restore session
      const restoredSession = await this.attemptSessionRestore(whatsAppService, sessionData, config)
      
      if (restoredSession) {
        // Update persistence with successful recovery
        await this.persistenceService.updateSessionStatus(
          sessionId,
          'recovering',
          { 
            lastError: undefined,
            metadata: { 
              ...sessionData.metadata,
              lastRecovery: new Date().toISOString()
            }
          }
        )
        return true
      }

      return false
    } catch (error) {
      logger.error(`💥 Error recuperando sesión ${sessionId}:`, error)
      await this.persistenceService.incrementReconnectCount(sessionId)
      throw error
    }
  }

  /**
   * Attempt to restore a session with retries
   * @private
   */
  private async attemptSessionRestore(
    whatsAppService: any,
    sessionData: SessionPersistenceData,
    config: RecoveryOptions
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        logger.debug(`🔄 Intento ${attempt}/${config.maxRetries} para sesión ${sessionData.sessionId}`)

        // Create session with timeout
        const restorePromise = whatsAppService.createSession(sessionData.sessionId)
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Session restore timeout')), config.timeoutMs)
        )

        await Promise.race([restorePromise, timeoutPromise])
        
        logger.info(`✅ Sesión ${sessionData.sessionId} restaurada en intento ${attempt}`)
        return true

      } catch (error) {
        logger.warn(`⚠️ Intento ${attempt} falló para sesión ${sessionData.sessionId}:`, error)
        
        if (attempt < config.maxRetries) {
          const delayMs = config.retryDelayMs * Math.pow(2, attempt - 1)
          logger.debug(`⏱️ Esperando ${delayMs}ms antes del siguiente intento`)
          await this.delay(delayMs)
        }
      }
    }

    logger.error(`❌ Todos los intentos fallaron para sesión ${sessionData.sessionId}`)
    return false
  }

  /**
   * Clean up sessions that have failed too many times
   * @private
   */
  private async cleanupFailedSessions(): Promise<void> {
    try {
      const sessions = await this.persistenceService.loadActiveSessions()
      const failedSessions = sessions.filter(s => 
        (s.reconnectCount || 0) >= this.defaultOptions.maxReconnectAttempts
      )

      for (const session of failedSessions) {
        logger.info(`🧹 Desactivando sesión con demasiados fallos: ${session.sessionId}`)
        await this.persistenceService.deactivateSession(session.sessionId)
      }

      if (failedSessions.length > 0) {
        logger.info(`🧹 Desactivadas ${failedSessions.length} sesiones con fallos excesivos`)
      }
    } catch (error) {
      logger.error('Error limpiando sesiones fallidas:', error)
    }
  }

  /**
   * Check health of recovered sessions
   * @param whatsAppService - WhatsApp service instance
   * @returns Promise<{ healthy: number, total: number }>
   */
  async checkRecoveredSessionsHealth(whatsAppService: any): Promise<{ healthy: number, total: number }> {
    try {
      const allSessions = await whatsAppService.getAllSessions()
      const healthySessions = allSessions.filter((session: WhatsAppSession) => 
        session.status === 'ready' || session.status === 'authenticated'
      )

      return {
        healthy: healthySessions.length,
        total: allSessions.length
      }
    } catch (error) {
      logger.error('Error checking session health:', error)
      return { healthy: 0, total: 0 }
    }
  }

  /**
   * Schedule periodic health checks
   * @param whatsAppService - WhatsApp service instance
   * @param intervalMs - Check interval in milliseconds (default: 5 minutes)
   */
  scheduleHealthChecks(whatsAppService: any, intervalMs: number = 5 * 60 * 1000): NodeJS.Timeout {
    logger.info(`⏰ Programando health checks cada ${intervalMs / 1000} segundos`)

    return setInterval(async () => {
      try {
        const health = await this.checkRecoveredSessionsHealth(whatsAppService)
        logger.debug(`💊 Health check: ${health.healthy}/${health.total} sesiones saludables`)

        // Update session stats in database
        const sessions = await whatsAppService.getAllSessions()
        for (const session of sessions) {
          await this.persistenceService.updateSessionStatus(
            session.id,
            session.status
          )
        }
      } catch (error) {
        logger.error('Error en health check programado:', error)
      }
    }, intervalMs)
  }

  /**
   * Utility: Wait for specified milliseconds
   * @private
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Get recovery service statistics
   */
  async getRecoveryStats(): Promise<{
    lastRecovery?: Date
    totalRecoveries: number
    successRate: number
  }> {
    try {
      const stats = await this.persistenceService.getSessionStats()
      const sessionsWithRecovery = await this.persistenceService.loadActiveSessions()
      
      const recoveryData = sessionsWithRecovery
        .map(s => s.metadata?.lastRecovery)
        .filter(Boolean)
        .map(d => new Date(d))

      const lastRecovery = recoveryData.length > 0 ? 
        new Date(Math.max(...recoveryData.map(d => d.getTime()))) : 
        undefined

      return {
        lastRecovery,
        totalRecoveries: recoveryData.length,
        successRate: stats.active > 0 ? (stats.connected / stats.active) : 0
      }
    } catch (error) {
      logger.error('Error getting recovery stats:', error)
      return {
        totalRecoveries: 0,
        successRate: 0
      }
    }
  }
}

// Export singleton instance
export default new SessionRecoveryService()
