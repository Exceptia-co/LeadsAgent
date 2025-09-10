import { logger } from '../../utils/logger';
import type { EnrichedContext } from './ContextBuilder';
import type { RelevantKnowledge } from './PromptBuilder';

export interface QualityMetrics {
  confidence: number;
  relevance: number;
  completeness: number;
  clarity: number;
  engagement: number;
  brandConsistency: number;
  technicalAccuracy: number;
  emotionalAppropriatenesss: number;
}

export interface QualityEvaluationResult {
  overallScore: number;
  metrics: QualityMetrics;
  qualityFactors: string[];
  improvementSuggestions: string[];
  confidenceLevel: 'low' | 'medium' | 'high';
  shouldContinueConversation: boolean;
  suggestedFollowUp?: string;
  evaluationTime: number;
}

export interface EvaluationContext {
  response: string;
  userContext: EnrichedContext;
  knowledgeUsed: RelevantKnowledge[];
  responseType: string;
  personalizationApplied: string[];
  processingMetadata: {
    promptTokens: number;
    responseTokens: number;
    processingTime: number;
  };
}

export interface QualityThresholds {
  minimumConfidence: number;
  minimumRelevance: number;
  minimumCompleteness: number;
  minimumClarity: number;
  acceptableOverallScore: number;
}

/**
 * QualityEvaluator - Módulo especializado en evaluación de calidad de respuestas de IA
 *
 * Responsabilidades:
 * - Evaluar múltiples dimensiones de calidad de respuestas
 * - Calcular métricas de confianza y relevancia
 * - Generar sugerencias de mejora automáticas
 * - Determinar si la respuesta cumple con estándares de calidad
 */
export class QualityEvaluator {
  private thresholds: QualityThresholds = {
    minimumConfidence: 0.6,
    minimumRelevance: 0.7,
    minimumCompleteness: 0.5,
    minimumClarity: 0.6,
    acceptableOverallScore: 0.65,
  };

  private qualityWeights = {
    confidence: 0.25,
    relevance: 0.2,
    completeness: 0.15,
    clarity: 0.15,
    engagement: 0.1,
    brandConsistency: 0.1,
    technicalAccuracy: 0.03,
    emotionalAppropriatenesss: 0.02,
  };

  /**
   * Evaluar calidad integral de una respuesta
   */
  public async evaluateResponseQuality(
    response: string,
    context: EnrichedContext,
    knowledgeUsed: RelevantKnowledge[],
    responseType: string,
    personalizationApplied: string[] = [],
    processingMetadata?: Partial<EvaluationContext['processingMetadata']>
  ): Promise<QualityEvaluationResult> {
    const startTime = Date.now();

    logger.debug('🔍 Evaluando calidad de respuesta', {
      responseLength: response.length,
      responseType,
      knowledgeItemsUsed: knowledgeUsed.length,
      personalizationsApplied: personalizationApplied.length,
      phoneNumber: context.phoneNumber,
    });

    try {
      // 1. Crear contexto de evaluación
      const evaluationContext = this.createEvaluationContext(
        response,
        context,
        knowledgeUsed,
        responseType,
        personalizationApplied,
        processingMetadata
      );

      // 2. Calcular métricas individuales
      const metrics = await this.calculateQualityMetrics(evaluationContext);

      // 3. Calcular puntuación general
      const overallScore = this.calculateOverallScore(metrics);

      // 4. Identificar factores de calidad
      const qualityFactors = this.identifyQualityFactors(metrics, evaluationContext);

      // 5. Generar sugerencias de mejora
      const improvementSuggestions = this.generateImprovementSuggestions(
        metrics,
        evaluationContext
      );

      // 6. Determinar nivel de confianza
      const confidenceLevel = this.determineConfidenceLevel(overallScore, metrics);

      // 7. Evaluar continuación de conversación
      const shouldContinueConversation = this.shouldContinueConversation(
        metrics,
        evaluationContext
      );

      // 8. Generar sugerencia de seguimiento
      const suggestedFollowUp = this.generateFollowUpSuggestion(
        responseType,
        context,
        overallScore
      );

      const result: QualityEvaluationResult = {
        overallScore,
        metrics,
        qualityFactors,
        improvementSuggestions,
        confidenceLevel,
        shouldContinueConversation,
        suggestedFollowUp,
        evaluationTime: Date.now() - startTime,
      };

      logger.debug('✅ Evaluación de calidad completada', {
        overallScore,
        confidenceLevel,
        qualityFactorsCount: qualityFactors.length,
        suggestionsCount: improvementSuggestions.length,
        evaluationTime: result.evaluationTime,
      });

      return result;
    } catch (error) {
      logger.error('❌ Error evaluando calidad de respuesta:', error);
      return this.createErrorEvaluation(response, startTime);
    }
  }

