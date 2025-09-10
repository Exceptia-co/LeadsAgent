import { BaseRepository } from './BaseRepository';
import { logger } from '../../utils/logger';
import type { TrainingInteraction } from '../../types';

export interface CreateTrainingInteraction {
  userMessage: string;
  aiResponse: string;
  knowledgeBaseIdsUsed: string[];
  successScore: number;
  contextData: {
    phoneNumber: string;
    sessionId: string;
    leadId?: string;
    intent?: string;
    sentiment?: string;
    responseTime?: number;
    conversationLength?: number;
    userEngagement?: string;
    timeOfDay?: string;
    dayOfWeek?: string;
    responseType?: string;
  };
  feedbackMetrics: {
    conversationContinued: boolean;
    responseTime?: number;
    followUpQuestions: number;
    userSatisfactionIndicators: string[];
    personalizedElements?: number;
    contextFactors?: number;
  };
  timestamp?: Date;
}

export interface TrainingQueryOptions {
  limit?: number;
  offset?: number;
  minScore?: number;
  maxScore?: number;
  phoneNumber?: string;
  sessionId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: 'created_at' | 'success_score' | 'user_message';
  sortOrder?: 'ASC' | 'DESC';
}

export interface TrainingStats {
  totalInteractions: number;
  averageSuccessScore: number;
  interactionsLast7Days: number;
  averageSuccessLast7Days: number;
  topPerformingPatterns: string[];
  scoreDistribution: {
    excellent: number; // 0.8-1.0
    good: number; // 0.6-0.8
    fair: number; // 0.4-0.6
    poor: number; // 0.0-0.4
  };
}

export interface FrequentPattern {
  pattern: string;
  frequency: number;
  averageSuccessScore: number;
  lastSeen: Date;
  examples: string[];
}

export class TrainingRepository extends BaseRepository {
  private static readonly TABLE_NAME = 'ai_training_interactions';

  /**
   * Create training interactions table if it doesn't exist
   */
  protected async createTablesIfNotExists(): Promise<void> {
    const query = `
      -- AI training interactions table
      CREATE TABLE IF NOT EXISTS ${TrainingRepository.TABLE_NAME} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_message TEXT NOT NULL,
        ai_response TEXT NOT NULL,
        knowledge_base_ids_used TEXT[] DEFAULT '{}', -- Array of IDs used
        success_score DECIMAL(3,2) DEFAULT 0.50 CHECK (success_score >= 0 AND success_score <= 1),
        context_data JSONB NOT NULL, -- Contextual information (phoneNumber, sessionId, etc.)
        feedback_metrics JSONB NOT NULL, -- Feedback metrics (continuation, time, etc.)
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes for training interactions
      CREATE INDEX IF NOT EXISTS idx_training_score ON ${TrainingRepository.TABLE_NAME}(success_score);
      CREATE INDEX IF NOT EXISTS idx_training_created ON ${TrainingRepository.TABLE_NAME}(created_at);
      CREATE INDEX IF NOT EXISTS idx_training_context_phone ON ${TrainingRepository.TABLE_NAME}((context_data->>'phoneNumber'));
      CREATE INDEX IF NOT EXISTS idx_training_user_message ON ${TrainingRepository.TABLE_NAME} USING gin(to_tsvector('spanish', user_message));
      CREATE INDEX IF NOT EXISTS idx_training_kb_used ON ${TrainingRepository.TABLE_NAME} USING gin(knowledge_base_ids_used);
    `;

    await this.executeQuery(query);
    logger.info('✅ Training interactions table structure verified');
  }

  /**
   * Save training interaction
   */
  public async saveTrainingInteraction(interaction: TrainingInteraction): Promise<string | null> {
    try {
      const query = `
        INSERT INTO ${TrainingRepository.TABLE_NAME} (
          user_message, ai_response, knowledge_base_ids_used, success_score,
          context_data, feedback_metrics, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id;
      `;

      const values = [
        interaction.userMessage,
        interaction.aiResponse,
        interaction.knowledgeBaseIdsUsed,
        interaction.successScore,
        JSON.stringify(interaction.contextData),
        JSON.stringify(interaction.feedbackMetrics),
        interaction.timestamp || new Date(),
      ];

      const result = await this.executeQuery(query, values);
      const interactionId = result.rows[0]?.id;

      logger.debug(`📊 Training interaction saved with ID: ${interactionId}`);
      return interactionId;
    } catch (error) {
      logger.error('Error saving training interaction:', error);
      return null;
    }
  }

