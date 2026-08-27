import type { NormalizedWhatsAppMessage } from '../../types/messages';
import type { ReplyPort } from '../../types/reply-port';

/**
 * The outer catch of `processMessageWithAI` answers the customer and used to
 * record nothing at all — the exchange happened on WhatsApp and left no trace
 * in the CRM, so an operator saw a conversation with a hole in it exactly
 * where something had gone wrong.
 *
 * What it writes is conditional, and the conditions are the interesting part:
 * the inbound only when the try did not already write it, and the reply only
 * when one actually reached the customer. Recording a reply that was never
 * delivered is worse than recording nothing.
 */
const saveConversation = jest.fn().mockResolvedValue('row-1');
const getSessionContext = jest.fn();

jest.mock('../DatabaseService', () => ({
  __esModule: true,
  default: {
    saveConversation,
    getSessionContext,
    getConversationHistory: jest.fn().mockResolvedValue([]),
    searchKnowledgeBase: jest.fn().mockResolvedValue([]),
  },
}));

const processWithThinking = jest.fn();

jest.mock('../AIThinkingService', () => ({
  __esModule: true,
  default: { processWithThinking },
}));

import { MessageHandler } from './MessageHandler';

const DTO: NormalizedWhatsAppMessage = {
  id: 's1:3EB0ABC',
  sessionId: 's1',
  senderPhone: '34600111222',
  recipientPhone: null,
  text: 'hola',
  timestamp: 1756289400,
  type: 'text',
  isGroup: false,
  fromMe: false,
};

const makePort = (): ReplyPort => ({
  reply: jest.fn().mockResolvedValue(undefined),
  send: jest.fn().mockResolvedValue(undefined),
  startTyping: jest.fn().mockResolvedValue(undefined),
  stopTyping: jest.fn().mockResolvedValue(undefined),
});

const run = (port: ReplyPort) => new MessageHandler().processMessageWithAI(DTO, port);

/** Every row the handler wrote, in order. */
const written = () => saveConversation.mock.calls.map(c => c[0]);
const inbound = () => written().filter(d => d.isFromUser === true);
const outbound = () => written().filter(d => d.isFromUser === false);

beforeEach(() => {
  jest.clearAllMocks();
  saveConversation.mockResolvedValue('row-1');
  getSessionContext.mockResolvedValue({ tenantId: 't1', aiAgentId: null });
});

describe('a failure before anything was written', () => {
  beforeEach(() => {
    // Thrown by the very first await inside the try, so nothing downstream
    // ran and nothing was persisted.
    getSessionContext.mockRejectedValue(new Error('database unreachable'));
  });

  it('still answers the customer', async () => {
    const port = makePort();
    await run(port);

    expect(port.reply).toHaveBeenCalled();
  });

  it('records both halves of the exchange', async () => {
    await run(makePort());

    expect(inbound()).toHaveLength(1);
    expect(outbound()).toHaveLength(1);
  });

  it('records the inbound as the customer sent it', async () => {
    await run(makePort());

    expect(inbound()[0]).toMatchObject({
      messageText: 'hola',
      status: 'READ',
      providerMessageId: '3EB0ABC',
    });
    expect(inbound()[0].occurredAt).toBeInstanceOf(Date);
  });

  it('records the reply the customer actually received', async () => {
    const port = makePort();
    await run(port);

    const sent = (port.reply as jest.Mock).mock.calls[0][0];
    expect(outbound()[0]).toMatchObject({ responseText: sent, status: 'SENT' });
    // Ours, not the customer's — the same rule the normal paths follow.
    expect(outbound()[0].providerMessageId).toBeUndefined();
  });
});

describe('a failure AFTER the pair was already written', () => {
  beforeEach(() => {
    // A real, reachable route, not a contrived one. With no `responseStrategy`
    // the AI still succeeds and the pair is persisted -- `sendResponseWithStrategy`
    // dereferences the strategy inside its own try and falls back to a plain
    // reply -- and then the success log interpolates `strategy.type` on an
    // undefined, throwing into the outer catch with the inbound already on disk.
    processWithThinking.mockResolvedValue({
      success: true,
      content: 'respuesta del modelo',
      provider: 'test',
      tokensUsed: 3,
      thinkingProcess: {
        shouldRespond: true,
        finalDecision: 'RESPOND',
        processingTimeMs: 1,
        confidence: 0.9,
        steps: [],
        // responseStrategy deliberately absent.
      },
    });
  });

  it('does not write the inbound a second time', async () => {
    // The whole reason the catch needs a tracker rather than an unconditional
    // write: the customer sent one message, so the CRM shows one.
    await run(makePort());

    expect(inbound()).toHaveLength(1);
  });

  it('still records the extra reply the catch sent', async () => {
    // Not a duplicate: the try already sent and recorded one reply, and the
    // catch sends a DIFFERENT message the customer also receives.
    await run(makePort());

    expect(outbound().map(d => d.responseText)).toContain('respuesta del modelo');
    expect(outbound()).toHaveLength(2);
  });

  it('writes the inbound after all if the first write was dropped', async () => {
    // saveConversation swallows its own failures and answers null. Treating
    // "we called it" as "the row exists" would make the catch skip an inbound
    // that was never written -- the flag has to come from the answer.
    saveConversation.mockResolvedValue(null);

    await run(makePort());

    expect(inbound()).toHaveLength(2);
  });
});

describe('a failure where even the reply cannot be sent', () => {
  beforeEach(() => {
    getSessionContext.mockRejectedValue(new Error('database unreachable'));
  });

  it('records the inbound but invents no reply', async () => {
    // Nothing reached the customer, so nothing outbound may be recorded.
    // A row for a message that was never delivered is worse than no row.
    const port = makePort();
    (port.reply as jest.Mock).mockRejectedValue(new Error('socket closed'));

    await run(port);

    expect(inbound()).toHaveLength(1);
    expect(outbound()).toHaveLength(0);
  });
});
