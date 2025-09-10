/**
 * ContextEnricher - AI Thinking Service Module
 *
 * Handles message context analysis, enrichment, and intent detection.
 * Extracts meaning from messages and enriches them with conversation history,
 * user profiles, temporal context, and engagement analytics.
 *
 * Part of Phase 3: AI Services Modularization
 */

import { logger } from '../../utils/logger';
import DatabaseService from '../DatabaseService';
import AIService, { MessageContext, IntentAnalysis } from '../AIService';

// ============================================
// INTERFACES Y TIPOS
// ============================================

export interface EnrichedContext extends MessageContext {
  messageText?: string;
  leadProfile?: any;
  conversationSummary?: string;
  previousIntents: IntentAnalysis[];
  messageHistory: Array<{
    message: string;
    intent?: string;
    timestamp: Date;
    isFromUser: boolean;
  }>;
  currentConversationFlow?: string;
  userEngagementLevel: 'low' | 'medium' | 'high';
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: 'weekday' | 'weekend';
}

export interface IntentAnalysisExtended extends IntentAnalysis {
  urgency: 'low' | 'medium' | 'high';
  category: string;
  subcategory?: string;
}

export interface MessageComplexity {
  complexity: 'simple_greeting' | 'specific_query' | 'general_inquiry';
  confidence: number;
  reasoning: string;
}

export interface TimeContext {
  timeOfDay: EnrichedContext['timeOfDay'];
  dayOfWeek: EnrichedContext['dayOfWeek'];
}

// ============================================
// CONTEXT ENRICHER CLASS
// ============================================

export class ContextEnricher {
  private intentCache: Map<string, IntentAnalysisExtended> = new Map();
  private readonly MAX_CACHE_SIZE = 1000;

