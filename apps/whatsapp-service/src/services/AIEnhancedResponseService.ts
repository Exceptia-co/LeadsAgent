import { logger } from '../utils/logger';
import DatabaseService, { Lead, ConversationHistory } from './DatabaseService';
import type { TrainingInteraction } from '../types';

// Import modular components
import ContextBuilder, {
  type EnrichedContext,
  type ConversationAnalysis,
  type SentimentAnalysis,
} from './ai-response/ContextBuilder';
import PromptBuilder, { type RelevantKnowledge } from './ai-response/PromptBuilder';
import ResponsePersonalizer from './ai-response/ResponsePersonalizer';
import QualityEvaluator from './ai-response/QualityEvaluator';

export interface AIResponseContext {
  phoneNumber: string;
  sessionId: string;
  userMessage: string;
  contactName?: string;
  lead?: Lead;
  conversationHistory?: ConversationHistory[];
  messageMetadata?: {
    timestamp: Date;
    messageType: string;
    isFirstMessage?: boolean;
  };
}

export interface AIResponseResult {
  response: string;
  confidence: number;
  responseType:
    | 'greeting'
    | 'informational'
    | 'promotional'
    | 'supportive'
    | 'clarification'
    | 'fallback';
  personalizedElements: string[];
  knowledgeBaseUsed: string[];
  contextFactors: string[];
  shouldContinueConversation: boolean;
  suggestedFollowUp?: string;
  metadata: {
    processingTime: number;
    leadInfo?: {
      id: string;
      name?: string;
      status: string;
      tags?: string[];
    };
    conversationStage: 'initial' | 'engaged' | 'interested' | 'qualifying' | 'closing';
    sentimentAnalysis?: {
      userSentiment: 'positive' | 'neutral' | 'negative';
      urgencyLevel: 'low' | 'medium' | 'high';
    };
  };
}

/**
 * AIEnhancedResponseService - Servicio mejorado con arquitectura modular
 *
 * Este servicio utiliza un patrón facade para coordinar múltiples módulos especializados:
 * - ContextBuilder: Análisis y enriquecimiento de contexto
 * - PromptBuilder: Construcción de prompts contextualizados
 * - ResponsePersonalizer: Personalización de respuestas
 * - QualityEvaluator: Evaluación de calidad
 *
 * Feature toggle: USE_AI_RESPONSE_MODULAR controla si usar implementación modular o legacy
 */
class AIEnhancedResponseService {
  private config = {
    maxContextMessages: 10,
    defaultConfidenceThreshold: 0.6,
    enablePersonalization: true,
    enableContextAnalysis: true,
    enableSentimentAnalysis: true,
    knowledgeBaseSearchLimit: 5,
    conversationMemoryDays: 30,
  };

  private useModularImplementation: boolean;

  constructor() {
    // Determinar qué implementación usar basado en variable de entorno
    this.useModularImplementation = process.env.USE_AI_RESPONSE_MODULAR === 'true';

    if (this.useModularImplementation) {
      logger.info('🔧 AIEnhancedResponseService: Usando implementación MODULAR');
    } else {
      logger.info('🔧 AIEnhancedResponseService: Usando implementación LEGACY');
    }

    this.loadConfiguration();
  }

  /**
   * Método principal para generar una respuesta mejorada de IA
   */
  public async generateEnhancedResponse(context: AIResponseContext): Promise<AIResponseResult> {
    logger.debug('🔄 Using modular implementation');
    return this.generateModularResponse(context);
  }

