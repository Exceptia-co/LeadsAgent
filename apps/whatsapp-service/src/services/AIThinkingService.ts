import { logger } from '../utils/logger';
import advancedLogger from '../utils/advancedLogger';
import AIService, { AIResponse, MessageContext } from './AIService';
import DatabaseService from './DatabaseService';

// ============================================
// INTERFACES Y TIPOS
// ============================================

export interface IntentAnalysis {
  intent: string;
  confidence: number;
  entities: Record<string, any>;
  sentiment: 'positive' | 'negative' | 'neutral';
  urgency: 'low' | 'medium' | 'high';
  category: string;
  subcategory?: string;
}

export interface ThinkingStep {
  step: number;
  type: 'analysis' | 'reasoning' | 'knowledge_retrieval' | 'decision' | 'validation';
  title: string;
  content: string;
  confidence: number;
  data?: any;
}

export interface ThoughtProcess {
  steps: ThinkingStep[];
  finalDecision: string;
  confidence: number;
  reasoning: string;
  shouldRespond: boolean;
  responseStrategy: ResponseStrategy;
  estimatedComplexity: 'simple' | 'medium' | 'complex';
  processingTimeMs: number;
}

export interface ResponseStrategy {
  type: 'direct' | 'contextual' | 'escalate' | 'defer' | 'clarify';
  tone: 'professional' | 'friendly' | 'technical' | 'sales' | 'supportive';
  length: 'brief' | 'medium' | 'detailed';
  shouldQuote: boolean;
  shouldUseEmojis: boolean;
  priority: 'low' | 'medium' | 'high';
  templateCategory?: string;
}

export interface EnrichedContext extends MessageContext {
  messageText?: string; // El mensaje actual
  leadProfile?: any;
  conversationSummary?: string;
  previousIntents: IntentAnalysis[];
  messageHistory: Array<{
    message: string;
    intent?: string;
    timestamp: Date;
    isFromUser: boolean;
  }>;
  currentConversationFlow?: string;
  userEngagementLevel: 'low' | 'medium' | 'high';
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: 'weekday' | 'weekend';
}

// ============================================
// CLASE PRINCIPAL DEL SISTEMA DE PENSAMIENTO
// ============================================

class AIThinkingService {
  private static instance: AIThinkingService;

  // Cache para optimizar rendimiento
  private intentCache: Map<string, IntentAnalysis> = new Map();
  private knowledgeCache: Map<string, any[]> = new Map();
  
  private constructor() {}

  public static getInstance(): AIThinkingService {
    if (!AIThinkingService.instance) {
      AIThinkingService.instance = new AIThinkingService();
    }
    return AIThinkingService.instance;
  }

  // ============================================
  // MÉTODO PRINCIPAL: PROCESAMIENTO CON PENSAMIENTO
  // ============================================

