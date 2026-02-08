// Temporarily disabled - install redis package first
// import { createClient, RedisClientType } from 'redis'
type RedisClientType = any;
import { logger } from './logger';

class RedisManager {
  private client: RedisClientType;
  private prefix: string;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6381';
    this.prefix = process.env.REDIS_PREFIX || 'whatsapp:';

    // Temporarily disabled - need to install redis package first
    // this.client = createClient({ url: redisUrl })
    this.client = {
      isReady: false,
      on: () => {},
      connect: async () => {},
      disconnect: async () => {},
      setEx: async () => {},
      get: async () => null,
      del: async () => 0,
      keys: async () => [],
    } as any;
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client.isReady) {
        await this.client.disconnect();
      } else {
        logger.debug('Redis client not connected, skipping disconnect');
      }
    } catch (error) {
      logger.error('Failed to disconnect from Redis:', error);
    }
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async setSession(sessionId: string, data: any, ttl = 86400): Promise<void> {
    try {
      if (!this.client.isReady) {
        logger.debug('Redis not ready, skipping session storage');
        return;
      }
      const key = this.getKey(`session:${sessionId}`);
      await this.client.setEx(key, ttl, JSON.stringify(data));
    } catch (error) {
      logger.error('Error setting session in Redis:', error);
      // Don't throw error - continue without Redis
    }
  }

  async getSession(sessionId: string): Promise<any | null> {
    try {
      if (!this.client.isReady) {
        logger.debug('Redis not ready, returning null for session');
        return null;
      }
      const key = this.getKey(`session:${sessionId}`);
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Error getting session from Redis:', error);
      return null;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      const key = this.getKey(`session:${sessionId}`);
      await this.client.del(key);
    } catch (error) {
      logger.error('Error deleting session from Redis:', error);
      throw error;
    }
  }

  async getAllSessions(): Promise<{ [key: string]: any }> {
    try {
      if (!this.client.isReady) {
        logger.debug('Redis not ready, returning empty sessions object');
        return {};
      }
      const pattern = this.getKey('session:*');
      const keys = await this.client.keys(pattern);
      const sessions: { [key: string]: any } = {};

      for (const key of keys) {
        const data = await this.client.get(key);
        if (data) {
          const sessionId = key.replace(this.getKey('session:'), '');
          sessions[sessionId] = JSON.parse(data);
        }
      }

      return sessions;
    } catch (error) {
      logger.error('Error getting all sessions from Redis:', error);
      return {};
    }
  }

  async setQRCode(sessionId: string, qrCode: string, ttl = 300): Promise<void> {
    try {
      const key = this.getKey(`qr:${sessionId}`);
      await this.client.setEx(key, ttl, qrCode);
    } catch (error) {
      logger.error('Error setting QR code in Redis:', error);
      throw error;
    }
  }

  async getQRCode(sessionId: string): Promise<string | null> {
    try {
      const key = this.getKey(`qr:${sessionId}`);
      return await this.client.get(key);
    } catch (error) {
      logger.error('Error getting QR code from Redis:', error);
      return null;
    }
  }

  async deleteQRCode(sessionId: string): Promise<void> {
    try {
      const key = this.getKey(`qr:${sessionId}`);
      await this.client.del(key);
    } catch (error) {
      logger.error('Error deleting QR code from Redis:', error);
    }
  }
}

const redis = new RedisManager();
export { redis };
export default redis;
