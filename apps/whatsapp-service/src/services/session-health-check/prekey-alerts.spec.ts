import { AlertManager } from './AlertManager';
import { HealthMetrics } from './HealthMetrics';
import type { SessionMetrics, HealthCheckOptions } from './HealthMetrics';
import type { SessionHealthStatus } from './DiagnosticsEngine';
import { sessionCredentialsStore } from '../session-credentials/SessionCredentialsStore';
import { SESSION_CONSTANTS } from '../../config/session-constants';

jest.mock('../session-credentials/SessionCredentialsStore', () => ({
  sessionCredentialsStore: { countPreKeys: jest.fn(), hasCredentials: jest.fn() },
}));

jest.mock('../SessionPersistenceService', () => ({
  __esModule: true,
  default: { updateSessionStatus: jest.fn().mockResolvedValue(true), prisma: {} },
}));

const countPreKeys = sessionCredentialsStore.countPreKeys as jest.Mock;

function metrics(overrides: Partial<SessionMetrics> = {}): SessionMetrics {
  return {
    responseTimeMs: 0,
    isConnected: true,
    isAuthenticated: true,
    authFileHealth: 'valid',
    preKeyCount: 30,
    consecutiveFailures: 0,
    uptime: 0,
    messagesSent24h: 0,
    messagesReceived24h: 0,
    ...overrides,
  };
}

function health(
  overrides: Partial<SessionMetrics> = {},
  status: SessionHealthStatus['status'] = 'healthy'
): SessionHealthStatus {
  return {
    sessionId: 'sess-1',
    status,
    lastCheckTime: new Date(),
    metrics: metrics(overrides),
    issues: [],
    recommendations: [],
  };
}

/** Which of the two pre-key rules fire for this health snapshot. */
function firing(h: SessionHealthStatus): string[] {
  const manager = new AlertManager() as any;
  return [...manager.alertRules.values()]
    .filter((r: any) => r.id.startsWith('pre-keys') && r.condition(h))
    .map((r: any) => r.id);
}

/** countPreKeys reads none of these; they exist to satisfy the constructor. */
const OPTIONS = {
  enablePingTests: false,
  connectionTimeoutMs: 1000,
  responseTimeoutMs: 1000,
  maxConsecutiveFailures: 3,
  alertThresholds: { responseTime: 5000, failureRate: 0.5 },
} as unknown as HealthCheckOptions;

beforeEach(() => jest.clearAllMocks());

describe('pre-key exhaustion alerts', () => {
  it('screams when a connected session has no pre-keys left', () => {
    // The failure this exists for: the socket is open, every existing chat
    // works, and only numbers the session has never spoken to fail. Nothing
    // else in the health model looks at this.
    expect(firing(health({ preKeyCount: 0 }))).toContain('pre-keys-exhausted');
  });

  it('warns below the threshold Baileys itself replenishes at', () => {
    const low = SESSION_CONSTANTS.MIN_PRE_KEY_COUNT - 1;
    expect(firing(health({ preKeyCount: low }))).toEqual(['pre-keys-low']);
  });

  it('says nothing at a healthy stock', () => {
    expect(firing(health({ preKeyCount: 30 }))).toEqual([]);
  });

  it('does not treat an unreadable count as an empty one', () => {
    // -1 means the COUNT query failed. Firing "no pre-keys left" off a
    // Postgres blip would train whoever reads these alerts to ignore them.
    expect(firing(health({ preKeyCount: -1 }))).toEqual([]);
  });

  it('stays quiet for a disconnected session', () => {
    // It has its own alert, and a disconnected session has no pre-keys in
    // play. Raising both buries the cause under the symptom.
    expect(firing(health({ preKeyCount: 0, isConnected: false }))).toEqual([]);
  });

  it('raises exactly one of the two, never both', () => {
    expect(firing(health({ preKeyCount: 0 }))).toEqual(['pre-keys-exhausted']);
  });
});

