/**
 * StrategySelector - AI Thinking Service Module
 *
 * Determines optimal response strategies based on intent analysis, context,
 * and available knowledge. Handles decision-making for response type, tone,
 * length, and priority.
 *
 * Part of Phase 3: AI Services Modularization
 */

import { logger } from '../../utils/logger';
import DatabaseService from '../DatabaseService';
import { IntentAnalysisExtended, EnrichedContext } from './ContextEnricher';
import { KnowledgeItem } from './KnowledgeRetrieval';

// ============================================
// INTERFACES Y TIPOS
// ============================================

export interface ResponseStrategy {
  type: 'direct' | 'contextual' | 'escalate' | 'defer' | 'clarify';
  tone: 'professional' | 'friendly' | 'technical' | 'sales' | 'supportive';
  length: 'brief' | 'medium' | 'detailed';
  shouldQuote: boolean;
  shouldUseEmojis: boolean;
  priority: 'low' | 'medium' | 'high';
  templateCategory?: string;
}

export interface StrategyAnalysis {
  strategy: ResponseStrategy;
  confidence: number;
  reasoning: string[];
  factors: StrategyFactor[];
  timeToDecision: number;
}

export interface StrategyFactor {
  name: string;
  value: any;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number;
  description: string;
}

export interface StrategyRules {
  intentRules: Record<string, Partial<ResponseStrategy>>;
  sentimentRules: Record<string, Partial<ResponseStrategy>>;
  urgencyRules: Record<string, Partial<ResponseStrategy>>;
  timeRules: Record<string, Partial<ResponseStrategy>>;
  knowledgeRules: Record<string, Partial<ResponseStrategy>>;
}

// ============================================
// STRATEGY SELECTOR CLASS
// ============================================

export class StrategySelector {
  private strategyCache: Map<string, StrategyAnalysis> = new Map();
  private readonly MAX_CACHE_SIZE = 200;
  private readonly CACHE_TTL = 1000 * 60 * 15; // 15 minutes

  constructor() {
    logger.debug('StrategySelector module initialized');
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Determine optimal response strategy based on all available context
   */
  public async determineResponseStrategy(
    intentAnalysis: IntentAnalysisExtended,
    context: EnrichedContext,
    knowledgeData: KnowledgeItem[]
  ): Promise<StrategyAnalysis> {
    const startTime = Date.now();

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(intentAnalysis, context, knowledgeData);
      const cachedStrategy = this.checkCache(cacheKey);
      if (cachedStrategy) {
        return cachedStrategy;
      }

      // Initialize base strategy
      const strategy: ResponseStrategy = {
        type: 'direct',
        tone: 'friendly',
        length: 'medium',
        shouldQuote: false,
        shouldUseEmojis: true,
        priority: 'medium',
      };

      const factors: StrategyFactor[] = [];
      const reasoning: string[] = [];

      // 1. PRIORITY CHECK: Handle greetings first
      const greetingStrategy = await this.handleGreetingStrategy(
        context,
        strategy,
        factors,
        reasoning
      );
      if (greetingStrategy) {
        const analysis: StrategyAnalysis = {
          strategy: greetingStrategy,
          confidence: 0.95,
          reasoning,
          factors,
          timeToDecision: Date.now() - startTime,
        };

        this.cacheStrategy(cacheKey, analysis);
        return analysis;
      }

      // 2. Apply intent-based rules
      this.applyIntentRules(intentAnalysis, strategy, factors, reasoning);

      // 3. Apply sentiment-based adjustments
      this.applySentimentRules(intentAnalysis, strategy, factors, reasoning);

      // 4. Apply urgency-based adjustments
      this.applyUrgencyRules(intentAnalysis, strategy, factors, reasoning);

      // 5. Apply knowledge-based adjustments
      this.applyKnowledgeRules(knowledgeData, strategy, factors, reasoning);

      // 6. Apply context-based adjustments
      this.applyContextRules(context, strategy, factors, reasoning);

      // 7. Apply temporal adjustments
      this.applyTimeRules(context, strategy, factors, reasoning);

      // 8. Calculate confidence based on factors
      const confidence = this.calculateStrategyConfidence(factors, intentAnalysis);

      const analysis: StrategyAnalysis = {
        strategy,
        confidence,
        reasoning,
        factors,
        timeToDecision: Date.now() - startTime,
      };

      // Cache and cleanup
      this.cacheStrategy(cacheKey, analysis);
      this.cleanupCache();

      logger.debug('Strategy determined:', {
        intent: intentAnalysis.intent,
        type: strategy.type,
        tone: strategy.tone,
        confidence,
        factors: factors.length,
        timeMs: analysis.timeToDecision,
      });

      return analysis;
    } catch (error) {
      logger.error('Error determining response strategy:', error);

      // Fallback strategy
      const fallbackStrategy: ResponseStrategy = {
        type: 'direct',
        tone: 'friendly',
        length: 'medium',
        shouldQuote: false,
        shouldUseEmojis: true,
        priority: 'medium',
      };

      return {
        strategy: fallbackStrategy,
        confidence: 0.5,
        reasoning: ['Error in strategy determination, using fallback'],
        factors: [],
        timeToDecision: Date.now() - startTime,
      };
    }
  }

