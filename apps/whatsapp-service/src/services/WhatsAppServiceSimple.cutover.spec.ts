/**
 * Three behaviours of the Baileys delegation that are invisible in the diff,
 * break nothing at compile time, and had no test anywhere: the order of the
 * two writes in createSession, the tenantId that rides along with them, and
 * which teardown mode shutdown() reaches.
 */
const mockCreateSession = jest.fn();
const mockDestroySession = jest.fn();
const mockShutdownAll = jest.fn();
const mockGetSession = jest.fn();

jest.mock('./baileys/BaileysSessionManager', () => ({
  BaileysSessionManager: jest.fn().mockImplementation(() => ({
    createSession: (...args: unknown[]) => mockCreateSession(...args),
    destroySession: (...args: unknown[]) => mockDestroySession(...args),
    shutdownAll: (...args: unknown[]) => mockShutdownAll(...args),
    getSession: (...args: unknown[]) => mockGetSession(...args),
    getAllSessions: jest.fn().mockResolvedValue([]),
  })),
}));

const mockSaveSession = jest.fn();
const mockDeactivateSession = jest.fn();

jest.mock('./SessionPersistenceService', () => ({
  __esModule: true,
  default: {
    saveSession: (...args: unknown[]) => mockSaveSession(...args),
    deactivateSession: (...args: unknown[]) => mockDeactivateSession(...args),
    loadActiveSessions: jest.fn().mockResolvedValue([]),
    updateSessionStatus: jest.fn().mockResolvedValue(true),
  },
}));

const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();

jest.mock('../config/redis', () => ({
  __esModule: true,
  default: {
    getClient: () => ({ set: (...args: unknown[]) => mockRedisSet(...args) }),
    del: (...args: unknown[]) => mockRedisDel(...args),
    set: jest.fn().mockResolvedValue(undefined),
    setObject: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
  },
  redisClient: { get: jest.fn(), set: jest.fn(), setNX: jest.fn() },
  REDIS_KEYS: { SESSION_LOCK: 'session:lock:', SESSION_HEARTBEAT: 'session:hb:' },
  REDIS_TTL: { MESSAGE_DEDUP_SECONDS: 300 },
}));

jest.mock('./session-credentials/SessionCredentialsStore', () => ({
  sessionCredentialsStore: { hasCredentials: jest.fn(), clear: jest.fn() },
}));

jest.mock('./WhatsAppEventPublisher', () => ({
  WhatsAppEventPublisher: jest.fn().mockImplementation(() => ({
    sendWebhook: jest.fn().mockResolvedValue(undefined),
    sendForceDisconnectWebhook: jest.fn().mockResolvedValue(undefined),
    testWebhook: jest.fn(),
    getWebhookUrl: () => undefined,
  })),
}));

jest.mock('./whatsapp-core/MessageHandler', () => ({
  __esModule: true,
  default: { processMessageWithAI: jest.fn() },
}));

jest.mock('./SessionRecoveryService', () => ({
  __esModule: true,
  default: { recoverSessionsWithSmartFiltering: jest.fn() },
}));

