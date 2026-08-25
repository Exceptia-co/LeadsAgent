const mockUpsert = jest.fn();
const mockFindMany = jest.fn();
const mockDeleteMany = jest.fn();

jest.mock('@leadcrm/db', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    whatsAppAuthKey: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  })),
  Prisma: {},
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

process.env.WHATSAPP_AUTH_ENCRYPTION_KEY = 'c'.repeat(64);

import { SessionCredentialsStore } from './SessionCredentialsStore';

const SESSION_ID = 's1';

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue({});
  mockFindMany.mockResolvedValue([]);
  mockDeleteMany.mockResolvedValue({ count: 0 });
});

describe('SessionCredentialsStore', () => {
  it('round_trips_a_value_through_encryption', async () => {
    const store = new SessionCredentialsStore();
    const secret = { privateKey: 'signal-private-key', counter: 7 };

    await store.set(SESSION_ID, 'creds', { creds: secret });

    const stored = mockUpsert.mock.calls[0][0].create.value;
    expect(JSON.stringify(stored)).not.toContain('signal-private-key');

    mockFindMany.mockResolvedValue([{ keyId: 'creds', value: stored }]);
    const read = await store.get(SESSION_ID, 'creds', ['creds']);

    expect(read).toEqual({ creds: secret });
  });

  it('scopes_every_read_and_write_by_session_and_category', async () => {
    const store = new SessionCredentialsStore();

    await store.get(SESSION_ID, 'pre-key', ['1', '2']);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { sessionId: SESSION_ID, category: 'pre-key', keyId: { in: ['1', '2'] } },
      select: { keyId: true, value: true },
    });
  });

  it('writes_each_key_independently_so_concurrent_sets_cannot_lose_updates', async () => {
    const store = new SessionCredentialsStore();

    await store.set(SESSION_ID, 'session', { a: { v: 1 }, b: { v: 2 } });

    expect(mockUpsert).toHaveBeenCalledTimes(2);
    const keyIds = mockUpsert.mock.calls.map(c => c[0].where.sessionId_category_keyId.keyId);
    expect(keyIds.sort()).toEqual(['a', 'b']);
  });

  it('deletes_a_key_when_its_value_is_null', async () => {
    const store = new SessionCredentialsStore();

    await store.set(SESSION_ID, 'pre-key', { '3': null });

    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { sessionId: SESSION_ID, category: 'pre-key', keyId: { in: ['3'] } },
    });
  });

  it('omits_missing_keys_from_the_result_instead_of_returning_undefined_entries', async () => {
    const store = new SessionCredentialsStore();
    mockFindMany.mockResolvedValue([]);

    const read = await store.get(SESSION_ID, 'pre-key', ['missing']);

    expect(read).toEqual({});
  });

  it('clear_removes_every_row_for_the_session', async () => {
    const store = new SessionCredentialsStore();

    await store.clear(SESSION_ID);

    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { sessionId: SESSION_ID } });
  });
});
