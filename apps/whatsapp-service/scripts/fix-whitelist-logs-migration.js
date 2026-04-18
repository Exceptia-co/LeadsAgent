const { Pool } = require('pg');

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('🚀 Starting whitelist_logs migration...');

    // Check if the table exists and has the wrong column type
    const checkColumnQuery = `
      SELECT 
        column_name, 
        data_type,
        character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = 'whatsapp_whitelist_logs' 
        AND column_name = 'lead_id';
    `;

    const columnCheck = await pool.query(checkColumnQuery);

    if (columnCheck.rows.length === 0) {
      console.log('❌ Table whatsapp_whitelist_logs or column lead_id not found');
      return;
    }

    const currentColumn = columnCheck.rows[0];
    console.log(
      `📋 Current lead_id column: ${currentColumn.data_type} ${currentColumn.character_maximum_length ? `(${currentColumn.character_maximum_length})` : ''}`
    );

    if (currentColumn.data_type === 'uuid') {
      console.log('✅ Column lead_id is already UUID type - no migration needed');
      return;
    }

    // If it's VARCHAR, we need to convert it to UUID
    if (currentColumn.data_type === 'character varying') {
      console.log('🔄 Converting lead_id from VARCHAR to UUID...');

      // Step 1: Add a temporary column
      await pool.query(`
        ALTER TABLE whatsapp_whitelist_logs 
        ADD COLUMN lead_id_new UUID;
      `);
      console.log('✅ Added temporary UUID column');

      // Step 2: Convert valid UUIDs from the old column
      const convertResult = await pool.query(`
        UPDATE whatsapp_whitelist_logs 
        SET lead_id_new = CASE 
          WHEN lead_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
          THEN lead_id::UUID
          ELSE NULL
        END;
      `);
      console.log(`✅ Converted ${convertResult.rowCount} rows with valid UUIDs`);

      // Step 3: Drop the old column
      await pool.query(`
        ALTER TABLE whatsapp_whitelist_logs 
        DROP COLUMN lead_id;
      `);
      console.log('✅ Dropped old VARCHAR column');

      // Step 4: Rename the new column
      await pool.query(`
        ALTER TABLE whatsapp_whitelist_logs 
        RENAME COLUMN lead_id_new TO lead_id;
      `);
      console.log('✅ Renamed new column to lead_id');
    }

    // Verify the final structure
    const finalCheck = await pool.query(checkColumnQuery);
    if (finalCheck.rows.length > 0) {
      const finalColumn = finalCheck.rows[0];
      console.log(`✅ Final lead_id column: ${finalColumn.data_type}`);
    }

    // Also check table structure
    const tableStructure = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'whatsapp_whitelist_logs'
      ORDER BY ordinal_position;
    `);

    console.log('\n📋 Final table structure:');
    tableStructure.rows.forEach(col => {
      console.log(
        `  ${col.column_name}: ${col.data_type}${col.is_nullable === 'YES' ? ' (nullable)' : ' (not null)'}`
      );
    });

    console.log('\n🎉 Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the migration
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('✅ Migration script finished');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigration };
