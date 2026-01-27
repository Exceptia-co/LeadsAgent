import { logger } from '../../utils/logger';
import SessionPersistenceService from '../SessionPersistenceService';
import type { WhatsAppSession } from '../../types';

export interface RecoveryMetrics {
  averageRecoveryTime: number;
  successRate: number;
  authHealthScore: number;
  totalSessions: number;
  activeSessions: number;
  connectedSessions: number;
  disconnectedSessions: number;
  lastRecoveryTime?: Date;
  uptime: number;
}

export interface SessionHealthStats {
  healthy: number;
  total: number;
  healthyPercentage: number;
  unhealthySessions: string[];
}

export interface RecoveryStatsDetail {
  lastRecovery?: Date;
  totalRecoveries: number;
  successRate: number;
  authHealthScore: number;
  averageRecoveryTime: number;
  sessionsWithValidAuth: number;
  totalActiveSessions: number;
}

export class HealthMetrics {
  private persistenceService = SessionPersistenceService;
  private recoveryTimes: number[] = [];
  private recoveryStartTime?: number;

  recordRecoveryStart(): void {
    this.recoveryStartTime = Date.now();
    this.recoveryTimes = [];
  }

  recordSessionRecoveryTime(recoveryTimeMs: number): void {
    this.recoveryTimes.push(recoveryTimeMs);
  }

  calculateRecoveryMetrics(
    totalSessions: number,
    recoveredSessions: number,
    authValidationPassed: number
  ): RecoveryMetrics {
    const averageRecoveryTime =
      this.recoveryTimes.length > 0
        ? this.recoveryTimes.reduce((a, b) => a + b, 0) / this.recoveryTimes.length
        : 0;

    const successRate = totalSessions > 0 ? recoveredSessions / totalSessions : 0;

    const authHealthScore = totalSessions > 0 ? authValidationPassed / totalSessions : 0;

    const uptime = this.recoveryStartTime ? Date.now() - this.recoveryStartTime : 0;

    return {
      averageRecoveryTime,
      successRate,
      authHealthScore,
      totalSessions,
      activeSessions: recoveredSessions,
      connectedSessions: recoveredSessions,
      disconnectedSessions: totalSessions - recoveredSessions,
      lastRecoveryTime: new Date(),
      uptime,
    };
  }

  async checkSessionsHealth(whatsAppService: any): Promise<SessionHealthStats> {
    try {
      const allSessions = await whatsAppService.getAllSessions();
      const healthySessions = allSessions.filter(
        (session: WhatsAppSession) =>
          session.status === 'ready' || session.status === 'authenticated'
      );

      const unhealthySessions = allSessions
        .filter(
          (session: WhatsAppSession) =>
            session.status !== 'ready' && session.status !== 'authenticated'
        )
        .map((session: WhatsAppSession) => session.id);

      const healthyPercentage =
        allSessions.length > 0 ? (healthySessions.length / allSessions.length) * 100 : 0;

      return {
        healthy: healthySessions.length,
        total: allSessions.length,
        healthyPercentage,
        unhealthySessions,
      };
    } catch (error) {
      logger.error('Error checking session health:', error);
      return {
        healthy: 0,
        total: 0,
        healthyPercentage: 0,
        unhealthySessions: [],
      };
    }
  }

  async getDetailedRecoveryStats(): Promise<RecoveryStatsDetail> {
    try {
      const stats = await this.persistenceService.getSessionStats();
      const sessionsWithRecovery = await this.persistenceService.loadActiveSessions();

      const recoveryData = sessionsWithRecovery
        .map(s => s.metadata?.lastRecovery)
        .filter(Boolean)
        .map(d => new Date(d));

      const lastRecovery =
        recoveryData.length > 0
          ? new Date(Math.max(...recoveryData.map(d => d.getTime())))
          : undefined;

      let sessionsWithValidAuth = 0;
      for (const session of sessionsWithRecovery) {
        if (session.metadata?.authFileExists && !session.metadata?.authCorruptionDetected) {
          sessionsWithValidAuth++;
        }
      }

      const authHealthScore =
        sessionsWithRecovery.length > 0 ? sessionsWithValidAuth / sessionsWithRecovery.length : 0;

      const recoveryTimes = sessionsWithRecovery
        .map(s => s.metadata?.lastRecoveryTime)
        .filter(Boolean)
        .map(t => parseInt(t as string));

      const averageRecoveryTime =
        recoveryTimes.length > 0
          ? recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length
          : 0;

      return {
        lastRecovery,
        totalRecoveries: recoveryData.length,
        successRate: stats.active > 0 ? stats.connected / stats.active : 0,
        authHealthScore,
        averageRecoveryTime,
        sessionsWithValidAuth,
        totalActiveSessions: sessionsWithRecovery.length,
      };
    } catch (error) {
      logger.error('Error getting detailed recovery stats:', error);
      return {
        totalRecoveries: 0,
        successRate: 0,
        authHealthScore: 0,
        averageRecoveryTime: 0,
        sessionsWithValidAuth: 0,
        totalActiveSessions: 0,
      };
    }
  }

