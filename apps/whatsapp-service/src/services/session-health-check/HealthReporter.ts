import { logger } from '../../utils/logger';
import type { SessionHealthStatus } from './DiagnosticsEngine';
import type { HealthAlert, AlertStatistics } from './AlertManager';

export interface OverallHealthReport {
  totalSessions: number;
  healthySessions: number;
  warningSessions: number;
  criticalSessions: number;
  offlineSessions: number;
  averageResponseTime: number;
  overallHealth: 'healthy' | 'degraded' | 'critical';
  alerts: HealthAlert[];
  timestamp: Date;
  reportMetadata: {
    reportId: string;
    generatedBy: string;
    checkDuration: number;
    dataSource: 'live' | 'cached';
  };
}

export interface HealthDashboard {
  overview: OverallHealthReport;
  sessionDetails: SessionHealthStatus[];
  alerts: HealthAlert[];
  trends: HealthTrend[];
  recommendations: HealthRecommendation[];
  systemMetrics: SystemMetrics;
}

export interface HealthTrend {
  type: 'performance' | 'availability' | 'reliability' | 'alerts';
  direction: 'improving' | 'degrading' | 'stable';
  change: number;
  period: string;
  description: string;
  significance: 'low' | 'medium' | 'high';
}

export interface HealthRecommendation {
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'optimization' | 'maintenance' | 'security' | 'scaling';
  title: string;
  description: string;
  actionItems: string[];
  impact: string;
  effort: 'low' | 'medium' | 'high';
  sessionIds?: string[];
}

export interface SystemMetrics {
  uptime: number;
  totalChecksPerformed: number;
  checkFrequency: number;
  lastCheckTime: Date;
  averageCheckDuration: number;
  memoryUsage: {
    alertsStored: number;
    historyStored: number;
    cacheSize: number;
  };
}

export interface HealthExport {
  format: 'json' | 'csv' | 'pdf' | 'html';
  data: any;
  generatedAt: Date;
  metadata: {
    exportId: string;
    sessionCount: number;
    alertCount: number;
    timeRange: { start: Date; end: Date };
  };
}

/**
 * Health reporting module for status reports and dashboards
 * Responsible for generating comprehensive health reports and analytics
 */
export class HealthReporter {
  private reportHistory: OverallHealthReport[] = [];
  private readonly maxReportHistory = 100;
  private reportGenerationCount = 0;
  private totalCheckDuration = 0;

  /**
   * Generate comprehensive overall health report
   */
  generateOverallReport(
    healthStatuses: SessionHealthStatus[],
    activeAlerts: HealthAlert[],
    checkDuration: number = 0
  ): OverallHealthReport {
    const startTime = Date.now();
    this.reportGenerationCount++;

    logger.debug(`📊 Generating overall health report for ${healthStatuses.length} sessions`);

    const totalSessions = healthStatuses.length;
    const healthCounts = this.calculateHealthCounts(healthStatuses);
    const averageResponseTime = this.calculateAverageResponseTime(healthStatuses);
    const overallHealth = this.determineOverallHealth(healthCounts, totalSessions);

    const report: OverallHealthReport = {
      totalSessions,
      healthySessions: healthCounts.healthy,
      warningSessions: healthCounts.warning,
      criticalSessions: healthCounts.critical,
      offlineSessions: healthCounts.offline,
      averageResponseTime,
      overallHealth,
      alerts: activeAlerts.filter(alert => !alert.resolved),
      timestamp: new Date(),
      reportMetadata: {
        reportId: this.generateReportId(),
        generatedBy: 'HealthReporter',
        checkDuration,
        dataSource: 'live',
      },
    };

    // Store in history
    this.storeReportInHistory(report);

    const generationDuration = Date.now() - startTime;
    this.totalCheckDuration += generationDuration;

    logger.debug(
      `📊 Overall health report generated in ${generationDuration}ms: ${overallHealth} (${healthCounts.healthy}/${totalSessions} healthy)`
    );

    return report;
  }

  /**
   * Calculate health status counts
   */
  private calculateHealthCounts(healthStatuses: SessionHealthStatus[]): {
    healthy: number;
    warning: number;
    critical: number;
    offline: number;
  } {
    return {
      healthy: healthStatuses.filter(h => h.status === 'healthy').length,
      warning: healthStatuses.filter(h => h.status === 'warning').length,
      critical: healthStatuses.filter(h => h.status === 'critical').length,
      offline: healthStatuses.filter(h => h.status === 'offline').length,
    };
  }

