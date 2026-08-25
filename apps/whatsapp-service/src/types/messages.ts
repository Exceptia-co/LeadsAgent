export type NormalizedMessageType = 'text' | 'image' | 'audio' | 'video' | 'document';

/**
 * The only message shape allowed past the engine boundary. No library type,
 * JID, LID or protobuf reaches the AI layer or the database through this.
 */
export interface NormalizedWhatsAppMessage {
  /** `${sessionId}:${providerMessageId}` — opaque, never a JID. */
  id: string;
  sessionId: string;
  /** E.164 without the leading '+': /^[1-9]\d{7,14}$/ */
  senderPhone: string;
  /** null when the chat is not one-to-one. */
  recipientPhone: string | null;
  /** Already extracted from conversation / extendedTextMessage.text / caption. */
  text: string;
  /** Unix seconds. */
  timestamp: number;
  type: NormalizedMessageType;
  isGroup: boolean;
  fromMe: boolean;
}
