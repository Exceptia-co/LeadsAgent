import { SessionPersistenceService } from './SessionPersistenceService';

jest.mock('@leadcrm/db', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    whatsAppSession: { update: jest.fn().mockResolvedValue({}) },
  })),
}));

/**
 * The `lastError` column is a recovery latch, not a log line:
 * RecoveryRunner.shouldRecoverSession refuses any session whose lastError
 * matches "force disconnected by user", and BaileysSessionManager.onOpen is
 * the only thing that clears it -- by passing `null`.
 *
 * That clearing works only because this service tests `!== undefined` rather
 * than truthiness. A truthy check reads like the safer spelling and would
 * pass every other test in the suite, while silently restoring the bug where
 * one deliberate disconnect barred a session from recovery forever.
 */
describe('SessionPersistenceService.updateSessionStatus and lastError', () => {
  let service: SessionPersistenceService;
  let update: jest.Mock;

  beforeEach(() => {
    service = new SessionPersistenceService();
    update = service.prisma.whatsAppSession.update as unknown as jest.Mock;
    update.mockClear();
  });

  it('writes null to the column so a successful open clears the latch', async () => {
    await service.updateSessionStatus('sess-1', 'ready', { lastError: null });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data).toHaveProperty('lastError', null);
  });

  it('leaves the column alone when the caller says nothing about it', async () => {
    // Every other writer omits lastError and must not wipe a real error.
    await service.updateSessionStatus('sess-1', 'connecting', { qrCode: 'QR' });

    expect(update.mock.calls[0][0].data).not.toHaveProperty('lastError');
  });

  it('still writes a real error string', async () => {
    await service.updateSessionStatus('sess-1', 'disconnected', {
      lastError: 'Force disconnected by user',
    });

    expect(update.mock.calls[0][0].data.lastError).toBe('Force disconnected by user');
  });
});