  /**
   * Calculate average response time
   */
  private calculateAverageResponseTime(healthStatuses: SessionHealthStatus[]): number {
    if (healthStatuses.length === 0) return 0;

    const totalResponseTime = healthStatuses.reduce((sum, h) => sum + h.metrics.responseTimeMs, 0);
    return Math.round(totalResponseTime / healthStatuses.length);
  }

  /**
   * Determine overall system health
   */
  private determineOverallHealth(
    healthCounts: { healthy: number; warning: number; critical: number; offline: number },
    totalSessions: number
  ): 'healthy' | 'degraded' | 'critical' {
    if (totalSessions === 0) return 'healthy';

    const criticalRatio = (healthCounts.critical + healthCounts.offline) / totalSessions;
    const warningRatio = healthCounts.warning / totalSessions;

    if (criticalRatio > 0.3 || healthCounts.offline > totalSessions * 0.5) {
      return 'critical';
    } else if (criticalRatio > 0.1 || warningRatio > 0.4 || healthCounts.offline > 0) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  /**
   * Generate comprehensive health dashboard
   */
  async generateHealthDashboard(
    healthStatuses: SessionHealthStatus[],
    activeAlerts: HealthAlert[],
    alertStatistics: AlertStatistics
  ): Promise<HealthDashboard> {
    logger.debug('📊 Generating comprehensive health dashboard');

    const overview = this.generateOverallReport(healthStatuses, activeAlerts);
    const trends = this.analyzeTrends();
    const recommendations = this.generateRecommendations(healthStatuses, activeAlerts);
    const systemMetrics = this.getSystemMetrics(alertStatistics);

    const dashboard: HealthDashboard = {
      overview,
      sessionDetails: healthStatuses,
      alerts: activeAlerts,
      trends,
      recommendations,
      systemMetrics,
    };

    logger.debug(
      `📊 Health dashboard generated with ${recommendations.length} recommendations and ${trends.length} trends`
    );

    return dashboard;
  }

  /**
   * Analyze health trends from historical data
   */
  private analyzeTrends(): HealthTrend[] {
    const trends: HealthTrend[] = [];

    if (this.reportHistory.length < 2) {
      return trends;
    }

    const recentReports = this.reportHistory.slice(-10); // Last 10 reports

    // Performance trend
    const performanceTrend = this.analyzePerformanceTrend(recentReports);
    if (performanceTrend) trends.push(performanceTrend);

    // Availability trend
    const availabilityTrend = this.analyzeAvailabilityTrend(recentReports);
    if (availabilityTrend) trends.push(availabilityTrend);

    // Alert trend
    const alertTrend = this.analyzeAlertTrend(recentReports);
    if (alertTrend) trends.push(alertTrend);

    return trends;
  }

  /**
   * Analyze performance trends
   */
  private analyzePerformanceTrend(reports: OverallHealthReport[]): HealthTrend | null {
    if (reports.length < 3) return null;

    const responseTimes = reports.map(r => r.averageResponseTime);
    const recentAvg = responseTimes.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const earlierAvg = responseTimes.slice(0, 3).reduce((a, b) => a + b, 0) / 3;

    const change = ((recentAvg - earlierAvg) / earlierAvg) * 100;

    let direction: 'improving' | 'degrading' | 'stable' = 'stable';
    let significance: 'low' | 'medium' | 'high' = 'low';

    if (Math.abs(change) > 20) {
      significance = 'high';
      direction = change > 0 ? 'degrading' : 'improving';
    } else if (Math.abs(change) > 10) {
      significance = 'medium';
      direction = change > 0 ? 'degrading' : 'improving';
    }

    return {
      type: 'performance',
      direction,
      change: Math.abs(change),
      period: `Last ${reports.length} checks`,
      description: `Average response time ${direction === 'improving' ? 'improved' : direction === 'degrading' ? 'degraded' : 'remained stable'} by ${Math.abs(change).toFixed(1)}%`,
      significance,
    };
  }

  /**
   * Analyze availability trends
   */
  private analyzeAvailabilityTrend(reports: OverallHealthReport[]): HealthTrend | null {
    if (reports.length < 3) return null;

    const availabilityRatios = reports.map(r =>
      r.totalSessions > 0 ? (r.healthySessions + r.warningSessions) / r.totalSessions : 1
    );

    const recentAvg = availabilityRatios.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const earlierAvg = availabilityRatios.slice(0, 3).reduce((a, b) => a + b, 0) / 3;

    const change = ((recentAvg - earlierAvg) / earlierAvg) * 100;

    let direction: 'improving' | 'degrading' | 'stable' = 'stable';
    let significance: 'low' | 'medium' | 'high' = 'low';

    if (Math.abs(change) > 5) {
      significance = 'high';
      direction = change > 0 ? 'improving' : 'degrading';
    } else if (Math.abs(change) > 2) {
      significance = 'medium';
      direction = change > 0 ? 'improving' : 'degrading';
    }

    return {
      type: 'availability',
      direction,
      change: Math.abs(change),
      period: `Last ${reports.length} checks`,
      description: `System availability ${direction === 'improving' ? 'improved' : direction === 'degrading' ? 'degraded' : 'remained stable'} by ${Math.abs(change).toFixed(1)}%`,
      significance,
    };
  }

  /**
   * Analyze alert trends
   */
  private analyzeAlertTrend(reports: OverallHealthReport[]): HealthTrend | null {
    if (reports.length < 3) return null;

    const alertCounts = reports.map(r => r.alerts.length);
    const recentAvg = alertCounts.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const earlierAvg = alertCounts.slice(0, 3).reduce((a, b) => a + b, 0) / 3;

    const change = earlierAvg > 0 ? ((recentAvg - earlierAvg) / earlierAvg) * 100 : 0;

    let direction: 'improving' | 'degrading' | 'stable' = 'stable';
    let significance: 'low' | 'medium' | 'high' = 'low';

    if (Math.abs(change) > 50) {
      significance = 'high';
      direction = change > 0 ? 'degrading' : 'improving';
    } else if (Math.abs(change) > 25) {
      significance = 'medium';
      direction = change > 0 ? 'degrading' : 'improving';
    }

    return {
      type: 'alerts',
      direction,
      change: Math.abs(change),
      period: `Last ${reports.length} checks`,
      description: `Alert frequency ${direction === 'improving' ? 'decreased' : direction === 'degrading' ? 'increased' : 'remained stable'} by ${Math.abs(change).toFixed(1)}%`,
      significance,
    };
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(
    healthStatuses: SessionHealthStatus[],
    activeAlerts: HealthAlert[]
  ): HealthRecommendation[] {
    const recommendations: HealthRecommendation[] = [];

    // Critical sessions that need immediate attention
    const criticalSessions = healthStatuses.filter(h => h.status === 'critical');
    if (criticalSessions.length > 0) {
      recommendations.push({
        priority: 'critical',
        category: 'maintenance',
        title: 'Critical Sessions Require Immediate Attention',
        description: `${criticalSessions.length} sessions are in critical state and may be affecting service availability`,
        actionItems: [
          'Review session logs for error patterns',
          'Restart affected sessions',
          'Check authentication status',
          'Verify network connectivity',
        ],
        impact: 'High - Service availability and user experience',
        effort: 'medium',
        sessionIds: criticalSessions.map(s => s.sessionId),
      });
    }

    // High response times
    const slowSessions = healthStatuses.filter(h => h.metrics.responseTimeMs > 5000);
    if (slowSessions.length > healthStatuses.length * 0.3) {
      recommendations.push({
        priority: 'high',
        category: 'optimization',
        title: 'Performance Optimization Needed',
        description: `${slowSessions.length} sessions are experiencing high response times`,
        actionItems: [
          'Analyze network latency patterns',
          'Review server resource utilization',
          'Consider load balancing improvements',
          'Implement caching strategies',
        ],
        impact: 'Medium - User experience and system efficiency',
        effort: 'high',
        sessionIds: slowSessions.map(s => s.sessionId),
      });
    }

    // Authentication issues
    const authIssues = healthStatuses.filter(
      h => h.metrics.authFileHealth === 'corrupted' || h.metrics.authFileHealth === 'missing'
    );
    if (authIssues.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'maintenance',
        title: 'Authentication Maintenance Required',
        description: `${authIssues.length} sessions have authentication-related issues`,
        actionItems: [
          'Clean up corrupted authentication files',
          'Re-authenticate affected sessions',
          'Implement authentication file backup strategy',
          'Review authentication file storage permissions',
        ],
        impact: 'High - Session functionality and reliability',
        effort: 'medium',
        sessionIds: authIssues.map(s => s.sessionId),
      });
    }

    // Alert management
    const highSeverityAlerts = activeAlerts.filter(
      a => a.severity === 'critical' || a.severity === 'high'
    );
    if (highSeverityAlerts.length > 5) {
      recommendations.push({
        priority: 'medium',
        category: 'maintenance',
        title: 'Alert Management Optimization',
        description: `${highSeverityAlerts.length} high-severity alerts require attention`,
        actionItems: [
          'Review and resolve active high-severity alerts',
          'Analyze alert patterns for root causes',
          'Consider adjusting alert thresholds',
          'Implement automated alert resolution for common issues',
        ],
        impact: 'Medium - Operational efficiency and monitoring effectiveness',
        effort: 'medium',
      });
    }

    // Scaling considerations
    if (healthStatuses.length > 50 && this.reportHistory.length > 10) {
      const recentReports = this.reportHistory.slice(-5);
      const avgCriticalSessions =
        recentReports.reduce((sum, r) => sum + r.criticalSessions, 0) / recentReports.length;

      if (avgCriticalSessions > healthStatuses.length * 0.1) {
        recommendations.push({
          priority: 'medium',
          category: 'scaling',
          title: 'Consider Infrastructure Scaling',
          description:
            'Consistent critical session rates suggest infrastructure may be under stress',
          actionItems: [
            'Review system resource utilization trends',
            'Consider horizontal scaling options',
            'Implement session load distribution',
            'Evaluate hardware upgrade requirements',
          ],
          impact: 'High - System stability and scalability',
          effort: 'high',
        });
      }
    }

    return recommendations;
  }