  public async processWithThinking(
    message: string,
    context: MessageContext
  ): Promise<AIResponse & { thinkingProcess: ThoughtProcess }> {
    const startTime = Date.now();
    logger.info('🧠 [THINKING] Starting structured thinking process for message:', {
      message: message.substring(0, 100),
      phoneNumber: context.phoneNumber
    });

    try {
      // 1. ENRIQUECER CONTEXTO
      const enrichedContext = await this.enrichContext(context, message);
      
      // 2. INICIALIZAR PROCESO DE PENSAMIENTO
      const thoughtProcess: ThoughtProcess = {
        steps: [],
        finalDecision: '',
        confidence: 0,
        reasoning: '',
        shouldRespond: false,
        responseStrategy: {
          type: 'direct',
          tone: 'friendly',
          length: 'medium',
          shouldQuote: false,
          shouldUseEmojis: true,
          priority: 'medium'
        },
        estimatedComplexity: 'simple',
        processingTimeMs: 0
      };

      // 3. PASO 1: ANÁLISIS DE INTENCIÓN
      const intentStep = await this.performIntentAnalysis(message, enrichedContext);
      thoughtProcess.steps.push(intentStep);
      
      const intentAnalysis = intentStep.data as IntentAnalysis;

      // 4. PASO 2: RECUPERACIÓN DE CONOCIMIENTO RELEVANTE
      const knowledgeStep = await this.performKnowledgeRetrieval(message, intentAnalysis);
      thoughtProcess.steps.push(knowledgeStep);

      // 5. PASO 3: ANÁLISIS DE CONTEXTO Y HISTORIAL
      const contextStep = await this.performContextAnalysis(enrichedContext, intentAnalysis);
      thoughtProcess.steps.push(contextStep);

      // 6. PASO 4: DETERMINACIÓN DE ESTRATEGIA DE RESPUESTA
      const strategyStep = await this.determineResponseStrategy(
        intentAnalysis, 
        enrichedContext, 
        knowledgeStep.data
      );
      thoughtProcess.steps.push(strategyStep);
      thoughtProcess.responseStrategy = strategyStep.data as ResponseStrategy;

      // 7. PASO 5: DECISIÓN FINAL
      const decisionStep = await this.makeFinalDecision(thoughtProcess.steps, enrichedContext);
      thoughtProcess.steps.push(decisionStep);
      
      thoughtProcess.shouldRespond = decisionStep.data.shouldRespond;
      thoughtProcess.finalDecision = decisionStep.content;
      thoughtProcess.confidence = this.calculateOverallConfidence(thoughtProcess.steps);
      thoughtProcess.reasoning = this.generateReasoningExplanation(thoughtProcess.steps);

      // 8. GENERAR RESPUESTA SI ES NECESARIO
      let aiResponse: AIResponse;
      
      if (thoughtProcess.shouldRespond) {
        const responseStep = await this.generateContextualResponse(
          message, 
          enrichedContext, 
          intentAnalysis, 
          thoughtProcess.responseStrategy,
          knowledgeStep.data
        );
        thoughtProcess.steps.push(responseStep);
        aiResponse = responseStep.data as AIResponse;
      } else {
        // No responder (pero registrar la decisión)
        aiResponse = {
          success: false,
          error: `Decision: ${thoughtProcess.finalDecision}`,
          provider: AIService.getCurrentProvider() as any
        };
      }

      // 9. FINALIZAR PROCESO
      thoughtProcess.processingTimeMs = Date.now() - startTime;
      thoughtProcess.estimatedComplexity = this.estimateComplexity(thoughtProcess.steps);

      // 10. REGISTRAR ANÁLISIS PARA APRENDIZAJE FUTURO
      await this.saveThinkingProcess(context.phoneNumber || 'unknown', message, thoughtProcess);

      // 11. LOG AVANZADO DE LA DECISIÓN AI
      const decisionData = decisionStep.data;
      const decisionType = thoughtProcess.shouldRespond ? 'RESPOND' : 'NO_RESPONSE';
      
      advancedLogger.logAIDecision({
        messageText: message,
        intent: intentAnalysis.intent,
        confidence: thoughtProcess.confidence,
        decision: decisionType,
        reasons: decisionData?.reasons || [],
        processingTimeMs: thoughtProcess.processingTimeMs,
        knowledgeUsed: knowledgeStep.data?.map((k: any) => k.title || k.category) || [],
        contextData: {
          sessionId: context.sessionId,
          phoneNumber: context.phoneNumber,
          leadId: enrichedContext.leadProfile?.id,
          hasHistory: enrichedContext.messageHistory?.length > 0,
          timeOfDay: enrichedContext.timeOfDay,
          engagementLevel: enrichedContext.userEngagementLevel,
          strategy: thoughtProcess.responseStrategy
        }
      }, {
        sessionId: context.sessionId,
        phoneNumber: context.phoneNumber,
        operation: 'ai-thinking-process'
      });

      logger.info('🧠 [THINKING] Process completed:', {
        shouldRespond: thoughtProcess.shouldRespond,
        confidence: thoughtProcess.confidence,
        processingTimeMs: thoughtProcess.processingTimeMs,
        steps: thoughtProcess.steps.length
      });

      return {
        ...aiResponse,
        thinkingProcess: thoughtProcess
      };

    } catch (error) {
      logger.error('🧠 [THINKING] Error in thinking process:', error);
      
      // Fallback a respuesta directa en caso de error
      const fallbackResponse = await AIService.generateResponse(message, context);
      
      return {
        ...fallbackResponse,
        thinkingProcess: {
          steps: [{
            step: 1,
            type: 'analysis',
            title: 'Error Fallback',
            content: 'Error en proceso de pensamiento, usando respuesta directa',
            confidence: 0.3,
            data: { error: error instanceof Error ? error.message : 'Unknown error' }
          }],
          finalDecision: 'Respuesta directa por error',
          confidence: 0.3,
          reasoning: 'Fallback debido a error en el sistema de pensamiento',
          shouldRespond: fallbackResponse.success,
          responseStrategy: {
            type: 'direct',
            tone: 'friendly',
            length: 'medium',
            shouldQuote: false,
            shouldUseEmojis: true,
            priority: 'medium'
          },
          estimatedComplexity: 'simple',
          processingTimeMs: Date.now() - startTime
        }
      };
    }
  }

  // ============================================
  // MÉTODOS DE ANÁLISIS ESPECÍFICOS
  // ============================================