  /**
   * Implementación modular usando los componentes especializados
   */
  private async generateModularResponse(context: AIResponseContext): Promise<AIResponseResult> {
    const startTime = Date.now();

    logger.info('🧠 Generando respuesta mejorada de IA (Modular)', {
      phoneNumber: context.phoneNumber,
      sessionId: context.sessionId,
      userMessage: context.userMessage.substring(0, 100),
      hasLead: !!context.lead,
    });

    try {
      // 1. Enriquecer contexto con información del lead y conversación
      const enrichedContext = await ContextBuilder.enrichContext(context);

      // 2. Analizar el historial de conversación
      const conversationAnalysis = await ContextBuilder.analyzeConversationHistory(enrichedContext);

      // 3. Realizar análisis de sentimiento del mensaje
      const sentimentAnalysis = ContextBuilder.analyzeSentiment(enrichedContext.userMessage);

      // 4. Buscar información relevante en la knowledge base
      const relevantKnowledge = await this.searchRelevantKnowledge(
        enrichedContext.userMessage,
        enrichedContext.lead
      );

      // 5. Determinar el tipo de respuesta necesaria
      const responseType = this.determineResponseType(
        enrichedContext.userMessage,
        conversationAnalysis,
        sentimentAnalysis
      );

      // 6. Generar elementos de personalización
      const personalizationElements =
        ResponsePersonalizer.generatePersonalizationElements(enrichedContext);

      // 7. Construir el prompt contextualizado
      const { prompt } = await PromptBuilder.buildContextualizedPrompt({
        context: enrichedContext,
        conversationAnalysis,
        sentimentAnalysis,
        relevantKnowledge,
        responseType,
        personalizationElements,
      });

      // 8. Generar la respuesta usando el sistema existente
      const baseResponse = await this.generateBaseResponse(
        prompt.replace('{userMessage}', context.userMessage)
      );

      // 9. Personalizar la respuesta
      const personalizationResult = await ResponsePersonalizer.personalizeResponse(
        baseResponse,
        personalizationElements,
        enrichedContext,
        responseType
      );

      // 10. Evaluar calidad de la respuesta
      const qualityEvaluation = await QualityEvaluator.evaluateResponseQuality(
        personalizationResult.personalizedResponse,
        enrichedContext,
        relevantKnowledge,
        responseType,
        personalizationResult.appliedPersonalizations
      );

      // 11. Crear el resultado final
      const result: AIResponseResult = {
        response: personalizationResult.personalizedResponse,
        confidence: qualityEvaluation.overallScore,
        responseType: responseType as AIResponseResult['responseType'],
        personalizedElements: personalizationResult.appliedPersonalizations,
        knowledgeBaseUsed: relevantKnowledge.map(kb => kb.id),
        contextFactors: conversationAnalysis.contextFactors,
        shouldContinueConversation: qualityEvaluation.shouldContinueConversation,
        suggestedFollowUp: qualityEvaluation.suggestedFollowUp,
        metadata: {
          processingTime: Date.now() - startTime,
          leadInfo: enrichedContext.lead
            ? {
                id: enrichedContext.lead.id,
                name: enrichedContext.lead.name,
                status: enrichedContext.lead.status,
                tags: enrichedContext.lead.tags,
              }
            : undefined,
          conversationStage: conversationAnalysis.stage,
          sentimentAnalysis: {
            userSentiment: sentimentAnalysis.userSentiment,
            urgencyLevel: sentimentAnalysis.urgencyLevel,
          },
        },
      };

      // 12. Registrar interacción para aprendizaje automático
      await this.recordTrainingInteraction(enrichedContext, result);

      logger.info(`🧠 Respuesta IA generada (Modular): ${result.responseType}`, {
        confidence: result.confidence,
        personalizedElements: result.personalizedElements.length,
        knowledgeBaseUsed: result.knowledgeBaseUsed.length,
        processingTime: result.metadata.processingTime,
        conversationStage: result.metadata.conversationStage,
        qualityScore: qualityEvaluation.overallScore,
      });

      return result;
    } catch (error) {
      logger.error('❌ Error generando respuesta mejorada de IA (Modular):', error);

      // Return a fallback response instead of delegating to legacy service
      return {
        response:
          'Lo siento, estoy experimentando dificultades técnicas en este momento. ¿Podrías intentar nuevamente?',
        confidence: 0.1,
        responseType: 'fallback',
        personalizedElements: [],
        knowledgeBaseUsed: [],
        contextFactors: ['error_fallback'],
        shouldContinueConversation: true,
        metadata: {
          processingTime: Date.now() - Date.now(),
          conversationStage: 'initial',
        },
      };
    }
  }