  /**
   * Get strategy rules for specific scenario
   */
  public getStrategyRules(): StrategyRules {
    return {
      intentRules: {
        greeting: { type: 'contextual', tone: 'friendly', length: 'brief' },
        saludo: { type: 'contextual', tone: 'friendly', length: 'brief' },
        pricing_inquiry: {
          type: 'contextual',
          tone: 'sales',
          length: 'medium',
          templateCategory: 'pricing',
        },
        consulta_precio: {
          type: 'contextual',
          tone: 'sales',
          length: 'medium',
          templateCategory: 'pricing',
        },
        product_inquiry: {
          type: 'contextual',
          tone: 'sales',
          length: 'medium',
          templateCategory: 'products',
        },
        consulta_producto: {
          type: 'contextual',
          tone: 'sales',
          length: 'medium',
          templateCategory: 'products',
        },
        complaint: { type: 'escalate', tone: 'supportive', priority: 'high' },
        queja: { type: 'escalate', tone: 'supportive', priority: 'high' },
        technical_support: { type: 'contextual', tone: 'technical', length: 'detailed' },
      },
      sentimentRules: {
        negative: { tone: 'supportive', priority: 'high' },
        positive: { tone: 'friendly', shouldUseEmojis: true },
        neutral: { tone: 'professional' },
      },
      urgencyRules: {
        high: { priority: 'high', length: 'brief', type: 'direct' },
        medium: { priority: 'medium' },
        low: { priority: 'low' },
      },
      timeRules: {
        night: { tone: 'professional', shouldUseEmojis: false },
        weekend: { tone: 'friendly', shouldUseEmojis: true },
      },
      knowledgeRules: {
        no_knowledge: { type: 'defer', tone: 'professional' },
        rich_knowledge: { type: 'contextual', length: 'detailed' },
      },
    };
  }

  // ============================================
  // PRIVATE STRATEGY METHODS
  // ============================================

  /**
   * Handle greeting strategy with special optimization
   */
  private async handleGreetingStrategy(
    context: EnrichedContext,
    strategy: ResponseStrategy,
    factors: StrategyFactor[],
    reasoning: string[]
  ): Promise<ResponseStrategy | null> {
    try {
      // Check if it's a greeting using the context enricher logic
      const isGreeting = await this.isGreetingMessage(context.messageText || '');

      if (isGreeting) {
        strategy.type = 'contextual';
        strategy.tone = 'friendly';
        strategy.length = 'medium';
        strategy.shouldUseEmojis = true;
        strategy.priority = 'medium';

        factors.push({
          name: 'greeting_detected',
          value: true,
          impact: 'positive',
          weight: 1.0,
          description: 'Greeting message detected, using optimized greeting strategy',
        });

        reasoning.push('GREETING DETECTED: Automatic response strategy applied');

        return strategy;
      }

      return null;
    } catch (error) {
      logger.error('Error in greeting strategy check:', error);
      return null;
    }
  }

