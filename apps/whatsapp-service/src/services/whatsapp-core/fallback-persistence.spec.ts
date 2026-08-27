import type { NormalizedWhatsAppMessage } from '../../types/messages';
import type { ReplyPort } from '../../types/reply-port';

const saveConversation = jest.fn().mockResolvedValue('row-1');

jest.mock('../DatabaseService', () => ({
  __esModule: true,
  default: {
    saveConversation,
    getSessionContext: jest.fn().mockResolvedValue({ tenantId: 't1', aiAgentId: null }),
    getConversationHistory: jest.fn().mockResolvedValue([]),
    // generateIntelligentFallback (reached once the AI errors) looks the KB
    // up before falling back to a canned reply. Empty means it never needs
    // AIService.generateResponse, which this file deliberately leaves real.
    searchKnowledgeBase: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../AIThinkingService', () => ({
  __esModule: true,
  default: {
    // The branch under test: the AI errored, so the handler sends an
    // intelligent fallback and records it.
    processWithThinking: jest.fn().mockResolvedValue({
      content: '',
      provider: 'test',
      tokensUsed: 0,
      error: 'LLM unavailable',
      thinkingProcess: {
        shouldRespond: true,
        finalDecision: 'RESPOND',
        processingTimeMs: 1,
        confidence: 0,
        // The no-response branch reads steps[0]?.data for intent and
        // sentiment; without the array it throws before reaching the
        // fallback this test is about.
        steps: [],
      },
    }),
  },
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

const port: ReplyPort = {
  reply: jest.fn().mockResolvedValue(undefined),
  send: jest.fn().mockResolvedValue(undefined),
  startTyping: jest.fn().mockResolvedValue(undefined),
  stopTyping: jest.fn().mockResolvedValue(undefined),
};

const runFallbackPath = () => new MessageHandler().processMessageWithAI(DTO, port);

// Without this, `.find()` below reaches back into the previous test's calls
// and every assertion after the first one is reading someone else's data.
beforeEach(() => jest.clearAllMocks());

/** The AI succeeding, which routes through persistMessagePair instead. */
const runSuccessPath = async () => {
  const { default: AIThinkingService } = await import('../AIThinkingService');
  (AIThinkingService.processWithThinking as jest.Mock).mockResolvedValueOnce({
    success: true,
    content: 'respuesta del modelo',
    provider: 'test',
    tokensUsed: 7,
    thinkingProcess: {
      shouldRespond: true,
      finalDecision: 'RESPOND',
      processingTimeMs: 1,
      confidence: 0.9,
      steps: [],
      responseStrategy: { type: 'direct', tone: 'neutral', length: 'short' },
    },
  });
  return new MessageHandler().processMessageWithAI(DTO, port);
};

it('records the fallback reply it just sent', async () => {
  // The reply text used to be passed as `messageText` with
  // `isFromUser: false`. saveConversation reads `responseText` in that case,
  // so canonicalContent was null and the row was dropped with a warning --
  // every fallback ever sent went unrecorded.
  await runFallbackPath();

  const outbound = saveConversation.mock.calls.map(c => c[0]).find(d => d.isFromUser === false);

  expect(outbound).toBeDefined();
  expect(outbound.responseText).toBeTruthy();
  expect(outbound.messageText).toBeUndefined();
  expect(outbound.status).toBe('SENT');
});

it("does not stamp the customer's message id or arrival time on our reply", async () => {
  // `providerMessageId` and `occurredAt` describe the message the customer
  // sent. Copying them onto the row for the reply WE sent would make it
  // claim to be something it is not -- and would put two rows in the table
  // sharing one WhatsApp id, which is the shape a reader would use to
  // deduplicate.
  await runFallbackPath();

  const outbound = saveConversation.mock.calls.map(c => c[0]).find(d => d.isFromUser === false);

  expect(outbound.providerMessageId).toBeUndefined();
  expect(outbound.occurredAt).toBeUndefined();
});

it('does stamp them on the inbound, so the assertion above means something', async () => {
  // The counterweight. Without it, deleting the fields everywhere would
  // satisfy the test above -- an absence assertion is only worth what its
  // matching presence assertion proves.
  await runFallbackPath();

  const inbound = saveConversation.mock.calls.map(c => c[0]).find(d => d.isFromUser === true);

  expect(inbound.providerMessageId).toBe('3EB0ABC');
  expect(inbound.occurredAt).toBeInstanceOf(Date);
});

it("keeps the reply clean of the inbound's identity on the normal path too", async () => {
  // The other outbound write. persistMessagePair is a separate call site from
  // the fallback, so it needs its own proof — the two could drift apart.
  await runSuccessPath();

  const outbound = saveConversation.mock.calls.map(c => c[0]).find(d => d.isFromUser === false);
  const inbound = saveConversation.mock.calls.map(c => c[0]).find(d => d.isFromUser === true);

  expect(outbound).toBeDefined();
  // Pins which path produced this row. Without it, a mock that failed to take
  // effect would drop into the fallback instead -- whose outbound also lacks
  // these fields, so every assertion below would pass while testing the wrong
  // call site entirely.
  expect(outbound.responseText).toBe('respuesta del modelo');
  expect(outbound.status).toBe('SENT');
  expect(outbound.providerMessageId).toBeUndefined();
  expect(outbound.occurredAt).toBeUndefined();

  expect(inbound.status).toBe('READ');
  expect(inbound.providerMessageId).toBe('3EB0ABC');
});