  /**
   * Evaluar si una respuesta cumple con estándares mínimos de calidad
   */
  public meetsQualityStandards(evaluation: QualityEvaluationResult): boolean {
    const { metrics } = evaluation;

    return (
      evaluation.overallScore >= this.thresholds.acceptableOverallScore &&
      metrics.confidence >= this.thresholds.minimumConfidence &&
      metrics.relevance >= this.thresholds.minimumRelevance &&
      metrics.completeness >= this.thresholds.minimumCompleteness &&
      metrics.clarity >= this.thresholds.minimumClarity
    );
  }

  /**
   * Crear contexto de evaluación
   */
  private createEvaluationContext(
    response: string,
    userContext: EnrichedContext,
    knowledgeUsed: RelevantKnowledge[],
    responseType: string,
    personalizationApplied: string[],
    processingMetadata?: Partial<EvaluationContext['processingMetadata']>
  ): EvaluationContext {
    return {
      response,
      userContext,
      knowledgeUsed,
      responseType,
      personalizationApplied,
      processingMetadata: {
        promptTokens: processingMetadata?.promptTokens || 0,
        responseTokens: processingMetadata?.responseTokens || this.estimateTokens(response),
        processingTime: processingMetadata?.processingTime || 0,
      },
    };
  }

  /**
   * Calcular métricas de calidad individuales
   */
  private async calculateQualityMetrics(context: EvaluationContext): Promise<QualityMetrics> {
    const metrics: QualityMetrics = {
      confidence: await this.evaluateConfidence(context),
      relevance: await this.evaluateRelevance(context),
      completeness: await this.evaluateCompleteness(context),
      clarity: await this.evaluateClarity(context),
      engagement: await this.evaluateEngagement(context),
      brandConsistency: await this.evaluateBrandConsistency(context),
      technicalAccuracy: await this.evaluateTechnicalAccuracy(context),
      emotionalAppropriatenesss: await this.evaluateEmotionalAppropriateness(context),
    };

    return metrics;
  }

