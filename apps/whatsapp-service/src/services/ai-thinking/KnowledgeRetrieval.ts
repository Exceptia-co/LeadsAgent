/**
 * KnowledgeRetrieval - AI Thinking Service Module
 *
 * Handles knowledge base search, relevance ranking, and content retrieval.
 * Optimizes knowledge discovery through intelligent caching, semantic search,
 * and context-aware filtering.
 *
 * Part of Phase 3: AI Services Modularization
 */

import { logger } from '../../utils/logger';
import DatabaseService from '../DatabaseService';
import type { IntentAnalysisExtended } from './ContextEnricher';

// ============================================
// INTERFACES Y TIPOS
// ============================================

export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  category: string;
  subcategory?: string;
  tags?: string[];
  relevanceScore?: number;
  match_quality?: string;
  source?: string;
  lastUpdated?: Date;
  usageCount?: number;
}

export interface KnowledgeSearchParams {
  query: string;
  intent?: string;
  category?: string;
  maxResults?: number;
  minRelevance?: number;
  includeMetadata?: boolean;
}

export interface KnowledgeSearchResult {
  items: KnowledgeItem[];
  totalFound: number;
  searchTime: number;
  confidence: number;
  searchStrategy: string;
  cacheHit: boolean;
}

export interface KnowledgeCache {
  items: KnowledgeItem[];
  timestamp: number;
  query: string;
  expiresAt: number;
}

// ============================================
// KNOWLEDGE RETRIEVAL CLASS
// ============================================

export class KnowledgeRetrieval {
  private knowledgeCache: Map<string, KnowledgeCache> = new Map();
  private readonly CACHE_TTL = 1000 * 60 * 30; // 30 minutes
  private readonly MAX_CACHE_SIZE = 500;
  private readonly DEFAULT_MAX_RESULTS = 5;

