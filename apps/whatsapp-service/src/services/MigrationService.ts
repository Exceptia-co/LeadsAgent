import { Pool } from 'pg';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

export interface Migration {
  name: string;
  description: string;
  up: (pool: Pool) => Promise<void>;
  down: (pool: Pool) => Promise<void>;
}

class MigrationService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Initialize migrations table
   */
  private async initializeMigrationsTable(): Promise<void> {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        execution_time_ms INTEGER
      );
      
      CREATE INDEX IF NOT EXISTS idx_migrations_name ON migrations(name);
      CREATE INDEX IF NOT EXISTS idx_migrations_executed ON migrations(executed_at);
    `;

    try {
      await this.pool.query(createTableQuery);
      logger.info('✅ Migrations table initialized');
    } catch (error) {
      logger.error('❌ Error initializing migrations table:', error);
      throw error;
    }
  }

  /**
   * Check if a migration has been executed
   */
  private async isMigrationExecuted(name: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        'SELECT 1 FROM migrations WHERE name = $1',
        [name]
      );
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Error checking migration status:', error);
      return false;
    }
  }

  /**
   * Mark migration as executed
   */
  private async markMigrationAsExecuted(
    name: string, 
    description: string, 
    executionTime: number
  ): Promise<void> {
    try {
      await this.pool.query(
        'INSERT INTO migrations (name, description, execution_time_ms) VALUES ($1, $2, $3)',
        [name, description, executionTime]
      );
      logger.info(`✅ Migration ${name} marked as executed (${executionTime}ms)`);
    } catch (error) {
      logger.error('Error marking migration as executed:', error);
      throw error;
    }
  }

  /**
   * Load migration files from migrations directory
   */
  private async loadMigrations(): Promise<Migration[]> {
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    
    if (!fs.existsSync(migrationsDir)) {
      logger.warn('Migrations directory not found, skipping migrations');
      return [];
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.js'))
      .sort();

    const migrations: Migration[] = [];

    for (const file of files) {
      try {
        const migrationPath = path.join(migrationsDir, file);
        delete require.cache[migrationPath]; // Clear require cache
        const migrationModule = require(migrationPath);
        
        if (migrationModule.name && migrationModule.up && migrationModule.down) {
          migrations.push(migrationModule as Migration);
          logger.debug(`📁 Loaded migration: ${migrationModule.name}`);
        } else {
          logger.warn(`⚠️ Invalid migration file: ${file} - missing required exports`);
        }
      } catch (error) {
        logger.error(`❌ Error loading migration ${file}:`, error);
      }
    }

    return migrations;
  }

  /**
   * Run all pending migrations
   */
  public async runMigrations(): Promise<void> {
    try {
      logger.info('🚀 Starting database migrations...');
      
      // Initialize migrations table
      await this.initializeMigrationsTable();
      
      // Load migration files
      const migrations = await this.loadMigrations();
      
      if (migrations.length === 0) {
        logger.info('ℹ️ No migrations found');
        return;
      }

      logger.info(`📋 Found ${migrations.length} migration(s)`);

      let executedCount = 0;

      for (const migration of migrations) {
        if (await this.isMigrationExecuted(migration.name)) {
          logger.debug(`⏭️ Migration ${migration.name} already executed, skipping`);
          continue;
        }

        logger.info(`🔄 Executing migration: ${migration.name}`);
        logger.info(`📝 Description: ${migration.description}`);

        const startTime = Date.now();

        try {
          await migration.up(this.pool);
          const executionTime = Date.now() - startTime;
          
          await this.markMigrationAsExecuted(
            migration.name, 
            migration.description, 
            executionTime
          );
          
          executedCount++;
          logger.info(`✅ Migration ${migration.name} completed in ${executionTime}ms`);
        } catch (error) {
          logger.error(`❌ Migration ${migration.name} failed:`, error);
          throw new Error(`Migration ${migration.name} failed: ${error}`);
        }
      }

      if (executedCount > 0) {
        logger.info(`🎉 Successfully executed ${executedCount} migration(s)`);
      } else {
        logger.info('ℹ️ All migrations are up to date');
      }

    } catch (error) {
      logger.error('❌ Migration process failed:', error);
      throw error;
    }
  }

  /**
   * Get migration status
   */
  public async getMigrationStatus(): Promise<Array<{
    name: string;
    description?: string;
    executed: boolean;
    executedAt?: Date;
    executionTime?: number;
  }>> {
    try {
      await this.initializeMigrationsTable();
      
      const migrations = await this.loadMigrations();
      const executedMigrations = await this.pool.query(
        'SELECT name, description, executed_at, execution_time_ms FROM migrations ORDER BY executed_at'
      );
      
      const executedMap = new Map(
        executedMigrations.rows.map(row => [
          row.name, 
          {
            executedAt: new Date(row.executed_at),
            executionTime: row.execution_time_ms,
            description: row.description
          }
        ])
      );

      return migrations.map(migration => {
        const executed = executedMap.get(migration.name);
        return {
          name: migration.name,
          description: migration.description,
          executed: !!executed,
          executedAt: (executed as any)?.executedAt,
          executionTime: (executed as any)?.executionTime
        };
      });
    } catch (error) {
      logger.error('Error getting migration status:', error);
      return [];
    }
  }

  /**
   * Rollback last migration
   */
  public async rollbackLastMigration(): Promise<void> {
    try {
      const lastMigration = await this.pool.query(
        'SELECT name FROM migrations ORDER BY executed_at DESC LIMIT 1'
      );

      if (lastMigration.rows.length === 0) {
        logger.info('No migrations to rollback');
        return;
      }

      const migrationName = lastMigration.rows[0].name;
      const migrations = await this.loadMigrations();
      const migration = migrations.find(m => m.name === migrationName);

      if (!migration) {
        throw new Error(`Migration file not found for: ${migrationName}`);
      }

      logger.info(`🔄 Rolling back migration: ${migrationName}`);
      
      await migration.down(this.pool);
      
      await this.pool.query('DELETE FROM migrations WHERE name = $1', [migrationName]);
      
      logger.info(`✅ Migration ${migrationName} rolled back successfully`);
    } catch (error) {
      logger.error('❌ Rollback failed:', error);
      throw error;
    }
  }
}

export default MigrationService;
