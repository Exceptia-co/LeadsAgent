import { logger } from '../../../utils/logger';
import type { IComplexityAnalyzer } from '../interfaces/IAnalyzer';
import type { ComplexityAnalysis, IntentAnalysis } from '../interfaces/types';
import DatabaseService from '../../DatabaseService';

export class ComplexityAnalyzer implements IComplexityAnalyzer {
  private static instance: ComplexityAnalyzer;

  private constructor() {}

  public static getInstance(): ComplexityAnalyzer {
    if (!ComplexityAnalyzer.instance) {
      ComplexityAnalyzer.instance = new ComplexityAnalyzer();
    }
    return ComplexityAnalyzer.instance;
  }

  public analyze(message: string, _intentAnalysis?: IntentAnalysis): ComplexityAnalysis {
    try {
      const normalizedMessage = message.toLowerCase().trim();
      const wordCount = normalizedMessage.split(/\s+/).length;
      const messageLength = normalizedMessage.length;

      // 1. SALUDOS SIMPLES (mayor prioridad)
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
          reasoning: 'Saludo exacto detectado',
        };
      }

      if (startsWithGreeting && wordCount <= 3 && messageLength <= 20) {
        return {
          complexity: 'simple_greeting',
          confidence: 0.9,
          reasoning: 'Saludo simple con pocas palabras',
        };
      }

      // 2. CONSULTAS ESPECÍFICAS (productos, precios, servicios)
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
          reasoning: `Consulta específica sobre ${matchedCategory} detectada`,
        };
      }

      // 3. CONSULTAS GENERALES (preguntas abiertas, información general)
      const questionWords = ['qué', 'cómo', 'cuándo', 'dónde', 'por qué', 'cuál', 'quién'];
      const hasQuestionWords = questionWords.some(word => normalizedMessage.includes(word));
      const hasQuestionMark = message.includes('?');

      if (hasQuestionWords || hasQuestionMark || wordCount > 5) {
        return {
          complexity: 'general_inquiry',
          confidence: 0.6 + (wordCount > 10 ? 0.2 : 0),
          reasoning: 'Consulta general o pregunta abierta',
        };
      }

      // 4. FALLBACK - Si no encaja en las categorías anteriores
      return {
        complexity: 'general_inquiry',
        confidence: 0.5,
        reasoning: 'Mensaje no categorizado, tratado como consulta general',
      };
    } catch (error) {
      logger.error('Error determinando complejidad del mensaje:', error);
      return {
        complexity: 'general_inquiry',
        confidence: 0.3,
        reasoning: 'Error en análisis, usando fallback',
      };
    }
  }

  public async isGreetingMessage(message: string): Promise<boolean> {
    try {
      // Obtener keywords de saludo desde configuración
      const greetingKeywords = await DatabaseService.getAIConfiguration('greeting_keywords');
      if (!greetingKeywords) {
        // Fallback keywords si no hay configuración
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
      // Fallback básico
      return ['hola', 'hi', 'buenas', 'buenos'].some(keyword =>
        message.toLowerCase().trim().includes(keyword)
      );
    }
  }

  public checkGreetingKeywords(message: string, keywords: string[]): boolean {
    const normalizedMessage = message.toLowerCase().trim();

    // Verificar si el mensaje completo es exactamente un saludo
    if (keywords.some(keyword => normalizedMessage === keyword)) {
      return true;
    }

    // Verificar si el mensaje empieza con un saludo y es corto (menos de 20 caracteres)
    if (normalizedMessage.length <= 20) {
      return keywords.some(keyword => normalizedMessage.startsWith(keyword));
    }

    // Para mensajes más largos, ser más estricto
    const words = normalizedMessage.split(/\s+/);
    if (words.length <= 3) {
      // Solo hasta 3 palabras
      return keywords.some(keyword => words.includes(keyword));
    }

    return false;
  }

  // Método para analizar la complejidad basada en patrones específicos
  public analyzePatterns(message: string): {
    hasQuestions: boolean;
    hasUrgencyMarkers: boolean;
    hasCommercialTerms: boolean;
    hasTechnicalTerms: boolean;
    wordCount: number;
    sentenceCount: number;
  } {
    const normalizedMessage = message.toLowerCase().trim();

    return {
      hasQuestions: this.hasQuestionPatterns(normalizedMessage),
      hasUrgencyMarkers: this.hasUrgencyPatterns(normalizedMessage),
      hasCommercialTerms: this.hasCommercialPatterns(normalizedMessage),
      hasTechnicalTerms: this.hasTechnicalPatterns(normalizedMessage),
      wordCount: normalizedMessage.split(/\s+/).length,
      sentenceCount: message.split(/[.!?]+/).filter(s => s.trim().length > 0).length,
    };
  }

  private hasQuestionPatterns(message: string): boolean {
    const questionWords = ['qué', 'cómo', 'cuándo', 'dónde', 'por qué', 'cuál', 'quién', 'cuánto'];
    return questionWords.some(word => message.includes(word)) || message.includes('?');
  }

  private hasUrgencyPatterns(message: string): boolean {
    const urgencyMarkers = ['urgente', 'ya', 'inmediato', 'ahora', 'rápido', 'prisa', 'emergency'];
    return urgencyMarkers.some(marker => message.includes(marker));
  }

  private hasCommercialPatterns(message: string): boolean {
    const commercialTerms = ['precio', 'coste', 'cuesta', 'comprar', 'pagar', 'tarifa', 'paquete'];
    return commercialTerms.some(term => message.includes(term));
  }

  private hasTechnicalPatterns(message: string): boolean {
    const technicalTerms = ['error', 'problema', 'bug', 'fallo', 'no funciona', 'issue'];
    return technicalTerms.some(term => message.includes(term));
  }

  // Método para obtener métricas detalladas
  public getDetailedMetrics(message: string): Record<string, any> {
    const analysis = this.analyze(message);
    const patterns = this.analyzePatterns(message);

    return {
      complexity: analysis.complexity,
      confidence: analysis.confidence,
      reasoning: analysis.reasoning,
      patterns,
      messageLength: message.length,
      normalizedLength: message.toLowerCase().trim().length,
      hasSpecialChars: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(message),
      hasNumbers: /\d/.test(message),
      hasEmojis: /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]/gu.test(
        message
      ),
    };
  }
}