  /**
   * Get system metrics for dashboard
   */
  private getSystemMetrics(alertStatistics: AlertStatistics): SystemMetrics {
    const now = new Date();
    const uptime = process.uptime() * 1000; // Convert to milliseconds

    return {
      uptime,
      totalChecksPerformed: this.reportGenerationCount,
      checkFrequency: this.reportGenerationCount > 0 ? uptime / this.reportGenerationCount : 0,
      lastCheckTime:
        this.reportHistory.length > 0
          ? this.reportHistory[this.reportHistory.length - 1].timestamp
          : now,
      averageCheckDuration:
        this.reportGenerationCount > 0 ? this.totalCheckDuration / this.reportGenerationCount : 0,
      memoryUsage: {
        alertsStored: alertStatistics.totalAlerts,
        historyStored: this.reportHistory.length,
        cacheSize: this.estimateCacheSize(),
      },
    };
  }

  /**
   * Estimate cache size for memory usage reporting
   */
  private estimateCacheSize(): number {
    return this.reportHistory.length * 1024; // Rough estimate in bytes
  }

  /**
   * Export health data in various formats
   */
  async exportHealthData(
    healthStatuses: SessionHealthStatus[],
    alerts: HealthAlert[],
    format: 'json' | 'csv' | 'html' = 'json'
  ): Promise<HealthExport> {
    const exportId = this.generateExportId();
    const generatedAt = new Date();

    let data: any;

    switch (format) {
      case 'json':
        data = {
          sessions: healthStatuses,
          alerts: alerts,
          summary: this.generateOverallReport(healthStatuses, alerts),
        };
        break;

      case 'csv':
        data = this.convertToCSV(healthStatuses, alerts);
        break;

      case 'html':
        data = this.generateHTMLReport(healthStatuses, alerts);
        break;

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    const timeRange = this.calculateTimeRange(healthStatuses);

    return {
      format,
      data,
      generatedAt,
      metadata: {
        exportId,
        sessionCount: healthStatuses.length,
        alertCount: alerts.length,
        timeRange,
      },
    };
  }

  /**
   * Convert health data to CSV format
   */
  private convertToCSV(healthStatuses: SessionHealthStatus[], alerts: HealthAlert[]): string {
    const headers = [
      'Session ID',
      'Status',
      'Response Time (ms)',
      'Connected',
      'Authenticated',
      'Auth File Health',
      'Consecutive Failures',
      'Last Check',
      'Issues Count',
      'Active Alerts',
    ];

    const rows = healthStatuses.map(session => {
      const sessionAlerts = alerts.filter(a => a.sessionId === session.sessionId && !a.resolved);

      return [
        session.sessionId,
        session.status,
        session.metrics.responseTimeMs.toString(),
        session.metrics.isConnected.toString(),
        session.metrics.isAuthenticated.toString(),
        session.metrics.authFileHealth,
        session.metrics.consecutiveFailures.toString(),
        session.lastCheckTime.toISOString(),
        session.issues.length.toString(),
        sessionAlerts.length.toString(),
      ];
    });

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  /**
   * Generate HTML report
   */
  private generateHTMLReport(healthStatuses: SessionHealthStatus[], alerts: HealthAlert[]): string {
    const overview = this.generateOverallReport(healthStatuses, alerts);

    return `
<!DOCTYPE html>
<html>
<head>
    <title>WhatsApp Session Health Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background-color: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .metric { background-color: #e3f2fd; padding: 15px; border-radius: 5px; text-align: center; }
        .sessions { margin-top: 30px; }
        .session { border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 5px; }
        .healthy { border-left: 5px solid #4caf50; }
        .warning { border-left: 5px solid #ff9800; }
        .critical { border-left: 5px solid #f44336; }
        .offline { border-left: 5px solid #9e9e9e; }
    </style>
</head>
<body>
    <div class="header">
        <h1>WhatsApp Session Health Report</h1>
        <p>Generated: ${overview.timestamp.toISOString()}</p>
        <p>Overall Health: <strong>${overview.overallHealth.toUpperCase()}</strong></p>
    </div>
    
    <div class="summary">
        <div class="metric">
            <h3>${overview.totalSessions}</h3>
            <p>Total Sessions</p>
        </div>
        <div class="metric">
            <h3>${overview.healthySessions}</h3>
            <p>Healthy</p>
        </div>
        <div class="metric">
            <h3>${overview.warningSessions}</h3>
            <p>Warning</p>
        </div>
        <div class="metric">
            <h3>${overview.criticalSessions}</h3>
            <p>Critical</p>
        </div>
        <div class="metric">
            <h3>${overview.offlineSessions}</h3>
            <p>Offline</p>
        </div>
    </div>
    
    <div class="sessions">
        <h2>Session Details</h2>
        ${healthStatuses
          .map(
            session => `
            <div class="session ${session.status}">
                <h4>${session.sessionId}</h4>
                <p><strong>Status:</strong> ${session.status}</p>
                <p><strong>Response Time:</strong> ${session.metrics.responseTimeMs}ms</p>
                <p><strong>Connected:</strong> ${session.metrics.isConnected ? 'Yes' : 'No'}</p>
                <p><strong>Authenticated:</strong> ${session.metrics.isAuthenticated ? 'Yes' : 'No'}</p>
                ${session.issues.length > 0 ? `<p><strong>Issues:</strong> ${session.issues.join(', ')}</p>` : ''}
            </div>
        `
          )
          .join('')}
    </div>
</body>
</html>`;
  }

  /**
   * Calculate time range from health statuses
   */
  private calculateTimeRange(healthStatuses: SessionHealthStatus[]): { start: Date; end: Date } {
    if (healthStatuses.length === 0) {
      const now = new Date();
      return { start: now, end: now };
    }

    const times = healthStatuses.map(s => s.lastCheckTime.getTime());
    return {
      start: new Date(Math.min(...times)),
      end: new Date(Math.max(...times)),
    };
  }

  /**
   * Store report in history
   */
  private storeReportInHistory(report: OverallHealthReport): void {
    this.reportHistory.push(report);

    // Keep only recent history
    if (this.reportHistory.length > this.maxReportHistory) {
      this.reportHistory = this.reportHistory.slice(-this.maxReportHistory);
    }
  }

  /**
   * Generate unique report ID
   */
  private generateReportId(): string {
    return `report-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Generate unique export ID
   */
  private generateExportId(): string {
    return `export-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get report history
   */
  getReportHistory(limit?: number): OverallHealthReport[] {
    const history = [...this.reportHistory].reverse(); // Most recent first
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Clear old report history
   */
  clearOldReports(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const cutoffTime = Date.now() - maxAgeMs;
    const originalLength = this.reportHistory.length;

    this.reportHistory = this.reportHistory.filter(
      report => report.timestamp.getTime() >= cutoffTime
    );

    const removedCount = originalLength - this.reportHistory.length;

    if (removedCount > 0) {
      logger.info(`🧹 Cleaned up ${removedCount} old health reports`);
    }

    return removedCount;
  }

  /**
   * Get health statistics
   */
  getHealthStatistics(): {
    reportsGenerated: number;
    averageReportDuration: number;
    oldestReport?: Date;
    newestReport?: Date;
  } {
    return {
      reportsGenerated: this.reportGenerationCount,
      averageReportDuration:
        this.reportGenerationCount > 0 ? this.totalCheckDuration / this.reportGenerationCount : 0,
      oldestReport: this.reportHistory.length > 0 ? this.reportHistory[0].timestamp : undefined,
      newestReport:
        this.reportHistory.length > 0
          ? this.reportHistory[this.reportHistory.length - 1].timestamp
          : undefined,
    };
  }
}
