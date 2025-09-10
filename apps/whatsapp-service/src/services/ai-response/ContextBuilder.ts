import { logger } from '../../utils/logger';
import DatabaseService, { Lead, ConversationHistory } from '../DatabaseService';
import type { AIResponseContext } from '../AIEnhancedResponseService';

export interface EnrichedContext extends AIResponseContext {
  enrichmentMetadata: {
    dataSourcesUsed: string[];
    enrichmentTime: number;
    confidenceLevel: number;
    missingData: string[];
  };
}

export interface ConversationAnalysis {
  stage: 'initial' | 'engaged' | 'interested' | 'qualifying' | 'closing';
  contextFactors: string[];
  previousTopics: string[];
  userEngagement: 'high' | 'medium' | 'low';
  conversationLength: number;
  patterns: {
    averageMessageLength: number;
    timeGaps: number[];
    topicSwitches: number;
  };
}

export interface SentimentAnalysis {
  userSentiment: 'positive' | 'neutral' | 'negative';
  urgencyLevel: 'low' | 'medium' | 'high';
  emotionalIndicators: string[];
  confidenceScore: number;
}

/**
 * ContextBuilder - Módulo especializado en análisis y enriquecimiento de contexto
 *
 * Responsabilidades:
 * - Enriquecer el contexto básico con información del lead y conversación
 * - Analizar el historial de conversación para determinar patrones
 * - Realizar análisis de sentimiento del mensaje del usuario
 * - Generar métricas de engagement y comportamiento
 */
export class ContextBuilder {
  private config = {
    maxContextMessages: 10,
    conversationMemoryDays: 30,
    sentimentAnalysisEnabled: true,
    engagementMetricsEnabled: true,
    topicAnalysisEnabled: true,
  };

  /**
   * Enriquecer el contexto básico con información adicional
   */
  public async enrichContext(context: AIResponseContext): Promise<EnrichedContext> {
    const startTime = Date.now();
    const dataSourcesUsed: string[] = [];
    const missingData: string[] = [];

    logger.debug('🔍 Enriqueciendo contexto para', {
      phoneNumber: context.phoneNumber,
      hasLead: !!context.lead,
      hasHistory: !!context.conversationHistory,
    });

    let enrichedContext: EnrichedContext = {
      ...context,
      enrichmentMetadata: {
        dataSourcesUsed: [],
        enrichmentTime: 0,
        confidenceLevel: 0,
        missingData: [],
      },
    };

    try {
      // 1. Enriquecer información del lead si no existe
      if (!enrichedContext.lead) {
        const lead = await this.fetchLeadData(context.phoneNumber);
        if (lead) {
          enrichedContext.lead = lead;
          enrichedContext.contactName = enrichedContext.contactName || lead.name || undefined;
          dataSourcesUsed.push('database-lead');
        } else {
          missingData.push('lead-information');
        }
      }

      // 2. Obtener historial de conversación si no está presente
      if (!enrichedContext.conversationHistory) {
        const history = await this.fetchConversationHistory(context.phoneNumber);
        enrichedContext.conversationHistory = history;
        dataSourcesUsed.push('conversation-history');

        if (history.length === 0) {
          missingData.push('conversation-history');
        }
      }

      // 3. Determinar metadatos del mensaje si no están completos
      enrichedContext = await this.enrichMessageMetadata(enrichedContext);
      dataSourcesUsed.push('message-metadata');

      // 4. Calcular nivel de confianza del enriquecimiento
      const confidenceLevel = this.calculateEnrichmentConfidence(enrichedContext, missingData);

      // 5. Actualizar metadatos del enriquecimiento
      enrichedContext.enrichmentMetadata = {
        dataSourcesUsed,
        enrichmentTime: Date.now() - startTime,
        confidenceLevel,
        missingData,
      };

      logger.debug('✅ Contexto enriquecido', {
        dataSourcesUsed: dataSourcesUsed.length,
        confidenceLevel,
        missingData: missingData.length,
        enrichmentTime: enrichedContext.enrichmentMetadata.enrichmentTime,
      });

      return enrichedContext;
    } catch (error) {
      logger.error('❌ Error enriqueciendo contexto:', error);

      // Devolver contexto parcialmente enriquecido con error marcado
      enrichedContext.enrichmentMetadata = {
        dataSourcesUsed,
        enrichmentTime: Date.now() - startTime,
        confidenceLevel: 0.3,
        missingData: [...missingData, 'enrichment-error'],
      };

      return enrichedContext;
    }
  }

