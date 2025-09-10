import { logger } from '../../utils/logger';
import type { EnrichedContext, ConversationAnalysis, SentimentAnalysis } from './ContextBuilder';

export interface PersonalizationElement {
  type: string;
  value: string;
  confidence: number;
}

export interface RelevantKnowledge {
  id: string;
  title: string;
  content: string;
  relevance: number;
}

export interface PromptConfiguration {
  maxWords: number;
  tone: 'professional' | 'friendly' | 'casual';
  includePersonalization: boolean;
  includeKnowledgeBase: boolean;
  includeContextHistory: boolean;
  languageCode: string;
}

export interface PromptComponents {
  header: string;
  userContext: string;
  leadInformation?: string;
  conversationHistory?: string;
  knowledgeBase?: string;
  responseInstructions: string;
  personalization?: string;
  footer: string;
}

export interface PromptMetrics {
  totalTokens: number;
  complexity: 'low' | 'medium' | 'high';
  personalizationScore: number;
  contextRichness: number;
  buildTime: number;
}

/**
 * PromptBuilder - Módulo especializado en construcción de prompts contextualizados
 *
 * Responsabilidades:
 * - Construir prompts dinámicos basados en contexto y análisis
 * - Integrar elementos de personalización de manera natural
 * - Optimizar prompts según el tipo de respuesta requerida
 * - Generar instrucciones específicas por tipo de interacción
 */
export class PromptBuilder {
  private config: PromptConfiguration = {
    maxWords: 200,
    tone: 'professional',
    includePersonalization: true,
    includeKnowledgeBase: true,
    includeContextHistory: true,
    languageCode: 'es',
  };

  /**
   * Construir prompt contextualizado completo
   */
  public async buildContextualizedPrompt(options: {
    context: EnrichedContext;
    conversationAnalysis: ConversationAnalysis;
    sentimentAnalysis: SentimentAnalysis;
    relevantKnowledge: RelevantKnowledge[];
    responseType: string;
    personalizationElements: PersonalizationElement[];
  }): Promise<{ prompt: string; metrics: PromptMetrics }> {
    const startTime = Date.now();

    logger.debug('🔨 Construyendo prompt contextualizado', {
      responseType: options.responseType,
      knowledgeItems: options.relevantKnowledge.length,
      personalizationItems: options.personalizationElements.length,
      conversationStage: options.conversationAnalysis.stage,
    });

    try {
      // 1. Generar componentes del prompt
      const components = await this.generatePromptComponents(options);

      // 2. Ensamblar prompt final
      const prompt = this.assemblePrompt(components, options.responseType);

      // 3. Calcular métricas del prompt
      const metrics = this.calculatePromptMetrics(prompt, components, startTime);

      logger.debug('✅ Prompt construido', {
        totalTokens: metrics.totalTokens,
        complexity: metrics.complexity,
        personalizationScore: metrics.personalizationScore,
        buildTime: metrics.buildTime,
      });

      return { prompt, metrics };
    } catch (error) {
      logger.error('❌ Error construyendo prompt:', error);

      // Fallback a prompt básico
      const fallbackPrompt = this.buildFallbackPrompt(options.context, options.responseType);
      const fallbackMetrics: PromptMetrics = {
        totalTokens: this.estimateTokens(fallbackPrompt),
        complexity: 'low',
        personalizationScore: 0.2,
        contextRichness: 0.3,
        buildTime: Date.now() - startTime,
      };

      return { prompt: fallbackPrompt, metrics: fallbackMetrics };
    }
  }

  /**
   * Construir prompt optimizado para tipo específico de respuesta
   */
  public buildTypeSpecificPrompt(
    responseType: string,
    context: EnrichedContext,
    additionalInstructions?: string
  ): string {
    const baseInstructions = this.getTypeSpecificInstructions(responseType);
    const contextSummary = this.generateContextSummary(context);

    let prompt = `Eres un asistente virtual profesional de EscortsHub.net.\n\n`;
    prompt += `CONTEXTO: ${contextSummary}\n\n`;
    prompt += `TIPO DE RESPUESTA: ${responseType}\n\n`;
    prompt += `INSTRUCCIONES: ${baseInstructions}\n\n`;

    if (additionalInstructions) {
      prompt += `INSTRUCCIONES ADICIONALES: ${additionalInstructions}\n\n`;
    }

    prompt += `MENSAJE DEL USUARIO: "${context.userMessage}"\n\n`;
    prompt += `RESPUESTA (en español, profesional pero cercana):`;

    return prompt;
  }

