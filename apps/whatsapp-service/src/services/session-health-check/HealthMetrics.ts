import { logger } from '../../utils/logger';
import SessionPersistenceService from '../SessionPersistenceService';
import type { WhatsAppSession } from '../../types';
import * as fs from 'fs';
import * as path from 'path';

export interface SessionMetrics {
  responseTimeMs: number;
  isConnected: boolean;
  isAuthenticated: boolean;
  authFileHealth: 'valid' | 'corrupted' | 'missing';
  consecutiveFailures: number;
  lastSuccessfulPing?: Date;
  uptime: number;
  messagesSent24h: number;
  messagesReceived24h: number;
}

export interface HealthCheckOptions {
  enablePingTests: boolean;
  pingTestPhoneNumber?: string;
  connectionTimeoutMs: number;
  responseTimeoutMs: number;
  maxConsecutiveFailures: number;
  alertThresholds: {
    responseTime: number;
    failureRate: number;
    authIssueRate: number;
  };
  checkIntervalMs: number;
}

export interface MetricsCollectionResult {
  sessionId: string;
  metrics: SessionMetrics;
  issues: string[];
  recommendations: string[];
  collectionTime: Date;
}

/**
 * Health metrics collection module
 * Responsible for gathering session health data and measurements
 */
export class HealthMetrics {
  private persistenceService = SessionPersistenceService;

  constructor(private options: HealthCheckOptions) {}

