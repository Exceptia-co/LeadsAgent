import WhatsAppServiceSimple from './WhatsAppServiceSimple';
import { cacheService } from './cacheService';
import { redisClient, REDIS_KEYS, REDIS_CHANNELS } from '../config/redis';
import { logger } from '../utils/logger';
import DatabaseService from './DatabaseService';

interface Lead {
  id: string;
  nombre: string | null;
  telefono: string;
  email: string | null;
  estado: string;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

interface Conversation {
  id: string;
  telefono: string;
  mensaje: string;
  tipo: 'incoming' | 'outgoing';
  timestamp: string;
  lead_id?: string;
}

interface AIResponseWithCache {
  response: string;
  fromCache: boolean;
  cacheKey?: string;
}

/**
 * Servicio de WhatsApp mejorado con integración de Redis
 * Extiende el servicio simple con capacidades de cache y pub/sub
 */
class WhatsAppServiceEnhanced extends WhatsAppServiceSimple {
  private isRedisConnected: boolean = false;

  constructor() {
    super();
    this.checkRedisConnection();
  }

  /**
   * Verifica la conexión a Redis
   */
  private async checkRedisConnection(): Promise<void> {
    try {
      this.isRedisConnected = await redisClient.ping();
      if (this.isRedisConnected) {
        logger.info('🟢 WhatsApp Enhanced Service: Redis connection verified');
      } else {
        logger.warn('🟡 WhatsApp Enhanced Service: Redis not available, falling back to basic functionality');
      }
    } catch (error) {
      this.isRedisConnected = false;
      logger.warn('🟡 WhatsApp Enhanced Service: Redis connection failed, cache disabled:', error);
    }
  }

