const mockSetNX = jest.fn();
const mockCheckPhone = jest.fn();
const mockProcessWithAI = jest.fn();
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

// A stand-in for the reply port. The pipeline must never call it -- it only
// forwards it -- so a bare object with an identity is enough.
const PORT = { id: 'fake-port' } as any;

function makePipeline() {
  return new IncomingMessagePipeline({
    authChecker: { checkPhoneNumberAllowedWithLog: mockCheckPhone } as any,
    messageHandler: { processMessageWithAI: mockProcessWithAI } as any,
    sessionManager: { updateSessionStatus: mockUpdateStatus } as any,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSetNX.mockResolvedValue(true);
  mockCheckPhone.mockResolvedValue({ allowed: true });
  mockProcessWithAI.mockResolvedValue(undefined);
  mockUpdateStatus.mockResolvedValue(undefined);
});

describe('IncomingMessagePipeline', () => {
  it('processes_authorized_inbound_message', async () => {
    const message = dto();

    await makePipeline().handle(message, PORT);

    expect(mockCheckPhone).toHaveBeenCalledWith(SENDER, SESSION_ID, 'hola');
    expect(mockProcessWithAI).toHaveBeenCalledTimes(1);
    // Identity, not deep equality: toHaveBeenCalledWith would also pass for a
    // reconstructed clone of the DTO. .toBe proves the pipeline forwards the
    // very same object it received -- and the same transport handle -- rather
    // than a lookalike, which is the thing this test exists to catch.
    expect(mockProcessWithAI.mock.calls[0][0]).toBe(message);
    expect(mockProcessWithAI.mock.calls[0][1]).toBe(PORT);
  });

  it('deduplicates_same_message_id_before_authorization_and_ai', async () => {
    const pipeline = makePipeline();
    mockSetNX.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await pipeline.handle(dto(), PORT);
    await pipeline.handle(dto(), PORT);

    expect(mockSetNX).toHaveBeenCalledTimes(2);
    expect(mockCheckPhone).toHaveBeenCalledTimes(1);
    expect(mockProcessWithAI).toHaveBeenCalledTimes(1);
  });

  it('builds_the_dedupe_key_from_dto_id_and_applies_the_ttl', async () => {
    // The pipeline only concatenates REDIS_KEYS.MESSAGE_DEDUP with dto.id -- it
    // never reads dto.sessionId itself, so this only proves that much: the key
    // prefix and the TTL. Session-scoping is a property of dto.id, produced by
    // the normalizer -- see baileys-normalizer.spec.ts's
    // prefixes_the_dto_id_with_the_session_it_was_normalized_for for the test
    // that actually exercises where the session prefix is introduced.
    await makePipeline().handle(dto(), PORT);

    expect(mockSetNX).toHaveBeenCalledWith(`whatsapp:dedup:${SESSION_ID}:ABC123`, '1', 300);
  });

  it('skips_ai_when_sender_is_not_allowed', async () => {
    mockCheckPhone.mockResolvedValue({ allowed: false, reason: 'not whitelisted' });

    await makePipeline().handle(dto(), PORT);

    expect(mockProcessWithAI).not.toHaveBeenCalled();
  });

  it('drops_group_messages_before_authorization', async () => {
    const pipeline = makePipeline();

    await pipeline.handle(dto({ isGroup: true }), PORT);

    expect(mockCheckPhone).not.toHaveBeenCalled();
    expect(mockProcessWithAI).not.toHaveBeenCalled();
  });

  it('skips_ai_for_own_and_blank_text_messages', async () => {
    const pipeline = makePipeline();

    await pipeline.handle(dto({ fromMe: true }), PORT);
    await pipeline.handle(dto({ text: '   ' }), PORT);

    expect(mockCheckPhone).not.toHaveBeenCalled();
    expect(mockProcessWithAI).not.toHaveBeenCalled();
  });
});
