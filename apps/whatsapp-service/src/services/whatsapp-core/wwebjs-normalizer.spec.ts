import { normalizeWwebjsMessage } from './wwebjs-normalizer';
import type { Message } from 'whatsapp-web.js';

const SESSION_ID = 's1';

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: { _serialized: 'ABC123' },
    from: '34600000000@c.us',
    to: '34999999999@c.us',
    body: 'hola',
    timestamp: 1756000000,
    type: 'chat',
    fromMe: false,
    ...overrides,
  } as unknown as Message;
}

describe('normalizeWwebjsMessage', () => {
  it('normalizes_a_direct_one_to_one_text_message', () => {
    const dto = normalizeWwebjsMessage(makeMessage(), SESSION_ID);

    expect(dto).toEqual({
      id: `${SESSION_ID}:ABC123`,
      sessionId: SESSION_ID,
      senderPhone: '34600000000',
      recipientPhone: '34999999999',
      text: 'hola',
      timestamp: 1756000000,
      type: 'text',
      isGroup: false,
      fromMe: false,
    });
  });

  it('resolves_the_real_sender_from_author_for_group_messages', () => {
    // In a group, `from` is the GROUP's JID (an 18+ digit id that fails the
    // E164 test) and the real sender is `author`. Order matters: isGroup must
    // be computed before the sender phone is resolved, otherwise every group
    // message returns null before isGroup is ever set (the bug this test
    // pins down -- see wwebjs-normalizer.ts's comment on the same ordering).
    const message = makeMessage({
      from: '120363012345678901@g.us',
      author: '34600000000@c.us',
    });

    const dto = normalizeWwebjsMessage(message, SESSION_ID);

    expect(dto).not.toBeNull();
    expect(dto).toMatchObject({
      isGroup: true,
      senderPhone: '34600000000',
    });
  });

  it('returns_null_when_the_sender_phone_cannot_be_resolved', () => {
    // A non-E164 `from` in a 1-1 chat (e.g. a malformed or missing JID) must
    // drop the message rather than forward a half-populated DTO.
    const dto = normalizeWwebjsMessage(makeMessage({ from: 'not-a-jid' }), SESSION_ID);

    expect(dto).toBeNull();
  });
});