  constructor() {
    logger.debug('ContextEnricher module initialized');
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Enrich message context with conversation history, user profile, and temporal data
   */
  public async enrichContext(
    context: MessageContext,
    currentMessage: string
  ): Promise<EnrichedContext> {
    try {
      const enriched: EnrichedContext = {
        ...context,
        messageText: currentMessage,
        previousIntents: [],
        messageHistory: [],
        userEngagementLevel: 'medium',
        timeOfDay: 'morning',
        dayOfWeek: 'weekday',
      };

      // Obtain conversation history if phone number is available
      if (context.phoneNumber) {
        const history = await DatabaseService.getConversationHistory(
          context.phoneNumber,
          10 // Last 10 messages
        );

        enriched.messageHistory = history.map(h => ({
          message: h.messageText || h.responseText || '',
          intent: h.intent,
          timestamp: h.createdAt,
          isFromUser: h.isFromUser,
        }));

        // Get lead profile if available
        const leads = await DatabaseService.getAllLeads();
        enriched.leadProfile = leads.find(
          lead => lead.phone && lead.phone.includes(context.phoneNumber?.replace(/\D/g, '') || '')
        );
      }

      // Add temporal context
      const timeContext = this.analyzeTimeContext();
      enriched.timeOfDay = timeContext.timeOfDay;
      enriched.dayOfWeek = timeContext.dayOfWeek;

      // Calculate engagement level
      enriched.userEngagementLevel = this.calculateEngagementLevel(enriched);

      return enriched;
    } catch (error) {
      logger.error('Error enriching context:', error);
      // Return basic context in case of error
      return {
        ...context,
        messageText: currentMessage,
        previousIntents: [],
        messageHistory: [],
        userEngagementLevel: 'medium',
        timeOfDay: 'morning',
        dayOfWeek: 'weekday',
      } as EnrichedContext;
    }
  }

  /**
   * Analyze message intent with enhanced context and caching
   */
  public async analyzeIntentEnhanced(
    message: string,
    context: EnrichedContext
  ): Promise<IntentAnalysisExtended> {
    try {
      // Check cache first
      const cacheKey = `${message.toLowerCase().trim()}_${context.phoneNumber}`;
      if (this.intentCache.has(cacheKey)) {
        const cachedIntent = this.intentCache.get(cacheKey)!;
        return cachedIntent;
      }

      // 1. MESSAGE COMPLEXITY ANALYSIS
      const complexityAnalysis = this.getMessageComplexity(message);

      // 2. For simple greetings, use optimized analysis
      if (complexityAnalysis.complexity === 'simple_greeting') {
        const greetingIntent: IntentAnalysisExtended = {
          intent: 'saludo',
          confidence: complexityAnalysis.confidence,
          entities: {},
          sentiment: 'positive',
          urgency: 'low',
          category: 'social',
          subcategory: 'simple_greeting',
        };

        this.cacheIntent(cacheKey, greetingIntent);
        return greetingIntent;
      }

      // 3. For other cases, use full AIService analysis
      const baseAnalysis = await AIService.analyzeIntent(message);

      // 4. Enhance analysis with additional context and complexity
      const enhanced: IntentAnalysisExtended = {
        intent: baseAnalysis.intent || 'general',
        confidence: Math.max(baseAnalysis.confidence || 0.5, complexityAnalysis.confidence * 0.8),
        entities: baseAnalysis.entities || {},
        sentiment: baseAnalysis.sentiment || 'neutral',
        urgency: this.detectUrgency(message),
        category: this.categorizeIntent(baseAnalysis.intent || 'general'),
        subcategory:
          this.getSubcategory(message, baseAnalysis.intent || 'general') ||
          complexityAnalysis.complexity,
      };

      // 5. Adjust confidence based on context and complexity
      if (context.messageHistory.length > 0) {
        enhanced.confidence = Math.min(enhanced.confidence + 0.1, 1.0);
      }

      // For specific queries, increase confidence
      if (complexityAnalysis.complexity === 'specific_query') {
        enhanced.confidence = Math.min(enhanced.confidence + 0.15, 0.95);
      }

      // Cache and cleanup
      this.cacheIntent(cacheKey, enhanced);
      this.cleanupCache();

      logger.debug('Complexity analysis:', {
        message: message.substring(0, 50),
        complexity: complexityAnalysis.complexity,
        confidence: complexityAnalysis.confidence,
        reasoning: complexityAnalysis.reasoning,
        finalIntent: enhanced.intent,
        finalConfidence: enhanced.confidence,
      });

      return enhanced;
    } catch (error) {
      logger.error('Error in enhanced intent analysis:', error);

      // Fallback basic analysis
      return {
        intent: 'general',
        confidence: 0.5,
        entities: {},
        sentiment: 'neutral',
        urgency: 'medium',
        category: 'general',
      };
    }
  }

  /**
   * Determine message complexity for optimization
   */
  public getMessageComplexity(message: string): MessageComplexity {
    try {
      const normalizedMessage = message.toLowerCase().trim();
      const wordCount = normalizedMessage.split(/\s+/).length;
      const messageLength = normalizedMessage.length;

      // 1. SIMPLE GREETINGS (highest priority)
      const greetingKeywords = [
        'hola',
        'hi',
        'buenas',
        'buenos días',
        'buenas tardes',
        'hey',
        'hello',
        'saludos',
      ];
      const isExactGreeting = greetingKeywords.some(keyword => normalizedMessage === keyword);
      const startsWithGreeting = greetingKeywords.some(keyword =>
        normalizedMessage.startsWith(keyword)
      );

      if (isExactGreeting) {
        return {
          complexity: 'simple_greeting',
          confidence: 0.95,
          reasoning: 'Exact greeting detected',
        };
      }

      if (startsWithGreeting && wordCount <= 3 && messageLength <= 20) {
        return {
          complexity: 'simple_greeting',
          confidence: 0.9,
          reasoning: 'Simple greeting with few words',
        };
      }

      // 2. SPECIFIC QUERIES (products, prices, services)
      const specificKeywords = {
        precio: ['precio', 'cuesta', 'costo', 'coste', 'tarifa', 'paquete', 'plan'],
        producto: ['servicio', 'anuncio', 'destacado', 'premium', 'vip', 'top'],
        registro: ['registrar', 'cuenta', 'alta', 'sign up', 'crear'],
        tecnico: ['error', 'problema', 'fallo', 'no funciona', 'bug'],
      };

      let specificMatches = 0;
      let matchedCategory = '';

      for (const [category, keywords] of Object.entries(specificKeywords)) {
        const matches = keywords.filter(keyword => normalizedMessage.includes(keyword));
        if (matches.length > 0) {
          specificMatches += matches.length;
          matchedCategory = category;
        }
      }

      if (specificMatches > 0) {
        return {
          complexity: 'specific_query',
          confidence: Math.min(0.7 + specificMatches * 0.1, 0.9),
          reasoning: `Specific query about ${matchedCategory} detected`,
        };
      }

      // 3. GENERAL QUERIES (open questions, general information)
      const questionWords = ['qué', 'cómo', 'cuándo', 'dónde', 'por qué', 'cuál', 'quién'];
      const hasQuestionWords = questionWords.some(word => normalizedMessage.includes(word));
      const hasQuestionMark = message.includes('?');

      if (hasQuestionWords || hasQuestionMark || wordCount > 5) {
        return {
          complexity: 'general_inquiry',
          confidence: 0.6 + (wordCount > 10 ? 0.2 : 0),
          reasoning: 'General query or open question',
        };
      }

      // 4. FALLBACK - If it doesn't fit previous categories
      return {
        complexity: 'general_inquiry',
        confidence: 0.5,
        reasoning: 'Uncategorized message, treated as general query',
      };
    } catch (error) {
      logger.error('Error determining message complexity:', error);
      return {
        complexity: 'general_inquiry',
        confidence: 0.3,
        reasoning: 'Error in analysis, using fallback',
      };
    }
  }

  /**
   * Check if message is a simple greeting
   */
  public async isGreetingMessage(message: string): Promise<boolean> {
    try {
      // Get greeting keywords from configuration
      const greetingKeywords = await DatabaseService.getAIConfiguration('greeting_keywords');
      if (!greetingKeywords) {
        // Fallback keywords if no configuration
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
      // Basic fallback
      return ['hola', 'hi', 'buenas', 'buenos'].some(keyword =>
        message.toLowerCase().trim().includes(keyword)
      );
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Detect message urgency level
   */
  private detectUrgency(message: string): 'low' | 'medium' | 'high' {
    const urgentKeywords = ['urgente', 'ya', 'inmediato', 'ahora', 'rápido', 'prisa', 'emergency'];
    const lowUrgencyKeywords = ['cuando puedas', 'sin prisa', 'más tarde', 'eventually'];

    const messageText = message.toLowerCase();

    if (urgentKeywords.some(keyword => messageText.includes(keyword))) {
      return 'high';
    }

    if (lowUrgencyKeywords.some(keyword => messageText.includes(keyword))) {
      return 'low';
    }

    return 'medium';
  }

  /**
   * Categorize intent into business categories
   */
  private categorizeIntent(intent: string): string {
    const categoryMap: Record<string, string> = {
      greeting: 'social',
      saludo: 'social',
      goodbye: 'social',
      despedida: 'social',
      pricing_inquiry: 'commercial',
      consulta_precio: 'commercial',
      product_inquiry: 'commercial',
      consulta_producto: 'commercial',
      technical_support: 'support',
      soporte_tecnico: 'support',
      complaint: 'support',
      queja: 'support',
      information_request: 'informational',
      solicitar_info: 'informational',
    };

    return categoryMap[intent] || 'general';
  }

  /**
   * Get subcategory for more specific intent classification
   */
  private getSubcategory(message: string, intent: string): string | undefined {
    if (intent === 'consulta_precio' || intent === 'pricing_inquiry') {
      if (message.toLowerCase().includes('paquete')) return 'packages';
      if (message.toLowerCase().includes('descuento')) return 'discounts';
    }

    return undefined;
  }

  /**
   * Analyze current time context
   */
  private analyzeTimeContext(): TimeContext {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

    let timeOfDay: EnrichedContext['timeOfDay'];
    if (hour >= 6 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 18) timeOfDay = 'afternoon';
    else if (hour >= 18 && hour < 22) timeOfDay = 'evening';
    else timeOfDay = 'night';

    const dayType: EnrichedContext['dayOfWeek'] =
      dayOfWeek === 0 || dayOfWeek === 6 ? 'weekend' : 'weekday';

    return { timeOfDay, dayOfWeek: dayType };
  }

  /**
   * Calculate user engagement level based on message history
   */
  private calculateEngagementLevel(context: EnrichedContext): 'low' | 'medium' | 'high' {
    const messageCount = context.messageHistory?.length || 0;

    if (messageCount === 0) return 'low';
    if (messageCount < 5) return 'medium';
    return 'high';
  }

  /**
   * Check if message matches greeting keywords
   */
  private checkGreetingKeywords(message: string, keywords: string[]): boolean {
    const normalizedMessage = message.toLowerCase().trim();

    // Check if complete message is exactly a greeting
    if (keywords.some(keyword => normalizedMessage === keyword)) {
      return true;
    }

    // Check if message starts with greeting and is short (less than 20 characters)
    if (normalizedMessage.length <= 20) {
      return keywords.some(keyword => normalizedMessage.startsWith(keyword));
    }

    // For longer messages, be more strict
    const words = normalizedMessage.split(/\s+/);
    if (words.length <= 3) {
      // Only up to 3 words
      return keywords.some(keyword => words.includes(keyword));
    }

    return false;
  }

  /**
   * Cache intent analysis with key
   */
  private cacheIntent(key: string, intent: IntentAnalysisExtended): void {
    this.intentCache.set(key, intent);
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    if (this.intentCache.size > this.MAX_CACHE_SIZE) {
      const oldestKeys = Array.from(this.intentCache.keys()).slice(0, 200);
      oldestKeys.forEach(key => this.intentCache.delete(key));
    }
  }
}
