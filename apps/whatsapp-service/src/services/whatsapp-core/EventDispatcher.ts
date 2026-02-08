import type { Client, Message } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { logger } from '../../utils/logger';
import advancedLogger from '../../utils/advancedLogger';
import type { WhatsAppMessage, WebhookPayload } from '../../types';

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
    }
  ): void {
    // ─── Diagnostic logging for event flow debugging ───
    logger.info(`[DIAG] Setting up event listeners for session ${sessionId}`);

    // QR Code event
    client.on('qr', async qr => {
      logger.info(`[DIAG] QR event fired for session ${sessionId}`);
      logger.info(`QR Code generated for session ${sessionId}`);

      // Generate QR code for terminal display (development)
      if (process.env.NODE_ENV !== 'production') {
        qrcode.generate(qr, { small: true });
      }

      // Store QR code in session
      await sessionManager.updateSessionStatus(sessionId, 'connecting', { qrCode: qr });

      // Send webhook
      await this.sendWebhook({
        event: 'qr_updated',
        sessionId,
        data: { qrCode: qr },
        timestamp: new Date().toISOString(),
      });
    });

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
    });

    // Authenticated event (once: whatsapp-web.js may emit this multiple times due to hasSynced race condition)
    client.once('authenticated', async () => {
      logger.info(`[DIAG] AUTHENTICATED event fired for session ${sessionId}`);
      logger.info(`WhatsApp client ${sessionId} authenticated`);
      await sessionManager.updateSessionStatus(sessionId, 'authenticated');

      // Safety timeout: if ready doesn't arrive within 90s after authenticated, log warning
      const readyTimeout = setTimeout(() => {
        logger.warn(`[DIAG] Session ${sessionId}: READY event NOT received 90s after AUTHENTICATED. Client info: ${client.info ? 'has info' : 'no info'}`);
        logger.warn(`[DIAG] Session ${sessionId}: This likely means attachEventListeners() in whatsapp-web.js is stuck waiting for window.Store`);
      }, 90000);

      client.once('ready', () => {
        clearTimeout(readyTimeout);
        logger.info(`[DIAG] Session ${sessionId}: READY arrived after AUTHENTICATED (safety timeout cleared)`);
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
    client.on('auth_failure', async msg => {
      logger.error(`Authentication failed for session ${sessionId}:`, msg);
      await sessionManager.updateSessionStatus(sessionId, 'auth_failure', {
        lastError: `Authentication failed: ${msg}`,
      });

      // Send webhook
      await this.sendWebhook({
        event: 'status_change',
        sessionId,
        data: { status: 'auth_failure', message: msg },
        timestamp: new Date().toISOString(),
      });
    });

    // Disconnected event - Enhanced with reason detection
    client.on('disconnected', async reason => {
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
    });

    // State change event - Detect WhatsApp Web states
    client.on('change_state', async state => {
      logger.info(`WhatsApp client ${sessionId} state changed:`, state);

      // Handle different WhatsApp Web states
      if (state === 'UNPAIRED' || state === 'UNPAIRED_IDLE') {
        logger.warn(`Session ${sessionId} became unpaired, marking as disconnected`);
        await sessionManager.handleSessionDisconnect(
          sessionId,
          'WHATSAPP_UNPAIRED',
          `State: ${state}`
        );
      } else if (state === 'TIMEOUT') {
        logger.warn(`Session ${sessionId} timed out`);
        await sessionManager.handleSessionDisconnect(
          sessionId,
          'WHATSAPP_TIMEOUT',
          `State: ${state}`
        );
      }
    });

    // Loading screen event - Detect when WhatsApp Web shows loading screen
    client.on('loading_screen', async (percent: string, message: string) => {
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
    });

    // Message event
    client.on('message', async (message: Message) => {
      logger.info(`[DIAG] MESSAGE event fired for session ${sessionId} from=${message.from} body=${message.body?.substring(0, 50)}`);
      try {
        // Update last health check on successful message receipt
        await sessionManager.updateSessionStatus(sessionId, 'ready', {
          lastHealthCheck: new Date(),
        });

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
    });
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

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WhatsApp-Service': 'true',
        },
        body: JSON.stringify(payload),
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (!response.ok) {
        logger.warn(
          `⚠️ Webhook failed with status ${response.status} for event ${payload.event}. This won't affect WhatsApp service functionality.`
        );
        return;
      }

      logger.debug(`🚀 HTTP webhook sent successfully for event ${payload.event}`);
    } catch (error: any) {
      // Log warning instead of error to reduce noise, and include helpful context
      logger.warn(`⚠️ Webhook delivery failed for event ${payload.event}:`, {
        error: error.message,
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

    try {
      const testPayload = {
        event: 'webhook_test',
        sessionId: 'test',
        data: { test: true, timestamp: new Date().toISOString() },
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WhatsApp-Service': 'true',
        },
        body: JSON.stringify(testPayload),
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
    } catch (error: any) {
      const errorMessage = `Webhook test failed: ${error.message}`;
      logger.error(`❌ ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }
}

export default EventDispatcher;