  private async performIntentAnalysis(
    message: string, 
    context: EnrichedContext
  ): Promise<ThinkingStep> {
    const stepStart = Date.now();
    
    try {
      // Verificar cache primero
      const cacheKey = `${message.toLowerCase().trim()}_${context.phoneNumber}`;
      if (this.intentCache.has(cacheKey)) {
        const cachedIntent = this.intentCache.get(cacheKey)!;
        return {
          step: 1,
          type: 'analysis',
          title: 'Análisis de Intención (Cache)',
          content: `Intención detectada: ${cachedIntent.intent} (${(cachedIntent.confidence * 100).toFixed(1)}% confianza)`,
          confidence: cachedIntent.confidence,
          data: cachedIntent
        };
      }

      // Usar el método existente de AIService mejorado
      const intentAnalysis = await this.analyzeIntentEnhanced(message, context);
      
      // Cachear resultado
      this.intentCache.set(cacheKey, intentAnalysis);
      
      // Limpiar cache si es muy grande (máximo 1000 entradas)
      if (this.intentCache.size > 1000) {
        const oldestKeys = Array.from(this.intentCache.keys()).slice(0, 200);
        oldestKeys.forEach(key => this.intentCache.delete(key));
      }

      return {
        step: 1,
        type: 'analysis',
        title: 'Análisis de Intención',
        content: `Mensaje analizado en ${Date.now() - stepStart}ms. Intención: ${intentAnalysis.intent} (${(intentAnalysis.confidence * 100).toFixed(1)}% confianza). Sentimiento: ${intentAnalysis.sentiment}. Urgencia: ${intentAnalysis.urgency}.`,
        confidence: intentAnalysis.confidence,
        data: intentAnalysis
      };
    } catch (error) {
      logger.error('Error in intent analysis:', error);
      
      // Fallback intent analysis
      const fallbackIntent: IntentAnalysis = {
        intent: 'general_inquiry',
        confidence: 0.5,
        entities: {},
        sentiment: 'neutral',
        urgency: 'medium',
        category: 'general'
      };

      return {
        step: 1,
        type: 'analysis',
        title: 'Análisis de Intención (Fallback)',
        content: 'Error en análisis detallado, usando análisis básico',
        confidence: 0.5,
        data: fallbackIntent
      };
    }
  }

  private async performKnowledgeRetrieval(
    message: string, 
    intentAnalysis: IntentAnalysis
  ): Promise<ThinkingStep> {
    const stepStart = Date.now();
    
    try {
      // Buscar conocimiento relevante en la base de datos
      let relevantKnowledge: any[] = [];
      
      // 1. Búsqueda basada en el mensaje
      const messageBasedKnowledge = await DatabaseService.searchKnowledgeBase(message);
      
      // 2. Búsqueda basada en la intención y categoría
      const intentBasedKnowledge = await DatabaseService.getKnowledgeBase(intentAnalysis.category);
      
      // 3. Combinar y filtrar conocimiento
      relevantKnowledge = [
        ...messageBasedKnowledge,
        ...intentBasedKnowledge
      ].filter((item, index, self) => 
        index === self.findIndex(t => t.id === item.id)
      ).slice(0, 5); // Limitar a 5 elementos más relevantes

      const content = relevantKnowledge.length > 0
        ? `Encontrado ${relevantKnowledge.length} elementos de conocimiento relevante en ${Date.now() - stepStart}ms`
        : `Sin conocimiento específico encontrado para la consulta en ${Date.now() - stepStart}ms`;

      return {
        step: 2,
        type: 'knowledge_retrieval',
        title: 'Recuperación de Conocimiento',
        content,
        confidence: relevantKnowledge.length > 0 ? 0.8 : 0.3,
        data: relevantKnowledge
      };
    } catch (error) {
      logger.error('Error in knowledge retrieval:', error);
      
      return {
        step: 2,
        type: 'knowledge_retrieval',
        title: 'Recuperación de Conocimiento (Error)',
        content: 'Error accediendo al knowledge base',
        confidence: 0.2,
        data: []
      };
    }
  }

  private async performContextAnalysis(
    context: EnrichedContext,
    intentAnalysis: IntentAnalysis
  ): Promise<ThinkingStep> {
    const stepStart = Date.now();
    
    try {
      let analysisPoints: string[] = [];
      let contextConfidence = 0.7; // Base confidence

      // Análisis del historial de conversación
      if (context.messageHistory && context.messageHistory.length > 0) {
        analysisPoints.push(`Historial: ${context.messageHistory.length} mensajes previos`);
        
        // Buscar patrones en mensajes previos
        const recentIntents = context.previousIntents || [];
        if (recentIntents.length > 0) {
          const lastIntent = recentIntents[recentIntents.length - 1];
          if (lastIntent.intent === intentAnalysis.intent) {
            analysisPoints.push(`Continuación de tema: ${lastIntent.intent}`);
            contextConfidence += 0.1;
          }
        }
      } else {
        analysisPoints.push('Primera interacción detectada');
        contextConfidence -= 0.1;
      }

      // Análisis temporal
      const timeContext = this.analyzeTimeContext();
      analysisPoints.push(`Contexto temporal: ${timeContext.timeOfDay}, ${timeContext.dayOfWeek}`);

      // Análisis del perfil del lead
      if (context.leadProfile) {
        analysisPoints.push(`Lead identificado: ${context.leadProfile.name || 'Sin nombre'}`);
        contextConfidence += 0.1;
      }

      // Análisis del nivel de engagement
      const engagementLevel = this.calculateEngagementLevel(context);
      analysisPoints.push(`Nivel de engagement: ${engagementLevel}`);

      return {
        step: 3,
        type: 'analysis',
        title: 'Análisis de Contexto',
        content: `Contexto analizado en ${Date.now() - stepStart}ms: ${analysisPoints.join(', ')}`,
        confidence: Math.min(contextConfidence, 1.0),
        data: {
          analysisPoints,
          timeContext,
          engagementLevel,
          hasHistory: (context.messageHistory?.length || 0) > 0
        }
      };
    } catch (error) {
      logger.error('Error in context analysis:', error);
      
      return {
        step: 3,
        type: 'analysis',
        title: 'Análisis de Contexto (Error)',
        content: 'Error analizando contexto de conversación',
        confidence: 0.3,
        data: {}
      };
    }
  }