  /**
   * Apply intent-based strategy rules
   */
  private applyIntentRules(
    intentAnalysis: IntentAnalysisExtended,
    strategy: ResponseStrategy,
    factors: StrategyFactor[],
    reasoning: string[]
  ): void {
    const rules = this.getStrategyRules().intentRules;
    const intentRule = rules[intentAnalysis.intent];

    if (intentRule) {
      Object.assign(strategy, intentRule);

      factors.push({
        name: 'intent_rule',
        value: intentAnalysis.intent,
        impact: 'positive',
        weight: 0.8,
        description: `Applied ${intentAnalysis.intent} intent rules`,
      });

      reasoning.push(`Intent-based strategy: ${intentAnalysis.intent} → ${strategy.type}`);
    } else {
      factors.push({
        name: 'intent_fallback',
        value: intentAnalysis.intent,
        impact: 'neutral',
        weight: 0.5,
        description: 'No specific intent rule found, using default',
      });

      reasoning.push('No specific intent rule found, using default strategy');
    }
  }

  /**
   * Apply sentiment-based adjustments
   */
  private applySentimentRules(
    intentAnalysis: IntentAnalysisExtended,
    strategy: ResponseStrategy,
    factors: StrategyFactor[],
    reasoning: string[]
  ): void {
    const rules = this.getStrategyRules().sentimentRules;
    const sentimentRule = rules[intentAnalysis.sentiment];

    if (sentimentRule) {
      Object.assign(strategy, sentimentRule);

      factors.push({
        name: 'sentiment_adjustment',
        value: intentAnalysis.sentiment,
        impact: intentAnalysis.sentiment === 'negative' ? 'negative' : 'positive',
        weight: 0.6,
        description: `Adjusted for ${intentAnalysis.sentiment} sentiment`,
      });

      reasoning.push(`Sentiment adjustment: ${intentAnalysis.sentiment} → tone: ${strategy.tone}`);
    }
  }

  /**
   * Apply urgency-based adjustments
   */
  private applyUrgencyRules(
    intentAnalysis: IntentAnalysisExtended,
    strategy: ResponseStrategy,
    factors: StrategyFactor[],
    reasoning: string[]
  ): void {
    const rules = this.getStrategyRules().urgencyRules;
    const urgencyRule = rules[intentAnalysis.urgency];

    if (urgencyRule) {
      Object.assign(strategy, urgencyRule);

      factors.push({
        name: 'urgency_adjustment',
        value: intentAnalysis.urgency,
        impact: intentAnalysis.urgency === 'high' ? 'positive' : 'neutral',
        weight: 0.7,
        description: `Adjusted for ${intentAnalysis.urgency} urgency`,
      });

      reasoning.push(
        `Urgency adjustment: ${intentAnalysis.urgency} → priority: ${strategy.priority}`
      );
    }
  }

