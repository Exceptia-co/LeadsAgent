const { Pool } = require('pg');

const migrationName = '002_fix_whitelist_logs_schema_final';
const migrationDescription =
  'Final fix for whatsapp_whitelist_logs schema inconsistencies - standardize on decision column';

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
      console.log('🆕 Creating whatsapp_whitelist_logs table with correct schema...');
      await pool.query(`
        CREATE TABLE whatsapp_whitelist_logs (
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
      `);
      console.log('✅ Table created with correct schema');
    } else {
      console.log('🔄 Fixing existing table structure...');

      // Step 1: Check current columns
      const currentColumns = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'whatsapp_whitelist_logs' 
        AND table_schema = 'public'
        ORDER BY column_name;
      `);

      const columnNames = currentColumns.rows.map(row => row.column_name);
      console.log('📋 Current columns:', columnNames);

      // Step 2: Handle the action/decision column mess
      if (columnNames.includes('action') && columnNames.includes('decision')) {
        console.log('🔄 Both action and decision columns exist - consolidating...');

        // Copy action data to decision if decision is null
        await pool.query(`
          UPDATE whatsapp_whitelist_logs 
          SET decision = action 
          WHERE decision IS NULL AND action IS NOT NULL;
        `);

        // Make decision NOT NULL if it's currently nullable
        const decisionColumn = currentColumns.rows.find(col => col.column_name === 'decision');
        if (decisionColumn && decisionColumn.is_nullable === 'YES') {
          console.log('🔄 Making decision column NOT NULL...');
          await pool.query(`
            ALTER TABLE whatsapp_whitelist_logs 
            ALTER COLUMN decision SET NOT NULL;
          `);
        }

        // Drop the action column
        console.log('🗑️ Dropping redundant action column...');
        await pool.query(`
          ALTER TABLE whatsapp_whitelist_logs 
          DROP COLUMN action;
        `);
      } else if (columnNames.includes('action') && !columnNames.includes('decision')) {
        console.log('🔄 Renaming action column to decision...');
        await pool.query(`
          ALTER TABLE whatsapp_whitelist_logs 
          RENAME COLUMN action TO decision;
        `);
      } else if (!columnNames.includes('decision')) {
        console.log('🔄 Adding missing decision column...');
        await pool.query(`
          ALTER TABLE whatsapp_whitelist_logs 
          ADD COLUMN decision VARCHAR(20) NOT NULL DEFAULT 'BLOCKED' 
          CHECK (decision IN ('ALLOWED', 'BLOCKED'));
        `);
      }

      // Step 3: Add missing columns
      const requiredColumns = [
        { name: 'lead_id', type: 'VARCHAR(255)', nullable: true },
        { name: 'lead_name', type: 'VARCHAR(255)', nullable: true },
        { name: 'message_preview', type: 'TEXT', nullable: true },
        { name: 'ai_provider', type: 'VARCHAR(50)', nullable: true },
        { name: 'ip_address', type: 'VARCHAR(45)', nullable: true },
        { name: 'user_agent', type: 'TEXT', nullable: true },
      ];

      for (const col of requiredColumns) {
        if (!columnNames.includes(col.name)) {
          console.log(`➕ Adding missing column: ${col.name}`);
          const nullable = col.nullable ? '' : 'NOT NULL';
          await pool.query(`
            ALTER TABLE whatsapp_whitelist_logs 
            ADD COLUMN ${col.name} ${col.type} ${nullable};
          `);
        }
      }

      // Step 4: Ensure decision column has proper constraint
      await pool.query(`
        DO $$ 
        BEGIN
          -- Drop existing constraint if it exists (using correct system catalog)
          IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
            WHERE tc.table_name = 'whatsapp_whitelist_logs'
            AND tc.table_schema = 'public'
            AND tc.constraint_type = 'CHECK'
            AND cc.check_clause LIKE '%decision%'
          ) THEN
            ALTER TABLE whatsapp_whitelist_logs 
            DROP CONSTRAINT IF EXISTS whatsapp_whitelist_logs_decision_check;
          END IF;
          
          -- Add the correct constraint if it doesn't exist
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
            WHERE tc.table_name = 'whatsapp_whitelist_logs'
            AND tc.table_schema = 'public'
            AND tc.constraint_name = 'whatsapp_whitelist_logs_decision_check'
          ) THEN
            ALTER TABLE whatsapp_whitelist_logs 
            ADD CONSTRAINT whatsapp_whitelist_logs_decision_check 
            CHECK (decision IN ('ALLOWED', 'BLOCKED'));
          END IF;
        END $$;
      `);
    }

    // Step 5: Create/update indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_whitelist_logs_phone ON whatsapp_whitelist_logs(phone_number);',
      'CREATE INDEX IF NOT EXISTS idx_whitelist_logs_decision ON whatsapp_whitelist_logs(decision);',
      'CREATE INDEX IF NOT EXISTS idx_whitelist_logs_created ON whatsapp_whitelist_logs(created_at);',
      'CREATE INDEX IF NOT EXISTS idx_whitelist_logs_session ON whatsapp_whitelist_logs(session_id);',
      'CREATE INDEX IF NOT EXISTS idx_whitelist_logs_lead_id ON whatsapp_whitelist_logs(lead_id);',
    ];

    console.log('📊 Creating indexes...');
    for (const indexSQL of indexes) {
      await pool.query(indexSQL);
    }

    // Step 6: Verify final schema
    const finalColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'whatsapp_whitelist_logs' 
      AND table_schema = 'public'
      ORDER BY column_name;
    `);

    console.log('✅ Final schema:');
    finalColumns.rows.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)';
      console.log(`   - ${col.column_name}: ${col.data_type} ${nullable}`);
    });

    console.log(`✅ Migration ${migrationName} completed successfully`);

    // Test the schema by inserting a test record
    console.log('🧪 Testing schema with a test insert...');
    try {
      await pool.query(`
        INSERT INTO whatsapp_whitelist_logs (phone_number, decision, reason, created_by) 
        VALUES ('test-number', 'BLOCKED', 'Migration test', 'migration-script');
      `);

      // Delete the test record
      await pool.query(`
        DELETE FROM whatsapp_whitelist_logs 
        WHERE phone_number = 'test-number' AND created_by = 'migration-script';
      `);

      console.log('✅ Schema test passed - ready for use!');
    } catch (testError) {
      console.error('❌ Schema test failed:', testError.message);
      throw testError;
    }
  } catch (error) {
    console.error(`❌ Migration ${migrationName} failed:`, error);
    throw error;
  }
}

async function down(pool) {
  console.log(`🔄 Reverting migration: ${migrationName}`);

  try {
    // This is a complex migration that standardizes the schema
    // Rolling back would require knowing the exact previous state
    console.warn('⚠️ This migration cannot be automatically reverted');
    console.warn('⚠️ Manual database restore from backup may be required');

    // Optionally, we could rename decision back to action if needed:
    // await pool.query(`ALTER TABLE whatsapp_whitelist_logs RENAME COLUMN decision TO action;`);
  } catch (error) {
    console.error(`❌ Failed to revert migration ${migrationName}:`, error);
    throw error;
  }
}

module.exports = {
  name: migrationName,
  description: migrationDescription,
  up,
  down,
};
