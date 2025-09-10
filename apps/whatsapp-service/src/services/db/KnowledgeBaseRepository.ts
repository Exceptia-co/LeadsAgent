import { BaseRepository } from './BaseRepository';
import { logger } from '../../utils/logger';

export interface KnowledgeBaseEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  keywords: string[];
  priority: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateKnowledgeBaseEntry {
  title: string;
  content: string;
  keywords: string | string[];
  category: string;
  priority?: 'low' | 'medium' | 'high' | number;
  isActive?: boolean;
  source?: string;
  metadata?: any;
}

export interface UpdateKnowledgeBaseEntry {
  title?: string;
  content?: string;
  keywords?: string;
  category?: string;
  priority?: 'low' | 'medium' | 'high';
  isActive?: boolean;
}

export interface KnowledgeBaseStats {
  totalEntries: number;
  activeEntries: number;
  categoryCounts: Record<string, number>;
  averagePriority: number;
}

export interface SearchResult extends KnowledgeBaseEntry {
  relevance_score: number;
  match_quality: string;
}

export class KnowledgeBaseRepository extends BaseRepository {
  private static readonly TABLE_NAME = 'ai_knowledge_base';

  /**
   * Create knowledge base table if it doesn't exist
   */
  protected async createTablesIfNotExists(): Promise<void> {
    const query = `
      -- Knowledge base table for AI training
      CREATE TABLE IF NOT EXISTS ${KnowledgeBaseRepository.TABLE_NAME} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        keywords TEXT[], -- Array of keywords for search
        priority INTEGER DEFAULT 1, -- Higher priority = more important
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes for knowledge base
      CREATE INDEX IF NOT EXISTS idx_knowledge_category ON ${KnowledgeBaseRepository.TABLE_NAME}(category);
      CREATE INDEX IF NOT EXISTS idx_knowledge_active ON ${KnowledgeBaseRepository.TABLE_NAME}(is_active);
      CREATE INDEX IF NOT EXISTS idx_knowledge_priority ON ${KnowledgeBaseRepository.TABLE_NAME}(priority DESC);
    `;

    await this.executeQuery(query);
    logger.info('✅ Knowledge base table structure verified');
  }

