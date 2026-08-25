const mockDeactivateSession = jest.fn().mockResolvedValue(true);
const mockUpdateSessionStatus = jest.fn().mockResolvedValue(true);
const mockLoadActiveSessions = jest.fn().mockResolvedValue([]);

jest.mock('../SessionPersistenceService', () => ({
  __esModule: true,
  default: {
    deactivateSession: (sessionId: string) => mockDeactivateSession(sessionId),
    updateSessionStatus: (...args: unknown[]) => mockUpdateSessionStatus(...args),
    loadActiveSessions: () => mockLoadActiveSessions(),
    saveSession: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { SessionManager } from './SessionManager';

const SESSION_ID = 'smoke-session';

function makeClient() {
  return { destroy: jest.fn().mockResolvedValue(undefined) } as any;
}

describe('SessionManager shutdown vs delete', () => {
  let manager: SessionManager;
  let cleanup: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks wipes call history but keeps implementations, so the
    // default must be restored or one test's override leaks into the next.
    mockLoadActiveSessions.mockResolvedValue([]);
    manager = new SessionManager();
    cleanup = jest.fn().mockResolvedValue(undefined);
    (manager as any).sessions.set(SESSION_ID, { id: SESSION_ID, status: 'ready' });
  });

  it('shutdown_does_not_deactivate_session_in_database', async () => {
    const clients = new Map([[SESSION_ID, makeClient()]]);

    await manager.shutdownAllSessions(clients);

    expect(mockDeactivateSession).not.toHaveBeenCalled();
  });

  it('shutdown_closes_the_client_and_delegates_in_shutdown_mode', async () => {
    const client = makeClient();
    const clients = new Map([[SESSION_ID, client]]);
    const destroySpy = jest.spyOn(manager, 'destroySession');

    await manager.shutdownAllSessions(clients);

    expect(client.destroy).toHaveBeenCalledTimes(1);
    // The 4th argument is the mode. Asserting it here is what makes the
    // no-cleanup guarantee real: shutdownAllSessions no longer accepts a
    // cleanup callback at all, so asserting "cleanup was not called" would
    // be true by construction and prove nothing.
    expect(destroySpy).toHaveBeenCalledWith(SESSION_ID, client, undefined, 'shutdown');
  });

  it('shutdown_sweep_does_not_touch_autoReconnect_either_way', async () => {
    const clients = new Map([[SESSION_ID, makeClient()]]);
    mockLoadActiveSessions.mockResolvedValue([{ sessionId: SESSION_ID, metadata: {} }]);

    await manager.shutdownAllSessions(clients);

    const [, , payload] = mockUpdateSessionStatus.mock.calls[0];
    // Not false (that is what barred recovery), and not true either: writing
    // true would resurrect sessions something else deliberately stopped.
    expect(payload.metadata).not.toHaveProperty('autoReconnect');
    expect(payload.metadata.shutdownReason).toBe('Server shutdown');
    // The payload omits lastError so a planned shutdown is not recorded as an
    // error. This asserts the payload shape only -- updateSessionStatus skips
    // undefined fields, so any previously persisted lastError is left alone,
    // which is deliberate.
    expect(payload).not.toHaveProperty('lastError');
  });

  it('shutdown_sweep_preserves_a_deliberate_do_not_reconnect_decision', async () => {
    const clients = new Map([[SESSION_ID, makeClient()]]);
    mockLoadActiveSessions.mockResolvedValue([
      {
        sessionId: SESSION_ID,
        metadata: { autoReconnect: false, forceDisconnected: true },
      },
    ]);

    await manager.shutdownAllSessions(clients);

    const [, , payload] = mockUpdateSessionStatus.mock.calls[0];
    // A session stopped on purpose must stay stopped across a restart.
    expect(payload.metadata.autoReconnect).toBe(false);
    expect(payload.metadata.forceDisconnected).toBe(true);
  });

  it('delete_deactivates_session_and_runs_auth_cleanup', async () => {
    await manager.destroySession(SESSION_ID, makeClient(), cleanup, 'delete');

    expect(mockDeactivateSession).toHaveBeenCalledWith(SESSION_ID);
    expect(cleanup).toHaveBeenCalledWith(SESSION_ID);
  });

  it('destroySession_defaults_to_delete_mode_for_existing_callers', async () => {
    await manager.destroySession(SESSION_ID, makeClient(), cleanup);

    expect(mockDeactivateSession).toHaveBeenCalledWith(SESSION_ID);
    expect(cleanup).toHaveBeenCalledWith(SESSION_ID);
  });
});
