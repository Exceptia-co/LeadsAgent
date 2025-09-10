/**
 * ResponseGenerator - AI Thinking Service Module
 *
 * Handles final response generation, formatting, and optimization.
 * Applies strategic formatting rules, length constraints, and quality
 * enhancement based on context and intent analysis.
 *
 * Part of Phase 3: AI Services Modularization
 */

import { logger } from '../../utils/logger';
import DatabaseService from '../DatabaseService';
import AIService, { AIResponse } from '../AIService';
import { IntentAnalysisExtended, EnrichedContext } from './ContextEnricher';
import { KnowledgeItem } from './KnowledgeRetrieval';
import { ResponseStrategy } from './StrategySelector';

// ============================================
// INTERFACES Y TIPOS
// ============================================

export interface ResponseGenerationResult {
  response: AIResponse;
  appliedOptimizations: string[];
  originalLength: number;
  finalLength: number;
  qualityScore: number;
  processingTime: number;
  templateUsed?: string;
}

export interface ResponseOptimization {
  name: string;
  description: string;
  applied: boolean;
  reason: string;
  impact: 'positive' | 'neutral' | 'negative';
}

export interface ResponseQuality {
  score: number;
  factors: QualityFactor[];
  suggestions: string[];
  warnings: string[];
}

export interface QualityFactor {
  name: string;
  score: number;
  weight: number;
  description: string;
}

export interface LengthConstraints {
  maxWords: number;
  maxCharacters: number;
  preserveKey: boolean;
  allowTruncation: boolean;
}

// ============================================
// RESPONSE GENERATOR CLASS
// ============================================

