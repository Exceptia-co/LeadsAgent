const { Client } = require('pg');

// Configuración directa de la conexión
const DATABASE_URL = "postgresql://postgres:PASSWORD_REMOVED@db.PROJECT_REF_REMOVED.supabase.co:5432/postgres";

async function activateWhatsAppForLeads() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔗 Conectando a Supabase PostgreSQL...');
    await client.connect();
    console.log('✅ Conectado a Supabase');

    // Activar WhatsApp para todos los leads existentes
    console.log('\n🔧 Activando WhatsApp para todos los leads...');
    const updateQuery = `
      UPDATE leads 
      SET "whatsappAuthorized" = TRUE 
      WHERE "whatsappAuthorized" = FALSE;
    `;
    
    const updateResult = await client.query(updateQuery);
    console.log(`✅ ${updateResult.rowCount} leads actualizados con whatsappAuthorized = TRUE`);

    // Verificar el resultado
    console.log('\n📊 Verificando leads actualizados...');
    const verifyQuery = `
      SELECT id, name, phone, "whatsappAuthorized", "createdAt"
      FROM leads 
      ORDER BY "createdAt" DESC;
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
    console.log('\n📈 Estadísticas finales:');
    console.table(statsResult.rows);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
    console.log('\n🔚 Conexión cerrada');
  }
}

activateWhatsAppForLeads();
