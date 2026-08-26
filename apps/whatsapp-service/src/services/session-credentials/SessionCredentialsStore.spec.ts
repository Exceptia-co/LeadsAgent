const mockUpsert = jest.fn();
const mockFindMany = jest.fn();
const mockDeleteMany = jest.fn();
const mockCount = jest.fn();
const mockTransaction = jest.fn();

jest.mock('@leadcrm/db', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    whatsAppAuthKey: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  })),
  Prisma: {},
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

process.env.WHATSAPP_AUTH_ENCRYPTION_KEY = 'c'.repeat(64);

import { SessionCredentialsStore } from './SessionCredentialsStore';

const SESSION_ID = 's1';

// Distinct from the outer `prismaMock`: `setBatch` must run its writes
// through this object, obtained via `$transaction(cb)`, never through the
// outer one -- that is what proves the writes are actually inside the
// transaction rather than merely alongside it.
const txMock = {
  whatsAppAuthKey: {
    deleteMany: jest.fn(),
    upsert: jest.fn(),
  },
};

const prismaMock = {
  whatsAppAuthKey: {
    upsert: mockUpsert,
    findMany: mockFindMany,
    deleteMany: mockDeleteMany,
    count: mockCount,
  },
  $transaction: mockTransaction,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue({});
  mockFindMany.mockResolvedValue([]);
  mockDeleteMany.mockResolvedValue({ count: 0 });
  mockTransaction.mockImplementation(async (cb: (tx: typeof txMock) => unknown) => cb(txMock));
});