  /**
   * Analizar el historial de conversación para extraer patrones
   */
  public async analyzeConversationHistory(context: EnrichedContext): Promise<ConversationAnalysis> {
    const history = context.conversationHistory || [];
    const conversationLength = history.length;

    logger.debug('📊 Analizando historial de conversación', {
      messageCount: conversationLength,
      phoneNumber: context.phoneNumber,
    });

    // 1. Analizar factores de contexto básicos
    const contextFactors = this.extractContextFactors(history, conversationLength);

    // 2. Extraer temas previamente discutidos
    const previousTopics = await this.extractDiscussedTopics(history);

    // 3. Determinar nivel de engagement
    const userEngagement = this.calculateUserEngagement(history, conversationLength);

    // 4. Determinar etapa de la conversación
    const stage = this.determineConversationStage(
      conversationLength,
      previousTopics,
      userEngagement
    );

    // 5. Analizar patrones de comportamiento
    const patterns = this.analyzeConversationPatterns(history);

    const analysis: ConversationAnalysis = {
      stage,
      contextFactors,
      previousTopics,
      userEngagement,
      conversationLength,
      patterns,
    };

    logger.debug('📊 Análisis de conversación completado', {
      stage,
      engagement: userEngagement,
      topicsCount: previousTopics.length,
      patternsDetected: Object.keys(patterns).length,
    });

    return analysis;
  }

  /**
   * Realizar análisis de sentimiento del mensaje del usuario
   */
  public analyzeSentiment(userMessage: string): SentimentAnalysis {
    if (!this.config.sentimentAnalysisEnabled) {
      return this.getDefaultSentiment();
    }

    const message = userMessage.toLowerCase().trim();
    const emotionalIndicators: string[] = [];

    // Definir vocabularios emocionales
    const positiveWords = [
      'gracias',
      'perfecto',
      'excelente',
      'genial',
      'bueno',
      'me gusta',
      'interesante',
      'fantástico',
      'bien',
      'sí',
      'ok',
      'vale',
      'magnifico',
      'increíble',
      'maravilloso',
      'estupendo',
      'fenomenal',
    ];

    const negativeWords = [
      'no',
      'malo',
      'terrible',
      'problema',
      'error',
      'difícil',
      'confuso',
      'caro',
      'costoso',
      'imposible',
      'molesto',
      'horrible',
      'pésimo',
      'decepcionante',
      'frustante',
    ];

    const urgentWords = [
      'urgente',
      'rápido',
      'inmediato',
      'ya',
      'ahora',
      'pronto',
      'necesito',
      'importante',
      'emergencia',
      'crítico',
      'prioritario',
    ];

    // Contar indicadores emocionales
    const positiveCount = this.countWordMatches(
      message,
      positiveWords,
      emotionalIndicators,
      'positive'
    );
    const negativeCount = this.countWordMatches(
      message,
      negativeWords,
      emotionalIndicators,
      'negative'
    );
    const urgentCount = this.countWordMatches(message, urgentWords, emotionalIndicators, 'urgent');

    // Determinar sentimiento principal
    let userSentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
    if (positiveCount > negativeCount && positiveCount > 0) {
      userSentiment = 'positive';
    } else if (negativeCount > positiveCount && negativeCount > 0) {
      userSentiment = 'negative';
    }

    // Determinar nivel de urgencia
    let urgencyLevel: 'low' | 'medium' | 'high' = 'low';
    if (urgentCount > 2) {
      urgencyLevel = 'high';
    } else if (urgentCount > 0) {
      urgencyLevel = 'medium';
    }

    // Calcular confianza del análisis
    const totalWords = message.split(/\s+/).length;
    const indicatorRatio = (positiveCount + negativeCount + urgentCount) / Math.max(totalWords, 1);
    const confidenceScore = Math.min(0.3 + indicatorRatio * 0.7, 1.0);

    return {
      userSentiment,
      urgencyLevel,
      emotionalIndicators,
      confidenceScore,
    };
  }

