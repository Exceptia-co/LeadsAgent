import { logger } from '../../utils/logger';
import SessionPersistenceService, { SessionPersistenceData } from '../SessionPersistenceService';
import { AuthValidator } from './AuthValidator';
import path from 'path';

export interface RecoveryOptions {
  maxRetries: number;
  retryDelayMs: number;
  maxReconnectAttempts: number;
  timeoutMs: number;
  validateAuthFiles: boolean;
  cleanupCorruptedAuth: boolean;
  maxConcurrentRecoveries: number;
}

export interface RecoveryExecutionResult {
  sessionId: string;
  success: boolean;
  recoveryTimeMs: number;
  attempts: number;
  errorMessage?: string;
  skipped?: boolean;
  skipReason?: string;
}

export interface BatchRecoveryResult {
  totalSessions: number;
  recoveredSessions: number;
  failedSessions: number;
  skippedSessions: number;
  executionTimeMs: number;
  results: RecoveryExecutionResult[];
}

export class RecoveryRunner {
  private persistenceService = SessionPersistenceService;
  private authValidator = new AuthValidator();

  async executeRecoveryBatch(
    whatsAppService: any,
    sessions: SessionPersistenceData[],
    options: RecoveryOptions
  ): Promise<BatchRecoveryResult> {
    const startTime = Date.now();
    const result: BatchRecoveryResult = {
      totalSessions: sessions.length,
      recoveredSessions: 0,
      failedSessions: 0,
      skippedSessions: 0,
      executionTimeMs: 0,
      results: [],
    };

    if (sessions.length === 0) {
      result.executionTimeMs = Date.now() - startTime;
      return result;
    }

    logger.info(`🔄 Ejecutando recuperación por lotes: ${sessions.length} sesiones`);

    const sessionBatches = this.batchSessions(sessions, options.maxConcurrentRecoveries);

    for (let batchIndex = 0; batchIndex < sessionBatches.length; batchIndex++) {
      const batch = sessionBatches[batchIndex];
      logger.info(
        `🔄 Procesando lote ${batchIndex + 1}/${sessionBatches.length} (${batch.length} sesiones)`
      );

      const batchPromises = batch.map(async sessionData => {
        const executionResult = await this.executeSessionRecovery(
          whatsAppService,
          sessionData,
          options
        );
        result.results.push(executionResult);

        if (executionResult.success) {
          result.recoveredSessions++;
        } else if (executionResult.skipped) {
          result.skippedSessions++;
        } else {
          result.failedSessions++;
        }

        return executionResult;
      });

      await Promise.allSettled(batchPromises);

      if (batchIndex < sessionBatches.length - 1) {
        await this.delay(1000);
      }
    }

    result.executionTimeMs = Date.now() - startTime;
    logger.info(
      `🏁 Lote completado: ${result.recoveredSessions}/${result.totalSessions} recuperadas en ${result.executionTimeMs}ms`
    );

    return result;
  }

  async executeSessionRecovery(
    whatsAppService: any,
    sessionData: SessionPersistenceData,
    options: RecoveryOptions
  ): Promise<RecoveryExecutionResult> {
    const sessionStartTime = Date.now();
    const { sessionId } = sessionData;

    const shouldRecoverCheck = this.shouldRecoverSession(sessionData, options);
    if (!shouldRecoverCheck.shouldRecover) {
      logger.info(`⏭️ Omitiendo sesión ${sessionId}: ${shouldRecoverCheck.reason}`);

      await this.persistenceService.updateSessionStatus(sessionId, 'disconnected', {
        lastError: `Skipped recovery: ${shouldRecoverCheck.reason}`,
        metadata: {
          ...sessionData.metadata,
          autoReconnect: false,
          lastRecoverySkip: new Date().toISOString(),
          recoverySkipReason: shouldRecoverCheck.reason,
        },
      });

      return {
        sessionId,
        success: false,
        recoveryTimeMs: Date.now() - sessionStartTime,
        attempts: 0,
        skipped: true,
        skipReason: shouldRecoverCheck.reason,
      };
    }

    try {
      const existingSession = await whatsAppService.getSessionStatus(sessionId);
      if (existingSession) {
        logger.debug(`💾 Sesión ${sessionId} ya existe en memoria`);
        return {
          sessionId,
          success: true,
          recoveryTimeMs: Date.now() - sessionStartTime,
          attempts: 0,
        };
      }

      const restoreResult = await this.attemptSessionRestore(whatsAppService, sessionData, options);

      if (restoreResult.success) {
        const recoveryTime = Date.now() - sessionStartTime;
        await this.persistenceService.updateSessionStatus(sessionId, 'recovering', {
          lastError: undefined,
          metadata: {
            ...sessionData.metadata,
            lastRecovery: new Date().toISOString(),
            lastRecoveryTime: recoveryTime.toString(),
            recoveryMethod: 'batch_recovery',
          },
        });

        return {
          sessionId,
          success: true,
          recoveryTimeMs: recoveryTime,
          attempts: restoreResult.attempts,
        };
      }

      return {
        sessionId,
        success: false,
        recoveryTimeMs: Date.now() - sessionStartTime,
        attempts: restoreResult.attempts,
        errorMessage: restoreResult.errorMessage,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`💥 Error recuperando sesión ${sessionId}:`, error);

      await this.persistenceService.updateSessionStatus(sessionId, 'recovery_failed', {
        lastError: errorMsg,
        reconnectCount: (sessionData.reconnectCount || 0) + 1,
        metadata: {
          ...sessionData.metadata,
          lastRecoveryAttempt: new Date().toISOString(),
          recoveryFailureCount: (sessionData.metadata?.recoveryFailureCount || 0) + 1,
        },
      });

      return {
        sessionId,
        success: false,
        recoveryTimeMs: Date.now() - sessionStartTime,
        attempts: options.maxRetries,
        errorMessage: errorMsg,
      };
    }
  }

