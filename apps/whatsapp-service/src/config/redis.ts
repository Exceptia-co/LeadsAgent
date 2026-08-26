import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Accept either a single REDIS_URL (standard) or a split host/port/password/db.
// URL wins when present — matches the production convention on the VPS and
// keeps dev (docker-compose) on 6381 via the split env vars.
const sharedRedisOptions = {
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  connectTimeout: 10000,
  commandTimeout: 5000,
  // TCP keepalive: el bridge de Docker Desktop en WSL2 corta conexiones
  // idle ~60s. Sin esto, el socket de pub/sub queda colgado, el OS lo
  // cierra con RST e ioredis loguea ECONNRESET en loop. 30s deja margen.
  keepAlive: 30000,
};

function buildRedisClient(): Redis {
  const redisUrl = process.env['REDIS_URL'];
  if (redisUrl) {
    return new Redis(redisUrl, sharedRedisOptions);
  }
  return new Redis({
    host: process.env['REDIS_HOST'] || 'localhost',
    port: parseInt(process.env['REDIS_PORT'] || '6379'),
    password: process.env['REDIS_PASSWORD'] || undefined,
    db: parseInt(process.env['REDIS_DB'] || '0'),
    ...sharedRedisOptions,
  });
}

class RedisClient {
  private client: Redis;
  private subscriber: Redis;
  private publisher: Redis;

  constructor() {
    this.client = buildRedisClient();
    this.subscriber = buildRedisClient();
    this.publisher = buildRedisClient();

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
        this.connectClient(this.client, 'client'),
        this.connectClient(this.subscriber, 'subscriber'),
        this.connectClient(this.publisher, 'publisher'),
      ]);
      logger.info('All Redis clients connected successfully');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  /**
   * Safely connect a single Redis client based on its current status.
   * Handles the case where ioredis auto-connects before explicit .connect().
   */
  private connectClient(client: Redis, name: string): Promise<void> {
    const status = client.status;

    if (status === 'ready') {
      logger.debug(`Redis ${name} already connected (status: ready)`);
      return Promise.resolve();
    }

    if (status === 'wait') {
      return client.connect();
    }

    // Status is 'connecting', 'connect', or 'reconnecting' — wait for ready
    logger.debug(`Redis ${name} is in status '${status}', waiting for ready...`);
    return new Promise<void>((resolve, reject) => {
      const onReady = () => {
        client.removeListener('error', onError);
        resolve();
      };
      const onError = (err: Error) => {
        client.removeListener('ready', onReady);
        reject(err);
      };
      client.once('ready', onReady);
      client.once('error', onError);
    });
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

  /**
   * Atomic "set-if-not-exists" con TTL. Retorna `true` si la clave se creó
   * (no existía antes), `false` si ya existía.
   *
   * Fail-open real: ante error de Redis, retorna `true` (comporta como
   * "primera vez"), para que el caller procese el mensaje. Preferimos una
   * doble respuesta rara a silencio total si Redis se cae.
   *
   * Usado por Fase A1 (dedupe de mensajes WhatsApp entrantes).
   */
  async setNX(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (error) {
      logger.error(`Redis SET NX error for key ${key} (fail-open, treating as first-time):`, error);
      return true;
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
  SESSION_HEARTBEAT: 'session:hb:',
  SESSION_LOCK: 'session:lock:',
  MESSAGE_QUEUE: 'message:queue:',
  AI_QUEUE: 'ai:queue:',
  STATS_COUNTER: 'stats:counter:',
  WEBHOOK_QUEUE: 'webhook:queue:',
  // Fase A1 (2026-04-19): dedupe de mensajes WhatsApp entrantes.
  // El key combina el message.id serializado y se fija con TTL 300s via setNX.
  MESSAGE_DEDUP: 'whatsapp:dedup:',
};

export const REDIS_TTL = {
  // Fase A1: ventana de 5 min es el sweet spot industry-standard para WhatsApp.
  // Cubre casi todos los re-emits del transporte sin acumular claves.
  MESSAGE_DEDUP_SECONDS: 300,
};

export const REDIS_CHANNELS = {
  SESSION_EVENTS: 'whatsapp:session:events',
  MESSAGE_EVENTS: 'whatsapp:message:events',
  LEAD_EVENTS: 'leads:events',
  SYSTEM_EVENTS: 'system:events',
};

export default redisClient;
