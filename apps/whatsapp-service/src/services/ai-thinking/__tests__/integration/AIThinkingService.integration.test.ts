/**
 * AIThinkingService Integration Test Suite
 *
 * End-to-end testing for the complete AI Thinking Service workflow.
 * Tests the integration between all AI service modules including caching,
 * intent analysis, context enrichment, complexity analysis, knowledge retrieval,
 * strategy selection, and response generation.
 */

import { AIThinkingService } from '../AIThinkingService';
import { CacheManager } from '../cache/CacheManager';
import { IntentAnalyzer } from '../analysis/IntentAnalyzer';
import { ContextEnricher } from '../ContextEnricher';
import { ComplexityAnalyzer } from '../analysis/ComplexityAnalyzer';
import { KnowledgeRetriever } from '../KnowledgeRetrieval';
import { StrategySelector } from '../StrategySelector';
import { ResponseGenerator } from '../ResponseGenerator';
import { logger } from '../../../utils/logger';
import DatabaseService from '../../DatabaseService';
import AIService, { MessageContext } from '../../AIService';

// Mock dependencies
jest.mock('../../../utils/logger');
jest.mock('../../DatabaseService');
jest.mock('../../AIService');

const mockLogger = logger as jest.Mocked<typeof logger>;
const mockDatabaseService = DatabaseService as jest.Mocked<typeof DatabaseService>;
const mockAIService = AIService as jest.Mocked<typeof AIService>;

