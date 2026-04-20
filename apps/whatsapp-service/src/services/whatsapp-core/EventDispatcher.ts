import type { Client, Message } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { logger } from '../../utils/logger';
import advancedLogger from '../../utils/advancedLogger';
import type { WhatsAppMessage, WebhookPayload } from '../../types';
import redisClient, { REDIS_KEYS, REDIS_TTL } from '../../config/redis';
import { signServiceRequest } from '../../middleware/auth';

/**
 * EventDispatcher - Handles all WhatsApp client events, webhooks, and event-driven operations
 *
 * Responsibilities:
 * - WhatsApp client event setup and handling
 * - QR code generation and management
 * - Authentication event processing
 * - Message event processing and routing
 * - Webhook and Socket.IO event dispatching
 * - State change detection and handling
 *
 * Extracted from WhatsAppServiceSimple lines: 160-162, 300-484, 1546-1595
 */
export class EventDispatcher {
  private webhookUrl: string | undefined;
  private sessionListeners: Map<
    string,
    Array<{ event: string; handler: (...args: any[]) => any }>
  > = new Map();
  private sessionTimeouts: Map<string, NodeJS.Timeout[]> = new Map();

  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl;
  }

  /**
   * Set up all WhatsApp client event listeners
   */
  setupClientEventListeners(
    client: Client,
    sessionId: string,
    messageHandler: {
      parseMessage: (message: Message, sessionId: string) => Promise<WhatsAppMessage>;
      processMessageWithAI: (
        originalMessage: Message,
        whatsappMessage: WhatsAppMessage,
        sessionId: string
      ) => Promise<void>;
    },
    sessionManager: {
      updateSessionStatus: (sessionId: string, status: string, data?: any) => Promise<void>;
      handleSessionDisconnect: (
        sessionId: string,
        disconnectType: string,
        originalReason?: any
      ) => Promise<void>;
    },
    authChecker: {
      checkPhoneNumberAllowedWithLog: (
        phoneNumberWithSuffix: string,
        sessionId: string,
        messagePreview?: string
      ) => Promise<{ allowed: boolean; reason: string; leadInfo?: any }>;
    },
    onSnapshotTrigger?: (sessionId: string) => Promise<void>,
    onAuthInvalidated?: (sessionId: string, reason: string) => Promise<void>,
    isSessionDestroying?: (sessionId: string) => boolean
  ): void {
    // ─── Diagnostic logging for event flow debugging ───
    logger.info(`[DIAG] Setting up event listeners for session ${sessionId}`);

    // Initialize listener and timeout tracking for this session
    const listeners: Array<{ event: string; handler: (...args: any[]) => any }> = [];
    const timeouts: NodeJS.Timeout[] = [];
    this.sessionListeners.set(sessionId, listeners);
    this.sessionTimeouts.set(sessionId, timeouts);

    // Throttle: only update health check in DB/Redis at most once per 30s per session
    let lastHealthUpdate = 0;

    // QR Code event
    const onQr = async (qr: string) => {
      logger.info(`[DIAG] QR event fired for session ${sessionId}`);
      logger.info(`QR Code generated for session ${sessionId}`);

      // Generate QR code for terminal display (development)
      if (process.env.NODE_ENV !== 'production') {
        qrcode.generate(qr, { small: true });
      }

      // Store QR code in session (memory + DB)
      await sessionManager.updateSessionStatus(sessionId, 'connecting', { qrCode: qr });

      // Cache QR in Redis with 60s TTL for fast dashboard access
      try {
        await redisClient.set(`${REDIS_KEYS.SESSION_QR}${sessionId}`, qr, 60);
      } catch (redisError) {
        logger.debug(`Redis QR cache failed for ${sessionId}:`, redisError);
      }

      // Send webhook
      await this.sendWebhook({
        event: 'qr_updated',
        sessionId,
        data: { qrCode: qr },
        timestamp: new Date().toISOString(),
      });
    };
    client.on('qr', onQr);
    listeners.push({ event: 'qr', handler: onQr });

    // Ready event (once: whatsapp-web.js may emit this multiple times due to internal race conditions)
    client.once('ready', async () => {
      logger.info(`[DIAG] READY event fired for session ${sessionId}`);
      logger.info(`WhatsApp client ${sessionId} is ready`);

      const clientInfo = client.info;

      // Advanced logging de evento de sesión
      advancedLogger.logSessionEvent({
        sessionId,
        eventType: 'READY',
        phoneNumber: clientInfo?.wid?.user || 'unknown',
        authState: 'AUTHENTICATED',
        metadata: {
          clientInfo: {
            number: clientInfo?.wid?.user,
            pushname: clientInfo?.pushname,
            platform: clientInfo?.platform,
          },
        },
      });

      await sessionManager.updateSessionStatus(sessionId, 'ready', {
        connectedNumber: clientInfo?.wid?.user || 'unknown',
        lastHealthCheck: new Date(),
      });

      // Send webhook
      await this.sendWebhook({
        event: 'authenticated',
        sessionId,
        data: { number: clientInfo?.wid?.user },
        timestamp: new Date().toISOString(),
      });

      // Trigger snapshot backup after 5s delay (LocalAuth may still be writing)
      if (onSnapshotTrigger) {
        const snapshotTimeout = setTimeout(() => {
          onSnapshotTrigger(sessionId).catch(err => {
            logger.warn(`Snapshot trigger failed for session ${sessionId}:`, err);
          });
        }, 5000);
        timeouts.push(snapshotTimeout);
      }
    });

    // Authenticated event (once: whatsapp-web.js may emit this multiple times due to hasSynced race condition)
    client.once('authenticated', async () => {
      logger.info(`[DIAG] AUTHENTICATED event fired for session ${sessionId}`);
      logger.info(`WhatsApp client ${sessionId} authenticated`);
      await sessionManager.updateSessionStatus(sessionId, 'authenticated');

      // Safety timeout: if ready doesn't arrive within 90s after authenticated, log warning
      const authReadyTimeout = setTimeout(() => {
        logger.warn(
          `[DIAG] Session ${sessionId}: READY event NOT received 90s after AUTHENTICATED. Client info: ${client.info ? 'has info' : 'no info'}`
        );
        logger.warn(
          `[DIAG] Session ${sessionId}: This likely means attachEventListeners() in whatsapp-web.js is stuck waiting for window.Store`
        );
      }, 90000);
      timeouts.push(authReadyTimeout);

      client.once('ready', () => {
        clearTimeout(authReadyTimeout);
        logger.info(
          `[DIAG] Session ${sessionId}: READY arrived after AUTHENTICATED (safety timeout cleared)`
        );
      });

      // Get client info to send webhook
      const clientInfo = client.info;

      // Send webhook for authenticated event
      await this.sendWebhook({
        event: 'authenticated',
        sessionId,
        data: { number: clientInfo?.wid?.user || 'unknown' },
        timestamp: new Date().toISOString(),
      });
    });

    // Authentication failure event
    const onAuthFailure = async (msg: string) => {
      logger.error(`Authentication failed for session ${sessionId}:`, msg);
      await sessionManager.updateSessionStatus(sessionId, 'auth_failure', {
        lastError: `Authentication failed: ${msg}`,
        metadata: {
          authInvalidated: true,
          invalidatedAt: new Date().toISOString(),
          invalidationReason: 'auth_failure',
        },
      });

      // Clean up stale auth files and snapshot so next reconnect requires fresh QR
      if (onAuthInvalidated) {
        onAuthInvalidated(sessionId, 'auth_failure').catch(err => {
          logger.warn(`Auth invalidation cleanup failed for ${sessionId}:`, err);
        });
      }

      // Send webhook
      await this.sendWebhook({
        event: 'status_change',
        sessionId,
        data: { status: 'auth_failure', message: msg, authInvalidated: true },
        timestamp: new Date().toISOString(),
      });
    };
    client.on('auth_failure', onAuthFailure);
    listeners.push({ event: 'auth_failure', handler: onAuthFailure });

    // Disconnected event - Enhanced with reason detection
    const onDisconnected = async (reason: string) => {
      // Skip if session is being intentionally destroyed (prevents race condition)
      if (isSessionDestroying?.(sessionId)) {
        logger.debug(
          `Ignoring disconnected event for ${sessionId} — intentional destroy in progress`
        );
        return;
      }

      logger.info(`WhatsApp client ${sessionId} disconnected:`, reason);

      // Detect if this is a browser closure vs network issue
      let disconnectReason = 'WHATSAPP_DISCONNECT';
      if (reason && typeof reason === 'string') {
        if (reason.includes('Target closed') || reason.includes('Page closed')) {
          disconnectReason = 'BROWSER_CLOSED';
        } else if (reason.includes('Navigation failed') || reason.includes('net::ERR_')) {
          disconnectReason = 'NETWORK_ERROR';
        }
      }

      await sessionManager.handleSessionDisconnect(sessionId, disconnectReason, reason);

      // Send webhook
      await this.sendWebhook({
        event: 'disconnected',
        sessionId,
        data: { reason, disconnectType: disconnectReason },
        timestamp: new Date().toISOString(),
      });
    };
    client.on('disconnected', onDisconnected);
    listeners.push({ event: 'disconnected', handler: onDisconnected });

    // State change event - Detect WhatsApp Web states
    const onChangeState = async (state: string) => {
      // Skip if session is being intentionally destroyed
      if (isSessionDestroying?.(sessionId)) {
        logger.debug(
          `Ignoring change_state event for ${sessionId} — intentional destroy in progress`
        );
        return;
      }

      logger.info(`WhatsApp client ${sessionId} state changed:`, state);

      // Handle different WhatsApp Web states
      if (state === 'UNPAIRED' || state === 'UNPAIRED_IDLE') {
        logger.warn(`Session ${sessionId} became unpaired — user unlinked from phone`);
        await sessionManager.handleSessionDisconnect(
          sessionId,
          'WHATSAPP_UNPAIRED',
          `State: ${state}`
        );

        // Clean up stale auth files and snapshot so next reconnect requires fresh QR
        if (onAuthInvalidated) {
          onAuthInvalidated(sessionId, `unpaired:${state}`).catch(err => {
            logger.warn(`Auth invalidation cleanup failed for ${sessionId}:`, err);
          });
        }
      } else if (state === 'TIMEOUT') {
        logger.warn(`Session ${sessionId} timed out`);
        await sessionManager.handleSessionDisconnect(
          sessionId,
          'WHATSAPP_TIMEOUT',
          `State: ${state}`
        );
      }
    };
    client.on('change_state', onChangeState);
    listeners.push({ event: 'change_state', handler: onChangeState });

    // Loading screen event - Detect when WhatsApp Web shows loading screen
    const onLoadingScreen = async (percent: string, message: string) => {
      logger.info(`[DIAG] Loading screen ${sessionId}: ${percent}% - ${message}`);
      // Convert percent to number for comparison
      const percentNum = parseInt(percent) || 0;
      if (percentNum === 0) {
        // WhatsApp Web is reloading, might indicate connection issues
        await sessionManager.updateSessionStatus(sessionId, 'connecting', {
          lastHealthCheck: new Date(),
          metadata: { loading: true, loadingMessage: message },
        });
      }
    };
    client.on('loading_screen', onLoadingScreen);
    listeners.push({ event: 'loading_screen', handler: onLoadingScreen });

    // Message event
    const onMessage = async (message: Message) => {
      logger.info(
        `[DIAG] MESSAGE event fired for session ${sessionId} from=${message.from} body=${message.body?.substring(0, 50)}`
      );
      try {
        // Fase A1 (2026-04-19): dedupe atómico en Redis.
        // whatsapp-web.js puede re-emitir el mismo mensaje si Chromium hace
        // reload o si hay una reconexión en medio; sin este check, la IA
        // respondería dos veces al mismo `hola`.
        const messageId = message.id._serialized;
        const dedupeKey = `${REDIS_KEYS.MESSAGE_DEDUP}${messageId}`;
        logger.info(`[DEDUPE] Checking msgId=${messageId} session=${sessionId}`);
        const isFirstTime = await redisClient.setNX(
          dedupeKey,
          '1',
          REDIS_TTL.MESSAGE_DEDUP_SECONDS
        );
        if (!isFirstTime) {
          logger.info(
            `[DEDUPE] Skipping already-processed message ${messageId} in session ${sessionId}`
          );
          return;
        }

        // Fase A2 (2026-04-19): ignorar broadcasts y grupos ANTES de parsear
        // para no gastar work en mensajes que nunca debemos responder.
        // whatsapp-web.js usa sufijos de JID: `@c.us` = chat 1:1, `@g.us` =
        // grupo, `status@broadcast` = estados/status.
        if (message.from === 'status@broadcast') {
          logger.debug(`[FILTER] Skipping status@broadcast in session ${sessionId}`);
          return;
        }
        if (message.from?.endsWith('@g.us')) {
          logger.debug(
            `[FILTER] Skipping group message (from=${message.from}) in session ${sessionId}`
          );
          return;
        }

        // Throttled health check update — avoids DB/Redis writes on every message
        const now = Date.now();
        if (now - lastHealthUpdate > 30000) {
          lastHealthUpdate = now;
          await sessionManager.updateSessionStatus(sessionId, 'ready', {
            lastHealthCheck: new Date(),
          });
        }

        const whatsappMessage = await messageHandler.parseMessage(message, sessionId);
        logger.info(`Message received in session ${sessionId}:`, {
          from: whatsappMessage.from,
          body: whatsappMessage.body.substring(0, 100),
        });

        // Process with AI only if it's not from us AND if sender is in whitelist
        if (!whatsappMessage.fromMe && whatsappMessage.body.trim()) {
          const whitelistResult = await authChecker.checkPhoneNumberAllowedWithLog(
            whatsappMessage.from,
            sessionId,
            whatsappMessage.body
          );
          if (whitelistResult.allowed) {
            logger.info(`📱 Respuesta automática permitida para: ${whatsappMessage.from}`);
            await messageHandler.processMessageWithAI(message, whatsappMessage, sessionId);
          } else {
            logger.info(
              `🚫 Respuesta automática bloqueada para: ${whatsappMessage.from} - ${whitelistResult.reason}`
            );
          }
        }

        // Send webhook with message (always, regardless of AI processing)
        await this.sendWebhook({
          event: 'message',
          sessionId,
          data: whatsappMessage,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error(`Error processing message in session ${sessionId}:`, error);
      }
    };
    client.on('message', onMessage);
    listeners.push({ event: 'message', handler: onMessage });
  }

  /**
   * Remove all tracked event listeners and clear timeouts for a session
   */
  cleanupSessionListeners(client: Client, sessionId: string): void {
    // Remove tracked listeners
    const listeners = this.sessionListeners.get(sessionId);
    if (listeners) {
      for (const { event, handler } of listeners) {
        client.removeListener(event, handler);
      }
      this.sessionListeners.delete(sessionId);
      logger.debug(`Removed ${listeners.length} event listeners for session ${sessionId}`);
    }

    // Clear tracked timeouts
    const timeouts = this.sessionTimeouts.get(sessionId);
    if (timeouts) {
      for (const t of timeouts) clearTimeout(t);
      this.sessionTimeouts.delete(sessionId);
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhook(payload: WebhookPayload): Promise<void> {
    // Emit Socket.IO event first using unified facade
    try {
      const WhatsAppServiceModule = await import('../WhatsAppService');
      const whatsappServiceFacade = WhatsAppServiceModule.default;

      await whatsappServiceFacade.notifySocketEvent(payload);
      logger.debug(`📡 Socket.IO event emitted via facade for: ${payload.event}`);
    } catch (error) {
      logger.warn('⚠️ Failed to emit Socket.IO event via facade:', error);
      // Continue with webhook - don't let Socket.IO errors break webhook functionality
    }

    // Send traditional webhook if configured
    if (!this.webhookUrl) {
      logger.debug('No webhook URL configured, skipping HTTP webhook (Socket.IO event still sent)');
      return;
    }

    const secret = process.env.WHATSAPP_SERVICE_HMAC_SECRET;
    if (!secret) {
      logger.error('❌ Cannot send webhook: WHATSAPP_SERVICE_HMAC_SECRET is not configured');
      return;
    }

    const body = JSON.stringify(payload);
    const { timestamp, signature } = signServiceRequest(body, secret);

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-service-timestamp': timestamp,
          'x-service-signature': signature,
        },
        body,
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        logger.warn(
          `⚠️ Webhook failed with status ${response.status} for event ${payload.event}. This won't affect WhatsApp service functionality.`
        );
        return;
      }

      logger.debug(`🚀 HTTP webhook sent successfully for event ${payload.event}`);
    } catch (error) {
      logger.warn(`⚠️ Webhook delivery failed for event ${payload.event}:`, {
        error: error instanceof Error ? error.message : String(error),
        webhookUrl: this.webhookUrl,
        suggestion: 'Check if the webhook endpoint exists and is accessible',
      });

      // Don't throw error - webhook failures should not interrupt WhatsApp functionality
    }
  }

  /**
   * Send force disconnect webhook
   */
  async sendForceDisconnectWebhook(sessionId: string): Promise<void> {
    await this.sendWebhook({
      event: 'force_disconnected',
      sessionId,
      data: { timestamp: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send browser disconnect webhook
   */
  async sendBrowserDisconnectWebhook(sessionId: string, disconnectType: string): Promise<void> {
    await this.sendWebhook({
      event: 'browser_closed',
      sessionId,
      data: {
        disconnectType,
        timestamp: new Date().toISOString(),
        autoReconnect: false,
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Update webhook URL
   */
  setWebhookUrl(webhookUrl: string): void {
    this.webhookUrl = webhookUrl;
    logger.info(`📡 Webhook URL updated: ${webhookUrl}`);
  }

  /**
   * Get current webhook URL
   */
  getWebhookUrl(): string | undefined {
    return this.webhookUrl;
  }

  /**
   * Test webhook connectivity
   */
  async testWebhook(): Promise<{ success: boolean; error?: string }> {
    if (!this.webhookUrl) {
      return { success: false, error: 'No webhook URL configured' };
    }

    const secret = process.env.WHATSAPP_SERVICE_HMAC_SECRET;
    if (!secret) {
      return {
        success: false,
        error: 'WHATSAPP_SERVICE_HMAC_SECRET is not configured',
      };
    }

    try {
      const testPayload = {
        event: 'webhook_test',
        sessionId: 'test',
        data: { test: true, timestamp: new Date().toISOString() },
        timestamp: new Date().toISOString(),
      };

      const body = JSON.stringify(testPayload);
      const { timestamp, signature } = signServiceRequest(body, secret);

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-service-timestamp': timestamp,
          'x-service-signature': signature,
        },
        body,
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        logger.info('✅ Webhook test successful');
        return { success: true };
      } else {
        const error = `Webhook test failed with status ${response.status}`;
        logger.warn(`⚠️ ${error}`);
        return { success: false, error };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorMessage = `Webhook test failed: ${message}`;
      logger.error(`❌ ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }
}

export default EventDispatcher;
