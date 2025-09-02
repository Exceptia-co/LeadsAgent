#!/usr/bin/env node

/**
 * Script to fix database schema inconsistencies
 * 
 * This script runs the migration to fix the whatsapp_whitelist_logs table
 * schema inconsistencies between the 'action' and 'decision' fields.
 * 
 * Usage: node scripts/fix-database-schema.js
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

async function main() {
  console.log('🔧 Database Schema Fix - WhatsApp Whitelist Logs');
  console.log('=================================================');

  if (!process.env.DATABASE_URL) {
    console.error('❌ ERROR: DATABASE_URL environment variable is not set');
    console.error('Please set DATABASE_URL in your .env file');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    // Test connection first
    console.log('🔗 Testing database connection...');
    const testResult = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    console.log(`✅ Connected to PostgreSQL: ${testResult.rows[0].pg_version.split(' ')[1]}`);
    console.log(`⏰ Database time: ${testResult.rows[0].current_time}`);

    // Check current table structure
    console.log('\n📋 Checking current table structure...');
    
    try {
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'whatsapp_whitelist_logs'
        );
      `);

      if (!tableCheck.rows[0].exists) {
        console.log('ℹ️  Table whatsapp_whitelist_logs does not exist - will be created with correct schema');
      } else {
        console.log('✅ Table whatsapp_whitelist_logs exists');
        
        // Check current columns
        const columnsQuery = await pool.query(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns 
          WHERE table_name = 'whatsapp_whitelist_logs' 
          AND table_schema = 'public'
          ORDER BY column_name;
        `);

        console.log('\n📊 Current columns:');
        columnsQuery.rows.forEach(col => {
          const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)';
          console.log(`   - ${col.column_name}: ${col.data_type} ${nullable}`);
        });

        // Check for problematic records with null action/decision
        try {
          const nullCheckQuery = `
            SELECT 
              COUNT(*) as total_records,
              COUNT(CASE WHEN action IS NULL THEN 1 END) as null_action_count,
              COUNT(CASE WHEN decision IS NULL THEN 1 END) as null_decision_count
            FROM whatsapp_whitelist_logs;
          `;
          
          const nullCheck = await pool.query(nullCheckQuery);
          const stats = nullCheck.rows[0];
          
          console.log('\n📈 Data integrity check:');
          console.log(`   Total records: ${stats.total_records}`);
          console.log(`   Records with null action: ${stats.null_action_count}`);
          console.log(`   Records with null decision: ${stats.null_decision_count}`);
          
          if (parseInt(stats.null_action_count) > 0 || parseInt(stats.null_decision_count) > 0) {
            console.log('⚠️  Found records with null values - migration will fix these');
          } else {
            console.log('✅ No null values found in critical fields');
          }
        } catch (error) {
          console.log('⚠️  Could not check for null values (expected if columns don\'t exist)');
        }
      }
    } catch (error) {
      console.log('⚠️  Error checking table structure:', error.message);
    }

    // Load and run the migration
    console.log('\n🚀 Running database schema migration...');
    
    const migrationPath = path.join(__dirname, '../apps/whatsapp-service/src/migrations/002_fix_whitelist_logs_schema_final.js');
    console.log(`📁 Loading migration from: ${migrationPath}`);
    
    const migration = require(migrationPath);
    
    if (!migration.up || typeof migration.up !== 'function') {
      throw new Error('Migration file does not export a valid up() function');
    }

    // Run the migration
    await migration.up(pool);

    console.log('\n✅ Migration completed successfully!');
    
    // Verify the fix
    console.log('\n🔍 Verifying the fix...');
    
    const finalCheck = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'whatsapp_whitelist_logs' 
      AND table_schema = 'public'
      ORDER BY column_name;
    `);

    console.log('\n📊 Final schema:');
    finalCheck.rows.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)';
      const status = col.column_name === 'decision' && col.is_nullable === 'NO' ? '✅' : 
                     col.column_name === 'action' ? '🗑️ ' : '  ';
      console.log(`${status} ${col.column_name}: ${col.data_type} ${nullable}`);
    });

    // Test the schema by trying to insert a test record
    console.log('\n🧪 Testing schema with sample insert...');
    
    try {
      await pool.query(`
        INSERT INTO whatsapp_whitelist_logs (phone_number, decision, reason, created_by) 
        VALUES ('test-schema-fix', 'BLOCKED', 'Schema fix test', 'migration-script')
      `);
      
      await pool.query(`
        DELETE FROM whatsapp_whitelist_logs 
        WHERE phone_number = 'test-schema-fix' AND created_by = 'migration-script'
      `);
      
      console.log('✅ Schema test passed - inserts work correctly!');
    } catch (testError) {
      console.error('❌ Schema test failed:', testError.message);
      throw testError;
    }

    console.log('\n🎉 Database schema fix completed successfully!');
    console.log('\n📋 Summary of changes:');
    console.log('   ✅ Fixed whatsapp_whitelist_logs table schema');
    console.log('   ✅ Standardized on \'decision\' field (NOT NULL)');
    console.log('   ✅ Removed conflicting \'action\' field if it existed');
    console.log('   ✅ Added missing columns with proper constraints');
    console.log('   ✅ Created proper indexes for performance');
    console.log('   ✅ Schema tested and verified working');

    console.log('\n🔄 Next steps:');
    console.log('   1. Restart your API server');
    console.log('   2. Test WhatsApp message processing');
    console.log('   3. Check logs for any remaining errors');
    console.log('   4. Monitor whitelist statistics endpoint');

  } catch (error) {
    console.error('\n❌ MIGRATION FAILED:');
    console.error('Error:', error.message);
    console.error('\nStack trace:', error.stack);
    
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Check DATABASE_URL is correct');
    console.log('   2. Ensure database is accessible');
    console.log('   3. Verify you have proper permissions');
    console.log('   4. Check PostgreSQL version compatibility');
    
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n🔌 Database connection closed');
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('\n💥 Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the script
if (require.main === module) {
  main();
}
