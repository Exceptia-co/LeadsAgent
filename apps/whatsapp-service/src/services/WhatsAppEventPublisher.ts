import { logger } from '../utils/logger';
import type { WebhookPayload } from '../types';
import { signServiceRequest } from '../middleware/auth';

/**
 * Emits session and message events to the dashboard (Socket.IO) and to the
 * Nest API (HMAC-signed HTTP webhook).
 *
 * Extracted from EventDispatcher so the engine cutover can delete that class
 * without taking the emission path with it. Nothing here is engine-specific.
 */
export class WhatsAppEventPublisher {
  constructor(private webhookUrl?: string) {}

  /**
   * Send webhook notification
   */
  async sendWebhook(payload: WebhookPayload): Promise<void> {
    // Emit Socket.IO event first using unified facade
    try {
      const WhatsAppServiceModule = await import('./WhatsAppService');
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

export default WhatsAppEventPublisher;