  private async determineResponseStrategy(
    intentAnalysis: IntentAnalysis,
    context: EnrichedContext,
    knowledgeData: any[]
  ): Promise<ThinkingStep> {
    const stepStart = Date.now();
    
    try {
      const strategy: ResponseStrategy = {
        type: 'direct',
        tone: 'friendly',
        length: 'medium',
        shouldQuote: false,
        shouldUseEmojis: true,
        priority: 'medium'
      };

      let strategyReasons: string[] = [];
      
      // 0. Verificar si es un saludo simple (override de la lógica de knowledge base)
      const isGreeting = await this.isGreetingMessage(context.messageText || '');
      if (isGreeting) {
        strategy.type = 'contextual';
        strategy.tone = 'friendly';
        strategy.length = 'medium';
        strategyReasons.push('Saludo detectado: respuesta automática de bienvenida');
        // Para saludos, no requerimos knowledge base
        return {
          step: 4,
          type: 'decision',
          title: 'Estrategia de Respuesta (Saludo)',
          content: `Estrategia determinada en ${Date.now() - stepStart}ms: ${strategy.type} (${strategy.tone}, ${strategy.length}). Razones: ${strategyReasons.join(', ')}`,
          confidence: 0.9, // Alta confianza para saludos
          data: strategy
        };
      }

      // 1. Determinar tipo de respuesta basado en intención
      switch (intentAnalysis.intent) {
        case 'greeting':
        case 'saludo':
          strategy.type = 'contextual';
          strategy.tone = 'friendly';
          strategy.length = 'brief';
          strategyReasons.push('Saludo detectado: respuesta amigable y breve');
          break;
          
        case 'pricing_inquiry':
        case 'consulta_precio':
          strategy.type = 'contextual';
          strategy.tone = 'sales';
          strategy.length = 'medium'; // Cambiar de 'detailed' a 'medium'
          strategy.templateCategory = 'pricing';
          strategyReasons.push('Consulta de precios: respuesta concisa y orientada a ventas');
          break;
          
        case 'product_inquiry':
        case 'consulta_producto':
          strategy.type = 'contextual';
          strategy.tone = 'sales';
          strategy.length = 'medium'; // Cambiar de 'detailed' a 'medium'
          strategy.templateCategory = 'products';
          strategyReasons.push('Consulta de producto: información concisa');
          break;
          
        case 'complaint':
        case 'queja':
          strategy.type = 'escalate';
          strategy.tone = 'supportive';
          strategy.priority = 'high';
          strategyReasons.push('Queja detectada: tono de apoyo y prioridad alta');
          break;
          
        case 'technical_support':
          strategy.type = 'contextual';
          strategy.tone = 'technical';
          strategy.length = 'detailed';
          strategyReasons.push('Soporte técnico: respuesta detallada y técnica');
          break;
          
        default:
          strategy.type = 'direct';
          strategyReasons.push('Intención general: respuesta directa');
      }

      // 2. Ajustes basados en sentimiento
      if (intentAnalysis.sentiment === 'negative') {
        strategy.tone = 'supportive';
        strategy.priority = 'high';
        strategyReasons.push('Sentimiento negativo: tono de apoyo');
      }

      // 3. Ajustes basados en urgencia
      if (intentAnalysis.urgency === 'high') {
        strategy.priority = 'high';
        strategy.length = 'brief';
        strategyReasons.push('Urgencia alta: respuesta prioritaria y concisa');
      }

      // 4. Ajustes basados en conocimiento disponible (no aplicar a saludos)
      if (knowledgeData.length === 0 && !isGreeting && intentAnalysis.intent !== 'greeting' && intentAnalysis.intent !== 'saludo') {
        strategy.type = 'defer';
        strategy.tone = 'professional';
        strategyReasons.push('Sin conocimiento específico: diferir a humano');
      }

      // 5. Ajustes basados en historial
      if (context.messageHistory && context.messageHistory.length > 10) {
        strategy.shouldQuote = false; // Evitar quotes en conversaciones largas
        strategyReasons.push('Conversación larga: evitar quotes');
      }

      // 6. Ajustes basados en tiempo
      const timeContext = this.analyzeTimeContext();
      if (timeContext.timeOfDay === 'night') {
        strategy.tone = 'professional';
        strategy.shouldUseEmojis = false;
        strategyReasons.push('Horario nocturno: tono más formal');
      }

      return {
        step: 4,
        type: 'decision',
        title: 'Estrategia de Respuesta',
        content: `Estrategia determinada en ${Date.now() - stepStart}ms: ${strategy.type} (${strategy.tone}, ${strategy.length}). Razones: ${strategyReasons.join(', ')}`,
        confidence: 0.8,
        data: strategy
      };
    } catch (error) {
      logger.error('Error determining response strategy:', error);
      
      // Estrategia por defecto
      const defaultStrategy: ResponseStrategy = {
        type: 'direct',
        tone: 'friendly',
        length: 'medium',
        shouldQuote: false,
        shouldUseEmojis: true,
        priority: 'medium'
      };

      return {
        step: 4,
        type: 'decision',
        title: 'Estrategia de Respuesta (Fallback)',
        content: 'Error determinando estrategia, usando configuración por defecto',
        confidence: 0.5,
        data: defaultStrategy
      };
    }
  }

