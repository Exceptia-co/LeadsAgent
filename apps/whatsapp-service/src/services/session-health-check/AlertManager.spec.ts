import { AlertManager, type HealthAlert } from './AlertManager';

describe('AlertManager.registerAlertCallback', () => {
  let manager: AlertManager;

  beforeEach(() => {
    manager = new AlertManager();
  });

  test('registers a callback once and dedupes by identity on a second register', () => {
    const cb = (_a: HealthAlert) => {
      /* noop */
    };

    manager.registerAlertCallback(cb);
    manager.registerAlertCallback(cb);
    manager.registerAlertCallback(cb);

    // Use the documented inverse method as the observable: removing once must
    // leave zero registrations; removing again must be a no-op.
    manager.removeAlertCallback(cb);
    // Re-add and remove to confirm the count was 1 after the dedupe, not 3.
    manager.registerAlertCallback(cb);
    manager.removeAlertCallback(cb);

    // No-op remove should not throw.
    expect(() => manager.removeAlertCallback(cb)).not.toThrow();
  });

  test('treats different function references as different callbacks', () => {
    const a = (_alert: HealthAlert) => {
      /* noop */
    };
    const b = (_alert: HealthAlert) => {
      /* noop */
    };

    manager.registerAlertCallback(a);
    manager.registerAlertCallback(b);

    // Removing one must not affect the other.
    manager.removeAlertCallback(a);
    expect(() => manager.removeAlertCallback(b)).not.toThrow();
  });
});
