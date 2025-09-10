import { logger } from '../../utils/logger';
import SessionPersistenceService from '../SessionPersistenceService';
import { RecoveryMetrics, SessionHealthStats } from './HealthMetrics';

export interface Alert {
  id: string;
  type: 'recovery_failure' | 'auth_corruption' | 'health_degradation' | 'session_cleanup';
  severity: 'low' | 'medium' | 'high' | 'critical';
  sessionId?: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  metadata?: Record<string, any>;
}

export interface AlertThresholds {
  maxFailedRecoveries: number;
  minHealthPercentage: number;
  maxUnhealthySessions: number;
  authHealthThreshold: number;
  recoveryTimeThreshold: number;
}

export class AlertsService {
  private persistenceService = SessionPersistenceService;
  private activeAlerts: Map<string, Alert> = new Map();

  private defaultThresholds: AlertThresholds = {
    maxFailedRecoveries: 5,
    minHealthPercentage: 70,
    maxUnhealthySessions: 3,
    authHealthThreshold: 0.8,
    recoveryTimeThreshold: 30000,
  };

  async generateRecoveryAlerts(
    metrics: RecoveryMetrics,
    healthStats: SessionHealthStats,
    thresholds: Partial<AlertThresholds> = {}
  ): Promise<Alert[]> {
    const config = { ...this.defaultThresholds, ...thresholds };
    const newAlerts: Alert[] = [];

    if (metrics.successRate < config.minHealthPercentage / 100) {
      const alert = this.createAlert(
        'recovery_failure',
        'critical',
        `Recovery success rate is ${(metrics.successRate * 100).toFixed(1)}% (threshold: ${config.minHealthPercentage}%)`,
        {
          successRate: metrics.successRate,
          threshold: config.minHealthPercentage,
          totalSessions: metrics.totalSessions,
          recoveredSessions: metrics.activeSessions,
        }
      );
      newAlerts.push(alert);
    }

    if (metrics.authHealthScore < config.authHealthThreshold) {
      const alert = this.createAlert(
        'auth_corruption',
        'high',
        `Authentication health score is ${(metrics.authHealthScore * 100).toFixed(1)}% (threshold: ${(config.authHealthThreshold * 100).toFixed(1)}%)`,
        {
          authHealthScore: metrics.authHealthScore,
          threshold: config.authHealthThreshold,
        }
      );
      newAlerts.push(alert);
    }

    if (healthStats.healthyPercentage < config.minHealthPercentage) {
      const alert = this.createAlert(
        'health_degradation',
        'high',
        `Session health is ${healthStats.healthyPercentage.toFixed(1)}% (${healthStats.healthy}/${healthStats.total}) - threshold: ${config.minHealthPercentage}%`,
        {
          healthyPercentage: healthStats.healthyPercentage,
          healthySessions: healthStats.healthy,
          totalSessions: healthStats.total,
          unhealthySessions: healthStats.unhealthySessions,
          threshold: config.minHealthPercentage,
        }
      );
      newAlerts.push(alert);
    }

    if (healthStats.unhealthySessions.length > config.maxUnhealthySessions) {
      const alert = this.createAlert(
        'health_degradation',
        'medium',
        `Too many unhealthy sessions: ${healthStats.unhealthySessions.length} (threshold: ${config.maxUnhealthySessions})`,
        {
          unhealthyCount: healthStats.unhealthySessions.length,
          unhealthySessions: healthStats.unhealthySessions,
          threshold: config.maxUnhealthySessions,
        }
      );
      newAlerts.push(alert);
    }

    if (metrics.averageRecoveryTime > config.recoveryTimeThreshold) {
      const alert = this.createAlert(
        'recovery_failure',
        'medium',
        `Average recovery time is ${metrics.averageRecoveryTime.toFixed(0)}ms (threshold: ${config.recoveryTimeThreshold}ms)`,
        {
          averageRecoveryTime: metrics.averageRecoveryTime,
          threshold: config.recoveryTimeThreshold,
        }
      );
      newAlerts.push(alert);
    }

    for (const alert of newAlerts) {
      this.activeAlerts.set(alert.id, alert);
    }

    if (newAlerts.length > 0) {
      logger.warn(`🚨 Generated ${newAlerts.length} new alerts:`);
      for (const alert of newAlerts) {
        logger.warn(`  - [${alert.severity.toUpperCase()}] ${alert.type}: ${alert.message}`);
      }
    }

    return newAlerts;
  }

  async generateSessionAlert(
    sessionId: string,
    type: Alert['type'],
    severity: Alert['severity'],
    message: string,
    metadata?: Record<string, any>
  ): Promise<Alert> {
    const alert = this.createAlert(type, severity, message, metadata, sessionId);
    this.activeAlerts.set(alert.id, alert);

    await this.persistenceService.updateSessionStatus(sessionId, 'disconnected', {
      lastError: `Alert: ${message}`,
      metadata: {
        alertId: alert.id,
        alertType: type,
        alertSeverity: severity,
        alertTimestamp: alert.timestamp.toISOString(),
      },
    });

    logger.warn(`🚨 Session Alert [${severity.toUpperCase()}] ${sessionId}: ${message}`);
    return alert;
  }

