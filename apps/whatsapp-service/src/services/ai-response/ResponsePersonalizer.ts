import { logger } from '../../utils/logger';
import type { EnrichedContext } from './ContextBuilder';
import type { PersonalizationElement } from './PromptBuilder';

export interface PersonalizationRule {
  type: string;
  pattern: RegExp;
  replacement: (context: PersonalizationContext) => string;
  priority: number;
  conditions?: (context: PersonalizationContext) => boolean;
}

export interface PersonalizationContext {
  originalResponse: string;
  userContext: EnrichedContext;
  personalizationElements: PersonalizationElement[];
  responseType: string;
  metadata: {
    confidenceLevel: number;
    responseLength: number;
    hasGreeting: boolean;
    hasCallToAction: boolean;
  };
}

export interface PersonalizationResult {
  personalizedResponse: string;
  appliedPersonalizations: string[];
  personalizationScore: number;
  qualityMetrics: {
    naturalness: number;
    contextRelevance: number;
    brandConsistency: number;
  };
  processingTime: number;
}

export interface PersonalizationConfig {
  enabled: boolean;
  maxPersonalizations: number;
  preserveOriginalTone: boolean;
  includeEmotionalContext: boolean;
  brandPersonality: 'professional' | 'friendly' | 'casual';
}

/**
 * ResponsePersonalizer - Módulo especializado en personalización de respuestas de IA
 *
 * Responsabilidades:
 * - Personalizar respuestas basadas en elementos del contexto del usuario
 * - Aplicar reglas de personalización de manera natural y coherente
 * - Mantener consistencia de marca y tono profesional
 * - Optimizar respuestas para mejor engagement del usuario
 */
export class ResponsePersonalizer {
  private config: PersonalizationConfig = {
    enabled: true,
    maxPersonalizations: 3,
    preserveOriginalTone: true,
    includeEmotionalContext: true,
    brandPersonality: 'professional',
  };

  private personalizationRules: PersonalizationRule[] = [];

  constructor() {
    this.initializePersonalizationRules();
  }

  /**
   * Personalizar respuesta basada en elementos de contexto
   */
  public async personalizeResponse(
    baseResponse: string,
    personalizationElements: PersonalizationElement[],
    userContext: EnrichedContext,
    responseType: string
  ): Promise<PersonalizationResult> {
    const startTime = Date.now();

    logger.debug('🎨 Personalizando respuesta', {
      responseType,
      personalizationElementsCount: personalizationElements.length,
      responseLength: baseResponse.length,
      phoneNumber: userContext.phoneNumber,
    });

    if (!this.config.enabled || personalizationElements.length === 0) {
      return this.createDefaultResult(baseResponse, startTime);
    }

    try {
      // 1. Crear contexto de personalización
      const personalizationContext = this.createPersonalizationContext(
        baseResponse,
        userContext,
        personalizationElements,
        responseType
      );

      // 2. Aplicar personalizaciones según prioridad
      const personalizedResponse = await this.applyPersonalizations(personalizationContext);

      // 3. Validar y refinar el resultado
      const refinedResponse = this.refinePersonalizedResponse(
        personalizedResponse,
        personalizationContext
      );

      // 4. Calcular métricas de calidad
      const qualityMetrics = this.calculateQualityMetrics(refinedResponse, personalizationContext);

      // 5. Generar resultado final
      const result: PersonalizationResult = {
        personalizedResponse: refinedResponse.text,
        appliedPersonalizations: refinedResponse.appliedRules,
        personalizationScore: this.calculatePersonalizationScore(
          refinedResponse,
          personalizationElements
        ),
        qualityMetrics,
        processingTime: Date.now() - startTime,
      };

      logger.debug('✅ Respuesta personalizada', {
        appliedPersonalizations: result.appliedPersonalizations.length,
        personalizationScore: result.personalizationScore,
        qualityScore:
          (qualityMetrics.naturalness +
            qualityMetrics.contextRelevance +
            qualityMetrics.brandConsistency) /
          3,
        processingTime: result.processingTime,
      });

      return result;
    } catch (error) {
      logger.error('❌ Error personalizando respuesta:', error);
      return this.createErrorResult(baseResponse, startTime);
    }
  }

