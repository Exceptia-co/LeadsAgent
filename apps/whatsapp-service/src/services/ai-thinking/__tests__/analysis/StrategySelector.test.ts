import { StrategySelector, ResponseStrategy, StrategyAnalysis } from '../../StrategySelector';
import { EnrichedContext } from '../../interfaces/types';
import DatabaseService from '../../../DatabaseService';
import { logger } from '../../../../utils/logger';

// Mock dependencies
jest.mock('../../../DatabaseService');
jest.mock('../../../../utils/logger');

describe('StrategySelector', () => {
  let strategySelector: StrategySelector;
  let mockDatabaseService: jest.Mocked<typeof DatabaseService>;

  // Mock data types to match the StrategySelector's expected interfaces
  const mockIntentAnalysis = {
    intent: 'pricing_inquiry',
    confidence: 0.8,
    entities: { product: 'premium' },
    sentiment: 'neutral' as const,
    urgency: 'medium' as const,
    category: 'commercial',
    subcategory: 'pricing',
  };

  const mockContext: EnrichedContext = {
    from: '+1234567890',
    sessionId: 'test-session',
    messageText: 'cuánto cuesta el servicio',
    previousIntents: [],
    messageHistory: [
      {
        message: 'Hello',
        intent: 'greeting',
        timestamp: new Date(),
        isFromUser: true,
      },
    ],
    userEngagementLevel: 'medium',
    timeOfDay: 'afternoon',
    dayOfWeek: 'weekday',
  };

  const mockKnowledgeData = [
    {
      id: 'kb-1',
      title: 'Pricing Information',
      content: 'Service costs $99/month',
      category: 'pricing',
      relevanceScore: 0.8,
    },
    {
      id: 'kb-2',
      title: 'Product Features',
      content: 'Premium features included',
      category: 'features',
      relevanceScore: 0.7,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    strategySelector = new StrategySelector();

    // Setup DatabaseService mocks
    mockDatabaseService = DatabaseService as jest.Mocked<typeof DatabaseService>;
    mockDatabaseService.getAIConfiguration = jest.fn().mockResolvedValue('hola,hi,buenas,hello');
  });

  describe('Initialization', () => {
    it('should initialize StrategySelector successfully', () => {
      expect(strategySelector).toBeInstanceOf(StrategySelector);
      expect(logger.debug).toHaveBeenCalledWith('StrategySelector module initialized');
    });

    it('should have cache management properties initialized', () => {
      expect((strategySelector as any).strategyCache).toBeDefined();
      expect((strategySelector as any).MAX_CACHE_SIZE).toBe(200);
      expect((strategySelector as any).CACHE_TTL).toBe(1000 * 60 * 15);
    });
  });

  describe('determineResponseStrategy()', () => {
    it('should determine basic response strategy', async () => {
      const result = await strategySelector.determineResponseStrategy(
        mockIntentAnalysis,
        mockContext,
        mockKnowledgeData
      );

      expect(result).toBeDefined();
      expect(result.strategy).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.reasoning).toBeInstanceOf(Array);
      expect(result.factors).toBeInstanceOf(Array);
      expect(result.timeToDecision).toBeGreaterThan(0);
    });

    it('should handle greeting messages with optimized strategy', async () => {
      const greetingContext = {
        ...mockContext,
        messageText: 'hola',
      };

      const result = await strategySelector.determineResponseStrategy(
        { ...mockIntentAnalysis, intent: 'greeting' },
        greetingContext,
        []
      );

      expect(result.strategy.type).toBe('contextual');
      expect(result.strategy.tone).toBe('friendly');
      expect(result.strategy.shouldUseEmojis).toBe(true);
      expect(result.confidence).toBe(0.95);
      expect(result.reasoning).toContain('GREETING DETECTED: Automatic response strategy applied');
    });

    it('should apply pricing inquiry strategy correctly', async () => {
      const result = await strategySelector.determineResponseStrategy(
        mockIntentAnalysis,
        mockContext,
        mockKnowledgeData
      );

      expect(result.strategy.tone).toBe('sales');
      expect(result.strategy.type).toBe('contextual');
      expect(result.strategy.length).toBe('medium');
    });

    it('should handle complaint/escalation scenarios', async () => {
      const complaintIntent = {
        ...mockIntentAnalysis,
        intent: 'complaint',
        sentiment: 'negative' as const,
        urgency: 'high' as const,
      };

      const result = await strategySelector.determineResponseStrategy(
        complaintIntent,
        mockContext,
        mockKnowledgeData
      );

      expect(result.strategy.type).toBe('escalate');
      expect(result.strategy.tone).toBe('supportive');
      expect(result.strategy.priority).toBe('high');
    });

    it('should use cache when available', async () => {
      // First call
      const result1 = await strategySelector.determineResponseStrategy(
        mockIntentAnalysis,
        mockContext,
        mockKnowledgeData
      );

      // Second call with same parameters
      const result2 = await strategySelector.determineResponseStrategy(
        mockIntentAnalysis,
        mockContext,
        mockKnowledgeData
      );

      // Results should be identical (from cache)
      expect(result1.strategy).toEqual(result2.strategy);
      expect(result1.confidence).toEqual(result2.confidence);
    });

    it('should handle errors gracefully with fallback strategy', async () => {
      // Mock database error
      mockDatabaseService.getAIConfiguration.mockRejectedValue(new Error('Database error'));

      const result = await strategySelector.determineResponseStrategy(
        mockIntentAnalysis,
        mockContext,
        mockKnowledgeData
      );

      expect(result.strategy.type).toBe('direct');
      expect(result.strategy.tone).toBe('friendly');
      expect(result.confidence).toBe(0.5);
      expect(result.reasoning).toContain('Error in strategy determination, using fallback');
      expect(logger.error).toHaveBeenCalledWith(
        'Error determining response strategy:',
        expect.any(Error)
      );
    });
  });

  describe('getStrategyRules()', () => {
    it('should return comprehensive strategy rules', () => {
      const rules = strategySelector.getStrategyRules();

      expect(rules).toHaveProperty('intentRules');
      expect(rules).toHaveProperty('sentimentRules');
      expect(rules).toHaveProperty('urgencyRules');
      expect(rules).toHaveProperty('timeRules');
      expect(rules).toHaveProperty('knowledgeRules');
    });

    it('should have correct intent rules for pricing', () => {
      const rules = strategySelector.getStrategyRules();

      expect(rules.intentRules.pricing_inquiry).toEqual({
        type: 'contextual',
        tone: 'sales',
        length: 'medium',
        templateCategory: 'pricing',
      });
    });

    it('should have correct sentiment rules', () => {
      const rules = strategySelector.getStrategyRules();

      expect(rules.sentimentRules.negative).toEqual({
        tone: 'supportive',
        priority: 'high',
      });
      expect(rules.sentimentRules.positive).toEqual({
        tone: 'friendly',
        shouldUseEmojis: true,
      });
    });

    it('should have correct urgency rules', () => {
      const rules = strategySelector.getStrategyRules();

      expect(rules.urgencyRules.high).toEqual({
        priority: 'high',
        length: 'brief',
        type: 'direct',
      });
    });
  });

  describe('Intent-based Strategy Application', () => {
    it('should apply intent rules correctly', async () => {
      const productIntent = {
        ...mockIntentAnalysis,
        intent: 'product_inquiry',
      };

      const result = await strategySelector.determineResponseStrategy(
        productIntent,
        mockContext,
        mockKnowledgeData
      );

      expect(result.strategy.tone).toBe('sales');
      expect(result.strategy.type).toBe('contextual');
      expect(result.factors.some(f => f.name === 'intent_rule')).toBe(true);
    });

    it('should handle unknown intents with fallback', async () => {
      const unknownIntent = {
        ...mockIntentAnalysis,
        intent: 'unknown_intent',
      };

      const result = await strategySelector.determineResponseStrategy(
        unknownIntent,
        mockContext,
        mockKnowledgeData
      );

      expect(result.factors.some(f => f.name === 'intent_fallback')).toBe(true);
      expect(result.reasoning.some(r => r.includes('No specific intent rule found'))).toBe(true);
    });
  });

  describe('Sentiment-based Strategy Application', () => {
    it('should adjust for negative sentiment', async () => {
      const negativeIntent = {
        ...mockIntentAnalysis,
        sentiment: 'negative' as const,
      };

      const result = await strategySelector.determineResponseStrategy(
        negativeIntent,
        mockContext,
        mockKnowledgeData
      );

      expect(result.strategy.tone).toBe('supportive');
      expect(result.strategy.priority).toBe('high');
      expect(result.factors.some(f => f.name === 'sentiment_adjustment')).toBe(true);
    });

    it('should adjust for positive sentiment', async () => {
      const positiveIntent = {
        ...mockIntentAnalysis,
        sentiment: 'positive' as const,
      };

      const result = await strategySelector.determineResponseStrategy(
        positiveIntent,
        mockContext,
        mockKnowledgeData
      );

      expect(result.strategy.shouldUseEmojis).toBe(true);
      expect(result.factors.some(f => f.name === 'sentiment_adjustment')).toBe(true);
    });
  });

  describe('Urgency-based Strategy Application', () => {
    it('should prioritize high urgency messages', async () => {
      const urgentIntent = {
        ...mockIntentAnalysis,
        urgency: 'high' as const,
      };

      const result = await strategySelector.determineResponseStrategy(
        urgentIntent,
        mockContext,
        mockKnowledgeData
      );

      expect(result.strategy.priority).toBe('high');
      expect(result.strategy.length).toBe('brief');
      expect(result.strategy.type).toBe('direct');
    });

    it('should handle low urgency appropriately', async () => {
      const lowUrgencyIntent = {
        ...mockIntentAnalysis,
        urgency: 'low' as const,
      };

      const result = await strategySelector.determineResponseStrategy(
        lowUrgencyIntent,
        mockContext,
        mockKnowledgeData
      );

      expect(result.strategy.priority).toBe('low');
      expect(result.factors.some(f => f.name === 'urgency_adjustment')).toBe(true);
    });
  });

  describe('Knowledge-based Strategy Application', () => {
    it('should defer when no knowledge is available', async () => {
      const result = await strategySelector.determineResponseStrategy(
        mockIntentAnalysis,
        mockContext,
        [] // No knowledge
      );

      expect(result.strategy.type).toBe('defer');
      expect(result.strategy.tone).toBe('professional');
      expect(result.factors.some(f => f.name === 'no_knowledge')).toBe(true);
      expect(result.reasoning.some(r => r.includes('No knowledge available'))).toBe(true);
    });

    it('should use contextual strategy with rich knowledge', async () => {
      const richKnowledge = [
        ...mockKnowledgeData,
        {
          id: 'kb-3',
          title: 'Additional Info',
          content: 'More details',
          category: 'info',
          relevanceScore: 0.9,
        },
      ];

      const result = await strategySelector.determineResponseStrategy(
        mockIntentAnalysis,
        mockContext,
        richKnowledge
      );

      expect(result.strategy.type).toBe('contextual');
      expect(result.strategy.length).toBe('detailed');
      expect(result.factors.some(f => f.name === 'rich_knowledge')).toBe(true);
    });

    it('should handle limited knowledge appropriately', async () => {
      const limitedKnowledge = [
        {
          id: 'kb-1',
          title: 'Basic Info',
          content: 'Some info',
          category: 'basic',
          relevanceScore: 0.4,
        },
      ];

      const result = await strategySelector.determineResponseStrategy(
        mockIntentAnalysis,
        mockContext,
        limitedKnowledge
      );

      expect(result.factors.some(f => f.name === 'limited_knowledge')).toBe(true);
      expect(result.reasoning.some(r => r.includes('Limited knowledge'))).toBe(true);
    });
  });

  describe('Context-based Strategy Application', () => {
    it('should adjust for long conversations', async () => {
      const longConversationContext = {
        ...mockContext,
        messageHistory: Array(15).fill({
          message: 'test',
          intent: 'test',
          timestamp: new Date(),
          isFromUser: true,
        }),
      };

      const result = await strategySelector.determineResponseStrategy(
        mockIntentAnalysis,
        longConversationContext,
        mockKnowledgeData
      );

      expect(result.strategy.shouldQuote).toBe(false);
      expect(result.factors.some(f => f.name === 'long_conversation')).toBe(true);
    });

    it('should adjust for high user engagement', async () => {
      const highEngagementContext = {
        ...mockContext,
        userEngagementLevel: 'high' as const,
      };

      const result = await strategySelector.determineResponseStrategy(
        mockIntentAnalysis,
        highEngagementContext,
        mockKnowledgeData
      );

      expect(result.strategy.shouldUseEmojis).toBe(true);
      expect(result.strategy.tone).toBe('friendly');
      expect(result.factors.some(f => f.name === 'high_engagement')).toBe(true);
    });

    it('should adjust for low user engagement', async () => {
      const lowEngagementContext = {
        ...mockContext,
        userEngagementLevel: 'low' as const,
      };

      const result = await strategySelector.determineResponseStrategy(
        mockIntentAnalysis,
        lowEngagementContext,
        mockKnowledgeData
      );

      expect(result.strategy.tone).toBe('professional');
      expect(result.factors.some(f => f.name === 'low_engagement')).toBe(true);
    });
  });

  describe('Time-based Strategy Application', () => {
    it('should adjust for night time', async () => {
      const nightContext = {
        ...mockContext,
        timeOfDay: 'night' as const,
      };

      const result = await strategySelector.determineResponseStrategy(
        mockIntentAnalysis,
        nightContext,
        mockKnowledgeData
      );

      expect(result.strategy.tone).toBe('professional');
      expect(result.strategy.shouldUseEmojis).toBe(false);
      expect(result.factors.some(f => f.name === 'night_time')).toBe(true);
    });

    it('should adjust for weekend', async () => {
      const weekendContext = {
        ...mockContext,
        dayOfWeek: 'weekend' as const,
      };

      const result = await strategySelector.determineResponseStrategy(
        mockIntentAnalysis,
        weekendContext,
        mockKnowledgeData
      );

      expect(result.strategy.tone).toBe('friendly');
      expect(result.factors.some(f => f.name === 'weekend')).toBe(true);
    });
  });

  describe('Confidence Calculation', () => {
    it('should calculate confidence based on factors', async () => {
      const result = await strategySelector.determineResponseStrategy(
        mockIntentAnalysis,
        mockContext,
        mockKnowledgeData
      );

      expect(result.confidence).toBeGreaterThan(0.2);
      expect(result.confidence).toBeLessThan(0.95);
    });

    it('should boost confidence for high-impact positive factors', async () => {
      const highConfidenceIntent = {
        ...mockIntentAnalysis,
        confidence: 0.9,
        sentiment: 'positive' as const,
      };

      const result = await strategySelector.determineResponseStrategy(
        highConfidenceIntent,
        mockContext,
        mockKnowledgeData
      );

      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('Knowledge Quality Assessment', () => {
    it('should assess high quality knowledge correctly', () => {
      const highQualityKnowledge = [
        { relevanceScore: 0.8 },
        { relevanceScore: 0.9 },
        { relevanceScore: 0.7 },
      ];

      const quality = (strategySelector as any).assessKnowledgeQuality(highQualityKnowledge);
      expect(quality).toBe('high');
    });

    it('should assess medium quality knowledge correctly', () => {
      const mediumQualityKnowledge = [{ relevanceScore: 0.6 }];

      const quality = (strategySelector as any).assessKnowledgeQuality(mediumQualityKnowledge);
      expect(quality).toBe('medium');
    });

    it('should assess low quality knowledge correctly', () => {
      const lowQualityKnowledge = [{ relevanceScore: 0.3 }];

      const quality = (strategySelector as any).assessKnowledgeQuality(lowQualityKnowledge);
      expect(quality).toBe('low');
    });

    it('should handle empty knowledge array', () => {
      const quality = (strategySelector as any).assessKnowledgeQuality([]);
      expect(quality).toBe('low');
    });
  });

  describe('Greeting Detection', () => {
    it('should detect greetings using database configuration', async () => {
      const isGreeting = await (strategySelector as any).isGreetingMessage('hola');
      expect(isGreeting).toBe(true);
      expect(mockDatabaseService.getAIConfiguration).toHaveBeenCalledWith('greeting_keywords');
    });

    it('should use fallback keywords when database fails', async () => {
      mockDatabaseService.getAIConfiguration.mockRejectedValue(new Error('DB Error'));

      const isGreeting = await (strategySelector as any).isGreetingMessage('hola');
      expect(isGreeting).toBe(true);
    });

    it('should check greeting keywords correctly', () => {
      const keywords = ['hola', 'hi', 'buenas'];

      expect((strategySelector as any).checkGreetingKeywords('hola', keywords)).toBe(true);
      expect((strategySelector as any).checkGreetingKeywords('hola amigo', keywords)).toBe(true);
      expect(
        (strategySelector as any).checkGreetingKeywords(
          'hola, necesito información sobre precios',
          keywords
        )
      ).toBe(false);
      expect((strategySelector as any).checkGreetingKeywords('test message', keywords)).toBe(false);
    });
  });

  describe('Cache Management', () => {
    it('should generate consistent cache keys', () => {
      const key1 = (strategySelector as any).generateCacheKey(
        mockIntentAnalysis,
        mockContext,
        mockKnowledgeData
      );
      const key2 = (strategySelector as any).generateCacheKey(
        mockIntentAnalysis,
        mockContext,
        mockKnowledgeData
      );

      expect(key1).toBe(key2);
      expect(typeof key1).toBe('string');
    });

    it('should cache and retrieve strategies', async () => {
      const result1 = await strategySelector.determineResponseStrategy(
        mockIntentAnalysis,
        mockContext,
        mockKnowledgeData
      );

      // Clear call count to verify cache usage
      jest.clearAllMocks();

      const result2 = await strategySelector.determineResponseStrategy(
        mockIntentAnalysis,
        mockContext,
        mockKnowledgeData
      );

      expect(result1.strategy).toEqual(result2.strategy);
      // Database should not be called again due to caching
      expect(mockDatabaseService.getAIConfiguration).not.toHaveBeenCalled();
    });

    it('should clean up cache when it exceeds max size', async () => {
      // Fill cache beyond max size
      const promises = Array(250)
        .fill(null)
        .map((_, i) =>
          strategySelector.determineResponseStrategy(
            { ...mockIntentAnalysis, intent: `intent-${i}` },
            { ...mockContext, sessionId: `session-${i}` },
            mockKnowledgeData
          )
        );

      await Promise.all(promises);

      // Check that cache was cleaned up
      const cacheSize = (strategySelector as any).strategyCache.size;
      expect(cacheSize).toBeLessThanOrEqual(200); // MAX_CACHE_SIZE
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle concurrent strategy determinations', async () => {
      const promises = Array(10)
        .fill(null)
        .map((_, i) =>
          strategySelector.determineResponseStrategy(
            { ...mockIntentAnalysis, intent: `intent-${i}` },
            { ...mockContext, sessionId: `session-${i}` },
            mockKnowledgeData
          )
        );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.strategy).toBeDefined();
        expect(result.confidence).toBeGreaterThan(0);
      });
    });

    it('should handle complex strategy combinations', async () => {
      const complexIntent = {
        intent: 'complaint',
        confidence: 0.9,
        entities: { issue: 'billing' },
        sentiment: 'negative' as const,
        urgency: 'high' as const,
        category: 'support',
        subcategory: 'billing',
      };

      const complexContext = {
        ...mockContext,
        timeOfDay: 'night' as const,
        dayOfWeek: 'weekend' as const,
        userEngagementLevel: 'low' as const,
        messageHistory: Array(20).fill({
          message: 'test',
          intent: 'test',
          timestamp: new Date(),
          isFromUser: true,
        }),
      };

      const result = await strategySelector.determineResponseStrategy(
        complexIntent,
        complexContext,
        []
      );

      expect(result.strategy).toBeDefined();
      expect(result.factors.length).toBeGreaterThan(3);
      expect(result.reasoning.length).toBeGreaterThan(3);
    });

    it('should complete strategy determination within reasonable time', async () => {
      const start = Date.now();

      await strategySelector.determineResponseStrategy(
        mockIntentAnalysis,
        mockContext,
        mockKnowledgeData
      );

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});
