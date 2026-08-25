/**
 * How the AI layer answers, without knowing what is carrying the answer.
 *
 * The inbound DTO (`NormalizedWhatsAppMessage`) deliberately carries no
 * library object, so a quoted reply -- which needs the original message
 * handle -- cannot be reconstructed from it. The port is therefore built at
 * the engine boundary with that handle captured in its closure, and is the
 * only thing on this path that ever holds one.
 */
export interface ReplyPort {
  /** Answer quoting the inbound message. */
  reply(text: string): Promise<void>;
  /** Answer in the same chat without quoting. */
  send(text: string): Promise<void>;
  startTyping(): Promise<void>;
  stopTyping(): Promise<void>;
}
