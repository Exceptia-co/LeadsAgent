import { logger } from '../utils/logger';
import type { TrainingInteraction, FrequentPattern, LearningInsights } from '../types';

// Import modular components
import { InteractionTracker } from './ai-learning/InteractionTracker';
import { PatternAnalyzer } from './ai-learning/PatternAnalyzer';
import { KnowledgeGenerator } from './ai-learning/KnowledgeGenerator';
import { PerformanceAnalyzer } from './ai-learning/PerformanceAnalyzer';

/**
 * AI Learning Service - Modular Architecture
 *
 * Facade pattern that orchestrates 4 specialized modules:
 * - InteractionTracker: Training data collection & success scoring
 * - PatternAnalyzer: Pattern discovery & frequency analysis
 * - KnowledgeGenerator: KB suggestions & auto-updates
 * - PerformanceAnalyzer: Insights & improvement opportunities
 *
 * Features:
 * - Modular architecture with specialized components
 * - Enhanced functionality through specialized modules
 * - Maintains singleton pattern and existing API
 */
class AILearningService {
  private static instance: AILearningService;

  // Modular components
  private interactionTracker: InteractionTracker;
  private patternAnalyzer: PatternAnalyzer;
  private knowledgeGenerator: KnowledgeGenerator;
  private performanceAnalyzer: PerformanceAnalyzer;

  private constructor() {
    logger.info('🧠 AI Learning Service Architecture: MODULAR (v2.0)');

    // Initialize modular components
    this.interactionTracker = InteractionTracker.getInstance();
    this.patternAnalyzer = PatternAnalyzer.getInstance();
    this.knowledgeGenerator = KnowledgeGenerator.getInstance();
    this.performanceAnalyzer = PerformanceAnalyzer.getInstance();
  }

  public static getInstance(): AILearningService {
    if (!AILearningService.instance) {
      AILearningService.instance = new AILearningService();
    }
    return AILearningService.instance;
  }

  // ============================================
  // PUBLIC API METHODS
  // ============================================

  /**
   * Registra una interacción exitosa para aprendizaje futuro
   */
  public async logInteraction(
    interaction: Omit<TrainingInteraction, 'id' | 'timestamp'>
  ): Promise<string | null> {
    logger.debug('🔄 Using modular InteractionTracker for logInteraction');
    return await this.interactionTracker.logInteraction(
      interaction,
      this.patternAnalyzer.analyzePatternAsync.bind(this.patternAnalyzer)
    );
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
    logger.debug('🔄 Using modular InteractionTracker for calculateSuccessScore');
    return this.interactionTracker.calculateSuccessScore(userMessage, aiResponse, metrics);
  }

  /**
   * Analiza patrones frecuentes y sugiere mejoras
   */
  public async analyzeFrequentPatterns(limit: number = 50): Promise<FrequentPattern[]> {
    logger.debug('🔄 Using modular PatternAnalyzer for analyzeFrequentPatterns');
    const patterns = await this.patternAnalyzer.analyzeFrequentPatterns(limit);

    // Enhance patterns with knowledge entry suggestions
    for (const pattern of patterns) {
      pattern.suggestedKnowledgeEntry =
        await this.knowledgeGenerator.generateKnowledgeEntrySuggestion(pattern);
    }

    return patterns;
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
    logger.debug('🔄 Using modular KnowledgeGenerator for suggestKnowledgeBaseEntries');
    return await this.knowledgeGenerator.suggestKnowledgeBaseEntries();
  }

  /**
   * Obtiene insights de aprendizaje completos
   */
  public async getLearningInsights(): Promise<LearningInsights> {
    logger.debug('🔄 Using modular PerformanceAnalyzer for getLearningInsights');
    return await this.performanceAnalyzer.getLearningInsights();
  }

  /**
   * Actualiza automáticamente la knowledge base con sugerencias aprobadas
   */
  public async autoUpdateKnowledgeBase(
    confidence: number = 0.8,
    frequency: number = 5
  ): Promise<void> {
    logger.debug('🔄 Using modular KnowledgeGenerator for autoUpdateKnowledgeBase');
    return await this.knowledgeGenerator.autoUpdateKnowledgeBase(confidence, frequency);
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
    logger.debug('🔄 Using modular PerformanceAnalyzer for identifyImprovementOpportunities');
    return await this.performanceAnalyzer.identifyImprovementOpportunities();
  }

  // ============================================
  // ENHANCED MODULAR METHODS
  // ============================================

  /**
   * Generate comprehensive trend analysis
   */
  public async generateTrendAnalysis(
    timeframe: 'daily' | 'weekly' | 'monthly' = 'weekly'
  ): Promise<{
    successScoreTrend: Array<{ date: string; score: number }>;
    interactionVolumeTrend: Array<{ date: string; count: number }>;
    patternEmergenceRate: number;
    improvementVelocity: number;
  }> {
    logger.debug('🔄 Using enhanced modular PerformanceAnalyzer for generateTrendAnalysis');
    return await this.performanceAnalyzer.generateTrendAnalysis(timeframe);
  }

  /**
   * Generate optimization recommendations
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
    logger.debug(
      '🔄 Using enhanced modular PerformanceAnalyzer for generateOptimizationRecommendations'
    );
    return await this.performanceAnalyzer.generateOptimizationRecommendations();
  }

  /**
   * Clear pattern cache
   */
  public clearPatternCache(): void {
    logger.debug('🔄 Using modular PatternAnalyzer for clearPatternCache');
    this.patternAnalyzer.clearCache();
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Get current architecture mode
   */
  public getArchitectureMode(): 'modular' {
    return 'modular';
  }

  /**
   * Get module health status
   */
  public getModuleHealthStatus(): {
    architecture: 'modular';
    modules: {
      interactionTracker: boolean;
      patternAnalyzer: boolean;
      knowledgeGenerator: boolean;
      performanceAnalyzer: boolean;
    };
  } {
    return {
      architecture: 'modular',
      modules: {
        interactionTracker: !!this.interactionTracker,
        patternAnalyzer: !!this.patternAnalyzer,
        knowledgeGenerator: !!this.knowledgeGenerator,
        performanceAnalyzer: !!this.performanceAnalyzer,
      },
    };
  }
}

// Export singleton instance
export default AILearningService.getInstance();
