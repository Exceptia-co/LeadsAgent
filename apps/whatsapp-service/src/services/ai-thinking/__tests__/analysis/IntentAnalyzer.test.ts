/**
 * IntentAnalyzer Test Suite
 *
 * Comprehensive tests for the IntentAnalyzer service including:
 * - Basic intent analysis functionality
 * - Simple greeting detection and optimization
 * - Specific query classification
 * - Urgency detection
 * - Category and subcategory assignment
 * - Error handling and edge cases
 * - Integration with AIService
 */

import { IntentAnalyzer } from '../../analysis/IntentAnalyzer';
import { IntentAnalysis, EnrichedContext } from '../../interfaces/types';
import { IntentAnalysisError } from '../../errors/ThinkingServiceErrors';
import AIService from '../../../AIService';

// Mock AIService
jest.mock('../../../AIService', () => ({
  analyzeIntent: jest.fn(),
}));

// Mock logger
jest.mock('../../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

describe('IntentAnalyzer', () => {
  let intentAnalyzer: IntentAnalyzer;
  let mockAIService: jest.Mocked<typeof AIService>;
  let mockContext: EnrichedContext;

  beforeEach(() => {
    intentAnalyzer = IntentAnalyzer.getInstance();
    mockAIService = AIService as jest.Mocked<typeof AIService>;

    // Reset mocks
    jest.clearAllMocks();

    // Set up default mock context
    mockContext = {
      from: '+1234567890',
      sessionId: 'test-session',
      messageHistory: [],
      previousIntents: [],
      conversationSummary: '',
      leadProfile: {
        id: 'test-lead',
        nombre: 'Test User',
      },
      userEngagementLevel: 'medium' as const,
      timeOfDay: 'afternoon' as const,
      dayOfWeek: 'weekday' as const,
    };
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = IntentAnalyzer.getInstance();
      const instance2 = IntentAnalyzer.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should maintain state across getInstance calls', () => {
      const instance1 = IntentAnalyzer.getInstance();
      const instance2 = IntentAnalyzer.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Simple Greeting Detection', () => {
    it('should detect exact greetings with high confidence', async () => {
      const greetings = ['hola', 'hi', 'hello', 'buenas', 'hey'];

      for (const greeting of greetings) {
        const result = await intentAnalyzer.analyze(greeting, mockContext);

        expect(result.intent).toBe('saludo');
        expect(result.confidence).toBeGreaterThanOrEqual(0.9);
        expect(result.category).toBe('social');
        expect(result.subcategory).toBe('simple_greeting');
        expect(result.sentiment).toBe('positive');
        expect(result.urgency).toBe('low');
      }

      // AIService should not be called for simple greetings
      expect(mockAIService.analyzeIntent).not.toHaveBeenCalled();
    });

    it('should detect simple greetings with additional words', async () => {
      const greetings = ['hola qué tal', 'buenas tardes', 'hello there'];

      for (const greeting of greetings) {
        const result = await intentAnalyzer.analyze(greeting, mockContext);

        expect(result.intent).toBe('saludo');
        expect(result.confidence).toBeGreaterThanOrEqual(0.8);
        expect(result.category).toBe('social');
        expect(result.subcategory).toBe('simple_greeting');
      }
    });

    it('should not classify complex messages as simple greetings', async () => {
      mockAIService.analyzeIntent.mockResolvedValue({
        intent: 'consulta_producto',
        confidence: 0.8,
        entities: {},
        sentiment: 'neutral',
      });

      const complexMessage =
        'hola, me gustaría saber más información sobre sus productos y servicios disponibles';
      const result = await intentAnalyzer.analyze(complexMessage, mockContext);

      expect(result.intent).not.toBe('saludo');
      expect(mockAIService.analyzeIntent).toHaveBeenCalledWith(complexMessage);
    });
  });

  describe('Specific Query Detection', () => {
    beforeEach(() => {
      mockAIService.analyzeIntent.mockResolvedValue({
        intent: 'consulta_precio',
        confidence: 0.7,
        entities: { producto: 'anuncio' },
        sentiment: 'neutral',
      });
    });

    it('should detect pricing queries', async () => {
      const pricingQueries = [
        '¿Cuánto cuesta un anuncio?',
        'Me puedes decir el precio del plan premium',
        '¿Cuál es la tarifa de publicación?',
      ];

      for (const query of pricingQueries) {
        const result = await intentAnalyzer.analyze(query, mockContext);

        expect(result.intent).toBe('consulta_precio');
        expect(result.confidence).toBeGreaterThan(0.7);
        expect(result.category).toBe('commercial');
      }
    });

    it('should detect product queries', async () => {
      mockAIService.analyzeIntent.mockResolvedValue({
        intent: 'consulta_producto',
        confidence: 0.8,
        entities: {},
        sentiment: 'neutral',
      });

      const productQueries = [
        'Información sobre sus servicios',
        '¿Qué tipos de anuncios ofrecen?',
        'Háblame de los paquetes premium',
      ];

      for (const query of productQueries) {
        const result = await intentAnalyzer.analyze(query, mockContext);

        expect(result.intent).toBe('consulta_producto');
        expect(result.category).toBe('commercial');
      }
    });

    it('should detect technical support queries', async () => {
      mockAIService.analyzeIntent.mockResolvedValue({
        intent: 'soporte_tecnico',
        confidence: 0.8,
        entities: {},
        sentiment: 'negative',
      });

      const supportQueries = [
        'Tengo un problema con mi anuncio',
        'Mi cuenta no funciona correctamente',
        'Error al publicar',
      ];

      for (const query of supportQueries) {
        const result = await intentAnalyzer.analyze(query, mockContext);

        expect(result.intent).toBe('soporte_tecnico');
        expect(result.category).toBe('support');
      }
    });
  });

  describe('Urgency Detection', () => {
    beforeEach(() => {
      mockAIService.analyzeIntent.mockResolvedValue({
        intent: 'general',
        confidence: 0.6,
        entities: {},
        sentiment: 'neutral',
      });
    });

    it('should detect high urgency keywords', async () => {
      const urgentMessages = [
        'Necesito ayuda urgente',
        'Es inmediato, por favor',
        'Emergency - mi anuncio no aparece',
        'Ya necesito una respuesta',
      ];

      for (const message of urgentMessages) {
        const result = await intentAnalyzer.analyze(message, mockContext);
        expect(result.urgency).toBe('high');
      }
    });

    it('should detect low urgency keywords', async () => {
      const lowUrgencyMessages = [
        'Cuando puedas, me envías información',
        'Sin prisa, más tarde hablamos',
        'Eventually me gustaría saber más',
      ];

      for (const message of lowUrgencyMessages) {
        const result = await intentAnalyzer.analyze(message, mockContext);
        expect(result.urgency).toBe('low');
      }
    });

    it('should default to medium urgency', async () => {
      const result = await intentAnalyzer.analyze('¿Cómo funciona su servicio?', mockContext);
      expect(result.urgency).toBe('medium');
    });
  });

  describe('Category and Subcategory Assignment', () => {
    it('should categorize social intents correctly', async () => {
      mockAIService.analyzeIntent.mockResolvedValue({
        intent: 'despedida',
        confidence: 0.9,
        entities: {},
        sentiment: 'positive',
      });

      const result = await intentAnalyzer.analyze('Hasta luego, gracias', mockContext);
      expect(result.category).toBe('social');
    });

    it('should categorize commercial intents correctly', async () => {
      mockAIService.analyzeIntent.mockResolvedValue({
        intent: 'pricing_inquiry',
        confidence: 0.8,
        entities: {},
        sentiment: 'neutral',
      });

      const result = await intentAnalyzer.analyze('What are your prices?', mockContext);
      expect(result.category).toBe('commercial');
    });

    it('should assign subcategories for pricing queries', async () => {
      mockAIService.analyzeIntent.mockResolvedValue({
        intent: 'consulta_precio',
        confidence: 0.8,
        entities: {},
        sentiment: 'neutral',
      });

      const packageQuery = await intentAnalyzer.analyze(
        '¿Cuánto cuesta el paquete premium?',
        mockContext
      );
      expect(packageQuery.subcategory).toBe('packages');

      const discountQuery = await intentAnalyzer.analyze(
        '¿Hay algún descuento disponible?',
        mockContext
      );
      expect(discountQuery.subcategory).toBe('discounts');
    });

    it('should default to general category for unknown intents', async () => {
      mockAIService.analyzeIntent.mockResolvedValue({
        intent: 'unknown_intent',
        confidence: 0.5,
        entities: {},
        sentiment: 'neutral',
      });

      const result = await intentAnalyzer.analyze('Some random message', mockContext);
      expect(result.category).toBe('general');
    });
  });

  describe('Context Enhancement', () => {
    it('should increase confidence when message history exists', async () => {
      mockAIService.analyzeIntent.mockResolvedValue({
        intent: 'consulta_precio',
        confidence: 0.7,
        entities: {},
        sentiment: 'neutral',
      });

      const contextWithHistory: EnrichedContext = {
        ...mockContext,
        messageHistory: [
          { message: 'Hola', intent: 'saludo', timestamp: new Date(), isFromUser: true },
          {
            message: '¿Qué servicios ofrecen?',
            intent: 'consulta_producto',
            timestamp: new Date(),
            isFromUser: true,
          },
        ],
      };

      const result = await intentAnalyzer.analyze('¿Cuánto cuesta?', contextWithHistory);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should boost confidence for specific queries', async () => {
      mockAIService.analyzeIntent.mockResolvedValue({
        intent: 'consulta_precio',
        confidence: 0.6,
        entities: {},
        sentiment: 'neutral',
      });

      const result = await intentAnalyzer.analyze(
        '¿Cuál es el precio del plan premium?',
        mockContext
      );

      // Should be boosted due to specific query detection
      expect(result.confidence).toBeGreaterThan(0.6);
      expect(result.confidence).toBeLessThanOrEqual(0.95);
    });
  });

  describe('Error Handling', () => {
    it('should handle AIService errors gracefully', async () => {
      mockAIService.analyzeIntent.mockRejectedValue(new Error('AI Service Error'));

      await expect(
        intentAnalyzer.analyze('Test message that requires AI analysis', mockContext)
      ).rejects.toThrow(IntentAnalysisError);
    });

    it('should handle null or undefined input gracefully', async () => {
      await expect(intentAnalyzer.analyze(null as any, mockContext)).rejects.toThrow(
        IntentAnalysisError
      );

      await expect(intentAnalyzer.analyze('test', null as any)).rejects.toThrow(
        IntentAnalysisError
      );
    });

    it('should handle empty messages', async () => {
      const result = await intentAnalyzer.analyze('', mockContext);

      // Should still return a result, likely a greeting or general intent
      expect(result).toBeDefined();
      expect(result.intent).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle very long messages', async () => {
      mockAIService.analyzeIntent.mockResolvedValue({
        intent: 'general',
        confidence: 0.6,
        entities: {},
        sentiment: 'neutral',
      });

      const longMessage = 'A'.repeat(10000);
      const result = await intentAnalyzer.analyze(longMessage, mockContext);

      expect(result).toBeDefined();
      expect(result.intent).toBeDefined();
    });

    it('should handle special characters and emojis', async () => {
      mockAIService.analyzeIntent.mockResolvedValue({
        intent: 'general',
        confidence: 0.6,
        entities: {},
        sentiment: 'positive',
      });

      const emojiMessage = '🤔 ¿Qué tal? 😊 🎉';
      const result = await intentAnalyzer.analyze(emojiMessage, mockContext);

      expect(result).toBeDefined();
      expect(result.sentiment).toBe('positive');
    });
  });

  describe('Complexity Analysis', () => {
    it('should correctly analyze message complexity for greetings', async () => {
      const result = await intentAnalyzer.analyze('hola', mockContext);
      expect(result.subcategory).toBe('simple_greeting');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should handle complex technical messages', async () => {
      mockAIService.analyzeIntent.mockResolvedValue({
        intent: 'soporte_tecnico',
        confidence: 0.8,
        entities: { error: 'database' },
        sentiment: 'negative',
      });

      const technicalMessage =
        'Tengo un error en la base de datos cuando intento publicar mi anuncio premium';
      const result = await intentAnalyzer.analyze(technicalMessage, mockContext);

      expect(result.intent).toBe('soporte_tecnico');
      expect(result.category).toBe('support');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should detect question patterns', async () => {
      mockAIService.analyzeIntent.mockResolvedValue({
        intent: 'informational',
        confidence: 0.7,
        entities: {},
        sentiment: 'neutral',
      });

      const questions = [
        '¿Cómo funciona su servicio?',
        '¿Qué necesito para registrarme?',
        '¿Cuándo estará disponible?',
        '¿Por qué mi anuncio no aparece?',
      ];

      for (const question of questions) {
        const result = await intentAnalyzer.analyze(question, mockContext);
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    });
  });

  describe('Performance Tests', () => {
    it('should analyze simple greetings quickly without AI calls', async () => {
      const startTime = Date.now();

      await intentAnalyzer.analyze('hola', mockContext);

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(10); // Should be very fast
      expect(mockAIService.analyzeIntent).not.toHaveBeenCalled();
    });

    it('should handle batch analysis efficiently', async () => {
      mockAIService.analyzeIntent.mockResolvedValue({
        intent: 'general',
        confidence: 0.6,
        entities: {},
        sentiment: 'neutral',
      });

      const messages = Array.from({ length: 100 }, (_, i) => `Message ${i}`);

      const startTime = Date.now();

      const results = await Promise.all(
        messages.map(message => intentAnalyzer.analyze(message, mockContext))
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(results).toHaveLength(100);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.intent).toBeDefined();
      });
    });
  });

  describe('Enhanced Analysis Method', () => {
    it('should call analyzeEnhanced directly', async () => {
      mockAIService.analyzeIntent.mockResolvedValue({
        intent: 'test_intent',
        confidence: 0.8,
        entities: {},
        sentiment: 'neutral',
      });

      const result = await intentAnalyzer.analyzeEnhanced('Test message', mockContext);

      expect(result).toBeDefined();
      expect(result.intent).toBe('test_intent');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should match analyze() method results', async () => {
      const message = 'Test message for consistency';

      mockAIService.analyzeIntent.mockResolvedValue({
        intent: 'consistency_test',
        confidence: 0.75,
        entities: {},
        sentiment: 'neutral',
      });

      const analyzeResult = await intentAnalyzer.analyze(message, mockContext);

      // Reset mock call count
      jest.clearAllMocks();
      mockAIService.analyzeIntent.mockResolvedValue({
        intent: 'consistency_test',
        confidence: 0.75,
        entities: {},
        sentiment: 'neutral',
      });

      const enhancedResult = await intentAnalyzer.analyzeEnhanced(message, mockContext);

      expect(analyzeResult).toEqual(enhancedResult);
    });
  });
});
