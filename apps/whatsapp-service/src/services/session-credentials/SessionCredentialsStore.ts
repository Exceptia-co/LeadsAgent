import { PrismaClient } from '@leadcrm/db';
import { AesGcm } from '../crypto/AesGcm';
import SessionPersistenceService from '../SessionPersistenceService';
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

  /**
   * Signal key material is binary. Plain JSON.stringify turns a Buffer into
   * `{"type":"Buffer","data":[…]}` and JSON.parse hands back that plain object
   * rather than a Buffer, so the round trip is lossy in exactly the case this
   * store exists for. These two mirror Baileys' own BufferJSON helpers, which
   * we cannot import yet because the dependency is Phase 2.
   */
  private static bufferReplacer(_key: string, value: unknown): unknown {
    if (value instanceof Uint8Array) {
      return { __buf: Buffer.from(value).toString('base64') };
    }
    // JSON.stringify pre-converts a Buffer to {type:'Buffer',data:[…]} before
    // the replacer sees it in some Node versions; catch that shape too.
    if (
      value &&
      typeof value === 'object' &&
      (value as { type?: string }).type === 'Buffer' &&
      Array.isArray((value as { data?: unknown }).data)
    ) {
      return { __buf: Buffer.from((value as { data: number[] }).data).toString('base64') };
    }
    return value;
  }

  private static bufferReviver(_key: string, value: unknown): unknown {
    if (
      value &&
      typeof value === 'object' &&
      typeof (value as { __buf?: string }).__buf === 'string'
    ) {
      return Buffer.from((value as { __buf: string }).__buf, 'base64');
    }
    return value;
  }

  private seal(value: unknown): EncryptedValue {
    const plaintext = Buffer.from(
      JSON.stringify(value, SessionCredentialsStore.bufferReplacer),
      'utf8'
    );
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
    return JSON.parse(plaintext.toString('utf8'), SessionCredentialsStore.bufferReviver);
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
        // Except for `creds`, where "missing" is a destructive lie. The caller
        // mints a fresh identity with initAuthCreds() and the first
        // creds.update upserts it over the row that is still sitting there --
        // so a wrong or rotated WHATSAPP_AUTH_ENCRYPTION_KEY destroys
        // credentials that were still recoverable while the row survived.
        // Failing the session start is repairable; this is not.
        if (category === 'creds') throw error;
      }
    }
    return result;
  }

  /**
   * Write one Baileys SignalDataSet atomically.
   *
   * `data` is keyed by category, then by key id; a null value means delete.
   * Everything goes in one transaction because Baileys flushes a whole batch
   * per commit: a pre-key deletion that lands while its matching session
   * write does not leaves the Signal ratchet desynchronised, and no retry
   * can repair it because the consumed key is already gone.
   */
  async setBatch(
    sessionId: string,
    data: Record<string, Record<string, unknown | null>>
  ): Promise<void> {
    const deletes: Array<{ category: string; keyIds: string[] }> = [];
    const writes: Array<{ category: string; keyId: string; value: EncryptedValue }> = [];

    for (const [category, values] of Object.entries(data)) {
      if (!values) continue;
      const keyIds = Object.keys(values);
      const toDelete = keyIds.filter(k => values[k] === null);
      if (toDelete.length > 0) deletes.push({ category, keyIds: toDelete });
      for (const keyId of keyIds.filter(k => values[k] !== null)) {
        // Seal outside the transaction: AES-GCM is CPU work, and holding a
        // Postgres transaction open across it lengthens the window for no
        // reason.
        writes.push({ category, keyId, value: this.seal(values[keyId]) });
      }
    }

    if (deletes.length === 0 && writes.length === 0) return;

    await this.prisma.$transaction(async tx => {
      for (const { category, keyIds } of deletes) {
        await tx.whatsAppAuthKey.deleteMany({
          where: { sessionId, category, keyId: { in: keyIds } },
        });
      }
      for (const { category, keyId, value } of writes) {
        await tx.whatsAppAuthKey.upsert({
          where: { sessionId_category_keyId: { sessionId, category, keyId } },
          create: { sessionId, category, keyId, value: value as unknown as object },
          update: { value: value as unknown as object },
        });
      }
    });
  }

  /**
   * Whether this session can reconnect without a new QR.
   *
   * Scoped to the `creds` category on purpose: a session can hold orphaned
   * pre-keys with no credentials, and answering "yes" for it would fail after
   * the socket is already up rather than before it starts.
   */
  async hasCredentials(sessionId: string): Promise<boolean> {
    const count = await this.prisma.whatsAppAuthKey.count({
      where: { sessionId, category: 'creds' },
    });
    return count > 0;
  }

  /**
   * How many one-time pre-keys this session still holds.
   *
   * The count is what makes pre-key exhaustion visible. A session that runs
   * out cannot establish a Signal session with a contact it has never spoken
   * to, so *new* conversations stop arriving while the socket stays open and
   * every existing chat keeps working -- the session looks healthy from every
   * angle except this number.
   *
   * Baileys replenishes on its own, checking the server's count at each open
   * and uploading more when it is low. This does not second-guess that. It
   * measures our side of it, because the upload lands in `setBatch` like any
   * other write and Baileys' own transaction wrapper can drop a buffered
   * batch without raising anything (see the app-state-sync-key note in the
   * cutover post-mortem). A replenisher that silently does nothing is exactly
   * the failure this is here to catch.
   */
  async countPreKeys(sessionId: string): Promise<number> {
    return this.prisma.whatsAppAuthKey.count({
      where: { sessionId, category: 'pre-key' },
    });
  }

  /** Only on explicit logout or session delete. Never on shutdown. */
  async clear(sessionId: string): Promise<void> {
    await this.prisma.whatsAppAuthKey.deleteMany({ where: { sessionId } });
    logger.info(`Cleared all auth keys for session ${sessionId}`);
  }
}

/**
 * Shared instance. Four call sites read credentials now (the session manager,
 * recovery, and the two HealthMetrics); each constructing its own store would
 * open a separate PrismaClient pool. It reuses SessionPersistenceService's
 * client rather than opening a third: that service owns whatsapp_sessions,
 * the parent table of every row this store writes.
 */
export const sessionCredentialsStore = new SessionCredentialsStore(
  SessionPersistenceService.prisma
);
