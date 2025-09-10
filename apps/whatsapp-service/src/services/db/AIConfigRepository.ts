import { BaseRepository } from './BaseRepository';
import { logger } from '../../utils/logger';

export interface AIConfiguration {
  id: string;
  config_key: string;
  config_value: string;
  description?: string;
  updated_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateAIConfiguration {
  config_key: string;
  config_value: string;
  description?: string;
  updated_by?: string;
}

export interface UpdateAIConfiguration {
  config_value?: string;
  description?: string;
  updated_by?: string;
}

export class AIConfigRepository extends BaseRepository {
  private static readonly TABLE_NAME = 'ai_configuration';

  /**
   * Create AI configuration table if it doesn't exist
   */
  protected async createTablesIfNotExists(): Promise<void> {
    const query = `
      -- AI configuration table (system prompts, etc.)
      CREATE TABLE IF NOT EXISTS ${AIConfigRepository.TABLE_NAME} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        config_key VARCHAR(100) UNIQUE NOT NULL,
        config_value TEXT NOT NULL,
        description TEXT,
        updated_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Index for config key
      CREATE INDEX IF NOT EXISTS idx_ai_config_key ON ${AIConfigRepository.TABLE_NAME}(config_key);
    `;

    await this.executeQuery(query);
    logger.info('✅ AI configuration table structure verified');
  }

