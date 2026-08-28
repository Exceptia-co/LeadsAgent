import { logger } from '../../utils/logger';
import type { SessionPersistenceData } from '../SessionPersistenceService';
import SessionPersistenceService from '../SessionPersistenceService';
import { sessionCredentialsStore } from '../session-credentials/SessionCredentialsStore';
import { SESSION_CONSTANTS } from '../../config/session-constants';

export interface RecoveryOptions {
  maxRetries: number;
  retryDelayMs: number;
  maxReconnectAttempts: number;
  timeoutMs: number;
  validateAuthFiles: boolean;
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

    // Credentials first, before any other check. A session with no rows in
    // `whatsapp_auth_keys` cannot reconnect: Baileys would mint a fresh
    // identity and sit emitting QR codes at a screen nobody is watching,
    // burning one live socket per session for as long as the process runs.
    //
    // This returns before the skip path below on purpose. That path writes
    // `autoReconnect: false`, and "needs a QR" is not "never try again" --
    // latching it here would make pairing from the dashboard impossible
    // rather than one click away. A failed check means *unknown*, not
    // absent, so it skips this boot and leaves the row untouched too.
    let hasCredentials: boolean;
    try {
      hasCredentials = await sessionCredentialsStore.hasCredentials(sessionId);
    } catch (error) {
      logger.warn(
        `⏭️ Omitiendo sesión ${sessionId}: no se pudo leer credenciales: ${String(error)}`
      );
      return {
        sessionId,
        success: false,
        recoveryTimeMs: Date.now() - sessionStartTime,
        attempts: 0,
        skipped: true,
        skipReason: 'credential lookup failed',
      };
    }

    if (!hasCredentials) {
      logger.info(`⏭️ Omitiendo sesión ${sessionId}: sin credenciales almacenadas, requiere QR`);

      // Status only -- no lastError, no metadata, and above all no
      // autoReconnect:false. The row may still say `ready` from before the
      // restart, and leaving that would show the operator a connected
      // session with no socket behind it. Saying `disconnected` is simply
      // true, and it is the one write that does not bar the next attempt.
      await this.persistenceService.updateSessionStatus(sessionId, 'disconnected');

      return {
        sessionId,
        success: false,
        recoveryTimeMs: Date.now() - sessionStartTime,
        attempts: 0,
        skipped: true,
        skipReason: 'no stored credentials; needs a new QR',
      };
    }

    const shouldRecoverCheck = this.shouldRecoverSession(sessionData, options);
    if (!shouldRecoverCheck.shouldRecover) {
      logger.info(`⏭️ Omitiendo sesión ${sessionId}: ${shouldRecoverCheck.reason}`);

      // Records why, and does NOT write autoReconnect:false. That flag means
      // "may RecoveryRunner attempt this session" -- standing intent, set by
      // a user's deliberate disconnect. shouldRecoverSession is a pure
      // function of the row and reaches the same verdict next boot from the
      // same data, so writing the flag here adds nothing except turning
      // every time-bounded reason permanent: "manually disconnected
      // recently" stops being true after 30 minutes, and a session skipped
      // once for it was barred forever.
      await this.persistenceService.updateSessionStatus(sessionId, 'disconnected', {
        lastError: `Skipped recovery: ${shouldRecoverCheck.reason}`,
        metadata: {
          ...sessionData.metadata,
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

        // No credential cleanup here. The Chromium-era policy wiped the
        // session's auth directory whenever lastError.message contained
        // 'auth' -- cheap and roughly right against a half-written profile
        // directory on disk, and
        // catastrophic against durable transactional rows, where it would
        // force a re-pair on any transient error containing the word.
        // Credentials are cleared in exactly two places, both in
        // BaileysSessionManager: DisconnectReason.loggedOut, and an explicit
        // delete.
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
    const sessionMetadata = metadata || {};

    if (lastError && RecoveryRunner.isSessionClosedByUser(lastError)) {
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

    // No auth-corruption branch. It was dead twice over: its string list
    // named files and browser profiles that stopped existing at the cutover,
    // and its metadata test compared `lastAlertType` against
    // 'authentication', a value AlertManager never writes — its types are
    // 'auth', 'connection', 'functionality' and 'performance'.
    //
    // Repairing the comparison would have been worse than deleting it. The
    // pre-key exhaustion alerts are type 'auth', so a session warning that it
    // is low on pre-keys would have become a session barred from recovery.
    // Missing credentials and `autoReconnect: false` are structured signals
    // that say what they mean; a string match on a persisted error message,
    // read back on the next boot, is not.

    if (
      sessionMetadata.manualDisconnect === true &&
      sessionMetadata.lastDisconnectTime &&
      RecoveryRunner.isRecentManualDisconnect(sessionMetadata.lastDisconnectTime)
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

    // Deliberately no "lastSeen is under a minute old, it might still be
    // starting up" check. Recovery runs in exactly one place -- process
    // boot, from WhatsAppServiceSimple.runInitialize -- where the session
    // map is empty by definition and every row's lastSeen is seconds old,
    // because a pm2 restart takes 15-30s. The heuristic therefore skipped
    // precisely the sessions it existed to protect, and the skip path writes
    // autoReconnect:false, so each fast restart latched them shut for good.
    //
    // "Is this session already alive?" has an exact answer a few lines down
    // in executeSessionRecovery: getSessionStatus reads the in-memory map.
    // A clock reading was only ever a proxy for it.

    return {
      shouldRecover: true,
      reason: 'Session passed all recovery checks',
    };
  }

  private static isSessionClosedByUser(lastError: string): boolean {
    // One entry, because one thing writes it: BaileysSessionManager's
    // forceDisconnect. The other eight described a Chromium page or window
    // being closed and were dead the moment the engine stopped being a
    // browser -- kept only in `whatsapp_sessions.last_error` on rows that
    // have been inactive since before the cutover, which `loadActiveSessions`
    // never returns.
    const userClosureIndicators = ['force disconnected by user'];

    const normalizedError = lastError.toLowerCase();
    return userClosureIndicators.some(indicator => normalizedError.includes(indicator));
  }

  private static isRecentManualDisconnect(lastDisconnectTime: string): boolean {
    try {
      const disconnectTime = new Date(lastDisconnectTime);
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      return disconnectTime > thirtyMinutesAgo;
    } catch (error) {
      return false;
    }
  }

  private isHealthCheckTooOld(lastSeen: Date): boolean {
    const cutoff = new Date(Date.now() - SESSION_CONSTANTS.MAX_RECOVERY_AGE_MS);
    const lastSeenDate = new Date(lastSeen);

    return lastSeenDate < cutoff;
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