  async resolveAlert(alertId: string, resolvedBy?: string): Promise<boolean> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.resolved = true;
    alert.resolvedAt = new Date();
    alert.metadata = {
      ...alert.metadata,
      resolvedBy,
      resolvedAt: new Date().toISOString(),
    };

    if (alert.sessionId) {
      await this.persistenceService.updateSessionStatus(alert.sessionId, 'connecting', {
        metadata: {
          alertResolved: true,
          alertResolvedAt: new Date().toISOString(),
          alertResolvedBy: resolvedBy,
        },
      });
    }

    logger.info(`✅ Alert resolved: ${alertId} by ${resolvedBy || 'system'}`);
    return true;
  }

  async autoResolveAlerts(
    currentMetrics: RecoveryMetrics,
    currentHealthStats: SessionHealthStats
  ): Promise<string[]> {
    const resolvedAlerts: string[] = [];
    const config = this.defaultThresholds;

    for (const [alertId, alert] of this.activeAlerts.entries()) {
      if (alert.resolved) continue;

      let shouldResolve = false;

      switch (alert.type) {
        case 'recovery_failure':
          if (currentMetrics.successRate >= config.minHealthPercentage / 100) {
            shouldResolve = true;
          }
          break;

        case 'auth_corruption':
          if (currentMetrics.authHealthScore >= config.authHealthThreshold) {
            shouldResolve = true;
          }
          break;

        case 'health_degradation':
          if (
            currentHealthStats.healthyPercentage >= config.minHealthPercentage &&
            currentHealthStats.unhealthySessions.length <= config.maxUnhealthySessions
          ) {
            shouldResolve = true;
          }
          break;

        case 'session_cleanup':
          shouldResolve = true;
          break;
      }

      if (shouldResolve) {
        await this.resolveAlert(alertId, 'auto-resolver');
        resolvedAlerts.push(alertId);
      }
    }

    if (resolvedAlerts.length > 0) {
      logger.info(`✅ Auto-resolved ${resolvedAlerts.length} alerts: ${resolvedAlerts.join(', ')}`);
    }

    return resolvedAlerts;
  }

  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(alert => !alert.resolved);
  }

  getResolvedAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(alert => alert.resolved);
  }

  getAllAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  getAlertsBySession(sessionId: string): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(alert => alert.sessionId === sessionId);
  }

  getAlertsBySeverity(severity: Alert['severity']): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(alert => alert.severity === severity);
  }

  generateAlertsSummary(): string {
    const activeAlerts = this.getActiveAlerts();
    const resolvedAlerts = this.getResolvedAlerts();

    if (activeAlerts.length === 0 && resolvedAlerts.length === 0) {
      return '✅ No alerts generated';
    }

    const lines = [
      '🚨 === Alerts Summary ===',
      `Active: ${activeAlerts.length} | Resolved: ${resolvedAlerts.length}`,
    ];

    if (activeAlerts.length > 0) {
      lines.push('\n🔴 Active Alerts:');
      for (const alert of activeAlerts) {
        const sessionInfo = alert.sessionId ? ` [${alert.sessionId}]` : '';
        lines.push(
          `  - [${alert.severity.toUpperCase()}] ${alert.type}${sessionInfo}: ${alert.message}`
        );
      }
    }

    if (resolvedAlerts.length > 0) {
      lines.push('\n✅ Recently Resolved:');
      const recentResolved = resolvedAlerts
        .filter(
          alert => alert.resolvedAt && Date.now() - alert.resolvedAt.getTime() < 60 * 60 * 1000
        ) // Last hour
        .slice(0, 5);

      for (const alert of recentResolved) {
        const sessionInfo = alert.sessionId ? ` [${alert.sessionId}]` : '';
        const resolvedTime = alert.resolvedAt
          ? `(${Math.floor((Date.now() - alert.resolvedAt.getTime()) / 60000)}m ago)`
          : '';
        lines.push(
          `  - [${alert.severity.toUpperCase()}] ${alert.type}${sessionInfo} ${resolvedTime}`
        );
      }
    }

    lines.push('========================');
    return lines.join('\n');
  }

  async cleanupOldAlerts(maxAgeHours: number = 24): Promise<number> {
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [alertId, alert] of this.activeAlerts.entries()) {
      if (alert.resolved && alert.resolvedAt && alert.resolvedAt < cutoffTime) {
        this.activeAlerts.delete(alertId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`🧹 Cleaned up ${cleanedCount} old resolved alerts (older than ${maxAgeHours}h)`);
    }

    return cleanedCount;
  }

  private createAlert(
    type: Alert['type'],
    severity: Alert['severity'],
    message: string,
    metadata?: Record<string, any>,
    sessionId?: string
  ): Alert {
    return {
      id: this.generateAlertId(),
      type,
      severity,
      sessionId,
      message,
      timestamp: new Date(),
      resolved: false,
      metadata,
    };
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

export default new AlertsService();
