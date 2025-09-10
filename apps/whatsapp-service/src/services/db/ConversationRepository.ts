/**
 * @fileoverview Conversation Repository Implementation
 * Handles all database operations related to conversations and messages
 */

import { BaseRepository } from './BaseRepository';
import {
  ConversationData,
  ConversationHistory,
  IConversationRepository,
  IDatabaseConnection,
} from './types';
import { logger } from '../../utils/logger';

export class ConversationRepository extends BaseRepository implements IConversationRepository {
  constructor(connection?: IDatabaseConnection) {
    super(connection);
  }

  /**
   * Create conversations table if it doesn't exist
   */
  protected async createTablesIfNotExists(): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS whatsapp_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "sessionId" VARCHAR(255) NOT NULL,
        "phoneNumber" VARCHAR(50) NOT NULL,
        "contactName" VARCHAR(255),
        "messageText" TEXT,
        "responseText" TEXT,
        "messageType" VARCHAR(50) DEFAULT 'text',
        intent VARCHAR(100),
        sentiment VARCHAR(50),
        "aiProvider" VARCHAR(100),
        "tokensUsed" INTEGER DEFAULT 0,
        "isFromUser" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_conversations_phone ON whatsapp_conversations ("phoneNumber");
      CREATE INDEX IF NOT EXISTS idx_conversations_session ON whatsapp_conversations ("sessionId");
      CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON whatsapp_conversations ("createdAt");
      CREATE INDEX IF NOT EXISTS idx_conversations_is_from_user ON whatsapp_conversations ("isFromUser");
      CREATE INDEX IF NOT EXISTS idx_conversations_message_search ON whatsapp_conversations USING gin(to_tsvector('english', "messageText"));
    `;

    try {
      await this.executeQuery(createTableSQL, [], 'create-conversations-table');
      logger.info('✅ Conversations table and indexes created/verified');
    } catch (error) {
      logger.error('❌ Failed to create conversations table:', error);
      throw error;
    }
  }

  /**
   * Save a conversation entry
   */
  public async save(data: ConversationData): Promise<void> {
    try {
      this.validateRequiredFields(data, ['sessionId', 'phoneNumber', 'isFromUser']);

      logger.info('🔍 [CONVERSATION] Saving conversation:', {
        sessionId: data.sessionId,
        phoneNumber: data.phoneNumber,
        messageText: data.messageText ? data.messageText.substring(0, 50) + '...' : null,
        isFromUser: data.isFromUser,
      });

      const sanitizedData = this.sanitizeData(data);

      const insertSQL = `
        INSERT INTO whatsapp_conversations (
          "sessionId", "phoneNumber", "contactName", "messageText", "responseText",
          "messageType", intent, sentiment, "aiProvider", "tokensUsed", "isFromUser"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `;

      const values = [
        sanitizedData.sessionId,
        sanitizedData.phoneNumber,
        sanitizedData.contactName || null,
        sanitizedData.messageText || null,
        sanitizedData.responseText || null,
        sanitizedData.messageType || 'text',
        sanitizedData.intent || null,
        sanitizedData.sentiment || null,
        sanitizedData.aiProvider || null,
        sanitizedData.tokensUsed || 0,
        sanitizedData.isFromUser,
      ];

      const result = await this.executeQuery(insertSQL, values, 'save-conversation');

      if (result.rowCount === 0) {
        throw new Error('Failed to save conversation');
      }

      logger.info(`✅ Conversation saved with ID: ${result.rows[0].id}`);
    } catch (error) {
      logger.error('Error saving conversation:', error);
      throw error;
    }
  }

  /**
   * Find conversation by ID
   */
  public async findById(id: string): Promise<ConversationHistory | null> {
    try {
      this.validateRequiredFields({ id }, ['id']);

      const result = await this.executeQuery<ConversationHistory>(
        'SELECT * FROM whatsapp_conversations WHERE id = $1',
        [id],
        'find-conversation-by-id'
      );

      if (result.rowCount === 0) {
        return null;
      }

      return this.mapDatabaseRowToConversation(result.rows[0]);
    } catch (error) {
      logger.error(`Error finding conversation by ID ${id}:`, error);
      return null;
    }
  }

  /**
   * Find conversations by session ID
   */
  public async findBySessionId(sessionId: string, limit = 50): Promise<ConversationHistory[]> {
    try {
      this.validateRequiredFields({ sessionId }, ['sessionId']);

      const result = await this.executeQuery<ConversationHistory>(
        `SELECT * FROM whatsapp_conversations 
         WHERE "sessionId" = $1 
         ORDER BY "createdAt" DESC 
         LIMIT $2`,
        [sessionId, limit],
        'find-conversations-by-session'
      );

      return result.rows.map(this.mapDatabaseRowToConversation);
    } catch (error) {
      logger.error(`Error finding conversations by session ${sessionId}:`, error);
      return [];
    }
  }

  /**
   * Find conversations by phone number
   */
  public async findByPhoneNumber(phoneNumber: string, limit = 50): Promise<ConversationHistory[]> {
    try {
      this.validateRequiredFields({ phoneNumber }, ['phoneNumber']);

      const result = await this.executeQuery<ConversationHistory>(
        `SELECT * FROM whatsapp_conversations 
         WHERE "phoneNumber" = $1 
         ORDER BY "createdAt" DESC 
         LIMIT $2`,
        [phoneNumber, limit],
        'find-conversations-by-phone'
      );

      return result.rows.map(this.mapDatabaseRowToConversation);
    } catch (error) {
      logger.error(`Error finding conversations by phone ${phoneNumber}:`, error);
      return [];
    }
  }

  /**
   * Get conversation history (alias for findBySessionId)
   */
  public async getHistory(sessionId: string, limit = 50): Promise<ConversationHistory[]> {
    return this.findBySessionId(sessionId, limit);
  }

  /**
   * Get recent context for AI processing
   */
  public async getRecentContext(sessionId: string, messageCount = 10): Promise<string> {
    try {
      this.validateRequiredFields({ sessionId }, ['sessionId']);

      const result = await this.executeQuery<ConversationHistory>(
        `SELECT "messageText", "responseText", "isFromUser", "createdAt"
         FROM whatsapp_conversations 
         WHERE "sessionId" = $1 
         AND ("messageText" IS NOT NULL OR "responseText" IS NOT NULL)
         ORDER BY "createdAt" DESC 
         LIMIT $2`,
        [sessionId, messageCount],
        'get-recent-context'
      );

      if (result.rowCount === 0) {
        return '';
      }

      // Build context string from recent messages
      const contextParts: string[] = [];

      for (const row of result.rows.reverse()) {
        // Reverse to get chronological order
        if (row.isFromUser && row.messageText) {
          contextParts.push(`Usuario: ${row.messageText}`);
        } else if (!row.isFromUser && row.responseText) {
          contextParts.push(`Asistente: ${row.responseText}`);
        }
      }

      return contextParts.join('\n');
    } catch (error) {
      logger.error(`Error getting recent context for session ${sessionId}:`, error);
      return '';
    }
  }

  /**
   * Search conversations by text content
   */
  public async search(query: string, limit = 20): Promise<ConversationHistory[]> {
    try {
      this.validateRequiredFields({ query }, ['query']);

      const searchSQL = `
        SELECT * FROM whatsapp_conversations 
        WHERE ("messageText" ILIKE $1 OR "responseText" ILIKE $1)
        ORDER BY "createdAt" DESC 
        LIMIT $2
      `;

      const searchTerm = `%${query}%`;
      const result = await this.executeQuery<ConversationHistory>(
        searchSQL,
        [searchTerm, limit],
        'search-conversations'
      );

      return result.rows.map(this.mapDatabaseRowToConversation);
    } catch (error) {
      logger.error(`Error searching conversations for query "${query}":`, error);
      return [];
    }
  }

  /**
   * Get conversation messages (alias for findById with context)
   */
  public async getMessages(conversationId: string, limit = 50): Promise<ConversationHistory[]> {
    try {
      // First get the conversation to find its session
      const conversation = await this.findById(conversationId);
      if (!conversation) {
        return [];
      }

      // Then get all messages from that session
      return this.findBySessionId(conversation.sessionId, limit);
    } catch (error) {
      logger.error(`Error getting messages for conversation ${conversationId}:`, error);
      return [];
    }
  }

  /**
   * Create or update conversation
   */
  public async createOrUpdate(data: ConversationData): Promise<ConversationHistory> {
    try {
      // For now, we'll always create a new entry
      // In the future, we might want to update existing entries based on some criteria
      await this.save(data);

      // Find the most recent conversation for this session
      const conversations = await this.findBySessionId(data.sessionId, 1);

      if (conversations.length === 0) {
        throw new Error('Failed to retrieve saved conversation');
      }

      return conversations[0];
    } catch (error) {
      logger.error('Error creating/updating conversation:', error);
      throw error;
    }
  }

  /**
   * Get conversation statistics
   */
  public async getStats(sessionId?: string): Promise<any> {
    try {
      let totalQuery: string;
      let totalParams: any[];

      if (sessionId) {
        totalQuery = 'SELECT COUNT(*) as total FROM whatsapp_conversations WHERE "sessionId" = $1';
        totalParams = [sessionId];
      } else {
        totalQuery = 'SELECT COUNT(*) as total FROM whatsapp_conversations';
        totalParams = [];
      }

      const [totalResult, userMessagesResult, assistantMessagesResult, recentResult] =
        await Promise.all([
          this.executeQuery(totalQuery, totalParams, 'count-total-conversations'),
          this.executeQuery(
            sessionId
              ? 'SELECT COUNT(*) as count FROM whatsapp_conversations WHERE "sessionId" = $1 AND "isFromUser" = true'
              : 'SELECT COUNT(*) as count FROM whatsapp_conversations WHERE "isFromUser" = true',
            sessionId ? [sessionId] : [],
            'count-user-messages'
          ),
          this.executeQuery(
            sessionId
              ? 'SELECT COUNT(*) as count FROM whatsapp_conversations WHERE "sessionId" = $1 AND "isFromUser" = false'
              : 'SELECT COUNT(*) as count FROM whatsapp_conversations WHERE "isFromUser" = false',
            sessionId ? [sessionId] : [],
            'count-assistant-messages'
          ),
          this.executeQuery(
            sessionId
              ? 'SELECT COUNT(*) as count FROM whatsapp_conversations WHERE "sessionId" = $1 AND "createdAt" > NOW() - INTERVAL \'24 hours\''
              : 'SELECT COUNT(*) as count FROM whatsapp_conversations WHERE "createdAt" > NOW() - INTERVAL \'24 hours\'',
            sessionId ? [sessionId] : [],
            'count-recent-conversations'
          ),
        ]);

      return {
        total: totalResult.rows[0]?.total || 0,
        userMessages: userMessagesResult.rows[0]?.count || 0,
        assistantMessages: assistantMessagesResult.rows[0]?.count || 0,
        last24Hours: recentResult.rows[0]?.count || 0,
        sessionId: sessionId || 'all',
      };
    } catch (error) {
      logger.error('Error getting conversation stats:', error);
      return {
        total: 0,
        userMessages: 0,
        assistantMessages: 0,
        last24Hours: 0,
        sessionId: sessionId || 'all',
      };
    }
  }

  /**
   * Get repository metrics
   */
  public override async getMetrics(): Promise<Record<string, any>> {
    const baseMetrics = await super.getMetrics();

    try {
      const stats = await this.getStats();

      const avgTokensResult = await this.executeQuery(
        'SELECT AVG("tokensUsed") as avg_tokens FROM whatsapp_conversations WHERE "tokensUsed" > 0',
        [],
        'avg-tokens-used'
      );

      return {
        ...baseMetrics,
        totalConversations: stats.total,
        userMessages: stats.userMessages,
        assistantMessages: stats.assistantMessages,
        recentConversations: stats.last24Hours,
        averageTokensUsed: Math.round(avgTokensResult.rows[0]?.avg_tokens || 0),
      };
    } catch (error) {
      logger.error('Error getting conversation repository metrics:', error);
      return baseMetrics;
    }
  }

  /**
   * Map database row to ConversationHistory object
   */
  private mapDatabaseRowToConversation(row: any): ConversationHistory {
    return {
      id: row.id,
      sessionId: row.sessionId,
      phoneNumber: row.phoneNumber,
      contactName: row.contactName || undefined,
      messageText: row.messageText || undefined,
      responseText: row.responseText || undefined,
      messageType: row.messageType || 'text',
      intent: row.intent || undefined,
      sentiment: row.sentiment || undefined,
      aiProvider: row.aiProvider || undefined,
      tokensUsed: row.tokensUsed || 0,
      isFromUser: row.isFromUser,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}