  async updateSessionHealthMetadata(
    whatsAppService: any,
    intervalMs: number = 5 * 60 * 1000
  ): Promise<void> {
    try {
      const health = await this.checkSessionsHealth(whatsAppService);
      logger.debug(
        `💊 Health check: ${health.healthy}/${health.total} sesiones saludables (${health.healthyPercentage.toFixed(1)}%)`
      );

      const sessions = await whatsAppService.getAllSessions();
      for (const session of sessions) {
        await this.persistenceService.updateSessionStatus(session.id, session.status, {
          metadata: {
            lastHealthCheck: new Date().toISOString(),
            healthCheckInterval: intervalMs,
            isHealthy: session.status === 'ready' || session.status === 'authenticated',
          },
        });
      }
    } catch (error) {
      logger.error('Error updating session health metadata:', error);
    }
  }

  scheduleHealthChecks(whatsAppService: any, intervalMs: number = 5 * 60 * 1000): NodeJS.Timeout {
    logger.info(`⏰ Programando health checks cada ${intervalMs / 1000} segundos`);

    return setInterval(async () => {
      try {
        await this.updateSessionHealthMetadata(whatsAppService, intervalMs);
      } catch (error) {
        logger.error('Error en health check programado:', error);
      }
    }, intervalMs);
  }

  calculateUptimeMetrics(startTime: number): {
    uptimeMs: number;
    uptimeSeconds: number;
    uptimeMinutes: number;
    uptimeHours: number;
    formattedUptime: string;
  } {
    const uptimeMs = Date.now() - startTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const uptimeMinutes = Math.floor(uptimeSeconds / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);

    const remainingMinutes = uptimeMinutes % 60;
    const remainingSeconds = uptimeSeconds % 60;

    const formattedUptime =
      uptimeHours > 0
        ? `${uptimeHours}h ${remainingMinutes}m ${remainingSeconds}s`
        : uptimeMinutes > 0
          ? `${uptimeMinutes}m ${remainingSeconds}s`
          : `${remainingSeconds}s`;

    return {
      uptimeMs,
      uptimeSeconds,
      uptimeMinutes,
      uptimeHours,
      formattedUptime,
    };
  }

  generateHealthReport(metrics: RecoveryMetrics, healthStats: SessionHealthStats): string {
    const lines = [
      '📊 === Session Recovery Health Report ===',
      `🔄 Total Sessions: ${metrics.totalSessions}`,
      `✅ Connected: ${metrics.connectedSessions} (${(metrics.successRate * 100).toFixed(1)}%)`,
      `❌ Disconnected: ${metrics.disconnectedSessions}`,
      `🔐 Auth Health Score: ${(metrics.authHealthScore * 100).toFixed(1)}%`,
      `⏱️  Average Recovery Time: ${metrics.averageRecoveryTime.toFixed(0)}ms`,
      `💊 Current Health: ${healthStats.healthy}/${healthStats.total} (${healthStats.healthyPercentage.toFixed(1)}%)`,
      `⏰ Last Recovery: ${metrics.lastRecoveryTime?.toISOString() || 'Never'}`,
      `🕐 Uptime: ${this.formatUptime(metrics.uptime)}`,
      '============================================',
    ];

    if (healthStats.unhealthySessions.length > 0) {
      lines.push(`⚠️  Unhealthy Sessions: ${healthStats.unhealthySessions.join(', ')}`);
    }

    return lines.join('\n');
  }

  private formatUptime(uptimeMs: number): string {
    const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
    const uptimeMinutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
    const uptimeSeconds = Math.floor((uptimeMs % (1000 * 60)) / 1000);

    if (uptimeHours > 0) {
      return `${uptimeHours}h ${uptimeMinutes}m ${uptimeSeconds}s`;
    } else if (uptimeMinutes > 0) {
      return `${uptimeMinutes}m ${uptimeSeconds}s`;
    } else {
      return `${uptimeSeconds}s`;
    }
  }

  reset(): void {
    this.recoveryTimes = [];
    this.recoveryStartTime = undefined;
  }
}

export default new HealthMetrics();
