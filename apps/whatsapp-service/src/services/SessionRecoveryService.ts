import { logger } from '../utils/logger';
import SessionPersistenceService from './SessionPersistenceService';
import { SESSION_CONSTANTS } from '../config/session-constants';

// Import modular components
import { sessionCredentialsStore } from './session-credentials/SessionCredentialsStore';
import { RecoveryRunner, RecoveryOptions } from './session/RecoveryRunner';
import { HealthMetrics } from './session/HealthMetrics';
import { AlertsService } from './session/AlertsService';

export interface RecoveryResult {
  totalSessions: number;
  recoveredSessions: number;
  failedSessions: number;
  skippedSessions: number;
  authValidationPassed: number;
  authValidationFailed: number;
  errors: string[];
  recoveryTimeMs: number;
  metrics: {
    averageRecoveryTime: number;
    successRate: number;
    authHealthScore: number;
  };
}

export { RecoveryOptions };

export class SessionRecoveryService {
  private persistenceService = SessionPersistenceService;
  private useModularImplementation: boolean;

  // Modular components
  private recoveryRunner = new RecoveryRunner();
  private healthMetrics = new HealthMetrics();
  private alertsService = new AlertsService();

  private defaultOptions: RecoveryOptions = {
    maxRetries: 3,
    retryDelayMs: 5000,
    maxReconnectAttempts: SESSION_CONSTANTS.MAX_RECONNECT_ATTEMPTS,
    timeoutMs: 30000,
    validateAuthFiles: true,
    maxConcurrentRecoveries: 3,
  };

  constructor() {
    this.useModularImplementation = process.env.USE_SESSION_RECOVERY_MODULAR === 'true';

    logger.info(
      `🔧 SessionRecoveryService initialized with ${this.useModularImplementation ? 'MODULAR' : 'LEGACY'} implementation`
    );
  }

