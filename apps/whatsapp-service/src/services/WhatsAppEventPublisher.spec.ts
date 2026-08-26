const mockNotifySocketEvent = jest.fn();
const mockSignServiceRequest = jest.fn();

jest.mock('./WhatsAppService', () => ({
  __esModule: true,
  default: { notifySocketEvent: (...args: unknown[]) => mockNotifySocketEvent(...args) },
}));

jest.mock('../middleware/auth', () => ({
  signServiceRequest: (...args: unknown[]) => mockSignServiceRequest(...args),
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { WhatsAppEventPublisher } from './WhatsAppEventPublisher';

const URL = 'https://api.example.test/api/whatsapp/webhook';

function payload() {
  return {
    event: 'message' as const,
    sessionId: 's1',
    data: { id: 's1:ABC', from: '34600000000', body: 'hola' },
    timestamp: '2026-08-25T10:00:00.000Z',
  };
}

let fetchMock: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.WHATSAPP_SERVICE_HMAC_SECRET = 'a'.repeat(64);
  mockNotifySocketEvent.mockResolvedValue(undefined);
  mockSignServiceRequest.mockReturnValue({ timestamp: '1756000000', signature: 'deadbeef' });
  fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
  (global as any).fetch = fetchMock;
});

describe('WhatsAppEventPublisher', () => {
  it('signs_the_exact_body_it_sends', async () => {
    // The API verifies the HMAC over the raw body. Signing a re-serialized
    // object would produce a different byte string for the same data and
    // every webhook would 401 -- which no local test would catch, because
    // the signature is only checked on the other side of the network.
    //
    // "signed string equals sent string" alone is not enough -- `const body =
    // '{}'` satisfies it and delivers nothing. The payload has to be pinned
    // as well, or the test proves only internal consistency.
    const input = payload();
    await new WhatsAppEventPublisher(URL).sendWebhook(input as any);

    expect(mockSignServiceRequest).toHaveBeenCalledTimes(1);
    const signedBody = mockSignServiceRequest.mock.calls[0][0];
    expect(signedBody).toBe(JSON.stringify(input));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].body).toBe(signedBody);
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      'x-service-timestamp': '1756000000',
      'x-service-signature': 'deadbeef',
    });
  });

  it('emits_the_socket_event_before_the_http_webhook', async () => {
    // The dashboard reacts to Socket.IO; the API persists from the webhook.
    // Emitting after the HTTP round-trip would add its latency to every UI
    // update, and a slow webhook endpoint would look like a frozen dashboard.
    const order: string[] = [];
    mockNotifySocketEvent.mockImplementation(async () => {
      order.push('socket');
    });
    fetchMock.mockImplementation(async () => {
      order.push('http');
      return { ok: true, status: 200 };
    });

    await new WhatsAppEventPublisher(URL).sendWebhook(payload() as any);

    expect(order).toEqual(['socket', 'http']);
  });

  it('still_emits_the_socket_event_when_no_webhook_url_is_configured', async () => {
    await new WhatsAppEventPublisher(undefined).sendWebhook(payload() as any);

    expect(mockNotifySocketEvent).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses_to_send_unsigned_when_the_secret_is_missing', async () => {
    // Sending unsigned would be rejected by the API anyway, but silently:
    // the failure would look like a network problem rather than a
    // misconfiguration. Not sending at all keeps the cause visible.
    delete process.env.WHATSAPP_SERVICE_HMAC_SECRET;

    await new WhatsAppEventPublisher(URL).sendWebhook(payload() as any);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockNotifySocketEvent).toHaveBeenCalledTimes(1);
  });

  it('a_failing_webhook_does_not_throw', async () => {
    // WhatsApp traffic must not stop because the API is down.
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      new WhatsAppEventPublisher(URL).sendWebhook(payload() as any)
    ).resolves.toBeUndefined();
    // Resolving is also what a sendWebhook that skips the delivery entirely
    // does, so "did not throw" on its own proves nothing about the failure
    // being tolerated. The attempt is what makes this discriminate.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