describe('SessionCredentialsStore', () => {
  it('round_trips_a_value_through_encryption', async () => {
    const store = new SessionCredentialsStore(prismaMock as any);
    const secret = { privateKey: 'signal-private-key', counter: 7 };

    await store.setBatch(SESSION_ID, { creds: { creds: secret } });

    // Assert BOTH envelopes: upsert always carries a create AND an update
    // payload (Prisma picks which one runs), so a rotation that leaked
    // plaintext through update.value while sealing create.value would slip
    // past a check that only looked at one of the two.
    const { create, update } = txMock.whatsAppAuthKey.upsert.mock.calls[0][0];
    expect(JSON.stringify(create.value)).not.toContain('signal-private-key');
    expect(JSON.stringify(update.value)).not.toContain('signal-private-key');
    // "Doesn't contain the substring" also passes for a base64-without-
    // encryption regression. Pin the real invariant: sealing the same value
    // twice must not produce the same envelope. A base64 "seal" is
    // deterministic and would emit an identical iv both times; AES-GCM's
    // random IV will not.
    await store.setBatch(SESSION_ID, { creds: { creds: secret } });
    const secondEnvelope = txMock.whatsAppAuthKey.upsert.mock.calls[1][0].create.value;
    expect(secondEnvelope.iv).not.toEqual(create.value.iv);

    mockFindMany.mockResolvedValue([{ keyId: 'creds', value: create.value }]);
    const read = await store.get(SESSION_ID, 'creds', ['creds']);

    expect(read).toEqual({ creds: secret });
  });

  it('round_trips_a_buffer_nested_inside_the_value', async () => {
    // Signal key material is binary. Plain JSON.stringify/parse turns a
    // Buffer into a plain {type:'Buffer',data:[...]} object and never back,
    // which silently corrupts the only kind of value this store exists for.
    const store = new SessionCredentialsStore(prismaMock as any);
    const secret = { privateKey: Buffer.from([1, 2, 3, 255]), counter: 7 };

    await store.setBatch(SESSION_ID, { creds: { creds: secret } });

    const stored = txMock.whatsAppAuthKey.upsert.mock.calls[0][0].create.value;
    mockFindMany.mockResolvedValue([{ keyId: 'creds', value: stored }]);
    const read = await store.get(SESSION_ID, 'creds', ['creds']);

    const roundTripped = (read as { creds: { privateKey: Buffer; counter: number } }).creds;
    expect(Buffer.isBuffer(roundTripped.privateKey)).toBe(true);
    expect(roundTripped.privateKey.equals(secret.privateKey)).toBe(true);
    expect(roundTripped.counter).toBe(7);
  });

  it('round_trips_a_plain_uint8array_nested_inside_the_value', async () => {
    // bufferReplacer has two branches. The Buffer test above only exercises
    // the second one: Buffer.prototype.toJSON runs before the replacer sees
    // it, so a Buffer already looks like {type:'Buffer',data:[...]} by the
    // time the replacer runs. A plain Uint8Array has no toJSON and would
    // otherwise serialize as an index-keyed object ({"0":1,"1":2,...}) —
    // only the first branch (`instanceof Uint8Array`) catches that, and
    // Baileys' own Signal key material is frequently plain Uint8Array.
    //
    // Deliberate choice: bufferReviver returns a Node Buffer, which IS a
    // Uint8Array (Buffer subclasses it), so `instanceof Uint8Array` and byte
    // equality both hold for the revived value even though it isn't the
    // exact same subclass instance that went in. That's fine for Baileys.
    const store = new SessionCredentialsStore(prismaMock as any);
    const secret = { privateKey: new Uint8Array([1, 2, 3, 255]), counter: 7 };

    await store.setBatch(SESSION_ID, { creds: { creds: secret } });

    const stored = txMock.whatsAppAuthKey.upsert.mock.calls[0][0].create.value;
    mockFindMany.mockResolvedValue([{ keyId: 'creds', value: stored }]);
    const read = await store.get(SESSION_ID, 'creds', ['creds']);

    const roundTripped = (read as { creds: { privateKey: Uint8Array; counter: number } }).creds;
    expect(roundTripped.privateKey).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(roundTripped.privateKey).equals(Buffer.from(secret.privateKey))).toBe(true);
    expect(roundTripped.counter).toBe(7);
  });

  it('scopes_every_read_and_write_by_session_and_category', async () => {
    const store = new SessionCredentialsStore(prismaMock as any);

    await store.get(SESSION_ID, 'pre-key', ['1', '2']);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { sessionId: SESSION_ID, category: 'pre-key', keyId: { in: ['1', '2'] } },
      select: { keyId: true, value: true },
    });

    await store.setBatch(SESSION_ID, { 'pre-key': { '1': { v: 1 } } });

    const { where, create } = txMock.whatsAppAuthKey.upsert.mock.calls[0][0];
    expect(where).toEqual({
      sessionId_category_keyId: { sessionId: SESSION_ID, category: 'pre-key', keyId: '1' },
    });
    expect(create).toMatchObject({ sessionId: SESSION_ID, category: 'pre-key', keyId: '1' });
  });

  it('writes_each_key_independently_so_concurrent_sets_cannot_lose_updates', async () => {
    const store = new SessionCredentialsStore(prismaMock as any);

    await store.setBatch(SESSION_ID, { session: { a: { v: 1 }, b: { v: 2 } } });

    expect(txMock.whatsAppAuthKey.upsert).toHaveBeenCalledTimes(2);
    const keyIds = txMock.whatsAppAuthKey.upsert.mock.calls.map(
      (c: any[]) => c[0].where.sessionId_category_keyId.keyId
    );
    expect(keyIds.sort()).toEqual(['a', 'b']);
  });

  it('deletes_a_key_when_its_value_is_null', async () => {
    const store = new SessionCredentialsStore(prismaMock as any);

    await store.setBatch(SESSION_ID, { 'pre-key': { '3': null } });

    expect(txMock.whatsAppAuthKey.upsert).not.toHaveBeenCalled();
    expect(txMock.whatsAppAuthKey.deleteMany).toHaveBeenCalledWith({
      where: { sessionId: SESSION_ID, category: 'pre-key', keyId: { in: ['3'] } },
    });
  });

  it('omits_missing_keys_from_the_result_instead_of_returning_undefined_entries', async () => {
    const store = new SessionCredentialsStore();
    mockFindMany.mockResolvedValue([]);

    const read = await store.get(SESSION_ID, 'pre-key', ['missing']);

    // toEqual ignores undefined-valued properties, so {missing: undefined}
    // would pass it — toStrictEqual + toHaveProperty is what actually proves
    // the key is absent rather than present-but-undefined.
    expect(read).toStrictEqual({});
    expect(read).not.toHaveProperty('missing');
  });

  it('omits_a_signal_key_that_fails_to_decrypt_and_logs_the_error_instead_of_throwing', async () => {
    const store = new SessionCredentialsStore();
    const { logger } = jest.requireMock('../../utils/logger') as {
      logger: { error: jest.Mock };
    };

    mockFindMany.mockResolvedValue([
      { keyId: 'corrupt', value: { ciphertext: 'AAAA', iv: 'AAAA', authTag: 'AAAA' } },
    ]);

    const read = await store.get(SESSION_ID, 'pre-key', ['corrupt']);

    expect(read).toStrictEqual({});
    expect(read).not.toHaveProperty('corrupt');
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('throws_rather_than_report_an_undecryptable_creds_row_as_missing', async () => {
    // The category where "missing" is a destructive lie. makeBaileysAuthState
    // answers an absent creds row with initAuthCreds(), and the first
    // creds.update upserts that fresh identity over the row that is still
    // sitting there -- so a wrong or rotated WHATSAPP_AUTH_ENCRYPTION_KEY
    // turns recoverable credentials into a QR scan, silently, one log line
    // deep. Pre-keys regenerate; an identity does not.
    const store = new SessionCredentialsStore();

    mockFindMany.mockResolvedValue([
      { keyId: 'creds', value: { ciphertext: 'AAAA', iv: 'AAAA', authTag: 'AAAA' } },
    ]);

    await expect(store.get(SESSION_ID, 'creds', ['creds'])).rejects.toThrow();
  });

  it('clear_removes_every_row_for_the_session', async () => {
    const store = new SessionCredentialsStore();

    await store.clear(SESSION_ID);

    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { sessionId: SESSION_ID } });
  });
});

