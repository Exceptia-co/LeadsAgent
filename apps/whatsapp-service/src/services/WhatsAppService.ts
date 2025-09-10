import WhatsAppServiceSimple from './WhatsAppServiceSimple';
import { WhatsAppServiceRefactored } from './WhatsAppServiceRefactored';
import { cacheService } from './cacheService';
import { redisClient, REDIS_CHANNELS } from '../config/redis';
import { logger } from '../utils/logger';
import DatabaseService from './DatabaseService';
import { WhatsAppSession, SendMessageResponse, WebhookPayload } from '../types';
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

/**
 * Unified WhatsApp Service Facade
 *
 * Phase 1 of refactoring plan: Acts as a facade that delegates to either:
 * - Legacy service (WhatsAppServiceSimple) when USE_WHATSAPP_REFACTORED=false
 * - Refactored service (WhatsAppServiceRefactored) when USE_WHATSAPP_REFACTORED=true
 *
 * This maintains full API compatibility while allowing gradual migration.
 */
class WhatsAppService {
  private isRedisConnected: boolean = false;
  private useRefactoredService: boolean;
  private simpleService: typeof WhatsAppServiceSimple;
  private refactoredService: WhatsAppServiceRefactored | null = null;
  private statsService: WhatsAppStatsService;
  private redisMonitoring: RedisMonitoringService;

  constructor() {
    // Feature toggle: USE_WHATSAPP_REFACTORED environment variable
    this.useRefactoredService = process.env.USE_WHATSAPP_REFACTORED === 'true';

    logger.info(
      `🏗️ WhatsApp Service Architecture: ${this.useRefactoredService ? 'REFACTORED (v2.0)' : 'LEGACY (v1.0)'}`
    );

    // Initialize appropriate service implementation
    this.simpleService = WhatsAppServiceSimple;
    if (this.useRefactoredService) {
      this.refactoredService = new WhatsAppServiceRefactored();
    }

    this.statsService = new WhatsAppStatsService(redisClient);
    this.redisMonitoring = new RedisMonitoringService(redisClient);
    this.initialize();
  }

  public async initialize(): Promise<void> {
    await this.checkRedisConnection();
    await this.statsService.loadStatsFromRedis();

    // Initialize the selected service implementation
    if (this.useRefactoredService && this.refactoredService) {
      logger.info('🚀 Initializing refactored service implementation...');
      await this.refactoredService.initialize();
    } else {
      logger.info('🚀 Initializing legacy service implementation...');
      await this.simpleService.initialize();
    }
  }

  // =============================================================================
  // CORE WHATSAPP FUNCTIONALITY - Delegated to appropriate service
  // =============================================================================

  /**
   * Create a new WhatsApp session
   */
  async createSession(sessionId: string): Promise<WhatsAppSession> {
    if (this.useRefactoredService && this.refactoredService) {
      return await this.refactoredService.createSession(sessionId);
    } else {
      return await this.simpleService.createSession(sessionId);
    }
  }

  /**
   * Get session status
   */
  async getSessionStatus(sessionId: string): Promise<WhatsAppSession | null> {
    if (this.useRefactoredService && this.refactoredService) {
      return await this.refactoredService.getSessionStatus(sessionId);
    } else {
      return await this.simpleService.getSessionStatus(sessionId);
    }
  }

  /**
   * Get all sessions
   */
  async getAllSessions(): Promise<WhatsAppSession[]> {
    if (this.useRefactoredService && this.refactoredService) {
      return await this.refactoredService.getAllSessions();
    } else {
      return await this.simpleService.getAllSessions();
    }
  }

  /**
   * Destroy a session
   */
  async destroySession(sessionId: string): Promise<void> {
    if (this.useRefactoredService && this.refactoredService) {
      await this.refactoredService.destroySession(sessionId);
    } else {
      await this.simpleService.destroySession(sessionId);
    }
  }

  /**
   * Get session (for backward compatibility)
   */
  getSession(sessionId: string): WhatsAppSession | null {
    if (this.useRefactoredService && this.refactoredService) {
      // The refactored service doesn't have sync getSession, so we need to adapt
      return this.simpleService.getSession(sessionId);
    } else {
      return this.simpleService.getSession(sessionId);
    }
  }

  /**
   * Force disconnect session
   */
  async forceDisconnectSession(sessionId: string): Promise<void> {
    if (this.useRefactoredService && this.refactoredService) {
      // For now, delegate to simple service until this method is added to refactored
      await this.simpleService.forceDisconnectSession(sessionId);
    } else {
      await this.simpleService.forceDisconnectSession(sessionId);
    }
  }

  // =============================================================================
  // MESSAGE SENDING - Enhanced with caching and stats
  // =============================================================================