describe('escalation through the real AlertManager', () => {
  /** Rule ids raised by one evaluation pass. */
  async function raise(manager: AlertManager, h: SessionHealthStatus): Promise<string[]> {
    const alerts = await manager.evaluateAndGenerateAlerts(h);
    return alerts.map(a => a.metadata?.ruleId);
  }

  it('reports reaching zero even after it already warned at four', async () => {
    // The bug this pins: deduplication used to match on `type`, and both
    // pre-key rules are `auth`. The warning at 4 keys made the critical
    // alert at 0 unreachable -- the alert system silently swallowed the
    // escalation it exists to report.
    //
    // `warning`/`critical`, never `healthy`: a healthy verdict auto-resolves
    // every alert for the session, which would clear the low alert between
    // the two passes and let this test pass under the very bug it exists to
    // catch. DiagnosticsEngine does not report healthy for a session with
    // issues anyway, so the honest fixture is also the discriminating one.
    const manager = new AlertManager();

    expect(await raise(manager, health({ preKeyCount: 4 }, 'warning'))).toContain('pre-keys-low');
    expect(await raise(manager, health({ preKeyCount: 0 }, 'critical'))).toContain(
      'pre-keys-exhausted'
    );
  });

  it('reports crossing into critical response time after warning at high', async () => {
    // The same escalation, on the rules that had the bug before these ever
    // existed: high and critical response time are both `performance`.
    const manager = new AlertManager();

    expect(await raise(manager, health({ responseTimeMs: 6000 }, 'warning'))).toContain(
      'high-response-time'
    );
    expect(await raise(manager, health({ responseTimeMs: 31000 }, 'critical'))).toContain(
      'critical-response-time'
    );
  });

  it('raises only the critical band for a response time already past 30s', async () => {
    // The bands partition the range: an unbounded `high` rule would fire
    // here too, reporting one slow response as two problems.
    const manager = new AlertManager();

    const raised = await raise(manager, health({ responseTimeMs: 31000 }, 'critical'));
    expect(raised).toContain('critical-response-time');
    expect(raised).not.toContain('high-response-time');
  });

  it('does not repeat a rule that is still unresolved', async () => {
    // The other half: per-rule matching must not make a persisting problem
    // re-alert on every sweep. `critical`, not `healthy`, because that is
    // what a session at zero pre-keys actually reports -- evaluatePreKeyStock
    // pushes an issue, and a healthy verdict auto-resolves every alert for
    // the session, which is a different code path than the one under test.
    const manager = new AlertManager();
    const broken = () => health({ preKeyCount: 0 }, 'critical');

    expect(await raise(manager, broken())).toContain('pre-keys-exhausted');
    expect(await raise(manager, broken())).toEqual([]);
  });

  it('re-alerts after recovery instead of sitting out the cooldown', async () => {
    // Raised, recovered, broken again inside the 15-minute cooldown. The
    // cooldown exists to stop an ongoing problem from re-alerting every
    // sweep; the unresolved-alert check above already does that. Left
    // standing past the resolve, it swallows the recurrence -- and a session
    // that breaks, recovers and breaks again is more interesting than one
    // that simply stays broken.
    const manager = new AlertManager();

    expect(await raise(manager, health({ preKeyCount: 0 }, 'critical'))).toContain(
      'pre-keys-exhausted'
    );
    await raise(manager, health({ preKeyCount: 30 })); // healthy -> auto-resolves
    expect(await raise(manager, health({ preKeyCount: 0 }, 'critical'))).toContain(
      'pre-keys-exhausted'
    );
  });

  it('lets an unrelated alert through while a pre-key alert stands', async () => {
    // `auth-missing` is also type `auth`. Under the old matching it and the
    // pre-key rules blocked each other in whichever order they arrived.
    const manager = new AlertManager();

    await raise(manager, health({ preKeyCount: 0 }, 'critical'));
    const second = await raise(
      manager,
      health({ preKeyCount: 0, authFileHealth: 'missing' }, 'critical')
    );

    expect(second).toContain('auth-missing');
  });
});

describe('HealthMetrics pre-key collection', () => {
  it('reports the stored count', async () => {
    countPreKeys.mockResolvedValue(17);
    await expect(new HealthMetrics(OPTIONS).countPreKeys('sess-1')).resolves.toBe(17);
  });

  it('degrades a failed read to -1 instead of throwing', async () => {
    // It runs inside the periodic sweep: one unreadable number must not
    // abort metrics collection for the whole session.
    countPreKeys.mockRejectedValue(new Error('pool timeout'));
    await expect(new HealthMetrics(OPTIONS).countPreKeys('sess-1')).resolves.toBe(-1);
  });
});