export class ResponseGenerator {
  constructor() {
    logger.debug('ResponseGenerator module initialized');
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Generate contextual response with strategy-based optimization
   */
  public async generateContextualResponse(
    message: string,
    context: EnrichedContext,
    intentAnalysis: IntentAnalysisExtended,
    strategy: ResponseStrategy,
    knowledgeData: KnowledgeItem[]
  ): Promise<ResponseGenerationResult> {
    const startTime = Date.now();

    try {
      logger.debug('Starting response generation:', {
        intent: intentAnalysis.intent,
        strategy: strategy.type,
        knowledgeItems: knowledgeData.length,
      });

      // 1. Check for template responses first (for efficiency)
      const templateResponse = await this.tryTemplateResponse(intentAnalysis, context, strategy);
      if (templateResponse) {
        const templateLength = templateResponse.content?.length || 0;
        return this.buildResult(
          templateResponse,
          ['template_response'],
          templateLength,
          templateLength,
          0.85,
          Date.now() - startTime,
          strategy.templateCategory
        );
      }

      // 2. Build contextual prompt
      await this.buildContextualPrompt(intentAnalysis, strategy, knowledgeData, context);

      // 3. Generate AI response
      const aiResponse = await AIService.generateResponse(message, {
        ...context,
        conversationHistory:
          context.messageHistory?.map(m => ({
            role: m.isFromUser ? 'user' : ('assistant' as 'user' | 'assistant'),
            content: m.message,
          })) || [],
      });

      if (!aiResponse.success || !aiResponse.content) {
        throw new Error(aiResponse.error || 'Failed to generate response');
      }

      const originalLength = aiResponse.content.length;

      // 4. Apply strategic optimizations
      const optimizedResponse = await this.applyStrategicOptimizations(
        aiResponse.content,
        strategy,
        intentAnalysis,
        context
      );

      // 5. Calculate quality score
      const qualityScore = this.calculateQualityScore(
        optimizedResponse.content,
        strategy,
        intentAnalysis
      );

      // 6. Build final response
      const finalResponse: AIResponse = {
        ...aiResponse,
        content: optimizedResponse.content,
      };

      return this.buildResult(
        finalResponse,
        optimizedResponse.optimizations,
        originalLength,
        optimizedResponse.content.length,
        qualityScore,
        Date.now() - startTime
      );
    } catch (error) {
      logger.error('Error in response generation:', error);

      // Fallback response
      const fallbackResponse: AIResponse = {
        success: false,
        error: 'Error generating contextual response',
        provider: AIService.getCurrentProvider() as any,
      };

      return this.buildResult(
        fallbackResponse,
        ['error_fallback'],
        0,
        0,
        0.2,
        Date.now() - startTime
      );
    }
  }

  /**
   * Apply strategy-based response formatting and optimization
   */
  public async applyStrategicOptimizations(
    response: string,
    strategy: ResponseStrategy,
    intentAnalysis: IntentAnalysisExtended,
    _context: EnrichedContext
  ): Promise<{ content: string; optimizations: string[] }> {
    let optimizedContent = response;
    const appliedOptimizations: string[] = [];

    try {
      // 1. Apply length constraints based on strategy
      const lengthResult = this.applyLengthConstraints(optimizedContent, strategy, intentAnalysis);
      optimizedContent = lengthResult.content;
      if (lengthResult.applied) {
        appliedOptimizations.push('length_optimization');
      }

      // 2. Remove excessive promotional content
      const promoResult = this.removeExcessivePromotions(optimizedContent);
      optimizedContent = promoResult.content;
      if (promoResult.applied) {
        appliedOptimizations.push('promotion_cleanup');
      }

      // 3. Optimize tables and lists
      const listResult = this.optimizeTablesAndLists(optimizedContent);
      optimizedContent = listResult.content;
      if (listResult.applied) {
        appliedOptimizations.push('structure_optimization');
      }

      // 4. Ensure final question
      const questionResult = this.ensureFinalQuestion(optimizedContent, intentAnalysis.intent);
      optimizedContent = questionResult.content;
      if (questionResult.applied) {
        appliedOptimizations.push('question_addition');
      }

      // 5. Apply emoji strategy
      const emojiResult = this.applyEmojiStrategy(optimizedContent, strategy);
      optimizedContent = emojiResult.content;
      if (emojiResult.applied) {
        appliedOptimizations.push('emoji_optimization');
      }

      // 6. Final validation and cleanup
      const validationResult = this.performFinalValidation(optimizedContent, strategy);
      optimizedContent = validationResult.content;
      if (validationResult.applied) {
        appliedOptimizations.push('final_validation');
      }

      logger.debug('Response optimizations applied:', {
        originalLength: response.length,
        finalLength: optimizedContent.length,
        optimizations: appliedOptimizations,
      });

      return {
        content: optimizedContent,
        optimizations: appliedOptimizations,
      };
    } catch (error) {
      logger.error('Error in strategic optimizations:', error);
      return {
        content: response,
        optimizations: ['optimization_error'],
      };
    }
  }

  // ============================================
  // PRIVATE GENERATION METHODS
  // ============================================

  /**
   * Try template response for common patterns
   */
  private async tryTemplateResponse(
    intentAnalysis: IntentAnalysisExtended,
    context: EnrichedContext,
    strategy: ResponseStrategy
  ): Promise<AIResponse | null> {
    try {
      // Check for greeting template
      if (intentAnalysis.intent === 'saludo' || intentAnalysis.intent === 'greeting') {
        const greetingResponse = AIService.getTemplateResponse('saludo', context, true);
        if (greetingResponse) {
          return {
            success: true,
            content: greetingResponse,
            provider: AIService.getCurrentProvider() as any,
            tokensUsed: 0,
          };
        }
      }

      // Check for category-specific templates
      if (strategy.templateCategory) {
        const templateResponse = AIService.getTemplateResponse(
          strategy.templateCategory,
          context,
          false
        );
        if (templateResponse) {
          return {
            success: true,
            content: templateResponse,
            provider: AIService.getCurrentProvider() as any,
            tokensUsed: 0,
          };
        }
      }

      return null;
    } catch (error) {
      logger.error('Error getting template response:', error);
      return null;
    }
  }

  /**
   * Build contextual prompt for AI generation
   */
  private async buildContextualPrompt(
    intentAnalysis: IntentAnalysisExtended,
    strategy: ResponseStrategy,
    knowledgeData: KnowledgeItem[],
    _context: EnrichedContext
  ): Promise<string> {
    try {
      let systemPrompt = (await DatabaseService.getAIConfiguration('system_prompt')) || '';

      // Add critical instruction for brevity
      systemPrompt += `\n\n🎯 INSTRUCCIÓN CRÍTICA: RESPUESTA CONVERSACIONAL BREVE\n`;
      systemPrompt += `LÍMITE ABSOLUTO: 60 palabras máximo. Formato WhatsApp natural. `;
      systemPrompt += `Responde SOLO lo preguntado + una pregunta final.\n\n`;

      // Add intent context
      systemPrompt += `CONTEXTO ACTUAL:\n`;
      systemPrompt += `Intención: ${intentAnalysis.intent} (${(intentAnalysis.confidence * 100).toFixed(1)}%)\n`;
      systemPrompt += `Sentimiento: ${intentAnalysis.sentiment}\n`;
      systemPrompt += `Urgencia: ${intentAnalysis.urgency}\n`;

      // Add strategy context
      systemPrompt += `\nESTRATEGIA DE RESPUESTA:\n`;
      systemPrompt += `Tono: ${strategy.tone}\n`;
      systemPrompt += `Longitud: ${strategy.length}\n`;
      systemPrompt += `Prioridad: ${strategy.priority}\n`;

      // Add knowledge if available
      if (knowledgeData.length > 0) {
        systemPrompt += `\nCONOCIMIENTO RELEVANTE:\n`;
        knowledgeData.forEach((knowledge, index) => {
          systemPrompt += `${index + 1}. ${knowledge.title}: ${knowledge.content}\n`;
        });
      }

      // Add format instructions based on intent
      systemPrompt += this.getFormatInstructions(intentAnalysis.intent);

      return systemPrompt;
    } catch (error) {
      logger.error('Error building contextual prompt:', error);
      return 'Responde de forma breve y profesional.';
    }
  }

  /**
   * Get format instructions based on intent
   */
  private getFormatInstructions(intent: string): string {
    const instructions: Record<string, string> = {
      consulta_precio:
        '\n📝 FORMATO PRECIO: Paquete Plus (500 HUB/300€) = mejor precio. [1 producto específico]. ¿Te interesa? MAX 40 palabras.',
      pricing_inquiry:
        '\n📝 FORMATO PRECIO: Paquete Plus (500 HUB/300€) = mejor precio. [1 producto específico]. ¿Te interesa? MAX 40 palabras.',
      registro:
        '\n📝 FORMATO REGISTRO: "Gratis en https://www.escortshub.net/es/sign-up. Solo pagas productos que actives. ¿Te ayudo?" MAX 25 palabras.',
      default:
        '\n📝 FORMATO GENERAL: Respuesta directa en 30-40 palabras + pregunta final. Nada más.',
    };

    return instructions[intent] || instructions['default'];
  }

  // ============================================
  // OPTIMIZATION METHODS
  // ============================================

  /**
   * Apply length constraints based on strategy and intent
   */
  private applyLengthConstraints(
    content: string,
    _strategy: ResponseStrategy,
    intentAnalysis: IntentAnalysisExtended
  ): { content: string; applied: boolean } {
    const wordLimits: Record<string, number> = {
      saludo: 25,
      greeting: 25,
      consulta_precio: 80,
      pricing_inquiry: 80,
      consulta_producto: 100,
      product_inquiry: 100,
      registro: 50,
      general: 120,
    };

    const maxWords = wordLimits[intentAnalysis.intent] || 60;
    const words = content.split(/\s+/);

    if (words.length <= maxWords) {
      return { content, applied: false };
    }

    // Intelligent truncation
    let truncated = this.intelligentTruncate(content, maxWords, intentAnalysis.intent);

    return { content: truncated, applied: true };
  }

  /**
   * Intelligent content truncation preserving key information
   */
  private intelligentTruncate(text: string, maxWords: number, intent: string): string {
    const words = text.split(/\s+/);

    if (words.length <= maxWords) {
      return text;
    }

    // For greetings, use fixed template
    if (intent === 'saludo' || intent === 'greeting') {
      return '¡Hola! 👋 Soy tu asistente de EscortsHub.net. ¿En qué puedo ayudarte?';
    }

    // For other cases, truncate intelligently
    let truncated = words.slice(0, maxWords - 5).join(' '); // Reserve 5 words for question

    // Add appropriate question based on intent
    const questions: Record<string, string> = {
      consulta_precio: '. ¿Te interesa algún paquete?',
      pricing_inquiry: '. ¿Te interesa algún paquete?',
      consulta_producto: '. ¿Necesitas más información?',
      product_inquiry: '. ¿Necesitas más información?',
      registro: '. ¿Te ayudo con el registro?',
      default: '. ¿Te ayudo con algo más?',
    };

    const question = questions[intent] || questions['default'];

    return truncated + question;
  }

  /**
   * Remove excessive promotional content
   */
  private removeExcessivePromotions(content: string): { content: string; applied: boolean } {
    const original = content;

    // Remove multiple bullet points
    content = content.replace(/([•\-*]\s+.+\n){3,}/g, '');

    // Remove repetitive bold sections
    content = content.replace(/(\*\*[^*]+\*\*\s*\n){2,}/g, '');

    // Remove promotional sections
    content = content.replace(/\n\n(SIEMPRE|NUNCA|IMPORTANTE|NOTA):.*$/gm, '');

    return { content, applied: original !== content };
  }

  /**
   * Optimize tables and lists for mobile WhatsApp format
   */
  private optimizeTablesAndLists(content: string): { content: string; applied: boolean } {
    const original = content;

    // Remove markdown tables (always)
    content = content.replace(/\|[\s\S]*?\|/g, '');

    // Optimize bulleted lists: keep max 3 items
    content = content.replace(/(([•\-*]\s+.+\n){4,})/g, match => {
      const lines = match.split('\n');
      const keptItems = lines.filter(line => /^[•\-*]\s+/.test(line)).slice(0, 3);
      return keptItems.join('\n') + '\n';
    });

    // Optimize numbered lists: keep max 3 items
    content = content.replace(/(\d+\.\s+.+\n){4,}/g, match => {
      const lines = match.split('\n');
      const keptItems = lines.filter(line => /^\d+\.\s+/.test(line)).slice(0, 3);
      return keptItems.join('\n') + '\n';
    });

    return { content, applied: original !== content };
  }

  /**
   * Ensure appropriate final question
   */
  private ensureFinalQuestion(
    content: string,
    intent: string
  ): { content: string; applied: boolean } {
    if (content.includes('?')) {
      return { content, applied: false };
    }

    const questions: Record<string, string> = {
      saludo: ' ¿En qué puedo ayudarte?',
      greeting: ' ¿En qué puedo ayudarte?',
      consulta_precio: ' ¿Te interesa algún paquete?',
      pricing_inquiry: ' ¿Te interesa algún paquete?',
      consulta_producto: ' ¿Necesitas más información?',
      product_inquiry: ' ¿Necesitas más información?',
      registro: ' ¿Te ayudo con el registro?',
      default: ' ¿En qué más puedo ayudarte?',
    };

    const question = questions[intent] || questions['default'];

    // Remove trailing period before adding question
    content = content.replace(/\.$/, '');

    return { content: content + question, applied: true };
  }

  /**
   * Apply emoji strategy based on response strategy
   */
  private applyEmojiStrategy(
    content: string,
    strategy: ResponseStrategy
  ): { content: string; applied: boolean } {
    if (strategy.shouldUseEmojis) {
      return { content, applied: false }; // Keep existing emojis
    }

    // Remove emojis
    const emojiRegex =
      /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    const cleaned = content.replace(emojiRegex, '');

    return { content: cleaned, applied: cleaned !== content };
  }

  /**
   * Perform final validation and cleanup
   */
  private performFinalValidation(
    content: string,
    _strategy: ResponseStrategy
  ): { content: string; applied: boolean } {
    const original = content;

    // Remove excessive whitespace
    content = content.replace(/\n\n+/g, '\n\n');
    content = content.replace(/\s+/g, ' ');
    content = content.trim();

    // Ensure content meets minimum requirements
    if (content.length < 10) {
      content = 'Lo siento, ¿puedes ser más específico? Te ayudo con gusto.';
    }

    return { content, applied: original !== content };
  }

  /**
   * Calculate response quality score
   */
  private calculateQualityScore(
    content: string,
    strategy: ResponseStrategy,
    intentAnalysis: IntentAnalysisExtended
  ): number {
    let score = 0.5; // Base score

    // Length appropriateness
    const words = content.split(/\s+/).length;
    if (words >= 10 && words <= 60) score += 0.2;
    else if (words <= 100) score += 0.1;

    // Has question
    if (content.includes('?')) score += 0.1;

    // Intent relevance
    if (intentAnalysis.confidence > 0.7) score += 0.1;

    // Strategy compliance
    if (strategy.type === 'contextual') score += 0.1;

    return Math.min(score, 1.0);
  }

  /**
   * Build response generation result
   */
  private buildResult(
    response: AIResponse,
    optimizations: string[],
    originalLength: number,
    finalLength: number,
    qualityScore: number,
    processingTime: number,
    templateUsed?: string
  ): ResponseGenerationResult {
    return {
      response,
      appliedOptimizations: optimizations,
      originalLength,
      finalLength,
      qualityScore,
      processingTime,
      templateUsed,
    };
  }
}
