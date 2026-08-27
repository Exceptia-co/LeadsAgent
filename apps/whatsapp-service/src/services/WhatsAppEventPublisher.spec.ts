const mockNotifySocketEvent = jest.fn();

jest.mock('./WhatsAppService', () => ({
  __esModule: true,
  default: { notifySocketEvent: (...args: unknown[]) => mockNotifySocketEvent(...args) },
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { WhatsAppEventPublisher } from './WhatsAppEventPublisher';

beforeEach(() => {
  jest.clearAllMocks();
  mockNotifySocketEvent.mockResolvedValue(undefined);
});

describe('WhatsAppEventPublisher', () => {
  it('emits over Socket.IO and never over HTTP', async () => {
    // The HTTP half delivered to exactly one endpoint, in the Nest API,
    // which is retired. Leaving a `fetch` here means a future WEBHOOK_URL
    // resumes POSTing events at whatever answers that address.
    const fetchSpy = jest.spyOn(global, 'fetch');

    await new WhatsAppEventPublisher().sendWebhook({
      event: 'message',
      sessionId: 's1',
      data: { body: 'hola' },
      timestamp: new Date().toISOString(),
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
