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
