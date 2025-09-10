/**
 * @fileoverview Base repository implementation
 * Provides common database connection and transaction management
 */

import { logger } from '../../utils/logger';

// Database connection interface (abstract from pg specifics)
export interface IDatabaseConnection {
  query(sql: string, params?: any[]): Promise<any>;
  testConnection(): Promise<boolean>;
  close(): Promise<void>;
}

// Result interface for database operations
export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

/**
 * Base repository class with common database operations
 * Implements connection management and error handling patterns
 */
export abstract class BaseRepository {
  protected connection: IDatabaseConnection | null = null;

  constructor(connection?: IDatabaseConnection) {
    this.connection = connection || null;
  }

  /**
   * Initialize the repository
   */
  public async initialize(): Promise<void> {
    if (!this.connection) {
      throw new Error('Database connection not provided');
    }

    try {
      const isConnected = await this.connection.testConnection();
      if (!isConnected) {
        throw new Error('Database connection test failed');
      }

      await this.createTablesIfNotExists();
      logger.info(`✅ ${this.constructor.name} initialized successfully`);
    } catch (error) {
      logger.error(`❌ Failed to initialize ${this.constructor.name}:`, error);
      throw error;
    }
  }

  /**
   * Test database connection
   */
  public async testConnection(): Promise<boolean> {
    if (!this.connection) {
      return false;
    }

    try {
      return await this.connection.testConnection();
    } catch (error) {
      logger.error(`Connection test failed for ${this.constructor.name}:`, error);
      return false;
    }
  }

  /**
   * Close database connections
   */
  public async close(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.close();
        logger.info(`🔌 ${this.constructor.name} connection closed`);
      } catch (error) {
        logger.error(`Error closing ${this.constructor.name} connection:`, error);
      }
    }
  }

  /**
   * Execute a query with error handling and logging
   */
  protected async executeQuery<T = any>(
    sql: string,
    params: any[] = [],
    operationName = 'query'
  ): Promise<QueryResult<T>> {
    if (!this.connection) {
      throw new Error('Database connection not available');
    }

    try {
      logger.debug(`Executing ${operationName} in ${this.constructor.name}:`, { sql, params });

      const startTime = Date.now();
      const result = await this.connection.query(sql, params);
      const duration = Date.now() - startTime;

      logger.debug(`${operationName} completed in ${duration}ms, rows: ${result.rowCount || 0}`);

      return {
        rows: result.rows || [],
        rowCount: result.rowCount || 0,
      };
    } catch (error) {
      logger.error(`Database error in ${this.constructor.name}.${operationName}:`, {
        error,
        sql,
        params,
      });
      throw error;
    }
  }

  /**
   * Create tables specific to this repository
   * Must be implemented by each concrete repository
   */
  protected abstract createTablesIfNotExists(): Promise<void>;

  /**
   * Get repository-specific metrics
   * Optional method that can be overridden by concrete repositories
   */
  public async getMetrics(): Promise<Record<string, any>> {
    return {
      repositoryName: this.constructor.name,
      connectionAvailable: this.connection !== null,
      connectionTest: await this.testConnection(),
    };
  }

  /**
   * Validate required fields in data objects
   */
  protected validateRequiredFields(data: Record<string, any>, requiredFields: string[]): void {
    const missingFields = requiredFields.filter(
      field => data[field] === undefined || data[field] === null
    );

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
  }

  /**
   * Sanitize data for database insertion
   */
  protected sanitizeData(data: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        // Handle arrays for PostgreSQL
        if (Array.isArray(value)) {
          sanitized[key] = JSON.stringify(value);
        } else if (typeof value === 'string') {
          // Basic SQL injection prevention
          sanitized[key] = value.replace(/'/g, "''");
        } else {
          sanitized[key] = value;
        }
      }
    }

    return sanitized;
  }

  /**
   * Build WHERE clause from search criteria
   */
  protected buildWhereClause(
    criteria: Record<string, any>,
    startParamIndex = 1
  ): { clause: string; params: any[]; nextParamIndex: number } {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = startParamIndex;

    for (const [field, value] of Object.entries(criteria)) {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          // Handle IN clauses
          const placeholders = value.map(() => `$${paramIndex++}`).join(', ');
          conditions.push(`${field} IN (${placeholders})`);
          params.push(...value);
        } else if (typeof value === 'string' && value.includes('%')) {
          // Handle LIKE clauses
          conditions.push(`${field} ILIKE $${paramIndex++}`);
          params.push(value);
        } else {
          // Handle exact matches
          conditions.push(`${field} = $${paramIndex++}`);
          params.push(value);
        }
      }
    }

    return {
      clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
      nextParamIndex: paramIndex,
    };
  }
}
