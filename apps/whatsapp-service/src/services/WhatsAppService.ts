import WhatsAppServiceSimple from './WhatsAppServiceSimple';
import { cacheService } from './cacheService';
import { redisClient, REDIS_CHANNELS, REDIS_KEYS } from '../config/redis';
import { logger } from '../utils/logger';
import DatabaseService from './DatabaseService';
import { WhatsAppSession, SendMessageResponse } from '../types';
import { WhatsAppUtils, RedisUtils } from '../utils/whatsappUtils';
import { WhatsAppStatsService } from './whatsapp/WhatsAppStatsService';
import { RedisMonitoringService } from './whatsapp/RedisMonitoringService';

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

class WhatsAppService {
  private isRedisConnected: boolean = false;
  private baseService: typeof WhatsAppServiceSimple;
  private statsService: WhatsAppStatsService;
  private redisMonitoring: RedisMonitoringService;

  constructor() {
    this.baseService = WhatsAppServiceSimple;
    this.statsService = new WhatsAppStatsService(redisClient);
    this.redisMonitoring = new RedisMonitoringService(redisClient);
    this.initialize();
  }

  public async initialize(): Promise<void> {
    await this.checkRedisConnection();
    await this.statsService.loadStatsFromRedis();
  }

  private async checkRedisConnection(): Promise<void> {
    try {
      this.isRedisConnected = await RedisUtils.checkConnection(redisClient);
      if (this.isRedisConnected) {
        logger.info('🟢 WhatsApp Service: Redis connection verified');
      } else {
        logger.warn('🟡 WhatsApp Service: Redis not available, falling back to basic functionality');
      }
    } catch (error) {
      this.isRedisConnected = false;
      logger.warn('🟡 WhatsApp Service: Redis connection failed, cache disabled:', error);
    }
  }

  async sendMessage(sessionId: string, to: string, message: string): Promise<SendMessageResponse> {
    this.statsService.incrementMessagesSent();

    if (this.isRedisConnected) {
      const normalizedPhone = WhatsAppUtils.normalizePhoneForCache(to);
      const rateLimitOk = await cacheService.checkRateLimit(normalizedPhone, 10, 60);
      
      if (!rateLimitOk) {
        logger.warn(`🚫 Rate limit exceeded for ${normalizedPhone}`);
        this.statsService.incrementErrors();
        return {
          success: false,
          error: 'Rate limit exceeded. Please wait before sending more messages.',
        };
      }
    }

    const result = await this.baseService.sendMessage(sessionId, to, message);

    if (result.success && this.isRedisConnected) {
      await RedisUtils.safePublish(redisClient, REDIS_CHANNELS.MESSAGE_EVENTS, {
        event: 'message_sent',
        sessionId,
        to: to,
        message: message,
        timestamp: WhatsAppUtils.getTimestamp(),
        success: true
      });
    } else if (!result.success) {
      this.statsService.incrementErrors();
    }

    return result;
  }

  async getLeadWithCache(telefono: string): Promise<Lead | null> {
    if (!this.isRedisConnected) {
      return this.getLeadFromDatabase(telefono);
    }

    const normalizedPhone = WhatsAppUtils.normalizePhoneForCache(telefono);
    
    const cachedLead = await cacheService.getLead(normalizedPhone);
    if (cachedLead) {
      logger.debug(`📞 Lead found in cache: ${normalizedPhone}`);
      return cachedLead;
    }

    const lead = await this.getLeadFromDatabase(normalizedPhone);
    
    if (lead) {
      await cacheService.setLead(normalizedPhone, lead);
    }

    return lead;
  }

  async getRecentConversationsWithCache(telefono: string, limit: number = 10): Promise<Conversation[]> {
    if (!this.isRedisConnected) {
      return this.getConversationsFromDatabase(telefono, limit);
    }

    const normalizedPhone = WhatsAppUtils.normalizePhoneForCache(telefono);
    
    const cachedConversations = await cacheService.getRecentConversations(normalizedPhone, limit);
    if (cachedConversations) {
      logger.debug(`💬 Conversations found in cache: ${normalizedPhone} (${cachedConversations.length} items)`);
      return cachedConversations;
    }

    const conversations = await this.getConversationsFromDatabase(normalizedPhone, limit);
    
    if (conversations.length > 0) {
      await cacheService.setRecentConversations(normalizedPhone, conversations, limit);
    }

    return conversations;
  }

