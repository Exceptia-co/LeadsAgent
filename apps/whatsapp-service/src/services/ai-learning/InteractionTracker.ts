import { logger } from '../../utils/logger';
import DatabaseService from '../DatabaseService';
import type { TrainingInteraction } from '../../types';

/**
 * AI Learning - Interaction Tracker Module
 *
 * Responsible for:
 * - Training interaction logging and persistence
 * - Success score calculation with multi-factor analysis
 * - Async pattern analysis triggering
 * - Database interaction coordination
 */
export class InteractionTracker {
  private static instance: InteractionTracker;

  private constructor() {}

  public static getInstance(): InteractionTracker {
    if (!InteractionTracker.instance) {
      InteractionTracker.instance = new InteractionTracker();
    }
    return InteractionTracker.instance;
  }

  /**
   * Registra una interacción exitosa para aprendizaje futuro
   */
  public async logInteraction(
    interaction: Omit<TrainingInteraction, 'id' | 'timestamp'>,
    onPatternAnalysisCallback?: (userMessage: string, successScore: number) => Promise<void>
  ): Promise<string | null> {
    try {
      logger.info(`📊 Logging learning interaction for ${interaction.contextData.phoneNumber}`);

      const interactionId = await DatabaseService.saveTrainingInteraction({
        ...interaction,
        timestamp: new Date(),
      });

      if (interactionId) {
        logger.debug(`✅ Training interaction saved with ID: ${interactionId}`);

        // Trigger async pattern analysis if callback provided (no await para no bloquear)
        if (onPatternAnalysisCallback) {
          onPatternAnalysisCallback(interaction.userMessage, interaction.successScore).catch(
            error => {
              logger.error('Error in async pattern analysis:', error);
            }
          );
        }

        return interactionId;
      }

      return null;
    } catch (error) {
      logger.error('Error logging learning interaction:', error);
      return null;
    }
  }

  /**
   * Calcula el score de éxito basado en métricas de conversación
   */
  public calculateSuccessScore(
    userMessage: string,
    _aiResponse: string,
    metrics: {
      conversationContinued: boolean;
      responseTime?: number;
      followUpQuestions: number;
      userSatisfactionIndicators: string[];
      messageLength?: number;
      knowledgeBaseUsed: boolean;
    }
  ): number {
    let score = 0.5; // Base score

    // Factor 1: Continuación de conversación (más importante)
    if (metrics.conversationContinued) {
      score += 0.3;
      logger.debug('✅ Conversation continued (+0.3)');
    } else {
      score -= 0.2;
      logger.debug('❌ Conversation ended (-0.2)');
    }

    // Factor 2: Tiempo de respuesta apropiado
    if (metrics.responseTime) {
      if (metrics.responseTime < 5000) {
        // Menos de 5 segundos
        score += 0.1;
        logger.debug('⚡ Fast response (+0.1)');
      } else if (metrics.responseTime > 30000) {
        // Más de 30 segundos
        score -= 0.1;
        logger.debug('🐌 Slow response (-0.1)');
      }
    }

    // Factor 3: Preguntas de seguimiento (indica engagement)
    if (metrics.followUpQuestions > 0) {
      score += Math.min(metrics.followUpQuestions * 0.1, 0.2);
      logger.debug(`🤔 Follow-up questions (+${Math.min(metrics.followUpQuestions * 0.1, 0.2)})`);
    }

    // Factor 4: Indicadores de satisfacción
    const satisfactionScore = metrics.userSatisfactionIndicators.length * 0.05;
    score += satisfactionScore;
    if (satisfactionScore > 0) {
      logger.debug(`😊 Satisfaction indicators (+${satisfactionScore})`);
    }

    // Factor 5: Uso efectivo de knowledge base
    if (metrics.knowledgeBaseUsed && metrics.conversationContinued) {
      score += 0.15;
      logger.debug('📚 Knowledge base effectively used (+0.15)');
    }

    // Factor 6: Longitud apropiada de respuesta
    if (metrics.messageLength) {
      const idealLength = userMessage.length * 2; // Respuesta debería ser ~2x la pregunta
      const lengthRatio = metrics.messageLength / idealLength;

      if (lengthRatio >= 0.5 && lengthRatio <= 1.5) {
        score += 0.05;
        logger.debug('📏 Appropriate response length (+0.05)');
      }
    }

    // Normalize score between 0 and 1
    const finalScore = Math.max(0, Math.min(1, score));

    logger.debug(
      `📊 Success score calculated: ${finalScore.toFixed(3)} for message: "${userMessage.substring(0, 50)}..."`
    );

    return finalScore;
  }

  /**
   * Calculate performance metrics from training interactions
   */
  public calculatePerformanceMetrics(interactions: TrainingInteraction[]): {
    responseAccuracy: number;
    userSatisfaction: number;
    knowledgeBaseUtilization: number;
    conversationCompletionRate: number;
  } {
    if (interactions.length === 0) {
      return {
        responseAccuracy: 0,
        userSatisfaction: 0,
        knowledgeBaseUtilization: 0,
        conversationCompletionRate: 0,
      };
    }

    // Calcular métricas
    const avgSuccessScore =
      interactions.reduce((sum, i) => sum + i.successScore, 0) / interactions.length;

    const conversationsContinued = interactions.filter(
      i => i.feedbackMetrics.conversationContinued
    ).length;

    const knowledgeBaseUsed = interactions.filter(i => i.knowledgeBaseIdsUsed.length > 0).length;

    const userSatisfactionIndicators =
      interactions.reduce(
        (sum, i) => sum + i.feedbackMetrics.userSatisfactionIndicators.length,
        0
      ) / interactions.length;

    return {
      responseAccuracy: avgSuccessScore,
      userSatisfaction: userSatisfactionIndicators / 3, // Normalize assuming max 3 indicators
      knowledgeBaseUtilization: knowledgeBaseUsed / interactions.length,
      conversationCompletionRate: conversationsContinued / interactions.length,
    };
  }

  /**
   * Get training interactions from database
   */
  public async getTrainingInteractions(limit: number = 1000): Promise<TrainingInteraction[]> {
    try {
      return await DatabaseService.getTrainingInteractions(limit);
    } catch (error) {
      logger.error('Error fetching training interactions:', error);
      return [];
    }
  }

  /**
   * Save training interaction to database
   */
  public async saveTrainingInteraction(interaction: TrainingInteraction): Promise<string | null> {
    try {
      return await DatabaseService.saveTrainingInteraction(interaction);
    } catch (error) {
      logger.error('Error saving training interaction:', error);
      return null;
    }
  }
}

export default InteractionTracker.getInstance();