  /**
   * Create training interaction (simplified interface)
   */
  public async createTrainingInteraction(
    interaction: CreateTrainingInteraction
  ): Promise<string | null> {
    const trainingInteraction: TrainingInteraction = {
      userMessage: interaction.userMessage,
      aiResponse: interaction.aiResponse,
      knowledgeBaseIdsUsed: interaction.knowledgeBaseIdsUsed,
      successScore: interaction.successScore,
      contextData: interaction.contextData,
      feedbackMetrics: interaction.feedbackMetrics,
      timestamp: interaction.timestamp || new Date(),
    };

    return this.saveTrainingInteraction(trainingInteraction);
  }

  /**
   * Get training interactions with advanced filtering
   */
  public async getTrainingInteractions(
    options: TrainingQueryOptions = {}
  ): Promise<TrainingInteraction[]> {
    try {
      const {
        limit = 500,
        offset = 0,
        minScore,
        maxScore,
        phoneNumber,
        sessionId,
        dateFrom,
        dateTo,
        sortBy = 'created_at',
        sortOrder = 'DESC',
      } = options;

      let query = `
        SELECT 
          id, user_message, ai_response, knowledge_base_ids_used,
          success_score, context_data, feedback_metrics, created_at
        FROM ${TrainingRepository.TABLE_NAME}
        WHERE 1=1
      `;

      const values: any[] = [];
      let paramIndex = 1;

      // Add filters
      if (minScore !== undefined) {
        query += ` AND success_score >= $${paramIndex}`;
        values.push(minScore);
        paramIndex++;
      }

      if (maxScore !== undefined) {
        query += ` AND success_score <= $${paramIndex}`;
        values.push(maxScore);
        paramIndex++;
      }

      if (phoneNumber) {
        query += ` AND context_data->>'phoneNumber' = $${paramIndex}`;
        values.push(phoneNumber);
        paramIndex++;
      }

      if (sessionId) {
        query += ` AND context_data->>'sessionId' = $${paramIndex}`;
        values.push(sessionId);
        paramIndex++;
      }

      if (dateFrom) {
        query += ` AND created_at >= $${paramIndex}`;
        values.push(dateFrom);
        paramIndex++;
      }

      if (dateTo) {
        query += ` AND created_at <= $${paramIndex}`;
        values.push(dateTo);
        paramIndex++;
      }

      // Add ordering and pagination
      query += ` ORDER BY ${sortBy} ${sortOrder}`;
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      values.push(limit, offset);

      const result = await this.executeQuery(query, values);

      return result.rows.map(row => ({
        id: row.id,
        userMessage: row.user_message,
        aiResponse: row.ai_response,
        knowledgeBaseIdsUsed: row.knowledge_base_ids_used || [],
        successScore: parseFloat(row.success_score),
        contextData: row.context_data,
        feedbackMetrics: row.feedback_metrics,
        timestamp: new Date(row.created_at),
      }));
    } catch (error) {
      logger.error('Error getting training interactions:', error);
      return [];
    }
  }

