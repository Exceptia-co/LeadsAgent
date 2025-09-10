import { logger } from '../../utils/logger';
import type { TrainingInteraction, LearningInsights, FrequentPattern } from '../../types';
import { InteractionTracker } from './InteractionTracker';
import { PatternAnalyzer } from './PatternAnalyzer';
import { KnowledgeGenerator } from './KnowledgeGenerator';

/**
 * AI Learning - Performance Analyzer Module
 *
 * Responsible for:
 * - Generating comprehensive learning insights and metrics
 * - Identifying improvement opportunities and gap analysis
 * - Performance metrics calculation and benchmarking
 * - Priority scoring for optimizations and recommendations
 */
export class PerformanceAnalyzer {
  private static instance: PerformanceAnalyzer;

  private constructor() {}

  public static getInstance(): PerformanceAnalyzer {
    if (!PerformanceAnalyzer.instance) {
      PerformanceAnalyzer.instance = new PerformanceAnalyzer();
    }
    return PerformanceAnalyzer.instance;
  }

  /**
   * Obtiene insights de aprendizaje completos
   */
  public async getLearningInsights(): Promise<LearningInsights> {
    try {
      logger.info('📊 Generating comprehensive learning insights');

      const interactionTracker = InteractionTracker.getInstance();
      const patternAnalyzer = PatternAnalyzer.getInstance();
      const knowledgeGenerator = KnowledgeGenerator.getInstance();

      const interactions = await interactionTracker.getTrainingInteractions(1000);
      const patterns = await patternAnalyzer.analyzeFrequentPatterns(20);
      const suggestions = await knowledgeGenerator.suggestKnowledgeBaseEntries();

      // Calcular métricas de performance
      const performanceMetrics = interactionTracker.calculatePerformanceMetrics(interactions);

      const insights: LearningInsights = {
        totalInteractions: interactions.length,
        averageSuccessScore:
          interactions.length > 0
            ? interactions.reduce((sum, i) => sum + i.successScore, 0) / interactions.length
            : 0,
        mostFrequentPatterns: patterns,
        suggestedKnowledgeEntries: suggestions,
        performanceMetrics,
      };

      logger.info('📊 Learning insights generated successfully', {
        totalInteractions: insights.totalInteractions,
        avgSuccess: insights.averageSuccessScore.toFixed(3),
        patterns: patterns.length,
        suggestions: suggestions.length,
      });

      return insights;
    } catch (error) {
      logger.error('Error generating learning insights:', error);

      // Return empty insights on error
      return {
        totalInteractions: 0,
        averageSuccessScore: 0,
        mostFrequentPatterns: [],
        suggestedKnowledgeEntries: [],
        performanceMetrics: {
          responseAccuracy: 0,
          userSatisfaction: 0,
          knowledgeBaseUtilization: 0,
          conversationCompletionRate: 0,
        },
      };
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
    try {
      const patternAnalyzer = PatternAnalyzer.getInstance();
      const patterns = await patternAnalyzer.analyzeFrequentPatterns(30);
      const opportunities = [];

      for (const pattern of patterns) {
        if (pattern.frequency >= 3 && pattern.averageSuccessScore < 0.8) {
          const potentialImprovement = 1.0 - pattern.averageSuccessScore;
          const priority = this.determinePriority(pattern.frequency, pattern.averageSuccessScore);

          opportunities.push({
            pattern: pattern.pattern,
            currentScore: pattern.averageSuccessScore,
            potentialImprovement,
            suggestion: this.generateImprovementSuggestion(pattern),
            priority,
          });
        }
      }

      return opportunities.sort(
        (a, b) =>
          this.getPriorityWeight(b.priority) * b.potentialImprovement -
          this.getPriorityWeight(a.priority) * a.potentialImprovement
      );
    } catch (error) {
      logger.error('Error identifying improvement opportunities:', error);
      return [];
    }
  }

  /**
   * Calculate comprehensive performance metrics
   */
  public async calculatePerformanceMetrics(
    interactions?: TrainingInteraction[]
  ): Promise<LearningInsights['performanceMetrics']> {
    try {
      if (!interactions) {
        const interactionTracker = InteractionTracker.getInstance();
        interactions = await interactionTracker.getTrainingInteractions(1000);
      }

      return InteractionTracker.getInstance().calculatePerformanceMetrics(interactions);
    } catch (error) {
      logger.error('Error calculating performance metrics:', error);
      return {
        responseAccuracy: 0,
        userSatisfaction: 0,
        knowledgeBaseUtilization: 0,
        conversationCompletionRate: 0,
      };
    }
  }

  /**
   * Generate trend analysis for learning metrics
   */
  public async generateTrendAnalysis(
    timeframe: 'daily' | 'weekly' | 'monthly' = 'weekly'
  ): Promise<{
    successScoreTrend: Array<{ date: string; score: number }>;
    interactionVolumeTrend: Array<{ date: string; count: number }>;
    patternEmergenceRate: number;
    improvementVelocity: number;
  }> {
    try {
      const interactionTracker = InteractionTracker.getInstance();
      const interactions = await interactionTracker.getTrainingInteractions(2000);

      // Calculate timeframe grouping
      const groupBy = timeframe === 'daily' ? 1 : timeframe === 'weekly' ? 7 : 30;
      const msPerDay = 24 * 60 * 60 * 1000;

      // Group interactions by timeframe
      const groups = new Map<string, TrainingInteraction[]>();

      interactions.forEach(interaction => {
        const date = new Date(interaction.timestamp);
        const groupDate = new Date(
          Math.floor(date.getTime() / (groupBy * msPerDay)) * (groupBy * msPerDay)
        );
        const key = groupDate.toISOString().split('T')[0];

        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(interaction);
      });

      // Calculate trends
      const successScoreTrend = Array.from(groups.entries())
        .map(([date, groupInteractions]) => ({
          date,
          score:
            groupInteractions.reduce((sum, i) => sum + i.successScore, 0) /
            groupInteractions.length,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const interactionVolumeTrend = Array.from(groups.entries())
        .map(([date, groupInteractions]) => ({
          date,
          count: groupInteractions.length,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Calculate pattern emergence rate (new patterns per timeframe)
      const patternAnalyzer = PatternAnalyzer.getInstance();
      const allPatterns = await patternAnalyzer.analyzeFrequentPatterns(100);
      const recentPatterns = allPatterns.filter(p => {
        const daysSince = (Date.now() - p.lastSeen.getTime()) / msPerDay;
        return daysSince <= groupBy;
      });

      const patternEmergenceRate = recentPatterns.length / Math.max(allPatterns.length, 1);

      // Calculate improvement velocity (rate of success score improvement)
      const improvementVelocity =
        successScoreTrend.length > 1
          ? (successScoreTrend[successScoreTrend.length - 1].score - successScoreTrend[0].score) /
            successScoreTrend.length
          : 0;

      logger.info(`📈 Trend analysis generated for ${timeframe} timeframe`, {
        dataPoints: successScoreTrend.length,
        avgScore: successScoreTrend.reduce((sum, t) => sum + t.score, 0) / successScoreTrend.length,
        patternEmergenceRate: patternEmergenceRate.toFixed(3),
        improvementVelocity: improvementVelocity.toFixed(3),
      });

      return {
        successScoreTrend,
        interactionVolumeTrend,
        patternEmergenceRate,
        improvementVelocity,
      };
    } catch (error) {
      logger.error('Error generating trend analysis:', error);
      return {
        successScoreTrend: [],
        interactionVolumeTrend: [],
        patternEmergenceRate: 0,
        improvementVelocity: 0,
      };
    }
  }

  /**
   * Generate recommendations for system optimization
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
    try {
      const insights = await this.getLearningInsights();
      const opportunities = await this.identifyImprovementOpportunities();
      const recommendations = [];

      // Knowledge base recommendations
      if (insights.performanceMetrics.knowledgeBaseUtilization < 0.5) {
        recommendations.push({
          category: 'knowledge_base' as const,
          priority: 'high' as const,
          title: 'Improve Knowledge Base Coverage',
          description: `Knowledge base utilization is ${(insights.performanceMetrics.knowledgeBaseUtilization * 100).toFixed(1)}%. Consider expanding content to cover frequent user queries.`,
          estimatedImpact: 0.8,
          actionItems: [
            'Add knowledge entries for top 10 frequent patterns',
            'Review and update existing entries for accuracy',
            'Implement auto-suggestions from learning data',
          ],
        });
      }

      // Response quality recommendations
      if (insights.averageSuccessScore < 0.7) {
        recommendations.push({
          category: 'response_quality' as const,
          priority: 'high' as const,
          title: 'Enhance Response Quality',
          description: `Average success score is ${(insights.averageSuccessScore * 100).toFixed(1)}%. Focus on improving response relevance and helpfulness.`,
          estimatedImpact: 0.9,
          actionItems: [
            'Analyze low-scoring interactions for improvement patterns',
            'Implement better context understanding',
            'Add personalization to responses',
          ],
        });
      }

      // User engagement recommendations
      if (insights.performanceMetrics.conversationCompletionRate < 0.6) {
        recommendations.push({
          category: 'user_engagement' as const,
          priority: 'medium' as const,
          title: 'Increase User Engagement',
          description: `Conversation completion rate is ${(insights.performanceMetrics.conversationCompletionRate * 100).toFixed(1)}%. Users are dropping off conversations.`,
          estimatedImpact: 0.7,
          actionItems: [
            'Implement proactive follow-up questions',
            'Add engaging conversation elements',
            'Reduce response time for better user experience',
          ],
        });
      }

      // High-impact pattern opportunities
      const highImpactOpportunities = opportunities.filter(
        o => o.priority === 'high' && o.potentialImprovement > 0.3
      );

      if (highImpactOpportunities.length > 0) {
        recommendations.push({
          category: 'response_quality' as const,
          priority: 'high' as const,
          title: 'Address High-Impact Pattern Gaps',
          description: `${highImpactOpportunities.length} frequent patterns have significant improvement potential.`,
          estimatedImpact: 0.85,
          actionItems: highImpactOpportunities
            .slice(0, 5)
            .map(
              o =>
                `Address pattern: "${o.pattern}" (current score: ${(o.currentScore * 100).toFixed(1)}%)`
            ),
        });
      }

      // Sort by priority and estimated impact
      recommendations.sort((a, b) => {
        const priorityDiff =
          this.getPriorityWeight(b.priority) - this.getPriorityWeight(a.priority);
        return priorityDiff !== 0 ? priorityDiff : b.estimatedImpact - a.estimatedImpact;
      });

      logger.info(`💡 Generated ${recommendations.length} optimization recommendations`);
      return recommendations;
    } catch (error) {
      logger.error('Error generating optimization recommendations:', error);
      return [];
    }
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  private determinePriority(frequency: number, avgScore: number): 'high' | 'medium' | 'low' {
    if (frequency >= 10 && avgScore < 0.6) return 'high';
    if (frequency >= 5 && avgScore < 0.7) return 'high';
    if (frequency >= 3 && avgScore < 0.5) return 'high';
    if (frequency >= 10 || avgScore < 0.6) return 'medium';
    return 'low';
  }

  private getPriorityWeight(priority: 'high' | 'medium' | 'low'): number {
    const weights = { high: 3, medium: 2, low: 1 };
    return weights[priority];
  }

  private generateImprovementSuggestion(pattern: FrequentPattern): string {
    if (pattern.averageSuccessScore < 0.5) {
      return `Crear respuesta específica para "${pattern.pattern}" - Score actual muy bajo (${(pattern.averageSuccessScore * 100).toFixed(1)}%)`;
    }

    if (pattern.frequency >= 10) {
      return `Optimizar respuesta para "${pattern.pattern}" - Consulta muy frecuente (${pattern.frequency} veces)`;
    }

    return `Mejorar respuesta para "${pattern.pattern}" - Oportunidad de optimización identificada`;
  }
}

export default PerformanceAnalyzer.getInstance();
