import { AlertManager, type HealthAlert } from './AlertManager';

// Helper that pierces TS privacy to read the actual registered-callback array.
// The dedupe contract is "same reference is stored once" — observing the array
// length is the cleanest proof; `removeAlertCallback` is non-throwing by
// design and would not signal a duplicate-registration bug on its own.
function callbackCount(manager: AlertManager): number {
  return (manager as unknown as { alertCallbacks: unknown[] }).alertCallbacks.length;
}

describe('AlertManager.registerAlertCallback dedupe', () => {
  let manager: AlertManager;

  beforeEach(() => {
    manager = new AlertManager();
  });

  test('registering the same reference multiple times keeps a single entry', () => {
    const cb = (_a: HealthAlert) => {
      /* noop */
    };

    expect(callbackCount(manager)).toBe(0);
    manager.registerAlertCallback(cb);
    expect(callbackCount(manager)).toBe(1);
    manager.registerAlertCallback(cb);
    manager.registerAlertCallback(cb);
    expect(callbackCount(manager)).toBe(1);
  });

  test('different function references count as different callbacks', () => {
    const a = (_alert: HealthAlert) => {
      /* noop */
    };
    const b = (_alert: HealthAlert) => {
      /* noop */
    };

    manager.registerAlertCallback(a);
    manager.registerAlertCallback(b);
    expect(callbackCount(manager)).toBe(2);

    // Removing one must not touch the other.
    manager.removeAlertCallback(a);
    expect(callbackCount(manager)).toBe(1);
  });

  test('a deduped callback is invoked exactly once per alert dispatch', async () => {
    const cb = jest.fn();
    manager.registerAlertCallback(cb);
    manager.registerAlertCallback(cb);
    manager.registerAlertCallback(cb);
    expect(callbackCount(manager)).toBe(1);

    // Drive the private dispatcher used when alerts trigger. The DB write
    // inside is wrapped in its own try/catch in the implementation, so any
    // failure surfaces as a log line — it does not abort the callback fan-out
    // we want to observe here.
    const fakeAlert: HealthAlert = {
      id: 'test-1',
      sessionId: 'sess-1',
      type: 'connection',
      severity: 'low',
      message: 'noop',
      timestamp: new Date(),
      resolved: false,
      recommendation: 'noop',
    };
    const dispatch = (
      manager as unknown as { sendAlertNotifications: (a: HealthAlert) => Promise<void> }
    ).sendAlertNotifications.bind(manager);
    await dispatch(fakeAlert);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(fakeAlert);
  });
});
