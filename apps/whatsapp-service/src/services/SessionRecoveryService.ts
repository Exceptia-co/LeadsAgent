import { logger } from '../utils/logger'
import SessionPersistenceService, { SessionPersistenceData } from './SessionPersistenceService'
import { SessionCleanupUtil } from '../utils/sessionCleanup'
import { WhatsAppSession } from '../types'
import fs from 'fs'
import path from 'path'

export interface RecoveryOptions {
  maxRetries: number
  retryDelayMs: number
  maxReconnectAttempts: number
  timeoutMs: number
  validateAuthFiles: boolean
  cleanupCorruptedAuth: boolean
  maxConcurrentRecoveries: number
}

export interface RecoveryResult {
  totalSessions: number
  recoveredSessions: number
  failedSessions: number
  skippedSessions: number
  authValidationPassed: number
  authValidationFailed: number
  authFilesCleanedUp: number
  errors: string[]
  recoveryTimeMs: number
  metrics: {
    averageRecoveryTime: number
    successRate: number
    authHealthScore: number
  }
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
    timeoutMs: 30000,
    validateAuthFiles: true,
    cleanupCorruptedAuth: true,
    maxConcurrentRecoveries: 3
  }

  constructor(
    private persistenceService = SessionPersistenceService
  ) {}

  /**
   * Recover all active sessions from database with LocalAuth validation
   * @param whatsAppService - The WhatsApp service instance to restore sessions to
   * @param options - Recovery configuration options
   * @returns Promise<RecoveryResult>
   */
  async recoverAllSessions(
    whatsAppService: any,
    options: Partial<RecoveryOptions> = {}
  ): Promise<RecoveryResult> {
    const startTime = Date.now()
    const config = { ...this.defaultOptions, ...options }
    const recoveryTimes: number[] = []
    
    const result: RecoveryResult = {
      totalSessions: 0,
      recoveredSessions: 0,
      failedSessions: 0,
      skippedSessions: 0,
      authValidationPassed: 0,
      authValidationFailed: 0,
      authFilesCleanedUp: 0,
      errors: [],
      recoveryTimeMs: 0,
      metrics: {
        averageRecoveryTime: 0,
        successRate: 0,
        authHealthScore: 0
      }
    }

    try {
      logger.info('🔄 Iniciando recuperación avanzada de sesiones de WhatsApp con LocalAuth...')

      // Load active sessions from database
      const persistedSessions = await this.persistenceService.loadActiveSessions()
      result.totalSessions = persistedSessions.length

      if (persistedSessions.length === 0) {
        logger.info('📭 No se encontraron sesiones activas para recuperar')
        result.recoveryTimeMs = Date.now() - startTime
        return result
      }

      logger.info(`📋 Encontradas ${persistedSessions.length} sesiones para recuperar`)

      // Perform auth file validation first if enabled
      if (config.validateAuthFiles) {
        await this.validateAllAuthFiles(persistedSessions, config, result)
      }

      // Group sessions for controlled concurrency recovery
      const sessionBatches = this.batchSessions(persistedSessions, config.maxConcurrentRecoveries)
      
      for (let batchIndex = 0; batchIndex < sessionBatches.length; batchIndex++) {
        const batch = sessionBatches[batchIndex]
        logger.info(`🔄 Procesando lote ${batchIndex + 1}/${sessionBatches.length} (${batch.length} sesiones)`)

        const batchPromises = batch.map(async (sessionData) => {
          const sessionStartTime = Date.now()
          try {
            const recovered = await this.recoverSingleSessionWithLocalAuth(whatsAppService, sessionData, config)
            const sessionRecoveryTime = Date.now() - sessionStartTime
            recoveryTimes.push(sessionRecoveryTime)
            
            if (recovered) {
              result.recoveredSessions++
              logger.info(`✅ Sesión ${sessionData.sessionId} recuperada en ${sessionRecoveryTime}ms`)
            } else {
              result.skippedSessions++
              logger.warn(`⏭️ Sesión ${sessionData.sessionId} omitida (demasiados intentos fallidos)`)
            }
          } catch (error) {
            result.failedSessions++
            const errorMsg = `❌ Error recuperando sesión ${sessionData.sessionId}: ${error instanceof Error ? error.message : 'Unknown error'}`
            result.errors.push(errorMsg)
            logger.error(errorMsg)

            // Update session with error and enhanced metadata
            await this.persistenceService.updateSessionStatus(
              sessionData.sessionId,
              'recovery_failed',
              { 
                lastError: errorMsg,
                reconnectCount: (sessionData.reconnectCount || 0) + 1,
                metadata: {
                  ...sessionData.metadata,
                  lastRecoveryAttempt: new Date().toISOString(),
                  recoveryFailureCount: (sessionData.metadata?.recoveryFailureCount || 0) + 1
                }
              }
            )
          }
        })

        // Wait for current batch to complete before starting next
        await Promise.allSettled(batchPromises)
        
        // Brief pause between batches to prevent overwhelming the system
        if (batchIndex < sessionBatches.length - 1) {
          await this.delay(1000)
        }
      }

      // Clean up sessions with too many failed attempts
      await this.cleanupFailedSessionsEnhanced()

      // Calculate metrics
      result.recoveryTimeMs = Date.now() - startTime
      result.metrics.averageRecoveryTime = recoveryTimes.length > 0 
        ? recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length 
        : 0
      result.metrics.successRate = result.totalSessions > 0 
        ? result.recoveredSessions / result.totalSessions 
        : 0
      result.metrics.authHealthScore = result.totalSessions > 0 
        ? result.authValidationPassed / result.totalSessions 
        : 0

      logger.info(`🏁 Recuperación avanzada completada: ${result.recoveredSessions}/${result.totalSessions} sesiones en ${result.recoveryTimeMs}ms`)
      logger.info(`📊 Métricas: Éxito ${(result.metrics.successRate * 100).toFixed(1)}%, Auth Health ${(result.metrics.authHealthScore * 100).toFixed(1)}%, Tiempo promedio ${result.metrics.averageRecoveryTime.toFixed(0)}ms`)
      
      return result

    } catch (error) {
      result.recoveryTimeMs = Date.now() - startTime
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
   * Get enhanced recovery service statistics
   */
  async getRecoveryStats(): Promise<{
    lastRecovery?: Date
    totalRecoveries: number
    successRate: number
    authHealthScore: number
    averageRecoveryTime: number
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

      // Calculate auth health score based on sessions with valid auth files
      let authHealthyCount = 0
      for (const session of sessionsWithRecovery) {
        if (session.metadata?.authFileExists && !session.metadata?.authCorruptionDetected) {
          authHealthyCount++
        }
      }

      const authHealthScore = sessionsWithRecovery.length > 0 
        ? authHealthyCount / sessionsWithRecovery.length 
        : 0

      // Calculate average recovery time from metadata
      const recoveryTimes = sessionsWithRecovery
        .map(s => s.metadata?.lastRecoveryTime)
        .filter(Boolean)
        .map(t => parseInt(t as string))
      
      const averageRecoveryTime = recoveryTimes.length > 0
        ? recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length
        : 0

      return {
        lastRecovery,
        totalRecoveries: recoveryData.length,
        successRate: stats.active > 0 ? (stats.connected / stats.active) : 0,
        authHealthScore,
        averageRecoveryTime
      }
    } catch (error) {
      logger.error('Error getting recovery stats:', error)
      return {
        totalRecoveries: 0,
        successRate: 0,
        authHealthScore: 0,
        averageRecoveryTime: 0
      }
    }
  }

  // === LocalAuth Enhanced Recovery Methods ===

  /**
   * Validate authentication files for all sessions
   */
  private async validateAllAuthFiles(
    sessions: SessionPersistenceData[],
    config: RecoveryOptions,
    result: RecoveryResult
  ): Promise<void> {
    logger.info(`🔍 Validando archivos de autenticación para ${sessions.length} sesiones...`)
    
    const authDataPath = path.resolve('./wwebjs_auth')
    
    for (const sessionData of sessions) {
      try {
        const isValid = await this.validateAuthFiles(sessionData.sessionId, authDataPath)
        
        if (isValid) {
          result.authValidationPassed++
          logger.debug(`✅ Auth válido para sesión ${sessionData.sessionId}`)
        } else {
          result.authValidationFailed++
          logger.warn(`❌ Auth inválido para sesión ${sessionData.sessionId}`)
          
          if (config.cleanupCorruptedAuth) {
            await this.cleanupCorruptedAuthFiles(sessionData.sessionId, authDataPath)
            result.authFilesCleanedUp++
          }
        }
      } catch (error) {
        logger.error(`Error validating auth for session ${sessionData.sessionId}:`, error)
        result.authValidationFailed++
      }
    }
    
    logger.info(`🔍 Validación completada: ${result.authValidationPassed}/${sessions.length} válidos, ${result.authFilesCleanedUp} limpiados`)
  }

  /**
   * Validate LocalAuth files for a specific session
   */
  private async validateAuthFiles(sessionId: string, authDataPath: string): Promise<boolean> {
    try {
      const sessionAuthPath = path.join(authDataPath, `session-${sessionId}`)
      
      if (!fs.existsSync(sessionAuthPath)) {
        return true // No files means clean slate
      }

      // Check for essential auth files
      const essentialFiles = ['Default', 'RemoteAuth', 'Session Storage']
      let foundEssentialFiles = 0
      
      for (const fileName of essentialFiles) {
        const filePath = path.join(sessionAuthPath, fileName)
        if (fs.existsSync(filePath)) {
          foundEssentialFiles++
        }
      }

      // Check for lock files (corruption indicators)
      const hasLockFiles = await this.hasActiveLockFiles(sessionAuthPath)
      const hasValidStructure = foundEssentialFiles > 0
      
      return hasValidStructure && !hasLockFiles
    } catch (error) {
      logger.debug(`Error validating auth files for ${sessionId}:`, error)
      return false
    }
  }

  /**
   * Check for active lock files that indicate corruption
   */
  private async hasActiveLockFiles(sessionAuthPath: string): Promise<boolean> {
    try {
      const lockFiles = await this.findLockFiles(sessionAuthPath)
      
      // Check if any lock files are older than 5 minutes (likely abandoned)
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000)
      
      for (const lockFile of lockFiles) {
        const stats = fs.statSync(lockFile)
        if (stats.mtime.getTime() < fiveMinutesAgo) {
          return true // Found stale lock file
        }
      }
      
      return false
    } catch (error) {
      return false
    }
  }

  /**
   * Find all lock files recursively
   */
  private async findLockFiles(dirPath: string, lockFiles: string[] = []): Promise<string[]> {
    try {
      if (!fs.existsSync(dirPath)) return lockFiles

      const items = fs.readdirSync(dirPath)
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item)
        const stat = fs.statSync(itemPath)
        
        if (stat.isDirectory()) {
          await this.findLockFiles(itemPath, lockFiles)
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
   * Clean up corrupted authentication files
   */
  private async cleanupCorruptedAuthFiles(sessionId: string, authDataPath: string): Promise<void> {
    try {
      const sessionAuthPath = path.join(authDataPath, `session-${sessionId}`)
      
      if (fs.existsSync(sessionAuthPath)) {
        logger.info(`🧹 Limpiando archivos auth corruptos para sesión ${sessionId}`)
        
        // Use SessionCleanupUtil for safe cleanup
        await SessionCleanupUtil.cleanupSession(sessionId, authDataPath)
        
        // Update database metadata
        await this.persistenceService.updateSessionStatus(sessionId, 'connecting', {
          metadata: {
            authCleanupPerformed: new Date().toISOString(),
            authCorruptionDetected: true,
            lastAuthValidation: new Date().toISOString()
          }
        })
      }
    } catch (error) {
      logger.error(`Error cleaning corrupted auth for ${sessionId}:`, error)
    }
  }

  /**
   * Recover single session with LocalAuth validation
   */
  private async recoverSingleSessionWithLocalAuth(
    whatsAppService: any,
    sessionData: SessionPersistenceData,
    config: RecoveryOptions
  ): Promise<boolean> {
    const { sessionId } = sessionData
    const sessionStartTime = Date.now()

    // Skip if too many reconnect attempts
    if ((sessionData.reconnectCount || 0) >= config.maxReconnectAttempts) {
      logger.warn(`⚠️ Sesión ${sessionId} excedió máximo de intentos (${sessionData.reconnectCount})`)
      await this.persistenceService.deactivateSession(sessionId)
      return false
    }

    // Skip if updated recently
    const timeSinceUpdate = Date.now() - new Date(sessionData.lastSeen).getTime()
    if (timeSinceUpdate < 60000) {
      logger.debug(`⏱️ Sesión ${sessionId} actualizada recientemente, omitiendo`)
      return true
    }

    try {
      // Check if already exists in memory
      const existingSession = await whatsAppService.getSessionStatus(sessionId)
      if (existingSession) {
        logger.debug(`💾 Sesión ${sessionId} ya existe en memoria`)
        return true
      }

      // Use WhatsAppService's enhanced recovery method if available
      if (typeof whatsAppService.recoverSessionWithAuthValidation === 'function') {
        const recovered = await whatsAppService.recoverSessionWithAuthValidation(sessionId, sessionData)
        
        if (recovered) {
          const recoveryTime = Date.now() - sessionStartTime
          await this.persistenceService.updateSessionStatus(
            sessionId,
            'recovering',
            { 
              lastError: undefined,
              metadata: { 
                ...sessionData.metadata,
                lastRecovery: new Date().toISOString(),
                lastRecoveryTime: recoveryTime.toString(),
                recoveryMethod: 'localauth_enhanced'
              }
            }
          )
          return true
        }
      } else {
        // Fallback to standard recovery
        const recovered = await this.attemptSessionRestoreEnhanced(whatsAppService, sessionData, config)
        
        if (recovered) {
          const recoveryTime = Date.now() - sessionStartTime
          await this.persistenceService.updateSessionStatus(
            sessionId,
            'recovering',
            { 
              lastError: undefined,
              metadata: { 
                ...sessionData.metadata,
                lastRecovery: new Date().toISOString(),
                lastRecoveryTime: recoveryTime.toString(),
                recoveryMethod: 'standard'
              }
            }
          )
          return true
        }
      }
      
      return false
    } catch (error) {
      logger.error(`💥 Error en recuperación LocalAuth para ${sessionId}:`, error)
      await this.persistenceService.incrementReconnectCount(sessionId)
      throw error
    }
  }

  /**
   * Enhanced session restore with better error handling
   */
  private async attemptSessionRestoreEnhanced(
    whatsAppService: any,
    sessionData: SessionPersistenceData,
    config: RecoveryOptions
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        logger.debug(`🔄 Intento ${attempt}/${config.maxRetries} para sesión ${sessionData.sessionId}`)

        const restorePromise = whatsAppService.createSession(sessionData.sessionId)
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Session restore timeout')), config.timeoutMs)
        )

        await Promise.race([restorePromise, timeoutPromise])
        
        logger.info(`✅ Sesión ${sessionData.sessionId} restaurada en intento ${attempt}`)
        return true

      } catch (error) {
        const isAuthError = error instanceof Error && (
          error.message.includes('auth') || 
          error.message.includes('QR') ||
          error.message.includes('authentication')
        )
        
        if (isAuthError && config.cleanupCorruptedAuth) {
          logger.warn(`🔧 Error de autenticación detectado para ${sessionData.sessionId}, limpiando archivos...`)
          await this.cleanupCorruptedAuthFiles(sessionData.sessionId, path.resolve('./wwebjs_auth'))
        }
        
        logger.warn(`⚠️ Intento ${attempt} falló para ${sessionData.sessionId}:`, error)
        
        if (attempt < config.maxRetries) {
          const delayMs = config.retryDelayMs * Math.pow(2, attempt - 1)
          logger.debug(`⏱️ Esperando ${delayMs}ms antes del siguiente intento`)
          await this.delay(delayMs)
        }
      }
    }

    logger.error(`❌ Todos los intentos fallaron para ${sessionData.sessionId}`)
    return false
  }

  /**
   * Batch sessions for controlled concurrency
   */
  private batchSessions(sessions: SessionPersistenceData[], batchSize: number): SessionPersistenceData[][] {
    const batches: SessionPersistenceData[][] = []
    
    for (let i = 0; i < sessions.length; i += batchSize) {
      batches.push(sessions.slice(i, i + batchSize))
    }
    
    return batches
  }

  /**
   * Enhanced cleanup with better logging and metrics
   */
  private async cleanupFailedSessionsEnhanced(): Promise<void> {
    try {
      logger.info('🧹 Iniciando limpieza avanzada de sesiones fallidas...')
      
      const sessions = await this.persistenceService.loadActiveSessions()
      const failedSessions = sessions.filter(s => 
        (s.reconnectCount || 0) >= this.defaultOptions.maxReconnectAttempts ||
        (s.metadata?.recoveryFailureCount || 0) > 10 // Too many recovery failures
      )

      const authCorruptedSessions = sessions.filter(s => 
        s.metadata?.authCorruptionDetected && 
        new Date(s.metadata.authCleanupPerformed || 0).getTime() < Date.now() - (24 * 60 * 60 * 1000) // Older than 24h
      )

      for (const session of failedSessions) {
        logger.info(`🧹 Desactivando sesión fallida: ${session.sessionId} (reconexiones: ${session.reconnectCount})`)
        await this.persistenceService.deactivateSession(session.sessionId)
        
        // Also cleanup auth files
        try {
          await this.cleanupCorruptedAuthFiles(session.sessionId, path.resolve('./wwebjs_auth'))
        } catch (cleanupError) {
          logger.debug(`Error cleaning auth files for ${session.sessionId}:`, cleanupError)
        }
      }

      for (const session of authCorruptedSessions) {
        logger.info(`🧹 Limpiando auth corrupto antiguo: ${session.sessionId}`)
        await this.cleanupCorruptedAuthFiles(session.sessionId, path.resolve('./wwebjs_auth'))
      }

      const totalCleaned = failedSessions.length + authCorruptedSessions.length
      if (totalCleaned > 0) {
        logger.info(`🧹 Limpieza completada: ${failedSessions.length} sesiones desactivadas, ${authCorruptedSessions.length} auth corruptos limpiados`)
      }
    } catch (error) {
      logger.error('Error en limpieza avanzada de sesiones:', error)
    }
  }
}

// Export singleton instance
export default new SessionRecoveryService()
