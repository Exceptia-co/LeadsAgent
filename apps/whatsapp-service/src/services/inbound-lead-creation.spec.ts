/**
 * An inbound message from an unknown number has to leave a Lead behind.
 *
 * It did not: the live path called `authorize()`, which only reads, while
 * `authorizeAndManageLead()` — the one that creates — had no caller anywhere
 * in the tree. So the message was authorised, answered by the AI, and
 * persisted with `leadId: null`, because DatabaseService.saveConversation
 * looks the lead up and takes `?? null` when it finds none. 14% of
 * production rows, invisible to every JOIN-based reader.
 */
const authorize = jest.fn();
const authorizeAndManageLead = jest.fn();

jest.mock('./WhatsAppAuthorizationService', () => ({
  __esModule: true,
  default: { authorize, authorizeAndManageLead },
}));

jest.mock('./DatabaseService', () => ({
  __esModule: true,
  default: { getSessionTenantId: jest.fn().mockResolvedValue('tenant-1') },
}));

import WhatsAppServiceSimple from './WhatsAppServiceSimple';

/** The private method the inbound pipeline calls. */
const check = (phone: string): Promise<{ allowed: boolean; leadInfo?: any }> =>
  (WhatsAppServiceSimple as any).checkPhoneNumberAllowedWithLog(phone, 'sess-1', 'hola');

const ALLOWED = {
  authorization: { decision: 'ALLOWED', reason: 'ok', leadInfo: undefined },
  lead: { id: 'lead-new', phone: '34600111222' },
  leadCreated: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  authorizeAndManageLead.mockResolvedValue(ALLOWED);
});

describe('inbound authorization creates the lead', () => {
  it('goes through the path that can create a lead', async () => {
    await check('34600111222');

    expect(authorizeAndManageLead).toHaveBeenCalledTimes(1);
    // The read-only call is the regression: it authorises without creating.
    expect(authorize).not.toHaveBeenCalled();
  });

  it('passes the tenant and a source so the row is attributable', async () => {
    await check('34600111222');

    expect(authorizeAndManageLead).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', leadSource: 'whatsapp-inbound' })
    );
  });

  it('returns the lead it just created', async () => {
    // Not asserted for its own sake: the pipeline hands this on, and a
    // created lead that is not returned looks identical to no lead at all.
    await expect(check('34600111222')).resolves.toMatchObject({
      allowed: true,
      leadInfo: { id: 'lead-new' },
    });
  });

  it('falls back to the looked-up lead when nothing was created', async () => {
    authorizeAndManageLead.mockResolvedValue({
      authorization: { decision: 'ALLOWED', reason: 'known', leadInfo: { id: 'lead-old' } },
    });

    await expect(check('34600111222')).resolves.toMatchObject({
      leadInfo: { id: 'lead-old' },
    });
  });

  it('still blocks a number the authorization refuses', async () => {
    // Creating leads must not become "authorise everything".
    authorizeAndManageLead.mockResolvedValue({
      authorization: { decision: 'BLOCKED', reason: 'blacklisted' },
    });

    await expect(check('34600111222')).resolves.toMatchObject({
      allowed: false,
      reason: 'blacklisted',
    });
  });

  it('refuses to process an authorized number it could not attach a lead to', async () => {
    // authorizeAndManageLead reports a failed creation by RETURNING
    // `{ error }`, not by throwing. Waved through, the contact gets an AI
    // reply and the exchange is persisted against no lead — the very hole
    // this call was swapped in to close, reopened on the failure path.
    authorizeAndManageLead.mockResolvedValue({
      authorization: { decision: 'ALLOWED', reason: 'ok' },
      error: 'lead create failed',
    });

    await expect(check('34600111222')).resolves.toMatchObject({
      allowed: false,
      reason: 'lead create failed',
    });
  });

  it('fails closed when authorization throws', async () => {
    authorizeAndManageLead.mockRejectedValue(new Error('db down'));

    await expect(check('34600111222')).resolves.toMatchObject({ allowed: false });
  });
});
