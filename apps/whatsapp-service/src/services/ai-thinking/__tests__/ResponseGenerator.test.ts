/**
 * ResponseGenerator Test Suite
 *
 * Comprehensive testing for the AI Thinking Service ResponseGenerator module.
 * Tests response generation, strategic optimizations, quality scoring, and
 * template handling with full coverage of all methods and edge cases.
 */

import { ResponseGenerator, ResponseGenerationResult } from '../ResponseGenerator';
import { IntentAnalysisExtended, EnrichedContext } from '../ContextEnricher';
import { ResponseStrategy } from '../StrategySelector';
import { KnowledgeItem } from '../KnowledgeRetrieval';
import { logger } from '../../../utils/logger';
import DatabaseService from '../../DatabaseService';
import AIService, { AIResponse } from '../../AIService';

// Mock dependencies
jest.mock('../../../utils/logger');
jest.mock('../../DatabaseService');
jest.mock('../../AIService');

const mockLogger = logger as jest.Mocked<typeof logger>;
const mockDatabaseService = DatabaseService as jest.Mocked<typeof DatabaseService>;
const mockAIService = AIService as jest.Mocked<typeof AIService>;

describe('ResponseGenerator', () => {
  let responseGenerator: ResponseGenerator;

  // Test fixtures
  const mockEnrichedContext: EnrichedContext = {
    from: 'test-user',
    sessionId: 'test-session-123',
    phoneNumber: '+1234567890',
    messageText: 'Test message',
    previousIntents: [],
    messageHistory: [
      {
        message: 'Hola, ¿qué tal?',
        timestamp: new Date(),
        isFromUser: true,
      },
      {
        message: '¡Hola! ¿En qué puedo ayudarte?',
        timestamp: new Date(),
        isFromUser: false,
      },
    ],
    userEngagementLevel: 'medium',
    timeOfDay: 'morning',
    dayOfWeek: 'weekday',
  };

  const mockIntentAnalysis: IntentAnalysisExtended = {
    intent: 'consulta_precio',
    confidence: 0.85,
    entities: {},
    sentiment: 'neutral',
    urgency: 'medium',
    category: 'pricing',
  };

  const mockResponseStrategy: ResponseStrategy = {
    type: 'contextual',
    tone: 'friendly',
    length: 'medium',
    priority: 'high',
    shouldUseEmojis: true,
    maxResponseTime: 5000,
    templateCategory: 'pricing',
    confidence: 0.9,
    reasoning: ['user_inquiry', 'business_context'],
  };

  const mockKnowledgeItems: KnowledgeItem[] = [
    {
      id: 'kb-1',
      title: 'Paquete Plus Pricing',
      content: 'Paquete Plus: 500 HUB por 300€ - mejor precio disponible',
      relevanceScore: 0.95,
      source: 'knowledge_base',
      category: 'pricing',
      lastUpdated: new Date(),
    },
    {
      id: 'kb-2',
      title: 'Registration Process',
      content: 'Registro gratuito en https://www.escortshub.net/es/sign-up',
      relevanceScore: 0.7,
      source: 'knowledge_base',
      category: 'registration',
      lastUpdated: new Date(),
    },
  ];

  beforeEach(() => {
    responseGenerator = new ResponseGenerator();

    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock implementations
    mockAIService.generateResponse.mockResolvedValue({
      success: true,
      content:
        'El Paquete Plus cuesta 300€ por 500 HUB, es la mejor opción disponible. Los precios son competitivos y el servicio incluye soporte completo.',
      provider: 'openrouter',
      tokensUsed: 150,
    });

    mockAIService.getCurrentProvider.mockReturnValue('openrouter');
    mockAIService.getTemplateResponse.mockReturnValue(null);

    mockDatabaseService.getAIConfiguration.mockResolvedValue(
      'Eres un asistente profesional de EscortsHub.net. Responde de forma breve y útil.'
    );
  });

  describe('Constructor and Initialization', () => {
    test('should initialize ResponseGenerator correctly', () => {
      const generator = new ResponseGenerator();
      expect(generator).toBeInstanceOf(ResponseGenerator);
      expect(mockLogger.debug).toHaveBeenCalledWith('ResponseGenerator module initialized');
    });
  });

  describe('generateContextualResponse', () => {
    test('should generate successful contextual response', async () => {
      const result = await responseGenerator.generateContextualResponse(
        '¿Cuánto cuesta el paquete Plus?',
        mockEnrichedContext,
        mockIntentAnalysis,
        mockResponseStrategy,
        mockKnowledgeItems
      );

      expect(result).toEqual(
        expect.objectContaining({
          response: expect.objectContaining({
            success: true,
            content: expect.any(String),
          }),
          appliedOptimizations: expect.any(Array),
          originalLength: expect.any(Number),
          finalLength: expect.any(Number),
          qualityScore: expect.any(Number),
          processingTime: expect.any(Number),
        })
      );

      expect(result.qualityScore).toBeGreaterThan(0);
      expect(result.processingTime).toBeGreaterThan(0);
    });

    test('should use template response when available', async () => {
      const greetingIntentAnalysis: IntentAnalysisExtended = {
        ...mockIntentAnalysis,
        intent: 'saludo',
        category: 'greeting',
      };

      mockAIService.getTemplateResponse.mockReturnValue(
        '¡Hola! 👋 Soy tu asistente de EscortsHub.net'
      );

      const result = await responseGenerator.generateContextualResponse(
        'Hola',
        mockEnrichedContext,
        greetingIntentAnalysis,
        mockResponseStrategy,
        []
      );

      expect(result.response.content).toBe('¡Hola! 👋 Soy tu asistente de EscortsHub.net');
      expect(result.appliedOptimizations).toContain('template_response');
      expect(result.templateUsed).toBe('pricing');
      expect(result.response.tokensUsed).toBe(0);
    });

    test('should handle AI service failure gracefully', async () => {
      mockAIService.generateResponse.mockResolvedValue({
        success: false,
        error: 'AI service temporarily unavailable',
        provider: 'openrouter',
      });

      const result = await responseGenerator.generateContextualResponse(
        'Test message',
        mockEnrichedContext,
        mockIntentAnalysis,
        mockResponseStrategy,
        mockKnowledgeItems
      );

      expect(result.response.success).toBe(false);
      expect(result.appliedOptimizations).toContain('error_fallback');
      expect(result.qualityScore).toBe(0.2);
    });

    test('should handle exceptions during generation', async () => {
      mockAIService.generateResponse.mockRejectedValue(new Error('Network error'));

      const result = await responseGenerator.generateContextualResponse(
        'Test message',
        mockEnrichedContext,
        mockIntentAnalysis,
        mockResponseStrategy,
        mockKnowledgeItems
      );

      expect(result.response.success).toBe(false);
      expect(result.appliedOptimizations).toContain('error_fallback');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error in response generation:',
        expect.any(Error)
      );
    });

    test('should build contextual prompt with knowledge data', async () => {
      const longKnowledgeItems = [
        ...mockKnowledgeItems,
        {
          id: 'kb-3',
          title: 'Additional Service',
          content: 'Additional service information',
          relevanceScore: 0.8,
          source: 'knowledge_base' as const,
          category: 'services',
          lastUpdated: new Date(),
        },
      ];

      await responseGenerator.generateContextualResponse(
        'Tell me about services',
        mockEnrichedContext,
        mockIntentAnalysis,
        mockResponseStrategy,
        longKnowledgeItems
      );

      expect(mockDatabaseService.getAIConfiguration).toHaveBeenCalledWith('system_prompt');
      expect(mockAIService.generateResponse).toHaveBeenCalledWith(
        'Tell me about services',
        expect.objectContaining({
          conversationHistory: expect.any(Array),
        })
      );
    });
  });

  describe('applyStrategicOptimizations', () => {
    test('should apply all optimization strategies', async () => {
      const longResponse = `
        El Paquete Plus es una excelente opción que cuesta 300€ por 500 HUB y es realmente el mejor precio disponible en el mercado.
        
        **CARACTERÍSTICAS IMPORTANTES:**
        • Incluye soporte 24/7
        • Acceso completo a la plataforma
        • Herramientas avanzadas de gestión
        • Promociones exclusivas
        • Soporte técnico especializado
        • Actualizaciones automáticas
        
        | Paquete | Precio | HUB |
        |---------|--------|-----|
        | Basic   | 100€   | 100 |
        | Plus    | 300€   | 500 |
        | Premium | 500€   | 1000|
        
        IMPORTANTE: Todos nuestros paquetes incluyen garantía completa.
        NOTA: Los precios pueden cambiar sin previo aviso.
      `;

      const result = await responseGenerator.applyStrategicOptimizations(
        longResponse,
        mockResponseStrategy,
        mockIntentAnalysis,
        mockEnrichedContext
      );

      expect(result.optimizations).toEqual(
        expect.arrayContaining([
          'length_optimization',
          'promotion_cleanup',
          'structure_optimization',
          'question_addition',
        ])
      );
      expect(result.content.length).toBeLessThan(longResponse.length);
      expect(result.content).toMatch(/\?$/); // Should end with question
    });

    test('should handle optimization errors gracefully', async () => {
      // Mock a method to throw an error
      const originalMethod = responseGenerator['applyLengthConstraints'];
      responseGenerator['applyLengthConstraints'] = jest.fn(() => {
        throw new Error('Optimization error');
      });

      const result = await responseGenerator.applyStrategicOptimizations(
        'Test content',
        mockResponseStrategy,
        mockIntentAnalysis,
        mockEnrichedContext
      );

      expect(result.content).toBe('Test content'); // Should return original
      expect(result.optimizations).toContain('optimization_error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error in strategic optimizations:',
        expect.any(Error)
      );

      // Restore original method
      responseGenerator['applyLengthConstraints'] = originalMethod;
    });

    test('should apply emoji strategy correctly', async () => {
      const emojiResponse = 'Hola! 👋 El paquete cuesta 300€ 💰 ¿Te interesa? 😊';

      // Test with emojis allowed
      let result = await responseGenerator.applyStrategicOptimizations(
        emojiResponse,
        { ...mockResponseStrategy, shouldUseEmojis: true },
        mockIntentAnalysis,
        mockEnrichedContext
      );
      expect(result.content).toContain('👋');
      expect(result.optimizations).not.toContain('emoji_optimization');

      // Test with emojis not allowed
      result = await responseGenerator.applyStrategicOptimizations(
        emojiResponse,
        { ...mockResponseStrategy, shouldUseEmojis: false },
        mockIntentAnalysis,
        mockEnrichedContext
      );
      expect(result.content).not.toContain('👋');
      expect(result.optimizations).toContain('emoji_optimization');
    });
  });

  describe('Length Constraints and Truncation', () => {
    test('should apply appropriate length constraints for different intents', async () => {
      const testCases = [
        { intent: 'saludo', maxWords: 25 },
        { intent: 'consulta_precio', maxWords: 80 },
        { intent: 'registro', maxWords: 50 },
        { intent: 'general', maxWords: 120 },
      ];

      for (const testCase of testCases) {
        const longContent = 'word '.repeat(testCase.maxWords + 10);
        const intentAnalysis = { ...mockIntentAnalysis, intent: testCase.intent };

        const result = responseGenerator['applyLengthConstraints'](
          longContent,
          mockResponseStrategy,
          intentAnalysis
        );

        const wordCount = result.content.split(/\s+/).length;
        expect(wordCount).toBeLessThanOrEqual(testCase.maxWords);
        expect(result.applied).toBe(true);
      }
    });

    test('should handle greeting intent with special template', () => {
      const longGreeting =
        'Hola amigo como estas muy bien gracias por contactarnos estamos aqui para ayudarte en lo que necesites';
      const greetingIntent = { ...mockIntentAnalysis, intent: 'saludo' };

      const result = responseGenerator['intelligentTruncate'](
        longGreeting,
        25,
        greetingIntent.intent
      );

      expect(result).toBe('¡Hola! 👋 Soy tu asistente de EscortsHub.net. ¿En qué puedo ayudarte?');
    });

    test('should add appropriate questions for different intents', () => {
      const baseContent = 'El paquete Plus cuesta 300€';

      const testCases = [
        { intent: 'consulta_precio', expectedQuestion: '. ¿Te interesa algún paquete?' },
        { intent: 'registro', expectedQuestion: '. ¿Te ayudo con el registro?' },
        { intent: 'consulta_producto', expectedQuestion: '. ¿Necesitas más información?' },
        { intent: 'unknown', expectedQuestion: '. ¿Te ayudo con algo más?' },
      ];

      for (const testCase of testCases) {
        const result = responseGenerator['intelligentTruncate'](
          baseContent.repeat(10), // Make it long enough to truncate
          20,
          testCase.intent
        );

        expect(result).toContain(testCase.expectedQuestion);
      }
    });
  });

  describe('Content Optimization Methods', () => {
    test('should remove excessive promotional content', () => {
      const promotionalContent = `
        • Característica 1
        • Característica 2  
        • Característica 3
        • Característica 4
        
        **Ventaja 1**
        **Ventaja 2**
        **Ventaja 3**
        
        IMPORTANTE: No te olvides de esto
        NOTA: Recordatorio importante
      `;

      const result = responseGenerator['removeExcessivePromotions'](promotionalContent);

      expect(result.applied).toBe(true);
      expect(result.content).not.toContain('IMPORTANTE:');
      expect(result.content).not.toContain('NOTA:');
    });

    test('should optimize tables and lists', () => {
      const tableContent = `
        | Paquete | Precio | HUB |
        |---------|--------|-----|
        | Basic   | 100€   | 100 |
        | Plus    | 300€   | 500 |
        
        • Item 1
        • Item 2
        • Item 3
        • Item 4
        • Item 5
        
        1. Paso 1
        2. Paso 2
        3. Paso 3
        4. Paso 4
        5. Paso 5
      `;

      const result = responseGenerator['optimizeTablesAndLists'](tableContent);

      expect(result.applied).toBe(true);
      expect(result.content).not.toContain('|'); // Tables removed
      expect((result.content.match(/•/g) || []).length).toBeLessThanOrEqual(3); // Max 3 bullets
      expect((result.content.match(/\d+\./g) || []).length).toBeLessThanOrEqual(3); // Max 3 numbered
    });

    test('should ensure final question when missing', () => {
      const contentWithoutQuestion = 'El paquete cuesta 300€.';
      const contentWithQuestion = 'El paquete cuesta 300€?';

      // Test adding question
      let result = responseGenerator['ensureFinalQuestion'](
        contentWithoutQuestion,
        'consulta_precio'
      );
      expect(result.applied).toBe(true);
      expect(result.content).toContain('¿Te interesa algún paquete?');

      // Test not adding when already present
      result = responseGenerator['ensureFinalQuestion'](contentWithQuestion, 'consulta_precio');
      expect(result.applied).toBe(false);
      expect(result.content).toBe(contentWithQuestion);
    });

    test('should perform final validation and cleanup', () => {
      const messyContent = '  Content with   multiple   spaces  \n\n\n\n  and  newlines  ';

      const result = responseGenerator['performFinalValidation'](
        messyContent,
        mockResponseStrategy
      );

      expect(result.applied).toBe(true);
      expect(result.content).toBe('Content with multiple spaces and newlines');
    });

    test('should handle empty content in final validation', () => {
      const emptyContent = '';

      const result = responseGenerator['performFinalValidation'](
        emptyContent,
        mockResponseStrategy
      );

      expect(result.applied).toBe(true);
      expect(result.content).toBe('Lo siento, ¿puedes ser más específico? Te ayudo con gusto.');
    });
  });

  describe('Template Response Handling', () => {
    test('should handle greeting templates', async () => {
      const greetingAnalysis: IntentAnalysisExtended = {
        ...mockIntentAnalysis,
        intent: 'saludo',
        category: 'greeting',
      };

      mockAIService.getTemplateResponse.mockReturnValue('¡Hola! Soy tu asistente.');

      const result = await responseGenerator['tryTemplateResponse'](
        greetingAnalysis,
        mockEnrichedContext,
        mockResponseStrategy
      );

      expect(result).toEqual({
        success: true,
        content: '¡Hola! Soy tu asistente.',
        provider: 'openrouter',
        tokensUsed: 0,
      });
    });

    test('should handle category-specific templates', async () => {
      mockAIService.getTemplateResponse
        .mockReturnValueOnce(null) // First call for greeting
        .mockReturnValueOnce('Template response for pricing'); // Second call for category

      const result = await responseGenerator['tryTemplateResponse'](
        mockIntentAnalysis,
        mockEnrichedContext,
        mockResponseStrategy
      );

      expect(result).toEqual({
        success: true,
        content: 'Template response for pricing',
        provider: 'openrouter',
        tokensUsed: 0,
      });
    });

    test('should return null when no template available', async () => {
      mockAIService.getTemplateResponse.mockReturnValue(null);

      const result = await responseGenerator['tryTemplateResponse'](
        mockIntentAnalysis,
        mockEnrichedContext,
        mockResponseStrategy
      );

      expect(result).toBeNull();
    });

    test('should handle template errors gracefully', async () => {
      mockAIService.getTemplateResponse.mockImplementation(() => {
        throw new Error('Template error');
      });

      const result = await responseGenerator['tryTemplateResponse'](
        mockIntentAnalysis,
        mockEnrichedContext,
        mockResponseStrategy
      );

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error getting template response:',
        expect.any(Error)
      );
    });
  });

  describe('Quality Scoring', () => {
    test('should calculate quality score correctly', () => {
      const testCases = [
        { content: 'Short response?', expectedMin: 0.7, expectedMax: 1.0 }, // Good length + question
        {
          content:
            'Very long response that exceeds the optimal word count and should get a lower score but still reasonable',
          expectedMin: 0.6,
          expectedMax: 0.8,
        },
        { content: 'No question here', expectedMin: 0.5, expectedMax: 0.7 }, // No question
        { content: 'Short', expectedMin: 0.5, expectedMax: 0.7 }, // Too short
      ];

      for (const testCase of testCases) {
        const score = responseGenerator['calculateQualityScore'](
          testCase.content,
          mockResponseStrategy,
          mockIntentAnalysis
        );

        expect(score).toBeGreaterThanOrEqual(testCase.expectedMin);
        expect(score).toBeLessThanOrEqual(testCase.expectedMax);
        expect(score).toBeLessThanOrEqual(1.0);
        expect(score).toBeGreaterThanOrEqual(0);
      }
    });

    test('should consider intent confidence in quality score', () => {
      const highConfidenceIntent = { ...mockIntentAnalysis, confidence: 0.9 };
      const lowConfidenceIntent = { ...mockIntentAnalysis, confidence: 0.3 };

      const highScore = responseGenerator['calculateQualityScore'](
        'Good response with proper length and question?',
        mockResponseStrategy,
        highConfidenceIntent
      );

      const lowScore = responseGenerator['calculateQualityScore'](
        'Good response with proper length and question?',
        mockResponseStrategy,
        lowConfidenceIntent
      );

      expect(highScore).toBeGreaterThan(lowScore);
    });
  });

  describe('Contextual Prompt Building', () => {
    test('should build comprehensive contextual prompt', async () => {
      const prompt = await responseGenerator['buildContextualPrompt'](
        mockIntentAnalysis,
        mockResponseStrategy,
        mockKnowledgeItems,
        mockEnrichedContext
      );

      expect(prompt).toContain('INSTRUCCIÓN CRÍTICA');
      expect(prompt).toContain('CONTEXTO ACTUAL');
      expect(prompt).toContain('ESTRATEGIA DE RESPUESTA');
      expect(prompt).toContain('CONOCIMIENTO RELEVANTE');
      expect(prompt).toContain(mockIntentAnalysis.intent);
      expect(prompt).toContain(mockResponseStrategy.tone);
      expect(prompt).toContain(mockKnowledgeItems[0].title);
    });

    test('should handle missing system prompt gracefully', async () => {
      mockDatabaseService.getAIConfiguration.mockResolvedValue(null);

      const prompt = await responseGenerator['buildContextualPrompt'](
        mockIntentAnalysis,
        mockResponseStrategy,
        [],
        mockEnrichedContext
      );

      expect(prompt).toContain('INSTRUCCIÓN CRÍTICA');
      expect(typeof prompt).toBe('string');
    });

    test('should handle prompt building errors', async () => {
      mockDatabaseService.getAIConfiguration.mockRejectedValue(new Error('DB error'));

      const prompt = await responseGenerator['buildContextualPrompt'](
        mockIntentAnalysis,
        mockResponseStrategy,
        mockKnowledgeItems,
        mockEnrichedContext
      );

      expect(prompt).toBe('Responde de forma breve y profesional.');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error building contextual prompt:',
        expect.any(Error)
      );
    });

    test('should get format instructions for different intents', () => {
      const testCases = [
        { intent: 'consulta_precio', shouldContain: 'FORMATO PRECIO' },
        { intent: 'registro', shouldContain: 'FORMATO REGISTRO' },
        { intent: 'unknown_intent', shouldContain: 'FORMATO GENERAL' },
      ];

      for (const testCase of testCases) {
        const instructions = responseGenerator['getFormatInstructions'](testCase.intent);
        expect(instructions).toContain(testCase.shouldContain);
      }
    });
  });

  describe('Result Building', () => {
    test('should build complete response generation result', () => {
      const mockResponse: AIResponse = {
        success: true,
        content: 'Test response',
        provider: 'openrouter',
        tokensUsed: 50,
      };

      const result = responseGenerator['buildResult'](
        mockResponse,
        ['optimization1', 'optimization2'],
        100,
        80,
        0.85,
        1500,
        'pricing_template'
      );

      expect(result).toEqual({
        response: mockResponse,
        appliedOptimizations: ['optimization1', 'optimization2'],
        originalLength: 100,
        finalLength: 80,
        qualityScore: 0.85,
        processingTime: 1500,
        templateUsed: 'pricing_template',
      });
    });

    test('should build result without template', () => {
      const mockResponse: AIResponse = {
        success: true,
        content: 'Test response',
        provider: 'openrouter',
        tokensUsed: 50,
      };

      const result = responseGenerator['buildResult'](mockResponse, [], 50, 50, 0.7, 1000);

      expect(result.templateUsed).toBeUndefined();
      expect(result.appliedOptimizations).toEqual([]);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle null/undefined inputs gracefully', async () => {
      // Test with minimal valid input
      const result = await responseGenerator.generateContextualResponse(
        '',
        mockEnrichedContext,
        mockIntentAnalysis,
        mockResponseStrategy,
        []
      );

      expect(result).toBeDefined();
      expect(result.response).toBeDefined();
      expect(result.processingTime).toBeGreaterThan(0);
    });

    test('should handle very long knowledge items', async () => {
      const longKnowledgeItems = Array.from({ length: 20 }, (_, i) => ({
        id: `kb-${i}`,
        title: `Knowledge Item ${i}`,
        content: `Very long content for knowledge item ${i}`.repeat(10),
        relevanceScore: 0.5,
        source: 'knowledge_base' as const,
        category: 'general',
        lastUpdated: new Date(),
      }));

      const result = await responseGenerator.generateContextualResponse(
        'Test question',
        mockEnrichedContext,
        mockIntentAnalysis,
        mockResponseStrategy,
        longKnowledgeItems
      );

      expect(result).toBeDefined();
      expect(result.response.success).toBe(true);
    });

    test('should handle empty strategy and intent', async () => {
      const emptyStrategy: ResponseStrategy = {
        type: 'contextual',
        tone: 'friendly',
        length: 'brief',
        priority: 'low',
        shouldUseEmojis: false,
        maxResponseTime: 1000,
        confidence: 0.5,
        reasoning: [],
      };

      const emptyIntent: IntentAnalysisExtended = {
        intent: 'unknown',
        confidence: 0.1,
        entities: {},
        sentiment: 'neutral',
        urgency: 'low',
        category: 'general',
      };

      const result = await responseGenerator.generateContextualResponse(
        'Test',
        mockEnrichedContext,
        emptyIntent,
        emptyStrategy,
        []
      );

      expect(result).toBeDefined();
      expect(result.qualityScore).toBeGreaterThan(0);
    });
  });

  describe('Performance and Optimization', () => {
    test('should complete response generation within reasonable time', async () => {
      const startTime = Date.now();

      await responseGenerator.generateContextualResponse(
        'Test performance',
        mockEnrichedContext,
        mockIntentAnalysis,
        mockResponseStrategy,
        mockKnowledgeItems
      );

      const processingTime = Date.now() - startTime;
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should handle concurrent requests', async () => {
      const requests = Array.from({ length: 5 }, (_, i) =>
        responseGenerator.generateContextualResponse(
          `Test message ${i}`,
          mockEnrichedContext,
          mockIntentAnalysis,
          mockResponseStrategy,
          mockKnowledgeItems
        )
      );

      const results = await Promise.all(requests);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.response).toBeDefined();
        expect(result.processingTime).toBeGreaterThan(0);
      });
    });
  });
});