  async recoverAllSessions(
    whatsAppService: any,
    options: Partial<RecoveryOptions> = {}
  ): Promise<RecoveryResult> {
    logger.debug('🔄 Using modular implementation for session recovery');

    const startTime = Date.now();
    const config = { ...this.defaultOptions, ...options };

    logger.info('🔄 Iniciando recuperación avanzada de sesiones de WhatsApp (Modular)...');

    const result: RecoveryResult = {
      totalSessions: 0,
      recoveredSessions: 0,
      failedSessions: 0,
      skippedSessions: 0,
      authValidationPassed: 0,
      authValidationFailed: 0,
      errors: [],
      recoveryTimeMs: 0,
      metrics: {
        averageRecoveryTime: 0,
        successRate: 0,
        authHealthScore: 0,
      },
    };

    try {
      this.healthMetrics.recordRecoveryStart();

      const persistedSessions = await this.persistenceService.loadActiveSessions();
      result.totalSessions = persistedSessions.length;

      if (persistedSessions.length === 0) {
        logger.info('📭 No se encontraron sesiones activas para recuperar');
        result.recoveryTimeMs = Date.now() - startTime;
        return result;
      }

      logger.info(`📋 Encontradas ${persistedSessions.length} sesiones para recuperar`);

      const recoveryResult = await this.recoveryRunner.executeRecoveryBatch(
        whatsAppService,
        persistedSessions,
        config
      );

      result.recoveredSessions = recoveryResult.recoveredSessions;
      result.failedSessions = recoveryResult.failedSessions;
      result.skippedSessions = recoveryResult.skippedSessions;

      for (const sessionResult of recoveryResult.results) {
        if (sessionResult.success) {
          this.healthMetrics.recordSessionRecoveryTime(sessionResult.recoveryTimeMs);
        }
        if (sessionResult.errorMessage) {
          result.errors.push(`${sessionResult.sessionId}: ${sessionResult.errorMessage}`);
        }
      }

      if (config.validateAuthFiles) {
        // The one call site of the seven that really was a read. It answers
        // "can this session reconnect without a new QR?" from Postgres now,
        // and it is deliberately not wrapped in a per-session try/catch: a
        // pooler timeout means *unknown*, not "no credentials", and swallowing
        // it into `false` would count healthy sessions as auth failures.
        //
        // It runs AFTER the batch on purpose. Its only consumer is the
        // authHealthScore metric, and boot recovery is one-shot -- in front of
        // the batch, letting the error out would turn "unknown" into "no
        // session reconnects until someone calls POST /sessions/restore". It
        // also kept N sequential COUNT queries on the startup path.
        for (const sessionData of persistedSessions) {
          if (await sessionCredentialsStore.hasCredentials(sessionData.sessionId)) {
            result.authValidationPassed++;
          } else {
            result.authValidationFailed++;
          }
        }
        logger.info(
          `🔍 Credenciales presentes en ${result.authValidationPassed}/${persistedSessions.length} sesiones`
        );
      }

      await this.cleanupFailedSessionsEnhanced();

      result.recoveryTimeMs = Date.now() - startTime;
      const fullMetrics = this.healthMetrics.calculateRecoveryMetrics(
        result.totalSessions,
        result.recoveredSessions,
        result.authValidationPassed
      );

      result.metrics = {
        averageRecoveryTime: fullMetrics.averageRecoveryTime,
        successRate: fullMetrics.successRate,
        authHealthScore: fullMetrics.authHealthScore,
      };

      const healthStats = await this.healthMetrics.checkSessionsHealth(whatsAppService);
      await this.alertsService.generateRecoveryAlerts(fullMetrics, healthStats);
      await this.alertsService.autoResolveAlerts(fullMetrics, healthStats);

      logger.info(
        `🏁 Recuperación modular completada: ${result.recoveredSessions}/${result.totalSessions} sesiones en ${result.recoveryTimeMs}ms`
      );
      logger.info(
        `📊 Métricas: Éxito ${(result.metrics.successRate * 100).toFixed(1)}%, Auth Health ${(result.metrics.authHealthScore * 100).toFixed(1)}%, Tiempo promedio ${result.metrics.averageRecoveryTime.toFixed(0)}ms`
      );

      const alertsSummary = this.alertsService.generateAlertsSummary();
      if (alertsSummary !== '✅ No alerts generated') {
        logger.info(`🚨 Alerts: ${alertsSummary}`);
      }

      return result;
    } catch (error) {
      result.recoveryTimeMs = Date.now() - startTime;
      logger.error('💥 Error crítico durante recuperación modular de sesiones:', error);
      result.errors.push(
        `Critical recovery error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return result;
    }
  }

  async checkRecoveredSessionsHealth(
    whatsAppService: any
  ): Promise<{ healthy: number; total: number }> {
    const healthStats = await this.healthMetrics.checkSessionsHealth(whatsAppService);
    return {
      healthy: healthStats.healthy,
      total: healthStats.total,
    };
  }

  async getRecoveryStats(): Promise<{
    lastRecovery?: Date;
    totalRecoveries: number;
    successRate: number;
    authHealthScore: number;
    averageRecoveryTime: number;
  }> {
    const detailedStats = await this.healthMetrics.getDetailedRecoveryStats();
    return {
      lastRecovery: detailedStats.lastRecovery,
      totalRecoveries: detailedStats.totalRecoveries,
      successRate: detailedStats.successRate,
      authHealthScore: detailedStats.authHealthScore,
      averageRecoveryTime: detailedStats.averageRecoveryTime,
    };
  }

  async recoverSessionsWithSmartFiltering(
    whatsAppService: any,
    options: Partial<RecoveryOptions> = {}
  ): Promise<RecoveryResult> {
    return this.recoverAllSessions(whatsAppService, options);
  }

  private async cleanupFailedSessionsEnhanced(): Promise<void> {
    try {
      logger.info('🧹 Iniciando limpieza avanzada de sesiones fallidas...');

      const sessions = await this.persistenceService.loadActiveSessions();
      const failedSessions = sessions.filter(
        s =>
          (s.reconnectCount || 0) >= this.defaultOptions.maxReconnectAttempts ||
          (s.metadata?.recoveryFailureCount || 0) > 10
      );

      for (const session of failedSessions) {
        logger.info(
          `🧹 Desactivando sesión fallida: ${session.sessionId} (reconexiones: ${session.reconnectCount})`
        );
        await this.persistenceService.deactivateSession(session.sessionId);

        await this.alertsService.generateSessionAlert(
          session.sessionId,
          'session_cleanup',
          'medium',
          `Session deactivated due to ${session.reconnectCount} failed reconnection attempts`,
          { reconnectCount: session.reconnectCount }
        );
      }

      // Deactivating the row is the whole cleanup now. The credentials stay:
      // a session that ran out of reconnect attempts has not been logged out,
      // and wiping its Signal keys here would force a re-pair for what is
      // usually a network outage.
      if (failedSessions.length > 0) {
        logger.info(`🧹 Limpieza completada: ${failedSessions.length} sesiones desactivadas`);
      }
    } catch (error) {
      logger.error('Error en limpieza avanzada de sesiones:', error);
    }
  }

  getImplementationInfo(): {
    type: 'modular' | 'legacy';
    version: string;
    components: string[];
  } {
    if (!this.useModularImplementation) {
      return {
        type: 'legacy',
        version: '1.0.0',
        components: ['SessionRecoveryServiceLegacy'],
      };
    }

    return {
      type: 'modular',
      version: '2.0.0',
      components: ['RecoveryRunner', 'HealthMetrics', 'AlertsService'],
    };
  }

  async switchImplementation(useModular: boolean): Promise<void> {
    this.useModularImplementation = useModular;
    logger.info(`🔄 Switched to ${useModular ? 'MODULAR' : 'LEGACY'} implementation`);

    if (useModular) {
      this.healthMetrics.reset();
      await this.alertsService.cleanupOldAlerts(1);
    }
  }

  getActiveAlerts() {
    if (!this.useModularImplementation) {
      return [];
    }
    return this.alertsService.getActiveAlerts();
  }

  async generateHealthReport(): Promise<string> {
    if (!this.useModularImplementation) {
      return 'Health reporting only available in modular implementation';
    }

    const stats = await this.getRecoveryStats();
    const healthStats = await this.healthMetrics.checkSessionsHealth({
      getAllSessions: async () => [],
    });

    const metrics = {
      totalSessions: 0,
      activeSessions: 0,
      connectedSessions: healthStats.healthy,
      disconnectedSessions: healthStats.total - healthStats.healthy,
      lastRecoveryTime: stats.lastRecovery,
      uptime: 0,
      averageRecoveryTime: stats.averageRecoveryTime,
      successRate: stats.successRate,
      authHealthScore: stats.authHealthScore,
    };

    return this.healthMetrics.generateHealthReport(metrics, healthStats);
  }
}

export default new SessionRecoveryService();
