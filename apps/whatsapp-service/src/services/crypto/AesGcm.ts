import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/**
 * AES-256-GCM over Node's native crypto. Extracted from the deleted
 * auth-snapshot/EncryptionService so the key is a parameter rather than a
 * fixed env var: snapshots and Baileys credentials must not share a key.
 */
export class AesGcm {
  private static toKey(keyHex: string): Buffer {
    if (!keyHex || keyHex.length !== 64) {
      throw new Error(
        'Encryption key must be a 64-character hex string (32 bytes). ' +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }
    return Buffer.from(keyHex, 'hex');
  }

  static encrypt(
    plaintext: Buffer,
    keyHex: string
  ): { ciphertext: Buffer; iv: Buffer; authTag: Buffer } {
    const key = this.toKey(keyHex);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { ciphertext, iv, authTag: cipher.getAuthTag() };
  }

  static decrypt(ciphertext: Buffer, iv: Buffer, authTag: Buffer, keyHex: string): Buffer {
    const key = this.toKey(keyHex);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
