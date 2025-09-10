import { logger } from '../../utils/logger';
import { MetricsCollectionResult, SessionMetrics, HealthCheckOptions } from './HealthMetrics';

export interface SessionHealthStatus {
  sessionId: string;
  status: 'healthy' | 'warning' | 'critical' | 'offline';
  lastCheckTime: Date;
  metrics: SessionMetrics;
  issues: string[];
  recommendations: string[];
}

export interface DiagnosticAnalysis {
  sessionId: string;
  healthStatus: SessionHealthStatus;
  diagnosticFindings: DiagnosticFinding[];
  overallAssessment: HealthAssessment;
  urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface DiagnosticFinding {
  type: 'connection' | 'auth' | 'performance' | 'functionality' | 'resource';
  severity: 'info' | 'warning' | 'error' | 'critical';
  description: string;
  recommendation: string;
  category: string;
  metrics?: Record<string, any>;
}

export interface HealthAssessment {
  overallScore: number; // 0-100
  categoryScores: {
    connectivity: number;
    authentication: number;
    performance: number;
    reliability: number;
  };
  trends: {
    improving: boolean;
    degrading: boolean;
    stable: boolean;
  };
  predictedIssues: string[];
}

export interface HealthPattern {
  sessionId: string;
  pattern:
    | 'intermittent_failures'
    | 'gradual_degradation'
    | 'auth_cycling'
    | 'performance_spikes'
    | 'stable';
  confidence: number;
  duration: number;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

/**
 * Diagnostics engine for session health analysis
 * Responsible for analyzing metrics and determining health status
 */
export class DiagnosticsEngine {
  private healthHistory: Map<string, SessionHealthStatus[]> = new Map();
  private patternHistory: Map<string, HealthPattern[]> = new Map();
  private readonly maxHistorySize = 20;

  constructor(private options: HealthCheckOptions) {}

  /**
   * Analyze session health based on collected metrics
   */
  analyzeSessionHealth(metricsResult: MetricsCollectionResult): SessionHealthStatus {
    const { sessionId, metrics, issues, recommendations } = metricsResult;

    logger.debug(`🔍 Analyzing health for session ${sessionId}`);

    const healthStatus: SessionHealthStatus = {
      sessionId,
      status: 'healthy',
      lastCheckTime: metricsResult.collectionTime,
      metrics,
      issues: [...issues],
      recommendations: [...recommendations],
    };

    // Calculate overall health status based on multiple factors
    healthStatus.status = this.calculateOverallStatus(healthStatus);

    // Store in history for pattern analysis
    this.updateHealthHistory(sessionId, healthStatus);

    logger.debug(
      `🎯 Health analysis for ${sessionId}: ${healthStatus.status} (${issues.length} issues)`
    );

    return healthStatus;
  }

  /**
   * Calculate overall health status based on metrics and issues
   */
  private calculateOverallStatus(
    healthStatus: SessionHealthStatus
  ): 'healthy' | 'warning' | 'critical' | 'offline' {
    const { metrics, issues } = healthStatus;

    // Critical conditions that make session offline
    if (!metrics.isConnected) {
      return 'offline';
    }

    // Critical conditions that require immediate attention
    if (this.hasCriticalIssues(healthStatus)) {
      return 'critical';
    }

    // Warning conditions that need monitoring
    if (this.hasWarningConditions(healthStatus)) {
      return 'warning';
    }

    // Session appears healthy
    return 'healthy';
  }

  /**
   * Check for critical issues that require immediate action
   */
  private hasCriticalIssues(healthStatus: SessionHealthStatus): boolean {
    const { metrics } = healthStatus;

    return (
      metrics.authFileHealth === 'corrupted' ||
      metrics.consecutiveFailures >= this.options.maxConsecutiveFailures ||
      metrics.responseTimeMs > this.options.responseTimeoutMs ||
      this.hasAuthenticationFailure(healthStatus)
    );
  }

