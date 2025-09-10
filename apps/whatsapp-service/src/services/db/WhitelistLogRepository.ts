import { BaseRepository } from './BaseRepository';
import { logger } from '../../utils/logger';

export interface WhitelistLogEntry {
  id: string;
  phoneNumber: string;
  sessionId?: string;
  decision: 'ALLOWED' | 'BLOCKED';
  reason?: string;
  leadId?: string;
  leadName?: string;
  messagePreview?: string;
  aiProvider?: string;
  ipAddress?: string;
  userAgent?: string;
  createdBy?: string;
  createdAt: Date;
}

export interface CreateWhitelistLog {
  phoneNumber: string;
  sessionId?: string;
  decision: 'ALLOWED' | 'BLOCKED';
  reason?: string;
  leadId?: string;
  leadName?: string;
  messagePreview?: string;
  aiProvider?: string;
  ipAddress?: string;
  userAgent?: string;
  createdBy?: string;
}

export interface WhitelistQueryOptions {
  limit?: number;
  offset?: number;
  phoneNumber?: string;
  sessionId?: string;
  decision?: 'ALLOWED' | 'BLOCKED';
  startDate?: Date;
  endDate?: Date;
  sortBy?: 'created_at' | 'phone_number' | 'decision';
  sortOrder?: 'ASC' | 'DESC';
}

export interface WhitelistStats {
  totalDecisions: number;
  allowedCount: number;
  blockedCount: number;
  allowedPercentage: number;
  blockedPercentage: number;
  uniquePhones: number;
  decisionsLast24Hours: number;
  decisionsLast7Days: number;
  topBlockedReasons: Array<{
    reason: string;
    count: number;
  }>;
  topAllowedReasons: Array<{
    reason: string;
    count: number;
  }>;
}

export interface PhoneNumberActivity {
  phoneNumber: string;
  totalDecisions: number;
  allowedCount: number;
  blockedCount: number;
  lastDecision: 'ALLOWED' | 'BLOCKED';
  lastDecisionDate: Date;
  lastReason?: string;
}

export class WhitelistLogRepository extends BaseRepository {
  private static readonly TABLE_NAME = 'whatsapp_whitelist_logs';

  /**
   * Create whitelist logs table if it doesn't exist
   */
  protected async createTablesIfNotExists(): Promise<void> {
    const query = `
      -- Whitelist decision logs table
      CREATE TABLE IF NOT EXISTS ${WhitelistLogRepository.TABLE_NAME} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone_number VARCHAR(50) NOT NULL,
        session_id VARCHAR(255),
        decision VARCHAR(20) NOT NULL CHECK (decision IN ('ALLOWED', 'BLOCKED')),
        reason TEXT,
        lead_id VARCHAR(255),
        lead_name VARCHAR(255),
        message_preview TEXT,
        ai_provider VARCHAR(50),
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes for whitelist logs
      CREATE INDEX IF NOT EXISTS idx_whitelist_logs_phone ON ${WhitelistLogRepository.TABLE_NAME}(phone_number);
      CREATE INDEX IF NOT EXISTS idx_whitelist_logs_decision ON ${WhitelistLogRepository.TABLE_NAME}(decision);
      CREATE INDEX IF NOT EXISTS idx_whitelist_logs_created ON ${WhitelistLogRepository.TABLE_NAME}(created_at);
      CREATE INDEX IF NOT EXISTS idx_whitelist_logs_session ON ${WhitelistLogRepository.TABLE_NAME}(session_id);
    `;

    await this.executeQuery(query);
    logger.info('✅ Whitelist logs table structure verified');
  }

