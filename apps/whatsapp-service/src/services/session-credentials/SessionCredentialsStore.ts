import { PrismaClient } from '@leadcrm/db';
import { AesGcm } from '../crypto/AesGcm';
import { logger } from '../../utils/logger';

interface EncryptedValue {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/**
 * Key-value credential store for WhatsApp session state.
 *
 * Shaped to match Baileys' SignalKeyStore (get by category + ids, set a batch,
 * null value means delete) so the auth adapter is a thin wrapper. One row per
 * key means concurrent Signal key rotations never contend, which a single JSON
 * blob could not offer without a per-session mutex on the crypto hot path.
 */
export class SessionCredentialsStore {
  constructor(private readonly prisma: PrismaClient = new PrismaClient()) {}

  private key(): string {
    const key = process.env.WHATSAPP_AUTH_ENCRYPTION_KEY;
    if (!key) {
      throw new Error('WHATSAPP_AUTH_ENCRYPTION_KEY is not set; refusing to store credentials');
    }
    return key;
  }

  private seal(value: unknown): EncryptedValue {
    const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
    const { ciphertext, iv, authTag } = AesGcm.encrypt(plaintext, this.key());
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  private open(stored: EncryptedValue): unknown {
    const plaintext = AesGcm.decrypt(
      Buffer.from(stored.ciphertext, 'base64'),
      Buffer.from(stored.iv, 'base64'),
      Buffer.from(stored.authTag, 'base64'),
      this.key()
    );
    return JSON.parse(plaintext.toString('utf8'));
  }

  async get(
    sessionId: string,
    category: string,
    keyIds: string[]
  ): Promise<Record<string, unknown>> {
    if (keyIds.length === 0) return {};

    const rows = await this.prisma.whatsAppAuthKey.findMany({
      where: { sessionId, category, keyId: { in: keyIds } },
      select: { keyId: true, value: true },
    });

    const result: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        result[row.keyId] = this.open(row.value as unknown as EncryptedValue);
      } catch (error) {
        // A key we cannot decrypt is a key we do not have. Surfacing it as
        // missing lets Baileys regenerate rather than crash the session.
        logger.error(
          `Failed to decrypt auth key ${category}/${row.keyId} for session ${sessionId}:`,
          error
        );
      }
    }
    return result;
  }

  async set(
    sessionId: string,
    category: string,
    values: Record<string, unknown | null>
  ): Promise<void> {
    const toDelete = Object.keys(values).filter(k => values[k] === null);
    const toWrite = Object.keys(values).filter(k => values[k] !== null);

    if (toDelete.length > 0) {
      await this.prisma.whatsAppAuthKey.deleteMany({
        where: { sessionId, category, keyId: { in: toDelete } },
      });
    }

    for (const keyId of toWrite) {
      const sealed = this.seal(values[keyId]);
      await this.prisma.whatsAppAuthKey.upsert({
        where: { sessionId_category_keyId: { sessionId, category, keyId } },
        create: { sessionId, category, keyId, value: sealed as unknown as object },
        update: { value: sealed as unknown as object },
      });
    }
  }

  /** Only on explicit logout or session delete. Never on shutdown. */
  async clear(sessionId: string): Promise<void> {
    await this.prisma.whatsAppAuthKey.deleteMany({ where: { sessionId } });
    logger.info(`Cleared all auth keys for session ${sessionId}`);
  }
}