  /**
   * Check for warning conditions that need attention
   */
  private hasWarningConditions(healthStatus: SessionHealthStatus): boolean {
    const { metrics, issues } = healthStatus;

    return (
      metrics.responseTimeMs > this.options.alertThresholds.responseTime ||
      metrics.authFileHealth === 'missing' ||
      metrics.consecutiveFailures > 0 ||
      issues.length > 0 ||
      this.hasPerformanceDegradation(healthStatus)
    );
  }

  /**
   * Check for authentication-related failures
   */
  private hasAuthenticationFailure(healthStatus: SessionHealthStatus): boolean {
    const { metrics, issues } = healthStatus;

    return (
      !metrics.isAuthenticated ||
      issues.some(issue => issue.toLowerCase().includes('auth')) ||
      metrics.authFileHealth === 'corrupted'
    );
  }

  /**
   * Check for performance degradation patterns
   */
  private hasPerformanceDegradation(healthStatus: SessionHealthStatus): boolean {
    const { sessionId, metrics } = healthStatus;
    const history = this.healthHistory.get(sessionId) || [];

    if (history.length < 3) return false;

    // Check if response times are consistently increasing
    const recentResponseTimes = history.slice(-3).map(h => h.metrics.responseTimeMs);
    const isIncreasing = recentResponseTimes.every(
      (time, index) => index === 0 || time >= recentResponseTimes[index - 1]
    );

    return isIncreasing && metrics.responseTimeMs > this.options.alertThresholds.responseTime * 0.8;
  }

  /**
   * Perform comprehensive diagnostic analysis
   */
  performDiagnosticAnalysis(healthStatus: SessionHealthStatus): DiagnosticAnalysis {
    const { sessionId } = healthStatus;

    logger.debug(`🔬 Performing diagnostic analysis for session ${sessionId}`);

    const diagnosticFindings = this.generateDiagnosticFindings(healthStatus);
    const overallAssessment = this.assessOverallHealth(healthStatus);
    const urgencyLevel = this.determineUrgencyLevel(healthStatus, diagnosticFindings);

    const analysis: DiagnosticAnalysis = {
      sessionId,
      healthStatus,
      diagnosticFindings,
      overallAssessment,
      urgencyLevel,
    };

    // Update pattern analysis
    this.analyzeHealthPatterns(healthStatus);

    logger.debug(
      `🔬 Diagnostic analysis complete for ${sessionId}: ${urgencyLevel} urgency, ${diagnosticFindings.length} findings`
    );

    return analysis;
  }

  /**
   * Generate detailed diagnostic findings
   */
  private generateDiagnosticFindings(healthStatus: SessionHealthStatus): DiagnosticFinding[] {
    const findings: DiagnosticFinding[] = [];
    const { metrics, issues } = healthStatus;

    // Connection diagnostics
    if (!metrics.isConnected) {
      findings.push({
        type: 'connection',
        severity: 'critical',
        description: 'Session is not connected to WhatsApp servers',
        recommendation: 'Check network connectivity and restart session',
        category: 'connectivity',
        metrics: { isConnected: metrics.isConnected },
      });
    }

    // Authentication diagnostics
    if (metrics.authFileHealth !== 'valid') {
      findings.push({
        type: 'auth',
        severity: metrics.authFileHealth === 'corrupted' ? 'critical' : 'warning',
        description: `Authentication files are ${metrics.authFileHealth}`,
        recommendation:
          metrics.authFileHealth === 'corrupted'
            ? 'Clean up corrupted auth files and re-authenticate'
            : 'Authenticate the session',
        category: 'authentication',
        metrics: { authFileHealth: metrics.authFileHealth },
      });
    }

    // Performance diagnostics
    if (metrics.responseTimeMs > this.options.alertThresholds.responseTime) {
      findings.push({
        type: 'performance',
        severity: metrics.responseTimeMs > this.options.responseTimeoutMs ? 'critical' : 'warning',
        description: `High response time: ${metrics.responseTimeMs}ms`,
        recommendation: 'Check network latency and session load',
        category: 'performance',
        metrics: {
          responseTimeMs: metrics.responseTimeMs,
          threshold: this.options.alertThresholds.responseTime,
        },
      });
    }

    // Reliability diagnostics
    if (metrics.consecutiveFailures > 0) {
      findings.push({
        type: 'functionality',
        severity:
          metrics.consecutiveFailures >= this.options.maxConsecutiveFailures
            ? 'critical'
            : 'warning',
        description: `${metrics.consecutiveFailures} consecutive health check failures`,
        recommendation: 'Investigate session stability and consider restart',
        category: 'reliability',
        metrics: {
          consecutiveFailures: metrics.consecutiveFailures,
          maxAllowed: this.options.maxConsecutiveFailures,
        },
      });
    }

    // Resource diagnostics
    if (metrics.uptime > 24 * 60 * 60 * 1000) {
      // 24 hours
      findings.push({
        type: 'resource',
        severity: 'info',
        description: `Session has been running for ${Math.round(metrics.uptime / (60 * 60 * 1000))} hours`,
        recommendation: 'Consider scheduled restart for memory management',
        category: 'resource',
        metrics: { uptimeHours: Math.round(metrics.uptime / (60 * 60 * 1000)) },
      });
    }

    return findings;
  }

