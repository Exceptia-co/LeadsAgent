/**
 * AI Orchestrator Service
 *
 * Main coordinator that integrates all AI services following the Facade pattern.
 * Provides unified interface for AI operations with intelligent fallbacks,
 * template optimization, and enhanced response generation.
 */

import { logger } from '../../utils/logger';
import { aiConfig } from '../../config/enhanced-ai.config';
import { aiProviderFactory } from './AIProviderFactory';
import { TemplateService } from './TemplateService';
import { IntentAnalysisService } from './IntentAnalysisService';
import { SystemPromptService } from './SystemPromptService';

import type { AIProviderType, EnhancedAIResponse, MessageContext } from './interfaces/IAIProvider';
import type { IntentAnalysis } from './interfaces/IIntentAnalysis';

/**
 * Orchestrator configuration options
 */
export interface OrchestratorConfig {
  templateConfig?: {
    maxWords?: number;
    enableFallback?: boolean;
    priority?: 'low' | 'medium' | 'high';
  };
  intentConfig?: {
    confidenceThreshold?: number;
    enableCaching?: boolean;
  };
  enableFallbacks?: boolean;
  enableMetrics?: boolean;
  maxRetries?: number;
}

/**
 * Response generation options
 */
export interface ResponseOptions {
  preferTemplate?: boolean;
  maxWords?: number;
  useCase?: 'onboarding' | 'sales' | 'support' | 'retention';
  language?: 'es' | 'en';
  enableFallback?: boolean;
  systemPromptOverride?: string;
}

/**
 * AI Orchestrator Service implementation
 */
export class AIOrchestratorService {
  private templateService: TemplateService;
  private intentService: IntentAnalysisService;
  private promptService: SystemPromptService;
  private config: Required<OrchestratorConfig>;
  private metrics: {
    totalRequests: number;
    templatesUsed: number;
    aiGenerations: number;
    fallbacksUsed: number;
    errors: number;
  } = {
    totalRequests: 0,
    templatesUsed: 0,
    aiGenerations: 0,
    fallbacksUsed: 0,
    errors: 0,
  };

  constructor(config?: OrchestratorConfig) {
    const aiConfigData = aiConfig.getConfig();

    // Merge configurations
    this.config = {
      templateConfig: config?.templateConfig || {},
      intentConfig: config?.intentConfig || {},
      enableFallbacks: config?.enableFallbacks ?? aiConfigData.features.enableProviderFallback,
      enableMetrics: config?.enableMetrics ?? aiConfigData.features.enableMetrics,
      maxRetries: config?.maxRetries ?? aiConfigData.response.maxRetries,
    };

    // Initialize services
    this.templateService = new TemplateService(this.config.templateConfig);
    this.intentService = new IntentAnalysisService(this.config.intentConfig);
    this.promptService = new SystemPromptService();

    logger.info('✅ AI Orchestrator Service initialized');
    logger.debug('Configuration:', this.config);
  }

  /**
   * Generate optimized response with full orchestration
   */
  public async generateOptimizedResponse(
    message: string,
    context?: MessageContext,
    options?: ResponseOptions
  ): Promise<EnhancedAIResponse> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      // 1. Analyze intent first
      logger.debug('🔍 Starting intent analysis...');
      const intentAnalysis = await this.intentService.analyzeIntent(message, context);

      logger.debug('Intent analysis result:', {
        intent: intentAnalysis.intent,
        confidence: intentAnalysis.confidence,
        sentiment: intentAnalysis.sentiment,
      });

      // 2. Check if we should use templates for this intent
      const shouldUseTemplate = this.shouldUseTemplate(message, intentAnalysis, options);

      if (shouldUseTemplate) {
        return await this.generateTemplateResponse(message, intentAnalysis, context, options);
      }