  /**
   * Apply knowledge-based adjustments
   */
  private applyKnowledgeRules(
    knowledgeData: KnowledgeItem[],
    strategy: ResponseStrategy,
    factors: StrategyFactor[],
    reasoning: string[]
  ): void {
    const hasKnowledge = knowledgeData.length > 0;
    const knowledgeQuality = this.assessKnowledgeQuality(knowledgeData);

    if (!hasKnowledge) {
      // No knowledge available - defer or clarify
      strategy.type = 'defer';
      strategy.tone = 'professional';

      factors.push({
        name: 'no_knowledge',
        value: knowledgeData.length,
        impact: 'negative',
        weight: 0.8,
        description: 'No relevant knowledge found, deferring to human',
      });

      reasoning.push('No knowledge available: deferring to human agent');
    } else if (knowledgeQuality === 'high') {
      // Rich knowledge available
      strategy.type = 'contextual';
      strategy.length = 'detailed';

      factors.push({
        name: 'rich_knowledge',
        value: knowledgeData.length,
        impact: 'positive',
        weight: 0.9,
        description: `High-quality knowledge available (${knowledgeData.length} items)`,
      });

      reasoning.push(
        `Rich knowledge available: using contextual response with ${knowledgeData.length} items`
      );
    } else {
      // Limited knowledge
      factors.push({
        name: 'limited_knowledge',
        value: knowledgeData.length,
        impact: 'neutral',
        weight: 0.6,
        description: `Limited knowledge available (${knowledgeData.length} items)`,
      });

      reasoning.push(`Limited knowledge: proceeding with caution`);
    }
  }

  /**
   * Apply context-based adjustments
   */
  private applyContextRules(
    context: EnrichedContext,
    strategy: ResponseStrategy,
    factors: StrategyFactor[],
    reasoning: string[]
  ): void {
    // Conversation history adjustments
    if (context.messageHistory && context.messageHistory.length > 10) {
      strategy.shouldQuote = false;

      factors.push({
        name: 'long_conversation',
        value: context.messageHistory.length,
        impact: 'neutral',
        weight: 0.4,
        description: 'Long conversation history, avoiding quotes',
      });

      reasoning.push('Long conversation: avoiding quotes for brevity');
    }

    // Engagement level adjustments
    if (context.userEngagementLevel === 'high') {
      strategy.shouldUseEmojis = true;
      strategy.tone = 'friendly';

      factors.push({
        name: 'high_engagement',
        value: context.userEngagementLevel,
        impact: 'positive',
        weight: 0.5,
        description: 'High user engagement, using friendly approach',
      });

      reasoning.push('High engagement: using friendly tone with emojis');
    } else if (context.userEngagementLevel === 'low') {
      strategy.tone = 'professional';

      factors.push({
        name: 'low_engagement',
        value: context.userEngagementLevel,
        impact: 'neutral',
        weight: 0.5,
        description: 'Low user engagement, using professional approach',
      });

      reasoning.push('Low engagement: using professional tone');
    }
  }

