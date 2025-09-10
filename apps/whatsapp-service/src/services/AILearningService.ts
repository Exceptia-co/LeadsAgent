import { logger } from '../utils/logger';
import type { TrainingInteraction, FrequentPattern, LearningInsights } from '../types';

// Import modular components
import { InteractionTracker } from './ai-learning/InteractionTracker';
import { PatternAnalyzer } from './ai-learning/PatternAnalyzer';
import { KnowledgeGenerator } from './ai-learning/KnowledgeGenerator';
import { PerformanceAnalyzer } from './ai-learning/PerformanceAnalyzer';

// Import legacy implementation for fallback
import AILearningServiceLegacy from './AILearningServiceLegacy';

/**
 * AI Learning Service - Phase 6 Refactored
 *
 * Facade pattern that orchestrates 4 specialized modules:
 * - InteractionTracker: Training data collection & success scoring
 * - PatternAnalyzer: Pattern discovery & frequency analysis
 * - KnowledgeGenerator: KB suggestions & auto-updates
 * - PerformanceAnalyzer: Insights & improvement opportunities
 *
 * Features:
 * - Feature toggle: USE_AI_LEARNING_MODULAR environment variable
 * - 100% backward compatibility with automatic fallback
 * - Enhanced functionality through specialized modules
 * - Maintains singleton pattern and existing API
 */
class AILearningService {
  private static instance: AILearningService;
  private useModular: boolean;

  // Modular components
  private interactionTracker: InteractionTracker;
  private patternAnalyzer: PatternAnalyzer;
  private knowledgeGenerator: KnowledgeGenerator;
  private performanceAnalyzer: PerformanceAnalyzer;

  private constructor() {
    // Feature toggle: USE_AI_LEARNING_MODULAR environment variable
    this.useModular = process.env.USE_AI_LEARNING_MODULAR === 'true';

    logger.info(
      `🧠 AI Learning Service Architecture: ${this.useModular ? 'MODULAR (v2.0)' : 'LEGACY (v1.0)'}`
    );

    if (this.useModular) {
      // Initialize modular components
      this.interactionTracker = InteractionTracker.getInstance();
      this.patternAnalyzer = PatternAnalyzer.getInstance();
      this.knowledgeGenerator = KnowledgeGenerator.getInstance();
      this.performanceAnalyzer = PerformanceAnalyzer.getInstance();
    }
  }

  public static getInstance(): AILearningService {
    if (!AILearningService.instance) {
      AILearningService.instance = new AILearningService();
    }
    return AILearningService.instance;
  }

  // ============================================
  // PUBLIC API METHODS (100% BACKWARD COMPATIBLE)
  // ============================================

  /**
   * Registra una interacción exitosa para aprendizaje futuro
   */
  public async logInteraction(
    interaction: Omit<TrainingInteraction, 'id' | 'timestamp'>
  ): Promise<string | null> {
    if (this.useModular) {
      logger.debug('🔄 Using modular InteractionTracker for logInteraction');
      return await this.interactionTracker.logInteraction(
        interaction,
        this.patternAnalyzer.analyzePatternAsync.bind(this.patternAnalyzer)
      );
    } else {
      logger.debug('🔄 Using legacy implementation for logInteraction');
      return await AILearningServiceLegacy.logInteraction(interaction);
    }
  }

  /**
   * Calcula el score de éxito basado en métricas de conversación
   */
  public calculateSuccessScore(
    userMessage: string,
    aiResponse: string,
    metrics: {
      conversationContinued: boolean;
      responseTime?: number;
      followUpQuestions: number;
      userSatisfactionIndicators: string[];
      messageLength?: number;
      knowledgeBaseUsed: boolean;
    }
  ): number {
    if (this.useModular) {
      logger.debug('🔄 Using modular InteractionTracker for calculateSuccessScore');
      return this.interactionTracker.calculateSuccessScore(userMessage, aiResponse, metrics);
    } else {
      logger.debug('🔄 Using legacy implementation for calculateSuccessScore');
      return AILearningServiceLegacy.calculateSuccessScore(userMessage, aiResponse, metrics);
    }
  }

  /**
   * Analiza patrones frecuentes y sugiere mejoras
   */
  public async analyzeFrequentPatterns(limit: number = 50): Promise<FrequentPattern[]> {
    if (this.useModular) {
      logger.debug('🔄 Using modular PatternAnalyzer for analyzeFrequentPatterns');
      const patterns = await this.patternAnalyzer.analyzeFrequentPatterns(limit);

      // Enhance patterns with knowledge entry suggestions
      for (const pattern of patterns) {
        pattern.suggestedKnowledgeEntry =
          await this.knowledgeGenerator.generateKnowledgeEntrySuggestion(pattern);
      }

      return patterns;
    } else {
      logger.debug('🔄 Using legacy implementation for analyzeFrequentPatterns');
      return await AILearningServiceLegacy.analyzeFrequentPatterns(limit);
    }
  }

  /**
   * Sugiere nuevas entradas para la knowledge base basado en patrones
   */
  public async suggestKnowledgeBaseEntries(): Promise<
    Array<{
      title: string;
      content: string;
      keywords: string[];
      category: string;
      confidence: number;
      frequency: number;
      reasoning: string;
    }>
  > {
    if (this.useModular) {
      logger.debug('🔄 Using modular KnowledgeGenerator for suggestKnowledgeBaseEntries');
      return await this.knowledgeGenerator.suggestKnowledgeBaseEntries();
    } else {
      logger.debug('🔄 Using legacy implementation for suggestKnowledgeBaseEntries');
      return await AILearningServiceLegacy.suggestKnowledgeBaseEntries();
    }
  }