  /**
   * Evaluar confianza de la respuesta
   */
  private async evaluateConfidence(context: EvaluationContext): Promise<number> {
    let confidence = 0.5; // Base confidence

    // Bonus por longitud apropiada
    const responseLength = context.response.length;
    if (responseLength >= 50 && responseLength <= 500) {
      confidence += 0.1;
    } else if (responseLength < 20) {
      confidence -= 0.2;
    }

    // Bonus por uso de knowledge base
    if (context.knowledgeUsed.length > 0) {
      confidence += 0.2;

      // Bonus adicional por relevancia de conocimiento
      const avgRelevance =
        context.knowledgeUsed.reduce((sum, kb) => sum + kb.relevance, 0) /
        context.knowledgeUsed.length;
      confidence += avgRelevance * 0.1;
    }

    // Bonus por personalización aplicada
    if (context.personalizationApplied.length > 0) {
      confidence += context.personalizationApplied.length * 0.05;
    }

    // Bonus por incluir información específica de EscortsHub
    const hasSpecificInfo = this.containsSpecificInformation(context.response);
    if (hasSpecificInfo) {
      confidence += 0.15;
    }

    // Penalty por respuestas muy genéricas
    if (this.isGenericResponse(context.response)) {
      confidence -= 0.2;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Evaluar relevancia de la respuesta
   */
  private async evaluateRelevance(context: EvaluationContext): Promise<number> {
    let relevance = 0.6; // Base relevance

    // Verificar coherencia con tipo de respuesta
    const isCoherentWithType = this.isCoherentWithResponseType(
      context.response,
      context.responseType
    );
    if (isCoherentWithType) {
      relevance += 0.2;
    } else {
      relevance -= 0.3;
    }

    // Verificar si responde al mensaje del usuario
    const addressesUserMessage = this.addressesUserMessage(
      context.response,
      context.userContext.userMessage
    );
    if (addressesUserMessage) {
      relevance += 0.15;
    } else {
      relevance -= 0.2;
    }

    // Bonus por contexto histórico
    if (
      context.userContext.conversationHistory &&
      context.userContext.conversationHistory.length > 0
    ) {
      const considersHistory = this.considersConversationHistory(
        context.response,
        context.userContext
      );
      if (considersHistory) {
        relevance += 0.1;
      }
    }

    return Math.max(0, Math.min(1, relevance));
  }

  /**
   * Evaluar completeness de la respuesta
   */
  private async evaluateCompleteness(context: EvaluationContext): Promise<number> {
    let completeness = 0.5; // Base completeness

    // Verificar si incluye información necesaria según el tipo
    const hasRequiredInfo = this.hasRequiredInformationForType(
      context.response,
      context.responseType
    );
    if (hasRequiredInfo) {
      completeness += 0.3;
    }

    // Verificar si incluye call-to-action cuando es apropiado
    const hasCallToAction = /[?¿]/.test(context.response);
    if (hasCallToAction && this.shouldHaveCallToAction(context.responseType)) {
      completeness += 0.2;
    }

    // Verificar si menciona información de contacto o próximos pasos
    const hasNextSteps = this.includesNextSteps(context.response);
    if (hasNextSteps) {
      completeness += 0.1;
    }

    return Math.max(0, Math.min(1, completeness));
  }

  /**
   * Evaluar claridad de la respuesta
   */
  private async evaluateClarity(context: EvaluationContext): Promise<number> {
    let clarity = 0.6; // Base clarity

    // Verificar estructura de oraciones
    const hasClearStructure = this.hasClearSentenceStructure(context.response);
    if (hasClearStructure) {
      clarity += 0.2;
    }

    // Verificar uso de vocabulario apropiado
    const hasAppropriateVocabulary = this.hasAppropriateVocabulary(context.response);
    if (hasAppropriateVocabulary) {
      clarity += 0.1;
    }

    // Penalty por texto confuso o contradictorio
    const isConfusing = this.isConfusingOrContradictory(context.response);
    if (isConfusing) {
      clarity -= 0.3;
    }

    // Bonus por uso de formateo apropiado
    const hasGoodFormatting = this.hasGoodFormatting(context.response);
    if (hasGoodFormatting) {
      clarity += 0.1;
    }

    return Math.max(0, Math.min(1, clarity));
  }

  /**
   * Evaluar engagement de la respuesta
   */
  private async evaluateEngagement(context: EvaluationContext): Promise<number> {
    let engagement = 0.5; // Base engagement

    // Verificar tono conversacional
    const hasConversationalTone = this.hasConversationalTone(context.response);
    if (hasConversationalTone) {
      engagement += 0.2;
    }

    // Verificar preguntas para continuar la conversación
    const encouragesContinuation = /[?¿]/.test(context.response);
    if (encouragesContinuation) {
      engagement += 0.2;
    }

    // Verificar personalización
    if (context.personalizationApplied.length > 0) {
      engagement += 0.15;
    }

    // Bonus por emojis apropiados (opcional)
    const hasAppropriateEmojis = this.hasAppropriateEmojis(context.response);
    if (hasAppropriateEmojis) {
      engagement += 0.05;
    }

    return Math.max(0, Math.min(1, engagement));
  }

  /**
   * Evaluar consistencia de marca
   */
  private async evaluateBrandConsistency(context: EvaluationContext): Promise<number> {
    let brandConsistency = 0.6; // Base consistency

    // Verificar mención correcta de EscortsHub
    if (/EscortsHub\.net/i.test(context.response)) {
      brandConsistency += 0.2;
    }

    // Verificar tono profesional pero cercano
    const hasProfessionalTone = this.hasProfessionalYetFriendlyTone(context.response);
    if (hasProfessionalTone) {
      brandConsistency += 0.15;
    }

    // Verificar términos específicos del negocio
    const usesBusinessTerms = this.usesAppropriateBusinessTerms(context.response);
    if (usesBusinessTerms) {
      brandConsistency += 0.1;
    }

    // Penalty por lenguaje inapropiado
    const hasInappropriateLanguage = this.hasInappropriateLanguage(context.response);
    if (hasInappropriateLanguage) {
      brandConsistency -= 0.4;
    }

    return Math.max(0, Math.min(1, brandConsistency));
  }

  /**
   * Evaluar precisión técnica
   */
  private async evaluateTechnicalAccuracy(context: EvaluationContext): Promise<number> {
    let accuracy = 0.7; // Base accuracy

    // Verificar información de precios si se menciona
    const hasPricingInfo = /precio|hub|paquete|\d+€/i.test(context.response);
    if (hasPricingInfo) {
      const isPricingAccurate = this.isPricingInformationAccurate(context.response);
      if (isPricingAccurate) {
        accuracy += 0.2;
      } else {
        accuracy -= 0.3;
      }
    }

    // Verificar información de productos
    const hasProductInfo = /anuncio|producto|top|doble/i.test(context.response);
    if (hasProductInfo) {
      const isProductInfoAccurate = this.isProductInformationAccurate(context.response);
      if (isProductInfoAccurate) {
        accuracy += 0.1;
      } else {
        accuracy -= 0.2;
      }
    }

    return Math.max(0, Math.min(1, accuracy));
  }

  /**
   * Evaluar apropiación emocional
   */
  private async evaluateEmotionalAppropriateness(context: EvaluationContext): Promise<number> {
    let appropriateness = 0.7; // Base appropriateness

    // Verificar si el tono coincide con el sentimiento del usuario
    if (context.userContext.enrichmentMetadata) {
      // Lógica simplificada para evaluar apropiación emocional
      const responseHasPositiveTone = /gracias|excelente|perfecto|genial/i.test(context.response);
      const responseHasSupportiveTone = /ayuda|comprendo|soporte/i.test(context.response);

      if (responseHasPositiveTone || responseHasSupportiveTone) {
        appropriateness += 0.2;
      }
    }

    return Math.max(0, Math.min(1, appropriateness));
  }

  /**
   * Calcular puntuación general ponderada
   */
  private calculateOverallScore(metrics: QualityMetrics): number {
    return (
      metrics.confidence * this.qualityWeights.confidence +
      metrics.relevance * this.qualityWeights.relevance +
      metrics.completeness * this.qualityWeights.completeness +
      metrics.clarity * this.qualityWeights.clarity +
      metrics.engagement * this.qualityWeights.engagement +
      metrics.brandConsistency * this.qualityWeights.brandConsistency +
      metrics.technicalAccuracy * this.qualityWeights.technicalAccuracy +
      metrics.emotionalAppropriatenesss * this.qualityWeights.emotionalAppropriatenesss
    );
  }

  /**
   * Identificar factores que contribuyen a la calidad
   */
  private identifyQualityFactors(metrics: QualityMetrics, context: EvaluationContext): string[] {
    const factors: string[] = [];

    if (metrics.confidence > 0.8) factors.push('high-confidence');
    if (metrics.relevance > 0.8) factors.push('highly-relevant');
    if (metrics.clarity > 0.8) factors.push('very-clear');
    if (metrics.engagement > 0.7) factors.push('engaging');
    if (metrics.brandConsistency > 0.8) factors.push('brand-consistent');
    if (context.knowledgeUsed.length > 0) factors.push('knowledge-based');
    if (context.personalizationApplied.length > 0) factors.push('personalized');

    return factors;
  }

  /**
   * Generar sugerencias de mejora
   */
  private generateImprovementSuggestions(
    metrics: QualityMetrics,
    context: EvaluationContext
  ): string[] {
    const suggestions: string[] = [];

    if (metrics.confidence < 0.6) {
      suggestions.push('Aumentar confianza incluyendo más información específica');
    }

    if (metrics.relevance < 0.7) {
      suggestions.push('Mejorar relevancia dirigiendo mejor la respuesta al contexto del usuario');
    }

    if (metrics.completeness < 0.6) {
      suggestions.push('Incluir más información o próximos pasos claros');
    }

    if (metrics.clarity < 0.6) {
      suggestions.push('Simplificar el lenguaje y mejorar la estructura');
    }

    if (metrics.engagement < 0.5) {
      suggestions.push('Hacer la respuesta más conversacional e incluir preguntas');
    }

    if (metrics.brandConsistency < 0.7) {
      suggestions.push('Asegurar consistencia con el tono y marca de EscortsHub');
    }

    if (context.knowledgeUsed.length === 0) {
      suggestions.push('Considerar incluir información de la base de conocimientos');
    }

    return suggestions;
  }

  /**
   * Determinar nivel de confianza
   */
  private determineConfidenceLevel(
    overallScore: number,
    metrics: QualityMetrics
  ): 'low' | 'medium' | 'high' {
    if (overallScore >= 0.8 && metrics.confidence >= 0.8) {
      return 'high';
    } else if (overallScore >= 0.6 && metrics.confidence >= 0.6) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Determinar si la conversación debe continuar
   */
  private shouldContinueConversation(metrics: QualityMetrics, context: EvaluationContext): boolean {
    // Continuar si la calidad es aceptable y es apropiado para el tipo de respuesta
    const qualityAcceptable = metrics.confidence >= 0.5 && metrics.relevance >= 0.6;
    const responseTypeEncouragesContinuation = [
      'greeting',
      'informational',
      'promotional',
    ].includes(context.responseType);

    return qualityAcceptable && responseTypeEncouragesContinuation;
  }

  /**
   * Generar sugerencia de seguimiento
   */
  private generateFollowUpSuggestion(
    responseType: string,
    context: EnrichedContext,
    overallScore: number
  ): string | undefined {
    if (overallScore < 0.5) {
      return 'Considera contactar con nuestro soporte directo para mejor asistencia';
    }

    const suggestions = {
      greeting: '¿Te gustaría conocer nuestros precios o necesitas ayuda con el registro?',
      informational: '¿Hay algo más específico que te gustaría saber?',
      promotional: '¿Te ayudo con el proceso de registro para empezar?',
      supportive: '¿Hay algo más en lo que pueda ayudarte?',
    };

    return suggestions[responseType as keyof typeof suggestions];
  }

  // Métodos auxiliares para evaluaciones específicas
  private containsSpecificInformation(response: string): boolean {
    const specificTerms = ['escortshub', 'hub', 'monedas', 'anuncio', 'paquete', 'precio'];
    return specificTerms.some(term => response.toLowerCase().includes(term));
  }

  private isGenericResponse(response: string): boolean {
    const genericPhrases = ['gracias por tu mensaje', 'estoy aquí para ayudarte', 'cualquier duda'];
    return (
      genericPhrases.some(phrase => response.toLowerCase().includes(phrase)) &&
      response.length < 100
    );
  }

  private isCoherentWithResponseType(response: string, responseType: string): boolean {
    const patterns = {
      greeting: /hola|bienvenido|saludos/i,
      informational: /información|detalles|explicar/i,
      promotional: /precio|oferta|paquete|producto/i,
      supportive: /ayuda|apoyo|soporte/i,
      clarification: /aclarar|explicar|detalles/i,
    };

    const pattern = patterns[responseType as keyof typeof patterns];
    return pattern ? pattern.test(response) : true;
  }

  private addressesUserMessage(response: string, userMessage: string): boolean {
    // Lógica simplificada para verificar si la respuesta aborda el mensaje del usuario
    const userKeywords = userMessage
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3);
    return userKeywords.some(keyword => response.toLowerCase().includes(keyword));
  }

  private considersConversationHistory(response: string, context: EnrichedContext): boolean {
    // Verificar si la respuesta considera el historial de conversación
    return (
      response.toLowerCase().includes('anterior') || response.toLowerCase().includes('última vez')
    );
  }

  private hasRequiredInformationForType(response: string, responseType: string): boolean {
    const requirements = {
      greeting: () => /hola|bienvenido/i.test(response),
      informational: () => response.length > 50,
      promotional: () => /precio|paquete|producto/i.test(response),
      supportive: () => /ayuda|soporte/i.test(response),
      clarification: () => /explicar|aclarar/i.test(response),
    };

    const requirement = requirements[responseType as keyof typeof requirements];
    return requirement ? requirement() : true;
  }

  private shouldHaveCallToAction(responseType: string): boolean {
    return ['greeting', 'informational', 'promotional'].includes(responseType);
  }

  private includesNextSteps(response: string): boolean {
    return /siguiente|próximo|registr|contacto/i.test(response);
  }

  private hasClearSentenceStructure(response: string): boolean {
    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
    return sentences.every(sentence => sentence.trim().length > 5 && sentence.trim().length < 200);
  }

  private hasAppropriateVocabulary(response: string): boolean {
    // Verificar que no use jerga excesiva o lenguaje demasiado técnico
    const technicalJargon = /api|endpoint|json|sql/i;
    const excessiveSlang = /chévere|bacano|genial x10/i;
    return !technicalJargon.test(response) && !excessiveSlang.test(response);
  }

  private isConfusingOrContradictory(response: string): boolean {
    // Lógica simplificada para detectar contradicciones
    return response.toLowerCase().includes('no sí') || response.toLowerCase().includes('sí no');
  }

  private hasGoodFormatting(response: string): boolean {
    // Verificar espaciado y puntuación apropiados
    return !/\s{3,}/.test(response) && !/[.!?]{2,}/.test(response);
  }

  private hasConversationalTone(response: string): boolean {
    return /puedo|podemos|te|tu|usted/i.test(response);
  }

  private hasAppropriateEmojis(response: string): boolean {
    const emojiCount = (
      response.match(
        /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu
      ) || []
    ).length;
    return emojiCount <= 3; // No más de 3 emojis
  }

  private hasProfessionalYetFriendlyTone(response: string): boolean {
    const hasProfessionalWords = /información|servicio|empresa|profesional/i.test(response);
    const hasFriendlyWords = /ayudar|encantado|gracias|genial/i.test(response);
    return hasProfessionalWords || hasFriendlyWords;
  }

  private usesAppropriateBusinessTerms(response: string): boolean {
    return /paquete|anuncio|monedas|registro|servicio/i.test(response);
  }

  private hasInappropriateLanguage(response: string): boolean {
    const inappropriateWords = ['maldito', 'estúpido', 'idiota'];
    return inappropriateWords.some(word => response.toLowerCase().includes(word));
  }

  private isPricingInformationAccurate(response: string): boolean {
    // Verificar que los precios mencionados sean coherentes con los reales
    const priceMatches = response.match(/(\d+)\s*€/g);
    if (!priceMatches) return true; // Si no hay precios, no hay inexactitud

    // Verificar rangos de precios razonables
    return priceMatches.every(price => {
      const amount = parseInt(price.replace('€', ''));
      return amount >= 50 && amount <= 1000; // Rango razonable
    });
  }

  private isProductInformationAccurate(response: string): boolean {
    // Verificar que la información de productos sea coherente
    return !/anuncio gratis|0 hub|precio 0/i.test(response);
  }

  private estimateTokens(text: string): number {
    // Aproximación: 1 token ≈ 4 caracteres en español
    return Math.ceil(text.length / 4);
  }

  private createErrorEvaluation(response: string, startTime: number): QualityEvaluationResult {
    return {
      overallScore: 0.3,
      metrics: {
        confidence: 0.3,
        relevance: 0.3,
        completeness: 0.3,
        clarity: 0.3,
        engagement: 0.3,
        brandConsistency: 0.3,
        technicalAccuracy: 0.3,
        emotionalAppropriatenesss: 0.3,
      },
      qualityFactors: ['evaluation-error'],
      improvementSuggestions: ['Error en la evaluación - usar respuesta de fallback'],
      confidenceLevel: 'low',
      shouldContinueConversation: true,
      evaluationTime: Date.now() - startTime,
    };
  }
}

// Exportar instancia singleton
export default new QualityEvaluator();
