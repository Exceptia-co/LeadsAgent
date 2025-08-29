import whatsappService from './WhatsAppServiceSimple';
import { cacheService } from './cacheService';
import { redisClient, REDIS_KEYS, REDIS_CHANNELS } from '../config/redis';
import { logger } from '../utils/logger';
import { SendMessageResponse } from '../types';

/**
 * Servicio de WhatsApp mejorado que usa composición con Redis
 * Usa el servicio simple internamente y añade funcionalidades de cache
 */
class WhatsAppServiceWithRedis {
  private isRedisConnected: boolean = false;

  constructor() {
    this.checkRedisConnection();
  }

  /**
   * Verifica la conexión a Redis
   */
  private async checkRedisConnection(): Promise<void> {
    try {
      this.isRedisConnected = await redisClient.ping();
      if (this.isRedisConnected) {
        logger.info('🟢 WhatsApp with Redis: Connection verified');
      } else {
        logger.warn('🟡 WhatsApp with Redis: Not available, falling back to basic functionality');
      }
    } catch (error) {
      this.isRedisConnected = false;
      logger.warn('🟡 WhatsApp with Redis: Connection failed, cache disabled:', error);
    }
  }

  /**
   * Inicializa el servicio WhatsApp
   */
  async initialize(): Promise<void> {
    await whatsappService.initialize();
    
    // Start Redis monitoring if connected
    if (this.isRedisConnected) {
      await this.startRedisMonitoring();
      logger.info('🎧 Redis monitoring started for WhatsApp service');
    }
  }

  /**
   * Wrapper mejorado para sendMessage con cache y estadísticas
   */
  async sendMessage(sessionId: string, to: string, message: string): Promise<SendMessageResponse> {
    // Incrementar estadísticas
    if (this.isRedisConnected) {
      await cacheService.incrementStats('messages_sent_total');
      await cacheService.incrementStats(`messages_sent_session_${sessionId}`);
    }

    // Verificar rate limiting
    if (this.isRedisConnected) {
      const normalizedPhone = this.normalizePhoneForCache(to);
      const rateLimitOk = await cacheService.checkRateLimit(normalizedPhone, 10, 60); // 10 mensajes por minuto
      
      if (!rateLimitOk) {
        logger.warn(`🚫 Rate limit exceeded for ${normalizedPhone}`);
        return {
          success: false,
          error: 'Rate limit exceeded. Please wait before sending more messages.',
        };
      }
    }

    // Llamar al servicio original
    const result = await whatsappService.sendMessage(sessionId, to, message);

    // Cache del resultado si fue exitoso
    if (result.success && this.isRedisConnected) {
      await cacheService.incrementStats('messages_sent_success');
      
      // Publicar evento de mensaje enviado
      await redisClient.publishObject(REDIS_CHANNELS.MESSAGE_EVENTS, {
        event: 'message_sent',
        sessionId,
        to: to,
        message: message,
        timestamp: new Date().toISOString(),
        success: true
      });
    } else if (!result.success && this.isRedisConnected) {
      await cacheService.incrementStats('messages_sent_failed');
    }

    return result;
  }

