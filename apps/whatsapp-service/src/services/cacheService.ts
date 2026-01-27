import { redisClient, REDIS_KEYS } from '../config/redis';
import { logger } from '../utils/logger';

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

interface AIResponse {
  telefono: string;
  mensaje: string;
  respuesta: string;
  timestamp: string;
}

export class CacheService {
  // TTL por defecto en segundos
  private readonly DEFAULT_TTL = 3600; // 1 hora
  private readonly LEAD_TTL = 1800; // 30 minutos
  private readonly CONVERSATION_TTL = 3600; // 1 hora
  private readonly AI_RESPONSE_TTL = 7200; // 2 horas

  constructor() {}

  // ============ CACHE DE LEADS ============

  /**
   * Obtiene un lead desde cache
   */
  async getLead(telefono: string): Promise<Lead | null> {
    try {
      const key = `${REDIS_KEYS.LEAD_CACHE}${telefono}`;
      const cached = await redisClient.getObject<Lead>(key);

      if (cached) {
        logger.debug(`Lead cache hit for ${telefono}`);
        return cached;
      }

      logger.debug(`Lead cache miss for ${telefono}`);
      return null;
    } catch (error) {
      logger.error('Error getting lead from cache:', error);
      return null;
    }
  }

  /**
   * Guarda un lead en cache
   */
  async setLead(telefono: string, lead: Lead): Promise<void> {
    try {
      const key = `${REDIS_KEYS.LEAD_CACHE}${telefono}`;
      await redisClient.setObject(key, lead, this.LEAD_TTL);
      logger.debug(`Lead cached for ${telefono}`);
    } catch (error) {
      logger.error('Error caching lead:', error);
    }
  }

  /**
   * Invalida el cache de un lead
   */
  async invalidateLead(telefono: string): Promise<void> {
    try {
      const key = `${REDIS_KEYS.LEAD_CACHE}${telefono}`;
      await redisClient.del(key);
      logger.debug(`Lead cache invalidated for ${telefono}`);
    } catch (error) {
      logger.error('Error invalidating lead cache:', error);
    }
  }

  // ============ CACHE DE CONVERSACIONES ============

  /**
   * Obtiene conversaciones recientes desde cache
   */
  async getRecentConversations(
    telefono: string,
    limit: number = 10
  ): Promise<Conversation[] | null> {
    try {
      const key = `${REDIS_KEYS.CONVERSATION_CACHE}${telefono}:recent:${limit}`;
      const cached = await redisClient.getObject<Conversation[]>(key);

      if (cached) {
        logger.debug(`Conversation cache hit for ${telefono}`);
        return cached;
      }

      logger.debug(`Conversation cache miss for ${telefono}`);
      return null;
    } catch (error) {
      logger.error('Error getting conversations from cache:', error);
      return null;
    }
  }

  /**
   * Guarda conversaciones recientes en cache
   */
  async setRecentConversations(
    telefono: string,
    conversations: Conversation[],
    limit: number = 10
  ): Promise<void> {
    try {
      const key = `${REDIS_KEYS.CONVERSATION_CACHE}${telefono}:recent:${limit}`;
      await redisClient.setObject(key, conversations, this.CONVERSATION_TTL);
      logger.debug(`Conversations cached for ${telefono} (${conversations.length} items)`);
    } catch (error) {
      logger.error('Error caching conversations:', error);
    }
  }