  /**
   * Assess overall health with scoring
   */
  private assessOverallHealth(healthStatus: SessionHealthStatus): HealthAssessment {
    const { metrics } = healthStatus;

    // Calculate category scores (0-100)
    const connectivity = metrics.isConnected ? 100 : 0;
    const authentication = this.calculateAuthScore(metrics);
    const performance = this.calculatePerformanceScore(metrics);
    const reliability = this.calculateReliabilityScore(metrics);

    const overallScore = Math.round(
      (connectivity + authentication + performance + reliability) / 4
    );

    // Analyze trends from history
    const trends = this.analyzeTrends(healthStatus.sessionId);

    // Predict potential issues
    const predictedIssues = this.predictIssues(healthStatus);

    return {
      overallScore,
      categoryScores: {
        connectivity,
        authentication,
        performance,
        reliability,
      },
      trends,
      predictedIssues,
    };
  }

  /**
   * Calculate authentication score
   */
  private calculateAuthScore(metrics: SessionMetrics): number {
    if (metrics.authFileHealth === 'valid' && metrics.isAuthenticated) {
      return 100;
    } else if (metrics.authFileHealth === 'missing' || !metrics.isAuthenticated) {
      return 30;
    } else {
      // corrupted
      return 0;
    }
  }

  /**
   * Calculate performance score
   */
  private calculatePerformanceScore(metrics: SessionMetrics): number {
    const threshold = this.options.alertThresholds.responseTime;
    const timeout = this.options.responseTimeoutMs;

    if (metrics.responseTimeMs <= threshold) {
      return 100;
    } else if (metrics.responseTimeMs <= threshold * 2) {
      return 70;
    } else if (metrics.responseTimeMs <= timeout) {
      return 40;
    } else {
      return 0;
    }
  }

  /**
   * Calculate reliability score
   */
  private calculateReliabilityScore(metrics: SessionMetrics): number {
    const maxFailures = this.options.maxConsecutiveFailures;

    if (metrics.consecutiveFailures === 0) {
      return 100;
    } else if (metrics.consecutiveFailures < maxFailures) {
      return Math.max(0, 100 - (metrics.consecutiveFailures / maxFailures) * 100);
    } else {
      return 0;
    }
  }

