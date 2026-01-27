import { logger } from '../../../utils/logger';
import type { MessageContext } from '../../AIService';

export class CacheKeyGenerator {
  public static generateIntentKey(message: string, context: MessageContext): string {
    const normalizedMessage = message.toLowerCase().trim();
    const contextKey = context.phoneNumber ? context.phoneNumber.slice(-4) : 'unknown';
    return `intent_${this.hashString(normalizedMessage)}_${contextKey}`;
  }

  public static generateKnowledgeKey(query: string, category?: string): string {
    const normalizedQuery = query.toLowerCase().trim();
    const categoryKey = category || 'general';
    return `knowledge_${this.hashString(normalizedQuery)}_${categoryKey}`;
  }

  public static generateResponseKey(message: string, context: MessageContext): string {
    const normalizedMessage = message.toLowerCase().trim();
    const contextKey = context.phoneNumber ? context.phoneNumber.slice(-4) : 'unknown';
    return `response_${this.hashString(normalizedMessage)}_${contextKey}`;
  }

  public static generateComplexityKey(message: string): string {
    const normalizedMessage = message.toLowerCase().trim();
    return `complexity_${this.hashString(normalizedMessage)}`;
  }

  private static hashString(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return Math.abs(hash).toString(36);
  }
}

export class CacheMetrics {
  private hits: Map<string, number> = new Map();
  private misses: Map<string, number> = new Map();
  private startTime: number = Date.now();

  public recordHit(cacheType: string): void {
    const current = this.hits.get(cacheType) || 0;
    this.hits.set(cacheType, current + 1);
  }

  public recordMiss(cacheType: string): void {
    const current = this.misses.get(cacheType) || 0;
    this.misses.set(cacheType, current + 1);
  }

  public getStats() {
    const stats: any = {
      uptime: Date.now() - this.startTime,
      hitRates: {},
    };

    for (const [cacheType] of this.hits) {
      const hits = this.hits.get(cacheType) || 0;
      const misses = this.misses.get(cacheType) || 0;
      const total = hits + misses;

      stats.hitRates[cacheType] = {
        hits,
        misses,
        total,
        hitRate: total > 0 ? ((hits / total) * 100).toFixed(2) + '%' : '0%',
      };
    }

    return stats;
  }

  public logStats(): void {
    const stats = this.getStats();
    logger.info('Cache performance metrics:', stats);
  }
}

export class CacheWarmer {
  public static async warmIntentCache(
    _cacheManager: any,
    commonMessages: string[] = []
  ): Promise<void> {
    const defaultMessages = [
      'hola',
      'buenos días',
      'buenas tardes',
      'precio',
      '¿cuánto cuesta?',
      'información',
      'quiero saber más',
    ];

    const messagesToWarm = [...defaultMessages, ...commonMessages];

    logger.info(`Warming intent cache with ${messagesToWarm.length} common messages`);

    // Note: This would typically integrate with your intent analysis system
    // For now, we'll just log the warming process
    for (const message of messagesToWarm) {
      const key = CacheKeyGenerator.generateIntentKey(message, {
        from: 'system',
        sessionId: 'warmup',
      });
      logger.debug(`Warming cache for message: ${message} -> ${key}`);
    }
  }

  public static async warmKnowledgeCache(
    _cacheManager: any,
    commonCategories: string[] = []
  ): Promise<void> {
    const defaultCategories = ['pricing', 'products', 'registration', 'general', 'support'];

    const categoriesToWarm = [...defaultCategories, ...commonCategories];

    logger.info(`Warming knowledge cache with ${categoriesToWarm.length} categories`);

    for (const category of categoriesToWarm) {
      const key = CacheKeyGenerator.generateKnowledgeKey('common_query', category);
      logger.debug(`Warming knowledge cache for category: ${category} -> ${key}`);
    }
  }
}

export class CacheEvictionStrategy {
  public static lru<T>(cache: Map<string, T>, maxSize: number): void {
    if (cache.size <= maxSize) return;

    const entriesToRemove = cache.size - maxSize;
    const entries = Array.from(cache.entries());

    // For LRU, we need timestamp tracking (simplified here)
    // Remove oldest entries based on insertion order
    for (let i = 0; i < entriesToRemove; i++) {
      const [firstKey] = entries[i];
      cache.delete(firstKey);
    }
  }

  public static lfu<T extends { accessCount?: number }>(
    cache: Map<string, T>,
    maxSize: number
  ): void {
    if (cache.size <= maxSize) return;

    const entriesToRemove = cache.size - maxSize;
    const entries = Array.from(cache.entries());

    // Sort by access count (least frequent first)
    entries.sort((a, b) => {
      const aCount = a[1].accessCount || 0;
      const bCount = b[1].accessCount || 0;
      return aCount - bCount;
    });

    for (let i = 0; i < entriesToRemove; i++) {
      const [key] = entries[i];
      cache.delete(key);
    }
  }
}