  async getAIResponseWithCache(telefono: string, mensaje: string, context?: any): Promise<AIResponseWithCache> {
    if (!this.isRedisConnected) {
      const response = await this.generateAIResponseFromService(telefono, mensaje, context);
      return { response, fromCache: false };
    }

    const normalizedPhone = WhatsAppUtils.normalizePhoneForCache(telefono);
    
    const cachedResponse = await cacheService.getAIResponse(normalizedPhone, mensaje);
    if (cachedResponse) {
      logger.debug(`🤖 AI response found in cache: ${normalizedPhone}`);
      return { 
        response: cachedResponse, 
        fromCache: true,
        cacheKey: `ai:${normalizedPhone}:${mensaje.slice(0, 20)}`
      };
    }

    const newResponse = await this.generateAIResponseFromService(telefono, mensaje, context);
    
    await cacheService.setAIResponse(normalizedPhone, mensaje, newResponse);
    
    return { 
      response: newResponse, 
      fromCache: false 
    };
  }

  async updateLeadAndInvalidateCache(telefono: string, updateData: Partial<Lead>): Promise<void> {
    const normalizedPhone = WhatsAppUtils.normalizePhoneForCache(telefono);
    
    await this.updateLeadInDatabase(normalizedPhone, updateData);
    
    if (this.isRedisConnected) {
      await cacheService.invalidateLead(normalizedPhone);
      await cacheService.invalidateConversations(normalizedPhone);
      
      await RedisUtils.safePublish(redisClient, REDIS_CHANNELS.LEAD_EVENTS, {
        event: 'lead_updated',
        telefono: normalizedPhone,
        updateData,
        timestamp: WhatsAppUtils.getTimestamp()
      });
    }

    logger.info(`📞 Lead updated and cache invalidated: ${normalizedPhone}`);
  }

  async saveConversationAndUpdateCache(conversation: Omit<Conversation, 'id'>): Promise<void> {
    await this.saveConversationToDatabase(conversation);
    
    const normalizedPhone = WhatsAppUtils.normalizePhoneForCache(conversation.telefono);
    
    if (this.isRedisConnected) {
      await cacheService.invalidateConversations(normalizedPhone);
      
      await RedisUtils.safePublish(redisClient, REDIS_CHANNELS.MESSAGE_EVENTS, {
        event: 'conversation_saved',
        telefono: normalizedPhone,
        conversation,
        timestamp: WhatsAppUtils.getTimestamp()
      });
    }

    if (conversation.tipo === 'incoming') {
      this.statsService.incrementMessagesReceived();
    }

    logger.debug(`💬 Conversation saved and cache updated: ${normalizedPhone}`);
  }

  async updateSessionStatus(sessionId: string, status: string, additionalData?: any): Promise<void> {
    const session = this.baseService.getSession(sessionId);
    if (session) {
      session.status = status as any;
      session.lastSeen = new Date();
      if (additionalData) {
        Object.assign(session, additionalData);
      }
    }
    
    if (this.isRedisConnected) {
      await cacheService.setSessionStatus(sessionId, status, {
        ...additionalData,
        updatedAt: new Date().toISOString()
      });
      
      await RedisUtils.safePublish(redisClient, REDIS_CHANNELS.SESSION_EVENTS, {
        event: 'session_status_changed',
        sessionId,
        status,
        additionalData,
        timestamp: WhatsAppUtils.getTimestamp()
      });
    }
  }

  async getServiceStats(): Promise<any> {
    const baseStats = this.statsService.getStats();
    
    if (!this.isRedisConnected) {
      return {
        redis_connected: false,
        stats: baseStats,
        message: 'Redis not available, using local stats only'
      };
    }

    const cacheMetrics = [
      'messages_sent_total',
      'messages_sent_success', 
      'messages_sent_failed',
      'conversations_saved_total',
      'conversations_incoming_total',
      'conversations_outgoing_total',
      'ai_responses_generated'
    ];

    const cacheStats = await cacheService.getMultipleStats(cacheMetrics);
    
    return {
      redis_connected: true,
      stats: {
        ...baseStats,
        cache: cacheStats
      },
      cache_info: await cacheService.getCacheInfo(),
      redis_health: await this.redisMonitoring.getLastHealthStatus(),
      timestamp: WhatsAppUtils.getTimestamp()
    };
  }