  /**
   * Obtener información del lead desde la base de datos
   */
  private async fetchLeadData(phoneNumber: string): Promise<Lead | null> {
    try {
      return await DatabaseService.findLeadByPhone(phoneNumber);
    } catch (error) {
      logger.warn('Error obteniendo datos del lead:', error);
      return null;
    }
  }

  /**
   * Obtener historial de conversación
   */
  private async fetchConversationHistory(phoneNumber: string): Promise<ConversationHistory[]> {
    try {
      return await DatabaseService.getConversationHistory(
        phoneNumber,
        this.config.maxContextMessages
      );
    } catch (error) {
      logger.warn('Error obteniendo historial de conversación:', error);
      return [];
    }
  }

  /**
   * Enriquecer metadatos del mensaje
   */
  private async enrichMessageMetadata(context: EnrichedContext): Promise<EnrichedContext> {
    const isFirstMessage = !context.conversationHistory || context.conversationHistory.length === 0;

    const enrichedMetadata = {
      ...context.messageMetadata,
      timestamp: context.messageMetadata?.timestamp || new Date(),
      messageType: context.messageMetadata?.messageType || 'text',
      isFirstMessage: context.messageMetadata?.isFirstMessage ?? isFirstMessage,
    };

    return {
      ...context,
      messageMetadata: enrichedMetadata,
    };
  }

  /**
   * Calcular nivel de confianza del enriquecimiento
   */
  private calculateEnrichmentConfidence(context: EnrichedContext, missingData: string[]): number {
    let confidence = 1.0;

    // Penalizar por datos faltantes
    const missingPenalty = missingData.length * 0.15;
    confidence -= missingPenalty;

    // Bonus por datos disponibles
    if (context.lead) confidence += 0.2;
    if (context.conversationHistory && context.conversationHistory.length > 0) confidence += 0.15;
    if (context.contactName) confidence += 0.1;

    return Math.max(0.3, Math.min(1.0, confidence));
  }

  /**
   * Extraer factores de contexto de la conversación
   */
  private extractContextFactors(
    history: ConversationHistory[],
    conversationLength: number
  ): string[] {
    const factors: string[] = [];

    if (conversationLength === 0) {
      factors.push('first-interaction');
    } else if (conversationLength > 10) {
      factors.push('long-conversation');
    } else if (conversationLength > 3) {
      factors.push('engaged-conversation');
    }

    // Analizar recencia de mensajes
    if (history.length > 0) {
      const lastMessage = history[0];
      const hoursSinceLastMessage =
        (Date.now() - new Date(lastMessage.createdAt).getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastMessage < 1) {
        factors.push('recent-activity');
      } else if (hoursSinceLastMessage > 24) {
        factors.push('returning-user');
      }
    }

    return factors;
  }

  /**
   * Extraer temas discutidos previamente
   */
  private async extractDiscussedTopics(history: ConversationHistory[]): Promise<string[]> {
    if (!this.config.topicAnalysisEnabled) {
      return [];
    }

    const topics: string[] = [];
    const messageTexts = history.filter(h => h.messageText).map(h => h.messageText!.toLowerCase());

    const topicKeywords = {
      pricing: ['precio', 'coste', 'cuesta', 'tarifa', 'pago', 'moneda', 'hub'],
      products: ['producto', 'anuncio', 'doble', 'top', 'historia', 'disponible'],
      registration: ['registro', 'cuenta', 'crear', 'inscrib', 'sign'],
      support: ['ayuda', 'problema', 'error', 'soporte', 'duda'],
      information: ['información', 'detalles', 'explicar', 'cómo', 'qué'],
      promotion: ['oferta', 'descuento', 'promoción', 'especial', 'rebaja'],
    };

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      const mentioned = messageTexts.some(text => keywords.some(keyword => text.includes(keyword)));

      if (mentioned) {
        topics.push(topic);
      }
    }

