import { logger } from '../utils/logger';
import type { WhatsAppSession } from '../types';

// Import modular components
import {
  HealthMetrics,
  HealthCheckOptions,
  MetricsCollectionResult,
} from './session-health-check/HealthMetrics';
import { DiagnosticsEngine, SessionHealthStatus } from './session-health-check/DiagnosticsEngine';
import { AlertManager, HealthAlert } from './session-health-check/AlertManager';
import {
  HealthReporter,
  OverallHealthReport,
  HealthDashboard,
} from './session-health-check/HealthReporter';

// Re-export interfaces for backward compatibility
export { HealthCheckOptions, SessionHealthStatus, OverallHealthReport, HealthAlert };

// Environment toggle for modular implementation
const USE_MODULAR_HEALTH_CHECK = process.env.USE_SESSION_HEALTH_CHECK_MODULAR !== 'false';

/**
 * Advanced health check service for WhatsApp sessions
 * Provides comprehensive monitoring, alerting and diagnostics
 */
export class SessionHealthCheckService {
  private healthMetrics: HealthMetrics;
  private diagnosticsEngine: DiagnosticsEngine;
  private alertManager: AlertManager;
  private healthReporter: HealthReporter;

  private healthCheckTimer?: NodeJS.Timeout;
  private options: HealthCheckOptions;

  private readonly defaultOptions: HealthCheckOptions = {
    enablePingTests: false,
    connectionTimeoutMs: 10000,
    responseTimeoutMs: 30000,
    maxConsecutiveFailures: 3,
    alertThresholds: {
      responseTime: 5000,
      failureRate: 0.3,
      authIssueRate: 0.2,
    },
    checkIntervalMs: 5 * 60 * 1000,
  };

  constructor(options: Partial<HealthCheckOptions> = {}) {
    this.options = { ...this.defaultOptions, ...options };

    if (USE_MODULAR_HEALTH_CHECK) {
      logger.info('🏥 Using modular SessionHealthCheckService implementation');

      // Initialize modular components
      this.healthMetrics = new HealthMetrics(this.options);
      this.diagnosticsEngine = new DiagnosticsEngine(this.options);
      this.alertManager = new AlertManager();
      this.healthReporter = new HealthReporter();
    } else {
      logger.info('🏥 Using legacy SessionHealthCheckService implementation');
      // Legacy implementation would be initialized here if needed
    }
  }