  /**
   * Invalida el cache de conversaciones de un teléfono
   */
  async invalidateConversations(telefono: string): Promise<void> {
    try {
      // Buscar todas las keys relacionadas con conversaciones de este teléfono
      const pattern = `${REDIS_KEYS.CONVERSATION_CACHE}${telefono}:*`;
      const client = redisClient.getClient();

      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await Promise.all(keys.map(key => redisClient.del(key)));
        logger.debug(`Conversation cache invalidated for ${telefono} (${keys.length} keys)`);
      }
    } catch (error) {
      logger.error('Error invalidating conversation cache:', error);
    }
  }

  // ============ CACHE DE RESPUESTAS IA ============

  /**
   * Genera una clave de cache para respuestas IA basada en el contexto
   */
  private generateAIKey(telefono: string, mensaje: string): string {
    // Crear un hash simple del mensaje para la clave
    const messageHash = Buffer.from(mensaje).toString('base64').slice(0, 20);
    return `${REDIS_KEYS.AI_RESPONSE_CACHE}${telefono}:${messageHash}`;
  }

  /**
   * Obtiene una respuesta IA desde cache
   */
  async getAIResponse(telefono: string, mensaje: string): Promise<string | null> {
    try {
      const key = this.generateAIKey(telefono, mensaje);
      const cached = await redisClient.getObject<AIResponse>(key);

      if (cached) {
        logger.debug(`AI response cache hit for ${telefono}`);
        return cached.respuesta;
      }

      logger.debug(`AI response cache miss for ${telefono}`);
      return null;
    } catch (error) {
      logger.error('Error getting AI response from cache:', error);
      return null;
    }
  }

  /**
   * Guarda una respuesta IA en cache
   */
  async setAIResponse(telefono: string, mensaje: string, respuesta: string): Promise<void> {
    try {
      const key = this.generateAIKey(telefono, mensaje);
      const aiResponse: AIResponse = {
        telefono,
        mensaje,
        respuesta,
        timestamp: new Date().toISOString(),
      };

      await redisClient.setObject(key, aiResponse, this.AI_RESPONSE_TTL);
      logger.debug(`AI response cached for ${telefono}`);
    } catch (error) {
      logger.error('Error caching AI response:', error);
    }
  }

  // ============ RATE LIMITING ============

  /**
   * Verifica y aplica rate limiting por teléfono
   */
  async checkRateLimit(
    telefono: string,
    maxRequests: number = 10,
    windowSeconds: number = 60
  ): Promise<boolean> {
    try {
      const key = `${REDIS_KEYS.RATE_LIMIT}${telefono}`;
      const current = await redisClient.incr(key, windowSeconds);

      if (current > maxRequests) {
        logger.warn(`Rate limit exceeded for ${telefono}: ${current}/${maxRequests}`);
        return false;
      }

      logger.debug(`Rate limit check for ${telefono}: ${current}/${maxRequests}`);
      return true;
    } catch (error) {
      logger.error('Error checking rate limit:', error);
      return true; // En caso de error, permitir la solicitud
    }
  }

  /**
   * Obtiene el estado actual del rate limit
   */
  async getRateLimitStatus(
    telefono: string
  ): Promise<{ current: number; remaining: number; maxRequests: number }> {
    try {
      const key = `${REDIS_KEYS.RATE_LIMIT}${telefono}`;
      const current = parseInt((await redisClient.get(key)) || '0');
      const maxRequests = 10; // Valor por defecto

      return {
        current,
        remaining: Math.max(0, maxRequests - current),
        maxRequests,
      };
    } catch (error) {
      logger.error('Error getting rate limit status:', error);
      return { current: 0, remaining: 10, maxRequests: 10 };
    }
  }

  // ============ ESTADÍSTICAS ============

  /**
   * Incrementa un contador de estadísticas
   */
  async incrementStats(metric: string, value: number = 1): Promise<void> {
    try {
      const key = `${REDIS_KEYS.STATS_COUNTER}${metric}`;
      await redisClient.incr(key);
      logger.debug(`Stats incremented: ${metric} = ${value}`);
    } catch (error) {
      logger.error('Error incrementing stats:', error);
    }
  }

  /**
   * Obtiene estadísticas
   */
  async getStats(metric: string): Promise<number> {
    try {
      const key = `${REDIS_KEYS.STATS_COUNTER}${metric}`;
      const value = await redisClient.get(key);
      return parseInt(value || '0');
    } catch (error) {
      logger.error('Error getting stats:', error);
      return 0;
    }
  }

  /**
   * Obtiene múltiples estadísticas
   */
  async getMultipleStats(metrics: string[]): Promise<Record<string, number>> {
    try {
      const results: Record<string, number> = {};

      await Promise.all(
        metrics.map(async metric => {
          const value = await this.getStats(metric);
          results[metric] = value;
        })
      );

      return results;
    } catch (error) {
      logger.error('Error getting multiple stats:', error);
      return {};
    }
  }

  // ============ ESTADO DE SESIÓN ============

  /**
   * Guarda el estado de una sesión WhatsApp
   */
  async setSessionStatus(sessionId: string, status: string, data?: any): Promise<void> {
    try {
      const key = `${REDIS_KEYS.SESSION_STATUS}${sessionId}`;
      const sessionData = {
        status,
        timestamp: new Date().toISOString(),
        ...(data || {}),
      };

      await redisClient.setObject(key, sessionData, 3600); // 1 hora de TTL
      logger.debug(`Session status set for ${sessionId}: ${status}`);
    } catch (error) {
      logger.error('Error setting session status:', error);
    }
  }

  /**
   * Obtiene el estado de una sesión WhatsApp
   */
  async getSessionStatus(sessionId: string): Promise<any | null> {
    try {
      const key = `${REDIS_KEYS.SESSION_STATUS}${sessionId}`;
      const status = await redisClient.getObject(key);
      logger.debug(
        `Session status retrieved for ${sessionId}:`,
        (status as any)?.status || 'not found'
      );
      return status;
    } catch (error) {
      logger.error('Error getting session status:', error);
      return null;
    }
  }

  // ============ UTILIDADES ============

  /**
   * Limpia todos los caches relacionados con un teléfono
   */
  async clearPhoneCache(telefono: string): Promise<void> {
    try {
      await Promise.all([this.invalidateLead(telefono), this.invalidateConversations(telefono)]);

      logger.info(`All cache cleared for phone ${telefono}`);
    } catch (error) {
      logger.error('Error clearing phone cache:', error);
    }
  }

  /**
   * Obtiene información del cache
   */
  async getCacheInfo(): Promise<any> {
    try {
      const info = await redisClient.info();
      const ping = await redisClient.ping();

      return {
        connected: ping,
        info: info,
      };
    } catch (error) {
      logger.error('Error getting cache info:', error);
      return { connected: false, info: '' };
    }
  }
}

// Exportar instancia singleton
export const cacheService = new CacheService();
