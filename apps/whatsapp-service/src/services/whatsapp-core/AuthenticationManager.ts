import { logger } from '../../utils/logger';
import { SessionCleanupUtil } from '../../utils/sessionCleanup';
import SessionPersistenceService from '../SessionPersistenceService';
import fs from 'fs';
import path from 'path';

const ESSENTIAL_AUTH_FILES = ['Default', 'RemoteAuth', 'Session Storage'];
export const MIN_ESSENTIAL_AUTH_FILES = 2;

/**
 * Count essential auth files/dirs that have actual content.
 * Shared by AuthenticationManager and AuthValidator to avoid duplication.
 */
export function countValidEssentialFiles(sessionAuthPath: string): number {
  let count = 0;
  for (const fileName of ESSENTIAL_AUTH_FILES) {
    try {
      const stat = fs.statSync(path.join(sessionAuthPath, fileName));
      if (stat.isDirectory()) {
        if (fs.readdirSync(path.join(sessionAuthPath, fileName)).length > 0) count++;
      } else if (stat.size > 0) {
        count++;
      }
    } catch {
      // File doesn't exist — skip
    }
  }
  return count;
}

/**
 * AuthenticationManager - Handles LocalAuth file management, validation, and cleanup operations
 *
 * Responsibilities:
 * - Authentication directory setup and validation
 * - LocalAuth file integrity checking
 * - Corrupted auth file cleanup and recovery
 * - Auth file information retrieval
 * - Session recovery with auth validation
 *
 * Extracted from WhatsAppServiceSimple lines: 89-99, 1708-1980
 */
export class AuthenticationManager {
  /**
   * Ensure the authentication directory exists
   */
  async ensureAuthDirectoryExists(authDataPath: string): Promise<void> {
    try {
      if (!fs.existsSync(authDataPath)) {
        fs.mkdirSync(authDataPath, { recursive: true });
        logger.info(`🔐 Created auth directory: ${authDataPath}`);
      }
    } catch (error) {
      logger.error('Error creating auth directory:', error);
      throw error;
    }
  }

  /**
   * Validate LocalAuth files for integrity
   */
  async validateAuthFiles(sessionId: string, authDataPath: string): Promise<boolean> {
    try {
      const sessionAuthPath = path.join(authDataPath, `session-${sessionId}`);

      if (!fs.existsSync(sessionAuthPath)) {
        logger.debug(`🔍 No auth files found for session ${sessionId} (first time setup)`);
        return true; // No files means clean slate, which is valid
      }

      const foundEssentialFiles = countValidEssentialFiles(sessionAuthPath);

      const hasLockFiles = await this.hasActiveLockFiles(sessionAuthPath);
      const hasValidStructure = foundEssentialFiles >= MIN_ESSENTIAL_AUTH_FILES;

      const isValid = hasValidStructure && !hasLockFiles;

      logger.debug(`🔍 Auth validation for ${sessionId}:`, {
        hasValidStructure,
        hasLockFiles,
        foundEssentialFiles,
        isValid,
      });

      return isValid;
    } catch (error) {
      logger.warn(`Error validating auth files for session ${sessionId}:`, error);
      return false; // Assume invalid on error
    }
  }

  /**
   * Check for active lock files that indicate corruption
   */
  private async hasActiveLockFiles(sessionAuthPath: string): Promise<boolean> {
    try {
      const lockFiles = await this.findLockFiles(sessionAuthPath);

      // Check if any lock files are older than 5 minutes (likely abandoned)
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

      for (const lockFile of lockFiles) {
        const stats = fs.statSync(lockFile);
        if (stats.mtime.getTime() < fiveMinutesAgo) {
          return true; // Found stale lock file
        }
      }

      return false;
    } catch (error) {
      logger.debug('Error checking lock files:', error);
      return false;
    }
  }