describe('SessionCredentialsStore batch writes', () => {
  it('writes_every_category_of_one_batch_inside_a_single_transaction', async () => {
    // Baileys wraps this store in its own transaction buffer and flushes one
    // batch per commit, retrying the whole commit up to ten times. The retry
    // is idempotent, so a failure mid-batch is survivable -- unless the
    // process dies during the 3s backoff, at which point Postgres keeps a
    // partial write: a consumed pre-key deleted, the session never advanced.
    // That desynchronises the Signal ratchet irrecoverably for that contact.
    const store = new SessionCredentialsStore(prismaMock as any);

    await store.setBatch('s1', {
      'pre-key': { '1': null },
      session: { '34600111222.0': { some: 'state' } },
    });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    // Every write must be inside the callback, none outside it.
    expect(txMock.whatsAppAuthKey.deleteMany).toHaveBeenCalledTimes(1);
    expect(txMock.whatsAppAuthKey.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.whatsAppAuthKey.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.whatsAppAuthKey.upsert).not.toHaveBeenCalled();
  });

  it('scopes_the_delete_by_category_as_well_as_by_key_id', async () => {
    // Two categories can legitimately hold the same keyId. Deleting by
    // (sessionId, keyId) alone would take an unrelated key with it.
    const store = new SessionCredentialsStore(prismaMock as any);

    await store.setBatch('s1', { 'pre-key': { '1': null }, session: { '1': null } });

    // toStrictEqual on the complete `where`, not objectContaining: dropping
    // `keyId: { in: keyIds }` would delete every key in the category and an
    // objectContaining assertion would still pass, which is the opposite of
    // what a test named "scopes the delete" is for.
    const wheres = txMock.whatsAppAuthKey.deleteMany.mock.calls.map((c: any[]) => c[0].where);
    expect(wheres).toStrictEqual([
      { sessionId: 's1', category: 'pre-key', keyId: { in: ['1'] } },
      { sessionId: 's1', category: 'session', keyId: { in: ['1'] } },
    ]);
  });

  it('hasCredentials_is_true_only_when_the_creds_row_exists', async () => {
    // "Do I have credentials" must not be answered by "are there any rows":
    // a session can hold orphaned pre-keys with no creds row, and recovering
    // it would fail after the socket is already up.
    const store = new SessionCredentialsStore(prismaMock as any);

    prismaMock.whatsAppAuthKey.count.mockResolvedValueOnce(1);
    await expect(store.hasCredentials('s1')).resolves.toBe(true);
    expect(prismaMock.whatsAppAuthKey.count).toHaveBeenCalledWith({
      where: { sessionId: 's1', category: 'creds' },
    });

    prismaMock.whatsAppAuthKey.count.mockResolvedValueOnce(0);
    await expect(store.hasCredentials('s1')).resolves.toBe(false);
  });
});
