import { logger } from '../../utils/logger';
import { RedisUtils } from '../../utils/whatsappUtils';

// Tipo para el cliente Redis personalizado del proyecto
type RedisClientType = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  ping(): Promise<boolean>;
  info(): Promise<string>;
};

/**
 * Servicio centralizado para manejo de estadísticas de WhatsApp
 * Evita duplicación de código en servicios múltiples
 */
export class WhatsAppStatsService {
  private redisClient?: RedisClientType;
  private stats = {
    messagesReceived: 0,
    messagesSent: 0,
    errors: 0,
    sessionCreations: 0,
    sessionDestructions: 0,
    redisOperations: 0,
    lastActivity: new Date().toISOString(),
  };

  constructor(redisClient?: RedisClientType) {
    this.redisClient = redisClient;
  }

  /**
   * Incrementar contador de mensajes recibidos
   */
  public incrementMessagesReceived(): void {
    this.stats.messagesReceived++;
    this.updateLastActivity();
    this.syncToRedis('messagesReceived', this.stats.messagesReceived);
  }

  /**
   * Incrementar contador de mensajes enviados
   */
  public incrementMessagesSent(): void {
    this.stats.messagesSent++;
    this.updateLastActivity();
    this.syncToRedis('messagesSent', this.stats.messagesSent);
  }

  /**
   * Incrementar contador de errores
   */
  public incrementErrors(): void {
    this.stats.errors++;
    this.updateLastActivity();
    this.syncToRedis('errors', this.stats.errors);
  }

  /**
   * Incrementar contador de creaciones de sesión
   */
  public incrementSessionCreations(): void {
    this.stats.sessionCreations++;
    this.updateLastActivity();
    this.syncToRedis('sessionCreations', this.stats.sessionCreations);
  }

  /**
   * Incrementar contador de destrucciones de sesión
   */
  public incrementSessionDestructions(): void {
    this.stats.sessionDestructions++;
    this.updateLastActivity();
    this.syncToRedis('sessionDestructions', this.stats.sessionDestructions);
  }

  /**
   * Incrementar contador de operaciones Redis
   */
  public incrementRedisOperations(): void {
    this.stats.redisOperations++;
    this.updateLastActivity();
    this.syncToRedis('redisOperations', this.stats.redisOperations);
  }

  /**
   * Obtener estadísticas actuales
   */
  public getStats() {
    return { ...this.stats };
  }

  /**
   * Resetear todas las estadísticas
   */
  public resetStats(): void {
    this.stats = {
      messagesReceived: 0,
      messagesSent: 0,
      errors: 0,
      sessionCreations: 0,
      sessionDestructions: 0,
      redisOperations: 0,
      lastActivity: new Date().toISOString(),
    };

    if (this.redisClient) {
      this.syncAllStatsToRedis();
    }
  }

  /**
   * Actualizar timestamp de última actividad
   */
  private updateLastActivity(): void {
    this.stats.lastActivity = new Date().toISOString();
  }

  /**
   * Sincronizar estadística específica a Redis
   */
  private async syncToRedis(statName: string, value: number | string): Promise<void> {
    if (!this.redisClient) return;

    try {
      const key = RedisUtils.generateCacheKey('whatsapp:stats', statName);
      await this.redisClient.set(key, value.toString());
    } catch (error) {
      logger.warn(`Failed to sync ${statName} to Redis:`, error);
    }
  }

  /**
   * Sincronizar todas las estadísticas a Redis
   */
  private async syncAllStatsToRedis(): Promise<void> {
    if (!this.redisClient) return;

    try {
      const promises = Object.entries(this.stats).map(([key, value]) =>
        this.syncToRedis(key, value)
      );
      await Promise.all(promises);
    } catch (error) {
      logger.warn('Failed to sync all stats to Redis:', error);
    }
  }

  /**
   * Cargar estadísticas desde Redis al inicializar
   */
  public async loadStatsFromRedis(): Promise<void> {
    if (!this.redisClient) return;

    try {
      const isConnected = await RedisUtils.checkConnection(this.redisClient);
      if (!isConnected) {
        logger.warn('Redis not connected, using local stats only');
        return;
      }

      const statKeys = Object.keys(this.stats);
      const promises = statKeys.map(async statName => {
        try {
          const key = RedisUtils.generateCacheKey('whatsapp:stats', statName);
          const value = await this.redisClient.get(key);
          if (value !== null) {
            if (statName === 'lastActivity') {
              (this.stats as any)[statName] = value;
            } else {
              (this.stats as any)[statName] = parseInt(value, 10) || 0;
            }
          }
        } catch (error) {
          logger.warn(`Failed to load ${statName} from Redis:`, error);
        }
      });

      await Promise.all(promises);
      logger.debug('📊 Stats loaded from Redis');
    } catch (error) {
      logger.warn('Failed to load stats from Redis:', error);
    }
  }

  /**
   * Obtener resumen de estadísticas en formato legible
   */
  public getStatsSummary(): string {
    return `📊 WhatsApp Stats:
Messages: ${this.stats.messagesReceived} received, ${this.stats.messagesSent} sent
Sessions: ${this.stats.sessionCreations} created, ${this.stats.sessionDestructions} destroyed
Errors: ${this.stats.errors}
Redis operations: ${this.stats.redisOperations}
Last activity: ${this.stats.lastActivity}`;
  }
}
