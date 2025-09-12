/**
 * CacheManager Test Suite
 *
 * Comprehensive tests for the CacheManager service including:
 * - Basic CRUD operations for all cache types
 * - TTL (Time To Live) functionality
 * - Cache size limits and eviction
 * - Error handling and edge cases
 * - Performance and memory management
 */

import { CacheManager } from '../../cache/CacheManager';
import { IntentAnalysis, ComplexityAnalysis, CacheConfig } from '../../interfaces';
import { CacheError } from '../../errors/ThinkingServiceErrors';

describe('CacheManager', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    // Get fresh instance for each test
    cacheManager = CacheManager.getInstance();
    cacheManager.clear(); // Ensure clean state
  });

  afterEach(() => {
    cacheManager.clear();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = CacheManager.getInstance();
      const instance2 = CacheManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should maintain state across getInstance calls', () => {
      const testIntent: IntentAnalysis = {
        intent: 'test',
        confidence: 0.8,
        entities: {},
        sentiment: 'positive',
        urgency: 'low',
        category: 'test',
        subcategory: 'test',
      };

      cacheManager.setIntent('test-key', testIntent);

      const newInstance = CacheManager.getInstance();
      const retrieved = newInstance.getIntent('test-key');

      expect(retrieved).toEqual(testIntent);
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration correctly', () => {
      const newConfig: Partial<CacheConfig> = {
        ttl: 5000,
        maxSize: 100,
      };

      cacheManager.updateConfig(newConfig);

      // Test that new TTL is applied
      const testIntent: IntentAnalysis = {
        intent: 'test',
        confidence: 0.8,
        entities: {},
        sentiment: 'positive',
        urgency: 'low',
        category: 'test',
        subcategory: 'test',
      };

      cacheManager.setIntent('test-key', testIntent);

      // Mock Date.now to simulate time passage
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => originalDateNow() + 6000); // 6 seconds later

      const retrieved = cacheManager.getIntent('test-key');
      expect(retrieved).toBeNull(); // Should be expired

      // Restore Date.now
      Date.now = originalDateNow;
    });
  });

  describe('Intent Caching', () => {
    const testIntent: IntentAnalysis = {
      intent: 'greeting',
      confidence: 0.95,
      entities: { user: 'John' },
      sentiment: 'positive',
      urgency: 'low',
      category: 'social',
      subcategory: 'greeting',
    };

    it('should store and retrieve intent correctly', () => {
      cacheManager.setIntent('intent-key', testIntent);
      const retrieved = cacheManager.getIntent('intent-key');

      expect(retrieved).toEqual(testIntent);
    });

    it('should return null for non-existent keys', () => {
      const retrieved = cacheManager.getIntent('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should expire intent after TTL', async () => {
      // Set short TTL for testing
      cacheManager.updateConfig({ ttl: 100 }); // 100ms

      cacheManager.setIntent('expire-test', testIntent);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      const retrieved = cacheManager.getIntent('expire-test');
      expect(retrieved).toBeNull();
    });

    it('should handle cache errors gracefully', () => {
      // Test with invalid key that might cause internal errors
      expect(() => {
        cacheManager.setIntent('', testIntent);
      }).not.toThrow();
    });
  });

  describe('Knowledge Caching', () => {
    const testKnowledge = [
      { title: 'Test Knowledge 1', content: 'Content 1', relevance: 0.8 },
      { title: 'Test Knowledge 2', content: 'Content 2', relevance: 0.6 },
    ];

    it('should store and retrieve knowledge correctly', () => {
      cacheManager.setKnowledge('knowledge-key', testKnowledge);
      const retrieved = cacheManager.getKnowledge('knowledge-key');

      expect(retrieved).toEqual(testKnowledge);
    });

    it('should return null for expired knowledge', async () => {
      cacheManager.updateConfig({ ttl: 50 });

      cacheManager.setKnowledge('expire-knowledge', testKnowledge);

      await new Promise(resolve => setTimeout(resolve, 100));

      const retrieved = cacheManager.getKnowledge('expire-knowledge');
      expect(retrieved).toBeNull();
    });

    it('should handle empty knowledge arrays', () => {
      cacheManager.setKnowledge('empty-knowledge', []);
      const retrieved = cacheManager.getKnowledge('empty-knowledge');

      expect(retrieved).toEqual([]);
    });
  });

  describe('Response Caching', () => {
    const testResponse = 'This is a test response with detailed information.';

    it('should store and retrieve responses correctly', () => {
      cacheManager.setResponse('response-key', testResponse);
      const retrieved = cacheManager.getResponse('response-key');

      expect(retrieved).toBe(testResponse);
    });

    it('should use different TTL for responses', async () => {
      // Set different TTLs
      cacheManager.updateConfig({
        ttl: 1000, // 1 second for other caches
        responseTtl: 50, // 50ms for responses
      });

      cacheManager.setResponse('response-ttl-test', testResponse);

      await new Promise(resolve => setTimeout(resolve, 100));

      const retrieved = cacheManager.getResponse('response-ttl-test');
      expect(retrieved).toBeNull();
    });

    it('should handle long responses', () => {
      const longResponse = 'A'.repeat(10000); // 10KB response

      cacheManager.setResponse('long-response', longResponse);
      const retrieved = cacheManager.getResponse('long-response');

      expect(retrieved).toBe(longResponse);
    });
  });

  describe('Complexity Caching', () => {
    const testComplexity: ComplexityAnalysis = {
      complexity: 'medium',
      confidence: 0.7,
      factors: {
        messageLength: 0.6,
        vocabulary: 0.8,
        structure: 0.7,
        context: 0.5,
      },
      score: 0.65,
      reasoning: 'Medium complexity due to technical terms',
    };

    it('should store and retrieve complexity analysis correctly', () => {
      cacheManager.setComplexity('complexity-key', testComplexity);
      const retrieved = cacheManager.getComplexity('complexity-key');

      expect(retrieved).toEqual(testComplexity);
    });

    it('should expire complexity analysis after TTL', async () => {
      cacheManager.updateConfig({ ttl: 50 });

      cacheManager.setComplexity('expire-complexity', testComplexity);

      await new Promise(resolve => setTimeout(resolve, 100));

      const retrieved = cacheManager.getComplexity('expire-complexity');
      expect(retrieved).toBeNull();
    });
  });

  describe('Cache Size Management', () => {
    it('should enforce maximum cache size', () => {
      cacheManager.updateConfig({ maxSize: 3 });

      const testIntent: IntentAnalysis = {
        intent: 'test',
        confidence: 0.8,
        entities: {},
        sentiment: 'positive',
        urgency: 'low',
        category: 'test',
        subcategory: 'test',
      };

      // Add more items than maxSize
      for (let i = 0; i < 5; i++) {
        cacheManager.setIntent(`intent-${i}`, testIntent);
      }

      const stats = cacheManager.getStats();
      expect(stats.intentCacheSize).toBeLessThanOrEqual(3);
    });

    it('should remove oldest entries when enforcing size limits', () => {
      cacheManager.updateConfig({ maxSize: 2 });

      const testIntent: IntentAnalysis = {
        intent: 'test',
        confidence: 0.8,
        entities: {},
        sentiment: 'positive',
        urgency: 'low',
        category: 'test',
        subcategory: 'test',
      };

      // Add items with small delays to ensure different timestamps
      cacheManager.setIntent('intent-1', testIntent);

      setTimeout(() => {
        cacheManager.setIntent('intent-2', testIntent);
      }, 10);

      setTimeout(() => {
        cacheManager.setIntent('intent-3', testIntent);

        // The oldest (intent-1) should be removed
        expect(cacheManager.getIntent('intent-1')).toBeNull();
        expect(cacheManager.getIntent('intent-2')).not.toBeNull();
        expect(cacheManager.getIntent('intent-3')).not.toBeNull();
      }, 20);
    });
  });

  describe('Cache Cleanup', () => {
    it('should remove expired entries during cleanup', async () => {
      cacheManager.updateConfig({ ttl: 50 });

      const testIntent: IntentAnalysis = {
        intent: 'test',
        confidence: 0.8,
        entities: {},
        sentiment: 'positive',
        urgency: 'low',
        category: 'test',
        subcategory: 'test',
      };

      cacheManager.setIntent('cleanup-test-1', testIntent);
      cacheManager.setIntent('cleanup-test-2', testIntent);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Add fresh entry
      cacheManager.setIntent('cleanup-test-3', testIntent);

      cacheManager.cleanup();

      expect(cacheManager.getIntent('cleanup-test-1')).toBeNull();
      expect(cacheManager.getIntent('cleanup-test-2')).toBeNull();
      expect(cacheManager.getIntent('cleanup-test-3')).not.toBeNull();
    });

    it('should handle cleanup errors gracefully', () => {
      expect(() => {
        cacheManager.cleanup();
      }).not.toThrow();
    });
  });

  describe('Cache Statistics', () => {
    it('should provide accurate cache statistics', () => {
      const testIntent: IntentAnalysis = {
        intent: 'test',
        confidence: 0.8,
        entities: {},
        sentiment: 'positive',
        urgency: 'low',
        category: 'test',
        subcategory: 'test',
      };

      const testKnowledge = [{ title: 'Test', content: 'Content' }];
      const testComplexity: ComplexityAnalysis = {
        complexity: 'simple',
        confidence: 0.9,
        factors: {},
        score: 0.9,
        reasoning: 'Simple message',
      };

      cacheManager.setIntent('intent-1', testIntent);
      cacheManager.setIntent('intent-2', testIntent);
      cacheManager.setKnowledge('knowledge-1', testKnowledge);
      cacheManager.setResponse('response-1', 'Test response');
      cacheManager.setComplexity('complexity-1', testComplexity);

      const stats = cacheManager.getStats();

      expect(stats.intentCacheSize).toBe(2);
      expect(stats.knowledgeCacheSize).toBe(1);
      expect(stats.responseCacheSize).toBe(1);
      expect(stats.complexityCacheSize).toBe(1);
      expect(stats.totalMemoryUsage).toBeGreaterThan(0);
    });

    it('should estimate memory usage', () => {
      const stats = cacheManager.getStats();
      expect(typeof stats.totalMemoryUsage).toBe('number');
      expect(stats.totalMemoryUsage).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cache Clear Operations', () => {
    it('should clear all caches', () => {
      const testIntent: IntentAnalysis = {
        intent: 'test',
        confidence: 0.8,
        entities: {},
        sentiment: 'positive',
        urgency: 'low',
        category: 'test',
        subcategory: 'test',
      };

      cacheManager.setIntent('test-intent', testIntent);
      cacheManager.setKnowledge('test-knowledge', []);
      cacheManager.setResponse('test-response', 'test');

      cacheManager.clear();

      const stats = cacheManager.getStats();
      expect(stats.intentCacheSize).toBe(0);
      expect(stats.knowledgeCacheSize).toBe(0);
      expect(stats.responseCacheSize).toBe(0);
      expect(stats.complexityCacheSize).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle null or undefined values gracefully', () => {
      expect(() => {
        cacheManager.setIntent('null-test', null as any);
      }).not.toThrow();

      expect(() => {
        cacheManager.setKnowledge('undefined-test', undefined as any);
      }).not.toThrow();
    });

    it('should handle very long keys', () => {
      const longKey = 'a'.repeat(1000);
      const testIntent: IntentAnalysis = {
        intent: 'test',
        confidence: 0.8,
        entities: {},
        sentiment: 'positive',
        urgency: 'low',
        category: 'test',
        subcategory: 'test',
      };

      expect(() => {
        cacheManager.setIntent(longKey, testIntent);
      }).not.toThrow();

      const retrieved = cacheManager.getIntent(longKey);
      expect(retrieved).toEqual(testIntent);
    });

    it('should handle concurrent access', async () => {
      const testIntent: IntentAnalysis = {
        intent: 'test',
        confidence: 0.8,
        entities: {},
        sentiment: 'positive',
        urgency: 'low',
        category: 'test',
        subcategory: 'test',
      };

      // Simulate concurrent operations
      const promises = Array.from({ length: 10 }, (_, i) =>
        Promise.resolve().then(() => {
          cacheManager.setIntent(`concurrent-${i}`, testIntent);
          return cacheManager.getIntent(`concurrent-${i}`);
        })
      );

      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result).toEqual(testIntent);
      });
    });
  });

  describe('Performance Tests', () => {
    it('should handle large number of entries efficiently', () => {
      const startTime = Date.now();

      const testIntent: IntentAnalysis = {
        intent: 'test',
        confidence: 0.8,
        entities: {},
        sentiment: 'positive',
        urgency: 'low',
        category: 'test',
        subcategory: 'test',
      };

      // Add 1000 entries
      for (let i = 0; i < 1000; i++) {
        cacheManager.setIntent(`perf-test-${i}`, testIntent);
      }

      const writeTime = Date.now() - startTime;

      // Read operations
      const readStartTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        cacheManager.getIntent(`perf-test-${i}`);
      }

      const readTime = Date.now() - readStartTime;

      // Performance thresholds (adjust based on requirements)
      expect(writeTime).toBeLessThan(1000); // 1 second for 1000 writes
      expect(readTime).toBeLessThan(500); // 0.5 seconds for 1000 reads
    });

    it('should handle cleanup of large cache efficiently', () => {
      cacheManager.updateConfig({ ttl: 1 }); // Very short TTL

      const testIntent: IntentAnalysis = {
        intent: 'test',
        confidence: 0.8,
        entities: {},
        sentiment: 'positive',
        urgency: 'low',
        category: 'test',
        subcategory: 'test',
      };

      // Add many entries
      for (let i = 0; i < 500; i++) {
        cacheManager.setIntent(`cleanup-perf-${i}`, testIntent);
      }

      // Wait for expiration
      setTimeout(() => {
        const cleanupStartTime = Date.now();
        cacheManager.cleanup();
        const cleanupTime = Date.now() - cleanupStartTime;

        expect(cleanupTime).toBeLessThan(100); // Cleanup should be fast
      }, 10);
    });
  });
});
