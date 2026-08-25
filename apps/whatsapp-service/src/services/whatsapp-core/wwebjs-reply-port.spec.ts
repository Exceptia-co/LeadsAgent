import { makeWwebjsReplyPort } from './wwebjs-reply-port';

function makeMessage() {
  const chat = {
    sendMessage: jest.fn().mockResolvedValue(undefined),
    sendStateTyping: jest.fn().mockResolvedValue(undefined),
    clearState: jest.fn().mockResolvedValue(undefined),
  };
  const message = {
    reply: jest.fn().mockResolvedValue(undefined),
    getChat: jest.fn().mockResolvedValue(chat),
  };
  return { message, chat };
}

describe('makeWwebjsReplyPort', () => {
  it('reply_quotes_through_the_message_and_never_opens_the_chat', async () => {
    // reply() and send() differ only in whether the answer quotes the inbound
    // message. Asserting "reply was called" alone would still pass if reply
    // were implemented as chat.sendMessage -- which silently drops the quote,
    // the one thing that distinguishes the two verbs.
    const { message, chat } = makeMessage();

    await makeWwebjsReplyPort(message as any).reply('con cita');

    expect(message.reply).toHaveBeenCalledWith('con cita');
    expect(message.getChat).not.toHaveBeenCalled();
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });

  it('send_goes_through_the_chat_and_never_quotes', async () => {
    const { message, chat } = makeMessage();

    await makeWwebjsReplyPort(message as any).send('sin cita');

    expect(chat.sendMessage).toHaveBeenCalledWith('sin cita');
    expect(message.reply).not.toHaveBeenCalled();
  });

  it('typing_verbs_share_a_single_chat_lookup', async () => {
    // getChat() is a round-trip into the Puppeteer page context. The handler
    // starts typing at entry and clears it in a finally, so an unmemoized port
    // would pay for that round-trip twice on every single message. Deleting
    // the memoization is a one-line change and must fail here.
    const { message, chat } = makeMessage();
    const port = makeWwebjsReplyPort(message as any);

    await port.startTyping();
    await port.stopTyping();

    expect(message.getChat).toHaveBeenCalledTimes(1);
    expect(chat.sendStateTyping).toHaveBeenCalledTimes(1);
    expect(chat.clearState).toHaveBeenCalledTimes(1);
  });

  it('a_failed_chat_lookup_is_not_memoized', async () => {
    // Memoizing the *promise* rather than the resolved chat would cache a
    // rejection forever: one transient failure and the session stops being
    // able to answer at all until it restarts. Caching the resolved value
    // leaves the retry path intact.
    const { message, chat } = makeMessage();
    message.getChat
      .mockRejectedValueOnce(new Error('Execution context was destroyed'))
      .mockResolvedValue(chat);
    const port = makeWwebjsReplyPort(message as any);

    await expect(port.startTyping()).rejects.toThrow('Execution context was destroyed');
    await port.startTyping();

    expect(message.getChat).toHaveBeenCalledTimes(2);
    expect(chat.sendStateTyping).toHaveBeenCalledTimes(1);
  });
});
