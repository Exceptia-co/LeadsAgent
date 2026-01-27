import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Configuración de Redis
const redisConfig = {
  host: process.env['REDIS_HOST'] || 'localhost',
  port: parseInt(process.env['REDIS_PORT'] || '6379'),
  password: process.env['REDIS_PASSWORD'] || undefined,
  db: parseInt(process.env['REDIS_DB'] || '0'),
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  connectTimeout: 10000,
  commandTimeout: 5000,
};

class RedisClient {
  private client: Redis;
  private subscriber: Redis;
  private publisher: Redis;

  constructor() {
    // Cliente principal
    this.client = new Redis(redisConfig);

    // Cliente para suscripciones
    this.subscriber = new Redis(redisConfig);

    // Cliente para publicaciones
    this.publisher = new Redis(redisConfig);

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Eventos del cliente principal
    this.client.on('connect', () => {
      logger.info('Redis client connected');
    });

    this.client.on('error', error => {
      logger.error('Redis client error:', error);
    });

    this.client.on('close', () => {
      logger.warn('Redis client connection closed');
    });

    // Eventos del subscriber
    this.subscriber.on('connect', () => {
      logger.info('Redis subscriber connected');
    });

    this.subscriber.on('error', error => {
      logger.error('Redis subscriber error:', error);
    });

    // Eventos del publisher
    this.publisher.on('connect', () => {
      logger.info('Redis publisher connected');
    });

    this.publisher.on('error', error => {
      logger.error('Redis publisher error:', error);
    });
  }

  async connect(): Promise<void> {
    try {
      await Promise.all([
        this.client.connect(),
        this.subscriber.connect(),
        this.publisher.connect(),
      ]);
      logger.info('All Redis clients connected successfully');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await Promise.all([
        this.client.disconnect(),
        this.subscriber.disconnect(),
        this.publisher.disconnect(),
      ]);
      logger.info('All Redis clients disconnected');
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error);
    }
  }

  // Métodos para cache
  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error(`Redis GET error for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (ttl) {
        await this.client.setex(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      logger.error(`Redis SET error for key ${key}:`, error);
    }
  }

  async setObject(key: string, obj: any, ttl?: number): Promise<void> {
    try {
      const value = JSON.stringify(obj);
      await this.set(key, value, ttl);
    } catch (error) {
      logger.error(`Redis SET object error for key ${key}:`, error);
    }
  }

  async getObject<T>(key: string): Promise<T | null> {
    try {
      const value = await this.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Redis GET object error for key ${key}:`, error);
      return null;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      logger.error(`Redis DEL error for key ${key}:`, error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Redis EXISTS error for key ${key}:`, error);
      return false;
    }
  }

  // Métodos para contadores
  async incr(key: string, ttl?: number): Promise<number> {
    try {
      const result = await this.client.incr(key);
      if (ttl && result === 1) {
        await this.client.expire(key, ttl);
      }
      return result;
    } catch (error) {
      logger.error(`Redis INCR error for key ${key}:`, error);
      return 0;
    }
  }

  async decr(key: string): Promise<number> {
    try {
      return await this.client.decr(key);
    } catch (error) {
      logger.error(`Redis DECR error for key ${key}:`, error);
      return 0;
    }
  }

  // Métodos para listas (colas)
  async lpush(key: string, value: string): Promise<void> {
    try {
      await this.client.lpush(key, value);
    } catch (error) {
      logger.error(`Redis LPUSH error for key ${key}:`, error);
    }
  }

  async rpop(key: string): Promise<string | null> {
    try {
      return await this.client.rpop(key);
    } catch (error) {
      logger.error(`Redis RPOP error for key ${key}:`, error);
      return null;
    }
  }

  async llen(key: string): Promise<number> {
    try {
      return await this.client.llen(key);
    } catch (error) {
      logger.error(`Redis LLEN error for key ${key}:`, error);
      return 0;
    }
  }

  // Métodos para pub/sub
  async publish(channel: string, message: string): Promise<void> {
    try {
      await this.publisher.publish(channel, message);
    } catch (error) {
      logger.error(`Redis PUBLISH error for channel ${channel}:`, error);
    }
  }

  async publishObject(channel: string, obj: any): Promise<void> {
    try {
      const message = JSON.stringify(obj);
      await this.publish(channel, message);
    } catch (error) {
      logger.error(`Redis PUBLISH object error for channel ${channel}:`, error);
    }
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    try {
      this.subscriber.subscribe(channel);
      this.subscriber.on('message', (receivedChannel, message) => {
        if (receivedChannel === channel) {
          callback(message);
        }
      });
    } catch (error) {
      logger.error(`Redis SUBSCRIBE error for channel ${channel}:`, error);
    }
  }

  async unsubscribe(channel: string): Promise<void> {
    try {
      await this.subscriber.unsubscribe(channel);
    } catch (error) {
      logger.error(`Redis UNSUBSCRIBE error for channel ${channel}:`, error);
    }
  }

  // Método para verificar conexión
  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis PING error:', error);
      return false;
    }
  }

  // Método para obtener información
  async info(): Promise<string> {
    try {
      return await this.client.info();
    } catch (error) {
      logger.error('Redis INFO error:', error);
      return '';
    }
  }

  // Getters para acceder a los clientes si es necesario
  getClient(): Redis {
    return this.client;
  }

  getSubscriber(): Redis {
    return this.subscriber;
  }

  getPublisher(): Redis {
    return this.publisher;
  }
}

// Instancia singleton
export const redisClient = new RedisClient();

// Exportar tipos y constantes
export const REDIS_KEYS = {
  LEAD_CACHE: 'lead:cache:',
  CONVERSATION_CACHE: 'conversation:cache:',
  AI_RESPONSE_CACHE: 'ai:response:cache:',
  RATE_LIMIT: 'rate:limit:',
  SESSION_STATUS: 'session:status:',
  MESSAGE_QUEUE: 'message:queue:',
  AI_QUEUE: 'ai:queue:',
  STATS_COUNTER: 'stats:counter:',
  WEBHOOK_QUEUE: 'webhook:queue:',
};

export const REDIS_CHANNELS = {
  SESSION_EVENTS: 'whatsapp:session:events',
  MESSAGE_EVENTS: 'whatsapp:message:events',
  LEAD_EVENTS: 'leads:events',
  SYSTEM_EVENTS: 'system:events',
};

export default redisClient;
