import { logger } from '../../utils/logger';
import SessionPersistenceService from '../SessionPersistenceService';
import type { SessionHealthStatus } from './DiagnosticsEngine';

export interface HealthAlert {
  id: string;
  sessionId: string;
  type: 'connection' | 'auth' | 'performance' | 'functionality';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  resolved: boolean;
  recommendation: string;
  metadata?: Record<string, any>;
}

export interface AlertRule {
  id: string;
  name: string;
  type: HealthAlert['type'];
  condition: (healthStatus: SessionHealthStatus) => boolean;
  severity: HealthAlert['severity'];
  message: (healthStatus: SessionHealthStatus) => string;
  recommendation: string;
  cooldownMs: number;
  enabled: boolean;
}

export interface AlertNotification {
  alert: HealthAlert;
  method: 'log' | 'callback' | 'webhook' | 'database';
  delivered: boolean;
  deliveredAt?: Date;
  error?: string;
}

export interface AlertStatistics {
  totalAlerts: number;
  alertsBySeverity: Record<HealthAlert['severity'], number>;
  alertsByType: Record<HealthAlert['type'], number>;
  alertsResolved: number;
  averageResolutionTime: number;
  activeAlerts: number;
}

/**
 * Alert management module for health monitoring
 * Responsible for generating, managing and distributing health alerts
 */
export class AlertManager {
  private activeAlerts: Map<string, HealthAlert> = new Map();
  private alertHistory: HealthAlert[] = [];
  private alertCallbacks: Array<(alert: HealthAlert) => void> = [];
  private alertRules: Map<string, AlertRule> = new Map();
  private alertCooldowns: Map<string, number> = new Map();
  private persistenceService = SessionPersistenceService;

  private readonly maxHistorySize = 1000;

