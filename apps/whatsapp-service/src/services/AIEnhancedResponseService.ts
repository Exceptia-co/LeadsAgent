import { logger } from '../utils/logger';
import DatabaseService, { Lead, ConversationHistory } from './DatabaseService';
import WhatsAppAuthorizationService from './WhatsAppAuthorizationService';
import { TrainingInteraction } from './AILearningService';

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
  responseType: 'greeting' | 'informational' | 'promotional' | 'supportive' | 'clarification' | 'fallback';
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
 * Servicio mejorado de respuestas automáticas de IA
 * 
 * Este servicio optimiza las respuestas de IA incluyendo:
 * - Mejor análisis del contexto de la conversación
 * - Personalización basada en el perfil del lead
 * - Análisis del historial de conversación
 * - Integración con el sistema de autorización
 * - Aprendizaje automático basado en interacciones previas
 */
class AIEnhancedResponseService {

  private config = {
    maxContextMessages: 10,
    defaultConfidenceThreshold: 0.6,
    enablePersonalization: true,
    enableContextAnalysis: true,
    enableSentimentAnalysis: true,
    knowledgeBaseSearchLimit: 5,
    conversationMemoryDays: 30
  };

  constructor() {
    this.loadConfiguration();
  }

  /**
   * Método principal para generar una respuesta mejorada de IA
   */
  public async generateEnhancedResponse(context: AIResponseContext): Promise<AIResponseResult> {
    const startTime = Date.now();
    
    logger.info('🧠 Generando respuesta mejorada de IA', {
      phoneNumber: context.phoneNumber,
      sessionId: context.sessionId,
      userMessage: context.userMessage.substring(0, 100),
      hasLead: !!context.lead
    });

    try {
      // 1. Enriquecer contexto con información del lead si no existe
      const enrichedContext = await this.enrichContext(context);
      
      // 2. Analizar el historial de conversación
      const conversationAnalysis = await this.analyzeConversationHistory(enrichedContext);
      
      // 3. Realizar análisis de sentimiento del mensaje
      const sentimentAnalysis = this.analyzeSentiment(enrichedContext.userMessage);
      
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
      const personalizationElements = this.generatePersonalizationElements(enrichedContext);
      
      // 7. Construir el prompt contextualizado
      const contextualizedPrompt = this.buildContextualizedPrompt({
        context: enrichedContext,
        conversationAnalysis,
        sentimentAnalysis,
        relevantKnowledge,
        responseType,
        personalizationElements
      });
      
      // 8. Generar la respuesta usando el sistema existente (simulado)
      const baseResponse = await this.generateBaseResponse(contextualizedPrompt);
      
      // 9. Post-procesar y personalizar la respuesta
      const finalResponse = this.personalizeResponse(
        baseResponse,
        personalizationElements,
        enrichedContext
      );
      
      // 10. Evaluar calidad y confianza de la respuesta
      const qualityMetrics = this.evaluateResponseQuality(
        finalResponse,
        enrichedContext,
        relevantKnowledge
      );
      
      // 11. Crear el resultado final
      const result: AIResponseResult = {
        response: finalResponse,
        confidence: qualityMetrics.confidence,
        responseType,
        personalizedElements: personalizationElements.map(p => p.type),
        knowledgeBaseUsed: relevantKnowledge.map(kb => kb.id),
        contextFactors: conversationAnalysis.contextFactors,
        shouldContinueConversation: this.shouldContinueConversation(
          responseType, 
          conversationAnalysis, 
          sentimentAnalysis
        ),
        suggestedFollowUp: this.generateFollowUpSuggestion(responseType, enrichedContext),
        metadata: {
          processingTime: Date.now() - startTime,
          leadInfo: enrichedContext.lead ? {
            id: enrichedContext.lead.id,
            name: enrichedContext.lead.name,
            status: enrichedContext.lead.status,
            tags: enrichedContext.lead.tags
          } : undefined,
          conversationStage: conversationAnalysis.stage,
          sentimentAnalysis
        }
      };
      
      // 12. Registrar interacción para aprendizaje automático
      await this.recordTrainingInteraction(enrichedContext, result);
      
      logger.info(`🧠 Respuesta IA generada: ${result.responseType}`, {
        confidence: result.confidence,
        personalizedElements: result.personalizedElements.length,
        knowledgeBaseUsed: result.knowledgeBaseUsed.length,
        processingTime: result.metadata.processingTime,
        conversationStage: result.metadata.conversationStage
      });
      
      return result;
      
    } catch (error) {
      logger.error('❌ Error generando respuesta mejorada de IA:', error);
      
      // Respuesta de fallback
      return this.generateFallbackResponse(context, Date.now() - startTime);
    }
  }