  /**
   * Generar elementos de personalización desde el contexto
   */
  public generatePersonalizationElements(context: EnrichedContext): PersonalizationElement[] {
    const elements: PersonalizationElement[] = [];

    logger.debug('🔍 Generando elementos de personalización', {
      hasLead: !!context.lead,
      hasContactName: !!context.contactName,
      phoneNumber: context.phoneNumber,
    });

    // 1. Nombre del contacto
    if (context.contactName || context.lead?.name) {
      elements.push({
        type: 'name',
        value: context.contactName || context.lead.name,
        confidence: 0.9,
      });
    }

    // 2. Estado del lead
    if (context.lead?.status) {
      elements.push({
        type: 'lead-status',
        value: context.lead.status,
        confidence: 0.8,
      });
    }

    // 3. Intereses/Tags del lead
    if (context.lead?.tags && context.lead.tags.length > 0) {
      elements.push({
        type: 'interests',
        value: context.lead.tags.join(', '),
        confidence: 0.7,
      });
    }

    // 4. Fuente del lead
    if (context.lead?.source) {
      elements.push({
        type: 'source',
        value: context.lead.source,
        confidence: 0.6,
      });
    }

    // 5. Historial de conversación
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      elements.push({
        type: 'conversation-history',
        value: `${context.conversationHistory.length} mensajes`,
        confidence: 0.5,
      });
    }

    // 6. Primera interacción
    if (context.messageMetadata?.isFirstMessage) {
      elements.push({
        type: 'first-interaction',
        value: 'true',
        confidence: 0.8,
      });
    }

    return elements.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Crear contexto de personalización
   */
  private createPersonalizationContext(
    originalResponse: string,
    userContext: EnrichedContext,
    personalizationElements: PersonalizationElement[],
    responseType: string
  ): PersonalizationContext {
    const hasGreeting = /^¡?hola|buenos|buenas|hey/i.test(originalResponse);
    const hasCallToAction = /[?¿]/.test(originalResponse);

    return {
      originalResponse,
      userContext,
      personalizationElements,
      responseType,
      metadata: {
        confidenceLevel: this.calculateOverallConfidence(personalizationElements),
        responseLength: originalResponse.length,
        hasGreeting,
        hasCallToAction,
      },
    };
  }

  /**
   * Aplicar personalizaciones según prioridad y contexto
   */
  private async applyPersonalizations(
    context: PersonalizationContext
  ): Promise<{ text: string; appliedRules: string[] }> {
    let personalizedText = context.originalResponse;
    const appliedRules: string[] = [];
    let applicationsCount = 0;

    // Filtrar y ordenar reglas aplicables
    const applicableRules = this.personalizationRules
      .filter(rule => !rule.conditions || rule.conditions(context))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, this.config.maxPersonalizations);

    for (const rule of applicableRules) {
      if (applicationsCount >= this.config.maxPersonalizations) {
        break;
      }

      try {
        if (rule.pattern.test(personalizedText)) {
          const replacement = rule.replacement(context);
          if (replacement && replacement !== personalizedText) {
            personalizedText = personalizedText.replace(rule.pattern, replacement);
            appliedRules.push(rule.type);
            applicationsCount++;

            logger.debug(`🎨 Personalización aplicada: ${rule.type}`);
          }
        }
      } catch (error) {
        logger.warn(`Error aplicando regla de personalización ${rule.type}:`, error);
      }
    }