  /**
   * Optimizar prompt para mejor rendimiento de IA
   */
  public optimizePrompt(
    prompt: string,
    targetTokens: number = 500,
    preserveContext: boolean = true
  ): string {
    const currentTokens = this.estimateTokens(prompt);

    if (currentTokens <= targetTokens) {
      return prompt;
    }

    logger.debug('🔧 Optimizando prompt', {
      currentTokens,
      targetTokens,
      preserveContext,
    });

    // Estrategias de optimización
    let optimizedPrompt = prompt;

    // 1. Condensar secciones repetitivas
    optimizedPrompt = this.condenseSections(optimizedPrompt);

    // 2. Reducir knowledge base si es necesario
    if (!preserveContext && currentTokens > targetTokens * 1.2) {
      optimizedPrompt = this.reduceKnowledgeBase(optimizedPrompt);
    }

    // 3. Simplificar instrucciones
    optimizedPrompt = this.simplifyInstructions(optimizedPrompt);

    // 4. Mantener elementos críticos
    optimizedPrompt = this.preserveCriticalElements(optimizedPrompt);

    return optimizedPrompt;
  }

  /**
   * Generar componentes individuales del prompt
   */
  private async generatePromptComponents(options: {
    context: EnrichedContext;
    conversationAnalysis: ConversationAnalysis;
    sentimentAnalysis: SentimentAnalysis;
    relevantKnowledge: RelevantKnowledge[];
    responseType: string;
    personalizationElements: PersonalizationElement[];
  }): Promise<PromptComponents> {
    const {
      context,
      conversationAnalysis,
      sentimentAnalysis,
      relevantKnowledge,
      responseType,
      personalizationElements,
    } = options;

    const components: PromptComponents = {
      header: this.buildHeader(),
      userContext: this.buildUserContext(context, conversationAnalysis, sentimentAnalysis),
      responseInstructions: this.buildResponseInstructions(responseType, sentimentAnalysis),
      footer: this.buildFooter(responseType),
    };

    // Agregar información del lead si está disponible
    if (context.lead && this.config.includeContextHistory) {
      components.leadInformation = this.buildLeadInformation(context.lead);
    }

    // Agregar historial de conversación si está habilitado
    if (conversationAnalysis.previousTopics.length > 0 && this.config.includeContextHistory) {
      components.conversationHistory = this.buildConversationHistory(conversationAnalysis);
    }

    // Agregar knowledge base si está disponible
    if (relevantKnowledge.length > 0 && this.config.includeKnowledgeBase) {
      components.knowledgeBase = this.buildKnowledgeBase(relevantKnowledge);
    }

    // Agregar instrucciones específicas del tipo
    components.responseInstructions = this.buildResponseInstructions(
      responseType,
      sentimentAnalysis
    );

    // Agregar personalización si está habilitada
    if (personalizationElements.length > 0 && this.config.includePersonalization) {
      components.personalization = this.buildPersonalization(personalizationElements);
    }

    return components;
  }

  /**
   * Ensamblar componentes en prompt final
   */
  private assemblePrompt(components: PromptComponents, responseType: string): string {
    let prompt = components.header;

    // Agregar contexto del usuario
    prompt += components.userContext;

    // Agregar información del lead si existe
    if (components.leadInformation) {
      prompt += `\n${components.leadInformation}`;
    }

    // Agregar historial de conversación si existe
    if (components.conversationHistory) {
      prompt += `\n${components.conversationHistory}`;
    }

    // Agregar knowledge base si existe
    if (components.knowledgeBase) {
      prompt += `\n${components.knowledgeBase}`;
    }

    // Agregar instrucciones de respuesta
    prompt += `\n${components.responseInstructions}`;

    // Agregar personalización si existe
    if (components.personalization) {
      prompt += `\n${components.personalization}`;
    }

    // Agregar footer
    prompt += components.footer;

    return prompt;
  }

  /**
   * Construir encabezado del prompt
   */
  private buildHeader(): string {
    return `Eres un asistente virtual profesional de EscortsHub.net. Tu tarea es responder al siguiente mensaje de WhatsApp.\n\n`;
  }

  /**
   * Construir contexto del usuario
   */
  private buildUserContext(
    context: EnrichedContext,
    conversationAnalysis: ConversationAnalysis,
    sentimentAnalysis: SentimentAnalysis
  ): string {
    let userContext = `CONTEXTO DEL USUARIO:\n`;
    userContext += `- Teléfono: ${context.phoneNumber}\n`;
    userContext += `- Etapa de conversación: ${conversationAnalysis.stage}\n`;
    userContext += `- Nivel de engagement: ${conversationAnalysis.userEngagement}\n`;
    userContext += `- Sentimiento detectado: ${sentimentAnalysis.userSentiment}\n`;
    userContext += `- Nivel de urgencia: ${sentimentAnalysis.urgencyLevel}\n`;

    // Agregar factores de contexto adicionales
    if (conversationAnalysis.contextFactors.length > 0) {
      userContext += `- Factores de contexto: ${conversationAnalysis.contextFactors.join(', ')}\n`;
    }

    return userContext;
  }