  async clearPhoneCache(telefono: string): Promise<void> {
    if (!this.isRedisConnected) {
      logger.warn('🟡 Redis not connected, cannot clear cache');
      return;
    }

    const normalizedPhone = WhatsAppUtils.normalizePhoneForCache(telefono);
    await cacheService.clearPhoneCache(normalizedPhone);
    logger.info(`🗑️ Cache cleared for phone: ${normalizedPhone}`);
  }

  private async getLeadFromDatabase(telefono: string): Promise<Lead | null> {
    try {
      logger.debug(`Getting lead from database for ${telefono}`);
      return null;
    } catch (error) {
      logger.error('Error getting lead from database:', error);
      return null;
    }
  }

  private async getConversationsFromDatabase(telefono: string, limit: number): Promise<Conversation[]> {
    try {
      logger.debug(`Getting conversations from database for ${telefono}, limit: ${limit}`);
      return [];
    } catch (error) {
      logger.error('Error getting conversations from database:', error);
      return [];
    }
  }

  private async generateAIResponseFromService(telefono: string, mensaje: string, context?: any): Promise<string> {
    try {
      const AIService = await import('./AIService');
      const response = await AIService.default.generateResponse(mensaje, context);
      return typeof response === 'string' ? response : response.content || 'No se pudo generar respuesta';
    } catch (error) {
      logger.error('Error generating AI response:', error);
      return 'Lo siento, no pude procesar tu mensaje en este momento. Por favor intenta de nuevo.';
    }
  }

  private async updateLeadInDatabase(telefono: string, updateData: Partial<Lead>): Promise<void> {
    try {
      logger.debug(`Updating lead in database for ${telefono}:`, updateData);
    } catch (error) {
      logger.error('Error updating lead in database:', error);
    }
  }

  private async saveConversationToDatabase(conversation: Omit<Conversation, 'id'>): Promise<void> {
    try {
      const conversationData = {
        sessionId: 'enhanced',
        phoneNumber: conversation.telefono,
        messageText: conversation.mensaje,
        responseText: undefined,
        messageType: 'text' as const,
        intent: 'unknown',
        sentiment: 'neutral',
        aiProvider: 'enhanced_service',
        tokensUsed: 0,
        isFromUser: conversation.tipo === 'incoming',
      };
      await DatabaseService.saveConversation(conversationData);
    } catch (error) {
      logger.error('Error saving conversation to database:', error);
    }
  }

  async startRedisMonitoring(): Promise<void> {
    if (!this.isRedisConnected) {
      logger.warn('🟡 Cannot start Redis monitoring, not connected');
      return;
    }

    this.redisMonitoring.startMonitoring();

    await redisClient.subscribe(REDIS_CHANNELS.SYSTEM_EVENTS, (message) => {
      try {
        const event = JSON.parse(message);
        logger.info(`🔔 System event received:`, event);
        
        if (event.event === 'cache_clear_all') {
          logger.info('🗑️ System-wide cache clear requested');
        }
      } catch (error) {
        logger.error('Error processing system event:', error);
      }
    });

    logger.info('🎧 Redis monitoring started for WhatsApp service');
  }

  async stopRedisMonitoring(): Promise<void> {
    if (!this.isRedisConnected) return;

    this.redisMonitoring.stopMonitoring();
    await redisClient.unsubscribe(REDIS_CHANNELS.SYSTEM_EVENTS);
    logger.info('🛑 Redis monitoring stopped for WhatsApp service');
  }

  async shutdown(): Promise<void> {
    logger.info('🛑 Shutting down WhatsApp Service...');
    
    await this.stopRedisMonitoring();
    
    this.redisMonitoring.destroy();
    
    await this.baseService.shutdown();
    
    logger.info('✅ WhatsApp Service shutdown completed');
  }

  getStatsSummary(): string {
    return this.statsService.getStatsSummary();
  }

  resetStats(): void {
    this.statsService.resetStats();
  }
}

export default WhatsAppService;
