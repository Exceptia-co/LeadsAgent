import { RecoveryRunner } from './RecoveryRunner';
import type { RecoveryOptions } from './RecoveryRunner';
import { sessionCredentialsStore } from '../session-credentials/SessionCredentialsStore';
import SessionPersistenceService from '../SessionPersistenceService';

jest.mock('../session-credentials/SessionCredentialsStore', () => ({
  sessionCredentialsStore: { hasCredentials: jest.fn() },
}));

jest.mock('../SessionPersistenceService', () => ({
  __esModule: true,
  default: { updateSessionStatus: jest.fn().mockResolvedValue(true) },
}));

const hasCredentials = sessionCredentialsStore.hasCredentials as jest.Mock;
const updateSessionStatus = SessionPersistenceService.updateSessionStatus as jest.Mock;

const OPTIONS: RecoveryOptions = {
  maxRetries: 1,
  retryDelayMs: 0,
  maxReconnectAttempts: 5,
  timeoutMs: 1000,
  validateAuthFiles: true,
  maxConcurrentRecoveries: 1,
};

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'sess-1',
    status: 'disconnected',
    lastSeen: new Date(),
    ...overrides,
  } as any;
}

/** A service whose createSession would resolve — so a skip is visible as "never called". */
function makeService() {
  return {
    getSessionStatus: jest.fn().mockResolvedValue(null),
    createSession: jest.fn().mockResolvedValue({ id: 'sess-1' }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  updateSessionStatus.mockResolvedValue(true);
});

describe('RecoveryRunner credential gate', () => {
  it('does not start a session that has no stored credentials', async () => {
    // Baileys mints a fresh identity when it finds no credentials, then sits
    // emitting QR codes at a screen nobody is watching. One live socket per
    // unpaired session, for as long as the process runs.
    hasCredentials.mockResolvedValue(false);
    const service = makeService();

    const result = await new RecoveryRunner().executeSessionRecovery(
      service,
      sessionRow(),
      OPTIONS
    );

    expect(service.createSession).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toMatch(/credentials/i);
  });

  it('marks a credential-less session disconnected without latching it', async () => {
    // Two things at once. The row may still say `ready` from before the
    // restart, and leaving it would show a connected session with no socket.
    // But the generic skip path writes `autoReconnect: false`, which bars
    // the session from every future recovery -- "needs a QR" is not "never
    // try again", and latching here turns a one-click pairing into a manual
    // database edit. So: status, and nothing else.
    hasCredentials.mockResolvedValue(false);

    await new RecoveryRunner().executeSessionRecovery(
      makeService(),
      sessionRow({ status: 'ready' }),
      OPTIONS
    );

    expect(updateSessionStatus).toHaveBeenCalledTimes(1);
    const [id, status, extra] = updateSessionStatus.mock.calls[0];
    expect(id).toBe('sess-1');
    expect(status).toBe('disconnected');
    // No third argument at all: any payload here risks carrying a latch.
    expect(extra).toBeUndefined();
  });

  it('skips without latching when the credential lookup itself fails', async () => {
    // A pooler timeout means *unknown*, not "no credentials". Swallowing it
    // into `false` would be survivable; writing autoReconnect:false off the
    // back of it would not.
    hasCredentials.mockRejectedValue(new Error('pool timeout'));
    const service = makeService();

    const result = await new RecoveryRunner().executeSessionRecovery(
      service,
      sessionRow(),
      OPTIONS
    );

    expect(service.createSession).not.toHaveBeenCalled();
    // Not even the `disconnected` write the missing-credentials branch does:
    // we do not know that the session is disconnected, only that we could
    // not find out.
    expect(updateSessionStatus).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
  });

  it('proceeds to the recovery decision when credentials are present', async () => {
    // The gate must not become the reason nothing ever recovers.
    hasCredentials.mockResolvedValue(true);
    const service = makeService();

    const result = await new RecoveryRunner().executeSessionRecovery(
      service,
      sessionRow(),
      OPTIONS
    );

    expect(service.createSession).toHaveBeenCalledWith('sess-1');
    expect(result.skipped).toBeFalsy();
  });

  it('recovers a session that was alive seconds before the restart', async () => {
    // The case boot recovery exists for, and the one a "lastSeen is under a
    // minute old, it might still be starting up" check skipped every time:
    // a pm2 restart takes 15-30s, so a healthy session's row is always
    // seconds old when the process comes back with an empty session map.
    hasCredentials.mockResolvedValue(true);
    const service = makeService();

    const result = await new RecoveryRunner().executeSessionRecovery(
      service,
      sessionRow({ lastSeen: new Date(Date.now() - 5000) }),
      OPTIONS
    );

    expect(service.createSession).toHaveBeenCalledWith('sess-1');
    expect(result.skipped).toBeFalsy();
  });

  it('leaves a session that is already live in memory alone', async () => {
    // The exact liveness check the clock heuristic was standing in for.
    hasCredentials.mockResolvedValue(true);
    const service = makeService();
    service.getSessionStatus.mockResolvedValue({ id: 'sess-1', status: 'ready' });

    const result = await new RecoveryRunner().executeSessionRecovery(
      service,
      sessionRow(),
      OPTIONS
    );

    expect(service.createSession).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('does not bar a session from future recovery when it merely skips one', async () => {
    // `autoReconnect: false` means "the user does not want this session
    // reconnected" -- standing intent, not a verdict this function reached.
    // shouldRecoverSession re-derives its answer from the row every boot, so
    // writing the flag here only made time-bounded reasons permanent: being
    // "manually disconnected recently" stops being true after 30 minutes.
    hasCredentials.mockResolvedValue(true);

    await new RecoveryRunner().executeSessionRecovery(
      makeService(),
      sessionRow({
        metadata: { manualDisconnect: true, lastDisconnectTime: new Date().toISOString() },
      }),
      OPTIONS
    );

    const written = updateSessionStatus.mock.calls[0][2];
    expect(written.metadata).not.toHaveProperty('autoReconnect', false);
    // The reason is still recorded -- this drops the latch, not the diagnosis.
    expect(written.metadata.recoverySkipReason).toMatch(/manually disconnected/i);
  });

  it('recovers a session whose last error was a transient timeout', async () => {
    // 'timeout' used to sit in a permanent-failure list, matched as a
    // substring. A pooler wobble writing 'pool timeout' into last_error
    // therefore marked the session permanently unrecoverable — the exact
    // opposite of what a timeout means.
    hasCredentials.mockResolvedValue(true);
    const service = makeService();

    const result = await new RecoveryRunner().executeSessionRecovery(
      service,
      sessionRow({ lastError: 'pool timeout' }),
      OPTIONS
    );

    expect(service.createSession).toHaveBeenCalledWith('sess-1');
    expect(result.skipped).toBeFalsy();
  });

  it('recovers a session that merely raised an auth alert', async () => {
    // `lastAlertType: 'auth'` is what AlertManager writes when pre-keys run
    // low — a session that needs watching, not one that must never be
    // reconnected. The old branch compared against 'authentication', which
    // nothing writes, so it never fired; repairing that comparison instead of
    // deleting it would have turned every pre-key warning into a recovery ban.
    hasCredentials.mockResolvedValue(true);
    const service = makeService();

    const result = await new RecoveryRunner().executeSessionRecovery(
      service,
      sessionRow({ metadata: { lastAlertType: 'auth' } }),
      OPTIONS
    );

    expect(service.createSession).toHaveBeenCalledWith('sess-1');
    expect(result.skipped).toBeFalsy();
  });

  it('still refuses a credentialled session the user closed on purpose', async () => {
    // The credential gate runs first, so this proves it did not swallow the
    // checks behind it: a force-disconnected row stays skipped.
    hasCredentials.mockResolvedValue(true);
    const service = makeService();

    const result = await new RecoveryRunner().executeSessionRecovery(
      service,
      sessionRow({ lastError: 'Force disconnected by user' }),
      OPTIONS
    );

    expect(service.createSession).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toMatch(/closed by user/i);
  });
});
