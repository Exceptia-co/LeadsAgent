import type { Request, Response } from 'express';
import { redisClient } from '../config/redis';
import { cacheService } from '../services/cacheService';
import { logger } from '../utils/logger';

export class RedisController {
  /**
   * Obtiene el estado de Redis
   */
  static async getRedisStatus(req: Request, res: Response) {
    try {
      const ping = await redisClient.ping();
      const info = await redisClient.info();

      res.json({
        success: true,
        data: {
          connected: ping,
          timestamp: new Date().toISOString(),
          serverInfo: info ? info.split('\r\n').slice(0, 10) : ['No info available'],
        },
      });
    } catch (error) {
      logger.error('Error getting Redis status:', error);
      res.status(500).json({
        success: false,
        error: 'Redis connection failed',
        connected: false,
      });
    }
  }

  /**
   * Obtiene estadísticas del cache y servicio
   */
  static async getStats(req: Request, res: Response) {
    try {
      const metrics = [
        'messages_sent_total',
        'messages_sent_success',
        'messages_sent_failed',
        'conversations_saved_total',
        'conversations_incoming_total',
        'conversations_outgoing_total',
        'ai_responses_generated',
      ];

      const stats = await cacheService.getMultipleStats(metrics);
      const cacheInfo = await cacheService.getCacheInfo();

      res.json({
        success: true,
        data: {
          stats,
          cache_info: cacheInfo,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error getting stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get statistics',
      });
    }
  }

  /**
   * Limpia cache de un teléfono específico
   */
  static async clearPhoneCache(req: Request, res: Response) {
    try {
      const { phone } = req.params;

      if (!phone) {
        return res.status(400).json({
          success: false,
          error: 'Phone number is required',
        });
      }

      await cacheService.clearPhoneCache(phone);

      res.json({
        success: true,
        message: `Cache cleared for phone: ${phone}`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error clearing phone cache:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to clear phone cache',
      });
    }
  }

  /**
   * Obtiene información del rate limiting para un teléfono
   */
  static async getRateLimitInfo(req: Request, res: Response) {
    try {
      const { phone } = req.params;

      if (!phone) {
        return res.status(400).json({
          success: false,
          error: 'Phone number is required',
        });
      }

      const rateLimitStatus = await cacheService.getRateLimitStatus(phone);

      res.json({
        success: true,
        data: {
          phone,
          ...rateLimitStatus,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error getting rate limit info:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get rate limit information',
      });
    }
  }

  /**
   * Obtiene información de un lead desde cache
   */
  static async getCachedLead(req: Request, res: Response) {
    try {
      const { phone } = req.params;

      if (!phone) {
        return res.status(400).json({
          success: false,
          error: 'Phone number is required',
        });
      }

      const cachedLead = await cacheService.getLead(phone);

      res.json({
        success: true,
        data: {
          phone,
          lead: cachedLead,
          cached: !!cachedLead,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error getting cached lead:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get cached lead',
      });
    }
  }

  /**
   * Obtiene conversaciones desde cache
   */
  static async getCachedConversations(req: Request, res: Response) {
    try {
      const { phone } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!phone) {
        return res.status(400).json({
          success: false,
          error: 'Phone number is required',
        });
      }

      const cachedConversations = await cacheService.getRecentConversations(phone, limit);

      res.json({
        success: true,
        data: {
          phone,
          conversations: cachedConversations || [],
          cached: !!cachedConversations,
          count: cachedConversations?.length || 0,
          limit,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error getting cached conversations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get cached conversations',
      });
    }
  }

  /**
   * Prueba de escritura y lectura de cache
   */
  static async testCache(req: Request, res: Response) {
    try {
      const testKey = `test:${Date.now()}`;
      const testValue = { test: true, timestamp: new Date().toISOString() };

      // Escribir al cache
      await cacheService.setLead(testKey, testValue as any);

      // Leer del cache
      const cachedValue = await cacheService.getLead(testKey);

      // Limpiar el cache de prueba
      await redisClient.del(`lead:cache:${testKey}`);

      res.json({
        success: true,
        data: {
          test_key: testKey,
          written_value: testValue,
          read_value: cachedValue,
          cache_working: JSON.stringify(testValue) === JSON.stringify(cachedValue),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error testing cache:', error);
      res.status(500).json({
        success: false,
        error: 'Cache test failed',
      });
    }
  }

  /**
   * Publica un mensaje de prueba en un canal
   */
  static async testPubSub(req: Request, res: Response) {
    try {
      const { channel, message } = req.body;

      if (!channel || !message) {
        return res.status(400).json({
          success: false,
          error: 'Channel and message are required',
        });
      }

      const testMessage = {
        event: 'test_event',
        message: message,
        timestamp: new Date().toISOString(),
        source: 'redis_controller',
      };

      await redisClient.publishObject(channel, testMessage);

      res.json({
        success: true,
        message: 'Test message published successfully',
        data: {
          channel,
          published_message: testMessage,
        },
      });
    } catch (error) {
      logger.error('Error testing pub/sub:', error);
      res.status(500).json({
        success: false,
        error: 'Pub/Sub test failed',
      });
    }
  }

  /**
   * Incrementa un contador de estadísticas
   */
  static async incrementStat(req: Request, res: Response) {
    try {
      const { metric } = req.params;
      const { value } = req.body;

      if (!metric) {
        return res.status(400).json({
          success: false,
          error: 'Metric name is required',
        });
      }

      const incrementValue = parseInt(value) || 1;

      // Incrementar múltiples veces si se especifica
      for (let i = 0; i < incrementValue; i++) {
        await cacheService.incrementStats(metric);
      }

      const newValue = await cacheService.getStats(metric);

      res.json({
        success: true,
        message: `Metric '${metric}' incremented by ${incrementValue}`,
        data: {
          metric,
          new_value: newValue,
          incremented_by: incrementValue,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error incrementing stat:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to increment statistic',
      });
    }
  }

  /**
   * Obtiene las keys de Redis que coinciden con un patrón
   */
  static async getKeys(req: Request, res: Response) {
    try {
      const { pattern } = req.query;
      const searchPattern = (pattern as string) || '*';

      const client = redisClient.getClient();
      const keys = await client.keys(searchPattern);

      res.json({
        success: true,
        data: {
          pattern: searchPattern,
          keys: keys.slice(0, 100), // Limitar a 100 keys por rendimiento
          total_keys: keys.length,
          limited_to: Math.min(keys.length, 100),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error getting keys:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get Redis keys',
      });
    }
  }
}

export default RedisController;