  private async makeFinalDecision(
    steps: ThinkingStep[],
    context: EnrichedContext
  ): Promise<ThinkingStep> {
    const stepStart = Date.now();
    
    try {
      let shouldRespond = true;
      let decisionReasons: string[] = [];
      let confidence = 0.8;

      // *** VERIFICACIÓN PRIORITARIA PARA SALUDOS ***
      const isGreeting = await this.isGreetingMessage(context.messageText || '');
      if (isGreeting) {
        shouldRespond = true;
        decisionReasons.push('SALUDO DETECTADO: Respuesta automática garantizada');
        confidence = 0.95; // Muy alta confianza para saludos
        
        return {
          step: 5,
          type: 'decision',
          title: 'Decisión Final (Saludo)',
          content: `Decisión tomada en ${Date.now() - stepStart}ms: RESPONDER AUTOMÁTICAMENTE - SALUDO. Razones: ${decisionReasons.join(', ')}`,
          confidence,
          data: {
            shouldRespond: true,
            reasons: decisionReasons,
            finalConfidence: confidence,
            isGreeting: true
          }
        };
      }

      // Obtener datos de pasos anteriores
      const intentStep = steps.find(s => s.type === 'analysis' && s.title.includes('Intención'));
      const knowledgeStep = steps.find(s => s.type === 'knowledge_retrieval');
      const contextStep = steps.find(s => s.type === 'analysis' && s.title.includes('Contexto'));
      const strategyStep = steps.find(s => s.type === 'decision');

      if (!intentStep || !knowledgeStep || !strategyStep) {
        shouldRespond = false;
        decisionReasons.push('Faltan datos críticos del análisis');
        confidence = 0.2;
      } else {
        const intentAnalysis = intentStep.data as IntentAnalysis;
        const knowledgeData = knowledgeStep.data as any[];
        const strategy = strategyStep.data as ResponseStrategy;

        // Reglas de decisión
        
        // 1. Verificar si es saludo por intención (backup)
        if (intentAnalysis.intent === 'greeting' || intentAnalysis.intent === 'saludo') {
          shouldRespond = true;
          decisionReasons.push('SALUDO por análisis de intención: Respuesta garantizada');
          confidence = 0.9;
        }
        // 2. Verificar confianza mínima en la intención (solo para no-saludos)
        else if (intentAnalysis.confidence < 0.4) {
          shouldRespond = false;
          decisionReasons.push(`Confianza en intención muy baja: ${(intentAnalysis.confidence * 100).toFixed(1)}%`);
          confidence = 0.3;
        }

        // 3. Verificar si se debe escalar
        if (strategy.type === 'escalate') {
          shouldRespond = false;
          decisionReasons.push('Estrategia requiere escalamiento a humano');
          confidence = 0.9; // Alta confianza en la decisión de no responder
        }

        // 4. Verificar si se debe diferir (solo para no-saludos)
        if (strategy.type === 'defer' && !shouldRespond) {
          shouldRespond = false;
          decisionReasons.push('Sin conocimiento suficiente para responder');
          confidence = 0.7;
        }

        // 5. Verificar límites de conversación (si implementados)
        // TODO: Implementar verificación de límites de mensajes por lead

        // 6. Si todo está bien, proceder con la respuesta
        if (shouldRespond && !decisionReasons.some(r => r.includes('SALUDO'))) {
          decisionReasons.push('Todos los criterios cumplidos para responder');
          confidence = Math.min(
            intentAnalysis.confidence + 
            (knowledgeData.length > 0 ? 0.2 : 0) + 
            (strategyStep.confidence || 0.8),
            1.0
          ) / 2;
        }
      }

      const decision = shouldRespond 
        ? 'Proceder con respuesta automatizada'
        : 'No responder automáticamente';

      return {
        step: 5,
        type: 'decision',
        title: 'Decisión Final',
        content: `Decisión tomada en ${Date.now() - stepStart}ms: ${decision}. Razones: ${decisionReasons.join(', ')}`,
        confidence,
        data: {
          shouldRespond,
          reasons: decisionReasons,
          finalConfidence: confidence
        }
      };
    } catch (error) {
      logger.error('Error in final decision:', error);
      
      return {
        step: 5,
        type: 'decision',
        title: 'Decisión Final (Error)',
        content: 'Error en proceso de decisión, no responder por seguridad',
        confidence: 0.1,
        data: {
          shouldRespond: false,
          reasons: ['Error en el sistema de decisión'],
          finalConfidence: 0.1
        }
      };
    }
  }

  // ============================================
  // MÉTODOS AUXILIARES
  // ============================================