  /**
   * Analyze health trends from history
   */
  private analyzeTrends(sessionId: string): {
    improving: boolean;
    degrading: boolean;
    stable: boolean;
  } {
    const history = this.healthHistory.get(sessionId) || [];

    if (history.length < 3) {
      return { improving: false, degrading: false, stable: true };
    }

    const recentScores = history.slice(-5).map(h => this.getHealthScore(h));

    const isImproving =
      recentScores.length >= 3 &&
      recentScores
        .slice(-3)
        .every(
          (score, index) =>
            index === 0 || score >= recentScores[recentScores.length - 3 + index - 1]
        );

    const isDegrading =
      recentScores.length >= 3 &&
      recentScores
        .slice(-3)
        .every(
          (score, index) =>
            index === 0 || score <= recentScores[recentScores.length - 3 + index - 1]
        );

    const isStable = !isImproving && !isDegrading;

    return { improving: isImproving, degrading: isDegrading, stable: isStable };
  }

  /**
   * Get numeric health score for trending
   */
  private getHealthScore(healthStatus: SessionHealthStatus): number {
    switch (healthStatus.status) {
      case 'healthy':
        return 100;
      case 'warning':
        return 60;
      case 'critical':
        return 20;
      case 'offline':
        return 0;
      default:
        return 50;
    }
  }

  /**
   * Predict potential issues based on patterns
   */
  private predictIssues(healthStatus: SessionHealthStatus): string[] {
    const predictions: string[] = [];
    const { sessionId, metrics } = healthStatus;

    // Performance degradation prediction
    if (this.hasPerformanceDegradation(healthStatus)) {
      predictions.push('Performance may continue to degrade, consider session restart');
    }

    // Authentication issues prediction
    if (metrics.authFileHealth === 'missing' && metrics.consecutiveFailures > 0) {
      predictions.push('Authentication failure likely, re-authentication may be needed');
    }

    // Connection stability prediction
    const history = this.healthHistory.get(sessionId) || [];
    const recentConnectionIssues = history.slice(-5).filter(h => !h.metrics.isConnected).length;
    if (recentConnectionIssues >= 2) {
      predictions.push('Connection instability detected, network or session restart recommended');
    }

    return predictions;
  }

  /**
   * Determine urgency level for the session
   */
  private determineUrgencyLevel(
    healthStatus: SessionHealthStatus,
    findings: DiagnosticFinding[]
  ): 'low' | 'medium' | 'high' | 'critical' {
    const criticalFindings = findings.filter(f => f.severity === 'critical');
    const errorFindings = findings.filter(f => f.severity === 'error');

    if (criticalFindings.length > 0 || healthStatus.status === 'offline') {
      return 'critical';
    } else if (errorFindings.length > 0 || healthStatus.status === 'critical') {
      return 'high';
    } else if (healthStatus.status === 'warning' || findings.length > 2) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Analyze health patterns over time
   */
  private analyzeHealthPatterns(healthStatus: SessionHealthStatus): void {
    const { sessionId } = healthStatus;
    const history = this.healthHistory.get(sessionId) || [];

    if (history.length < 5) return; // Need enough data for pattern analysis

    const patterns = this.detectHealthPatterns(sessionId, history);
    this.patternHistory.set(sessionId, patterns);

    if (patterns.length > 0) {
      logger.debug(`📊 Detected ${patterns.length} health patterns for session ${sessionId}`);
    }
  }

  /**
   * Detect specific health patterns
   */
  private detectHealthPatterns(sessionId: string, history: SessionHealthStatus[]): HealthPattern[] {
    const patterns: HealthPattern[] = [];

    // Intermittent failures pattern
    const failurePattern = this.detectIntermittentFailures(sessionId, history);
    if (failurePattern) patterns.push(failurePattern);

    // Gradual degradation pattern
    const degradationPattern = this.detectGradualDegradation(sessionId, history);
    if (degradationPattern) patterns.push(degradationPattern);

    // Auth cycling pattern
    const authPattern = this.detectAuthCycling(sessionId, history);
    if (authPattern) patterns.push(authPattern);

    return patterns;
  }

  /**
   * Detect intermittent failure patterns
   */
  private detectIntermittentFailures(
    sessionId: string,
    history: SessionHealthStatus[]
  ): HealthPattern | null {
    const recentHistory = history.slice(-10);
    const failureCount = recentHistory.filter(
      h => h.status === 'critical' || h.status === 'offline'
    ).length;

    if (failureCount >= 3 && failureCount < recentHistory.length) {
      return {
        sessionId,
        pattern: 'intermittent_failures',
        confidence: Math.min(failureCount / 5, 1),
        duration: recentHistory.length * this.options.checkIntervalMs,
        severity: failureCount >= 5 ? 'high' : 'medium',
        description: `Intermittent failures detected: ${failureCount}/${recentHistory.length} recent checks failed`,
      };
    }

    return null;
  }

  /**
   * Detect gradual degradation patterns
   */
  private detectGradualDegradation(
    sessionId: string,
    history: SessionHealthStatus[]
  ): HealthPattern | null {
    const recentHistory = history.slice(-8);
    const scores = recentHistory.map(h => this.getHealthScore(h));

    // Check if scores are consistently decreasing
    let degradationCount = 0;
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] < scores[i - 1]) degradationCount++;
    }

