const { Client } = require('pg');

// Configuración directa de la conexión
const DATABASE_URL = "postgresql://postgres:PFPxINx4EGXcp5WE@db.yxjzsargboxnuwnbuzax.supabase.co:5432/postgres";

async function addWhatsAppColumn() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔗 Conectando a Supabase PostgreSQL...');
    await client.connect();
    console.log('✅ Conectado a Supabase');

    // Verificar si la columna ya existe
    console.log('\n🔍 Verificando si la columna whatsappAuthorized existe...');
    const checkColumnQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'leads' 
      AND column_name = 'whatsappAuthorized';
    `;
    
    const checkResult = await client.query(checkColumnQuery);
    
    if (checkResult.rows.length > 0) {
      console.log('✅ La columna whatsappAuthorized ya existe');
    } else {
      console.log('❌ La columna whatsappAuthorized no existe, agregándola...');
      
      // Agregar la columna
      const addColumnQuery = `
        ALTER TABLE leads ADD COLUMN "whatsappAuthorized" BOOLEAN DEFAULT FALSE;
      `;
      
      await client.query(addColumnQuery);
      console.log('✅ Columna whatsappAuthorized agregada correctamente');
      
      // Actualizar algunos leads para testing
      console.log('\n🔧 Actualizando algunos leads para testing...');
      const updateQuery = `
        UPDATE leads 
        SET "whatsappAuthorized" = TRUE 
        WHERE id IN (
          SELECT id FROM leads ORDER BY "createdAt" DESC LIMIT 2
        );
      `;
      
      const updateResult = await client.query(updateQuery);
      console.log(`✅ ${updateResult.rowCount} leads actualizados con whatsappAuthorized = TRUE`);
    }

    // Verificar el resultado
    console.log('\n📊 Verificando estructura actual...');
    const verifyQuery = `
      SELECT id, name, phone, "whatsappAuthorized", "createdAt"
      FROM leads 
      ORDER BY "createdAt" DESC 
      LIMIT 5;
    `;
    
    const verifyResult = await client.query(verifyQuery);
    
    console.log('\n📋 Leads actuales:');
    console.table(verifyResult.rows);
    
    // Mostrar estadísticas
    const statsQuery = `
      SELECT 
        COUNT(*) as total_leads,
        COUNT(CASE WHEN "whatsappAuthorized" = true THEN 1 END) as authorized_leads,
        COUNT(CASE WHEN "whatsappAuthorized" = false THEN 1 END) as unauthorized_leads
      FROM leads;
    `;
    
    const statsResult = await client.query(statsQuery);
    console.log('\n📈 Estadísticas:');
    console.table(statsResult.rows);

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.message.includes('column "whatsappAuthorized" of relation "leads" already exists')) {
      console.log('ℹ️ La columna ya existe, verificando datos...');
      
      const verifyQuery = `
        SELECT id, name, phone, "whatsappAuthorized"
        FROM leads 
        LIMIT 3;
      `;
      
      const verifyResult = await client.query(verifyQuery);
      console.log('\n📋 Leads actuales:');
      console.table(verifyResult.rows);
    }
  } finally {
    await client.end();
    console.log('\n🔚 Conexión cerrada');
  }
}

addWhatsAppColumn();