  private async checkRedisConnection(): Promise<void> {
    try {
      this.isRedisConnected = await RedisUtils.checkConnection(redisClient);
      if (this.isRedisConnected) {
        logger.info('🟢 WhatsApp Service: Redis connection verified');
      } else {
        logger.warn(
          '🟡 WhatsApp Service: Redis not available, falling back to basic functionality'
        );
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

    // Delegate to appropriate service implementation
    let result: SendMessageResponse;
    if (this.useRefactoredService && this.refactoredService) {
      result = await this.refactoredService.sendMessage(sessionId, to, message);
    } else {
      result = await this.simpleService.sendMessage(sessionId, to, message);
    }

    if (result.success && this.isRedisConnected) {
      await RedisUtils.safePublish(redisClient, REDIS_CHANNELS.MESSAGE_EVENTS, {
        event: 'message_sent',
        sessionId,
        to: to,
        message: message,
        timestamp: WhatsAppUtils.getTimestamp(),
        success: true,
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

  async getRecentConversationsWithCache(
    telefono: string,
    limit: number = 10
  ): Promise<Conversation[]> {
    if (!this.isRedisConnected) {
      return this.getConversationsFromDatabase(telefono, limit);
    }

    const normalizedPhone = WhatsAppUtils.normalizePhoneForCache(telefono);

    const cachedConversations = await cacheService.getRecentConversations(normalizedPhone, limit);
    if (cachedConversations) {
      logger.debug(
        `💬 Conversations found in cache: ${normalizedPhone} (${cachedConversations.length} items)`
      );
      return cachedConversations;
    }

    const conversations = await this.getConversationsFromDatabase(normalizedPhone, limit);

    if (conversations.length > 0) {
      await cacheService.setRecentConversations(normalizedPhone, conversations, limit);
    }

    return conversations;
  }

  async getAIResponseWithCache(
    telefono: string,
    mensaje: string,
    context?: any
  ): Promise<AIResponseWithCache> {
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
        cacheKey: `ai:${normalizedPhone}:${mensaje.slice(0, 20)}`,
      };
    }

    const newResponse = await this.generateAIResponseFromService(telefono, mensaje, context);

    await cacheService.setAIResponse(normalizedPhone, mensaje, newResponse);

    return {
      response: newResponse,
      fromCache: false,
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
        timestamp: WhatsAppUtils.getTimestamp(),
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
        timestamp: WhatsAppUtils.getTimestamp(),
      });
    }

    if (conversation.tipo === 'incoming') {
      this.statsService.incrementMessagesReceived();
    }

    logger.debug(`💬 Conversation saved and cache updated: ${normalizedPhone}`);
  }

  async updateSessionStatus(
    sessionId: string,
    status: string,
    additionalData?: any
  ): Promise<void> {
    // Get session using appropriate service
    const session =
      this.useRefactoredService && this.refactoredService
        ? this.simpleService.getSession(sessionId) // For now, use simple service for sync access
        : this.simpleService.getSession(sessionId);

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
        updatedAt: new Date().toISOString(),
      });

      await RedisUtils.safePublish(redisClient, REDIS_CHANNELS.SESSION_EVENTS, {
        event: 'session_status_changed',
        sessionId,
        status,
        additionalData,
        timestamp: WhatsAppUtils.getTimestamp(),
      });
    }
  }

  async getServiceStats(): Promise<any> {
    const baseStats = this.statsService.getStats();

    if (!this.isRedisConnected) {
      return {
        redis_connected: false,
        stats: baseStats,
        message: 'Redis not available, using local stats only',
      };
    }

    const cacheMetrics = [
      'messages_sent_total',
      'messages_sent_success',
      'messages_sent_failed',
      'conversations_saved_total',
      'conversations_incoming_total',
      'conversations_outgoing_total',
      'ai_responses_generated',
    ];

    const cacheStats = await cacheService.getMultipleStats(cacheMetrics);

    return {
      redis_connected: true,
      stats: {
        ...baseStats,
        cache: cacheStats,
      },
      cache_info: await cacheService.getCacheInfo(),
      redis_health: await this.redisMonitoring.getLastHealthStatus(),
      timestamp: WhatsAppUtils.getTimestamp(),
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

  private async getConversationsFromDatabase(
    telefono: string,
    limit: number
  ): Promise<Conversation[]> {
    try {
      logger.debug(`Getting conversations from database for ${telefono}, limit: ${limit}`);
      return [];
    } catch (error) {
      logger.error('Error getting conversations from database:', error);
      return [];
    }
  }

  private async generateAIResponseFromService(
    telefono: string,
    mensaje: string,
    context?: any
  ): Promise<string> {
    try {
      const AIService = await import('./AIService');
      const response = await AIService.default.generateResponse(mensaje, context);
      return typeof response === 'string'
        ? response
        : response.content || 'No se pudo generar respuesta';
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

    await redisClient.subscribe(REDIS_CHANNELS.SYSTEM_EVENTS, message => {
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

    // Shutdown appropriate service implementation
    if (this.useRefactoredService && this.refactoredService) {
      await this.refactoredService.shutdown();
    } else {
      await this.simpleService.shutdown();
    }

    logger.info('✅ WhatsApp Service shutdown completed');
  }

  // =============================================================================
  // SOCKET INTEGRATION - Unified event notification system
  // =============================================================================

  /**
   * Notify SocketService about events for real-time updates
   * This method provides bidirectional communication between WhatsApp services and SocketService
   */
  async notifySocketEvent(payload: WebhookPayload): Promise<void> {
    try {
      const { getSocketService } = await import('./SocketService');
      const socketService = getSocketService();

      if (socketService) {
        socketService.processWebhookEvent(payload);
        logger.debug(`📡 Socket event notified: ${payload.event} for session ${payload.sessionId}`);
      } else {
        logger.debug('📡 SocketService not available, skipping event notification');
      }
    } catch (error) {
      logger.error('❌ Error notifying socket service:', error);
    }
  }

  getStatsSummary(): string {
    return this.statsService.getStatsSummary();
  }

  resetStats(): void {
    this.statsService.resetStats();
  }
}

export default new WhatsAppService();