  private async attemptSessionRestore(
    whatsAppService: any,
    sessionData: SessionPersistenceData,
    options: RecoveryOptions
  ): Promise<{ success: boolean; attempts: number; errorMessage?: string }> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
      try {
        logger.debug(
          `🔄 Intento ${attempt}/${options.maxRetries} para sesión ${sessionData.sessionId}`
        );

        const restorePromise = whatsAppService.createSession(sessionData.sessionId);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Session restore timeout')), options.timeoutMs)
        );

        await Promise.race([restorePromise, timeoutPromise]);

        logger.info(`✅ Sesión ${sessionData.sessionId} restaurada en intento ${attempt}`);
        return { success: true, attempts: attempt };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        const isAuthError =
          lastError.message.includes('auth') ||
          lastError.message.includes('QR') ||
          lastError.message.includes('authentication');

        if (isAuthError && options.cleanupCorruptedAuth) {
          logger.warn(
            `🔧 Error de autenticación para ${sessionData.sessionId}, limpiando archivos...`
          );
          await this.authValidator.cleanupCorruptedAuth(
            sessionData.sessionId,
            path.resolve('./wwebjs_auth')
          );
        }

        logger.warn(`⚠️ Intento ${attempt} falló para ${sessionData.sessionId}:`, error);

        if (attempt < options.maxRetries) {
          const delayMs = this.calculateBackoffDelay(options.retryDelayMs, attempt);
          logger.debug(`⏱️ Esperando ${delayMs}ms antes del siguiente intento`);
          await this.delay(delayMs);
        }
      }
    }

    logger.error(`❌ Todos los intentos fallaron para ${sessionData.sessionId}`);
    return {
      success: false,
      attempts: options.maxRetries,
      errorMessage: lastError?.message || 'All attempts failed',
    };
  }

  private shouldRecoverSession(
    sessionData: SessionPersistenceData,
    options: RecoveryOptions
  ): { shouldRecover: boolean; reason: string } {
    const { lastError, lastSeen, reconnectCount, metadata } = sessionData;
    const sessionMetadata = (metadata as any) || {};

    if (lastError && this.authValidator.isSessionClosedByUser(lastError)) {
      return {
        shouldRecover: false,
        reason: `Session was closed by user: ${lastError}`,
      };
    }

    if (sessionMetadata.autoReconnect === false) {
      return {
        shouldRecover: false,
        reason: 'autoReconnect disabled in metadata',
      };
    }

    if (
      sessionMetadata.authCorruptionDetected ||
      sessionMetadata.lastAlertType === 'authentication' ||
      (lastError && this.authValidator.isAuthCorruptionError(lastError))
    ) {
      return {
        shouldRecover: false,
        reason: 'Authentication files are corrupted or invalid',
      };
    }

    if (
      sessionMetadata.manualDisconnect === true &&
      sessionMetadata.lastDisconnectTime &&
      this.authValidator.isRecentManualDisconnect(sessionMetadata.lastDisconnectTime)
    ) {
      return {
        shouldRecover: false,
        reason: 'Session was manually disconnected recently',
      };
    }

    if (lastSeen && this.isHealthCheckTooOld(lastSeen)) {
      return {
        shouldRecover: false,
        reason: `Health check too old: ${lastSeen}`,
      };
    }

    if ((reconnectCount || 0) >= options.maxReconnectAttempts) {
      return {
        shouldRecover: false,
        reason: `Too many reconnect attempts: ${reconnectCount}`,
      };
    }

    if (lastError) {
      const permanentFailureIndicators = [
        'whatsapp web session expired',
        'unpaired',
        'timeout',
        'authentication failed permanently',
        'account banned',
        'phone number not allowed',
        'authentication files are corrupted',
        'session files invalid',
        'chrome profile corrupted',
      ];

      const normalizedError = lastError.toLowerCase();
      const hasPermanentFailure = permanentFailureIndicators.some(indicator =>
        normalizedError.includes(indicator)
      );

      if (hasPermanentFailure) {
        return {
          shouldRecover: false,
          reason: `Permanent failure detected: ${lastError}`,
        };
      }
    }

    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const lastSeenDate = new Date(lastSeen || 0);

    if (lastSeenDate > oneMinuteAgo) {
      return {
        shouldRecover: false,
        reason: 'Session was updated recently, might be starting up',
      };
    }

    return {
      shouldRecover: true,
      reason: 'Session passed all recovery checks',
    };
  }

  private isHealthCheckTooOld(lastSeen: Date): boolean {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const lastSeenDate = new Date(lastSeen);

    return lastSeenDate < fiveMinutesAgo;
  }

  private batchSessions(
    sessions: SessionPersistenceData[],
    batchSize: number
  ): SessionPersistenceData[][] {
    const batches: SessionPersistenceData[][] = [];

    for (let i = 0; i < sessions.length; i += batchSize) {
      batches.push(sessions.slice(i, i + batchSize));
    }

    return batches;
  }

  private calculateBackoffDelay(baseDelayMs: number, attempt: number): number {
    return baseDelayMs * Math.pow(2, attempt - 1);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new RecoveryRunner();