  /**
   * Obtiene insights de aprendizaje completos
   */
  public async getLearningInsights(): Promise<LearningInsights> {
    if (this.useModular) {
      logger.debug('🔄 Using modular PerformanceAnalyzer for getLearningInsights');
      return await this.performanceAnalyzer.getLearningInsights();
    } else {
      logger.debug('🔄 Using legacy implementation for getLearningInsights');
      return await AILearningServiceLegacy.getLearningInsights();
    }
  }

  /**
   * Actualiza automáticamente la knowledge base con sugerencias aprobadas
   */
  public async autoUpdateKnowledgeBase(
    confidence: number = 0.8,
    frequency: number = 5
  ): Promise<void> {
    if (this.useModular) {
      logger.debug('🔄 Using modular KnowledgeGenerator for autoUpdateKnowledgeBase');
      return await this.knowledgeGenerator.autoUpdateKnowledgeBase(confidence, frequency);
    } else {
      logger.debug('🔄 Using legacy implementation for autoUpdateKnowledgeBase');
      return await AILearningServiceLegacy.autoUpdateKnowledgeBase(confidence, frequency);
    }
  }

  /**
   * Identifica oportunidades de mejora en las respuestas
   */
  public async identifyImprovementOpportunities(): Promise<
    Array<{
      pattern: string;
      currentScore: number;
      potentialImprovement: number;
      suggestion: string;
      priority: 'high' | 'medium' | 'low';
    }>
  > {
    if (this.useModular) {
      logger.debug('🔄 Using modular PerformanceAnalyzer for identifyImprovementOpportunities');
      return await this.performanceAnalyzer.identifyImprovementOpportunities();
    } else {
      logger.debug('🔄 Using legacy implementation for identifyImprovementOpportunities');
      return await AILearningServiceLegacy.identifyImprovementOpportunities();
    }
  }

  // ============================================
  // ENHANCED MODULAR-ONLY METHODS
  // ============================================

  /**
   * Generate comprehensive trend analysis (Enhanced modular feature)
   */
  public async generateTrendAnalysis(
    timeframe: 'daily' | 'weekly' | 'monthly' = 'weekly'
  ): Promise<{
    successScoreTrend: Array<{ date: string; score: number }>;
    interactionVolumeTrend: Array<{ date: string; count: number }>;
    patternEmergenceRate: number;
    improvementVelocity: number;
  }> {
    if (this.useModular) {
      logger.debug('🔄 Using enhanced modular PerformanceAnalyzer for generateTrendAnalysis');
      return await this.performanceAnalyzer.generateTrendAnalysis(timeframe);
    } else {
      logger.warn(
        '⚠️ generateTrendAnalysis is only available in modular mode. Set USE_AI_LEARNING_MODULAR=true'
      );
      return {
        successScoreTrend: [],
        interactionVolumeTrend: [],
        patternEmergenceRate: 0,
        improvementVelocity: 0,
      };
    }
  }

  /**
   * Generate optimization recommendations (Enhanced modular feature)
   */
  public async generateOptimizationRecommendations(): Promise<
    Array<{
      category: 'knowledge_base' | 'response_quality' | 'user_engagement' | 'system_performance';
      priority: 'high' | 'medium' | 'low';
      title: string;
      description: string;
      estimatedImpact: number;
      actionItems: string[];
    }>
  > {
    if (this.useModular) {
      logger.debug(
        '🔄 Using enhanced modular PerformanceAnalyzer for generateOptimizationRecommendations'
      );
      return await this.performanceAnalyzer.generateOptimizationRecommendations();
    } else {
      logger.warn(
        '⚠️ generateOptimizationRecommendations is only available in modular mode. Set USE_AI_LEARNING_MODULAR=true'
      );
      return [];
    }
  }

  /**
   * Clear pattern cache (Enhanced modular feature)
   */
  public clearPatternCache(): void {
    if (this.useModular) {
      logger.debug('🔄 Using modular PatternAnalyzer for clearPatternCache');
      this.patternAnalyzer.clearCache();
    } else {
      logger.warn(
        '⚠️ clearPatternCache is only available in modular mode. Set USE_AI_LEARNING_MODULAR=true'
      );
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Get current architecture mode
   */
  public getArchitectureMode(): 'modular' | 'legacy' {
    return this.useModular ? 'modular' : 'legacy';
  }

  /**
   * Switch architecture mode (for testing/debugging only)
   */
  public switchToModular(): void {
    if (!this.useModular) {
      this.useModular = true;
      this.interactionTracker = InteractionTracker.getInstance();
      this.patternAnalyzer = PatternAnalyzer.getInstance();
      this.knowledgeGenerator = KnowledgeGenerator.getInstance();
      this.performanceAnalyzer = PerformanceAnalyzer.getInstance();
      logger.info('🔄 Switched to modular architecture');
    }
  }

  public switchToLegacy(): void {
    if (this.useModular) {
      this.useModular = false;
      logger.info('🔄 Switched to legacy architecture');
    }
  }

  /**
   * Get module health status
   */
  public getModuleHealthStatus(): {
    architecture: 'modular' | 'legacy';
    modules?: {
      interactionTracker: boolean;
      patternAnalyzer: boolean;
      knowledgeGenerator: boolean;
      performanceAnalyzer: boolean;
    };
  } {
    if (this.useModular) {
      return {
        architecture: 'modular',
        modules: {
          interactionTracker: !!this.interactionTracker,
          patternAnalyzer: !!this.patternAnalyzer,
          knowledgeGenerator: !!this.knowledgeGenerator,
          performanceAnalyzer: !!this.performanceAnalyzer,
        },
      };
    } else {
      return {
        architecture: 'legacy',
      };
    }
  }
}

// Export singleton instance
export default AILearningService.getInstance();