  /**
   * Construir información del lead
   */
  private buildLeadInformation(lead: any): string {
    let leadInfo = `\nINFORMACIÓN DEL LEAD:\n`;
    leadInfo += `- Nombre: ${lead.name || 'No disponible'}\n`;
    leadInfo += `- Estado: ${lead.status}\n`;
    leadInfo += `- Autorizado WhatsApp: ${lead.whatsappAuthorized ? 'Sí' : 'No'}\n`;

    if (lead.tags && lead.tags.length > 0) {
      leadInfo += `- Intereses: ${lead.tags.join(', ')}\n`;
    }

    if (lead.source) {
      leadInfo += `- Fuente: ${lead.source}\n`;
    }

    return leadInfo;
  }

  /**
   * Construir historial de conversación
   */
  private buildConversationHistory(conversationAnalysis: ConversationAnalysis): string {
    let history = `\nHISTORIAL DE CONVERSACIÓN:\n`;
    history += `- Longitud: ${conversationAnalysis.conversationLength} mensajes\n`;

    if (conversationAnalysis.previousTopics.length > 0) {
      history += `- Temas discutidos: ${conversationAnalysis.previousTopics.join(', ')}\n`;
    }

    if (conversationAnalysis.patterns.averageMessageLength > 0) {
      history += `- Longitud promedio de mensajes: ${conversationAnalysis.patterns.averageMessageLength} caracteres\n`;
    }

    return history;
  }

  /**
   * Construir sección de knowledge base
   */
  private buildKnowledgeBase(relevantKnowledge: RelevantKnowledge[]): string {
    let kb = `\nINFORMACIÓN RELEVANTE DISPONIBLE:\n`;

    relevantKnowledge.slice(0, 3).forEach((knowledge, index) => {
      kb += `${index + 1}. ${knowledge.title}:\n`;
      kb += `${knowledge.content.substring(0, 300)}${knowledge.content.length > 300 ? '...' : ''}\n\n`;
    });

    return kb;
  }

  /**
   * Construir instrucciones específicas de respuesta
   */
  private buildResponseInstructions(
    responseType: string,
    sentimentAnalysis: SentimentAnalysis
  ): string {
    let instructions = `TIPO DE RESPUESTA REQUERIDA: ${responseType}\n\n`;

    const specificInstructions = this.getTypeSpecificInstructions(responseType);
    instructions += `INSTRUCCIONES: ${specificInstructions}\n\n`;

    // Ajustar instrucciones según sentimiento
    if (sentimentAnalysis.userSentiment === 'negative') {
      instructions += `NOTA ESPECIAL: El usuario muestra sentimiento negativo. Sé empático y comprensivo.\n\n`;
    } else if (sentimentAnalysis.urgencyLevel === 'high') {
      instructions += `NOTA ESPECIAL: El usuario muestra urgencia alta. Responde de manera directa y eficiente.\n\n`;
    }

    return instructions;
  }

  /**
   * Construir sección de personalización
   */
  private buildPersonalization(personalizationElements: PersonalizationElement[]): string {
    let personalization = `PERSONALIZACIÓN:\n`;

    const nameElement = personalizationElements.find(p => p.type === 'name');
    if (nameElement) {
      personalization += `- Usa el nombre "${nameElement.value}" de manera natural en la respuesta.\n`;
    }

    const statusElement = personalizationElements.find(p => p.type === 'lead-status');
    if (statusElement) {
      personalization += `- Considera el estado del lead: ${statusElement.value}.\n`;
    }

    return personalization;
  }

  /**
   * Construir footer del prompt
   */
  private buildFooter(responseType: string): string {
    const wordLimit = this.getWordLimitForType(responseType);
    let footer = `\nMENSAJE DEL USUARIO:\n"${'{userMessage}'}"\n\n`;
    footer += `RESPUESTA (en español, profesional pero cercana, máximo ${wordLimit} palabras):`;

    return footer;
  }

  /**
   * Obtener instrucciones específicas por tipo de respuesta
   */
  private getTypeSpecificInstructions(responseType: string): string {
    const instructions = {
      greeting:
        'Responde con un saludo BREVE y natural. Presenta EscortsHub.net de forma simple. MÁXIMO 2 líneas. Sé amigable.',
      informational:
        'Proporciona información clara y útil. Usa la knowledge base disponible. Sé conciso pero completo.',
      promotional:
        'Destaca los beneficios de nuestros productos. Recomienda el Paquete Plus. Incluye precios específicos.',
      supportive:
        'Sé empático y comprensivo. Ofrece ayuda específica. Menciona nuestro soporte 24/7.',
      clarification:
        'Clarifica la información de manera simple. Usa ejemplos concretos. Pregunta si necesita más detalles.',
      fallback:
        'Proporciona una respuesta útil y profesional. Ofrece ayuda adicional si es necesario.',
    };

    return instructions[responseType as keyof typeof instructions] || instructions.fallback;
  }

