import { logger } from '../utils/logger';
import type { WebhookPayload } from '../types';

/**
 * Emits session and message events to the dashboard over Socket.IO.
 *
 * Extracted from EventDispatcher so the engine cutover can delete that class
 * without taking the emission path with it. Nothing here is engine-specific.
 */
export class WhatsAppEventPublisher {
  constructor() {}

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
    }
  }
}

export default WhatsAppEventPublisher;
