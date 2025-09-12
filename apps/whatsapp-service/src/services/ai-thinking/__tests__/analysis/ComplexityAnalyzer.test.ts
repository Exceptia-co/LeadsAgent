import { ComplexityAnalyzer } from '../../analysis/ComplexityAnalyzer';
import { ComplexityAnalysis, IntentAnalysis } from '../../interfaces/types';
import DatabaseService from '../../../DatabaseService';
import { logger } from '../../../../utils/logger';

// Mock dependencies
jest.mock('../../../DatabaseService');
jest.mock('../../../../utils/logger');

describe('ComplexityAnalyzer', () => {
  let complexityAnalyzer: ComplexityAnalyzer;
  let mockDatabaseService: jest.Mocked<typeof DatabaseService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset singleton instance
    (ComplexityAnalyzer as any).instance = null;
    complexityAnalyzer = ComplexityAnalyzer.getInstance();

    // Setup DatabaseService mocks
    mockDatabaseService = DatabaseService as jest.Mocked<typeof DatabaseService>;
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance when called multiple times', () => {
      const instance1 = ComplexityAnalyzer.getInstance();
      const instance2 = ComplexityAnalyzer.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(ComplexityAnalyzer);
    });

    it('should not allow direct instantiation', () => {
      expect(() => new (ComplexityAnalyzer as any)()).toThrow();
    });
  });

  describe('analyze() - Simple Greetings', () => {
    it('should identify exact simple greetings with high confidence', () => {
      const greetings = ['hola', 'hi', 'buenas', 'hello', 'hey', 'saludos'];

      greetings.forEach(greeting => {
        const result = complexityAnalyzer.analyze(greeting);

        expect(result.complexity).toBe('simple_greeting');
        expect(result.confidence).toBe(0.95);
        expect(result.reasoning).toBe('Saludo exacto detectado');
      });
    });

    it('should identify simple greetings that start with greeting keywords', () => {
      const greetingVariations = ['hola que tal', 'buenas tardes', 'hello there', 'hi friend'];

      greetingVariations.forEach(greeting => {
        const result = complexityAnalyzer.analyze(greeting);

        expect(result.complexity).toBe('simple_greeting');
        expect(result.confidence).toBe(0.9);
        expect(result.reasoning).toBe('Saludo simple con pocas palabras');
      });
    });

    it('should not classify long messages as simple greetings', () => {
      const longMessage = 'hola, espero que estés bien, quería preguntarte sobre los precios';

      const result = complexityAnalyzer.analyze(longMessage);

      expect(result.complexity).not.toBe('simple_greeting');
    });

    it('should handle case insensitive greetings', () => {
      const casedGreetings = ['HOLA', 'Hi', 'BuEnAs', 'HeLLo'];

      casedGreetings.forEach(greeting => {
        const result = complexityAnalyzer.analyze(greeting);

        expect(result.complexity).toBe('simple_greeting');
        expect(result.confidence).toBe(0.95);
      });
    });
  });

  describe('analyze() - Specific Queries', () => {
    it('should identify price-related specific queries', () => {
      const priceQueries = [
        '¿cuánto cuesta?',
        'precio del servicio',
        'qué tarifa tienen',
        'costo del paquete premium',
      ];

      priceQueries.forEach(query => {
        const result = complexityAnalyzer.analyze(query);

        expect(result.complexity).toBe('specific_query');
        expect(result.confidence).toBeGreaterThanOrEqual(0.7);
        expect(result.reasoning).toContain('precio');
      });
    });

    it('should identify product-related specific queries', () => {
      const productQueries = [
        'información del servicio premium',
        'características del anuncio destacado',
        'qué incluye el plan vip',
      ];

      productQueries.forEach(query => {
        const result = complexityAnalyzer.analyze(query);

        expect(result.complexity).toBe('specific_query');
        expect(result.confidence).toBeGreaterThanOrEqual(0.7);
        expect(result.reasoning).toContain('producto');
      });
    });

    it('should identify registration-related specific queries', () => {
      const registrationQueries = [
        'cómo registrar una cuenta',
        'quiero darme de alta',
        'sign up process',
        'crear nueva cuenta',
      ];

      registrationQueries.forEach(query => {
        const result = complexityAnalyzer.analyze(query);

        expect(result.complexity).toBe('specific_query');
        expect(result.confidence).toBeGreaterThanOrEqual(0.7);
        expect(result.reasoning).toContain('registro');
      });
    });

    it('should identify technical-related specific queries', () => {
      const technicalQueries = [
        'tengo un error en la aplicación',
        'el sistema no funciona',
        'hay un problema con mi cuenta',
        'reportar un bug',
      ];

      technicalQueries.forEach(query => {
        const result = complexityAnalyzer.analyze(query);

        expect(result.complexity).toBe('specific_query');
        expect(result.confidence).toBeGreaterThanOrEqual(0.7);
        expect(result.reasoning).toContain('tecnico');
      });
    });

    it('should increase confidence with multiple specific keywords', () => {
      const multiKeywordQuery = 'cuánto cuesta el servicio premium vip';

      const result = complexityAnalyzer.analyze(multiKeywordQuery);

      expect(result.complexity).toBe('specific_query');
      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('analyze() - General Inquiries', () => {
    it('should identify questions with question words', () => {
      const questionWordQueries = [
        '¿qué servicios ofrecen?',
        '¿cómo puedo contactarlos?',
        '¿cuándo abren?',
        '¿dónde están ubicados?',
        '¿por qué no funciona?',
        '¿cuál es mejor?',
        '¿quién puede ayudarme?',
      ];

      questionWordQueries.forEach(query => {
        const result = complexityAnalyzer.analyze(query);

        expect(result.complexity).toBe('general_inquiry');
        expect(result.confidence).toBeGreaterThanOrEqual(0.6);
        expect(result.reasoning).toBe('Consulta general o pregunta abierta');
      });
    });

    it('should identify questions with question marks', () => {
      const questionMarkQueries = [
        'Están abiertos ahora?',
        'Puedo hacer una consulta?',
        'Me pueden ayudar?',
      ];

      questionMarkQueries.forEach(query => {
        const result = complexityAnalyzer.analyze(query);

        expect(result.complexity).toBe('general_inquiry');
        expect(result.confidence).toBeGreaterThanOrEqual(0.6);
      });
    });

    it('should identify long messages as general inquiries', () => {
      const longMessage =
        'Necesito información detallada sobre todos sus servicios disponibles actualmente';

      const result = complexityAnalyzer.analyze(longMessage);

      expect(result.complexity).toBe('general_inquiry');
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('should increase confidence for longer questions', () => {
      const shortQuestion = 'qué hacen?';
      const longQuestion = 'qué tipo de servicios ofrecen y cuáles son las mejores opciones?';

      const shortResult = complexityAnalyzer.analyze(shortQuestion);
      const longResult = complexityAnalyzer.analyze(longQuestion);

      expect(longResult.confidence).toBeGreaterThan(shortResult.confidence);
    });
  });

  describe('analyze() - Fallback Scenarios', () => {
    it('should handle unknown messages as general inquiries', () => {
      const unknownMessages = ['xyz123', 'mensaje random', 'test', 'abcdef'];

      unknownMessages.forEach(message => {
        const result = complexityAnalyzer.analyze(message);

        expect(result.complexity).toBe('general_inquiry');
        expect(result.confidence).toBe(0.5);
        expect(result.reasoning).toBe('Mensaje no categorizado, tratado como consulta general');
      });
    });

    it('should handle errors gracefully', () => {
      // Mock an error during analysis
      const originalSplit = String.prototype.split;
      String.prototype.split = jest.fn(() => {
        throw new Error('Test error');
      });

      const result = complexityAnalyzer.analyze('test message');

      expect(result.complexity).toBe('general_inquiry');
      expect(result.confidence).toBe(0.3);
      expect(result.reasoning).toBe('Error en análisis, usando fallback');
      expect(logger.error).toHaveBeenCalled();

      // Restore original method
      String.prototype.split = originalSplit;
    });
  });

  describe('isGreetingMessage()', () => {
    it('should identify greetings using database configuration', async () => {
      mockDatabaseService.getAIConfiguration.mockResolvedValue('hola,hi,buenas,hello');

      const isGreeting = await complexityAnalyzer.isGreetingMessage('hola');

      expect(isGreeting).toBe(true);
      expect(mockDatabaseService.getAIConfiguration).toHaveBeenCalledWith('greeting_keywords');
    });

    it('should use fallback keywords when database config is not available', async () => {
      mockDatabaseService.getAIConfiguration.mockResolvedValue(null);

      const isGreeting = await complexityAnalyzer.isGreetingMessage('hola');

      expect(isGreeting).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      mockDatabaseService.getAIConfiguration.mockRejectedValue(new Error('DB Error'));

      const isGreeting = await complexityAnalyzer.isGreetingMessage('hola');

      expect(isGreeting).toBe(true);
      expect(logger.error).toHaveBeenCalledWith(
        'Error checking greeting message:',
        expect.any(Error)
      );
    });

    it('should return false for non-greeting messages', async () => {
      mockDatabaseService.getAIConfiguration.mockResolvedValue('hola,hi,buenas,hello');

      const isGreeting = await complexityAnalyzer.isGreetingMessage('cuánto cuesta el servicio');

      expect(isGreeting).toBe(false);
    });
  });

  describe('checkGreetingKeywords()', () => {
    const greetingKeywords = ['hola', 'hi', 'buenas', 'hello'];

    it('should identify exact greeting matches', () => {
      greetingKeywords.forEach(keyword => {
        const result = complexityAnalyzer.checkGreetingKeywords(keyword, greetingKeywords);
        expect(result).toBe(true);
      });
    });

    it('should identify greetings that start with keywords in short messages', () => {
      const shortGreetings = ['hola amigo', 'buenas tardes', 'hello there'];

      shortGreetings.forEach(greeting => {
        const result = complexityAnalyzer.checkGreetingKeywords(greeting, greetingKeywords);
        expect(result).toBe(true);
      });
    });

    it('should be strict with longer messages', () => {
      const longMessage = 'hola, necesito información sobre sus servicios y precios';

      const result = complexityAnalyzer.checkGreetingKeywords(longMessage, greetingKeywords);

      expect(result).toBe(false);
    });

    it('should handle case insensitivity', () => {
      const casedGreetings = ['HOLA', 'Hi', 'BuEnAs'];

      casedGreetings.forEach(greeting => {
        const result = complexityAnalyzer.checkGreetingKeywords(greeting, greetingKeywords);
        expect(result).toBe(true);
      });
    });

    it('should identify greetings in messages with up to 3 words', () => {
      const shortMessages = ['hola amigo', 'buenos días'];

      shortMessages.forEach(message => {
        const result = complexityAnalyzer.checkGreetingKeywords(message, greetingKeywords);
        expect(result).toBe(true);
      });
    });
  });

  describe('analyzePatterns()', () => {
    it('should identify question patterns correctly', () => {
      const questionMessage = '¿Cómo puedo registrarme?';

      const patterns = complexityAnalyzer.analyzePatterns(questionMessage);

      expect(patterns.hasQuestions).toBe(true);
      expect(patterns.wordCount).toBeGreaterThan(0);
      expect(patterns.sentenceCount).toBeGreaterThan(0);
    });

    it('should identify urgency markers', () => {
      const urgentMessage = 'Necesito ayuda urgente ahora mismo';

      const patterns = complexityAnalyzer.analyzePatterns(urgentMessage);

      expect(patterns.hasUrgencyMarkers).toBe(true);
    });

    it('should identify commercial terms', () => {
      const commercialMessage = 'Cuánto cuesta el paquete premium';

      const patterns = complexityAnalyzer.analyzePatterns(commercialMessage);

      expect(patterns.hasCommercialTerms).toBe(true);
    });

    it('should identify technical terms', () => {
      const technicalMessage = 'Tengo un error en la aplicación';

      const patterns = complexityAnalyzer.analyzePatterns(technicalMessage);

      expect(patterns.hasTechnicalTerms).toBe(true);
    });

    it('should count words and sentences accurately', () => {
      const message = 'Esta es una oración. Esta es otra oración!';

      const patterns = complexityAnalyzer.analyzePatterns(message);

      expect(patterns.wordCount).toBe(8);
      expect(patterns.sentenceCount).toBe(2);
    });
  });

  describe('getDetailedMetrics()', () => {
    it('should provide comprehensive analysis metrics', () => {
      const message = 'Hola! ¿Cuánto cuesta el servicio? 😊';

      const metrics = complexityAnalyzer.getDetailedMetrics(message);

      expect(metrics).toMatchObject({
        complexity: expect.stringMatching(/simple_greeting|specific_query|general_inquiry/),
        confidence: expect.any(Number),
        reasoning: expect.any(String),
        patterns: expect.objectContaining({
          hasQuestions: expect.any(Boolean),
          hasUrgencyMarkers: expect.any(Boolean),
          hasCommercialTerms: expect.any(Boolean),
          hasTechnicalTerms: expect.any(Boolean),
          wordCount: expect.any(Number),
          sentenceCount: expect.any(Number),
        }),
        messageLength: expect.any(Number),
        normalizedLength: expect.any(Number),
        hasSpecialChars: expect.any(Boolean),
        hasNumbers: expect.any(Boolean),
        hasEmojis: expect.any(Boolean),
      });
    });

    it('should detect special characters correctly', () => {
      const messageWithSpecialChars = 'Hello! @user, check this: #hashtag';

      const metrics = complexityAnalyzer.getDetailedMetrics(messageWithSpecialChars);

      expect(metrics.hasSpecialChars).toBe(true);
    });

    it('should detect numbers correctly', () => {
      const messageWithNumbers = 'Necesito 3 servicios para el día 15';

      const metrics = complexityAnalyzer.getDetailedMetrics(messageWithNumbers);

      expect(metrics.hasNumbers).toBe(true);
    });

    it('should detect emojis correctly', () => {
      const messageWithEmojis = 'Hola! Todo bien? 😊👍';

      const metrics = complexityAnalyzer.getDetailedMetrics(messageWithEmojis);

      expect(metrics.hasEmojis).toBe(true);
    });

    it('should handle messages without special features', () => {
      const simpleMessage = 'mensaje simple';

      const metrics = complexityAnalyzer.getDetailedMetrics(simpleMessage);

      expect(metrics.hasSpecialChars).toBe(false);
      expect(metrics.hasNumbers).toBe(false);
      expect(metrics.hasEmojis).toBe(false);
    });
  });

  describe('Edge Cases and Performance', () => {
    it('should handle empty strings', () => {
      const result = complexityAnalyzer.analyze('');

      expect(result.complexity).toBe('general_inquiry');
      expect(result.confidence).toBe(0.5);
    });

    it('should handle whitespace-only strings', () => {
      const result = complexityAnalyzer.analyze('   \n\t   ');

      expect(result.complexity).toBe('general_inquiry');
      expect(result.confidence).toBe(0.5);
    });

    it('should handle very long messages efficiently', () => {
      const longMessage = 'palabra '.repeat(1000);

      const start = Date.now();
      const result = complexityAnalyzer.analyze(longMessage);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Should complete within 100ms
      expect(result.complexity).toBe('general_inquiry');
    });

    it('should handle special unicode characters', () => {
      const unicodeMessage = 'Hola 🌟 ñáéíóú çñ ß α β γ';

      const result = complexityAnalyzer.analyze(unicodeMessage);

      expect(result).toBeDefined();
      expect(result.complexity).toMatch(/simple_greeting|specific_query|general_inquiry/);
    });

    it('should be consistent across multiple calls', () => {
      const message = '¿Cuánto cuesta el servicio premium?';

      const results = Array(10)
        .fill(null)
        .map(() => complexityAnalyzer.analyze(message));

      // All results should be identical
      const firstResult = results[0];
      results.forEach(result => {
        expect(result).toEqual(firstResult);
      });
    });
  });

  describe('Intent Analysis Integration', () => {
    it('should accept optional intent analysis parameter', () => {
      const intentAnalysis: IntentAnalysis = {
        intent: 'pricing_inquiry',
        confidence: 0.8,
        entities: { product: 'premium' },
        sentiment: 'neutral',
        urgency: 'medium',
        category: 'commercial',
        subcategory: 'pricing',
      };

      const result = complexityAnalyzer.analyze('cuánto cuesta', intentAnalysis);

      expect(result).toBeDefined();
      expect(result.complexity).toBe('specific_query');
    });

    it('should work without intent analysis parameter', () => {
      const result = complexityAnalyzer.analyze('cuánto cuesta');

      expect(result).toBeDefined();
      expect(result.complexity).toBe('specific_query');
    });
  });
});
