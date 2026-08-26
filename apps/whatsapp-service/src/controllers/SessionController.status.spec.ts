import { mapStatusToDashboard } from './SessionController';

describe('mapStatusToDashboard', () => {
  describe('a session the engine is pairing', () => {
    it('advertises QR_READY while a QR is live, not CONNECTING', () => {
      // The regression this guards: reporting CONNECTING here makes the
      // dashboard poll unmount the QR the socket event just painted.
      expect(mapStatusToDashboard('connecting', true)).toBe('QR_READY');
    });

    it('stays CONNECTING between rotations, when no QR is held', () => {
      expect(mapStatusToDashboard('connecting', false)).toBe('CONNECTING');
    });
  });

  describe('a stale qr_code on a row the engine is not pairing', () => {
    // A deactivated session keeps the last qr_code it ever had. Advertising
    // it would ask the operator to scan a dead code.
    it.each([
      ['disconnected', 'DISCONNECTED'],
      ['ready', 'CONNECTED'],
      ['auth_failure', 'AUTH_INVALID'],
    ])('reports %s as %s even holding a QR', (status, expected) => {
      expect(mapStatusToDashboard(status, true)).toBe(expected);
    });
  });

  describe('the statuses the dashboard already knew', () => {
    it.each([
      ['ready', 'CONNECTED'],
      ['authenticated', 'CONNECTED'],
      ['connecting', 'CONNECTING'],
      ['disconnected', 'DISCONNECTED'],
      ['auth_failure', 'AUTH_INVALID'],
    ])('maps %s to %s', (status, expected) => {
      expect(mapStatusToDashboard(status)).toBe(expected);
    });

    it('falls back to QR_READY for a status it does not know', () => {
      expect(mapStatusToDashboard('qr_pending')).toBe('QR_READY');
    });
  });
});