  /**
   * Find all lock files recursively
   */
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
      logger.debug(`Error finding lock files in ${dirPath}:`, error);
    }

    return lockFiles;
  }

  /**
   * Clean up corrupted authentication files
   */
  async cleanupCorruptedAuthFiles(sessionId: string, authDataPath: string): Promise<void> {
    try {
      const sessionAuthPath = path.join(authDataPath, `session-${sessionId}`);

      if (fs.existsSync(sessionAuthPath)) {
        logger.info(`🧹 Cleaning corrupted auth files for session ${sessionId}`);

        // Use the existing SessionCleanupUtil for safe cleanup
        await SessionCleanupUtil.cleanupSession(`auth-${sessionId}`, sessionAuthPath);

        // Update database to reflect cleanup
        await SessionPersistenceService.updateSessionStatus(sessionId, 'connecting', {
          metadata: {
            authCleanupPerformed: new Date().toISOString(),
            authCorruptionDetected: true,
          },
        });

        logger.info(`✅ Corrupted auth files cleaned for session ${sessionId}`);
      }
    } catch (error) {
      logger.error(`Error cleaning corrupted auth files for session ${sessionId}:`, error);
      // Don't throw - allow session creation to continue
    }
  }

  /**
   * Get authentication file information
   */
  async getAuthFileInfo(
    sessionId: string,
    authDataPath: string
  ): Promise<{
    exists: boolean;
    size: number;
    modified: string | null;
  }> {
    try {
      const sessionAuthPath = path.join(authDataPath, `session-${sessionId}`);

      if (!fs.existsSync(sessionAuthPath)) {
        return {
          exists: false,
          size: 0,
          modified: null,
        };
      }

      const stats = fs.statSync(sessionAuthPath);
      const size = await this.getDirectorySize(sessionAuthPath);

      return {
        exists: true,
        size: Math.round(size / 1024), // Convert to KB
        modified: stats.mtime.toISOString(),
      };
    } catch (error) {
      logger.debug(`Error getting auth file info for ${sessionId}:`, error);
      return {
        exists: false,
        size: 0,
        modified: null,
      };
    }
  }

  /**
   * Calculate directory size recursively
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    try {
      let totalSize = 0;

      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          totalSize += await this.getDirectorySize(itemPath);
        } else {
          totalSize += stat.size;
        }
      }

      return totalSize;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Sync auth state with database metadata
   */
  async syncAuthStateWithDatabase(sessionId: string): Promise<void> {
    try {
      const authDataPath = path.resolve('./wwebjs_auth');
      const authFileInfo = await this.getAuthFileInfo(sessionId, authDataPath);

      // Update metadata in database with current auth file state
      await SessionPersistenceService.updateSessionStatus(sessionId, 'connecting', {
        metadata: {
          authFileExists: authFileInfo.exists,
          authFileSize: authFileInfo.size,
          authFileModified: authFileInfo.modified,
          lastAuthSync: new Date().toISOString(),
          authDataPath: authDataPath,
        },
      });

      logger.debug(`🔄 Auth state synced for session ${sessionId}`, authFileInfo);
    } catch (error) {
      logger.error(`Error syncing auth state for session ${sessionId}:`, error);
      // Non-blocking error - continue execution
    }
  }

  /**
   * Validate session authentication before recovery
   */
  async validateSessionForRecovery(sessionId: string, authDataPath: string): Promise<boolean> {
    try {
      logger.info(`🔍 Validating session ${sessionId} for recovery`);

      // Validate auth files before attempting recovery
      const authIsValid = await this.validateAuthFiles(sessionId, authDataPath);

      if (!authIsValid) {
        logger.warn(`⚠️ Invalid auth detected for session ${sessionId} during recovery`);
        await this.cleanupCorruptedAuthFiles(sessionId, authDataPath);

        // Mark as requiring fresh authentication
        await SessionPersistenceService.updateSessionStatus(sessionId, 'connecting', {
          qrCode: undefined, // Clear old QR code
          metadata: {
            recoveryAuthCleaned: new Date().toISOString(),
          },
        });

        return false; // Auth invalid, requires fresh setup
      }

      logger.info(`✅ Session ${sessionId} auth validation passed`);
      return true;
    } catch (error) {
      logger.error(`Error validating session ${sessionId} for recovery:`, error);
      return false;
    }
  }

  /**
   * Setup authentication for new session
   */
  async setupSessionAuth(
    sessionId: string,
    authDataPath: string = './wwebjs_auth'
  ): Promise<{
    authIsValid: boolean;
    authFileInfo: { exists: boolean; size: number; modified: string | null };
  }> {
    try {
      // Ensure auth directory exists
      await this.ensureAuthDirectoryExists(authDataPath);

      // Validate existing authentication files for integrity
      const authIsValid = await this.validateAuthFiles(sessionId, authDataPath);

      if (!authIsValid) {
        logger.warn(`⚠️ Invalid auth files detected for session ${sessionId}, cleaning up...`);
        await this.cleanupCorruptedAuthFiles(sessionId, authDataPath);
      }

      // Get auth file information
      const authFileInfo = await this.getAuthFileInfo(sessionId, authDataPath);

      logger.info(`🔐 Auth setup completed for session ${sessionId}`, {
        authIsValid,
        authFileExists: authFileInfo.exists,
        authFileSize: authFileInfo.size,
      });

      return { authIsValid, authFileInfo };
    } catch (error) {
      logger.error(`Error setting up auth for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Clean up all authentication files for a session
   */
  async cleanupSessionAuth(
    sessionId: string,
    authDataPath: string = './wwebjs_auth'
  ): Promise<void> {
    try {
      const sessionAuthPath = path.join(authDataPath, `session-${sessionId}`);

      if (fs.existsSync(sessionAuthPath)) {
        logger.info(`🧹 Cleaning up auth files for session ${sessionId}`);

        await SessionCleanupUtil.cleanupSession(sessionId, authDataPath);

        logger.info(`✅ Auth cleanup completed for session ${sessionId}`);
      } else {
        logger.debug(`No auth files found to clean for session ${sessionId}`);
      }
    } catch (error) {
      logger.error(`Error cleaning up auth for session ${sessionId}:`, error);
      // Don't throw - allow cleanup to continue
    }
  }

  /**
   * Check if session has valid authentication files
   */
  async hasValidAuth(sessionId: string, authDataPath: string = './wwebjs_auth'): Promise<boolean> {
    try {
      const sessionAuthPath = path.join(authDataPath, `session-${sessionId}`);

      if (!fs.existsSync(sessionAuthPath)) {
        return false;
      }

      return await this.validateAuthFiles(sessionId, authDataPath);
    } catch (error) {
      logger.debug(`Error checking auth validity for session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Get authentication status summary for a session
   */
  async getAuthStatus(
    sessionId: string,
    authDataPath: string = './wwebjs_auth'
  ): Promise<{
    hasAuth: boolean;
    isValid: boolean;
    fileInfo: { exists: boolean; size: number; modified: string | null };
    lastValidation: string;
  }> {
    try {
      const authFileInfo = await this.getAuthFileInfo(sessionId, authDataPath);
      const isValid = authFileInfo.exists
        ? await this.validateAuthFiles(sessionId, authDataPath)
        : false;

      return {
        hasAuth: authFileInfo.exists,
        isValid,
        fileInfo: authFileInfo,
        lastValidation: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`Error getting auth status for session ${sessionId}:`, error);
      return {
        hasAuth: false,
        isValid: false,
        fileInfo: { exists: false, size: 0, modified: null },
        lastValidation: new Date().toISOString(),
      };
    }
  }
}

export default new AuthenticationManager();
