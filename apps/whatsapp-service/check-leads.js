const { Pool } = require('pg');

async function checkLeads() {
  const pool = new Pool({
    connectionString: "postgresql://postgres:PASSWORD_REMOVED@db.PROJECT_REF_REMOVED.supabase.co:5432/postgres",
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('📋 Verificando leads en la base de datos...\n');
    
    // Get all leads
    const leadsResult = await pool.query(`
      SELECT id, name, phone, email, status, source, whatsapp_authorized, created_at, updated_at
      FROM leads
      ORDER BY created_at DESC;
    `);
    
    console.log(`Total de leads encontrados: ${leadsResult.rows.length}\n`);
    
    // Group by phone to check for duplicates
    const phoneGroups = {};
    leadsResult.rows.forEach(lead => {
      const cleanPhone = lead.phone.replace(/[^0-9]/g, '');
      if (!phoneGroups[cleanPhone]) {
        phoneGroups[cleanPhone] = [];
      }
      phoneGroups[cleanPhone].push(lead);
    });
    
    // Check for duplicates
    console.log('🔍 Verificando duplicados por número de teléfono:\n');
    let duplicatesFound = false;
    
    Object.keys(phoneGroups).forEach(phone => {
      const leads = phoneGroups[phone];
      if (leads.length > 1) {
        duplicatesFound = true;
        console.log(`❌ DUPLICADO encontrado para teléfono ${phone}:`);
        leads.forEach((lead, index) => {
          console.log(`   ${index + 1}. ID: ${lead.id}, Nombre: ${lead.name || 'Sin nombre'}, WhatsApp: ${lead.whatsapp_authorized}, Creado: ${lead.created_at}`);
        });
        console.log('');
      }
    });
    
    if (!duplicatesFound) {
      console.log('✅ No se encontraron leads duplicados\n');
    }
    
    // Show all leads
    console.log('📋 Todos los leads:\n');
    leadsResult.rows.forEach((lead, index) => {
      console.log(`${index + 1}. ID: ${lead.id}`);
      console.log(`   Nombre: ${lead.name || 'Sin nombre'}`);
      console.log(`   Teléfono: ${lead.phone}`);
      console.log(`   Email: ${lead.email || 'Sin email'}`);
      console.log(`   Status: ${lead.status}`);
      console.log(`   WhatsApp autorizado: ${lead.whatsapp_authorized}`);
      console.log(`   Creado: ${lead.created_at}`);
      console.log('   ---');
    });
    
  } catch (error) {
    console.error('❌ Error verificando leads:', error.message);
  } finally {
    await pool.end();
  }
}

checkLeads();
