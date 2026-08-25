import type { Client, Message } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { logger } from '../../utils/logger';
import advancedLogger from '../../utils/advancedLogger';
import type { NormalizedWhatsAppMessage } from '../../types/messages';
import type { ReplyPort } from '../../types/reply-port';
import redisClient, { REDIS_KEYS } from '../../config/redis';
import { normalizeWwebjsMessage } from './wwebjs-normalizer';
import { IncomingMessagePipeline } from './IncomingMessagePipeline';
import { makeWwebjsReplyPort } from './wwebjs-reply-port';
import { WhatsAppEventPublisher } from '../WhatsAppEventPublisher';

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
  private publisher: WhatsAppEventPublisher;
  private sessionListeners: Map<
    string,
    Array<{ event: string; handler: (...args: any[]) => any }>
  > = new Map();
  private sessionTimeouts: Map<string, NodeJS.Timeout[]> = new Map();

  constructor(webhookUrl?: string) {
    this.publisher = new WhatsAppEventPublisher(webhookUrl);
  }

  /**
   * Set up all WhatsApp client event listeners
   */
  setupClientEventListeners(
    client: Client,
    sessionId: string,
    messageHandler: {
      processMessageWithAI: (dto: NormalizedWhatsAppMessage, port: ReplyPort) => Promise<void>;
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

    // The pipeline is engine-agnostic. Message only appears below, where this
    // dispatcher wraps it in a ReplyPort.
    const pipeline = new IncomingMessagePipeline({
      authChecker,
      messageHandler,
      sessionManager,
      sendWebhook: this.publisher.sendWebhook.bind(this.publisher),
    });

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
      await this.publisher.sendWebhook({
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
      await this.publisher.sendWebhook({
        event: 'authenticated',
        sessionId,
        data: { number: clientInfo?.wid?.user },
        timestamp: new Date().toISOString(),
      });
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
      await this.publisher.sendWebhook({
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

      // Clean up stale auth files so next reconnect requires fresh QR
      if (onAuthInvalidated) {
        onAuthInvalidated(sessionId, 'auth_failure').catch(err => {
          logger.warn(`Auth invalidation cleanup failed for ${sessionId}:`, err);
        });
      }

      // Send webhook
      await this.publisher.sendWebhook({
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
      await this.publisher.sendWebhook({
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

        // Clean up stale auth files so next reconnect requires fresh QR
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
      try {
        if (message.from === 'status@broadcast') {
          logger.debug(`[FILTER] Skipping status@broadcast in session ${sessionId}`);
          return;
        }

        const dto = normalizeWwebjsMessage(message, sessionId);
        if (!dto) {
          logger.warn(
            `[NORMALIZE] Dropping unparseable message in session ${sessionId} from=${message.from}`
          );
          return;
        }

        await pipeline.handle(dto, makeWwebjsReplyPort(message));
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
   * Send force disconnect webhook
   */
  async sendForceDisconnectWebhook(sessionId: string): Promise<void> {
    return this.publisher.sendForceDisconnectWebhook(sessionId);
  }

  /**
   * Send browser disconnect webhook
   */
  async sendBrowserDisconnectWebhook(sessionId: string, disconnectType: string): Promise<void> {
    return this.publisher.sendBrowserDisconnectWebhook(sessionId, disconnectType);
  }

  /**
   * Update webhook URL
   */
  setWebhookUrl(webhookUrl: string): void {
    this.publisher.setWebhookUrl(webhookUrl);
  }

  /**
   * Get current webhook URL
   */
  getWebhookUrl(): string | undefined {
    return this.publisher.getWebhookUrl();
  }

  /**
   * Test webhook connectivity
   */
  async testWebhook(): Promise<{ success: boolean; error?: string }> {
    return this.publisher.testWebhook();
  }
}

export default EventDispatcher;
