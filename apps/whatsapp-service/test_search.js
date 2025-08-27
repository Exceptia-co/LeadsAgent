const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Función para extraer palabras clave como lo hace DatabaseService
function extractSearchKeywords(query) {
  const stopWords = ['el', 'la', 'de', 'que', 'y', 'en', 'un', 'es', 'se', 'no', 'te', 'lo', 'le', 'da', 'su', 'por', 'son', 'con', 'para', 'como', 'del', 'las'];
  
  return query
    .toLowerCase()
    .replace(/[^\w\sáéíóúñü]/gi, '')
    .split(/\s+/)
    .filter(word => word.length >= 3 && !stopWords.includes(word))
    .slice(0, 5);
}

async function testSearch() {
  try {
    const testMessage = "hola";
    console.log(`🔍 Testing search for: "${testMessage}"`);
    
    // Extraer palabras clave
    const queryWords = extractSearchKeywords(testMessage);
    console.log('📝 Query words:', queryWords);
    
    const searchTerms = [`%${testMessage}%`, ...queryWords.map(word => `%${word}%`)];
    console.log('🎯 Search terms:', searchTerms);
    
    // Buscar en la base de conocimiento exactamente como lo hace DatabaseService
    const searchQuery = `
      SELECT 
        id, category, title, content, keywords, priority,
        -- Calcular relevancia score
        (
          -- Puntuación por match exacto en título (peso: 100)
          CASE WHEN title ILIKE $1 THEN 100 ELSE 0 END +
          -- Puntuación por keywords coincidentes (peso: 80)
          (
            SELECT COUNT(*) * 80 
            FROM unnest(keywords) AS keyword 
            WHERE keyword ILIKE ANY($2::text[])
          ) +
          -- Puntuación por match en contenido (peso: 30)
          CASE WHEN content ILIKE $1 THEN 30 ELSE 0 END +
          -- Bonificación por prioridad (peso: prioridad * 5)
          (priority * 5)
        ) AS relevance_score
      FROM ai_knowledge_base 
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
      LIMIT 10;
    `;
    
    console.log('\n🔍 Executing search query...');
    const result = await pool.query(searchQuery, [testMessage, searchTerms]);
    
    console.log(`📊 Found ${result.rows.length} results`);
    
    if (result.rows.length === 0) {
      console.log('❌ No results found - this explains why AI says "Sin conocimiento suficiente"');
      
      // Let's see why - check if "hola" matches anything
      console.log('\n🔍 Testing individual conditions...');
      
      // Test title matches
      const titleMatch = await pool.query(`
        SELECT title, (title ILIKE $1) as matches 
        FROM ai_knowledge_base 
        WHERE is_active = true;
      `, [`%${testMessage}%`]);
      
      console.log('\n📝 Title matches:');
      console.table(titleMatch.rows.filter(r => r.matches));
      
      // Test content matches  
      const contentMatch = await pool.query(`
        SELECT title, (content ILIKE $1) as matches 
        FROM ai_knowledge_base 
        WHERE is_active = true;
      `, [`%${testMessage}%`]);
      
      console.log('\n📄 Content matches:');
      console.table(contentMatch.rows.filter(r => r.matches));
      
      // Test keyword matches
      if (queryWords.length > 0) {
        const keywordMatch = await pool.query(`
          SELECT title, keywords,
            (
              SELECT COUNT(*) 
              FROM unnest(keywords) AS keyword 
              WHERE keyword ILIKE ANY($1::text[])
            ) as keyword_matches
          FROM ai_knowledge_base 
          WHERE is_active = true;
        `, [searchTerms.slice(1)]);
        
        console.log('\n🏷️  Keyword matches:');
        console.table(keywordMatch.rows.filter(r => r.keyword_matches > 0));
      }
      
    } else {
      const filteredResults = result.rows.filter(row => row.relevance_score >= 30);
      console.log(`✅ Results after filtering (score >= 30): ${filteredResults.length}`);
      
      console.table(filteredResults.map(row => ({
        title: row.title,
        category: row.category,
        relevance_score: row.relevance_score,
        match_quality: row.relevance_score >= 100 ? 'high' : (row.relevance_score >= 60 ? 'medium' : 'low')
      })));
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await pool.end();
  }
}

testSearch();
