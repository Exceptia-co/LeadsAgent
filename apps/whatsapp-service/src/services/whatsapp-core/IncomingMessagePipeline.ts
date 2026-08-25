import { redisClient, REDIS_KEYS, REDIS_TTL } from '../../config/redis';
import { logger } from '../../utils/logger';
import type { NormalizedWhatsAppMessage } from '../../types/messages';
import type { WhatsAppMessage } from '../../types';

/**
 * Generic over the transport handle so this file threads it through without
 * ever importing a library type. `EventDispatcher` instantiates it as
 * `IncomingMessagePipeline<Message>`; the pipeline itself only passes the
 * value along and never inspects it.
 */
export interface IncomingMessagePipelineDeps<TTransport> {
  authChecker: {
    checkPhoneNumberAllowedWithLog(
      phone: string,
      sessionId: string,
      body: string
    ): Promise<{ allowed: boolean; reason?: string }>;
  };
  messageHandler: {
    processMessageWithAI(dto: NormalizedWhatsAppMessage, transport: TTransport): Promise<void>;
  };
  sessionManager: {
    updateSessionStatus(sessionId: string, status: string, data?: unknown): Promise<void>;
  };
  sendWebhook(payload: {
    event: string;
    sessionId: string;
    // Frozen wire shape -- apps/api reads `data.from`/`data.body` over HTTP.
    // Never widen this back to NormalizedWhatsAppMessage.
    data: WhatsAppMessage;
    timestamp: string;
  }): Promise<void>;
}

const HEALTH_UPDATE_INTERVAL_MS = 30000;

export class IncomingMessagePipeline<TTransport> {
  private lastHealthUpdate = 0;

  constructor(private readonly deps: IncomingMessagePipelineDeps<TTransport>) {}

  async handle(dto: NormalizedWhatsAppMessage, transport: TTransport): Promise<void> {
    try {
      // Dedupe first: the transport may re-emit the same message on reconnect.
      // The key is session-scoped -- two tenants can legitimately see the same
      // provider message id.
      const dedupeKey = `${REDIS_KEYS.MESSAGE_DEDUP}${dto.id}`;
      logger.info(`[DEDUPE] Checking msgId=${dto.id} session=${dto.sessionId}`);
      const isFirstTime = await redisClient.setNX(
        dedupeKey,
        '1',
        REDIS_TTL.MESSAGE_DEDUP_SECONDS
      );
      if (!isFirstTime) {
        logger.info(`[DEDUPE] Skipping already-processed message ${dto.id}`);
        return;
      }

      if (dto.isGroup) {
        logger.debug(`[FILTER] Skipping group message in session ${dto.sessionId}`);
        return;
      }

      const now = Date.now();
      if (now - this.lastHealthUpdate > HEALTH_UPDATE_INTERVAL_MS) {
        this.lastHealthUpdate = now;
        await this.deps.sessionManager.updateSessionStatus(dto.sessionId, 'ready', {
          lastHealthCheck: new Date(),
        });
      }

      if (!dto.fromMe && dto.text.trim()) {
        const verdict = await this.deps.authChecker.checkPhoneNumberAllowedWithLog(
          dto.senderPhone,
          dto.sessionId,
          dto.text
        );
        if (verdict.allowed) {
          logger.info(`📱 Respuesta automática permitida para: ${dto.senderPhone}`);
          await this.deps.messageHandler.processMessageWithAI(dto, transport);
        } else {
          logger.info(
            `🚫 Respuesta automática bloqueada para: ${dto.senderPhone} - ${verdict.reason}`
          );
        }
      }

      // The webhook wire format is FROZEN. `apps/api` consumes this payload
      // over HTTP and reads `data.from` and `data.body`; its controller types
      // the field as `any`, so neither side's typecheck can catch a drift.
      // Emitting the DTO raw here throws `undefined.replace()` in the API on
      // every inbound message. Map back to the published shape instead.
      await this.deps.sendWebhook({
        event: 'message',
        sessionId: dto.sessionId,
        data: {
          id: dto.id,
          from: dto.senderPhone,
          // WhatsAppMessage.to is `string`; recipientPhone is `string | null`.
          // strictNullChecks is off in this project so nothing mechanical
          // catches the mismatch -- coerce explicitly rather than lie about it.
          to: dto.recipientPhone ?? '',
          body: dto.text,
          timestamp: dto.timestamp,
          type: dto.type,
          isGroup: dto.isGroup,
          fromMe: dto.fromMe,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(`Error processing message in session ${dto.sessionId}:`, error);
    }
  }
}