      // 3. Generate AI response
      return await this.generateAIResponse(message, intentAnalysis, context, options);
    } catch (error) {
      this.metrics.errors++;
      logger.error('Error in generateOptimizedResponse:', error);

      // Return fallback response
      return this.createFallbackResponse(message, error, startTime);
    }
  }

  /**
   * Generate template-based response
   */
  private async generateTemplateResponse(
    message: string,
    intentAnalysis: IntentAnalysis,
    context?: MessageContext,
    options?: ResponseOptions
  ): Promise<EnhancedAIResponse> {
    const startTime = Date.now();

    try {
      const template = this.templateService.getTemplate(intentAnalysis.intent as any, context);

      if (!template) {
        // Fallback to AI generation if no template available
        logger.debug('No template available, falling back to AI generation');
        return await this.generateAIResponse(message, intentAnalysis, context, options);
      }

      this.metrics.templatesUsed++;
      const processingTime = Date.now() - startTime;

      logger.debug(`✅ Template response generated in ${processingTime}ms`);

      return {
        success: true,
        content: template,
        provider: 'template',
        processingTime,
        tokensUsed: 0,
        intentAnalysis,
        usedTemplate: true,
        templateCategory: intentAnalysis.intent,
        fallbackUsed: false,
      };
    } catch (error) {
      logger.error('Error generating template response:', error);
      // Fallback to AI generation
      return await this.generateAIResponse(message, intentAnalysis, context, options);
    }
  }

  /**
   * Generate AI-powered response
   */
  private async generateAIResponse(
    message: string,
    intentAnalysis: IntentAnalysis,
    context?: MessageContext,
    options?: ResponseOptions
  ): Promise<EnhancedAIResponse> {
    const startTime = Date.now();

    try {
      // Get AI provider
      const provider = await aiProviderFactory.getRecommendedProvider();

      if (!provider || !provider.isReady()) {
        throw new Error('No AI provider available');
      }

      // B2.1: async prompt — dynamic per agent when available
      const systemPrompt = await this.generateSystemPromptAsync(intentAnalysis, context, options);

      // Generate response
      logger.debug(`🤖 Generating AI response with ${provider.name}`);
      const aiResponse = await provider.generateResponse(message, systemPrompt, context);

      if (!aiResponse.success || !aiResponse.content) {
        throw new Error(aiResponse.error || 'AI generation failed');
      }

      this.metrics.aiGenerations++;

      // Truncación post-IA ELIMINADA - la IA ya tiene instrucciones de brevedad en el system prompt
      // No reemplazamos respuestas de IA con templates hardcodeados
      const finalContent = aiResponse.content;
      const fallbackUsed = false;
      const wordCount = finalContent.split(/\s+/).length;

      const processingTime = Date.now() - startTime;

      logger.debug(`✅ AI response generated in ${processingTime}ms (${wordCount} words)`);

      return {
        success: true,
        content: finalContent,
        provider: aiResponse.provider,
        processingTime,
        tokensUsed: aiResponse.tokensUsed,
        intentAnalysis,
        usedTemplate: false,
        templateCategory: fallbackUsed ? intentAnalysis.intent : undefined,
        fallbackUsed,
        modelUsed: provider.getStatus().model,
      };
    } catch (error) {
      logger.error('Error generating AI response:', error);

      // Try template fallback
      if (this.config.enableFallbacks) {
        logger.debug('🔄 Attempting template fallback after AI failure');
        const template = this.templateService.getTemplate(intentAnalysis.intent as any, context);

        if (template) {
          this.metrics.fallbacksUsed++;
          const processingTime = Date.now() - startTime;

          return {
            success: true,
            content: template,
            provider: 'template_fallback',
            processingTime,
            tokensUsed: 0,
            intentAnalysis,
            usedTemplate: true,
            templateCategory: intentAnalysis.intent,
            fallbackUsed: true,
            error: `AI generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      }

      throw error;
    }
  }

  /**
   * B2.1: async prompt generation — uses dynamic agent prompt when aiAgentId
   * is available, falls back to legacy for specialized paths.
   */
  private async generateSystemPromptAsync(
    intentAnalysis: IntentAnalysis,
    context?: MessageContext,
    options?: ResponseOptions
  ): Promise<string> {
    if (options?.systemPromptOverride) {
      return options.systemPromptOverride;
    }

    if (options?.useCase) {
      return this.promptService.getPromptForUseCase(options.useCase, context);
    }

    if (options?.language && options.language !== 'es') {
      return this.promptService.generateLocalizedPrompt(options.language, context);
    }

    if (intentAnalysis.intent === 'soporte_tecnico') {
      return this.promptService.generateSpecializedPrompt('technical_support', context);
    }

    return this.promptService.buildAgentSystemPrompt(context?.aiAgentId, context);
  }

  /**
   * Determine if template should be used instead of AI
   */
  private shouldUseTemplate(
    _message: string,
    _intentAnalysis: IntentAnalysis,
    options?: ResponseOptions
  ): boolean {
    // Templates proactivos ELIMINADOS - solo usar si se solicita explícitamente
    // Todas las respuestas van a OpenRouter/IA para respuestas contextuales
    return options?.preferTemplate === true;
  }

  /**
   * Create fallback response for errors
   */
  private createFallbackResponse(
    message: string,
    error: any,
    startTime: number
  ): EnhancedAIResponse {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Try to get a generic fallback template
    const fallbackTemplate = this.templateService.getTemplate('consulta_general' as any);

    return {
      success: false,
      content: fallbackTemplate || 'Disculpa, ha ocurrido un error. ¿Puedes intentarlo de nuevo?',
      provider: 'fallback',
      processingTime,
      tokensUsed: 0,
      error: errorMessage,
      fallbackUsed: true,
      usedTemplate: !!fallbackTemplate,
      templateCategory: fallbackTemplate ? 'consulta_general' : undefined,
    };
  }

  /**
   * Analyze intent (exposed method)
   */
  public async analyzeIntent(message: string, context?: MessageContext): Promise<IntentAnalysis> {
    return await this.intentService.analyzeIntent(message, context);
  }

  /**
   * Switch AI provider
   */
  public async switchProvider(providerType: AIProviderType): Promise<boolean> {
    try {
      const provider = await aiProviderFactory.createProvider(providerType);

      if (provider && provider.isReady()) {
        logger.info(`✅ Switched to AI provider: ${providerType}`);
        return true;
      }

      logger.error(`❌ Failed to switch to provider ${providerType}: Not ready`);
      return false;
    } catch (error) {
      logger.error(`❌ Failed to switch to provider ${providerType}:`, error);
      return false;
    }
  }

  /**
   * Get current provider status
   */
  public async getProviderStatus(): Promise<Record<AIProviderType, any>> {
    return await aiProviderFactory.getAllProvidersStatus();
  }

  /**
   * Perform health checks on all providers
   */
  public async performHealthCheck(): Promise<void> {
    await aiProviderFactory.performHealthChecks();
  }

  /**
   * Get service metrics
   */
  public getMetrics(): typeof this.metrics & {
    templateUsageRate: number;
    fallbackRate: number;
    errorRate: number;
    averageProcessingTime?: number;
  } {
    const totalSuccessful = this.metrics.totalRequests - this.metrics.errors;

    return {
      ...this.metrics,
      templateUsageRate:
        this.metrics.totalRequests > 0
          ? (this.metrics.templatesUsed / this.metrics.totalRequests) * 100
          : 0,
      fallbackRate:
        this.metrics.totalRequests > 0
          ? (this.metrics.fallbacksUsed / this.metrics.totalRequests) * 100
          : 0,
      errorRate:
        this.metrics.totalRequests > 0
          ? (this.metrics.errors / this.metrics.totalRequests) * 100
          : 0,
    };
  }

  /**
   * Reset metrics
   */
  public resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      templatesUsed: 0,
      aiGenerations: 0,
      fallbacksUsed: 0,
      errors: 0,
    };

    logger.info('📊 AI Orchestrator metrics reset');
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<OrchestratorConfig>): void {
    this.config = { ...this.config, ...config };

    // Update child services if needed
    if (config.templateConfig) {
      this.templateService.updateConfig(config.templateConfig);
    }

    if (config.intentConfig) {
      // IntentAnalysisService doesn't have updateConfig method in current implementation
      // This could be added later if needed
    }

    logger.info('🔧 AI Orchestrator configuration updated');
  }

  /**
   * Get comprehensive status
   */
  public async getStatus(): Promise<{
    orchestrator: { ready: boolean; config: any };
    providers: Record<AIProviderType, any>;
    services: {
      template: any;
      intent: any;
      prompt: any;
    };
    metrics: ReturnType<typeof this.getMetrics>;
  }> {
    return {
      orchestrator: {
        ready: true,
        config: this.config,
      },
      providers: await this.getProviderStatus(),
      services: {
        template: this.templateService.getTemplateStats(),
        intent: this.intentService.getStats(),
        prompt: this.promptService.getPromptStats(),
      },
      metrics: this.getMetrics(),
    };
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    logger.info('🧹 Cleaning up AI Orchestrator...');

    // Cleanup provider factory
    await aiProviderFactory.cleanup();

    // Reset metrics
    this.resetMetrics();

    logger.info('✅ AI Orchestrator cleanup completed');
  }
}