  /**
   * Get AI configuration by key
   */
  public async getAIConfiguration(key: string): Promise<string | null> {
    try {
      const query = `
        SELECT config_value 
        FROM ${AIConfigRepository.TABLE_NAME} 
        WHERE config_key = $1
      `;

      const result = await this.executeQuery(query, [key]);
      return result.rows[0]?.config_value || null;
    } catch (error) {
      logger.error(`Error getting AI configuration for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Update or create AI configuration
   */
  public async updateAIConfiguration(
    key: string,
    value: string,
    updatedBy?: string,
    description?: string
  ): Promise<boolean> {
    try {
      const query = `
        INSERT INTO ${AIConfigRepository.TABLE_NAME} (config_key, config_value, updated_by, description, updated_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (config_key) 
        DO UPDATE SET 
          config_value = EXCLUDED.config_value,
          updated_by = EXCLUDED.updated_by,
          description = COALESCE(EXCLUDED.description, ${AIConfigRepository.TABLE_NAME}.description),
          updated_at = CURRENT_TIMESTAMP
      `;

      await this.executeQuery(query, [key, value, updatedBy, description]);
      logger.info(`✅ AI configuration updated: ${key}`);
      return true;
    } catch (error) {
      logger.error(`Error updating AI configuration for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Create new AI configuration
   */
  public async createAIConfiguration(config: CreateAIConfiguration): Promise<boolean> {
    try {
      const query = `
        INSERT INTO ${AIConfigRepository.TABLE_NAME} (
          config_key, config_value, description, updated_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id;
      `;

      const result = await this.executeQuery(query, [
        config.config_key,
        config.config_value,
        config.description,
        config.updated_by,
      ]);

      const configId = result.rows[0]?.id;
      if (configId) {
        logger.info(`✅ AI configuration created: "${config.config_key}" (${configId})`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Error creating AI configuration for key ${config.config_key}:`, error);
      return false;
    }
  }

  /**
   * Update existing AI configuration by key
   */
  public async updateAIConfigurationByKey(
    key: string,
    updates: UpdateAIConfiguration
  ): Promise<boolean> {
    try {
      const setParts: string[] = [];
      const values: any[] = [];
      let valueIndex = 1;

      if (updates.config_value !== undefined) {
        setParts.push(`config_value = $${valueIndex++}`);
        values.push(updates.config_value);
      }
      if (updates.description !== undefined) {
        setParts.push(`description = $${valueIndex++}`);
        values.push(updates.description);
      }
      if (updates.updated_by !== undefined) {
        setParts.push(`updated_by = $${valueIndex++}`);
        values.push(updates.updated_by);
      }

      if (setParts.length === 0) {
        return true; // No updates
      }

      setParts.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(key); // For the WHERE clause

      const query = `
        UPDATE ${AIConfigRepository.TABLE_NAME} 
        SET ${setParts.join(', ')}
        WHERE config_key = $${valueIndex}
        RETURNING id;
      `;

      const result = await this.executeQuery(query, values);

      if (result.rows.length > 0) {
        logger.info(`✅ AI configuration updated: ${key}`);
        return true;
      } else {
        logger.warn(`AI configuration not found: ${key}`);
        return false;
      }
    } catch (error) {
      logger.error(`Error updating AI configuration for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete AI configuration by key
   */
  public async deleteAIConfiguration(key: string): Promise<boolean> {
    try {
      const query = `DELETE FROM ${AIConfigRepository.TABLE_NAME} WHERE config_key = $1 RETURNING id`;
      const result = await this.executeQuery(query, [key]);

      if (result.rows.length > 0) {
        logger.info(`✅ AI configuration deleted: ${key}`);
        return true;
      } else {
        logger.warn(`AI configuration not found: ${key}`);
        return false;
      }
    } catch (error) {
      logger.error(`Error deleting AI configuration for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get all AI configurations
   */
  public async getAllConfigurations(): Promise<AIConfiguration[]> {
    try {
      const query = `
        SELECT id, config_key, config_value, description, updated_by, created_at, updated_at
        FROM ${AIConfigRepository.TABLE_NAME}
        ORDER BY config_key ASC
      `;

      const result = await this.executeQuery(query);
      return result.rows;
    } catch (error) {
      logger.error('Error getting all AI configurations:', error);
      return [];
    }
  }

  /**
   * Get configurations by key pattern
   */
  public async getConfigurationsByPattern(pattern: string): Promise<AIConfiguration[]> {
    try {
      const query = `
        SELECT id, config_key, config_value, description, updated_by, created_at, updated_at
        FROM ${AIConfigRepository.TABLE_NAME}
        WHERE config_key ILIKE $1
        ORDER BY config_key ASC
      `;

      const result = await this.executeQuery(query, [`%${pattern}%`]);
      return result.rows;
    } catch (error) {
      logger.error(`Error getting configurations by pattern ${pattern}:`, error);
      return [];
    }
  }

  /**
   * Find configuration by ID
   */
  public async findById(id: string): Promise<AIConfiguration | null> {
    try {
      const query = `
        SELECT id, config_key, config_value, description, updated_by, created_at, updated_at
        FROM ${AIConfigRepository.TABLE_NAME}
        WHERE id = $1
      `;

      const result = await this.executeQuery(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Error finding AI configuration by ID ${id}:`, error);
      return null;
    }
  }

  /**
   * Find configuration by key
   */
  public async findByKey(key: string): Promise<AIConfiguration | null> {
    try {
      const query = `
        SELECT id, config_key, config_value, description, updated_by, created_at, updated_at
        FROM ${AIConfigRepository.TABLE_NAME}
        WHERE config_key = $1
      `;

      const result = await this.executeQuery(query, [key]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Error finding AI configuration by key ${key}:`, error);
      return null;
    }
  }

  /**
   * Check if configuration exists
   */
  public async exists(key: string): Promise<boolean> {
    try {
      const query = `
        SELECT 1 FROM ${AIConfigRepository.TABLE_NAME} WHERE config_key = $1 LIMIT 1
      `;

      const result = await this.executeQuery(query, [key]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error(`Error checking if AI configuration exists for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get configuration count
   */
  public async getConfigurationCount(): Promise<number> {
    try {
      const query = `SELECT COUNT(*) as count FROM ${AIConfigRepository.TABLE_NAME}`;
      const result = await this.executeQuery(query);
      return parseInt(result.rows[0]?.count) || 0;
    } catch (error) {
      logger.error('Error getting AI configuration count:', error);
      return 0;
    }
  }

  /**
   * Bulk insert configurations
   */
  public async bulkInsertConfigurations(configurations: CreateAIConfiguration[]): Promise<boolean> {
    try {
      if (configurations.length === 0) {
        return true;
      }

      const values: any[] = [];
      const valuePlaceholders: string[] = [];
      let paramIndex = 1;

      configurations.forEach((config, index) => {
        const placeholder = `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
        valuePlaceholders.push(placeholder);

        values.push(
          config.config_key,
          config.config_value,
          config.description || null,
          config.updated_by || null
        );

        paramIndex += 4;
      });

      const query = `
        INSERT INTO ${AIConfigRepository.TABLE_NAME} (
          config_key, config_value, description, updated_by, created_at, updated_at
        ) VALUES ${valuePlaceholders.join(', ')}
        ON CONFLICT (config_key) DO NOTHING
      `;

      await this.executeQuery(query, values);
      logger.info(`✅ Bulk inserted ${configurations.length} AI configurations`);
      return true;
    } catch (error) {
      logger.error('Error bulk inserting AI configurations:', error);
      return false;
    }
  }

  /**
   * Get default configuration value for fallback
   */
  public getDefaultConfig(key: string): string | null {
    const defaultConfigs: Record<string, string> = {
      system_prompt:
        'Eres un asistente especializado en criptomonedas. Responde de manera profesional y útil.',
      max_tokens: '1000',
      temperature: '0.7',
      model: 'gpt-3.5-turbo',
      timeout_seconds: '30',
      retry_attempts: '3',
      fallback_response:
        'Lo siento, no puedo procesar tu solicitud en este momento. Por favor, intenta más tarde.',
      greeting_message:
        '¡Hola! Soy tu asistente para consultas sobre criptomonedas. ¿En qué puedo ayudarte?',
      error_message:
        'Ha ocurrido un error. Por favor, contacta con soporte si el problema persiste.',
    };

    return defaultConfigs[key] || null;
  }
}