  /**
   * Override del método sendMessage para agregar cache y estadísticas
   */
  async sendMessage(sessionId: string, to: string, message: string) {
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
          code: 'RATE_LIMIT_EXCEEDED'
        };
      }
    }

    // Llamar al método padre
    const result = await super.sendMessage(sessionId, to, message);

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
   * Obtiene un lead con cache optimizado
   */
  async getLeadWithCache(telefono: string): Promise<Lead | null> {
    if (!this.isRedisConnected) {
      return this.getLeadFromDatabase(telefono);
    }

    const normalizedPhone = this.normalizePhoneForCache(telefono);
    
    // Intentar obtener desde cache
    const cachedLead = await cacheService.getLead(normalizedPhone);
    if (cachedLead) {
      logger.debug(`📞 Lead found in cache: ${normalizedPhone}`);
      return cachedLead;
    }

    // Si no está en cache, obtener de base de datos
    const lead = await this.getLeadFromDatabase(normalizedPhone);
    
    // Guardar en cache si se encontró
    if (lead) {
      await cacheService.setLead(normalizedPhone, lead);
    }

    return lead;
  }

  /**
   * Obtiene conversaciones recientes con cache
   */
  async getRecentConversationsWithCache(telefono: string, limit: number = 10): Promise<Conversation[]> {
    if (!this.isRedisConnected) {
      return this.getConversationsFromDatabase(telefono, limit);
    }

    const normalizedPhone = this.normalizePhoneForCache(telefono);
    
    // Intentar obtener desde cache
    const cachedConversations = await cacheService.getRecentConversations(normalizedPhone, limit);
    if (cachedConversations) {
      logger.debug(`💬 Conversations found in cache: ${normalizedPhone} (${cachedConversations.length} items)`);
      return cachedConversations;
    }

    // Si no están en cache, obtener de base de datos
    const conversations = await this.getConversationsFromDatabase(normalizedPhone, limit);
    
    // Guardar en cache
    if (conversations.length > 0) {
      await cacheService.setRecentConversations(normalizedPhone, conversations, limit);
    }

    return conversations;
  }

  /**
   * Procesa respuesta de IA con cache inteligente
   */
  async getAIResponseWithCache(telefono: string, mensaje: string, context?: any): Promise<AIResponseWithCache> {
    if (!this.isRedisConnected) {
      const response = await this.generateAIResponseFromService(telefono, mensaje, context);
      return { response, fromCache: false };
    }

    const normalizedPhone = this.normalizePhoneForCache(telefono);
    
    // Intentar obtener respuesta cacheada
    const cachedResponse = await cacheService.getAIResponse(normalizedPhone, mensaje);
    if (cachedResponse) {
      logger.debug(`🤖 AI response found in cache: ${normalizedPhone}`);
      return { 
        response: cachedResponse, 
        fromCache: true,
        cacheKey: `ai:${normalizedPhone}:${mensaje.slice(0, 20)}`
      };
    }

    // Generar nueva respuesta
    const newResponse = await this.generateAIResponseFromService(telefono, mensaje, context);
    
    // Guardar en cache
    await cacheService.setAIResponse(normalizedPhone, mensaje, newResponse);
    
    // Incrementar estadísticas
    await cacheService.incrementStats('ai_responses_generated');
    
    return { 
      response: newResponse, 
      fromCache: false 
    };
  }

  /**
   * Invalida cache cuando se actualiza un lead
   */
  async updateLeadAndInvalidateCache(telefono: string, updateData: Partial<Lead>): Promise<void> {
    const normalizedPhone = this.normalizePhoneForCache(telefono);
    
    // Actualizar en base de datos
    await this.updateLeadInDatabase(normalizedPhone, updateData);
    
    // Invalidar cache si Redis está disponible
    if (this.isRedisConnected) {
      await cacheService.invalidateLead(normalizedPhone);
      await cacheService.invalidateConversations(normalizedPhone);
      
      // Publicar evento de lead actualizado
      await redisClient.publishObject(REDIS_CHANNELS.LEAD_EVENTS, {
        event: 'lead_updated',
        telefono: normalizedPhone,
        updateData,
        timestamp: new Date().toISOString()
      });
    }

    logger.info(`📞 Lead updated and cache invalidated: ${normalizedPhone}`);
  }

  /**
   * Guarda una nueva conversación e invalida cache relacionado
   */
  async saveConversationAndUpdateCache(conversation: Omit<Conversation, 'id'>): Promise<void> {
    // Guardar en base de datos
    await this.saveConversationToDatabase(conversation);
    
    const normalizedPhone = this.normalizePhoneForCache(conversation.telefono);
    
    // Invalidar cache de conversaciones si Redis está disponible
    if (this.isRedisConnected) {
      await cacheService.invalidateConversations(normalizedPhone);
      
      // Publicar evento de nueva conversación
      await redisClient.publishObject(REDIS_CHANNELS.MESSAGE_EVENTS, {
        event: 'conversation_saved',
        telefono: normalizedPhone,
        conversation,
        timestamp: new Date().toISOString()
      });
      
      // Incrementar estadísticas
      await cacheService.incrementStats('conversations_saved_total');
      await cacheService.incrementStats(`conversations_${conversation.tipo}_total`);
    }

    logger.debug(`💬 Conversation saved and cache updated: ${normalizedPhone}`);
  }

  /**
   * Override del método para actualizar estado de sesión con cache
   */
  updateSessionStatus(sessionId: string, status: string, additionalData?: any): void {
    // Llamar al método padre
    super.updateSessionStatus(sessionId, status, additionalData);
    
    // Actualizar estado en Redis si está disponible
    if (this.isRedisConnected) {
      cacheService.setSessionStatus(sessionId, status, {
        ...additionalData,
        updatedAt: new Date().toISOString()
      });
      
      // Publicar evento de cambio de estado
      redisClient.publishObject(REDIS_CHANNELS.SESSION_EVENTS, {
        event: 'session_status_changed',
        sessionId,
        status,
        additionalData,
        timestamp: new Date().toISOString()
      });
    }
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

  // ============ MÉTODOS PRIVADOS DE UTILIDAD ============

  private normalizePhoneForCache(telefono: string): string {
    // Normalizar teléfono para uso consistente en cache
    return telefono.replace(/[^0-9]/g, '').replace(/^1/, ''); // Remover caracteres no numéricos y '1' inicial
  }

  private async getLeadFromDatabase(telefono: string): Promise<Lead | null> {
    try {
      // Implementar lógica para obtener lead de la base de datos
      return await DatabaseService.getLeadByPhone(telefono);
    } catch (error) {
      logger.error('Error getting lead from database:', error);
      return null;
    }
  }

  private async getConversationsFromDatabase(telefono: string, limit: number): Promise<Conversation[]> {
    try {
      // Implementar lógica para obtener conversaciones de la base de datos
      return await DatabaseService.getRecentConversations(telefono, limit);
    } catch (error) {
      logger.error('Error getting conversations from database:', error);
      return [];
    }
  }

  private async generateAIResponseFromService(telefono: string, mensaje: string, context?: any): Promise<string> {
    try {
      // Implementar lógica para generar respuesta de IA
      // Esto debería usar el servicio de IA existente
      const AIService = await import('./AIService');
      return await AIService.default.generateResponse(mensaje, context);
    } catch (error) {
      logger.error('Error generating AI response:', error);
      return 'Lo siento, no pude procesar tu mensaje en este momento. Por favor intenta de nuevo.';
    }
  }

  private async updateLeadInDatabase(telefono: string, updateData: Partial<Lead>): Promise<void> {
    try {
      await DatabaseService.updateLeadByPhone(telefono, updateData);
    } catch (error) {
      logger.error('Error updating lead in database:', error);
    }
  }

  private async saveConversationToDatabase(conversation: Omit<Conversation, 'id'>): Promise<void> {
    try {
      await DatabaseService.saveConversation(conversation);
    } catch (error) {
      logger.error('Error saving conversation to database:', error);
    }
  }

  // ============ MÉTODOS DE MONITOREO ============

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
   * Override del método shutdown para limpiar Redis
   */
  async shutdown(): Promise<void> {
    logger.info('🛑 Shutting down WhatsApp Enhanced Service...');
    
    // Parar monitoreo de Redis
    await this.stopRedisMonitoring();
    
    // Llamar al shutdown del padre
    await super.shutdown();
    
    logger.info('✅ WhatsApp Enhanced Service shutdown completed');
  }
}

export default WhatsAppServiceEnhanced;
