import crypto from 'crypto';
import { logger } from '../../utils/logger';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

/**
 * EncryptionService - AES-256-GCM encryption/decryption for auth snapshots
 *
 * Uses Node.js native crypto module (no external dependencies).
 * Key is derived from SNAPSHOT_ENCRYPTION_KEY env var (64-char hex = 32 bytes).
 */
export class EncryptionService {
  private key: Buffer | null = null;

  private getKey(): Buffer {
    if (this.key) return this.key;

    const hexKey = process.env.SNAPSHOT_ENCRYPTION_KEY;
    if (!hexKey || hexKey.length !== 64) {
      throw new Error(
        'SNAPSHOT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
          'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }

    this.key = Buffer.from(hexKey, 'hex');
    return this.key;
  }

  /**
   * Encrypt a buffer using AES-256-GCM
   */
  encrypt(plaintext: Buffer): { encrypted: Buffer; iv: string; authTag: string } {
    try {
      const key = this.getKey();
      const iv = crypto.randomBytes(IV_LENGTH);

      const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
      });

      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const authTag = cipher.getAuthTag();

      logger.debug(
        `Encrypted ${plaintext.length} bytes -> ${encrypted.length} bytes`
      );

      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
      };
    } catch (error) {
      logger.error('Encryption failed:', error);
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt a buffer using AES-256-GCM
   */
  decrypt(encrypted: Buffer, iv: string, authTag: string): Buffer {
    try {
      const key = this.getKey();
      const ivBuffer = Buffer.from(iv, 'hex');
      const authTagBuffer = Buffer.from(authTag, 'hex');

      const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer, {
        authTagLength: AUTH_TAG_LENGTH,
      });
      decipher.setAuthTag(authTagBuffer);

      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

      logger.debug(
        `Decrypted ${encrypted.length} bytes -> ${decrypted.length} bytes`
      );

      return decrypted;
    } catch (error) {
      logger.error('Decryption failed:', error);
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if encryption is properly configured
   */
  isConfigured(): boolean {
    try {
      this.getKey();
      return true;
    } catch {
      return false;
    }
  }
}

export default new EncryptionService();