  private async enrichContext(
    context: MessageContext,
    currentMessage: string
  ): Promise<EnrichedContext> {
    try {
      const enriched: EnrichedContext = {
        ...context,
        messageText: currentMessage, // Agregar el mensaje actual al contexto
        previousIntents: [],
        messageHistory: [],
        userEngagementLevel: 'medium',
        timeOfDay: 'morning',
        dayOfWeek: 'weekday'
      };

      // Obtener historial de conversación si hay número de teléfono
      if (context.phoneNumber) {
        const history = await DatabaseService.getConversationHistory(
          context.phoneNumber,
          10 // Últimos 10 mensajes
        );
        
        enriched.messageHistory = history.map(h => ({
          message: h.messageText || h.responseText || '',
          intent: h.intent,
          timestamp: h.createdAt,
          isFromUser: h.isFromUser
        }));

        // Obtener perfil del lead si está disponible
        const leads = await DatabaseService.getAllLeads();
        enriched.leadProfile = leads.find(lead => 
          lead.phone && lead.phone.includes(context.phoneNumber?.replace(/\D/g, '') || '')
        );
      }

      // Añadir contexto temporal
      const timeContext = this.analyzeTimeContext();
      enriched.timeOfDay = timeContext.timeOfDay;
      enriched.dayOfWeek = timeContext.dayOfWeek;

      // Calcular nivel de engagement
      enriched.userEngagementLevel = this.calculateEngagementLevel(enriched);

      return enriched;
    } catch (error) {
      logger.error('Error enriching context:', error);
      // Retornar contexto básico en caso de error
      return {
        ...context,
        previousIntents: [],
        messageHistory: [],
        userEngagementLevel: 'medium',
        timeOfDay: 'morning',
        dayOfWeek: 'weekday'
      } as EnrichedContext;
    }
  }