  /**
   * Log whitelist decision
   */
  public async logWhitelistDecision(data: CreateWhitelistLog): Promise<string | null> {
    try {
      const query = `
        INSERT INTO ${WhitelistLogRepository.TABLE_NAME} (
          phone_number, session_id, decision, reason, lead_id, lead_name,
          message_preview, ai_provider, ip_address, user_agent, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id;
      `;

      const values = [
        data.phoneNumber,
        data.sessionId || null,
        data.decision,
        data.reason || null,
        data.leadId || null,
        data.leadName || null,
        data.messagePreview ? data.messagePreview.substring(0, 200) : null, // Limit preview length
        data.aiProvider || null,
        data.ipAddress || null,
        data.userAgent || null,
        data.createdBy || 'whatsapp-service',
      ];

      const result = await this.executeQuery(query, values);
      const logId = result.rows[0]?.id;

      logger.debug('Whitelist decision logged:', {
        id: logId,
        phoneNumber: data.phoneNumber,
        decision: data.decision,
      });

      return logId;
    } catch (error) {
      logger.error('Error logging whitelist decision:', error);
      logger.error('Failed query values:', {
        phoneNumber: data.phoneNumber,
        decision: data.decision,
        hasNullDecision: data.decision === null || data.decision === undefined,
      });
      return null;
    }
  }

  /**
   * Get whitelist logs with advanced filtering
   */
  public async getWhitelistLogs(options: WhitelistQueryOptions = {}): Promise<WhitelistLogEntry[]> {
    try {
      const {
        limit = 50,
        offset = 0,
        phoneNumber,
        sessionId,
        decision,
        startDate,
        endDate,
        sortBy = 'created_at',
        sortOrder = 'DESC',
      } = options;

      let query = `
        SELECT 
          id, phone_number, session_id, decision, reason, lead_id, lead_name,
          message_preview, ai_provider, ip_address, user_agent, created_by, created_at
        FROM ${WhitelistLogRepository.TABLE_NAME}
        WHERE 1=1
      `;

      const values: any[] = [];
      let valueIndex = 1;

      if (phoneNumber) {
        query += ` AND phone_number = $${valueIndex++}`;
        values.push(phoneNumber);
      }

      if (sessionId) {
        query += ` AND session_id = $${valueIndex++}`;
        values.push(sessionId);
      }

      if (decision) {
        query += ` AND decision = $${valueIndex++}`;
        values.push(decision);
      }

      if (startDate) {
        query += ` AND created_at >= $${valueIndex++}`;
        values.push(startDate);
      }

      if (endDate) {
        query += ` AND created_at <= $${valueIndex++}`;
        values.push(endDate);
      }

      query += ` ORDER BY ${sortBy} ${sortOrder}`;
      query += ` LIMIT $${valueIndex++} OFFSET $${valueIndex++}`;
      values.push(limit, offset);

      const result = await this.executeQuery(query, values);

      return result.rows.map(row => ({
        id: row.id,
        phoneNumber: row.phone_number,
        sessionId: row.session_id,
        decision: row.decision,
        reason: row.reason,
        leadId: row.lead_id,
        leadName: row.lead_name,
        messagePreview: row.message_preview,
        aiProvider: row.ai_provider,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        createdBy: row.created_by,
        createdAt: new Date(row.created_at),
      }));
    } catch (error) {
      logger.error('Error getting whitelist logs:', error);
      return [];
    }
  }