  /**
   * Enriquecer el contexto con información adicional del lead
   */
  private async enrichContext(context: AIResponseContext): Promise<AIResponseContext> {
    let enrichedContext = { ...context };
    
    try {
      // Si no tenemos información del lead, buscarla
      if (!enrichedContext.lead) {
        const lead = await DatabaseService.findLeadByPhone(context.phoneNumber);
        if (lead) {
          enrichedContext.lead = lead;
          enrichedContext.contactName = enrichedContext.contactName || lead.name || undefined;
        }
      }
      
      // Si no tenemos historial de conversación, obtenerlo
      if (!enrichedContext.conversationHistory) {
        enrichedContext.conversationHistory = await DatabaseService.getConversationHistory(
          context.phoneNumber,
          this.config.maxContextMessages
        );
      }
      
      // Determinar si es el primer mensaje de la conversación
      if (!enrichedContext.messageMetadata?.isFirstMessage) {
        const isFirst = !enrichedContext.conversationHistory || 
                       enrichedContext.conversationHistory.length === 0;
        
        enrichedContext.messageMetadata = {
          ...enrichedContext.messageMetadata,
          timestamp: new Date(),
          messageType: 'text',
          isFirstMessage: isFirst
        };
      }
      
    } catch (error) {
      logger.warn('Error enriqueciendo contexto:', error);
    }
    
    return enrichedContext;
  }

  /**
   * Analizar el historial de conversación para determinar el estado
   */
  private async analyzeConversationHistory(context: AIResponseContext): Promise<{
    stage: 'initial' | 'engaged' | 'interested' | 'qualifying' | 'closing';
    contextFactors: string[];
    previousTopics: string[];
    userEngagement: 'high' | 'medium' | 'low';
    conversationLength: number;
  }> {
    const contextFactors: string[] = [];
    const previousTopics: string[] = [];
    const history = context.conversationHistory || [];
    
    // Analizar longitud de la conversación
    const conversationLength = history.length;
    
    if (conversationLength === 0) {
      contextFactors.push('first-interaction');
    } else if (conversationLength > 10) {
      contextFactors.push('long-conversation');
    } else if (conversationLength > 3) {
      contextFactors.push('engaged-conversation');
    }
    
    // Analizar temas anteriores mencionados
    const messageTexts = history
      .filter(h => h.messageText)
      .map(h => h.messageText!.toLowerCase());
    
    // Detectar temas de interés
    const topicKeywords = {
      pricing: ['precio', 'coste', 'cuesta', 'tarifa', 'pago', 'moneda', 'hub'],
      products: ['producto', 'anuncio', 'doble', 'top', 'historia', 'disponible'],
      registration: ['registro', 'cuenta', 'crear', 'inscrib', 'sign'],
      support: ['ayuda', 'problema', 'error', 'soporte', 'duda']
    };
    
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      const mentioned = messageTexts.some(text => 
        keywords.some(keyword => text.includes(keyword))
      );
      
      if (mentioned) {
        previousTopics.push(topic);
        contextFactors.push(`discussed-${topic}`);
      }
    }
    
