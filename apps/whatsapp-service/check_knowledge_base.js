const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function checkKnowledgeBase() {
  try {
    console.log('🔍 Checking AI knowledge base...');

    // Check if knowledge base table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ai_knowledge_base'
      );
    `);

    if (!tableExists.rows[0].exists) {
      console.log('❌ Knowledge base table does not exist');
      return;
    }

    // Get knowledge base content
    const knowledge = await pool.query(`
      SELECT id, category, title, content, keywords, priority, is_active
      FROM ai_knowledge_base 
      WHERE is_active = true
      ORDER BY priority DESC, category, title;
    `);

    console.log(`📚 Found ${knowledge.rows.length} active knowledge entries`);

    if (knowledge.rows.length === 0) {
      console.log('❌ No knowledge entries found in the database');
      console.log('💡 This explains why AI says "Sin conocimiento suficiente"');
    } else {
      console.log('\n📋 Current knowledge base entries:');
      console.table(knowledge.rows.map(row => ({
        id: row.id,
        category: row.category,
        title: row.title,
        keywords: row.keywords ? row.keywords.join(', ') : 'none',
        priority: row.priority,
        active: row.is_active
      })));
    }

    // Check AI configuration
    console.log('\n🔧 Checking AI configuration...');
    const config = await pool.query(`
      SELECT config_key, config_value, description
      FROM ai_configuration
      ORDER BY config_key;
    `);

    if (config.rows.length === 0) {
      console.log('❌ No AI configuration found');
    } else {
      console.table(config.rows);
    }

  } catch (error) {
    console.error('❌ Error checking knowledge base:', error);
  } finally {
    await pool.end();
  }
}

checkKnowledgeBase();
