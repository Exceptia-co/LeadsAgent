import type { Message } from 'whatsapp-web.js';
import type { ReplyPort } from '../../types/reply-port';

type Chat = Awaited<ReturnType<Message['getChat']>>;

/**
 * The only place that knows how a whatsapp-web.js Message answers. Task 8b
 * deletes this file; `makeBaileysReplyPort` replaces it behind the same
 * interface.
 */
export function makeWwebjsReplyPort(message: Message): ReplyPort {
  // Memoize the resolved chat, never the promise: a rejected promise would
  // be cached forever, so one transient "Execution context was destroyed"
  // would leave the session permanently unable to answer.
  let chat: Chat | null = null;
  const openChat = async (): Promise<Chat> => {
    if (!chat) chat = await message.getChat();
    return chat;
  };

  return {
    async reply(text: string): Promise<void> {
      await message.reply(text);
    },
    async send(text: string): Promise<void> {
      await (await openChat()).sendMessage(text);
    },
    async startTyping(): Promise<void> {
      await (await openChat()).sendStateTyping();
    },
    async stopTyping(): Promise<void> {
      await (await openChat()).clearState();
    },
  };
}