  /**
   * Get training statistics
   */
  public async getTrainingStats(): Promise<TrainingStats> {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_interactions,
          AVG(success_score) as avg_score,
          COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as last_7_days,
          AVG(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN success_score END) as avg_score_7_days,
          COUNT(CASE WHEN success_score >= 0.8 THEN 1 END) as excellent,
          COUNT(CASE WHEN success_score >= 0.6 AND success_score < 0.8 THEN 1 END) as good,
          COUNT(CASE WHEN success_score >= 0.4 AND success_score < 0.6 THEN 1 END) as fair,
          COUNT(CASE WHEN success_score < 0.4 THEN 1 END) as poor
        FROM ${TrainingRepository.TABLE_NAME};
      `;

      const result = await this.executeQuery(query);
      const stats = result.rows[0];

      // Get top performing patterns
      const patternsQuery = `
        SELECT 
          substring(user_message, 1, 50) as pattern,
          COUNT(*) as frequency,
          AVG(success_score) as avg_score
        FROM ${TrainingRepository.TABLE_NAME}
        WHERE success_score >= 0.7
        GROUP BY substring(user_message, 1, 50)
        HAVING COUNT(*) >= 2
        ORDER BY avg_score DESC, frequency DESC
        LIMIT 5;
      `;

      const patternsResult = await this.executeQuery(patternsQuery);
      const patterns = patternsResult.rows.map(
        row => `${row.pattern}... (${row.frequency}x, ${parseFloat(row.avg_score).toFixed(2)})`
      );

      return {
        totalInteractions: parseInt(stats.total_interactions) || 0,
        averageSuccessScore: parseFloat(stats.avg_score) || 0,
        interactionsLast7Days: parseInt(stats.last_7_days) || 0,
        averageSuccessLast7Days: parseFloat(stats.avg_score_7_days) || 0,
        topPerformingPatterns: patterns,
        scoreDistribution: {
          excellent: parseInt(stats.excellent) || 0,
          good: parseInt(stats.good) || 0,
          fair: parseInt(stats.fair) || 0,
          poor: parseInt(stats.poor) || 0,
        },
      };
    } catch (error) {
      logger.error('Error getting training stats:', error);
      return {
        totalInteractions: 0,
        averageSuccessScore: 0,
        interactionsLast7Days: 0,
        averageSuccessLast7Days: 0,
        topPerformingPatterns: [],
        scoreDistribution: { excellent: 0, good: 0, fair: 0, poor: 0 },
      };
    }
  }

  /**
   * Search training interactions by text pattern
   */
  public async searchTrainingInteractions(
    searchQuery: string,
    options: TrainingQueryOptions = {}
  ): Promise<TrainingInteraction[]> {
    try {
      const { limit = 50, minScore = 0.0 } = options;

      const query = `
        SELECT 
          id, user_message, ai_response, knowledge_base_ids_used,
          success_score, context_data, feedback_metrics, created_at,
          ts_rank(to_tsvector('spanish', user_message || ' ' || ai_response), plainto_tsquery('spanish', $1)) as relevance
        FROM ${TrainingRepository.TABLE_NAME}
        WHERE 
          (to_tsvector('spanish', user_message || ' ' || ai_response) @@ plainto_tsquery('spanish', $1)
           OR user_message ILIKE $2
           OR ai_response ILIKE $2)
          AND success_score >= $3
        ORDER BY relevance DESC, success_score DESC, created_at DESC
        LIMIT $4;
      `;

      const likePattern = `%${searchQuery}%`;
      const result = await this.executeQuery(query, [searchQuery, likePattern, minScore, limit]);

      return result.rows.map(row => ({
        id: row.id,
        userMessage: row.user_message,
        aiResponse: row.ai_response,
        knowledgeBaseIdsUsed: row.knowledge_base_ids_used || [],
        successScore: parseFloat(row.success_score),
        contextData: row.context_data,
        feedbackMetrics: row.feedback_metrics,
        timestamp: new Date(row.created_at),
      }));
    } catch (error) {
      logger.error('Error searching training interactions:', error);
      return [];
    }
  }

  /**
   * Get frequent patterns for knowledge base suggestions
   */
  public async getFrequentPatterns(minFrequency = 3, minScore = 0.6): Promise<FrequentPattern[]> {
    try {
      const query = `
        SELECT 
          regexp_replace(lower(user_message), '[^a-záéíóúñü\\s]', '', 'g') as normalized_message,
          COUNT(*) as frequency,
          AVG(success_score) as avg_score,
          MAX(created_at) as last_seen,
          array_agg(DISTINCT substring(user_message, 1, 100)) as examples
        FROM ${TrainingRepository.TABLE_NAME}
        WHERE success_score >= $2
          AND length(user_message) >= 10
        GROUP BY regexp_replace(lower(user_message), '[^a-záéíóúñü\\s]', '', 'g')
        HAVING COUNT(*) >= $1
        ORDER BY AVG(success_score) DESC, COUNT(*) DESC
        LIMIT 20;
      `;

      const result = await this.executeQuery(query, [minFrequency, minScore]);

      return result.rows.map(row => ({
        pattern: row.normalized_message,
        frequency: parseInt(row.frequency),
        averageSuccessScore: parseFloat(row.avg_score),
        lastSeen: new Date(row.last_seen),
        examples: row.examples.slice(0, 3), // Limit to 3 examples
      }));
    } catch (error) {
      logger.error('Error getting frequent patterns:', error);
      return [];
    }
  }

  /**
   * Clean up old training interactions
   */
  public async cleanupOldTrainingInteractions(daysOld = 90): Promise<boolean> {
    try {
      const query = `
        DELETE FROM ${TrainingRepository.TABLE_NAME} 
        WHERE created_at < CURRENT_DATE - INTERVAL '${daysOld} days'
      `;

      const result = await this.executeQuery(query);
      const deletedCount = result.rowCount || 0;

      logger.info(`🗑️ Cleaned up ${deletedCount} old training interactions (>${daysOld} days)`);
      return true;
    } catch (error) {
      logger.error('Error cleaning up old training interactions:', error);
      return false;
    }
  }

  /**
   * Update training interaction (for feedback collection)
   */
  public async updateTrainingInteraction(
    id: string,
    updates: {
      successScore?: number;
      feedbackMetrics?: any;
    }
  ): Promise<boolean> {
    try {
      const setParts: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.successScore !== undefined) {
        setParts.push(`success_score = $${paramIndex}`);
        values.push(updates.successScore);
        paramIndex++;
      }

      if (updates.feedbackMetrics !== undefined) {
        setParts.push(`feedback_metrics = $${paramIndex}`);
        values.push(JSON.stringify(updates.feedbackMetrics));
        paramIndex++;
      }

      if (setParts.length === 0) {
        return true; // No updates
      }

      setParts.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      const query = `
        UPDATE ${TrainingRepository.TABLE_NAME}
        SET ${setParts.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id;
      `;

      const result = await this.executeQuery(query, values);

      if (result.rows.length > 0) {
        logger.info(`✅ Training interaction updated: ${id}`);
        return true;
      } else {
        logger.warn(`Training interaction not found: ${id}`);
        return false;
      }
    } catch (error) {
      logger.error('Error updating training interaction:', error);
      return false;
    }
  }

  /**
   * Get training interactions by knowledge base usage
   */
  public async getInteractionsByKnowledgeBase(
    knowledgeBaseId: string,
    limit = 100
  ): Promise<TrainingInteraction[]> {
    try {
      const query = `
        SELECT 
          id, user_message, ai_response, knowledge_base_ids_used,
          success_score, context_data, feedback_metrics, created_at
        FROM ${TrainingRepository.TABLE_NAME}
        WHERE $1 = ANY(knowledge_base_ids_used)
        ORDER BY success_score DESC, created_at DESC
        LIMIT $2;
      `;

      const result = await this.executeQuery(query, [knowledgeBaseId, limit]);

      return result.rows.map(row => ({
        id: row.id,
        userMessage: row.user_message,
        aiResponse: row.ai_response,
        knowledgeBaseIdsUsed: row.knowledge_base_ids_used || [],
        successScore: parseFloat(row.success_score),
        contextData: row.context_data,
        feedbackMetrics: row.feedback_metrics,
        timestamp: new Date(row.created_at),
      }));
    } catch (error) {
      logger.error('Error getting interactions by knowledge base:', error);
      return [];
    }
  }

  /**
   * Find training interaction by ID
   */
  public async findById(id: string): Promise<TrainingInteraction | null> {
    try {
      const query = `
        SELECT 
          id, user_message, ai_response, knowledge_base_ids_used,
          success_score, context_data, feedback_metrics, created_at
        FROM ${TrainingRepository.TABLE_NAME}
        WHERE id = $1;
      `;

      const result = await this.executeQuery(query, [id]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        userMessage: row.user_message,
        aiResponse: row.ai_response,
        knowledgeBaseIdsUsed: row.knowledge_base_ids_used || [],
        successScore: parseFloat(row.success_score),
        contextData: row.context_data,
        feedbackMetrics: row.feedback_metrics,
        timestamp: new Date(row.created_at),
      };
    } catch (error) {
      logger.error(`Error finding training interaction by ID ${id}:`, error);
      return null;
    }
  }

  /**
   * Get training interaction count
   */
  public async getInteractionCount(filters?: {
    phoneNumber?: string;
    sessionId?: string;
  }): Promise<number> {
    try {
      let query = `SELECT COUNT(*) as count FROM ${TrainingRepository.TABLE_NAME}`;
      const values: any[] = [];
      let paramIndex = 1;

      if (filters) {
        const conditions: string[] = [];

        if (filters.phoneNumber) {
          conditions.push(`context_data->>'phoneNumber' = $${paramIndex}`);
          values.push(filters.phoneNumber);
          paramIndex++;
        }

        if (filters.sessionId) {
          conditions.push(`context_data->>'sessionId' = $${paramIndex}`);
          values.push(filters.sessionId);
          paramIndex++;
        }

        if (conditions.length > 0) {
          query += ` WHERE ${conditions.join(' AND ')}`;
        }
      }

      const result = await this.executeQuery(query, values);
      return parseInt(result.rows[0]?.count) || 0;
    } catch (error) {
      logger.error('Error getting training interaction count:', error);
      return 0;
    }
  }

  /**
   * Delete training interaction
   */
  public async deleteTrainingInteraction(id: string): Promise<boolean> {
    try {
      const query = `DELETE FROM ${TrainingRepository.TABLE_NAME} WHERE id = $1 RETURNING id`;
      const result = await this.executeQuery(query, [id]);

      if (result.rows.length > 0) {
        logger.info(`✅ Training interaction deleted: ${id}`);
        return true;
      } else {
        logger.warn(`Training interaction not found: ${id}`);
        return false;
      }
    } catch (error) {
      logger.error('Error deleting training interaction:', error);
      return false;
    }
  }
}