    return { text: personalizedText, appliedRules };
  }

  /**
   * Refinar respuesta personalizada
   */
  private refinePersonalizedResponse(
    response: { text: string; appliedRules: string[] },
    context: PersonalizationContext
  ): { text: string; appliedRules: string[] } {
    let refinedText = response.text;

    // 1. Limpiar espacios múltiples
    refinedText = refinedText.replace(/\s+/g, ' ').trim();

    // 2. Ajustar puntuación
    refinedText = this.adjustPunctuation(refinedText);

    // 3. Verificar coherencia de tono
    if (this.config.preserveOriginalTone) {
      refinedText = this.preserveTone(refinedText, context.originalResponse);
    }

    // 4. Asegurar consistencia de marca
    refinedText = this.ensureBrandConsistency(refinedText);

    return { text: refinedText, appliedRules: response.appliedRules };
  }

  /**
   * Inicializar reglas de personalización
   */
  private initializePersonalizationRules(): void {
    this.personalizationRules = [
      // Regla de nombre en saludo
      {
        type: 'name-in-greeting',
        pattern: /^¡?hola!?/i,
        priority: 10,
        replacement: context => {
          const nameElement = context.personalizationElements.find(p => p.type === 'name');
          return nameElement ? `¡Hola ${nameElement.value}!` : '¡Hola!';
        },
        conditions: context => {
          const hasName = context.personalizationElements.some(p => p.type === 'name');
          return hasName && context.metadata.hasGreeting;
        },
      },

      // Regla de bienvenida para primera interacción
      {
        type: 'first-interaction-welcome',
        pattern: /^(.+?)(\. |$)/,
        priority: 8,
        replacement: context => {
          const nameElement = context.personalizationElements.find(p => p.type === 'name');
          const name = nameElement ? ` ${nameElement.value}` : '';
          return `¡Bienvenido${name} a EscortsHub.net! `;
        },
        conditions: context => {
          return context.personalizationElements.some(p => p.type === 'first-interaction');
        },
      },

      // Regla de reconocimiento de cliente recurrente
      {
        type: 'returning-customer',
        pattern: /(gracias por tu mensaje)/i,
        priority: 7,
        replacement: context => {
          const nameElement = context.personalizationElements.find(p => p.type === 'name');
          const name = nameElement ? ` ${nameElement.value}` : '';
          return `Gracias por contactarnos nuevamente${name}`;
        },
        conditions: context => {
          const hasHistory = context.personalizationElements.some(
            p => p.type === 'conversation-history'
          );
          const statusElement = context.personalizationElements.find(p => p.type === 'lead-status');
          return hasHistory && statusElement?.value === 'GANADO';
        },
      },

      // Regla de estado del lead
      {
        type: 'lead-status-context',
        pattern: /(\. )([¿?])/,
        priority: 6,
        replacement: context => {
          const statusElement = context.personalizationElements.find(p => p.type === 'lead-status');
          if (statusElement?.value === 'QUALIFIED') {
            return '. ¿Te gustaría que revisemos tu progreso desde la última vez? ';
          }
          return '. ';
        },
        conditions: context => {
          const statusElement = context.personalizationElements.find(p => p.type === 'lead-status');
          return statusElement?.value === 'QUALIFIED';
        },
      },

      // Regla de intereses específicos
      {
        type: 'interests-reference',
        pattern: /(productos|servicios)/i,
        priority: 5,
        replacement: context => {
          const interestsElement = context.personalizationElements.find(
            p => p.type === 'interests'
          );
          if (interestsElement) {
            return `productos relacionados con ${interestsElement.value}`;
          }
          return 'productos';
        },
        conditions: context => {
          return context.personalizationElements.some(p => p.type === 'interests');
        },
      },
    ];
  }

  /**
   * Calcular confianza general de personalización
   */
  private calculateOverallConfidence(elements: PersonalizationElement[]): number {
    if (elements.length === 0) return 0;

    const totalConfidence = elements.reduce((sum, element) => sum + element.confidence, 0);
    return totalConfidence / elements.length;
  }

  /**
   * Ajustar puntuación
   */
  private adjustPunctuation(text: string): string {
    return text
      .replace(/\s+([,.!?;:])/g, '$1') // Eliminar espacios antes de puntuación
      .replace(/([.!?])\s*([A-Z])/g, '$1 $2') // Asegurar espacio después de puntos
      .replace(/\?\s*\?/g, '?') // Eliminar signos de interrogación duplicados
      .replace(/!\s*!/g, '!'); // Eliminar signos de exclamación duplicados
  }

  /**
   * Preservar tono original
   */
  private preserveTone(personalizedText: string, originalText: string): string {
    // Mantener el nivel de formalidad del texto original
    const originalHasFormalTreatment = /usted|ustedes/i.test(originalText);
    const personalizedHasFormalTreatment = /usted|ustedes/i.test(personalizedText);

    if (originalHasFormalTreatment && !personalizedHasFormalTreatment) {
      // Mantener tratamiento formal si estaba en el original
      return personalizedText;
    }

    return personalizedText;
  }

  /**
   * Asegurar consistencia de marca
   */
  private ensureBrandConsistency(text: string): string {
    // Asegurar que EscortsHub.net aparezca correctamente
    return text.replace(/escorts?\s*hub/gi, 'EscortsHub.net');
  }

  /**
   * Calcular métricas de calidad
   */
  private calculateQualityMetrics(
    response: { text: string; appliedRules: string[] },
    context: PersonalizationContext
  ): PersonalizationResult['qualityMetrics'] {
    // Naturalidad: qué tan natural suena el texto personalizado
    const naturalness = this.assessNaturalness(response.text);

    // Relevancia contextual: qué tan bien se adapta al contexto
    const contextRelevance = this.assessContextRelevance(response, context);

    // Consistencia de marca: qué tan consistente es con la marca
    const brandConsistency = this.assessBrandConsistency(response.text);

    return {
      naturalness,
      contextRelevance,
      brandConsistency,
    };
  }

  /**
   * Evaluar naturalidad del texto
   */
  private assessNaturalness(text: string): number {
    let score = 0.7; // Base score

    // Penalizar repeticiones excesivas
    const words = text.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    const repetitionRatio = uniqueWords.size / words.length;
    score += (repetitionRatio - 0.5) * 0.3;

    // Bonus por longitud apropiada
    if (text.length >= 50 && text.length <= 300) {
      score += 0.1;
    }

    // Bonus por puntuación correcta
    if (/[.!?]$/.test(text.trim())) {
      score += 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Evaluar relevancia contextual
   */
  private assessContextRelevance(
    response: { text: string; appliedRules: string[] },
    context: PersonalizationContext
  ): number {
    let score = 0.5; // Base score

    // Bonus por personalizaciones aplicadas
    score += response.appliedRules.length * 0.15;

    // Bonus si incluye elementos del contexto
    if (context.personalizationElements.some(p => response.text.includes(p.value))) {
      score += 0.2;
    }

    // Bonus por consistencia con tipo de respuesta
    if (this.isConsistentWithResponseType(response.text, context.responseType)) {
      score += 0.15;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Evaluar consistencia de marca
   */
  private assessBrandConsistency(text: string): number {
    let score = 0.6; // Base score

    // Bonus si menciona EscortsHub correctamente
    if (/EscortsHub\.net/i.test(text)) {
      score += 0.2;
    }

    // Bonus por tono profesional pero cercano
    const hasProfessionalTone = !/muy\s+informal|super\s+casual/i.test(text);
    if (hasProfessionalTone) {
      score += 0.1;
    }

    // Bonus por llamada a la acción
    if (/[?¿]/.test(text)) {
      score += 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Verificar consistencia con tipo de respuesta
   */
  private isConsistentWithResponseType(text: string, responseType: string): boolean {
    const patterns = {
      greeting: /hola|bienvenido|saludos/i,
      informational: /información|detalles|explicar/i,
      promotional: /precio|oferta|paquete|producto/i,
      supportive: /ayuda|apoyo|soporte/i,
      clarification: /aclarar|explicar|detalles/i,
    };

    const pattern = patterns[responseType as keyof typeof patterns];
    return pattern ? pattern.test(text) : true;
  }

  /**
   * Calcular puntuación de personalización
   */
  private calculatePersonalizationScore(
    response: { text: string; appliedRules: string[] },
    elements: PersonalizationElement[]
  ): number {
    if (elements.length === 0) return 0;

    const baseScore =
      response.appliedRules.length / Math.min(elements.length, this.config.maxPersonalizations);
    const confidenceBonus = elements.reduce((sum, el) => sum + el.confidence, 0) / elements.length;

    return Math.min(1, baseScore * 0.7 + confidenceBonus * 0.3);
  }

  /**
   * Crear resultado por defecto
   */
  private createDefaultResult(baseResponse: string, startTime: number): PersonalizationResult {
    return {
      personalizedResponse: baseResponse,
      appliedPersonalizations: [],
      personalizationScore: 0,
      qualityMetrics: {
        naturalness: 0.7,
        contextRelevance: 0.5,
        brandConsistency: 0.6,
      },
      processingTime: Date.now() - startTime,
    };
  }

  /**
   * Crear resultado de error
   */
  private createErrorResult(baseResponse: string, startTime: number): PersonalizationResult {
    return {
      personalizedResponse: baseResponse,
      appliedPersonalizations: ['error-fallback'],
      personalizationScore: 0.2,
      qualityMetrics: {
        naturalness: 0.5,
        contextRelevance: 0.3,
        brandConsistency: 0.5,
      },
      processingTime: Date.now() - startTime,
    };
  }
}

// Exportar instancia singleton
export default new ResponsePersonalizer();