  /**
   * Get knowledge base entries for AI context
   */
  public async getKnowledgeBase(category?: string): Promise<KnowledgeBaseEntry[]> {
    try {
      let query = `
        SELECT id, category, title, content, keywords, priority, is_active, created_at, updated_at
        FROM ${KnowledgeBaseRepository.TABLE_NAME} 
        WHERE is_active = true
      `;

      const values: any[] = [];

      if (category) {
        query += ` AND category = $1`;
        values.push(category);
      }

      query += ` ORDER BY priority DESC, created_at ASC`;

      const result = await this.executeQuery(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Error getting knowledge base:', error);
      return this.getDefaultKnowledgeBase();
    }
  }

  /**
   * Add new knowledge base entry
   */
  public async addKnowledgeBase(entry: CreateKnowledgeBaseEntry): Promise<boolean> {
    try {
      // Convert priority to numeric
      let numericPriority: number;
      if (typeof entry.priority === 'number') {
        numericPriority = entry.priority;
      } else {
        const priorityMap = { low: 1, medium: 5, high: 10 };
        numericPriority = priorityMap[entry.priority || 'medium'] || 5;
      }

      // Convert keywords to array if it's a string
      let keywordsArray: string[];
      if (typeof entry.keywords === 'string') {
        keywordsArray = entry.keywords
          .split(',')
          .map(k => k.trim())
          .filter(k => k.length > 0);
      } else {
        keywordsArray = entry.keywords;
      }

      const query = `
        INSERT INTO ${KnowledgeBaseRepository.TABLE_NAME} (
          category, title, content, keywords, priority, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id;
      `;

      const values = [
        entry.category,
        entry.title,
        entry.content,
        keywordsArray,
        numericPriority,
        entry.isActive !== false, // Default to true
      ];

      const result = await this.executeQuery(query, values);
      const entryId = result.rows[0]?.id;

      if (entryId) {
        logger.info(`✅ Knowledge base entry added: "${entry.title}" (${entryId})`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Error adding knowledge base entry:', error);
      return false;
    }
  }

  /**
   * Update knowledge base entry
   */
  public async updateKnowledgeBase(
    id: string,
    updates: UpdateKnowledgeBaseEntry
  ): Promise<boolean> {
    try {
      const setParts: string[] = [];
      const values: any[] = [];
      let valueIndex = 1;

      if (updates.title !== undefined) {
        setParts.push(`title = $${valueIndex++}`);
        values.push(updates.title);
      }
      if (updates.content !== undefined) {
        setParts.push(`content = $${valueIndex++}`);
        values.push(updates.content);
      }
      if (updates.keywords !== undefined) {
        const keywordsArray = updates.keywords
          .split(',')
          .map(k => k.trim())
          .filter(k => k.length > 0);
        setParts.push(`keywords = $${valueIndex++}`);
        values.push(keywordsArray);
      }
      if (updates.category !== undefined) {
        setParts.push(`category = $${valueIndex++}`);
        values.push(updates.category);
      }
      if (updates.priority !== undefined) {
        const priorityMap = { low: 1, medium: 5, high: 10 };
        const numericPriority = priorityMap[updates.priority] || 5;
        setParts.push(`priority = $${valueIndex++}`);
        values.push(numericPriority);
      }
      if (updates.isActive !== undefined) {
        setParts.push(`is_active = $${valueIndex++}`);
        values.push(updates.isActive);
      }

      if (setParts.length === 0) {
        return true; // No updates
      }

      setParts.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id); // Para el WHERE

      const query = `
        UPDATE ${KnowledgeBaseRepository.TABLE_NAME} 
        SET ${setParts.join(', ')}
        WHERE id = $${valueIndex}
        RETURNING id;
      `;

      const result = await this.executeQuery(query, values);

      if (result.rows.length > 0) {
        logger.info(`✅ Knowledge base entry updated: ${id}`);
        return true;
      } else {
        logger.warn(`Knowledge base entry not found: ${id}`);
        return false;
      }
    } catch (error) {
      logger.error('Error updating knowledge base entry:', error);
      return false;
    }
  }

  /**
   * Delete knowledge base entry
   */
  public async deleteKnowledgeBase(id: string): Promise<boolean> {
    try {
      const query = `DELETE FROM ${KnowledgeBaseRepository.TABLE_NAME} WHERE id = $1 RETURNING id`;
      const result = await this.executeQuery(query, [id]);

      if (result.rows.length > 0) {
        logger.info(`✅ Knowledge base entry deleted: ${id}`);
        return true;
      } else {
        logger.warn(`Knowledge base entry not found: ${id}`);
        return false;
      }
    } catch (error) {
      logger.error('Error deleting knowledge base entry:', error);
      return false;
    }
  }

  /**
   * Search knowledge base with intelligent scoring
   */
  public async searchKnowledgeBase(query: string): Promise<SearchResult[]> {
    try {
      // Extract keywords from query for better matching
      const queryWords = this.extractSearchKeywords(query);
      const searchTerms = [`%${query}%`, ...queryWords.map(word => `%${word}%`)];

      const searchQuery = `
        SELECT 
          id, category, title, content, keywords, priority, is_active, created_at, updated_at,
          -- Calculate relevance score
          (
            -- Exact title match score (weight: 100)
            CASE WHEN title ILIKE $1 THEN 100 ELSE 0 END +
            -- Keywords match score (weight: 80)
            (
              SELECT COUNT(*) * 80 
              FROM unnest(keywords) AS keyword 
              WHERE keyword ILIKE ANY($2::text[])
            ) +
            -- Content match score (weight: 30)
            CASE WHEN content ILIKE $1 THEN 30 ELSE 0 END +
            -- Priority bonus (weight: priority * 5)
            (priority * 5)
          ) AS relevance_score
        FROM ${KnowledgeBaseRepository.TABLE_NAME} 
        WHERE is_active = true
          AND (
            title ILIKE $1 OR 
            content ILIKE $1 OR
            EXISTS (
              SELECT 1 FROM unnest(keywords) AS keyword 
              WHERE keyword ILIKE ANY($2::text[])
            )
          )
        ORDER BY relevance_score DESC, priority DESC
        LIMIT 3;
      `;

      const result = await this.executeQuery(searchQuery, [query, searchTerms]);

      // Add score and filter by minimum relevance
      return result.rows
        .filter(row => row.relevance_score >= 30) // Minimum relevance filter
        .map(row => ({
          ...row,
          relevance_score: row.relevance_score,
          match_quality: this.calculateMatchQuality(row.relevance_score),
        }));
    } catch (error) {
      logger.error('Error searching knowledge base:', error);
      return [];
    }
  }

  /**
   * Clear entire knowledge base
   */
  public async clearKnowledgeBase(): Promise<boolean> {
    try {
      const query = `DELETE FROM ${KnowledgeBaseRepository.TABLE_NAME}`;
      const result = await this.executeQuery(query);

      logger.info(`🧹 Cleared ${result.rowCount} entries from knowledge base`);
      return true;
    } catch (error) {
      logger.error('Error clearing knowledge base:', error);
      return false;
    }
  }

  /**
   * Get knowledge base statistics
   */
  public async getKnowledgeBaseStats(): Promise<KnowledgeBaseStats> {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_entries,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active_entries,
          AVG(priority) as avg_priority,
          json_object_agg(category, category_count) as category_counts
        FROM (
          SELECT 
            category, 
            COUNT(*) as category_count,
            priority,
            is_active
          FROM ${KnowledgeBaseRepository.TABLE_NAME} 
          GROUP BY category, priority, is_active
        ) subquery;
      `;

      const result = await this.executeQuery(query);
      const stats = result.rows[0];

      return {
        totalEntries: parseInt(stats.total_entries) || 0,
        activeEntries: parseInt(stats.active_entries) || 0,
        categoryCounts: stats.category_counts || {},
        averagePriority: parseFloat(stats.avg_priority) || 0,
      };
    } catch (error) {
      logger.error('Error getting knowledge base stats:', error);
      return {
        totalEntries: 0,
        activeEntries: 0,
        categoryCounts: {},
        averagePriority: 0,
      };
    }
  }

  /**
   * Find entry by ID
   */
  public async findById(id: string): Promise<KnowledgeBaseEntry | null> {
    try {
      const query = `
        SELECT id, category, title, content, keywords, priority, is_active, created_at, updated_at
        FROM ${KnowledgeBaseRepository.TABLE_NAME}
        WHERE id = $1
      `;

      const result = await this.executeQuery(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Error finding knowledge base entry by ID ${id}:`, error);
      return null;
    }
  }

