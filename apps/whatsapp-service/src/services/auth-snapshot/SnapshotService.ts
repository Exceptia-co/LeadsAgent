import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import tar from 'tar';
import { logger } from '../../utils/logger';
import EncryptionService from './EncryptionService';
import type { SnapshotData, SnapshotMetadata } from './types';
import { SESSION_CONSTANTS } from '../../config/session-constants';

const AUTH_DATA_PATH = './wwebjs_auth';

/**
 * SnapshotService - Backup & restore WhatsApp auth sessions to/from PostgreSQL
 *
 * Flow (backup):  auth dir → tar.gz → encrypt(AES-256-GCM) → base64 → DB jsonb
 * Flow (restore): DB jsonb → base64 → decrypt → extract to temp dir → atomic rename
 */
export class SnapshotService {
  private enabled: boolean;

  constructor() {
    this.enabled = process.env.ENABLE_AUTH_SNAPSHOTS === 'true';
  }

  /**
   * Check if snapshots feature is enabled and properly configured
   */
  isEnabled(): boolean {
    return this.enabled && EncryptionService.isConfigured();
  }

  /**
   * Create a snapshot of a session's auth directory
   * Returns SnapshotData ready to be stored in PostgreSQL authData field
   */
  async createSnapshot(sessionId: string): Promise<SnapshotData | null> {
    if (!this.isEnabled()) {
      logger.debug(`Snapshots disabled, skipping for session ${sessionId}`);
      return null;
    }

    const sessionAuthPath = path.resolve(AUTH_DATA_PATH, `session-${sessionId}`);

    if (!fs.existsSync(sessionAuthPath)) {
      logger.warn(`No auth directory found for session ${sessionId}, cannot create snapshot`);
      return null;
    }

    try {
      logger.info(`Creating snapshot for session ${sessionId}...`);
      const startTime = Date.now();

      // 1. Create tar.gz in memory
      const tarBuffer = await this.createTarGz(sessionAuthPath, sessionId);

      // Reject snapshots exceeding size limit to prevent DB bloat
      if (tarBuffer.length > SESSION_CONSTANTS.MAX_SNAPSHOT_SIZE_BYTES) {
        const sizeMB = (tarBuffer.length / 1024 / 1024).toFixed(2);
        const limitMB = (SESSION_CONSTANTS.MAX_SNAPSHOT_SIZE_BYTES / 1024 / 1024).toFixed(0);
        logger.warn(
          `Snapshot for session ${sessionId} exceeds size limit: ${sizeMB}MB > ${limitMB}MB. Skipping.`
        );
        return null;
      }

      // 2. Calculate checksum of compressed data
      const checksum = crypto.createHash('sha256').update(tarBuffer).digest('hex');

      // 3. Encrypt
      const { encrypted, iv, authTag } = EncryptionService.encrypt(tarBuffer);

      // 4. Encode to base64
      const base64Data = encrypted.toString('base64');

      const metadata: SnapshotMetadata = {
        checksum,
        sizeBytes: tarBuffer.length,
        createdAt: new Date().toISOString(),
        encryptionIv: iv,
        encryptionAuthTag: authTag,
      };

      const elapsed = Date.now() - startTime;
      logger.info(
        `Snapshot created for session ${sessionId}: ${(tarBuffer.length / 1024 / 1024).toFixed(2)}MB compressed, ${elapsed}ms`
      );

      return { metadata, data: base64Data };
    } catch (error) {
      logger.error(`Failed to create snapshot for session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Restore a session's auth directory from a snapshot
   * Uses atomic extraction: temp dir → validate → rename
   */
  async restoreSnapshot(sessionId: string, snapshotData: SnapshotData): Promise<boolean> {
    if (!this.isEnabled()) {
      logger.debug(`Snapshots disabled, skipping restore for session ${sessionId}`);
      return false;
    }

    const sessionAuthPath = path.resolve(AUTH_DATA_PATH, `session-${sessionId}`);
    const tempPath = path.resolve(AUTH_DATA_PATH, `.tmp-restore-${sessionId}-${Date.now()}`);

    try {
      logger.info(`Restoring snapshot for session ${sessionId}...`);
      const startTime = Date.now();

      // 1. Decode from base64
      const encrypted = Buffer.from(snapshotData.data, 'base64');

      // 2. Decrypt
      const tarBuffer = EncryptionService.decrypt(
        encrypted,
        snapshotData.metadata.encryptionIv,
        snapshotData.metadata.encryptionAuthTag
      );

      // 3. Verify checksum
      const checksum = crypto.createHash('sha256').update(tarBuffer).digest('hex');
      if (checksum !== snapshotData.metadata.checksum) {
        throw new Error(
          `Checksum mismatch: expected ${snapshotData.metadata.checksum}, got ${checksum}`
        );
      }

      // 4. Extract to temp directory (atomic)
      fs.mkdirSync(tempPath, { recursive: true });
      await this.extractTarGz(tarBuffer, tempPath);

      // 5. Validate extracted contents have at least some files
      const extractedFiles = fs.readdirSync(tempPath);
      if (extractedFiles.length === 0) {
        throw new Error('Extracted snapshot is empty');
      }

      // 6. Atomic swap: remove old → rename temp to final
      if (fs.existsSync(sessionAuthPath)) {
        fs.rmSync(sessionAuthPath, { recursive: true, force: true });
      }
      fs.renameSync(tempPath, sessionAuthPath);

      const elapsed = Date.now() - startTime;
      logger.info(
        `Snapshot restored for session ${sessionId}: ${extractedFiles.length} items, ${elapsed}ms`
      );

      return true;
    } catch (error) {
      logger.error(`Failed to restore snapshot for session ${sessionId}:`, error);

      // Clean up temp directory on failure
      try {
        if (fs.existsSync(tempPath)) {
          fs.rmSync(tempPath, { recursive: true, force: true });
        }
      } catch (cleanupError) {
        logger.debug('Error cleaning up temp restore dir:', cleanupError);
      }

      return false;
    }
  }

  /**
   * Check if a session has a valid auth directory on the filesystem
   */
  hasLocalAuth(sessionId: string): boolean {
    const sessionAuthPath = path.resolve(AUTH_DATA_PATH, `session-${sessionId}`);
    if (!fs.existsSync(sessionAuthPath)) return false;

    try {
      const items = fs.readdirSync(sessionAuthPath);
      return items.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Create a tar.gz buffer from a session auth directory
   */
  private async createTarGz(sessionAuthPath: string, sessionId: string): Promise<Buffer> {
    // Use tar.create with gzip to create an in-memory buffer
    const chunks: Buffer[] = [];

    // We need to create a tar from the contents of the session directory
    const parentDir = path.dirname(sessionAuthPath);
    const dirName = path.basename(sessionAuthPath);

    await tar
      .create(
        {
          gzip: true,
          cwd: parentDir,
          portable: true,
          // Write to a buffer via onWriteEntry
        },
        [dirName]
      )
      .pipe({
        write(chunk: Buffer) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          return true;
        },
        end() {},
        on() {
          return this;
        },
        once() {
          return this;
        },
        emit() {
          return false;
        },
        // Satisfy the minimal writable interface
      } as any);

    // tar.create returns a readable stream when no file option is given
    // Let's use a different approach with a temp file for reliability
    return await this.createTarGzViaFile(sessionAuthPath);
  }

  /**
   * Create tar.gz via temp file for reliable cross-platform support
   */
  private async createTarGzViaFile(sessionAuthPath: string): Promise<Buffer> {
    const parentDir = path.dirname(sessionAuthPath);
    const dirName = path.basename(sessionAuthPath);
    const tempTarPath = path.resolve(AUTH_DATA_PATH, `.tmp-snapshot-${Date.now()}.tar.gz`);

    try {
      await tar.create(
        {
          gzip: true,
          file: tempTarPath,
          cwd: parentDir,
          portable: true,
        },
        [dirName]
      );

      const buffer = fs.readFileSync(tempTarPath);
      return buffer;
    } finally {
      // Always clean up temp file
      try {
        if (fs.existsSync(tempTarPath)) {
          fs.unlinkSync(tempTarPath);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Extract a tar.gz buffer to a target directory
   */
  private async extractTarGz(tarBuffer: Buffer, targetDir: string): Promise<void> {
    const tempTarPath = path.resolve(AUTH_DATA_PATH, `.tmp-extract-${Date.now()}.tar.gz`);

    try {
      // Write buffer to temp file
      fs.writeFileSync(tempTarPath, tarBuffer);

      // Extract with strip=1 to remove the outer session-{id} directory
      // so contents go directly into targetDir
      await tar.extract({
        file: tempTarPath,
        cwd: targetDir,
        strip: 1,
      });
    } finally {
      try {
        if (fs.existsSync(tempTarPath)) {
          fs.unlinkSync(tempTarPath);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

export default new SnapshotService();
