import type { Message } from 'whatsapp-web.js';
import type { NormalizedWhatsAppMessage, NormalizedMessageType } from '../../types/messages';

const E164 = /^[1-9]\d{7,14}$/;

function toPhone(jid: string | undefined): string | null {
  if (!jid) return null;
  const bare = jid.split('@')[0].split(':')[0];
  return E164.test(bare) ? bare : null;
}

function toType(raw: string): NormalizedMessageType {
  switch (raw) {
    case 'image':
    case 'audio':
    case 'video':
    case 'document':
      return raw;
    default:
      return 'text';
  }
}

/**
 * The single place a whatsapp-web.js Message becomes a DTO. Phase 2 replaces
 * this file with a Baileys equivalent of the same signature; nothing else in
 * the inbound path should need to change.
 *
 * Returns null rather than a partial DTO when the sender cannot be resolved --
 * a half-populated message is worse than a dropped one.
 */
export function normalizeWwebjsMessage(
  message: Message,
  sessionId: string
): NormalizedWhatsAppMessage | null {
  const senderPhone = toPhone(message.from);
  if (!senderPhone) return null;

  return {
    id: `${sessionId}:${message.id._serialized}`,
    sessionId,
    senderPhone,
    recipientPhone: toPhone(message.to),
    text: message.body ?? '',
    timestamp: message.timestamp,
    type: toType(message.type as string),
    isGroup: message.from?.endsWith('@g.us') ?? false,
    fromMe: message.fromMe,
  };
}
