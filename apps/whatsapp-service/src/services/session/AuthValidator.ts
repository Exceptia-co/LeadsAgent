import { logger } from '../../utils/logger';
import { SessionCleanupUtil } from '../../utils/sessionCleanup';
import type { SessionPersistenceData } from '../SessionPersistenceService';
import SessionPersistenceService from '../SessionPersistenceService';
import { countValidEssentialFiles, MIN_ESSENTIAL_AUTH_FILES } from '../whatsapp-core/AuthenticationManager';
import fs from 'fs';
import path from 'path';

export interface AuthValidationResult {
  isValid: boolean;
  hasLockFiles: boolean;
  hasEssentialFiles: boolean;
  corruptionDetected: boolean;
  errorMessage?: string;
}

export interface AuthValidationStats {
  totalSessions: number;
  validAuth: number;
  invalidAuth: number;
  cleanedUp: number;
  errors: string[];
}

export class AuthValidator {
  private persistenceService = SessionPersistenceService;

  async validateAllAuthFiles(
    sessions: SessionPersistenceData[],
    shouldCleanup: boolean = true
  ): Promise<AuthValidationStats> {
    logger.info(`🔍 Validando archivos de autenticación para ${sessions.length} sesiones...`);

    const authDataPath = path.resolve('./wwebjs_auth');
    const stats: AuthValidationStats = {
      totalSessions: sessions.length,
      validAuth: 0,
      invalidAuth: 0,
      cleanedUp: 0,
      errors: [],
    };

    for (const sessionData of sessions) {
      try {
        const validationResult = await this.validateSessionAuth(
          sessionData.sessionId,
          authDataPath
        );

        if (validationResult.isValid) {
          stats.validAuth++;
          logger.debug(`✅ Auth válido para sesión ${sessionData.sessionId}`);
        } else {
          stats.invalidAuth++;
          logger.warn(
            `❌ Auth inválido para sesión ${sessionData.sessionId}: ${validationResult.errorMessage}`
          );

          if (shouldCleanup && validationResult.corruptionDetected) {
            await this.cleanupCorruptedAuth(sessionData.sessionId, authDataPath);
            stats.cleanedUp++;
          }
        }
      } catch (error) {
        const errorMsg = `Error validating auth for session ${sessionData.sessionId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger.error(errorMsg);
        stats.errors.push(errorMsg);
        stats.invalidAuth++;
      }
    }

    logger.info(
      `🔍 Validación completada: ${stats.validAuth}/${sessions.length} válidos, ${stats.cleanedUp} limpiados`
    );
    return stats;
  }

  async validateSessionAuth(
    sessionId: string,
    authDataPath: string
  ): Promise<AuthValidationResult> {
    try {
      const sessionAuthPath = path.join(authDataPath, `session-${sessionId}`);

      if (!fs.existsSync(sessionAuthPath)) {
        return {
          isValid: true,
          hasLockFiles: false,
          hasEssentialFiles: false,
          corruptionDetected: false,
          errorMessage: 'No auth directory (clean slate)',
        };
      }

      const foundEssentialFiles = countValidEssentialFiles(sessionAuthPath);

      const hasLockFiles = await this.hasActiveLockFiles(sessionAuthPath);
      const hasEssentialFiles = foundEssentialFiles >= MIN_ESSENTIAL_AUTH_FILES;
      const isValid = hasEssentialFiles && !hasLockFiles;

      return {
        isValid,
        hasLockFiles,
        hasEssentialFiles,
        corruptionDetected: hasLockFiles || !hasEssentialFiles,
        errorMessage: !isValid
          ? `Lock files: ${hasLockFiles}, Essential files: ${foundEssentialFiles}/${MIN_ESSENTIAL_AUTH_FILES} required`
          : undefined,
      };
    } catch (error) {
      logger.debug(`Error validating auth files for ${sessionId}:`, error);
      return {
        isValid: false,
        hasLockFiles: false,
        hasEssentialFiles: false,
        corruptionDetected: true,
        errorMessage: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }

  private async hasActiveLockFiles(sessionAuthPath: string): Promise<boolean> {
    try {
      const lockFiles = await this.findLockFiles(sessionAuthPath);

      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

      for (const lockFile of lockFiles) {
        const stats = fs.statSync(lockFile);
        if (stats.mtime.getTime() < fiveMinutesAgo) {
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  private async findLockFiles(dirPath: string, lockFiles: string[] = []): Promise<string[]> {
    try {
      if (!fs.existsSync(dirPath)) return lockFiles;

      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          await this.findLockFiles(itemPath, lockFiles);
        } else if (item === 'LOCK' || item === 'lockfile' || item.endsWith('.lock')) {
          lockFiles.push(itemPath);
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return lockFiles;
  }

  async cleanupCorruptedAuth(sessionId: string, authDataPath: string): Promise<void> {
    try {
      const sessionAuthPath = path.join(authDataPath, `session-${sessionId}`);

      if (fs.existsSync(sessionAuthPath)) {
        logger.info(`🧹 Limpiando archivos auth corruptos para sesión ${sessionId}`);

        await SessionCleanupUtil.cleanupSession(sessionId, authDataPath);

        await this.persistenceService.updateSessionStatus(sessionId, 'connecting', {
          metadata: {
            authCleanupPerformed: new Date().toISOString(),
            authCorruptionDetected: true,
            lastAuthValidation: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      logger.error(`Error cleaning corrupted auth for ${sessionId}:`, error);
    }
  }

  isAuthCorruptionError(lastError: string): boolean {
    const authCorruptionIndicators = [
      'authentication files are corrupted',
      'auth files corrupted',
      'session files invalid',
      'chrome profile corrupted',
      'local storage corrupted',
      'session storage corrupted',
      'authentication failed repeatedly',
      'qr code timeout',
      'auth timeout',
      'profile directory corrupted',
      'browser profile invalid',
    ];

    const normalizedError = lastError.toLowerCase();
    return authCorruptionIndicators.some(indicator => normalizedError.includes(indicator));
  }

  isSessionClosedByUser(lastError: string): boolean {
    const userClosureIndicators = [
      'browser disconnected',
      'browser was closed',
      'page closed',
      'browser_closed',
      'page_closed',
      'target closed',
      'force disconnected by user',
      'user closed',
      'window closed',
    ];

    const normalizedError = lastError.toLowerCase();
    return userClosureIndicators.some(indicator => normalizedError.includes(indicator));
  }

  isRecentManualDisconnect(lastDisconnectTime: string): boolean {
    try {
      const disconnectTime = new Date(lastDisconnectTime);
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      return disconnectTime > thirtyMinutesAgo;
    } catch (error) {
      return false;
    }
  }
}

export default new AuthValidator();