  /**
   * Start continuous health monitoring
   */
  startMonitoring(whatsAppService: any): void {
    if (!USE_MODULAR_HEALTH_CHECK) {
      // Delegate to legacy implementation
      return this.startMonitoringLegacy(whatsAppService);
    }

    if (this.healthCheckTimer) {
      this.stopMonitoring();
    }

    logger.info(
      `🏥 Iniciando monitoreo avanzado de salud cada ${this.options.checkIntervalMs / 1000}s`
    );

    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.performHealthChecks(whatsAppService);
      } catch (error) {
        logger.error('Error during scheduled health check:', error);
      }
    }, this.options.checkIntervalMs);

    // Perform initial health check
    setTimeout(() => this.performHealthChecks(whatsAppService), 5000);
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
      logger.info('🏥 Health monitoring stopped');
    }
  }

  /**
   * Perform comprehensive health checks on all sessions
   */
  async performHealthChecks(whatsAppService: any): Promise<OverallHealthReport> {
    if (!USE_MODULAR_HEALTH_CHECK) {
      return this.performHealthChecksLegacy(whatsAppService);
    }

    const startTime = Date.now();
    logger.info('🏥 Iniciando health checks avanzados...');

    try {
      // Get all sessions
      const allSessions = await whatsAppService.getAllSessions();

      // Collect metrics for all sessions
      const metricsResults = await this.healthMetrics.batchCollectMetrics(
        whatsAppService,
        allSessions
      );

      // Analyze health status
      const healthStatuses = this.diagnosticsEngine.batchAnalyzeHealth(metricsResults);

      // Generate and evaluate alerts
      const generatedAlerts: HealthAlert[] = [];
      for (const healthStatus of healthStatuses) {
        const alerts = await this.alertManager.evaluateAndGenerateAlerts(healthStatus);
        generatedAlerts.push(...alerts);
      }

      // Generate overall report
      const activeAlerts = this.alertManager.getActiveAlerts();
      const checkDuration = Date.now() - startTime;
      const report = this.healthReporter.generateOverallReport(
        healthStatuses,
        activeAlerts,
        checkDuration
      );

      // Log summary
      logger.info(
        `🏥 Health checks completados en ${checkDuration}ms: ${report.healthySessions}/${report.totalSessions} sesiones saludables`
      );

      if (report.alerts.length > 0) {
        logger.warn(`⚠️ ${report.alerts.length} alertas activas detectadas`);
      }

      return report;
    } catch (error) {
      logger.error('Error performing health checks:', error);
      throw error;
    }
  }

  /**
   * Check health of a single session
   */
  async checkSessionHealth(
    whatsAppService: any,
    session: WhatsAppSession
  ): Promise<SessionHealthStatus> {
    if (!USE_MODULAR_HEALTH_CHECK) {
      return this.checkSessionHealthLegacy(whatsAppService, session);
    }

    logger.debug(`🔍 Checking health for session ${session.id}`);

    try {
      // Collect metrics for the session
      const metricsResult = await this.healthMetrics.collectSessionMetrics(
        whatsAppService,
        session
      );

      // Analyze health status
      const healthStatus = this.diagnosticsEngine.analyzeSessionHealth(metricsResult);

      // Generate alerts if needed
      await this.alertManager.evaluateAndGenerateAlerts(healthStatus);

      return healthStatus;
    } catch (error) {
      logger.error(`Error in health check for session ${session.id}:`, error);

      // Return error status
      return {
        sessionId: session.id,
        status: 'critical',
        lastCheckTime: new Date(),
        metrics: {
          responseTimeMs: this.options.responseTimeoutMs,
          isConnected: false,
          isAuthenticated: false,
          authFileHealth: 'missing',
          consecutiveFailures: 1,
          uptime: 0,
          messagesSent24h: 0,
          messagesReceived24h: 0,
        },
        issues: [
          `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
        recommendations: ['Investigate and restart session if necessary'],
      };
    }
  }

  // === Public API Methods ===

  /**
   * Get current health status for a specific session
   */
  getSessionHealth(sessionId: string): SessionHealthStatus | null {
    if (!USE_MODULAR_HEALTH_CHECK) {
      return this.getSessionHealthLegacy(sessionId);
    }

    // Get from diagnostics engine history
    const history = this.diagnosticsEngine.getHealthHistory(sessionId);
    return history.length > 0 ? history[history.length - 1] : null;
  }

  /**
   * Get all current health statuses
   */
  getAllHealthStatuses(): SessionHealthStatus[] {
    if (!USE_MODULAR_HEALTH_CHECK) {
      return this.getAllHealthStatusesLegacy();
    }

    // This would need to be implemented to maintain state across checks
    // For now, return empty array as statuses are generated on-demand
    return [];
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(): HealthAlert[] {
    if (!USE_MODULAR_HEALTH_CHECK) {
      return this.getActiveAlertsLegacy();
    }

    return this.alertManager.getActiveAlerts();
  }

  /**
   * Register alert callback
   */
  onAlert(callback: (alert: HealthAlert) => void): void {
    if (!USE_MODULAR_HEALTH_CHECK) {
      return this.onAlertLegacy(callback);
    }

    this.alertManager.registerAlertCallback(callback);
  }

  /**
   * Unregister alert callback. Pair with `onAlert()` and call from shutdown
   * paths so callbacks do not leak across restarts of the singleton.
   */
  offAlert(callback: (alert: HealthAlert) => void): void {
    if (!USE_MODULAR_HEALTH_CHECK) return;
    this.alertManager.removeAlertCallback(callback);
  }

  /**
   * Get health dashboard data
   */
  async getHealthDashboard(): Promise<{
    overview: OverallHealthReport;
    sessionDetails: SessionHealthStatus[];
    alerts: HealthAlert[];
  }> {
    if (!USE_MODULAR_HEALTH_CHECK) {
      return this.getHealthDashboardLegacy();
    }

    const activeAlerts = this.alertManager.getActiveAlerts();
    const alertStatistics = this.alertManager.getAlertStatistics();

    // Get recent health statuses (this would ideally be cached)
    const sessionDetails: SessionHealthStatus[] = [];

    const dashboard = await this.healthReporter.generateHealthDashboard(
      sessionDetails,
      activeAlerts,
      alertStatistics
    );

    return {
      overview: dashboard.overview,
      sessionDetails: dashboard.sessionDetails,
      alerts: dashboard.alerts,
    };
  }

  /**
   * Manual health check trigger
   */
  async runHealthCheck(whatsAppService: any): Promise<OverallHealthReport> {
    return await this.performHealthChecks(whatsAppService);
  }

  // === Legacy Implementation Stubs ===
  // These methods would delegate to the legacy implementation when needed

  private startMonitoringLegacy(whatsAppService: any): void {
    // Implementation would import and use SessionHealthCheckServiceLegacy
    throw new Error('Legacy implementation not available in this build');
  }

  private async performHealthChecksLegacy(whatsAppService: any): Promise<OverallHealthReport> {
    throw new Error('Legacy implementation not available in this build');
  }

  private async checkSessionHealthLegacy(
    whatsAppService: any,
    session: WhatsAppSession
  ): Promise<SessionHealthStatus> {
    throw new Error('Legacy implementation not available in this build');
  }

  private getSessionHealthLegacy(sessionId: string): SessionHealthStatus | null {
    throw new Error('Legacy implementation not available in this build');
  }

  private getAllHealthStatusesLegacy(): SessionHealthStatus[] {
    throw new Error('Legacy implementation not available in this build');
  }

  private getActiveAlertsLegacy(): HealthAlert[] {
    throw new Error('Legacy implementation not available in this build');
  }

  private onAlertLegacy(callback: (alert: HealthAlert) => void): void {
    throw new Error('Legacy implementation not available in this build');
  }

  private async getHealthDashboardLegacy(): Promise<{
    overview: OverallHealthReport;
    sessionDetails: SessionHealthStatus[];
    alerts: HealthAlert[];
  }> {
    throw new Error('Legacy implementation not available in this build');
  }
}

// Export singleton instance
export default new SessionHealthCheckService();