  /**
   * Collect comprehensive metrics for a session
   */
  async collectSessionMetrics(
    whatsAppService: any,
    session: WhatsAppSession,
    previousMetrics?: SessionMetrics
  ): Promise<MetricsCollectionResult> {
    const sessionId = session.id;
    const collectionStartTime = Date.now();

    logger.debug(`📊 Collecting metrics for session ${sessionId}`);

    const result: MetricsCollectionResult = {
      sessionId,
      metrics: {
        responseTimeMs: 0,
        isConnected: false,
        isAuthenticated: false,
        authFileHealth: 'missing',
        consecutiveFailures: 0,
        uptime: 0,
        messagesSent24h: 0,
        messagesReceived24h: 0,
      },
      issues: [],
      recommendations: [],
      collectionTime: new Date(),
    };

    try {
      // 1. Basic connection and authentication status
      await this.collectConnectionMetrics(session, result);

      // 2. Authentication file health check
      result.metrics.authFileHealth = await this.checkAuthFileHealth(sessionId);
      this.evaluateAuthFileHealth(result);

      // 3. Response time measurement
      result.metrics.responseTimeMs = await this.measureResponseTime(whatsAppService, sessionId);
      this.evaluateResponseTime(result);

      // 4. Activity and uptime metrics
      await this.collectActivityMetrics(sessionId, result);

      // 5. Consecutive failures tracking
      this.trackConsecutiveFailures(result, previousMetrics);

      const collectionDuration = Date.now() - collectionStartTime;
      logger.debug(`📊 Metrics collected for ${sessionId} in ${collectionDuration}ms`);
    } catch (error) {
      logger.error(`Error collecting metrics for session ${sessionId}:`, error);
      result.issues.push(
        `Metrics collection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      result.recommendations.push(
        'Investigate metrics collection issues and restart session if necessary'
      );
    }

    return result;
  }

  /**
   * Collect basic connection and authentication metrics
   */
  private async collectConnectionMetrics(
    session: WhatsAppSession,
    result: MetricsCollectionResult
  ): Promise<void> {
    const isConnected = session.status === 'ready' || session.status === 'authenticated';
    const isAuthenticated = session.status === 'authenticated' || session.status === 'ready';

    result.metrics.isConnected = isConnected;
    result.metrics.isAuthenticated = isAuthenticated;

    if (!isConnected) {
      result.issues.push(`Session not connected (status: ${session.status})`);
      result.recommendations.push('Check network connection and restart session if needed');
    }

    logger.debug(
      `🔌 Connection metrics - Connected: ${isConnected}, Auth: ${isAuthenticated}, Status: ${session.status}`
    );
  }

  /**
   * Check authentication file health
   */
  async checkAuthFileHealth(sessionId: string): Promise<'valid' | 'corrupted' | 'missing'> {
    try {
      const authDataPath = path.resolve('./wwebjs_auth');
      const sessionAuthPath = path.join(authDataPath, `session-${sessionId}`);

      if (!fs.existsSync(sessionAuthPath)) {
        logger.debug(`🔐 Auth files missing for session ${sessionId}`);
        return 'missing';
      }

      // Check for essential files
      const essentialFiles = ['Default', 'RemoteAuth', 'Session Storage'];
      let foundFiles = 0;

      for (const fileName of essentialFiles) {
        const filePath = path.join(sessionAuthPath, fileName);
        if (fs.existsSync(filePath)) {
          foundFiles++;
        }
      }

      // Check for lock files (corruption indicators)
      const lockFiles = await this.findLockFiles(sessionAuthPath);
      const hasStaleLocks = lockFiles.some(lockFile => {
        const stats = fs.statSync(lockFile);
        return Date.now() - stats.mtime.getTime() > 5 * 60 * 1000; // Older than 5 minutes
      });

      let authHealth: 'valid' | 'corrupted' | 'missing';
      if (foundFiles === 0) {
        authHealth = 'missing';
      } else if (hasStaleLocks || foundFiles < essentialFiles.length / 2) {
        authHealth = 'corrupted';
      } else {
        authHealth = 'valid';
      }

      logger.debug(
        `🔐 Auth file health for ${sessionId}: ${authHealth} (${foundFiles}/${essentialFiles.length} files)`
      );
      return authHealth;
    } catch (error) {
      logger.debug(`Error checking auth file health for ${sessionId}:`, error);
      return 'corrupted';
    }
  }

  /**
   * Find lock files in directory recursively
   */
  private async findLockFiles(dirPath: string): Promise<string[]> {
    const lockFiles: string[] = [];

    try {
      if (!fs.existsSync(dirPath)) return lockFiles;

      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          const subLockFiles = await this.findLockFiles(itemPath);
          lockFiles.push(...subLockFiles);
        } else if (item === 'LOCK' || item === 'lockfile' || item.endsWith('.lock')) {
          lockFiles.push(itemPath);
        }
      }
    } catch (error) {
      // Ignore errors in lock file detection
    }

    return lockFiles;
  }

  /**
   * Evaluate auth file health and add issues/recommendations
   */
  private evaluateAuthFileHealth(result: MetricsCollectionResult): void {
    const authHealth = result.metrics.authFileHealth;

    if (authHealth === 'corrupted') {
      result.issues.push('Authentication files are corrupted');
      result.recommendations.push('Clean up corrupted auth files and re-authenticate');
    } else if (authHealth === 'missing') {
      result.issues.push('Authentication files are missing');
      result.recommendations.push('Session needs to be authenticated');
    }
  }

  /**
   * Measure response time using appropriate method
   */
  private async measureResponseTime(whatsAppService: any, sessionId: string): Promise<number> {
    if (this.options.enablePingTests && this.options.pingTestPhoneNumber) {
      try {
        return await this.performPingTest(whatsAppService, sessionId);
      } catch (pingError) {
        logger.debug(`Ping test failed for ${sessionId}, falling back to status check`);
        return await this.estimateResponseTime(whatsAppService, sessionId);
      }
    } else {
      return await this.estimateResponseTime(whatsAppService, sessionId);
    }
  }

  /**
   * Perform ping test by sending a test message
   */
  private async performPingTest(whatsAppService: any, sessionId: string): Promise<number> {
    if (!this.options.pingTestPhoneNumber) {
      throw new Error('Ping test phone number not configured');
    }

    const startTime = Date.now();

    try {
      const pingMessage = `Health check ping - ${new Date().toISOString()}`;
      const response = await whatsAppService.sendMessage(
        sessionId,
        this.options.pingTestPhoneNumber,
        pingMessage
      );

      if (!response.success) {
        throw new Error(`Ping failed: ${response.error}`);
      }

      const responseTime = Date.now() - startTime;
      logger.debug(`📡 Ping test for ${sessionId}: ${responseTime}ms`);

      return responseTime;
    } catch (error) {
      logger.debug(`Ping test failed for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Estimate response time based on session status operation
   */
  private async estimateResponseTime(whatsAppService: any, sessionId: string): Promise<number> {
    const startTime = Date.now();

    try {
      await whatsAppService.getSessionStatus(sessionId);
      const responseTime = Date.now() - startTime;
      logger.debug(`⏱️ Response time estimate for ${sessionId}: ${responseTime}ms`);
      return responseTime;
    } catch (error) {
      logger.debug(`Response time estimation failed for ${sessionId}:`, error);
      return this.options.responseTimeoutMs;
    }
  }

  /**
   * Evaluate response time and add issues if needed
   */
  private evaluateResponseTime(result: MetricsCollectionResult): void {
    const responseTime = result.metrics.responseTimeMs;

    if (responseTime > this.options.alertThresholds.responseTime) {
      result.issues.push(
        `High response time: ${responseTime}ms (threshold: ${this.options.alertThresholds.responseTime}ms)`
      );
      result.recommendations.push('Check network connectivity and session load');
    }
  }

  /**
   * Collect activity and uptime metrics from database
   */
  private async collectActivityMetrics(
    sessionId: string,
    result: MetricsCollectionResult
  ): Promise<void> {
    try {
      const sessionData = await this.persistenceService.getSession(sessionId);

      if (sessionData) {
        // Calculate uptime based on last seen
        const lastSeen = new Date(sessionData.lastSeen);
        const now = new Date();
        result.metrics.uptime = now.getTime() - lastSeen.getTime();

        // Set last successful ping if available
        if (sessionData.metadata?.lastSuccessfulPing) {
          result.metrics.lastSuccessfulPing = new Date(sessionData.metadata.lastSuccessfulPing);
        }

        // Note: Message counts would require additional database queries
        // This is a placeholder for when conversation history is available
        result.metrics.messagesSent24h = 0;
        result.metrics.messagesReceived24h = 0;

        logger.debug(`📈 Activity metrics for ${sessionId} - Uptime: ${result.metrics.uptime}ms`);
      }
    } catch (error) {
      logger.debug(`Error collecting activity metrics for ${sessionId}:`, error);
    }
  }

  /**
   * Track consecutive failures from previous metrics
   */
  private trackConsecutiveFailures(
    result: MetricsCollectionResult,
    previousMetrics?: SessionMetrics
  ): void {
    if (previousMetrics && result.issues.length > 0) {
      result.metrics.consecutiveFailures = previousMetrics.consecutiveFailures + 1;
    } else if (result.issues.length === 0) {
      result.metrics.consecutiveFailures = 0;
    }

    if (result.metrics.consecutiveFailures > 0) {
      logger.debug(
        `⚠️ Consecutive failures for ${result.sessionId}: ${result.metrics.consecutiveFailures}`
      );
    }
  }

  /**
   * Batch collect metrics for multiple sessions
   */
  async batchCollectMetrics(
    whatsAppService: any,
    sessions: WhatsAppSession[],
    previousMetricsMap?: Map<string, SessionMetrics>
  ): Promise<MetricsCollectionResult[]> {
    const results: MetricsCollectionResult[] = [];

    logger.info(`📊 Starting batch metrics collection for ${sessions.length} sessions`);

    for (const session of sessions) {
      try {
        const previousMetrics = previousMetricsMap?.get(session.id);
        const result = await this.collectSessionMetrics(whatsAppService, session, previousMetrics);
        results.push(result);
      } catch (error) {
        logger.error(`Error in batch metrics collection for session ${session.id}:`, error);
        // Continue with other sessions
      }
    }

    logger.info(
      `📊 Batch metrics collection completed: ${results.length}/${sessions.length} successful`
    );
    return results;
  }

  /**
   * Get default health check options
   */
  static getDefaultOptions(): HealthCheckOptions {
    return {
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
  }
}