  /**
   * Find entries by category
   */
  public async findByCategory(category: string): Promise<KnowledgeBaseEntry[]> {
    try {
      const query = `
        SELECT id, category, title, content, keywords, priority, is_active, created_at, updated_at
        FROM ${KnowledgeBaseRepository.TABLE_NAME}
        WHERE category = $1 AND is_active = true
        ORDER BY priority DESC, created_at ASC
      `;

      const result = await this.executeQuery(query, [category]);
      return result.rows;
    } catch (error) {
      logger.error(`Error finding knowledge base entries by category ${category}:`, error);
      return [];
    }
  }

  // Helper methods

  /**
   * Extract search keywords from query
   */
  private extractSearchKeywords(query: string): string[] {
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2) // Only words with 3+ characters
      .slice(0, 5); // Max 5 keywords
  }

  /**
   * Calculate match quality based on relevance score
   */
  private calculateMatchQuality(score: number): string {
    if (score >= 150) return 'excellent';
    if (score >= 100) return 'very-good';
    if (score >= 60) return 'good';
    if (score >= 30) return 'fair';
    return 'poor';
  }

  /**
   * Get default knowledge base for fallback
   */
  private getDefaultKnowledgeBase(): KnowledgeBaseEntry[] {
    return [
      {
        id: 'default-1',
        category: 'productos',
        title: 'Información de productos crypto',
        content:
          'Ofrecemos trading de Bitcoin, Ethereum y las principales criptomonedas con spreads competitivos.',
        keywords: ['bitcoin', 'ethereum', 'crypto', 'trading'],
        priority: 10,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'default-2',
        category: 'precios',
        title: 'Información de precios y comisiones',
        content: 'Spreads desde 0.1% en Bitcoin y 0.2% en altcoins. Sin comisiones de depósito.',
        keywords: ['precios', 'comisiones', 'spreads', 'costos'],
        priority: 9,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'default-3',
        category: 'registro',
        title: 'Proceso de registro',
        content: 'El registro toma 5 minutos. Necesitas email, teléfono y documento de identidad.',
        keywords: ['registro', 'cuenta', 'verificacion', 'kyc'],
        priority: 8,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];
  }
}
