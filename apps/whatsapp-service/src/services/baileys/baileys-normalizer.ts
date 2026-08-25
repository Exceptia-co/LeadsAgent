import { extractMessageContent, getContentType, isJidGroup, isLidUser, jidDecode } from '@whiskeysockets/baileys';
import type { WAMessage } from '@whiskeysockets/baileys';
import type { NormalizedWhatsAppMessage, NormalizedMessageType } from '../../types/messages';

const E164 = /^[1-9]\d{7,14}$/;

function toPhone(jid: string | null | undefined): string | null {
  if (!jid) return null;
  // jidDecode strips the device suffix (`:12`) on its own.
  const user = jidDecode(jid)?.user;
  return user && E164.test(user) ? user : null;
}

/**
 * A LID's user part is a 15-digit number and passes the E.164 test, so it
 * cannot be told apart from a phone number by shape alone. The real number
 * travels beside it on the key, in `senderPn` (one-to-one) or `participantPn`
 * (group). When the JID is a LID and no PN accompanies it, there is no phone
 * number -- returning null is correct, inventing one is not.
 */
function resolvePhone(jid: string | null | undefined, pn: string | null | undefined): string | null {
  if (isLidUser(jid)) return toPhone(pn);
  return toPhone(jid);
}

function toType(contentType: string | undefined): NormalizedMessageType {
  switch (contentType) {
    case 'imageMessage':
      return 'image';
    case 'audioMessage':
      return 'audio';
    case 'videoMessage':
      return 'video';
    case 'documentMessage':
      return 'document';
    default:
      return 'text';
  }
}

function toText(content: Record<string, any>, contentType: string | undefined): string {
  switch (contentType) {
    case 'conversation':
      return content.conversation ?? '';
    case 'extendedTextMessage':
      return content.extendedTextMessage?.text ?? '';
    case 'imageMessage':
    case 'videoMessage':
      return content[contentType]?.caption ?? '';
    default:
      return '';
  }
}

/** protobufjs returns a Long for int64 fields; the wire contract wants a number. */
function toSeconds(ts: unknown): number {
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') return Number(ts);
  if (ts && typeof ts === 'object' && 'low' in (ts as any)) return Number((ts as any).low);
  return 0;
}

/**
 * The single place a Baileys WAMessage becomes a DTO. Mirrors
 * normalizeWwebjsMessage's signature exactly; nothing downstream changes.
 *
 * Returns null rather than a partial DTO -- a half-populated message is worse
 * than a dropped one.
 */
export function normalizeBaileysMessage(
  message: WAMessage,
  sessionId: string
): NormalizedWhatsAppMessage | null {
  const providerId = message.key?.id;
  if (!providerId) return null;

  // Unwrap first. getContentType on an ephemeralMessage wrapper returns
  // 'ephemeralMessage' and the text never surfaces; disappearing-message
  // chats are ordinary, so this is not an edge case.
  const content = extractMessageContent(message.message);
  if (!content) return null;
  const contentType = getContentType(content);

  const isGroup = !!isJidGroup(message.key.remoteJid);

  const senderPhone = isGroup
    ? resolvePhone(message.key.participant, message.key.participantPn)
    : resolvePhone(message.key.remoteJid, message.key.senderPn);
  if (!senderPhone) return null;

  return {
    id: `${sessionId}:${providerId}`,
    sessionId,
    senderPhone,
    recipientPhone: isGroup ? null : senderPhone,
    text: toText(content as Record<string, any>, contentType),
    timestamp: toSeconds(message.messageTimestamp),
    type: toType(contentType),
    isGroup,
    fromMe: !!message.key.fromMe,
  };
}