jest.mock('./SessionHealthCheckService', () => ({
  __esModule: true,
  default: {
    startMonitoring: jest.fn(),
    stopMonitoring: jest.fn(),
    onAlert: jest.fn(),
    offAlert: jest.fn(),
  },
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import service from './WhatsAppServiceSimple';

/** Drains the microtask queue so a pending await is observably pending. */
const flushMicrotasks = () => new Promise(resolve => setImmediate(resolve));

describe('WhatsAppServiceSimple delegation invariants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockReturnValue(null);
    mockRedisSet.mockResolvedValue('OK');
    mockRedisDel.mockResolvedValue(undefined);
    mockSaveSession.mockResolvedValue(true);
    mockDeactivateSession.mockResolvedValue(true);
    mockCreateSession.mockResolvedValue({ id: 's1', status: 'connecting' });
    mockDestroySession.mockResolvedValue(undefined);
    mockShutdownAll.mockResolvedValue(undefined);
  });

  it('waits_for_the_session_row_before_the_socket_is_created', async () => {
    // whatsapp_auth_keys.session_id is a foreign key onto
    // whatsapp_sessions(session_id), and Baileys writes creds during the
    // handshake. Creating the socket first means the very first creds.update
    // fails on a constraint violation -- during pairing, where it reads as
    // "the QR did not work".
    //
    // Asserting call order alone would not catch it: `void persistSession(…)`
    // followed by `await createSession(…)` still calls them in that order
    // while reintroducing exactly this race. So the persist is held open and
    // the socket must not have been reached.
    let releasePersist!: () => void;
    mockSaveSession.mockImplementation(
      () =>
        new Promise(resolve => {
          releasePersist = () => resolve(true);
        })
    );

    const creating = service.createSession('s1', 'tenant-1');
    await flushMicrotasks();

    expect(mockSaveSession).toHaveBeenCalledTimes(1);
    expect(mockCreateSession).not.toHaveBeenCalled();

    releasePersist();
    await creating;

    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });

  it('does_not_open_a_socket_when_the_session_row_was_not_written', async () => {
    // saveSession catches its own errors and returns false, so ordering the
    // persist first buys nothing unless the result is checked. Unchecked, the
    // socket opens over a row that does not exist, the first creds.update
    // fails the foreign key inside a handler that swallows it, and the session
    // pairs and works while storing no credentials at all.
    mockSaveSession.mockResolvedValue(false);

    await expect(service.createSession('s1', 'tenant-1')).rejects.toThrow('Failed to persist');
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('carries_the_tenant_id_into_the_persisted_row', async () => {
    // PR5a-bis binds tenantId on first create. Dropping the argument during
    // the rewrite produces sessions with tenant_id NULL, which apps/api then
    // refuses to process -- every inbound message logged and discarded.
    //
    // Assert on saveSession's payload object, not on positional arguments:
    // persistSession's fourth parameter is authFileInfo, which disappears
    // with the auth layer, and expect.anything() does not match undefined.
    await service.createSession('s1', 'tenant-1');

    expect(mockSaveSession).toHaveBeenCalledTimes(1);
    expect(mockSaveSession.mock.calls[0][0]).toMatchObject({
      sessionId: 's1',
      tenantId: 'tenant-1',
    });
  });

  it('routes_shutdown_through_shutdownAll_and_delete_through_destroySession', async () => {
    // The Phase 1 bug in one line: shutdown() reaching a delete path is what
    // deactivated every session on every deploy. shutdownAll is the declared
    // entry point for it -- asserting destroySession here instead would pass
    // for an implementation that bypasses the interface.
    await service.shutdown();
    expect(mockShutdownAll).toHaveBeenCalledTimes(1);
    expect(mockDestroySession).not.toHaveBeenCalled();

    await service.destroySession('s1');
    expect(mockDestroySession).toHaveBeenCalledWith('s1', 'delete');
  });

  it('refuses_to_re_persist_a_live_session_row', async () => {
    // The engine's own `sockets.has` guard throws too, but only after
    // persistSession has already run -- and saveSession's update branch would
    // have reset the live row to 'connecting' and wiped its connectedNumber
    // on the way to that throw.
    mockGetSession.mockReturnValue({ id: 's1', status: 'ready' });

    await expect(service.createSession('s1', 'tenant-1')).rejects.toThrow('already exists');
    expect(mockSaveSession).not.toHaveBeenCalled();
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('refuses_to_re_persist_a_session_that_is_still_connecting', async () => {
    // A session mid-handshake, or between a close and its pending reconnect,
    // holds no `status === 'ready'` but is very much live. Guarding on 'ready'
    // alone passes every other test here: the manager's `sockets.has` would
    // still stop the second socket, but only after saveSession had already
    // reset the row.
    mockGetSession.mockReturnValue({ id: 's1', status: 'connecting' });

    await expect(service.createSession('s1', 'tenant-1')).rejects.toThrow('already exists');
    expect(mockSaveSession).not.toHaveBeenCalled();
  });

  it('the_losing_racer_does_not_release_the_winners_lock', async () => {
    // SET NX returning null means someone else holds session:lock:<id>. The
    // failure path used to DEL it unconditionally, so the loser erased the
    // winner's lock and a third concurrent create walked straight into the
    // manager's `sockets.has` TOCTOU.
    mockRedisSet.mockResolvedValue(null);

    await expect(service.createSession('s1', 'tenant-1')).rejects.toThrow(
      'already being initialized'
    );
    expect(mockRedisDel).not.toHaveBeenCalled();
  });

  it('releases_its_own_lock_when_the_create_fails', async () => {
    // The other half: a lock this call did take must not be left to sit out
    // its 300 s TTL after a failure, or the retry is locked out of its own
    // session.
    mockCreateSession.mockRejectedValue(new Error('socket boom'));

    await expect(service.createSession('s1', 'tenant-1')).rejects.toThrow('socket boom');
    expect(mockRedisDel).toHaveBeenCalledWith('session:lock:s1');
  });

  it('still_creates_a_session_that_was_paused_or_gave_up', async () => {
    // The counterpart to the guard above: forceDisconnect and an exhausted
    // reconnect budget both leave the session in the map with no socket. The
    // dashboard's reconnect button goes back through createSession, so a
    // guard on mere presence would make a paused session unrecoverable.
    mockGetSession.mockReturnValue({ id: 's1', status: 'disconnected' });

    await service.createSession('s1', 'tenant-1');

    expect(mockCreateSession).toHaveBeenCalledWith('s1', 'tenant-1');
  });
});
