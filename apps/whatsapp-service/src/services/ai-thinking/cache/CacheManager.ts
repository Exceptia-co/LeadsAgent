import { logger } from '../../../utils/logger';
import type {
  ICacheManager,
  CacheStats,
  CacheConfig,
  IntentAnalysis,
  ComplexityAnalysis,
} from '../interfaces';
import { CacheError } from '../errors/ThinkingServiceErrors';

export class CacheManager implements ICacheManager {
  private static instance: CacheManager;

  private intentCache: Map<string, { data: IntentAnalysis; timestamp: number }> = new Map();
  private knowledgeCache: Map<string, { data: any[]; timestamp: number }> = new Map();
  private responseCache: Map<string, { data: string; timestamp: number }> = new Map();
  private complexityCache: Map<string, { data: ComplexityAnalysis; timestamp: number }> = new Map();

  private config: CacheConfig = {
    ttl: 1000 * 60 * 30, // 30 minutes
    responseTtl: 1000 * 60 * 10, // 10 minutes for responses
    maxSize: 500,
  };

  private constructor() {}

  public static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  public updateConfig(newConfig: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.debug('Cache configuration updated:', this.config);
  }

  // Intent caching
  public getIntent(key: string): IntentAnalysis | null {
    try {
      const cached = this.intentCache.get(key);
      if (!cached) return null;

      if (Date.now() - cached.timestamp > this.config.ttl) {
        this.intentCache.delete(key);
        return null;
      }

      return cached.data;
    } catch (error) {
      throw new CacheError('Failed to retrieve intent from cache', { key, error });
    }
  }

  public setIntent(key: string, intent: IntentAnalysis): void {
    try {
      this.intentCache.set(key, {
        data: intent,
        timestamp: Date.now(),
      });

      this.enforceMaxSize(this.intentCache, 'intent');
    } catch (error) {
      throw new CacheError('Failed to store intent in cache', { key, error });
    }
  }

  // Knowledge caching
  public getKnowledge(key: string): any[] | null {
    try {
      const cached = this.knowledgeCache.get(key);
      if (!cached) return null;

      if (Date.now() - cached.timestamp > this.config.ttl) {
        this.knowledgeCache.delete(key);
        return null;
      }

      return cached.data;
    } catch (error) {
      throw new CacheError('Failed to retrieve knowledge from cache', { key, error });
    }
  }

  public setKnowledge(key: string, knowledge: any[]): void {
    try {
      this.knowledgeCache.set(key, {
        data: knowledge,
        timestamp: Date.now(),
      });

      this.enforceMaxSize(this.knowledgeCache, 'knowledge');
    } catch (error) {
      throw new CacheError('Failed to store knowledge in cache', { key, error });
    }
  }

  // Response caching
  public getResponse(key: string): string | null {
    try {
      const cached = this.responseCache.get(key);
      if (!cached) return null;

      if (Date.now() - cached.timestamp > this.config.responseTtl) {
        this.responseCache.delete(key);
        return null;
      }

      return cached.data;
    } catch (error) {
      throw new CacheError('Failed to retrieve response from cache', { key, error });
    }
  }

  public setResponse(key: string, response: string): void {
    try {
      this.responseCache.set(key, {
        data: response,
        timestamp: Date.now(),
      });

      this.enforceMaxSize(this.responseCache, 'response');
    } catch (error) {
      throw new CacheError('Failed to store response in cache', { key, error });
    }
  }

  // Complexity caching
  public getComplexity(key: string): ComplexityAnalysis | null {
    try {
      const cached = this.complexityCache.get(key);
      if (!cached) return null;

      if (Date.now() - cached.timestamp > this.config.ttl) {
        this.complexityCache.delete(key);
        return null;
      }

      return cached.data;
    } catch (error) {
      throw new CacheError('Failed to retrieve complexity from cache', { key, error });
    }
  }

  public setComplexity(key: string, complexity: ComplexityAnalysis): void {
    try {
      this.complexityCache.set(key, {
        data: complexity,
        timestamp: Date.now(),
      });

      this.enforceMaxSize(this.complexityCache, 'complexity');
    } catch (error) {
      throw new CacheError('Failed to store complexity in cache', { key, error });
    }
  }

  // Cache management
  public cleanup(): void {
    try {
      const now = Date.now();

      // Clean expired entries
      this.cleanExpiredEntries(this.intentCache, this.config.ttl, now);
      this.cleanExpiredEntries(this.knowledgeCache, this.config.ttl, now);
      this.cleanExpiredEntries(this.responseCache, this.config.responseTtl, now);
      this.cleanExpiredEntries(this.complexityCache, this.config.ttl, now);

      logger.debug('Cache cleanup completed', this.getStats());
    } catch (error) {
      throw new CacheError('Failed to cleanup cache', { error });
    }
  }

  public clear(): void {
    try {
      this.intentCache.clear();
      this.knowledgeCache.clear();
      this.responseCache.clear();
      this.complexityCache.clear();

      logger.info('All caches cleared');
    } catch (error) {
      throw new CacheError('Failed to clear cache', { error });
    }
  }

  public getStats(): CacheStats {
    return {
      intentCacheSize: this.intentCache.size,
      knowledgeCacheSize: this.knowledgeCache.size,
      responseCacheSize: this.responseCache.size,
      complexityCacheSize: this.complexityCache.size,
      totalMemoryUsage: this.estimateMemoryUsage(),
    };
  }

  // Private helper methods
  private enforceMaxSize<T>(cache: Map<string, T>, cacheType: string): void {
    if (cache.size <= this.config.maxSize) return;

    // Remove oldest entries (30% of max size)
    const entriesToRemove = Math.floor(this.config.maxSize * 0.3);
    const entries = Array.from(cache.entries());

    // Sort by timestamp (assuming entries have timestamp property)
    entries.sort((a, b) => {
      const aTime = (a[1] as any).timestamp || 0;
      const bTime = (b[1] as any).timestamp || 0;
      return aTime - bTime;
    });

    for (let i = 0; i < entriesToRemove && i < entries.length; i++) {
      cache.delete(entries[i][0]);
    }

    logger.debug(`Enforced max size on ${cacheType} cache`, {
      removed: entriesToRemove,
      currentSize: cache.size,
    });
  }

  private cleanExpiredEntries<T extends { timestamp: number }>(
    cache: Map<string, T>,
    ttl: number,
    now: number
  ): void {
    const expiredKeys: string[] = [];

    for (const [key, value] of cache.entries()) {
      if (now - value.timestamp > ttl) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => cache.delete(key));

    if (expiredKeys.length > 0) {
      logger.debug(`Cleaned ${expiredKeys.length} expired entries from cache`);
    }
  }

  private estimateMemoryUsage(): number {
    // Rough estimation of memory usage in bytes
    let total = 0;

    // Each Map entry has overhead + key + value
    total += this.intentCache.size * 100; // Rough estimate
    total += this.knowledgeCache.size * 500; // Knowledge entries are larger
    total += this.responseCache.size * 200; // Response strings
    total += this.complexityCache.size * 80; // Complexity data

    return total;
  }
}