describe('AIThinkingService Integration Tests', () => {
  let aiThinkingService: AIThinkingService;

  const mockMessageContext: MessageContext = {
    from: 'test-user',
    sessionId: 'test-session-123',
    phoneNumber: '+1234567890',
  };

  beforeEach(() => {
    aiThinkingService = new AIThinkingService();

    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock implementations
    mockDatabaseService.getConversationHistory.mockResolvedValue([
      {
        id: 'msg-1',
        messageText: 'Hola, ¿cómo están los precios?',
        responseText: 'Los precios están muy bien',
        intent: 'consulta_precio',
        createdAt: new Date(),
        isFromUser: true,
        phoneNumber: '+1234567890',
        sessionId: 'test-session-123',
      },
    ]);

    mockDatabaseService.getAIConfiguration.mockResolvedValue(
      'Eres un asistente profesional de EscortsHub.net'
    );

    mockAIService.analyzeIntent.mockResolvedValue({
      intent: 'consulta_precio',
      confidence: 0.85,
      entities: { product: 'paquete plus' },
      sentiment: 'neutral',
    });

    mockAIService.generateResponse.mockResolvedValue({
      success: true,
      content: 'El Paquete Plus cuesta 300€ por 500 HUB. ¿Te interesa?',
      provider: 'openrouter',
      tokensUsed: 120,
    });

    mockAIService.getCurrentProvider.mockReturnValue('openrouter');
    mockAIService.getTemplateResponse.mockReturnValue(null);
  });

  describe('Complete Workflow Integration', () => {
    test('should execute complete AI thinking workflow successfully', async () => {
      const message = '¿Cuánto cuesta el paquete Plus?';

      const result = await aiThinkingService.processMessage(message, mockMessageContext);

      // Verify the response structure
      expect(result).toEqual(
        expect.objectContaining({
          response: expect.objectContaining({
            success: true,
            content: expect.any(String),
            provider: 'openrouter',
          }),
          metadata: expect.objectContaining({
            intentAnalysis: expect.objectContaining({
              intent: 'consulta_precio',
              confidence: expect.any(Number),
            }),
            processingSteps: expect.arrayContaining([
              'intent_analysis',
              'context_enrichment',
              'complexity_analysis',
              'knowledge_retrieval',
              'strategy_selection',
              'response_generation',
            ]),
            totalProcessingTime: expect.any(Number),
            cacheHits: expect.any(Number),
            cacheMisses: expect.any(Number),
          }),
        })
      );

      // Verify processing was completed
      expect(result.metadata.totalProcessingTime).toBeGreaterThan(0);
      expect(result.response.content).toContain('300€');
    });

    test('should handle greeting messages with optimized workflow', async () => {
      mockAIService.analyzeIntent.mockResolvedValue({
        intent: 'saludo',
        confidence: 0.95,
        entities: {},
        sentiment: 'positive',
      });

      mockAIService.getTemplateResponse.mockReturnValue(
        '¡Hola! 👋 Soy tu asistente de EscortsHub.net'
      );

      const message = 'Hola, ¿qué tal?';

      const result = await aiThinkingService.processMessage(message, mockMessageContext);

      expect(result.response.content).toContain('Hola');
      expect(result.metadata.intentAnalysis.intent).toBe('saludo');
      expect(result.metadata.processingSteps).toContain('template_response');
      expect(result.response.tokensUsed).toBe(0); // Template responses use no tokens
    });

    test('should handle complex product inquiries with knowledge retrieval', async () => {
      mockAIService.analyzeIntent.mockResolvedValue({
        intent: 'consulta_producto',
        confidence: 0.8,
        entities: { product: 'características premium' },
        sentiment: 'neutral',
      });

      const message = 'Explícame todas las características del paquete Premium en detalle';

      const result = await aiThinkingService.processMessage(message, mockMessageContext);

      expect(result.metadata.intentAnalysis.intent).toBe('consulta_producto');
      expect(result.metadata.processingSteps).toContain('knowledge_retrieval');
      expect(result.metadata.processingSteps).toContain('strategy_selection');
      expect(result.response.success).toBe(true);
    });

    test('should utilize caching for repeated similar requests', async () => {
      const message = '¿Cuánto cuesta el paquete Plus?';

      // First request
      const result1 = await aiThinkingService.processMessage(message, mockMessageContext);

      // Second identical request should use cache
      const result2 = await aiThinkingService.processMessage(message, mockMessageContext);

      expect(result1.response.content).toBe(result2.response.content);
      expect(result2.metadata.cacheHits).toBeGreaterThan(result1.metadata.cacheHits);
    });

    test('should handle error recovery gracefully', async () => {
      mockAIService.generateResponse.mockRejectedValue(
        new Error('AI service temporarily unavailable')
      );

      const message = 'Test error handling';

      const result = await aiThinkingService.processMessage(message, mockMessageContext);

      expect(result.response.success).toBe(false);
      expect(result.response.error).toContain('error');
      expect(result.metadata.processingSteps).toContain('error_handling');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Performance and Optimization', () => {
    test('should complete processing within acceptable time limits', async () => {
      const message = '¿Cuánto cuesta el paquete Plus?';
      const startTime = Date.now();

      const result = await aiThinkingService.processMessage(message, mockMessageContext);
      const processingTime = Date.now() - startTime;

      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.metadata.totalProcessingTime).toBeGreaterThan(0);
      expect(result.metadata.totalProcessingTime).toBeLessThan(processingTime);
    });

    test('should handle concurrent requests efficiently', async () => {
      const messages = [
        '¿Cuánto cuesta el paquete Plus?',
        'Hola, ¿qué tal?',
        '¿Cómo puedo registrarme?',
        '¿Qué características tiene el Premium?',
        'Gracias por la información',
      ];

      const startTime = Date.now();
      const promises = messages.map(message =>
        aiThinkingService.processMessage(message, mockMessageContext)
      );

      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      expect(results).toHaveLength(5);
      expect(totalTime).toBeLessThan(10000); // All requests within 10 seconds

      results.forEach(result => {
        expect(result.response).toBeDefined();
        expect(result.metadata.totalProcessingTime).toBeGreaterThan(0);
      });
    });

    test('should optimize response length based on intent', async () => {
      const testCases = [
        {
          intent: 'saludo',
          message: 'Hola',
          expectedMaxWords: 30,
        },
        {
          intent: 'consulta_precio',
          message: '¿Cuánto cuesta?',
          expectedMaxWords: 80,
        },
        {
          intent: 'consulta_producto',
          message: 'Explícame el producto',
          expectedMaxWords: 120,
        },
      ];

      for (const testCase of testCases) {
        mockAIService.analyzeIntent.mockResolvedValue({
          intent: testCase.intent,
          confidence: 0.9,
          entities: {},
          sentiment: 'neutral',
        });

        const result = await aiThinkingService.processMessage(testCase.message, mockMessageContext);
        const wordCount = result.response.content?.split(/\s+/).length || 0;

        expect(wordCount).toBeLessThanOrEqual(testCase.expectedMaxWords);
        expect(result.metadata.intentAnalysis.intent).toBe(testCase.intent);
      }
    });
  });

  describe('Module Integration Validation', () => {
    test('should properly integrate all AI modules in sequence', async () => {
      const message = 'Necesito información sobre el registro y precios';

      const result = await aiThinkingService.processMessage(message, mockMessageContext);

      // Verify all processing steps were executed
      const expectedSteps = [
        'intent_analysis',
        'context_enrichment',
        'complexity_analysis',
        'knowledge_retrieval',
        'strategy_selection',
        'response_generation',
      ];

      expectedSteps.forEach(step => {
        expect(result.metadata.processingSteps).toContain(step);
      });

      // Verify metadata contains all required analysis results
      expect(result.metadata.intentAnalysis).toBeDefined();
      expect(result.metadata.complexityAnalysis).toBeDefined();
      expect(result.metadata.strategyUsed).toBeDefined();
      expect(result.metadata.knowledgeItemsFound).toBeDefined();
    });

    test('should handle context enrichment with conversation history', async () => {
      // Mock conversation history
      mockDatabaseService.getConversationHistory.mockResolvedValue([
        {
          id: 'msg-1',
          messageText: 'Hola',
          responseText: '¡Hola! ¿En qué puedo ayudarte?',
          intent: 'saludo',
          createdAt: new Date(Date.now() - 300000), // 5 minutes ago
          isFromUser: true,
          phoneNumber: '+1234567890',
          sessionId: 'test-session-123',
        },
        {
          id: 'msg-2',
          messageText: '¿Tienen paquetes de publicidad?',
          responseText: 'Sí, tenemos varios paquetes disponibles',
          intent: 'consulta_producto',
          createdAt: new Date(Date.now() - 60000), // 1 minute ago
          isFromUser: true,
          phoneNumber: '+1234567890',
          sessionId: 'test-session-123',
        },
      ]);

      const message = '¿Cuánto cuestan?';

      const result = await aiThinkingService.processMessage(message, mockMessageContext);

      expect(result.metadata.contextEnrichment).toBeDefined();
      expect(result.metadata.contextEnrichment.conversationHistory).toBeDefined();
      expect(result.metadata.contextEnrichment.previousIntents).toContain('saludo');
      expect(result.metadata.contextEnrichment.userEngagementLevel).toBeDefined();
    });

    test('should validate strategy selection based on context and intent', async () => {
      const testScenarios = [
        {
          intent: 'consulta_precio',
          urgency: 'high',
          expectedStrategy: 'direct',
        },
        {
          intent: 'saludo',
          urgency: 'low',
          expectedStrategy: 'contextual',
        },
        {
          intent: 'consulta_producto',
          urgency: 'medium',
          expectedStrategy: 'contextual',
        },
      ];

      for (const scenario of testScenarios) {
        mockAIService.analyzeIntent.mockResolvedValue({
          intent: scenario.intent,
          confidence: 0.85,
          entities: {},
          sentiment: 'neutral',
        });

        const message = 'Test message for ' + scenario.intent;
        const result = await aiThinkingService.processMessage(message, mockMessageContext);

        expect(result.metadata.strategyUsed).toBeDefined();
        expect(result.metadata.strategyUsed.type).toBe(scenario.expectedStrategy);
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle database connection failures gracefully', async () => {
      mockDatabaseService.getConversationHistory.mockRejectedValue(
        new Error('Database connection failed')
      );

      const message = 'Test database error';

      const result = await aiThinkingService.processMessage(message, mockMessageContext);

      expect(result.response).toBeDefined();
      expect(result.metadata.processingSteps).toContain('error_handling');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should handle empty or invalid messages', async () => {
      const invalidMessages = ['', '   ', null, undefined];

      for (const invalidMessage of invalidMessages) {
        const result = await aiThinkingService.processMessage(
          invalidMessage as any,
          mockMessageContext
        );

        expect(result.response).toBeDefined();
        expect(result.response.success).toBe(false);
        expect(result.response.error).toContain('Invalid');
      }
    });

    test('should handle AI service unavailability with fallback', async () => {
      mockAIService.analyzeIntent.mockRejectedValue(new Error('AI service unavailable'));

      const message = 'Test AI service failure';

      const result = await aiThinkingService.processMessage(message, mockMessageContext);

      expect(result.response).toBeDefined();
      expect(result.metadata.processingSteps).toContain('fallback_response');
      expect(result.response.content).toContain('disculpa');
    });

    test('should handle missing context gracefully', async () => {
      const invalidContext = {
        from: '',
        sessionId: '',
        phoneNumber: '',
      };

      const message = 'Test with invalid context';

      const result = await aiThinkingService.processMessage(message, invalidContext);

      expect(result.response).toBeDefined();
      expect(result.metadata.contextEnrichment.fallbackUsed).toBe(true);
    });
  });

  describe('Cache and Memory Management', () => {
    test('should manage cache efficiently across multiple requests', async () => {
      const messages = [
        '¿Cuánto cuesta el paquete Plus?',
        '¿Cuánto cuesta el paquete Plus?', // Duplicate for cache hit
        'Hola, ¿qué tal?',
        '¿Cómo puedo registrarme?',
        '¿Cuánto cuesta el paquete Plus?', // Another duplicate
      ];

      let totalCacheHits = 0;

      for (const message of messages) {
        const result = await aiThinkingService.processMessage(message, mockMessageContext);
        totalCacheHits += result.metadata.cacheHits;
      }

      expect(totalCacheHits).toBeGreaterThan(0);
    });

    test('should clear cache when memory limits are exceeded', async () => {
      // Generate many unique messages to fill cache
      const messages = Array.from(
        { length: 100 },
        (_, i) => `Test message number ${i} with unique content`
      );

      for (const message of messages) {
        await aiThinkingService.processMessage(message, mockMessageContext);
      }

      // Verify system still responds correctly after cache pressure
      const finalResult = await aiThinkingService.processMessage(
        '¿Cuánto cuesta el paquete Plus?',
        mockMessageContext
      );

      expect(finalResult.response.success).toBe(true);
    });
  });

  describe('Response Quality Validation', () => {
    test('should generate contextually appropriate responses', async () => {
      const contextualTests = [
        {
          message: '¿Cuánto cuesta el paquete Plus?',
          expectedKeywords: ['300€', '500 HUB', 'precio'],
          intent: 'consulta_precio',
        },
        {
          message: 'Hola, ¿qué tal?',
          expectedKeywords: ['Hola', 'asistente', 'ayudar'],
          intent: 'saludo',
        },
        {
          message: '¿Cómo me registro?',
          expectedKeywords: ['registro', 'sign-up', 'gratuito'],
          intent: 'registro',
        },
      ];

      for (const test of contextualTests) {
        mockAIService.analyzeIntent.mockResolvedValue({
          intent: test.intent,
          confidence: 0.9,
          entities: {},
          sentiment: 'neutral',
        });

        const result = await aiThinkingService.processMessage(test.message, mockMessageContext);

        expect(result.response.success).toBe(true);
        expect(result.response.content).toBeDefined();

        // Check that response contains relevant keywords
        const hasRelevantContent = test.expectedKeywords.some(keyword =>
          result.response.content?.toLowerCase().includes(keyword.toLowerCase())
        );
        expect(hasRelevantContent).toBe(true);
      }
    });

    test('should maintain consistent response quality across requests', async () => {
      const message = '¿Cuánto cuesta el paquete Plus?';
      const results = [];

      // Generate multiple responses for the same question
      for (let i = 0; i < 5; i++) {
        const result = await aiThinkingService.processMessage(message, mockMessageContext);
        results.push(result);
      }

      // Verify all responses are successful and similar
      results.forEach(result => {
        expect(result.response.success).toBe(true);
        expect(result.response.content).toBeDefined();
        expect(result.response.content?.length).toBeGreaterThan(10);
      });

      // Verify quality scores are consistent
      const qualityScores = results.map(r => r.metadata.qualityScore);
      const avgQuality = qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length;
      expect(avgQuality).toBeGreaterThan(0.6);
    });
  });
});