  /**
   * Apply time-based adjustments
   */
  private applyTimeRules(
    context: EnrichedContext,
    strategy: ResponseStrategy,
    factors: StrategyFactor[],
    reasoning: string[]
  ): void {
    // Night time adjustments
    if (context.timeOfDay === 'night') {
      strategy.tone = 'professional';
      strategy.shouldUseEmojis = false;

      factors.push({
        name: 'night_time',
        value: context.timeOfDay,
        impact: 'neutral',
        weight: 0.3,
        description: 'Night time: using more formal approach',
      });

      reasoning.push('Night time: formal tone without emojis');
    }

    // Weekend adjustments
    if (context.dayOfWeek === 'weekend') {
      strategy.tone = 'friendly';

      factors.push({
        name: 'weekend',
        value: context.dayOfWeek,
        impact: 'positive',
        weight: 0.2,
        description: 'Weekend: using friendlier approach',
      });

      reasoning.push('Weekend: friendlier tone');
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Calculate strategy confidence based on factors
   */
  private calculateStrategyConfidence(
    factors: StrategyFactor[],
    intentAnalysis: IntentAnalysisExtended
  ): number {
    if (factors.length === 0) return 0.5;

    // Base confidence from intent analysis
    let confidence = intentAnalysis.confidence * 0.6;

    // Add weighted factor contributions
    const factorContribution = factors.reduce((sum, factor) => {
      const contribution =
        factor.weight *
        (factor.impact === 'positive' ? 0.1 : factor.impact === 'negative' ? -0.05 : 0);
      return sum + contribution;
    }, 0);

    confidence += factorContribution;

    // Boost for high-impact positive factors
    const positiveFactors = factors.filter(f => f.impact === 'positive' && f.weight > 0.8);
    if (positiveFactors.length > 0) {
      confidence += 0.1;
    }

    return Math.max(0.2, Math.min(0.95, confidence));
  }

  /**
   * Assess quality of available knowledge
   */
  private assessKnowledgeQuality(knowledgeData: KnowledgeItem[]): 'low' | 'medium' | 'high' {
    if (knowledgeData.length === 0) return 'low';
    if (knowledgeData.length >= 3) return 'high';

    // Check relevance scores
    const avgRelevance =
      knowledgeData.reduce((sum, item) => sum + (item.relevanceScore || 0.5), 0) /
      knowledgeData.length;

    if (avgRelevance > 0.7) return 'high';
    if (avgRelevance > 0.5) return 'medium';
    return 'low';
  }

  /**
   * Check if message is a greeting
   */
  private async isGreetingMessage(message: string): Promise<boolean> {
    try {
      const greetingKeywords = await DatabaseService.getAIConfiguration('greeting_keywords');
      if (!greetingKeywords) {
        const fallbackKeywords = [
          'hola',
          'hi',
          'buenas',
          'buenos',
          'saludos',
          'hey',
          'hello',
          'que tal',
        ];
        return this.checkGreetingKeywords(message, fallbackKeywords);
      }

      const keywords = greetingKeywords.split(',').map(k => k.trim());
      return this.checkGreetingKeywords(message, keywords);
    } catch (error) {
      logger.error('Error checking greeting message:', error);
      return ['hola', 'hi', 'buenas', 'buenos'].some(keyword =>
        message.toLowerCase().trim().includes(keyword)
      );
    }
  }

  /**
   * Check if message matches greeting keywords
   */
  private checkGreetingKeywords(message: string, keywords: string[]): boolean {
    const normalizedMessage = message.toLowerCase().trim();

    if (keywords.some(keyword => normalizedMessage === keyword)) {
      return true;
    }

    if (normalizedMessage.length <= 20) {
      return keywords.some(keyword => normalizedMessage.startsWith(keyword));
    }

    const words = normalizedMessage.split(/\s+/);
    if (words.length <= 3) {
      return keywords.some(keyword => words.includes(keyword));
    }

    return false;
  }

  // ============================================
  // CACHE MANAGEMENT
  // ============================================

  /**
   * Generate cache key for strategy analysis
   */
  private generateCacheKey(
    intentAnalysis: IntentAnalysisExtended,
    context: EnrichedContext,
    knowledgeData: KnowledgeItem[]
  ): string {
    const intentKey = `${intentAnalysis.intent}_${intentAnalysis.sentiment}_${intentAnalysis.urgency}`;
    const contextKey = `${context.timeOfDay}_${context.userEngagementLevel}_${context.messageHistory?.length || 0}`;
    const knowledgeKey = `${knowledgeData.length}_${knowledgeData.map(k => k.category).join(',')}`;

    return `${intentKey}_${contextKey}_${knowledgeKey}`.toLowerCase();
  }

  /**
   * Check cache for existing strategy
   */
  private checkCache(cacheKey: string): StrategyAnalysis | null {
    const cached = this.strategyCache.get(cacheKey);

    if (cached && Date.now() - cached.timeToDecision < this.CACHE_TTL) {
      return cached;
    }

    return null;
  }

  /**
   * Cache strategy analysis
   */
  private cacheStrategy(cacheKey: string, analysis: StrategyAnalysis): void {
    this.strategyCache.set(cacheKey, analysis);
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    if (this.strategyCache.size > this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.strategyCache.entries());
      entries.sort((a, b) => a[1].timeToDecision - b[1].timeToDecision);

      const toDelete = entries.slice(0, Math.floor(this.MAX_CACHE_SIZE * 0.3));
      toDelete.forEach(([key]) => this.strategyCache.delete(key));
    }
  }
}