  constructor() {
    logger.debug('KnowledgeRetrieval module initialized');
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Main knowledge retrieval method with intelligent search strategy
   */
  public async retrieveKnowledge(
    message: string,
    intentAnalysis: IntentAnalysisExtended,
    params?: Partial<KnowledgeSearchParams>
  ): Promise<KnowledgeSearchResult> {
    const startTime = Date.now();

    try {
      const searchParams: KnowledgeSearchParams = {
        query: message,
        intent: intentAnalysis.intent,
        category: intentAnalysis.category,
        maxResults: params?.maxResults || this.DEFAULT_MAX_RESULTS,
        minRelevance: params?.minRelevance || 0.3,
        includeMetadata: params?.includeMetadata || true,
        ...params,
      };

      // 1. Check cache first
      const cacheResult = this.checkCache(searchParams);
      if (cacheResult) {
        return {
          ...cacheResult,
          searchTime: Date.now() - startTime,
          cacheHit: true,
        };
      }

      // 2. Determine search strategy based on intent and message complexity
      const searchStrategy = this.determineSearchStrategy(intentAnalysis, message);

      // 3. Execute search based on strategy
      let knowledgeItems: KnowledgeItem[] = [];

      switch (searchStrategy) {
        case 'greeting_optimized':
          knowledgeItems = await this.searchGreetingKnowledge(searchParams);
          break;
        case 'intent_focused':
          knowledgeItems = await this.searchIntentFocused(searchParams);
          break;
        case 'semantic_search':
          knowledgeItems = await this.searchSemanticKnowledge(searchParams);
          break;
        case 'hybrid_search':
          knowledgeItems = await this.searchHybridKnowledge(searchParams);
          break;
        default:
          knowledgeItems = await this.searchGenericKnowledge(searchParams);
      }

      // 4. Post-process and rank results
      const rankedItems = this.rankAndFilterResults(knowledgeItems, searchParams, intentAnalysis);

      // 5. Calculate overall confidence
      const confidence = this.calculateSearchConfidence(rankedItems, searchParams, searchStrategy);

      // 6. Cache results
      const result: KnowledgeSearchResult = {
        items: rankedItems,
        totalFound: rankedItems.length,
        searchTime: Date.now() - startTime,
        confidence,
        searchStrategy,
        cacheHit: false,
      };

      this.cacheResults(searchParams, result);

      // 7. Cleanup cache if needed
      this.cleanupCache();

      logger.debug('Knowledge retrieval completed:', {
        query: message.substring(0, 50),
        strategy: searchStrategy,
        itemsFound: rankedItems.length,
        searchTime: result.searchTime,
        confidence: confidence,
      });

      return result;
    } catch (error) {
      logger.error('Error in knowledge retrieval:', error);

      return {
        items: [],
        totalFound: 0,
        searchTime: Date.now() - startTime,
        confidence: 0.2,
        searchStrategy: 'error_fallback',
        cacheHit: false,
      };
    }
  }

  /**
   * Quick knowledge lookup for specific categories
   */
  public async getKnowledgeByCategory(
    category: string,
    maxResults: number = this.DEFAULT_MAX_RESULTS
  ): Promise<KnowledgeItem[]> {
    try {
      const items = await DatabaseService.getKnowledgeBase(category);
      return items.slice(0, maxResults).map(item => ({
        id: item.id,
        title: item.title,
        content: item.content,
        category: item.category,
        tags: item.tags,
        source: 'category_search',
      }));
    } catch (error) {
      logger.error('Error getting knowledge by category:', error);
      return [];
    }
  }

  /**
   * Search knowledge base with text query
   */
  public async searchKnowledgeBase(
    query: string,
    maxResults: number = this.DEFAULT_MAX_RESULTS
  ): Promise<KnowledgeItem[]> {
    try {
      const items = await DatabaseService.searchKnowledgeBase(query);
      return items.slice(0, maxResults).map(item => ({
        id: item.id,
        title: item.title,
        content: item.content,
        category: item.category,
        tags: item.tags,
        match_quality: item.match_quality || 'medium',
        source: 'text_search',
      }));
    } catch (error) {
      logger.error('Error searching knowledge base:', error);
      return [];
    }
  }

  // ============================================
  // PRIVATE SEARCH STRATEGIES
  // ============================================

  /**
   * Determine optimal search strategy based on intent and message
   */
  private determineSearchStrategy(intentAnalysis: IntentAnalysisExtended, message: string): string {
    // For greetings, minimal knowledge needed
    if (intentAnalysis.intent === 'saludo' || intentAnalysis.intent === 'greeting') {
      return 'greeting_optimized';
    }

    // For specific commercial intents, focus on intent-based search
    if (intentAnalysis.category === 'commercial' && intentAnalysis.confidence > 0.7) {
      return 'intent_focused';
    }

    // For complex queries, use hybrid approach
    const wordCount = message.split(/\s+/).length;
    if (wordCount > 10 || intentAnalysis.urgency === 'high') {
      return 'hybrid_search';
    }

    // For specific queries with high confidence, use semantic search
    if (intentAnalysis.confidence > 0.8) {
      return 'semantic_search';
    }

    // Default strategy
    return 'hybrid_search';
  }

  /**
   * Optimized search for greeting messages (minimal knowledge)
   */
  private async searchGreetingKnowledge(_params: KnowledgeSearchParams): Promise<KnowledgeItem[]> {
    // For greetings, return minimal or no knowledge to speed up response
    return [];
  }

  /**
   * Intent-focused search for commercial queries
   */
  private async searchIntentFocused(params: KnowledgeSearchParams): Promise<KnowledgeItem[]> {
    try {
      const items: KnowledgeItem[] = [];

      // Search by category first
      if (params.category) {
        const categoryItems = await this.getKnowledgeByCategory(params.category, 3);
        items.push(...categoryItems);
      }

      // Search by intent-specific keywords
      const intentKeywords = this.getIntentKeywords(params.intent || '');
      for (const keyword of intentKeywords) {
        const searchItems = await this.searchKnowledgeBase(keyword, 2);
        items.push(...searchItems);
      }

      return this.removeDuplicates(items);
    } catch (error) {
      logger.error('Error in intent-focused search:', error);
      return [];
    }
  }

  /**
   * Semantic search using message content
   */
  private async searchSemanticKnowledge(params: KnowledgeSearchParams): Promise<KnowledgeItem[]> {
    try {
      // Extract key terms from query
      const keyTerms = this.extractKeyTerms(params.query);
      const items: KnowledgeItem[] = [];

      // Search for each key term
      for (const term of keyTerms) {
        const searchItems = await this.searchKnowledgeBase(term, 3);
        items.push(...searchItems);
      }

      // Also search full query
      const fullQueryItems = await this.searchKnowledgeBase(params.query, 3);
      items.push(...fullQueryItems);

      return this.removeDuplicates(items);
    } catch (error) {
      logger.error('Error in semantic search:', error);
      return [];
    }
  }

  /**
   * Hybrid search combining multiple strategies
   */
  private async searchHybridKnowledge(params: KnowledgeSearchParams): Promise<KnowledgeItem[]> {
    try {
      const items: KnowledgeItem[] = [];

      // 1. Intent-based search
      if (params.intent && params.category) {
        const intentItems = await this.searchIntentFocused(params);
        items.push(...intentItems);
      }

      // 2. Semantic search
      const semanticItems = await this.searchSemanticKnowledge(params);
      items.push(...semanticItems);

      // 3. Category fallback
      if (items.length < 3 && params.category) {
        const categoryItems = await this.getKnowledgeByCategory(params.category, 3);
        items.push(...categoryItems);
      }

      return this.removeDuplicates(items);
    } catch (error) {
      logger.error('Error in hybrid search:', error);
      return [];
    }
  }

  /**
   * Generic knowledge search fallback
   */
  private async searchGenericKnowledge(params: KnowledgeSearchParams): Promise<KnowledgeItem[]> {
    try {
      return await this.searchKnowledgeBase(
        params.query,
        params.maxResults || this.DEFAULT_MAX_RESULTS
      );
    } catch (error) {
      logger.error('Error in generic search:', error);
      return [];
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Rank and filter results based on relevance and parameters
   */
  private rankAndFilterResults(
    items: KnowledgeItem[],
    params: KnowledgeSearchParams,
    _intentAnalysis: IntentAnalysisExtended
  ): KnowledgeItem[] {
    // Remove duplicates
    const uniqueItems = this.removeDuplicates(items);

    // Calculate relevance scores
    const scoredItems = uniqueItems.map(item => ({
      ...item,
      relevanceScore: this.calculateRelevanceScore(item, params, _intentAnalysis),
    }));

    // Filter by minimum relevance
    const filteredItems = scoredItems.filter(
      item => (item.relevanceScore || 0) >= (params.minRelevance || 0.3)
    );

    // Sort by relevance score (descending)
    const sortedItems = filteredItems.sort(
      (a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0)
    );

    // Limit results
    return sortedItems.slice(0, params.maxResults || this.DEFAULT_MAX_RESULTS);
  }

  /**
   * Calculate relevance score for knowledge item
   */
  private calculateRelevanceScore(
    item: KnowledgeItem,
    params: KnowledgeSearchParams,
    _intentAnalysis: IntentAnalysisExtended
  ): number {
    let score = 0.5; // Base score

    // Category match bonus
    if (item.category === params.category) {
      score += 0.3;
    }

    // Intent keyword match
    const intentKeywords = this.getIntentKeywords(params.intent || '');
    const itemText = `${item.title} ${item.content}`.toLowerCase();
    const matchingKeywords = intentKeywords.filter(keyword =>
      itemText.includes(keyword.toLowerCase())
    );
    score += (matchingKeywords.length / intentKeywords.length) * 0.2;

    // Query term match
    const queryTerms = this.extractKeyTerms(params.query);
    const matchingTerms = queryTerms.filter(term => itemText.includes(term.toLowerCase()));
    score += (matchingTerms.length / queryTerms.length) * 0.3;

    // Match quality bonus (from database search)
    if (item.match_quality === 'high') score += 0.2;
    else if (item.match_quality === 'medium') score += 0.1;

    return Math.min(score, 1.0);
  }

  /**
   * Calculate overall search confidence
   */
  private calculateSearchConfidence(
    items: KnowledgeItem[],
    _params: KnowledgeSearchParams,
    strategy: string
  ): number {
    if (items.length === 0) return 0.2;

    // Base confidence by strategy
    const strategyConfidence = {
      greeting_optimized: 0.9, // High confidence for greetings
      intent_focused: 0.8,
      semantic_search: 0.7,
      hybrid_search: 0.8,
      generic_search: 0.6,
    };

    let confidence = strategyConfidence[strategy as keyof typeof strategyConfidence] || 0.6;

    // Adjust based on results quality
    const avgRelevance =
      items.reduce((sum, item) => sum + (item.relevanceScore || 0), 0) / items.length;
    confidence = (confidence + avgRelevance) / 2;

    // Boost confidence if multiple high-quality results
    if (items.length >= 3 && avgRelevance > 0.7) {
      confidence = Math.min(confidence + 0.1, 0.95);
    }

    return confidence;
  }

  /**
   * Get intent-specific keywords for targeted search
   */
  private getIntentKeywords(intent: string): string[] {
    const keywordMap: Record<string, string[]> = {
      consulta_precio: ['precio', 'costo', 'tarifa', 'paquete', 'plan', 'HUB'],
      pricing_inquiry: ['price', 'cost', 'rate', 'package', 'plan', 'HUB'],
      consulta_producto: ['servicio', 'anuncio', 'destacado', 'premium', 'vip'],
      product_inquiry: ['service', 'ad', 'featured', 'premium', 'vip'],
      registro: ['registro', 'cuenta', 'alta', 'sign up'],
      technical_support: ['error', 'problema', 'ayuda', 'soporte'],
      general: ['información', 'info', 'ayuda', 'escortshub'],
    };

    return keywordMap[intent] || keywordMap['general'];
  }

  /**
   * Extract key terms from query text
   */
  private extractKeyTerms(query: string): string[] {
    // Remove stop words and extract meaningful terms
    const stopWords = [
      'el',
      'la',
      'de',
      'que',
      'y',
      'a',
      'en',
      'un',
      'es',
      'se',
      'no',
      'te',
      'lo',
      'le',
      'da',
      'su',
      'por',
      'son',
      'con',
      'para',
      'al',
      'del',
    ];

    const words = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word));

    return [...new Set(words)]; // Remove duplicates
  }

  /**
   * Remove duplicate knowledge items
   */
  private removeDuplicates(items: KnowledgeItem[]): KnowledgeItem[] {
    const seen = new Set<string>();
    return items.filter(item => {
      const key = item.id || `${item.title}_${item.category}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ============================================
  // CACHE MANAGEMENT
  // ============================================

  /**
   * Check cache for existing results
   */
  private checkCache(params: KnowledgeSearchParams): KnowledgeSearchResult | null {
    const cacheKey = this.generateCacheKey(params);
    const cached = this.knowledgeCache.get(cacheKey);

    if (cached && Date.now() < cached.expiresAt) {
      return {
        items: cached.items,
        totalFound: cached.items.length,
        searchTime: 0,
        confidence: 0.8,
        searchStrategy: 'cached',
        cacheHit: true,
      };
    }

    return null;
  }

  /**
   * Cache search results
   */
  private cacheResults(params: KnowledgeSearchParams, result: KnowledgeSearchResult): void {
    const cacheKey = this.generateCacheKey(params);

    this.knowledgeCache.set(cacheKey, {
      items: result.items,
      timestamp: Date.now(),
      query: params.query,
      expiresAt: Date.now() + this.CACHE_TTL,
    });
  }

  /**
   * Generate cache key from search parameters
   */
  private generateCacheKey(params: KnowledgeSearchParams): string {
    return `${params.query}_${params.intent}_${params.category}_${params.maxResults}`.toLowerCase();
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();

    // Remove expired entries
    for (const [key, value] of this.knowledgeCache.entries()) {
      if (now > value.expiresAt) {
        this.knowledgeCache.delete(key);
      }
    }

    // Remove oldest entries if cache is too large
    if (this.knowledgeCache.size > this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.knowledgeCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

      const toDelete = entries.slice(0, Math.floor(this.MAX_CACHE_SIZE * 0.3));
      toDelete.forEach(([key]) => this.knowledgeCache.delete(key));
    }
  }
}