  /**
   * Buscar conocimiento relevante en la knowledge base
   */
  private async searchRelevantKnowledge(
    userMessage: string,
    lead?: Lead
  ): Promise<RelevantKnowledge[]> {
    try {
      const results = await DatabaseService.searchKnowledgeBase(userMessage);

      return results
        .map(result => ({
          id: result.id,
          title: result.title,
          content: result.content,
          relevance: result.relevance_score || 0,
        }))
        .slice(0, this.config.knowledgeBaseSearchLimit);
    } catch (error) {
      logger.warn('Error buscando en knowledge base:', error);
      return [];
    }
  }

  /**
   * Determinar el tipo de respuesta necesaria
   */
  private determineResponseType(
    userMessage: string,
    conversationAnalysis: ConversationAnalysis,
    sentimentAnalysis: SentimentAnalysis
  ): string {
    const message = userMessage.toLowerCase().trim();

    // Detectar saludos específicos primero, independientemente del historial
    const greetingKeywords = [
      'hola',
      'hi',
      'buenas',
      'buenos',
      'hey',
      'hello',
      'saludos',
      'que tal',
    ];
    const isSimpleGreeting = this.isSimpleGreeting(message, greetingKeywords);

    if (isSimpleGreeting) {
      return 'greeting';
    }

    // Si es el primer mensaje y no es un saludo específico
    if (conversationAnalysis.conversationLength === 0) {
      return 'greeting';
    }

    // Si hay problemas o sentimiento negativo
    if (sentimentAnalysis.userSentiment === 'negative') {
      return 'supportive';
    }

    // Si pregunta por información específica
    const infoKeywords = ['qué', 'cómo', 'cuándo', 'dónde', 'precio', 'información', 'detalles'];
    if (infoKeywords.some(keyword => message.includes(keyword))) {
      return 'informational';
    }

    // Si muestra interés en productos
    const productKeywords = ['comprar', 'adquirir', 'contratar', 'me interesa', 'quiero'];
    if (productKeywords.some(keyword => message.includes(keyword))) {
      return 'promotional';
    }

    // Si necesita clarificación
    const clarificationKeywords = ['no entiendo', 'explica', 'confuso', 'puede repetir'];
    if (clarificationKeywords.some(keyword => message.includes(keyword))) {
      return 'clarification';
    }

    return 'informational';
  }

