import dotenv from 'dotenv';
import path from 'path';
import { Pool } from 'pg';

// Cargar variables de entorno
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

console.log('🔍 INSPECCIÓN DE TABLA whatsapp_conversations');
console.log('=====================================\n');

async function inspectTable() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    // Verificar si la tabla existe
    console.log('📋 Verificando si la tabla whatsapp_conversations existe...');
    const tableExistsQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'whatsapp_conversations'
      );
    `;
    
    const tableExistsResult = await pool.query(tableExistsQuery);
    const tableExists = tableExistsResult.rows[0].exists;
    
    console.log('¿Tabla existe?:', tableExists ? 'SÍ ✅' : 'NO ❌');
    
    if (tableExists) {
      // Obtener estructura de la tabla
      console.log('\n📊 Estructura de la tabla whatsapp_conversations:');
      const columnsQuery = `
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'whatsapp_conversations'
        ORDER BY ordinal_position;
      `;
      
      const columnsResult = await pool.query(columnsQuery);
      console.log('\n| Columna | Tipo | Nullable | Default |');
      console.log('|---------|------|----------|---------|');
      
      columnsResult.rows.forEach(column => {
        console.log(`| ${column.column_name} | ${column.data_type} | ${column.is_nullable} | ${column.column_default || 'NULL'} |`);
      });
      
      // Verificar columnas específicas que necesitamos
      console.log('\n🔍 Verificando columnas requeridas:');
      const requiredColumns = [
        'session_id',
        'phone_number', 
        'contact_name',
        'message_text',
        'response_text',
        'message_type',
        'intent',
        'sentiment',
        'ai_provider',
        'tokens_used',
        'is_from_user'
      ];
      
      const existingColumns = columnsResult.rows.map(row => row.column_name);
      
      requiredColumns.forEach(column => {
        const exists = existingColumns.includes(column);
        console.log(`  ${column}: ${exists ? '✅' : '❌'}`);
      });
      
      // Mostrar algunas filas de ejemplo
      console.log('\n📋 Primeras 3 filas de la tabla:');
      try {
        const sampleQuery = 'SELECT * FROM whatsapp_conversations ORDER BY created_at DESC LIMIT 3';
        const sampleResult = await pool.query(sampleQuery);
        
        if (sampleResult.rows.length > 0) {
          console.log('Filas encontradas:', sampleResult.rows.length);
          sampleResult.rows.forEach((row, index) => {
            console.log(`\nFila ${index + 1}:`);
            Object.entries(row).forEach(([key, value]) => {
              console.log(`  ${key}: ${typeof value === 'string' && value.length > 50 ? value.substring(0, 50) + '...' : value}`);
            });
          });
        } else {
          console.log('📭 No hay registros en la tabla');
        }
      } catch (error) {
        console.log('⚠️  Error obteniendo filas de ejemplo:', error.message);
      }
      
    } else {
      console.log('\n❌ La tabla whatsapp_conversations no existe en la base de datos');
      console.log('🔧 Esto explica por qué el método saveConversation no puede guardar conversaciones');
    }
    
    // Listar todas las tablas disponibles
    console.log('\n📋 Todas las tablas disponibles en la base de datos:');
    const allTablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    
    const allTablesResult = await pool.query(allTablesQuery);
    allTablesResult.rows.forEach(table => {
      console.log(`  - ${table.table_name}`);
    });
    
  } catch (error) {
    console.error('❌ Error inspeccionando tabla:', error);
  } finally {
    await pool.end();
  }
}

inspectTable().catch(console.error);