    // Determinar nivel de engagement
    let userEngagement: 'high' | 'medium' | 'low' = 'low';
    
    if (conversationLength > 5) {
      userEngagement = 'high';
    } else if (conversationLength > 2) {
      userEngagement = 'medium';
    }
    
    // Determinar etapa de la conversación
    let stage: 'initial' | 'engaged' | 'interested' | 'qualifying' | 'closing' = 'initial';
    
    if (conversationLength === 0) {
      stage = 'initial';
    } else if (previousTopics.includes('pricing') || previousTopics.includes('registration')) {
      stage = 'qualifying';
    } else if (previousTopics.length > 1) {
      stage = 'interested';
    } else if (conversationLength > 2) {
      stage = 'engaged';
    }
    
    return {
      stage,
      contextFactors,
      previousTopics,
      userEngagement,
      conversationLength
    };
  }

  /**
   * Análisis de sentimiento básico del mensaje del usuario
   */
  private analyzeSentiment(userMessage: string): {
    userSentiment: 'positive' | 'neutral' | 'negative';
    urgencyLevel: 'low' | 'medium' | 'high';
  } {
    const message = userMessage.toLowerCase();
    
    // Palabras positivas
    const positiveWords = [
      'gracias', 'perfecto', 'excelente', 'genial', 'bueno', 'me gusta',
      'interesante', 'fantástico', 'bien', 'sí', 'ok', 'vale'
    ];
    
    // Palabras negativas
    const negativeWords = [
      'no', 'malo', 'terrible', 'problema', 'error', 'difícil',
      'confuso', 'caro', 'costoso', 'imposible'
    ];
    
    // Palabras de urgencia
    const urgentWords = [
      'urgente', 'rápido', 'inmediato', 'ya', 'ahora', 'pronto',
      'necesito', 'importante', 'emergencia'
    ];
    
    // Calcular sentimiento
    const positiveCount = positiveWords.filter(word => message.includes(word)).length;
    const negativeCount = negativeWords.filter(word => message.includes(word)).length;
    const urgentCount = urgentWords.filter(word => message.includes(word)).length;
    
    let userSentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
    if (positiveCount > negativeCount) {
      userSentiment = 'positive';
    } else if (negativeCount > positiveCount) {
      userSentiment = 'negative';
    }
    
    let urgencyLevel: 'low' | 'medium' | 'high' = 'low';
    if (urgentCount > 2) {
      urgencyLevel = 'high';
    } else if (urgentCount > 0) {
      urgencyLevel = 'medium';
    }
    
    return { userSentiment, urgencyLevel };
  }

  /**
   * Buscar conocimiento relevante en la knowledge base
   */
  private async searchRelevantKnowledge(
    userMessage: string, 
    lead?: Lead
  ): Promise<Array<{ id: string; title: string; content: string; relevance: number }>> {
    try {
      const results = await DatabaseService.searchKnowledgeBase(userMessage);
      
      return results.map(result => ({
        id: result.id,
        title: result.title,
        content: result.content,
        relevance: result.relevance_score || 0
      })).slice(0, this.config.knowledgeBaseSearchLimit);
      
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
    conversationAnalysis: any,
    sentimentAnalysis: any
  ): 'greeting' | 'informational' | 'promotional' | 'supportive' | 'clarification' | 'fallback' {
    const message = userMessage.toLowerCase().trim();
    
    // Detectar saludos específicos primero, independientemente del historial
    const greetingKeywords = ['hola', 'hi', 'buenas', 'buenos', 'hey', 'hello', 'saludos', 'que tal'];
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
    if (words.length <= 3) { // Solo hasta 3 palabras
      return keywords.some(keyword => words.includes(keyword));
    }
    
    return false;
  }

  /**
   * Generar elementos de personalización
   */
  private generatePersonalizationElements(context: AIResponseContext): Array<{
    type: string;
    value: string;
    confidence: number;
  }> {
    const elements: Array<{ type: string; value: string; confidence: number }> = [];
    
    // Nombre del contacto
    if (context.contactName || context.lead?.name) {
      elements.push({
        type: 'name',
        value: context.contactName || context.lead!.name!,
        confidence: 0.9
      });
    }
    
    // Estado del lead
    if (context.lead?.status) {
      elements.push({
        type: 'lead-status',
        value: context.lead.status,
        confidence: 0.8
      });
    }
    
    // Tags del lead
    if (context.lead?.tags && context.lead.tags.length > 0) {
      elements.push({
        type: 'interests',
        value: context.lead.tags.join(', '),
        confidence: 0.7
      });
    }
    
    // Fuente del lead
    if (context.lead?.source) {
      elements.push({
        type: 'source',
        value: context.lead.source,
        confidence: 0.6
      });
    }
    
    return elements;
  }

  /**
   * Construir prompt contextualizado
   */
  private buildContextualizedPrompt(options: {
    context: AIResponseContext;
    conversationAnalysis: any;
    sentimentAnalysis: any;
    relevantKnowledge: any[];
    responseType: string;
    personalizationElements: any[];
  }): string {
    const { context, conversationAnalysis, sentimentAnalysis, relevantKnowledge, responseType, personalizationElements } = options;
    
    let prompt = `Eres un asistente virtual profesional de EscortsHub.net. Tu tarea es responder al siguiente mensaje de WhatsApp.\n\n`;
    
    // Contexto del usuario
    prompt += `CONTEXTO DEL USUARIO:\n`;
    prompt += `- Teléfono: ${context.phoneNumber}\n`;
    prompt += `- Etapa de conversación: ${conversationAnalysis.stage}\n`;
    prompt += `- Nivel de engagement: ${conversationAnalysis.userEngagement}\n`;
    prompt += `- Sentimiento detectado: ${sentimentAnalysis.userSentiment}\n`;
    prompt += `- Nivel de urgencia: ${sentimentAnalysis.urgencyLevel}\n`;
    
    // Información del lead si está disponible
    if (context.lead) {
      prompt += `\nINFORMACIÓN DEL LEAD:\n`;
      prompt += `- Nombre: ${context.lead.name || 'No disponible'}\n`;
      prompt += `- Estado: ${context.lead.status}\n`;
      prompt += `- Autorizado WhatsApp: ${context.lead.whatsappAuthorized ? 'Sí' : 'No'}\n`;
      if (context.lead.tags && context.lead.tags.length > 0) {
        prompt += `- Intereses: ${context.lead.tags.join(', ')}\n`;
      }
    }
    
    // Temas previos discutidos
    if (conversationAnalysis.previousTopics.length > 0) {
      prompt += `\nTEMAS PREVIAMENTE DISCUTIDOS:\n`;
      prompt += conversationAnalysis.previousTopics.map((topic: any) => `- ${topic}`).join('\n');
      prompt += '\n';
    }
    
    // Información relevante de la knowledge base
    if (relevantKnowledge.length > 0) {
      prompt += `\nINFORMACIÓN RELEVANTE DISPONIBLE:\n`;
      relevantKnowledge.forEach((kb, index) => {
        prompt += `${index + 1}. ${kb.title}:\n${kb.content.substring(0, 500)}\n\n`;
      });
    }
    
    // Tipo de respuesta requerida
    prompt += `TIPO DE RESPUESTA REQUERIDA: ${responseType}\n\n`;
    
    // Instrucciones específicas según el tipo
    switch (responseType) {
      case 'greeting':
        prompt += `INSTRUCCIONES: Responde con un saludo BREVE y natural. Presenta EscortsHub.net de forma simple. MÁXIMO 2 líneas. Sé amigable.\n\n`;
        break;
      case 'informational':
        prompt += `INSTRUCCIONES: Proporciona información clara y útil. Usa la knowledge base disponible. Sé conciso pero completo.\n\n`;
        break;
      case 'promotional':
        prompt += `INSTRUCCIONES: Destaca los beneficios de nuestros productos. Recomienda el Paquete Plus. Incluye precios específicos.\n\n`;
        break;
      case 'supportive':
        prompt += `INSTRUCCIONES: Sé empático y comprensivo. Ofrece ayuda específica. Menciona nuestro soporte 24/7.\n\n`;
        break;
      case 'clarification':
        prompt += `INSTRUCCIONES: Clarifica la información de manera simple. Usa ejemplos concretos. Pregunta si necesita más detalles.\n\n`;
        break;
    }
    
    // Personalización
    if (personalizationElements.length > 0) {
      const name = personalizationElements.find(p => p.type === 'name');
      if (name) {
        prompt += `PERSONALIZACIÓN: Usa el nombre "${name.value}" de manera natural en la respuesta.\n\n`;
      }
    }
    
    // Mensaje del usuario
    prompt += `MENSAJE DEL USUARIO:\n"${context.userMessage}"\n\n`;
    
    // Ajustar límite de palabras según tipo de respuesta
    const wordLimit = responseType === 'greeting' ? '30 palabras' : '200 palabras';
    prompt += `RESPUESTA (en español, profesional pero cercana, máximo ${wordLimit}):`;
    
    return prompt;
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
   * Personalizar la respuesta final
   */
  private personalizeResponse(
    baseResponse: string,
    personalizationElements: any[],
    context: AIResponseContext
  ): string {
    let personalizedResponse = baseResponse;
    
    // Agregar nombre si está disponible y no está ya en la respuesta
    const nameElement = personalizationElements.find(p => p.type === 'name');
    if (nameElement && !personalizedResponse.toLowerCase().includes(nameElement.value.toLowerCase())) {
      // Insertar nombre de manera natural
      if (personalizedResponse.startsWith('¡Hola!')) {
        personalizedResponse = personalizedResponse.replace('¡Hola!', `¡Hola ${nameElement.value}!`);
      } else if (!personalizedResponse.toLowerCase().includes('hola')) {
        personalizedResponse = `Hola ${nameElement.value}, ${personalizedResponse.charAt(0).toLowerCase()}${personalizedResponse.slice(1)}`;
      }
    }
    
    // Agregar contexto específico del lead si es apropiado
    const leadStatusElement = personalizationElements.find(p => p.type === 'lead-status');
    if (leadStatusElement && leadStatusElement.value === 'GANADO') {
      personalizedResponse += '\n\nGracias por confiar en nosotros nuevamente. 🌟';
    } else if (leadStatusElement && leadStatusElement.value === 'QUALIFIED') {
      personalizedResponse += '\n\n¿Te gustaría que revisemos tu progreso desde la última vez?';
    }
    
    return personalizedResponse;
  }

  /**
   * Evaluar calidad de la respuesta
   */
  private evaluateResponseQuality(
    response: string,
    context: AIResponseContext,
    knowledgeUsed: any[]
  ): { confidence: number; factors: string[] } {
    let confidence = 0.5;
    const factors: string[] = [];
    
    // Longitud apropiada
    if (response.length >= 50 && response.length <= 500) {
      confidence += 0.1;
      factors.push('appropriate-length');
    }
    
    // Uso de knowledge base
    if (knowledgeUsed.length > 0) {
      confidence += 0.2;
      factors.push('knowledge-base-used');
    }
    
    // Personalización
    const nameInResponse = context.contactName && 
      response.toLowerCase().includes(context.contactName.toLowerCase());
    if (nameInResponse) {
      confidence += 0.1;
      factors.push('personalized');
    }
    
    // Incluye información específica de EscortsHub
    const escortsHubKeywords = ['escortshub', 'hub', 'monedas', 'anuncio', 'paquete'];
    const hasSpecificInfo = escortsHubKeywords.some(keyword => 
      response.toLowerCase().includes(keyword)
    );
    if (hasSpecificInfo) {
      confidence += 0.15;
      factors.push('specific-information');
    }
    
    // Call-to-action presente
    const hasCallToAction = /[?¿]/.test(response);
    if (hasCallToAction) {
      confidence += 0.05;
      factors.push('call-to-action');
    }
    
    return { confidence: Math.min(confidence, 1), factors };
  }

  /**
   * Determinar si debe continuar la conversación
   */
  private shouldContinueConversation(
    responseType: string,
    conversationAnalysis: any,
    sentimentAnalysis: any
  ): boolean {
    // Siempre continuar si es positivo o neutral
    if (sentimentAnalysis.userSentiment !== 'negative') {
      return true;
    }
    
    // Continuar si está en etapas avanzadas
    if (['interested', 'qualifying', 'closing'].includes(conversationAnalysis.stage)) {
      return true;
    }
    
    // Continuar si el tipo de respuesta es de soporte
    if (responseType === 'supportive') {
      return true;
    }
    
    return false;
  }

  /**
   * Generar sugerencia de seguimiento
   */
  private generateFollowUpSuggestion(responseType: string, context: AIResponseContext): string | undefined {
    switch (responseType) {
      case 'greeting':
        return '¿Te gustaría conocer nuestros precios o necesitas ayuda con el registro?';
      case 'informational':
        return '¿Hay algo más específico que te gustaría saber?';
      case 'promotional':
        return '¿Te ayudo con el proceso de registro para empezar?';
      case 'supportive':
        return '¿Hay algo más en lo que pueda ayudarte?';
      default:
        return undefined;
    }
  }

  /**
   * Registrar interacción para aprendizaje automático
   */
  private async recordTrainingInteraction(
    context: AIResponseContext,
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
          leadId: (context as any).lead?.id,
          responseType: result.responseType,
          conversationStage: result.metadata.conversationStage
        },
        feedbackMetrics: {
          // processingTime: result.metadata.processingTime, // Commentado temporalmente
          personalizedElements: result.personalizedElements.length,
          contextFactors: result.contextFactors.length,
          shouldContinue: result.shouldContinueConversation
        },
        timestamp: new Date()
      };
      
      await DatabaseService.saveTrainingInteraction(interaction);
      
    } catch (error) {
      logger.warn('Error guardando interacción de entrenamiento:', error);
    }
  }

  /**
   * Generar respuesta de fallback
   */
  private generateFallbackResponse(context: AIResponseContext, processingTime: number): AIResponseResult {
    const fallbackMessage = context.contactName 
      ? `Hola ${context.contactName}, gracias por tu mensaje. Nuestro soporte especializado está disponible 24/7 para ayudarte. ¿Podrías ser más específico sobre lo que necesitas?`
      : 'Gracias por tu mensaje. Nuestro soporte especializado está disponible 24/7 para ayudarte. ¿Podrías ser más específico sobre lo que necesitas?';
    
    return {
      response: fallbackMessage,
      confidence: 0.3,
      responseType: 'fallback',
      personalizedElements: context.contactName ? ['name'] : [],
      knowledgeBaseUsed: [],
      contextFactors: ['system-error'],
      shouldContinueConversation: true,
      metadata: {
        processingTime,
        conversationStage: 'initial'
      }
    };
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
          clarification: 0.1
        },
        averageProcessingTime: 250, // ms
        personalizationRate: 0.75
      };
      
    } catch (error) {
      logger.error('Error obteniendo métricas del servicio:', error);
      return {
        totalInteractions: 0,
        averageConfidence: 0,
        responseTypeDistribution: {},
        averageProcessingTime: 0,
        personalizationRate: 0
      };
    }
  }
}

// Exportar instancia singleton
export default new AIEnhancedResponseService();
