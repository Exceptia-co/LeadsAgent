import { IntentAnalysis, ComplexityAnalysis } from './types';

export interface ICacheManager {
  // Intent caching
  getIntent(key: string): IntentAnalysis | null;
  setIntent(key: string, intent: IntentAnalysis): void;

  // Knowledge caching
  getKnowledge(key: string): any[] | null;
  setKnowledge(key: string, knowledge: any[]): void;

  // Response caching
  getResponse(key: string): string | null;
  setResponse(key: string, response: string): void;

  // Complexity caching
  getComplexity(key: string): ComplexityAnalysis | null;
  setComplexity(key: string, complexity: ComplexityAnalysis): void;

  // Cache management
  cleanup(): void;
  clear(): void;
  getStats(): CacheStats;
}

export interface CacheStats {
  intentCacheSize: number;
  knowledgeCacheSize: number;
  responseCacheSize: number;
  complexityCacheSize: number;
  totalMemoryUsage: number;
}

export interface CacheConfig {
  ttl: number;
  responseTtl: number;
  maxSize: number;
}
