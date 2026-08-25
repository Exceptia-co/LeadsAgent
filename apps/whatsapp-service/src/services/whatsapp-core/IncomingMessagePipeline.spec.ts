const mockSetNX = jest.fn();
const mockCheckPhone = jest.fn();
const mockProcessWithAI = jest.fn();
const mockSendWebhook = jest.fn();
const mockUpdateStatus = jest.fn();

jest.mock('../../config/redis', () => ({
  redisClient: { setNX: (...args: unknown[]) => mockSetNX(...args) },
  REDIS_KEYS: { MESSAGE_DEDUP: 'whatsapp:dedup:' },
  REDIS_TTL: { MESSAGE_DEDUP_SECONDS: 300 },
  REDIS_CHANNELS: {},
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { IncomingMessagePipeline } from './IncomingMessagePipeline';
import type { NormalizedWhatsAppMessage } from '../../types/messages';

const SESSION_ID = 's1';
const SENDER = '34600000000';

function dto(overrides: Partial<NormalizedWhatsAppMessage> = {}): NormalizedWhatsAppMessage {
  return {
    id: `${SESSION_ID}:ABC123`,
    sessionId: SESSION_ID,
    senderPhone: SENDER,
    recipientPhone: '34999999999',
    text: 'hola',
    timestamp: 1756000000,
    type: 'text',
    isGroup: false,
    fromMe: false,
    ...overrides,
  };
}

// A stand-in for the library object. The pipeline must never look inside it,
// so anything with an identity we can assert on will do.
const TRANSPORT = { id: 'fake-transport' };

function makePipeline() {
  return new IncomingMessagePipeline<typeof TRANSPORT>({
    authChecker: { checkPhoneNumberAllowedWithLog: mockCheckPhone } as any,
    messageHandler: { processMessageWithAI: mockProcessWithAI } as any,
    sessionManager: { updateSessionStatus: mockUpdateStatus } as any,
    sendWebhook: mockSendWebhook,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSetNX.mockResolvedValue(true);
  mockCheckPhone.mockResolvedValue({ allowed: true });
  mockProcessWithAI.mockResolvedValue(undefined);
  mockSendWebhook.mockResolvedValue(undefined);
  mockUpdateStatus.mockResolvedValue(undefined);
});

describe('IncomingMessagePipeline', () => {
  it('processes_authorized_inbound_message_and_sends_one_webhook', async () => {
    await makePipeline().handle(dto(), TRANSPORT);

    expect(mockCheckPhone).toHaveBeenCalledWith(SENDER, SESSION_ID, 'hola');
    expect(mockProcessWithAI).toHaveBeenCalledTimes(1);
    expect(mockProcessWithAI).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        senderPhone: SENDER,
        text: 'hola',
      }),
      // The transport handle is threaded through untouched -- the pipeline
      // never inspects it, but the reply path downstream depends on it.
      TRANSPORT
    );
    expect(mockSendWebhook).toHaveBeenCalledTimes(1);
    expect(mockSendWebhook.mock.calls[0][0]).toMatchObject({
      event: 'message',
      sessionId: SESSION_ID,
    });
  });

  it('deduplicates_same_message_id_before_authorization_ai_and_webhook', async () => {
    const pipeline = makePipeline();
    mockSetNX.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await pipeline.handle(dto(), TRANSPORT);
    await pipeline.handle(dto(), TRANSPORT);

    expect(mockSetNX).toHaveBeenCalledTimes(2);
    expect(mockCheckPhone).toHaveBeenCalledTimes(1);
    expect(mockProcessWithAI).toHaveBeenCalledTimes(1);
    expect(mockSendWebhook).toHaveBeenCalledTimes(1);
  });

  it('scopes_the_dedupe_key_by_session', async () => {
    await makePipeline().handle(dto(), TRANSPORT);

    expect(mockSetNX).toHaveBeenCalledWith(`whatsapp:dedup:${SESSION_ID}:ABC123`, '1', 300);
  });

  it('skips_ai_but_still_webhooks_when_sender_is_not_allowed', async () => {
    mockCheckPhone.mockResolvedValue({ allowed: false, reason: 'not whitelisted' });

    await makePipeline().handle(dto(), TRANSPORT);

    expect(mockProcessWithAI).not.toHaveBeenCalled();
    expect(mockSendWebhook).toHaveBeenCalledTimes(1);
  });

  it('drops_group_and_own_messages_before_authorization', async () => {
    const pipeline = makePipeline();

    await pipeline.handle(dto({ isGroup: true }), TRANSPORT);
    await pipeline.handle(dto({ fromMe: true }), TRANSPORT);
    await pipeline.handle(dto({ text: '   ' }), TRANSPORT);

    expect(mockCheckPhone).not.toHaveBeenCalled();
    expect(mockProcessWithAI).not.toHaveBeenCalled();
  });
});