  /**
   * Obtener límite de palabras por tipo
   */
  private getWordLimitForType(responseType: string): string {
    const limits = {
      greeting: '30',
      informational: '150',
      promotional: '200',
      supportive: '120',
      clarification: '100',
      fallback: '100',
    };

    return limits[responseType as keyof typeof limits] || '150';
  }

  /**
   * Generar resumen de contexto
   */
  private generateContextSummary(context: EnrichedContext): string {
    let summary = `Usuario ${context.phoneNumber}`;

    if (context.contactName) {
      summary += ` (${context.contactName})`;
    }

    if (context.lead) {
      summary += `, Lead estado: ${context.lead.status}`;
    }

    if (context.conversationHistory && context.conversationHistory.length > 0) {
      summary += `, ${context.conversationHistory.length} mensajes previos`;
    }

    return summary;
  }

  /**
   * Construir prompt de fallback
   */
  private buildFallbackPrompt(context: EnrichedContext, responseType: string): string {
    return this.buildTypeSpecificPrompt(
      responseType,
      context,
      'Usa información general sobre EscortsHub.net si es necesario.'
    );
  }

  /**
   * Calcular métricas del prompt
   */
  private calculatePromptMetrics(
    prompt: string,
    components: PromptComponents,
    startTime: number
  ): PromptMetrics {
    const totalTokens = this.estimateTokens(prompt);
    const complexity = this.assessComplexity(components);
    const personalizationScore = this.calculatePersonalizationScore(components);
    const contextRichness = this.calculateContextRichness(components);

    return {
      totalTokens,
      complexity,
      personalizationScore,
      contextRichness,
      buildTime: Date.now() - startTime,
    };
  }

  /**
   * Estimar tokens del prompt (aproximación)
   */
  private estimateTokens(text: string): number {
    // Aproximación: 1 token ≈ 4 caracteres en español
    return Math.ceil(text.length / 4);
  }

  /**
   * Evaluar complejidad del prompt
   */
  private assessComplexity(components: PromptComponents): 'low' | 'medium' | 'high' {
    let complexityScore = 0;

    if (components.leadInformation) complexityScore += 1;
    if (components.conversationHistory) complexityScore += 1;
    if (components.knowledgeBase) complexityScore += 2;
    if (components.personalization) complexityScore += 1;

    if (complexityScore >= 4) return 'high';
    if (complexityScore >= 2) return 'medium';
    return 'low';
  }

  /**
   * Calcular puntuación de personalización
   */
  private calculatePersonalizationScore(components: PromptComponents): number {
    let score = 0.5; // Base score

    if (components.personalization) score += 0.3;
    if (components.leadInformation) score += 0.2;

    return Math.min(score, 1.0);
  }

  /**
   * Calcular riqueza del contexto
   */
  private calculateContextRichness(components: PromptComponents): number {
    let richness = 0.3; // Base richness

    if (components.conversationHistory) richness += 0.2;
    if (components.knowledgeBase) richness += 0.3;
    if (components.leadInformation) richness += 0.2;

    return Math.min(richness, 1.0);
  }

  /**
   * Condensar secciones repetitivas
   */
  private condenseSections(prompt: string): string {
    // Simplificar líneas repetitivas
    return prompt.replace(/(\n-\s.+){4,}/g, match => {
      const lines = match.split('\n').filter(line => line.trim());
      return lines.slice(0, 3).join('\n') + '\n- [...]';
    });
  }

  /**
   * Reducir knowledge base
   */
  private reduceKnowledgeBase(prompt: string): string {
    return prompt.replace(
      /INFORMACIÓN RELEVANTE DISPONIBLE:[\s\S]*?(?=\n[A-Z])/g,
      'INFORMACIÓN RELEVANTE DISPONIBLE:\n[Información condensada disponible]\n\n'
    );
  }

  /**
   * Simplificar instrucciones
   */
  private simplifyInstructions(prompt: string): string {
    return prompt.replace(
      /INSTRUCCIONES:\s.{200,}/g,
      'INSTRUCCIONES: Responde de manera profesional y útil.'
    );
  }

  /**
   * Preservar elementos críticos
   */
  private preserveCriticalElements(prompt: string): string {
    // Asegurar que el mensaje del usuario y las instrucciones básicas se mantengan
    if (!prompt.includes('MENSAJE DEL USUARIO:')) {
      prompt += '\n\nMENSAJE DEL USUARIO: "{userMessage}"\n\nRESPUESTA:';
    }

    return prompt;
  }
}

// Exportar instancia singleton
export default new PromptBuilder();
