import { logger } from '../utils/logger';
import advancedLogger from '../utils/advancedLogger';
import type { AIResponse, MessageContext } from './AIService';
import AIService from './AIService';
import DatabaseService from './DatabaseService';
import { CacheManager, CacheKeyGenerator } from './ai-thinking/cache';
import {
  IntentAnalyzer,
  ContextEnricher,
  ComplexityAnalyzer,
  KnowledgeRetriever,
} from './ai-thinking/analysis';
import type { ResponseStrategy } from './ai-thinking/StrategySelector';
import { StrategySelector } from './ai-thinking/StrategySelector';
import { ResponseGenerator } from './ai-thinking/ResponseGenerator';

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

  // Cache management through centralized service
  private cacheManager: CacheManager;

  // Analysis services
  private intentAnalyzer: IntentAnalyzer;
  private contextEnricher: ContextEnricher;
  private complexityAnalyzer: ComplexityAnalyzer;
  private knowledgeRetriever: KnowledgeRetriever;
  private strategySelector: StrategySelector;
  private responseGenerator: ResponseGenerator;

  private constructor() {
    this.cacheManager = CacheManager.getInstance();
    this.intentAnalyzer = IntentAnalyzer.getInstance();
    this.contextEnricher = ContextEnricher.getInstance();
    this.complexityAnalyzer = ComplexityAnalyzer.getInstance();
    this.knowledgeRetriever = KnowledgeRetriever.getInstance();
    this.strategySelector = new StrategySelector();
    this.responseGenerator = new ResponseGenerator();
  }

  public static getInstance(): AIThinkingService {
    if (!AIThinkingService.instance) {
      AIThinkingService.instance = new AIThinkingService();
    }
    return AIThinkingService.instance;
  }

  // ============================================
  // MÉTODO PRINCIPAL: PROCESAMIENTO CON PENSAMIENTO
  // ============================================

  /**
   * Nuevo método principal optimizado con sistema express
   */
  public async processWithThinking(
    message: string,
    context: MessageContext
  ): Promise<AIResponse & { thinkingProcess: ThoughtProcess }> {
    const startTime = Date.now();

    // 🚀 INTENTO DE RESPUESTA RÁPIDA PRIMERO
    const quickResponse = await this.tryQuickResponse(message, context);
    if (quickResponse) {
      const processingTime = Date.now() - startTime;
      logger.info('⚡ [EXPRESS] Quick response generated:', {
        message: message.substring(0, 50),
        processingTime,
        responseType: 'express',
      });

      return {
        ...quickResponse,
        thinkingProcess: {
          steps: [
            {
              step: 1,
              type: 'analysis',
              title: 'Respuesta Express',
              content: 'Respuesta rápida generada sin proceso completo de pensamiento',
              confidence: 0.9,
              data: { expressResponse: true },
            },
          ],
          finalDecision: 'Respuesta express exitosa',
          confidence: 0.9,
          reasoning: 'Consulta simple procesada con sistema express',
          shouldRespond: true,
          responseStrategy: {
            type: 'direct',
            tone: 'friendly',
            length: 'brief',
            shouldQuote: false,
            shouldUseEmojis: true,
            priority: 'medium',
          },
          estimatedComplexity: 'simple',
          processingTimeMs: processingTime,
        },
      };
    }

    // Si no hay respuesta rápida, proceder con el proceso completo
    logger.info('🧠 [THINKING] Starting full thinking process for message:', {
      message: message.substring(0, 100),
      phoneNumber: context.phoneNumber,
    });

    try {
      // 1. ENRIQUECER CONTEXTO
      const enrichedContext = await this.contextEnricher.enrich(context, message);

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
          priority: 'medium',
        },
        estimatedComplexity: 'simple',
        processingTimeMs: 0,
      };

      // 3. PASO 1: ANÁLISIS DE INTENCIÓN
      const intentStep = await this.performIntentAnalysis(message, enrichedContext);
      thoughtProcess.steps.push(intentStep);

      const intentAnalysis = intentStep.data as IntentAnalysis;

      // 4. PASO 2: RECUPERACIÓN DE CONOCIMIENTO RELEVANTE (B2.2: scoped by tenant+agent)
      const knowledgeStep = await this.performKnowledgeRetrieval(message, intentAnalysis, {
        tenantId: enrichedContext.tenantId,
        aiAgentId: enrichedContext.aiAgentId,
      });
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
          knowledgeStep.data ?? []
        );
        thoughtProcess.steps.push(responseStep);
        aiResponse = responseStep.data as AIResponse;
      } else {
        // No responder (pero registrar la decisión)
        aiResponse = {
          success: false,
          error: `Decision: ${thoughtProcess.finalDecision}`,
          provider: AIService.getCurrentProvider() as any,
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

      advancedLogger.logAIDecision(
        {
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
            strategy: thoughtProcess.responseStrategy,
          },
        },
        {
          sessionId: context.sessionId,
          phoneNumber: context.phoneNumber,
          operation: 'ai-thinking-process',
        }
      );

      logger.info('🧠 [THINKING] Process completed:', {
        shouldRespond: thoughtProcess.shouldRespond,
        confidence: thoughtProcess.confidence,
        processingTimeMs: thoughtProcess.processingTimeMs,
        steps: thoughtProcess.steps.length,
      });

      return {
        ...aiResponse,
        thinkingProcess: thoughtProcess,
      };
    } catch (error) {
      logger.error('🧠 [THINKING] Error in thinking process:', error);

      // Fallback a respuesta directa en caso de error
      const fallbackResponse = await AIService.generateResponse(message, context);

      return {
        ...fallbackResponse,
        thinkingProcess: {
          steps: [
            {
              step: 1,
              type: 'analysis',
              title: 'Error Fallback',
              content: 'Error en proceso de pensamiento, usando respuesta directa',
              confidence: 0.3,
              data: { error: error instanceof Error ? error.message : 'Unknown error' },
            },
          ],
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
            priority: 'medium',
          },
          estimatedComplexity: 'simple',
          processingTimeMs: Date.now() - startTime,
        },
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
      const cacheKey = CacheKeyGenerator.generateIntentKey(message, context);
      const cachedIntent = this.cacheManager.getIntent(cacheKey);
      if (cachedIntent) {
        return {
          step: 1,
          type: 'analysis',
          title: 'Análisis de Intención (Cache)',
          content: `Intención detectada: ${cachedIntent.intent} (${(cachedIntent.confidence * 100).toFixed(1)}% confianza)`,
          confidence: cachedIntent.confidence,
          data: cachedIntent,
        };
      }

      // Usar el nuevo servicio de análisis de intenciones
      const intentAnalysis = await this.intentAnalyzer.analyzeEnhanced(message, context);

      // Cachear resultado
      this.cacheManager.setIntent(cacheKey, intentAnalysis);

      return {
        step: 1,
        type: 'analysis',
        title: 'Análisis de Intención',
        content: `Mensaje analizado en ${Date.now() - stepStart}ms. Intención: ${intentAnalysis.intent} (${(intentAnalysis.confidence * 100).toFixed(1)}% confianza). Sentimiento: ${intentAnalysis.sentiment}. Urgencia: ${intentAnalysis.urgency}.`,
        confidence: intentAnalysis.confidence,
        data: intentAnalysis,
      };
    } catch (error) {
      logger.error('Error in intent analysis:', error);

      // Fallback intent analysis
      const fallbackIntent = this.intentAnalyzer.getFallbackAnalysis();

      return {
        step: 1,
        type: 'analysis',
        title: 'Análisis de Intención (Fallback)',
        content: 'Error en análisis detallado, usando análisis básico',
        confidence: 0.5,
        data: fallbackIntent,
      };
    }
  }

  private async performKnowledgeRetrieval(
    message: string,
    intentAnalysis: IntentAnalysis,
    opts?: { tenantId?: string; aiAgentId?: string }
  ): Promise<ThinkingStep> {
    const stepStart = Date.now();

    try {
      const relevantKnowledge = await this.knowledgeRetriever.retrieve(
        message,
        intentAnalysis,
        opts
      );

      const content =
        relevantKnowledge.length > 0
          ? `Encontrado ${relevantKnowledge.length} elementos de conocimiento relevante en ${Date.now() - stepStart}ms`
          : `Sin conocimiento específico encontrado para la consulta en ${Date.now() - stepStart}ms`;

      return {
        step: 2,
        type: 'knowledge_retrieval',
        title: 'Recuperación de Conocimiento',
        content,
        confidence: relevantKnowledge.length > 0 ? 0.8 : 0.3,
        data: relevantKnowledge,
      };
    } catch (error) {
      logger.error('Error in knowledge retrieval:', error);

      return {
        step: 2,
        type: 'knowledge_retrieval',
        title: 'Recuperación de Conocimiento (Error)',
        content: 'Error accediendo al knowledge base',
        confidence: 0.2,
        data: [],
      };
    }
  }

  private async performContextAnalysis(
    context: EnrichedContext,
    intentAnalysis: IntentAnalysis
  ): Promise<ThinkingStep> {
    const stepStart = Date.now();

    try {
      const analysisPoints: string[] = [];
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
          hasHistory: (context.messageHistory?.length || 0) > 0,
        },
      };
    } catch (error) {
      logger.error('Error in context analysis:', error);

      return {
        step: 3,
        type: 'analysis',
        title: 'Análisis de Contexto (Error)',
        content: 'Error analizando contexto de conversación',
        confidence: 0.3,
        data: {},
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
      // Use the advanced StrategySelector service
      const strategyAnalysis = await this.strategySelector.determineResponseStrategy(
        intentAnalysis as any, // Compatible with IntentAnalysisExtended
        context,
        knowledgeData // Will be adapted within StrategySelector
      );

      return {
        step: 4,
        type: 'decision',
        title: 'Estrategia de Respuesta',
        content: `Estrategia determinada en ${Date.now() - stepStart}ms: ${strategyAnalysis.strategy.type} (${strategyAnalysis.strategy.tone}, ${strategyAnalysis.strategy.length}). Razones: ${strategyAnalysis.reasoning.join(', ')}`,
        confidence: strategyAnalysis.confidence,
        data: strategyAnalysis.strategy,
      };
    } catch (error) {
      logger.error('Error determining response strategy with StrategySelector:', error);

      // Fallback to simple strategy
      const defaultStrategy: ResponseStrategy = {
        type: 'direct',
        tone: 'friendly',
        length: 'medium',
        shouldQuote: false,
        shouldUseEmojis: true,
        priority: 'medium',
      };

      return {
        step: 4,
        type: 'decision',
        title: 'Estrategia de Respuesta (Fallback)',
        content: 'Error con StrategySelector, usando configuración por defecto',
        confidence: 0.5,
        data: defaultStrategy,
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
      const decisionReasons: string[] = [];
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
            isGreeting: true,
          },
        };
      }

      // Obtener datos de pasos anteriores
      const intentStep = steps.find(s => s.type === 'analysis' && s.title.includes('Intención'));
      const knowledgeStep = steps.find(s => s.type === 'knowledge_retrieval');
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
          decisionReasons.push(
            `Confianza en intención muy baja: ${(intentAnalysis.confidence * 100).toFixed(1)}%`
          );
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
          confidence =
            Math.min(
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
          finalConfidence: confidence,
        },
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
          finalConfidence: 0.1,
        },
      };
    }
  }

  // ============================================
  // MÉTODOS AUXILIARES
  // ============================================

  private analyzeTimeContext(): {
    timeOfDay: EnrichedContext['timeOfDay'];
    dayOfWeek: EnrichedContext['dayOfWeek'];
  } {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

    let timeOfDay: EnrichedContext['timeOfDay'];
    if (hour >= 6 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 18) timeOfDay = 'afternoon';
    else if (hour >= 18 && hour < 22) timeOfDay = 'evening';
    else timeOfDay = 'night';

    const dayType: EnrichedContext['dayOfWeek'] =
      dayOfWeek === 0 || dayOfWeek === 6 ? 'weekend' : 'weekday';

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
    const keySteps = steps.filter(step => step.type === 'analysis' || step.type === 'decision');

    return keySteps.map(step => `${step.title}: ${step.content}`).join(' → ');
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
      const generationResult = await this.responseGenerator.generateContextualResponse(
        message,
        context,
        intentAnalysis as any,
        strategy,
        knowledgeData
      );

      return {
        step: 6,
        type: 'decision',
        title: 'Generación de Respuesta',
        content: `Respuesta generada en ${Date.now() - stepStart}ms con estrategia ${strategy.type}. Optimizaciones: ${generationResult.appliedOptimizations.join(', ')}. Calidad: ${(generationResult.qualityScore * 100).toFixed(1)}%`,
        confidence: generationResult.response.success ? generationResult.qualityScore : 0.3,
        data: generationResult.response,
      };
    } catch (error) {
      logger.error('Error generating contextual response with ResponseGenerator:', error);

      const errorResponse: AIResponse = {
        success: false,
        error: 'Error generando respuesta contextual',
        provider: AIService.getCurrentProvider() as any,
      };

      return {
        step: 6,
        type: 'decision',
        title: 'Error en Generación',
        content: 'Error generando respuesta contextual con ResponseGenerator',
        confidence: 0.2,
        data: errorResponse,
      };
    }
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
        processingTime: thoughtProcess.processingTimeMs,
      });
    } catch (error) {
      logger.error('Error saving thinking process:', error);
    }
  }

  /**
   * Detectar si un mensaje es un saludo simple
   */
  private async isGreetingMessage(message: string): Promise<boolean> {
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
    if (words.length <= 3) {
      // Solo hasta 3 palabras
      return keywords.some(keyword => words.includes(keyword));
    }

    return false;
  }

  // ============================================
  // SISTEMA DE RESPUESTA RÁPIDA INTELIGENTE
  // ============================================

  /**
   * Intentar respuesta rápida para consultas simples
   * Evita el proceso completo de thinking para mejorar velocidad
   */
  private async tryQuickResponse(
    message: string,
    context: MessageContext
  ): Promise<AIResponse | null> {
    try {
      const startTime = Date.now();

      // 1. VERIFICAR CACHE DE RESPUESTAS PRIMERO
      const cacheKey = CacheKeyGenerator.generateResponseKey(message, context);
      const cachedResponseText = this.cacheManager.getResponse(cacheKey);

      if (cachedResponseText) {
        logger.debug('⚡ Respuesta desde cache:', { message: message.substring(0, 50) });
        return {
          success: true,
          content: cachedResponseText,
          provider: AIService.getCurrentProvider() as any,
          tokensUsed: 0, // Cache no usa tokens
        };
      }

      // 2. ANÁLISIS RÁPIDO DE COMPLEJIDAD
      const complexityKey = CacheKeyGenerator.generateComplexityKey(message);
      let complexity = this.cacheManager.getComplexity(complexityKey);

      if (!complexity) {
        complexity = this.complexityAnalyzer.analyze(message);
        this.cacheManager.setComplexity(complexityKey, complexity);
      }

      // 3. Templates proactivos ELIMINADOS - todas las respuestas van a OpenRouter/IA
      // Solo el cache (arriba) puede devolver respuestas rápidas
      logger.debug('🔄 No hay cache hit, usando proceso completo de IA');
      return null;
    } catch (error) {
      logger.error('Error en respuesta rápida:', error);
      return null;
    }
  }
}

// Exportar instancia singleton
export default AIThinkingService.getInstance();
