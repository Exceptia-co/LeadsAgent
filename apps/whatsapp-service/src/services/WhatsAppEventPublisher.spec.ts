const mockNotifySocketEvent = jest.fn();

jest.mock('./WhatsAppService', () => ({
  __esModule: true,
  default: { notifySocketEvent: (...args: unknown[]) => mockNotifySocketEvent(...args) },
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { WhatsAppEventPublisher } from './WhatsAppEventPublisher';

const ORIGINAL_HMAC_SECRET = process.env.WHATSAPP_SERVICE_HMAC_SECRET;

beforeEach(() => {
  jest.clearAllMocks();
  mockNotifySocketEvent.mockResolvedValue(undefined);
});

afterEach(() => {
  if (ORIGINAL_HMAC_SECRET === undefined) {
    delete process.env.WHATSAPP_SERVICE_HMAC_SECRET;
  } else {
    process.env.WHATSAPP_SERVICE_HMAC_SECRET = ORIGINAL_HMAC_SECRET;
  }
});

describe('WhatsAppEventPublisher', () => {
  it('emits over Socket.IO and never over HTTP, even when handed a URL', async () => {
    // Constructed the way the old code took its delivery target. It no longer
    // accepts one, so the cast is deliberate: it is what makes this test fail
    // if HTTP delivery ever comes back. Zero-arg construction cannot — the old
    // code returned early on a missing URL, so an unconfigured publisher was
    // already inert before this change.
    process.env.WHATSAPP_SERVICE_HMAC_SECRET = 'a'.repeat(64);
    const fetchSpy = jest.spyOn(global, 'fetch');

    const publisher = new (WhatsAppEventPublisher as unknown as new (url?: string) => WhatsAppEventPublisher)(
      'http://example.test/hook'
    );
    await publisher.sendWebhook({
      event: 'message',
      sessionId: 's1',
      data: { body: 'hola' },
      timestamp: new Date().toISOString(),
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
