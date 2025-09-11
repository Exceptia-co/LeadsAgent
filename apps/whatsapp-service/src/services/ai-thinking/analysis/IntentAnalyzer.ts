import { logger } from '../../../utils/logger';
import { IIntentAnalyzer } from '../interfaces/IAnalyzer';
import { IntentAnalysis, EnrichedContext, ComplexityAnalysis } from '../interfaces/types';
import { IntentAnalysisError } from '../errors/ThinkingServiceErrors';
import AIService from '../../AIService';

export class IntentAnalyzer implements IIntentAnalyzer {
  private static instance: IntentAnalyzer;

  private constructor() {}

  public static getInstance(): IntentAnalyzer {
    if (!IntentAnalyzer.instance) {
      IntentAnalyzer.instance = new IntentAnalyzer();
    }
    return IntentAnalyzer.instance;
  }

  public async analyze(message: string, context: EnrichedContext): Promise<IntentAnalysis> {
    return this.analyzeEnhanced(message, context);
  }

  public async analyzeEnhanced(message: string, context: EnrichedContext): Promise<IntentAnalysis> {
    try {
      // 1. ANÁLISIS DE COMPLEJIDAD DEL MENSAJE
      const complexityAnalysis = this.getMessageComplexity(message);

      // 2. Para saludos simples, usar análisis simplificado y optimizado
      if (complexityAnalysis.complexity === 'simple_greeting') {
        return {
          intent: 'saludo',
          confidence: complexityAnalysis.confidence,
          entities: {},
          sentiment: 'positive',
          urgency: 'low',
          category: 'social',
          subcategory: 'simple_greeting',
        };
      }

      // 3. Para otros casos, usar análisis completo de AIService
      const baseAnalysis = await AIService.analyzeIntent(message);

      // 4. Mejorar el análisis with contexto adicional y complejidad
      const enhanced: IntentAnalysis = {
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

      // 5. Ajustar confianza basado en contexto y complejidad
      if (context.messageHistory.length > 0) {
        enhanced.confidence = Math.min(enhanced.confidence + 0.1, 1.0);
      }

      // Para consultas específicas, aumentar confianza
      if (complexityAnalysis.complexity === 'specific_query') {
        enhanced.confidence = Math.min(enhanced.confidence + 0.15, 0.95);
      }

      // Log del análisis de complejidad para debugging
      logger.debug('Intent analysis completed:', {
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

      throw new IntentAnalysisError('Failed to analyze intent', {
        message: message.substring(0, 100),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

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

  private getSubcategory(message: string, intent: string): string | undefined {
    // Implementar lógica más específica según necesidades
    if (intent === 'consulta_precio' || intent === 'pricing_inquiry') {
      if (message.toLowerCase().includes('paquete')) return 'packages';
      if (message.toLowerCase().includes('descuento')) return 'discounts';
    }

    return undefined;
  }

  private getMessageComplexity(message: string): ComplexityAnalysis {
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

  // Método público para fallback analysis
  public getFallbackAnalysis(): IntentAnalysis {
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
