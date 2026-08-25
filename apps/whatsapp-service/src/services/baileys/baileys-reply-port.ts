import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import type { ReplyPort } from '../../types/reply-port';

/**
 * The Baileys half of the reply port. Replaces makeWwebjsReplyPort behind the
 * same interface; MessageHandler cannot tell them apart.
 *
 * No chat handle to memoize here -- Baileys addresses the chat by JID, so
 * every verb is a direct socket call.
 */
export function makeBaileysReplyPort(sock: WASocket, message: WAMessage): ReplyPort {
  const jid = message.key.remoteJid as string;

  return {
    async reply(text: string): Promise<void> {
      await sock.sendMessage(jid, { text }, { quoted: message });
    },
    async send(text: string): Promise<void> {
      await sock.sendMessage(jid, { text });
    },
    async startTyping(): Promise<void> {
      await sock.sendPresenceUpdate('composing', jid);
    },
    async stopTyping(): Promise<void> {
      await sock.sendPresenceUpdate('paused', jid);
    },
  };
}
