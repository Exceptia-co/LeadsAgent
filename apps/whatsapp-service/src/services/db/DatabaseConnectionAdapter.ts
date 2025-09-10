/**
 * @fileoverview Database Connection Adapter
 * Adapts PostgreSQL pool to the repository interface
 */

import { IDatabaseConnection } from './types';
import { logger } from '../../utils/logger';

export class DatabaseConnectionAdapter implements IDatabaseConnection {
  private pool: any; // pg.Pool - using any to avoid pg import issues

  constructor(pool: any) {
    this.pool = pool;
  }

  /**
   * Execute a query
   */
  public async query(sql: string, params: any[] = []): Promise<any> {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    try {
      const result = await this.pool.query(sql, params);
      return result;
    } catch (error) {
      logger.error('Database query error:', { error, sql, params });
      throw error;
    }
  }

  /**
   * Test database connection
   */
  public async testConnection(): Promise<boolean> {
    if (!this.pool) {
      return false;
    }

    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch (error) {
      logger.error('Database connection test failed:', error);
      return false;
    }
  }

  /**
   * Close database connection
   */
  public async close(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.end();
      } catch (error) {
        logger.error('Error closing database pool:', error);
      }
    }
  }
}