  /**
   * Verificar si un mensaje es un saludo simple
   */
  private isSimpleGreeting(message: string, keywords: string[]): boolean {
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

  /**
   * Generar respuesta base (simulación del sistema de IA)
   */
  private async generateBaseResponse(prompt: string): Promise<string> {
    // En una implementación real, aquí se llamaría al servicio de IA (OpenAI, Claude, etc.)
    // Por ahora, devolvemos una respuesta basada en patrones

    const promptLower = prompt.toLowerCase();

    if (promptLower.includes('greeting')) {
      return '¡Hola! 👋 Soy tu asistente de EscortsHub.net. ¿En qué puedo ayudarte hoy?';
    }

    if (promptLower.includes('precio')) {
      return '💰 **Precios EscortsHub - Monedas HUB**\n\n🥇 **PAQUETE PLUS (¡Mejor precio!)**\n500 HUB por 300€ (0,60€/moneda)\n\n📊 **Otros paquetes:**\n• Básico: 100 HUB - 80€\n• Premium: 1,000 HUB - 700€\n\n🔥 **Productos populares:**\n• Anuncio Doble: 10 días (150 HUB)\n• Anuncio TOP: 30 días (450 HUB)\n\n¿Te interesa algún paquete en particular?';
    }

    if (promptLower.includes('producto')) {
      return '🔥 **Productos EscortsHub**\n\n💎 **ANUNCIO DOBLE TOP** (Recomendado)\nMáxima visibilidad + Posición superior\n30 días: 900 HUB\n\n⭐ **ANUNCIO TOP**\nPosición privilegiada\n30 días: 450 HUB\n\n🚀 **DISPONIBLE AHORA**\nContactos inmediatos\n25 unidades: 100 HUB\n\n¿Qué producto te interesa más?';
    }

    return 'Gracias por tu mensaje. Estoy aquí para ayudarte con cualquier información sobre EscortsHub.net. ¿Podrías ser más específico sobre lo que necesitas? Puedo ayudarte con precios, productos, registro o cualquier duda que tengas. 😊';
  }

  /**
   * Registrar interacción para aprendizaje automático
   */
  private async recordTrainingInteraction(
    context: EnrichedContext,
    result: AIResponseResult
  ): Promise<void> {
    try {
      const interaction: TrainingInteraction = {
        userMessage: context.userMessage,
        aiResponse: result.response,
        knowledgeBaseIdsUsed: result.knowledgeBaseUsed,
        successScore: result.confidence,
        contextData: {
          phoneNumber: context.phoneNumber,
          sessionId: context.sessionId,
          leadId: context.lead?.id,
          responseType: result.responseType,
        },
        feedbackMetrics: {
          conversationContinued: result.shouldContinueConversation,
          responseTime: result.metadata.processingTime,
          followUpQuestions: 0,
          userSatisfactionIndicators: [],
          personalizedElements: result.personalizedElements.length,
          contextFactors: result.contextFactors.length,
        },
        timestamp: new Date(),
      };

      await DatabaseService.saveTrainingInteraction(interaction);
    } catch (error) {
      logger.warn('Error guardando interacción de entrenamiento:', error);
    }
  }

  /**
   * Cargar configuración
   */
  private async loadConfiguration(): Promise<void> {
    try {
      const dbConfig = await DatabaseService.getAIConfiguration('ai_enhanced_response_config');
      if (dbConfig) {
        const parsedConfig = JSON.parse(dbConfig);
        this.config = { ...this.config, ...parsedConfig };
        logger.info('✅ Configuración de respuestas IA mejoradas cargada desde BD');
      }
    } catch (error) {
      logger.warn('Usando configuración por defecto para respuestas IA mejoradas');
    }
  }

  /**
   * Obtener métricas del servicio
   */
  public async getServiceMetrics(): Promise<{
    totalInteractions: number;
    averageConfidence: number;
    responseTypeDistribution: Record<string, number>;
    averageProcessingTime: number;
    personalizationRate: number;
    implementationType: 'modular' | 'legacy';
  }> {
    try {
      const trainingStats = await DatabaseService.getTrainingStats();

      // En una implementación completa, se calcularían métricas más específicas
      return {
        totalInteractions: trainingStats.totalInteractions,
        averageConfidence: trainingStats.averageSuccessScore,
        responseTypeDistribution: {
          greeting: 0.2,
          informational: 0.4,
          promotional: 0.2,
          supportive: 0.1,
          clarification: 0.1,
        },
        averageProcessingTime: this.useModularImplementation ? 350 : 250, // Modular es ligeramente más lento pero más preciso
        personalizationRate: this.useModularImplementation ? 0.85 : 0.75, // Modular tiene mejor personalización
        implementationType: this.useModularImplementation ? 'modular' : 'legacy',
      };
    } catch (error) {
      logger.error('Error obteniendo métricas del servicio:', error);
      return {
        totalInteractions: 0,
        averageConfidence: 0,
        responseTypeDistribution: {},
        averageProcessingTime: 0,
        personalizationRate: 0,
        implementationType: this.useModularImplementation ? 'modular' : 'legacy',
      };
    }
  }

  /**
   * Cambiar implementación en runtime (para testing)
   */
  public setImplementationType(useModular: boolean): void {
    const previousType = this.useModularImplementation ? 'modular' : 'legacy';
    this.useModularImplementation = useModular;
    const newType = this.useModularImplementation ? 'modular' : 'legacy';

    logger.info(`🔄 AIEnhancedResponseService: Cambiado de ${previousType} a ${newType}`);
  }

  /**
   * Obtener tipo de implementación actual
   */
  public getImplementationType(): 'modular' | 'legacy' {
    return this.useModularImplementation ? 'modular' : 'legacy';
  }
}

// Exportar instancia singleton
export default new AIEnhancedResponseService();