  /**
   * Obtiene estadísticas del servicio
   */
  async getServiceStats(): Promise<any> {
    if (!this.isRedisConnected) {
      return {
        redis_connected: false,
        message: 'Redis not available, no stats collected'
      };
    }

    const metrics = [
      'messages_sent_total',
      'messages_sent_success',
      'messages_sent_failed',
      'conversations_saved_total',
      'conversations_incoming_total',
      'conversations_outgoing_total',
      'ai_responses_generated'
    ];

    const stats = await cacheService.getMultipleStats(metrics);
    
    return {
      redis_connected: true,
      stats,
      cache_info: await cacheService.getCacheInfo(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Limpia cache de un teléfono específico
   */
  async clearPhoneCache(telefono: string): Promise<void> {
    if (!this.isRedisConnected) {
      logger.warn('🟡 Redis not connected, cannot clear cache');
      return;
    }

    const normalizedPhone = this.normalizePhoneForCache(telefono);
    await cacheService.clearPhoneCache(normalizedPhone);
    logger.info(`🗑️ Cache cleared for phone: ${normalizedPhone}`);
  }

  /**
   * Inicia monitoreo de eventos Redis
   */
  async startRedisMonitoring(): Promise<void> {
    if (!this.isRedisConnected) {
      logger.warn('🟡 Cannot start Redis monitoring, not connected');
      return;
    }

    // Suscribirse a eventos del sistema
    await redisClient.subscribe(REDIS_CHANNELS.SYSTEM_EVENTS, (message) => {
      try {
        const event = JSON.parse(message);
        logger.info(`🔔 System event received:`, event);
        
        // Manejar eventos específicos del sistema si es necesario
        if (event.event === 'cache_clear_all') {
          logger.info('🗑️ System-wide cache clear requested');
        }
      } catch (error) {
        logger.error('Error processing system event:', error);
      }
    });

    logger.info('🎧 Redis monitoring started for WhatsApp service');
  }

  /**
   * Para monitoreo de Redis
   */
  async stopRedisMonitoring(): Promise<void> {
    if (!this.isRedisConnected) return;

    await redisClient.unsubscribe(REDIS_CHANNELS.SYSTEM_EVENTS);
    logger.info('🛑 Redis monitoring stopped for WhatsApp service');
  }

  /**
   * Shutdown del servicio
   */
  async shutdown(): Promise<void> {
    logger.info('🛑 Shutting down WhatsApp with Redis Service...');
    
    // Parar monitoreo de Redis
    await this.stopRedisMonitoring();
    
    // Llamar al shutdown del servicio base
    await whatsappService.shutdown();
    
    logger.info('✅ WhatsApp with Redis Service shutdown completed');
  }

  // ============ MÉTODOS DELEGADOS AL SERVICIO BASE ============

  /**
   * Delega la creación de sesiones al servicio base
   */
  async createSession(sessionId: string) {
    const result = await whatsappService.createSession(sessionId);
    
    // Cache del estado de sesión si Redis está disponible
    if (this.isRedisConnected) {
      await cacheService.setSessionStatus(sessionId, 'connecting', {
        created: new Date().toISOString()
      });
    }
    
    return result;
  }

  /**
   * Delega obtención de sesiones al servicio base
   */
  getAllSessions() {
    return whatsappService.getAllSessions();
  }

  /**
   * Delega obtención de sesión específica al servicio base
   */
  getSession(sessionId: string) {
    return whatsappService.getSession(sessionId);
  }

  /**
   * Delega eliminación de sesión al servicio base
   */
  async deleteSession(sessionId: string) {
    const result = await whatsappService.destroySession(sessionId);
    
    // Limpiar cache de sesión si Redis está disponible
    if (this.isRedisConnected) {
      await redisClient.del(`${REDIS_KEYS.SESSION_STATUS}${sessionId}`);
    }
    
    return result;
  }

  /**
   * Delega obtención de QR al servicio base
   */
  getQRCode(sessionId: string) {
    const session = whatsappService.getSessionStatus(sessionId);
    return session?.qrCode || null;
  }

  /**
   * Delega obtención de estado de sesión al servicio base
   */
  async getSessionStatus(sessionId: string) {
    const status = whatsappService.getSessionStatus(sessionId);
    
    // Cache del estado si Redis está disponible
    if (this.isRedisConnected && status) {
      await cacheService.setSessionStatus(sessionId, status.status, status);
    }
    
    return status;
  }

  /**
   * Delega obtención de analíticas al servicio base
   */
  getAnalytics() {
    // For now return basic analytics
    return {
      totalSessions: whatsappService.getAllSessions().length,
      timestamp: new Date().toISOString()
    };
  }

  // ============ MÉTODOS PRIVADOS DE UTILIDAD ============

  private normalizePhoneForCache(telefono: string): string {
    // Normalizar teléfono para uso consistente en cache
    return telefono.replace(/[^0-9]/g, '').replace(/^1/, ''); // Remover caracteres no numéricos y '1' inicial
  }
}

export default WhatsAppServiceWithRedis;
