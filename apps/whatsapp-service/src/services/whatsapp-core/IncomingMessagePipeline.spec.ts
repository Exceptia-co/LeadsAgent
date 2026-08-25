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
    const message = dto();

    await makePipeline().handle(message, TRANSPORT);

    expect(mockCheckPhone).toHaveBeenCalledWith(SENDER, SESSION_ID, 'hola');
    expect(mockProcessWithAI).toHaveBeenCalledTimes(1);
    // Exact-value match, not objectContaining: proves the very same DTO the
    // pipeline received is what reaches the AI layer, not just a lookalike
    // with the three fields we happened to list.
    expect(mockProcessWithAI).toHaveBeenCalledWith(
      message,
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

  it('maps_the_dto_back_to_the_frozen_webhook_field_names', async () => {
    // apps/api reads `data.from`/`data.body` over an untyped HTTP boundary --
    // this pins the wire shape so a future edit that leaks the DTO's own
    // field names (senderPhone/text/...) onto the wire fails loudly here
    // instead of throwing `undefined.replace()` in production.
    await makePipeline().handle(dto(), TRANSPORT);

    expect(mockSendWebhook).toHaveBeenCalledTimes(1);
    const payload = mockSendWebhook.mock.calls[0][0];
    expect(payload.data).toEqual({
      id: `${SESSION_ID}:ABC123`,
      from: SENDER,
      to: '34999999999',
      body: 'hola',
      timestamp: 1756000000,
      type: 'text',
      isGroup: false,
      fromMe: false,
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
    // Same provider message id, two different sessions: this is the actual
    // seam the session-scoping fix protects. A version that dedupes globally
    // (by provider id alone) would produce the SAME key for both calls, so
    // this fails on the old behaviour and passes only when the key is
    // genuinely derived from dto.sessionId as well as the provider id.
    const pipeline = makePipeline();

    await pipeline.handle(dto({ sessionId: 's1', id: 's1:SAME_PROVIDER_ID' }), TRANSPORT);
    await pipeline.handle(dto({ sessionId: 's2', id: 's2:SAME_PROVIDER_ID' }), TRANSPORT);

    expect(mockSetNX).toHaveBeenCalledWith('whatsapp:dedup:s1:SAME_PROVIDER_ID', '1', 300);
    expect(mockSetNX).toHaveBeenCalledWith('whatsapp:dedup:s2:SAME_PROVIDER_ID', '1', 300);
    const [firstKey] = mockSetNX.mock.calls[0];
    const [secondKey] = mockSetNX.mock.calls[1];
    expect(firstKey).not.toBe(secondKey);
  });

  it('skips_ai_but_still_webhooks_when_sender_is_not_allowed', async () => {
    mockCheckPhone.mockResolvedValue({ allowed: false, reason: 'not whitelisted' });

    await makePipeline().handle(dto(), TRANSPORT);

    expect(mockProcessWithAI).not.toHaveBeenCalled();
    expect(mockSendWebhook).toHaveBeenCalledTimes(1);
  });

  it('drops_group_and_own_messages_before_authorization', async () => {
    const pipeline = makePipeline();

    // Group messages short-circuit before the webhook is ever sent.
    await pipeline.handle(dto({ isGroup: true }), TRANSPORT);
    expect(mockSendWebhook).toHaveBeenCalledTimes(0);

    // fromMe and blank-text only skip the AI branch -- the webhook still
    // fires for both, matching today's behaviour (only isGroup short-circuits
    // early; see Step 5's note in the brief).
    await pipeline.handle(dto({ fromMe: true }), TRANSPORT);
    expect(mockSendWebhook).toHaveBeenCalledTimes(1);

    await pipeline.handle(dto({ text: '   ' }), TRANSPORT);
    expect(mockSendWebhook).toHaveBeenCalledTimes(2);

    expect(mockCheckPhone).not.toHaveBeenCalled();
    expect(mockProcessWithAI).not.toHaveBeenCalled();
  });
});