  private async analyzeIntentEnhanced(
    message: string,
    context: EnrichedContext
  ): Promise<IntentAnalysis> {
    try {
      // Usar el análisis existente de AIService como base
      const baseAnalysis = await AIService.analyzeIntent(message);
      
      // Mejorar el análisis con contexto adicional
      const enhanced: IntentAnalysis = {
        intent: baseAnalysis.intent || 'general',
        confidence: baseAnalysis.confidence || 0.5,
        entities: baseAnalysis.entities || {},
        sentiment: baseAnalysis.sentiment || 'neutral',
        urgency: this.detectUrgency(message),
        category: this.categorizeIntent(baseAnalysis.intent || 'general'),
        subcategory: this.getSubcategory(message, baseAnalysis.intent || 'general')
      };

      // Ajustar confianza basado en contexto
      if (context.messageHistory.length > 0) {
        enhanced.confidence = Math.min(enhanced.confidence + 0.1, 1.0);
      }

      return enhanced;
    } catch (error) {
      logger.error('Error in enhanced intent analysis:', error);
      
      // Fallback basic analysis
      return {
        intent: 'general',
        confidence: 0.5,
        entities: {},
        sentiment: 'neutral',
        urgency: 'medium',
        category: 'general'
      };
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
      'greeting': 'social',
      'saludo': 'social',
      'goodbye': 'social',
      'despedida': 'social',
      'pricing_inquiry': 'commercial',
      'consulta_precio': 'commercial',
      'product_inquiry': 'commercial',
      'consulta_producto': 'commercial',
      'technical_support': 'support',
      'soporte_tecnico': 'support',
      'complaint': 'support',
      'queja': 'support',
      'information_request': 'informational',
      'solicitar_info': 'informational'
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

  private analyzeTimeContext(): { timeOfDay: EnrichedContext['timeOfDay'], dayOfWeek: EnrichedContext['dayOfWeek'] } {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
    
    let timeOfDay: EnrichedContext['timeOfDay'];
    if (hour >= 6 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 18) timeOfDay = 'afternoon';
    else if (hour >= 18 && hour < 22) timeOfDay = 'evening';
    else timeOfDay = 'night';
    
    const dayType: EnrichedContext['dayOfWeek'] = (dayOfWeek === 0 || dayOfWeek === 6) ? 'weekend' : 'weekday';
    
    return { timeOfDay, dayOfWeek: dayType };
  }

  private calculateEngagementLevel(context: EnrichedContext): 'low' | 'medium' | 'high' {
    const messageCount = context.messageHistory?.length || 0;
    
    if (messageCount === 0) return 'low';
    if (messageCount < 5) return 'medium';
    return 'high';
  }

  private calculateOverallConfidence(steps: ThinkingStep[]): number {
    if (steps.length === 0) return 0;
    
    const confidences = steps.map(step => step.confidence);
    return confidences.reduce((sum, confidence) => sum + confidence, 0) / confidences.length;
  }

  private generateReasoningExplanation(steps: ThinkingStep[]): string {
    const keySteps = steps.filter(step => 
      step.type === 'analysis' || step.type === 'decision'
    );
    
    return keySteps.map(step => 
      `${step.title}: ${step.content}`
    ).join(' → ');
  }

  private estimateComplexity(steps: ThinkingStep[]): 'simple' | 'medium' | 'complex' {
    const avgConfidence = this.calculateOverallConfidence(steps);
    const stepCount = steps.length;
    
    if (stepCount <= 3 && avgConfidence > 0.8) return 'simple';
    if (stepCount <= 5 && avgConfidence > 0.6) return 'medium';
    return 'complex';
  }

  private async generateContextualResponse(
    message: string,
    context: EnrichedContext,
    intentAnalysis: IntentAnalysis,
    strategy: ResponseStrategy,
    knowledgeData: any[]
  ): Promise<ThinkingStep> {
    const stepStart = Date.now();
    
    try {
      // Construir prompt contextual
      let systemPrompt = await DatabaseService.getAIConfiguration('system_prompt');
      
      // Añadir contexto específico al prompt
      const contextualPrompt = await this.buildContextualPrompt(
        systemPrompt || '',
        intentAnalysis,
        strategy,
        knowledgeData,
        context
      );

      // Generar respuesta usando el contexto enriquecido
      const aiResponse = await AIService.generateResponse(message, {
        ...context,
        conversationHistory: context.messageHistory?.map(m => ({
          role: m.isFromUser ? 'user' : 'assistant' as 'user' | 'assistant',
          content: m.message
        })) || []
      });

      // Aplicar ajustes según la estrategia
      if (aiResponse.success && aiResponse.content) {
        aiResponse.content = this.applyStrategyToResponse(
          aiResponse.content,
          strategy,
          intentAnalysis
        );
      }

      return {
        step: 6,
        type: 'decision',
        title: 'Generación de Respuesta',
        content: `Respuesta generada en ${Date.now() - stepStart}ms con estrategia ${strategy.type}`,
        confidence: aiResponse.success ? 0.8 : 0.3,
        data: aiResponse
      };
    } catch (error) {
      logger.error('Error generating contextual response:', error);
      
      const errorResponse: AIResponse = {
        success: false,
        error: 'Error generando respuesta contextual',
        provider: AIService.getCurrentProvider() as any
      };

      return {
        step: 6,
        type: 'decision',
        title: 'Error en Generación',
        content: 'Error generando respuesta contextual',
        confidence: 0.2,
        data: errorResponse
      };
    }
  }

  private async buildContextualPrompt(
    basePrompt: string,
    intentAnalysis: IntentAnalysis,
    strategy: ResponseStrategy,
    knowledgeData: any[],
    context: EnrichedContext
  ): Promise<string> {
    let contextualPrompt = basePrompt;
    
    // Detectar si es un saludo simple
    const isGreeting = await this.isGreetingMessage(context.messageText || '');
    
    if (isGreeting) {
      // Para saludos, usar prompt simplificado
      contextualPrompt += `\n\n🎯 INSTRUCCIÓN: SALUDO BREVE Y NATURAL\n`;
      contextualPrompt += `IMPORTANTE: Responde con un saludo cálido pero breve. Presenta EscortsHub.net de forma simple y pregunta cómo puedes ayudar.\n`;
      contextualPrompt += `MÁXIMO 2 líneas. Sé natural y amigable.\n\n`;
      
      if (context.contactName) {
        contextualPrompt += `Nombre del usuario: ${context.contactName}\n\n`;
      }
      
      contextualPrompt += `Ejemplo de respuesta: "¡Hola! 👋 Soy tu asistente de EscortsHub.net. ¿En qué puedo ayudarte hoy?"\n\n`;
      return contextualPrompt;
    }
    
    // Para otros tipos de mensajes, usar prompt muy conciso
    contextualPrompt += `\n\n🎯 INSTRUCCIÓN ESTRICTA: RESPUESTA MUY BREVE Y SIMPLE\n`;
    contextualPrompt += `OBLIGATORIO: Máximo 80-100 palabras. SIN tablas. SIN listas largas. SIN secciones múltiples. `;
    contextualPrompt += `Responde SOLO lo que se pregunta, de forma conversacional y simple.\n\n`;
    
    // Añadir contexto de intención
    contextualPrompt += `CONTEXTO ACTUAL:\n`;
    contextualPrompt += `Intención detectada: ${intentAnalysis.intent} (${(intentAnalysis.confidence * 100).toFixed(1)}% confianza)\n`;
    contextualPrompt += `Sentimiento: ${intentAnalysis.sentiment}\n`;
    contextualPrompt += `Urgencia: ${intentAnalysis.urgency}\n`;
    
    // Añadir estrategia de respuesta
    contextualPrompt += `\nESTRATEGIA DE RESPUESTA:\n`;
    contextualPrompt += `Tono: ${strategy.tone}\n`;
    contextualPrompt += `Longitud: ${strategy.length === 'brief' ? 'completa pero eficiente' : strategy.length}\n`;
    contextualPrompt += `Prioridad: ${strategy.priority}\n`;
    
    // Añadir conocimiento relevante
    if (knowledgeData.length > 0) {
      contextualPrompt += `\nCONOCIMIENTO RELEVANTE - USA ESTA INFORMACIÓN PARA RESPUESTA COMPLETA:\n`;
      knowledgeData.forEach((knowledge, index) => {
        contextualPrompt += `\n${index + 1}. CATEGORÍA: ${knowledge.category?.toUpperCase()}\n`;
        contextualPrompt += `TÍTULO: ${knowledge.title}\n`;
        contextualPrompt += `CONTENIDO: ${knowledge.content}\n`;
        contextualPrompt += `RELEVANCIA: ${knowledge.match_quality || 'alta'}\n`;
        contextualPrompt += `---\n`;
      });
    }
    
    // Añadir contexto de conversación
    if (context.messageHistory && context.messageHistory.length > 0) {
      contextualPrompt += `\nHISTORIAL DE CONVERSACIÓN:\n`;
      context.messageHistory.slice(-3).forEach(msg => {
        const role = msg.isFromUser ? 'Usuario' : 'Asistente';
        contextualPrompt += `${role}: ${msg.message.substring(0, 150)}...\n`;
      });
    }
    
    // Instrucciones para respuesta breve y directa
    contextualPrompt += `\n📝 FORMATO DE RESPUESTA:\n`;
    
    if (intentAnalysis.intent.includes('precio') || intentAnalysis.intent.includes('product')) {
      contextualPrompt += `
Respuesta SIMPLE: Solo menciona 2-3 precios principales, sistema HUB básico (1 HUB ≈ 0.60€), paquete recomendado y enlace si necesario.`;
    } else if (intentAnalysis.intent.includes('registro')) {
      contextualPrompt += `
Respuesta SIMPLE: Registro GRATUITO en https://escortshub.net/register. Menciona pasos básicos y pregunta si necesita ayuda.`;
    } else {
      contextualPrompt += `
Respuesta SIMPLE: Responde solo lo preguntado con información del conocimiento. Termina con una pregunta.`;
    }
    
    contextualPrompt += `\n\n⚡ REGLAS ULTRA ESTRICTAS:\n`;
    contextualPrompt += `- MÁXIMO 60-80 palabras TOTAL\n`;
    contextualPrompt += `- SIN tablas, SIN listas largas, SIN secciones múltiples\n`;
    contextualPrompt += `- SIN repetir información, SIN introducciones largas\n`;
    contextualPrompt += `- Formato conversacional como mensaje de WhatsApp\n`;
    contextualPrompt += `- SIEMPRE EscortsHub.net (nunca .com)\n`;
    contextualPrompt += `- UNA pregunta final corta\n`;
    
    return contextualPrompt;
  }

  private applyStrategyToResponse(
    response: string,
    strategy: ResponseStrategy,
    intentAnalysis: IntentAnalysis
  ): string {
    let adjustedResponse = response;

    // Log inicial para diagnóstico de preservación de números
    logger.debug('AIThinking.applyStrategyToResponse: before', {
      sample: adjustedResponse.slice(0, 200)
    });
    
    // Aplicar longitud con truncamiento seguro que preserva números claves
    if (strategy.length === 'brief' && adjustedResponse.length > 200) {
      // Intentar truncar por párrafos o saltos de línea primero
      const paragraphs = adjustedResponse.split(/\n\n+/);
      if (paragraphs.length > 1) {
        adjustedResponse = paragraphs.slice(0, 2).join('\n\n');
      } else {
        // Truncar por oraciones pero evitando cortar números o unidades
        const sentences = adjustedResponse.split(/(?<=[.!?])\s+/).filter(s => s.trim());
        adjustedResponse = sentences.slice(0, 2).join(' ');
      }
    }
    
    // Aplicar emojis según estrategia
    if (!strategy.shouldUseEmojis) {
      // Eliminar solo rangos Unicode de emojis conocidos manteniendo números y símbolos
      // Rango Emoticons, Símbolos misceláneos, Transporte/Mapas, Banderas regionales, etc.
      const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
      adjustedResponse = adjustedResponse.replace(emojiRegex, '');
    }

    // Log después de limpieza de emojis
    logger.debug('AIThinking.applyStrategyToResponse: afterEmoji', {
      sample: adjustedResponse.slice(0, 200)
    });
    
    // Añadir llamadas a la acción según el tono
    if (strategy.tone === 'sales' && !adjustedResponse.includes('?')) {
      adjustedResponse += '\n\n¿Te gustaría que te ayude con algo más específico?';
    }

    // Log final
    logger.debug('AIThinking.applyStrategyToResponse: final', {
      sample: adjustedResponse.slice(0, 200)
    });
    
    return adjustedResponse;
  }

  private async saveThinkingProcess(
    phoneNumber: string,
    message: string,
    thoughtProcess: ThoughtProcess
  ): Promise<void> {
    try {
      // Guardar en base de datos para análisis futuro
      // TODO: Implementar tabla específica para procesos de pensamiento
      logger.debug('Thinking process saved:', {
        phoneNumber,
        message: message.substring(0, 50),
        steps: thoughtProcess.steps.length,
        confidence: thoughtProcess.confidence,
        processingTime: thoughtProcess.processingTimeMs
      });
    } catch (error) {
      logger.error('Error saving thinking process:', error);
    }
  }

  // Método para detectar si un mensaje es un saludo simple
  private async isGreetingMessage(message: string): Promise<boolean> {
    try {
      // Obtener keywords de saludo desde configuración
      const greetingKeywords = await DatabaseService.getAIConfiguration('greeting_keywords');
      if (!greetingKeywords) {
        // Fallback keywords si no hay configuración
        const fallbackKeywords = ['hola', 'hi', 'buenas', 'buenos', 'saludos', 'hey', 'hello', 'que tal'];
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

  private checkGreetingKeywords(message: string, keywords: string[]): boolean {
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
}

// Exportar instancia singleton
export default AIThinkingService.getInstance();