  /**
   * Get comprehensive whitelist statistics
   */
  public async getWhitelistStats(
    options: {
      sessionId?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<WhitelistStats> {
    try {
      const { sessionId, startDate, endDate } = options;

      let query = `
        SELECT 
          COUNT(*) as total_decisions,
          COUNT(CASE WHEN decision = 'ALLOWED' THEN 1 END) as allowed_count,
          COUNT(CASE WHEN decision = 'BLOCKED' THEN 1 END) as blocked_count,
          COUNT(DISTINCT phone_number) as unique_phones,
          COUNT(CASE WHEN created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours' THEN 1 END) as last_24h,
          COUNT(CASE WHEN created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days' THEN 1 END) as last_7_days
        FROM ${WhitelistLogRepository.TABLE_NAME}
        WHERE 1=1
      `;

      const values: any[] = [];
      let valueIndex = 1;

      if (sessionId) {
        query += ` AND session_id = $${valueIndex++}`;
        values.push(sessionId);
      }

      if (startDate) {
        query += ` AND created_at >= $${valueIndex++}`;
        values.push(startDate);
      }

      if (endDate) {
        query += ` AND created_at <= $${valueIndex++}`;
        values.push(endDate);
      }

      const result = await this.executeQuery(query, values);
      const stats = result.rows[0];

      const totalDecisions = parseInt(stats.total_decisions) || 0;
      const allowedCount = parseInt(stats.allowed_count) || 0;
      const blockedCount = parseInt(stats.blocked_count) || 0;

      // Get top blocked reasons
      const blockedReasonsQuery = `
        SELECT reason, COUNT(*) as count
        FROM ${WhitelistLogRepository.TABLE_NAME}
        WHERE decision = 'BLOCKED' AND reason IS NOT NULL
        ${sessionId ? 'AND session_id = $1' : ''}
        GROUP BY reason
        ORDER BY count DESC
        LIMIT 5;
      `;

      const blockedReasonsResult = await this.executeQuery(
        blockedReasonsQuery,
        sessionId ? [sessionId] : []
      );

      // Get top allowed reasons
      const allowedReasonsQuery = `
        SELECT reason, COUNT(*) as count
        FROM ${WhitelistLogRepository.TABLE_NAME}
        WHERE decision = 'ALLOWED' AND reason IS NOT NULL
        ${sessionId ? 'AND session_id = $1' : ''}
        GROUP BY reason
        ORDER BY count DESC
        LIMIT 5;
      `;

      const allowedReasonsResult = await this.executeQuery(
        allowedReasonsQuery,
        sessionId ? [sessionId] : []
      );

      return {
        totalDecisions,
        allowedCount,
        blockedCount,
        allowedPercentage: totalDecisions > 0 ? (allowedCount / totalDecisions) * 100 : 0,
        blockedPercentage: totalDecisions > 0 ? (blockedCount / totalDecisions) * 100 : 0,
        uniquePhones: parseInt(stats.unique_phones) || 0,
        decisionsLast24Hours: parseInt(stats.last_24h) || 0,
        decisionsLast7Days: parseInt(stats.last_7_days) || 0,
        topBlockedReasons: blockedReasonsResult.rows.map(row => ({
          reason: row.reason,
          count: parseInt(row.count),
        })),
        topAllowedReasons: allowedReasonsResult.rows.map(row => ({
          reason: row.reason,
          count: parseInt(row.count),
        })),
      };
    } catch (error) {
      logger.error('Error getting whitelist statistics:', error);
      return {
        totalDecisions: 0,
        allowedCount: 0,
        blockedCount: 0,
        allowedPercentage: 0,
        blockedPercentage: 0,
        uniquePhones: 0,
        decisionsLast24Hours: 0,
        decisionsLast7Days: 0,
        topBlockedReasons: [],
        topAllowedReasons: [],
      };
    }
  }

  /**
   * Get phone number activity summary
   */
  public async getPhoneNumberActivity(
    phoneNumber?: string,
    limit = 50
  ): Promise<PhoneNumberActivity[]> {
    try {
      let query = `
        SELECT 
          phone_number,
          COUNT(*) as total_decisions,
          COUNT(CASE WHEN decision = 'ALLOWED' THEN 1 END) as allowed_count,
          COUNT(CASE WHEN decision = 'BLOCKED' THEN 1 END) as blocked_count,
          (
            SELECT decision 
            FROM ${WhitelistLogRepository.TABLE_NAME} wl2 
            WHERE wl2.phone_number = wl.phone_number 
            ORDER BY created_at DESC 
            LIMIT 1
          ) as last_decision,
          MAX(created_at) as last_decision_date,
          (
            SELECT reason 
            FROM ${WhitelistLogRepository.TABLE_NAME} wl3 
            WHERE wl3.phone_number = wl.phone_number 
            ORDER BY created_at DESC 
            LIMIT 1
          ) as last_reason
        FROM ${WhitelistLogRepository.TABLE_NAME} wl
      `;

      const values: any[] = [];
      let valueIndex = 1;

      if (phoneNumber) {
        query += ` WHERE phone_number = $${valueIndex++}`;
        values.push(phoneNumber);
      }

      query += `
        GROUP BY phone_number
        ORDER BY MAX(created_at) DESC
        LIMIT $${valueIndex}
      `;
      values.push(limit);

      const result = await this.executeQuery(query, values);

      return result.rows.map(row => ({
        phoneNumber: row.phone_number,
        totalDecisions: parseInt(row.total_decisions),
        allowedCount: parseInt(row.allowed_count),
        blockedCount: parseInt(row.blocked_count),
        lastDecision: row.last_decision,
        lastDecisionDate: new Date(row.last_decision_date),
        lastReason: row.last_reason,
      }));
    } catch (error) {
      logger.error('Error getting phone number activity:', error);
      return [];
    }
  }

  /**
   * Find whitelist log by ID
   */
  public async findById(id: string): Promise<WhitelistLogEntry | null> {
    try {
      const query = `
        SELECT 
          id, phone_number, session_id, decision, reason, lead_id, lead_name,
          message_preview, ai_provider, ip_address, user_agent, created_by, created_at
        FROM ${WhitelistLogRepository.TABLE_NAME}
        WHERE id = $1;
      `;

      const result = await this.executeQuery(query, [id]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        phoneNumber: row.phone_number,
        sessionId: row.session_id,
        decision: row.decision,
        reason: row.reason,
        leadId: row.lead_id,
        leadName: row.lead_name,
        messagePreview: row.message_preview,
        aiProvider: row.ai_provider,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        createdBy: row.created_by,
        createdAt: new Date(row.created_at),
      };
    } catch (error) {
      logger.error(`Error finding whitelist log by ID ${id}:`, error);
      return null;
    }
  }

  /**
   * Get latest decision for phone number
   */
  public async getLatestDecision(phoneNumber: string): Promise<WhitelistLogEntry | null> {
    try {
      const query = `
        SELECT 
          id, phone_number, session_id, decision, reason, lead_id, lead_name,
          message_preview, ai_provider, ip_address, user_agent, created_by, created_at
        FROM ${WhitelistLogRepository.TABLE_NAME}
        WHERE phone_number = $1
        ORDER BY created_at DESC
        LIMIT 1;
      `;

      const result = await this.executeQuery(query, [phoneNumber]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        phoneNumber: row.phone_number,
        sessionId: row.session_id,
        decision: row.decision,
        reason: row.reason,
        leadId: row.lead_id,
        leadName: row.lead_name,
        messagePreview: row.message_preview,
        aiProvider: row.ai_provider,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        createdBy: row.created_by,
        createdAt: new Date(row.created_at),
      };
    } catch (error) {
      logger.error(`Error getting latest decision for phone ${phoneNumber}:`, error);
      return null;
    }
  }

  /**
   * Clean up old whitelist logs
   */
  public async cleanupOldLogs(daysOld = 90): Promise<boolean> {
    try {
      const query = `
        DELETE FROM ${WhitelistLogRepository.TABLE_NAME} 
        WHERE created_at < CURRENT_DATE - INTERVAL '${daysOld} days'
      `;

      const result = await this.executeQuery(query);
      const deletedCount = result.rowCount || 0;

      logger.info(`🗑️ Cleaned up ${deletedCount} old whitelist logs (>${daysOld} days)`);
      return true;
    } catch (error) {
      logger.error('Error cleaning up old whitelist logs:', error);
      return false;
    }
  }

  /**
   * Get decision counts by date range
   */
  public async getDecisionCountsByDate(
    startDate: Date,
    endDate: Date,
    groupBy: 'hour' | 'day' | 'week' = 'day'
  ): Promise<
    Array<{
      date: string;
      allowedCount: number;
      blockedCount: number;
      totalCount: number;
    }>
  > {
    try {
      let dateFormat: string;
      switch (groupBy) {
        case 'hour':
          dateFormat = 'YYYY-MM-DD HH24:00:00';
          break;
        case 'week':
          dateFormat = 'YYYY-"W"WW';
          break;
        default:
          dateFormat = 'YYYY-MM-DD';
      }

      const query = `
        SELECT 
          TO_CHAR(created_at, '${dateFormat}') as date,
          COUNT(CASE WHEN decision = 'ALLOWED' THEN 1 END) as allowed_count,
          COUNT(CASE WHEN decision = 'BLOCKED' THEN 1 END) as blocked_count,
          COUNT(*) as total_count
        FROM ${WhitelistLogRepository.TABLE_NAME}
        WHERE created_at >= $1 AND created_at <= $2
        GROUP BY TO_CHAR(created_at, '${dateFormat}')
        ORDER BY date;
      `;

      const result = await this.executeQuery(query, [startDate, endDate]);

      return result.rows.map(row => ({
        date: row.date,
        allowedCount: parseInt(row.allowed_count),
        blockedCount: parseInt(row.blocked_count),
        totalCount: parseInt(row.total_count),
      }));
    } catch (error) {
      logger.error('Error getting decision counts by date:', error);
      return [];
    }
  }

  /**
   * Get log count
   */
  public async getLogCount(filters?: {
    phoneNumber?: string;
    sessionId?: string;
    decision?: 'ALLOWED' | 'BLOCKED';
  }): Promise<number> {
    try {
      let query = `SELECT COUNT(*) as count FROM ${WhitelistLogRepository.TABLE_NAME}`;
      const values: any[] = [];
      let paramIndex = 1;

      if (filters) {
        const conditions: string[] = [];

        if (filters.phoneNumber) {
          conditions.push(`phone_number = $${paramIndex}`);
          values.push(filters.phoneNumber);
          paramIndex++;
        }

        if (filters.sessionId) {
          conditions.push(`session_id = $${paramIndex}`);
          values.push(filters.sessionId);
          paramIndex++;
        }

        if (filters.decision) {
          conditions.push(`decision = $${paramIndex}`);
          values.push(filters.decision);
          paramIndex++;
        }

        if (conditions.length > 0) {
          query += ` WHERE ${conditions.join(' AND ')}`;
        }
      }

      const result = await this.executeQuery(query, values);
      return parseInt(result.rows[0]?.count) || 0;
    } catch (error) {
      logger.error('Error getting whitelist log count:', error);
      return 0;
    }
  }

  /**
   * Delete whitelist log entry
   */
  public async deleteWhitelistLog(id: string): Promise<boolean> {
    try {
      const query = `DELETE FROM ${WhitelistLogRepository.TABLE_NAME} WHERE id = $1 RETURNING id`;
      const result = await this.executeQuery(query, [id]);

      if (result.rows.length > 0) {
        logger.info(`✅ Whitelist log deleted: ${id}`);
        return true;
      } else {
        logger.warn(`Whitelist log not found: ${id}`);
        return false;
      }
    } catch (error) {
      logger.error('Error deleting whitelist log:', error);
      return false;
    }
  }

  /**
   * Bulk insert whitelist logs (for migration or bulk operations)
   */
  public async bulkInsertLogs(logs: CreateWhitelistLog[]): Promise<boolean> {
    try {
      if (logs.length === 0) {
        return true;
      }

      const values: any[] = [];
      const valuePlaceholders: string[] = [];
      let paramIndex = 1;

      logs.forEach(log => {
        const placeholder = `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10})`;
        valuePlaceholders.push(placeholder);

        values.push(
          log.phoneNumber,
          log.sessionId || null,
          log.decision,
          log.reason || null,
          log.leadId || null,
          log.leadName || null,
          log.messagePreview ? log.messagePreview.substring(0, 200) : null,
          log.aiProvider || null,
          log.ipAddress || null,
          log.userAgent || null,
          log.createdBy || 'whatsapp-service'
        );

        paramIndex += 11;
      });

      const query = `
        INSERT INTO ${WhitelistLogRepository.TABLE_NAME} (
          phone_number, session_id, decision, reason, lead_id, lead_name,
          message_preview, ai_provider, ip_address, user_agent, created_by
        ) VALUES ${valuePlaceholders.join(', ')}
      `;

      await this.executeQuery(query, values);
      logger.info(`✅ Bulk inserted ${logs.length} whitelist logs`);
      return true;
    } catch (error) {
      logger.error('Error bulk inserting whitelist logs:', error);
      return false;
    }
  }
}