    if (degradationCount >= scores.length * 0.6) {
      return {
        sessionId,
        pattern: 'gradual_degradation',
        confidence: degradationCount / scores.length,
        duration: recentHistory.length * this.options.checkIntervalMs,
        severity: 'medium',
        description: 'Gradual health degradation detected over recent checks',
      };
    }

    return null;
  }

  /**
   * Detect authentication cycling patterns
   */
  private detectAuthCycling(
    sessionId: string,
    history: SessionHealthStatus[]
  ): HealthPattern | null {
    const recentHistory = history.slice(-10);
    const authChanges = recentHistory.filter((h, index) => {
      if (index === 0) return false;
      return h.metrics.isAuthenticated !== recentHistory[index - 1].metrics.isAuthenticated;
    }).length;

    if (authChanges >= 3) {
      return {
        sessionId,
        pattern: 'auth_cycling',
        confidence: Math.min(authChanges / 5, 1),
        duration: recentHistory.length * this.options.checkIntervalMs,
        severity: 'high',
        description: `Authentication cycling detected: ${authChanges} auth state changes`,
      };
    }

    return null;
  }

  /**
   * Update health history for a session
   */
  private updateHealthHistory(sessionId: string, healthStatus: SessionHealthStatus): void {
    let history = this.healthHistory.get(sessionId) || [];
    history.push(healthStatus);

    // Keep only recent history
    if (history.length > this.maxHistorySize) {
      history = history.slice(-this.maxHistorySize);
    }

    this.healthHistory.set(sessionId, history);
  }

  /**
   * Get health history for a session
   */
  getHealthHistory(sessionId: string): SessionHealthStatus[] {
    return this.healthHistory.get(sessionId) || [];
  }

  /**
   * Get detected patterns for a session
   */
  getHealthPatterns(sessionId: string): HealthPattern[] {
    return this.patternHistory.get(sessionId) || [];
  }

  /**
   * Batch analyze multiple sessions
   */
  batchAnalyzeHealth(metricsResults: MetricsCollectionResult[]): SessionHealthStatus[] {
    logger.info(`🔍 Starting batch health analysis for ${metricsResults.length} sessions`);

    const healthStatuses = metricsResults.map(result => this.analyzeSessionHealth(result));

    logger.info(`🔍 Batch health analysis completed: ${healthStatuses.length} sessions analyzed`);
    return healthStatuses;
  }

  /**
   * Clear old history to prevent memory leaks
   */
  clearOldHistory(): void {
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago

    for (const [sessionId, history] of this.healthHistory.entries()) {
      const recentHistory = history.filter(h => h.lastCheckTime.getTime() > cutoffTime);
      if (recentHistory.length === 0) {
        this.healthHistory.delete(sessionId);
        this.patternHistory.delete(sessionId);
      } else {
        this.healthHistory.set(sessionId, recentHistory);
      }
    }
  }
}
