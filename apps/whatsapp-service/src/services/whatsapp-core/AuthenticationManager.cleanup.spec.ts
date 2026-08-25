// Real filesystem coverage for cleanupSessionAuth's fix for the double
// 'session-' prefix bug. SessionCleanupUtil is intentionally NOT mocked here:
// the bug was in what got passed to it, so a mock of it would only prove the
// mock was called, not that the right path was deleted -- the same vacuous
// assertion problem this test exists to avoid.
import fs from 'fs';
import os from 'os';
import path from 'path';

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { AuthenticationManager } from './AuthenticationManager';

describe('AuthenticationManager.cleanupSessionAuth (real filesystem)', () => {
  let tempDir: string;
  let manager: AuthenticationManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wwebjs-auth-test-'));
    manager = new AuthenticationManager();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('deletes the real session-<id> auth directory on disk', async () => {
    const sessionId = 'cleanup-smoke';
    const sessionAuthPath = path.join(tempDir, `session-${sessionId}`);
    fs.mkdirSync(sessionAuthPath, { recursive: true });
    fs.writeFileSync(path.join(sessionAuthPath, 'Default'), 'fake-auth-data');
    expect(fs.existsSync(sessionAuthPath)).toBe(true);

    await manager.cleanupSessionAuth(sessionId, tempDir);

    expect(fs.existsSync(sessionAuthPath)).toBe(false);
  });
});