  constructor() {
    this.initializeDefaultAlertRules();
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultAlertRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'connection-failure',
        name: 'Connection Failure',
        type: 'connection',
        condition: health => !health.metrics.isConnected,
        severity: 'critical',
        message: health => `Session ${health.sessionId} is not connected to WhatsApp`,
        recommendation: 'Check network connectivity and restart session',
        cooldownMs: 5 * 60 * 1000, // 5 minutes
        enabled: true,
      },
      {
        id: 'auth-corrupted',
        name: 'Authentication Corrupted',
        type: 'auth',
        condition: health => health.metrics.authFileHealth === 'corrupted',
        severity: 'high',
        message: health => `Authentication files corrupted for session ${health.sessionId}`,
        recommendation: 'Clean up auth files and re-authenticate the session',
        cooldownMs: 10 * 60 * 1000, // 10 minutes
        enabled: true,
      },
      {
        id: 'auth-missing',
        name: 'Authentication Missing',
        type: 'auth',
        condition: health => health.metrics.authFileHealth === 'missing',
        severity: 'medium',
        message: health => `Authentication files missing for session ${health.sessionId}`,
        recommendation: 'Authenticate the session',
        cooldownMs: 15 * 60 * 1000, // 15 minutes
        enabled: true,
      },
      {
        id: 'high-response-time',
        name: 'High Response Time',
        type: 'performance',
        condition: health => health.metrics.responseTimeMs > 5000,
        severity: 'medium',
        message: health =>
          `High response time for session ${health.sessionId}: ${health.metrics.responseTimeMs}ms`,
        recommendation: 'Check network latency and session load',
        cooldownMs: 10 * 60 * 1000, // 10 minutes
        enabled: true,
      },
      {
        id: 'consecutive-failures',
        name: 'Consecutive Failures',
        type: 'functionality',
        condition: health => health.metrics.consecutiveFailures >= 3,
        severity: 'high',
        message: health =>
          `${health.metrics.consecutiveFailures} consecutive failures for session ${health.sessionId}`,
        recommendation: 'Investigate session stability and consider restart',
        cooldownMs: 5 * 60 * 1000, // 5 minutes
        enabled: true,
      },
      {
        id: 'critical-response-time',
        name: 'Critical Response Time',
        type: 'performance',
        condition: health => health.metrics.responseTimeMs > 30000,
        severity: 'critical',
        message: health =>
          `Critical response time for session ${health.sessionId}: ${health.metrics.responseTimeMs}ms`,
        recommendation: 'Immediate session restart required',
        cooldownMs: 3 * 60 * 1000, // 3 minutes
        enabled: true,
      },
    ];

    defaultRules.forEach(rule => this.alertRules.set(rule.id, rule));
    logger.debug(`🚨 Initialized ${defaultRules.length} default alert rules`);
  }

  /**
   * Evaluate health status and generate alerts
   */
  async evaluateAndGenerateAlerts(healthStatus: SessionHealthStatus): Promise<HealthAlert[]> {
    const generatedAlerts: HealthAlert[] = [];
    const { sessionId } = healthStatus;

    logger.debug(`🚨 Evaluating alerts for session ${sessionId}`);

    // Check each alert rule
    for (const [ruleId, rule] of this.alertRules.entries()) {
      if (!rule.enabled) continue;

      try {
        // Check if rule condition is met
        if (rule.condition(healthStatus)) {
          // Check cooldown
          if (this.isInCooldown(sessionId, ruleId)) {
            logger.debug(`⏰ Alert rule ${ruleId} in cooldown for session ${sessionId}`);
            continue;
          }

          // Check if similar alert already exists
          if (this.hasSimilarActiveAlert(sessionId, rule.type)) {
            logger.debug(
              `🔄 Similar alert already active for session ${sessionId}, type ${rule.type}`
            );
            continue;
          }

          // Generate new alert
          const alert = await this.generateAlert(healthStatus, rule);
          generatedAlerts.push(alert);

          // Set cooldown
          this.setCooldown(sessionId, ruleId, rule.cooldownMs);
        }
      } catch (error) {
        logger.error(`Error evaluating alert rule ${ruleId} for session ${sessionId}:`, error);
      }
    }

    // Auto-resolve alerts if session is healthy
    if (healthStatus.status === 'healthy') {
      await this.autoResolveAlerts(sessionId);
    }

    return generatedAlerts;
  }

  /**
   * Generate a new alert based on rule and health status
   */
  private async generateAlert(
    healthStatus: SessionHealthStatus,
    rule: AlertRule
  ): Promise<HealthAlert> {
    const alertId = this.generateAlertId(healthStatus.sessionId, rule.type);

    const alert: HealthAlert = {
      id: alertId,
      sessionId: healthStatus.sessionId,
      type: rule.type,
      severity: rule.severity,
      message: rule.message(healthStatus),
      timestamp: new Date(),
      resolved: false,
      recommendation: rule.recommendation,
      metadata: {
        ruleId: rule.id,
        ruleName: rule.name,
        healthStatus: healthStatus.status,
        metrics: healthStatus.metrics,
      },
    };

    // Store alert
    this.activeAlerts.set(alertId, alert);
    this.alertHistory.push(alert);

    // Trim history if needed
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory = this.alertHistory.slice(-this.maxHistorySize);
    }

    logger.warn(
      `🚨 Generated alert: [${alert.severity.toUpperCase()}] ${alert.sessionId}: ${alert.message}`
    );

    // Send notifications
    await this.sendAlertNotifications(alert);

    return alert;
  }

  /**
   * Generate unique alert ID
   */
  private generateAlertId(sessionId: string, type: string): string {
    return `${sessionId}-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if alert rule is in cooldown
   */
  private isInCooldown(sessionId: string, ruleId: string): boolean {
    const cooldownKey = `${sessionId}-${ruleId}`;
    const cooldownUntil = this.alertCooldowns.get(cooldownKey);

    if (!cooldownUntil) return false;

    if (Date.now() > cooldownUntil) {
      this.alertCooldowns.delete(cooldownKey);
      return false;
    }

    return true;
  }

  /**
   * Set cooldown for alert rule
   */
  private setCooldown(sessionId: string, ruleId: string, cooldownMs: number): void {
    const cooldownKey = `${sessionId}-${ruleId}`;
    this.alertCooldowns.set(cooldownKey, Date.now() + cooldownMs);
  }

  /**
   * Check if similar alert already exists
   */
  private hasSimilarActiveAlert(sessionId: string, type: HealthAlert['type']): boolean {
    return Array.from(this.activeAlerts.values()).some(
      alert => alert.sessionId === sessionId && alert.type === type && !alert.resolved
    );
  }

  /**
   * Send alert notifications through various channels
   */
  private async sendAlertNotifications(alert: HealthAlert): Promise<void> {
    const notifications: AlertNotification[] = [];

    try {
      // Log notification
      notifications.push({
        alert,
        method: 'log',
        delivered: true,
        deliveredAt: new Date(),
      });

      // Callback notifications
      for (const callback of this.alertCallbacks) {
        try {
          callback(alert);
          notifications.push({
            alert,
            method: 'callback',
            delivered: true,
            deliveredAt: new Date(),
          });
        } catch (error) {
          logger.error('Error in alert callback:', error);
          notifications.push({
            alert,
            method: 'callback',
            delivered: false,
            error: error instanceof Error ? error.message : 'Unknown callback error',
          });
        }
      }

      // Database notification
      try {
        await this.saveAlertToDatabase(alert);
        notifications.push({
          alert,
          method: 'database',
          delivered: true,
          deliveredAt: new Date(),
        });
      } catch (error) {
        logger.error('Error saving alert to database:', error);
        notifications.push({
          alert,
          method: 'database',
          delivered: false,
          error: error instanceof Error ? error.message : 'Database save error',
        });
      }
    } catch (error) {
      logger.error('Error sending alert notifications:', error);
    }
  }

  /**
   * Save alert to database
   */
  private async saveAlertToDatabase(alert: HealthAlert): Promise<void> {
    try {
      await this.persistenceService.updateSessionStatus(alert.sessionId, undefined, {
        metadata: {
          lastAlertTime: alert.timestamp.toISOString(),
          lastAlertType: alert.type,
          lastAlertSeverity: alert.severity,
          lastAlertId: alert.id,
          alertsGenerated: Date.now(),
        },
      });
    } catch (error) {
      logger.error('Error saving alert to database:', error);
      throw error;
    }
  }

  /**
   * Auto-resolve alerts for healthy sessions
   */
  private async autoResolveAlerts(sessionId: string): Promise<number> {
    let resolvedCount = 0;

    for (const [alertId, alert] of this.activeAlerts.entries()) {
      if (alert.sessionId === sessionId && !alert.resolved) {
        alert.resolved = true;
        resolvedCount++;
        logger.info(`✅ Auto-resolved alert: ${alert.sessionId}: ${alert.message}`);
      }
    }

    if (resolvedCount > 0) {
      logger.info(`✅ Auto-resolved ${resolvedCount} alerts for session ${sessionId}`);
    }

    return resolvedCount;
  }

  /**
   * Manually resolve an alert
   */
  async resolveAlert(alertId: string, reason?: string): Promise<boolean> {
    const alert = this.activeAlerts.get(alertId);

    if (!alert) {
      logger.warn(`⚠️ Attempted to resolve non-existent alert: ${alertId}`);
      return false;
    }

    if (alert.resolved) {
      logger.debug(`⚠️ Alert ${alertId} already resolved`);
      return true;
    }

    alert.resolved = true;
    alert.metadata = {
      ...alert.metadata,
      resolvedAt: new Date().toISOString(),
      resolvedReason: reason || 'Manual resolution',
    };

    logger.info(`✅ Manually resolved alert: ${alert.sessionId}: ${alert.message}`);
    return true;
  }

  /**
   * Resolve all alerts for a session
   */
  async resolveSessionAlerts(sessionId: string, reason?: string): Promise<number> {
    let resolvedCount = 0;

    for (const [alertId, alert] of this.activeAlerts.entries()) {
      if (alert.sessionId === sessionId && !alert.resolved) {
        await this.resolveAlert(alertId, reason);
        resolvedCount++;
      }
    }

    return resolvedCount;
  }

  /**
   * Register alert callback
   */
  registerAlertCallback(callback: (alert: HealthAlert) => void): void {
    this.alertCallbacks.push(callback);
    logger.debug(`📞 Registered alert callback (total: ${this.alertCallbacks.length})`);
  }

  /**
   * Remove alert callback
   */
  removeAlertCallback(callback: (alert: HealthAlert) => void): void {
    const index = this.alertCallbacks.indexOf(callback);
    if (index > -1) {
      this.alertCallbacks.splice(index, 1);
      logger.debug(`📞 Removed alert callback (total: ${this.alertCallbacks.length})`);
    }
  }

  /**
   * Add custom alert rule
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
    logger.info(`📏 Added custom alert rule: ${rule.name} (${rule.id})`);
  }

  /**
   * Remove alert rule
   */
  removeAlertRule(ruleId: string): boolean {
    const removed = this.alertRules.delete(ruleId);
    if (removed) {
      logger.info(`📏 Removed alert rule: ${ruleId}`);
    }
    return removed;
  }

  /**
   * Enable/disable alert rule
   */
  setAlertRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const rule = this.alertRules.get(ruleId);
    if (!rule) return false;

    rule.enabled = enabled;
    logger.info(`📏 ${enabled ? 'Enabled' : 'Disabled'} alert rule: ${rule.name} (${ruleId})`);
    return true;
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(): HealthAlert[] {
    return Array.from(this.activeAlerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * Get active alerts for specific session
   */
  getSessionActiveAlerts(sessionId: string): HealthAlert[] {
    return Array.from(this.activeAlerts.values()).filter(
      alert => alert.sessionId === sessionId && !alert.resolved
    );
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit?: number): HealthAlert[] {
    const history = [...this.alertHistory].reverse(); // Most recent first
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Get alert history for specific session
   */
  getSessionAlertHistory(sessionId: string, limit?: number): HealthAlert[] {
    const sessionHistory = this.alertHistory
      .filter(alert => alert.sessionId === sessionId)
      .reverse(); // Most recent first

    return limit ? sessionHistory.slice(0, limit) : sessionHistory;
  }

  /**
   * Get alert statistics
   */
  getAlertStatistics(): AlertStatistics {
    const allAlerts = this.alertHistory;
    const activeAlerts = this.getActiveAlerts();
    const resolvedAlerts = allAlerts.filter(alert => alert.resolved);

    const alertsBySeverity: Record<HealthAlert['severity'], number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    const alertsByType: Record<HealthAlert['type'], number> = {
      connection: 0,
      auth: 0,
      performance: 0,
      functionality: 0,
    };

    allAlerts.forEach(alert => {
      alertsBySeverity[alert.severity]++;
      alertsByType[alert.type]++;
    });

    // Calculate average resolution time
    let totalResolutionTime = 0;
    let resolvedWithTime = 0;

    resolvedAlerts.forEach(alert => {
      if (alert.metadata?.resolvedAt) {
        const resolvedAt = new Date(alert.metadata.resolvedAt);
        const resolutionTime = resolvedAt.getTime() - alert.timestamp.getTime();
        totalResolutionTime += resolutionTime;
        resolvedWithTime++;
      }
    });

    const averageResolutionTime = resolvedWithTime > 0 ? totalResolutionTime / resolvedWithTime : 0;

    return {
      totalAlerts: allAlerts.length,
      alertsBySeverity,
      alertsByType,
      alertsResolved: resolvedAlerts.length,
      averageResolutionTime,
      activeAlerts: activeAlerts.length,
    };
  }

  /**
   * Cleanup old resolved alerts
   */
  cleanupOldAlerts(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const cutoffTime = Date.now() - maxAgeMs;
    let removedCount = 0;

    // Remove from active alerts
    for (const [alertId, alert] of this.activeAlerts.entries()) {
      if (alert.resolved && alert.timestamp.getTime() < cutoffTime) {
        this.activeAlerts.delete(alertId);
        removedCount++;
      }
    }

    // Clean history
    const originalHistoryLength = this.alertHistory.length;
    this.alertHistory = this.alertHistory.filter(
      alert => !alert.resolved || alert.timestamp.getTime() >= cutoffTime
    );
    removedCount += originalHistoryLength - this.alertHistory.length;

    if (removedCount > 0) {
      logger.info(`🧹 Cleaned up ${removedCount} old resolved alerts`);
    }

    return removedCount;
  }

  /**
   * Clear all cooldowns (useful for testing)
   */
  clearAllCooldowns(): void {
    this.alertCooldowns.clear();
    logger.debug('🧹 Cleared all alert cooldowns');
  }

  /**
   * Get alert rules
   */
  getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  /**
   * Get specific alert rule
   */
  getAlertRule(ruleId: string): AlertRule | undefined {
    return this.alertRules.get(ruleId);
  }
}
