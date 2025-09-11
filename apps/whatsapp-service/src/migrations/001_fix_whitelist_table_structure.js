const { Pool } = require('pg');

const migrationName = '001_fix_whitelist_table_structure';
const migrationDescription = 'Fix and standardize whatsapp_whitelist_logs table structure';

async function up(pool) {
  console.log(`🔄 Running migration: ${migrationName}`);
  
  try {
    // Check if table exists first
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'whatsapp_whitelist_logs'
      );
    `);
    
    if (!tableExists.rows[0].exists) {
      console.log('ℹ️  Table whatsapp_whitelist_logs does not exist yet, skipping migration');
      console.log('✅ Migration will be handled by table creation process');
      return;
    }

    console.log('🔄 Fixing table structure...');

    // Step 1: Check current columns
    const currentColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'whatsapp_whitelist_logs' 
      AND table_schema = 'public';
    `);

    const columnNames = currentColumns.rows.map(row => row.column_name);
    console.log('Current columns:', columnNames);

    // Step 2: Add missing columns that should be in the table
    const requiredColumns = [
      { name: 'lead_id', type: 'VARCHAR(255)', nullable: true },
      { name: 'lead_name', type: 'VARCHAR(255)', nullable: true },
      { name: 'message_preview', type: 'TEXT', nullable: true },
      { name: 'ai_provider', type: 'VARCHAR(50)', nullable: true },
      { name: 'ip_address', type: 'VARCHAR(45)', nullable: true },
      { name: 'user_agent', type: 'TEXT', nullable: true }
    ];

    for (const col of requiredColumns) {
      if (!columnNames.includes(col.name)) {
        console.log(`🔄 Adding missing column: ${col.name}`);
        const nullable = col.nullable ? '' : 'NOT NULL';
        await pool.query(`
          ALTER TABLE whatsapp_whitelist_logs 
          ADD COLUMN ${col.name} ${col.type} ${nullable};
        `);
      }
    }

    // Step 3: Clean up the lead_id_temp column if it exists
    if (columnNames.includes('lead_id_temp')) {
      console.log('🧹 Cleaning up lead_id_temp column...');
      
      // If both columns exist, copy data if needed and drop temp
      if (columnNames.includes('lead_id')) {
        await pool.query(`
          UPDATE whatsapp_whitelist_logs 
          SET lead_id = lead_id_temp 
          WHERE lead_id IS NULL AND lead_id_temp IS NOT NULL;
        `);
        
        await pool.query(`
          ALTER TABLE whatsapp_whitelist_logs 
          DROP COLUMN lead_id_temp;
        `);
        console.log('✅ Removed lead_id_temp column');
      } else {
        // Only temp exists, rename it
        console.log('🔄 Renaming lead_id_temp to lead_id...');
        await pool.query(`
          ALTER TABLE whatsapp_whitelist_logs 
          RENAME COLUMN lead_id_temp TO lead_id;
        `);
      }
    }

    // Step 4: Standardize the 'decision' column (rename 'action' if it exists)
    if (columnNames.includes('action') && !columnNames.includes('decision')) {
      console.log('🔄 Renaming action column to decision...');
      await pool.query(`
        ALTER TABLE whatsapp_whitelist_logs 
        RENAME COLUMN action TO decision;
      `);
    }

    // Step 5: Add constraint to decision column if it doesn't exist
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.check_constraints 
          WHERE constraint_name = 'whatsapp_whitelist_logs_decision_check'
        ) THEN
          ALTER TABLE whatsapp_whitelist_logs 
          ADD CONSTRAINT whatsapp_whitelist_logs_decision_check 
          CHECK (decision IN ('ALLOWED', 'BLOCKED'));
        END IF;
      END $$;
    `);

    // Step 6: Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_whitelist_logs_phone ON whatsapp_whitelist_logs(phone_number);',
      'CREATE INDEX IF NOT EXISTS idx_whitelist_logs_decision ON whatsapp_whitelist_logs(decision);',
      'CREATE INDEX IF NOT EXISTS idx_whitelist_logs_created ON whatsapp_whitelist_logs(created_at);',
      'CREATE INDEX IF NOT EXISTS idx_whitelist_logs_session ON whatsapp_whitelist_logs(session_id);',
      'CREATE INDEX IF NOT EXISTS idx_whitelist_logs_lead_id ON whatsapp_whitelist_logs(lead_id);'
    ];

    for (const indexSQL of indexes) {
      await pool.query(indexSQL);
    }

    console.log(`✅ Migration ${migrationName} completed successfully`);
  } catch (error) {
    console.error(`❌ Migration ${migrationName} failed:`, error);
    throw error;
  }
}

async function down(pool) {
  console.log(`🔄 Reverting migration: ${migrationName}`);
  
  try {
    console.warn('⚠️ This migration makes structural changes that cannot be automatically reverted');
    console.warn('⚠️ Manual intervention may be required to restore the original table structure');
  } catch (error) {
    console.error(`❌ Failed to revert migration ${migrationName}:`, error);
    throw error;
  }
}

module.exports = {
  name: migrationName,
  description: migrationDescription,
  up,
  down
};