    return topics;
  }

  /**
   * Calcular nivel de engagement del usuario
   */
  private calculateUserEngagement(
    history: ConversationHistory[],
    conversationLength: number
  ): 'high' | 'medium' | 'low' {
    if (!this.config.engagementMetricsEnabled) {
      return 'medium';
    }

    // Factores de engagement
    let engagementScore = 0;

    // Longitud de la conversación
    if (conversationLength > 5) {
      engagementScore += 3;
    } else if (conversationLength > 2) {
      engagementScore += 2;
    } else if (conversationLength > 0) {
      engagementScore += 1;
    }

    // Variedad en longitud de mensajes (indica interés)
    if (history.length > 1) {
      const messageLengths = history.filter(h => h.messageText).map(h => h.messageText!.length);

      const avgLength = messageLengths.reduce((a, b) => a + b, 0) / messageLengths.length;
      if (avgLength > 50) engagementScore += 1;
      if (avgLength > 100) engagementScore += 1;
    }

    // Determinar nivel final
    if (engagementScore >= 4) return 'high';
    if (engagementScore >= 2) return 'medium';
    return 'low';
  }

  /**
   * Determinar etapa de la conversación
   */
  private determineConversationStage(
    conversationLength: number,
    previousTopics: string[],
    engagement: string
  ): 'initial' | 'engaged' | 'interested' | 'qualifying' | 'closing' {
    if (conversationLength === 0) {
      return 'initial';
    }

    // Etapas avanzadas basadas en temas
    if (previousTopics.includes('pricing') || previousTopics.includes('registration')) {
      return 'qualifying';
    }

    if (previousTopics.includes('products') && engagement === 'high') {
      return 'closing';
    }

    if (previousTopics.length > 1) {
      return 'interested';
    }

    if (conversationLength > 2 || engagement !== 'low') {
      return 'engaged';
    }

    return 'initial';
  }

  /**
   * Analizar patrones de comportamiento en la conversación
   */
  private analyzeConversationPatterns(
    history: ConversationHistory[]
  ): ConversationAnalysis['patterns'] {
    if (history.length === 0) {
      return {
        averageMessageLength: 0,
        timeGaps: [],
        topicSwitches: 0,
      };
    }

    // Calcular longitud promedio de mensajes
    const messageLengths = history.filter(h => h.messageText).map(h => h.messageText!.length);

    const averageMessageLength =
      messageLengths.length > 0
        ? messageLengths.reduce((a, b) => a + b, 0) / messageLengths.length
        : 0;

    // Calcular gaps de tiempo entre mensajes
    const timeGaps: number[] = [];
    for (let i = 0; i < history.length - 1; i++) {
      const gap =
        new Date(history[i].createdAt).getTime() - new Date(history[i + 1].createdAt).getTime();
      timeGaps.push(gap / (1000 * 60)); // Convertir a minutos
    }

    // Detectar cambios de tema (simplificado)
    const topicSwitches = this.countTopicSwitches(history);

    return {
      averageMessageLength: Math.round(averageMessageLength),
      timeGaps,
      topicSwitches,
    };
  }

  /**
   * Contar coincidencias de palabras y agregar indicadores
   */
  private countWordMatches(
    message: string,
    words: string[],
    indicators: string[],
    type: string
  ): number {
    let count = 0;
    for (const word of words) {
      if (message.includes(word)) {
        count++;
        indicators.push(`${type}:${word}`);
      }
    }
    return count;
  }

  /**
   * Obtener análisis de sentimiento por defecto
   */
  private getDefaultSentiment(): SentimentAnalysis {
    return {
      userSentiment: 'neutral',
      urgencyLevel: 'low',
      emotionalIndicators: [],
      confidenceScore: 0.5,
    };
  }

  /**
   * Contar cambios de tema en la conversación
   */
  private countTopicSwitches(history: ConversationHistory[]): number {
    // Implementación simplificada - en un caso real usaríamos análisis semántico
    let switches = 0;
    const keywords = ['precio', 'producto', 'registro', 'ayuda', 'información'];

    let lastTopic = '';
    for (const message of history) {
      if (!message.messageText) continue;

      const currentTopic =
        keywords.find(keyword => message.messageText!.toLowerCase().includes(keyword)) || 'general';

      if (lastTopic && lastTopic !== currentTopic) {
        switches++;
      }
      lastTopic = currentTopic;
    }

    return switches;
  }
}

// Exportar instancia singleton
export default new ContextBuilder();
