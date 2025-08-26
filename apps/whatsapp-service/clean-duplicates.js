const { Pool } = require('pg');

async function cleanDuplicates() {
  const pool = new Pool({
    connectionString: "postgresql://postgres:PASSWORD_REMOVED@db.PROJECT_REF_REMOVED.supabase.co:5432/postgres",
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🧹 Limpiando leads duplicados...\n');
    
    // Get all leads
    const leadsResult = await pool.query(`
      SELECT id, name, phone, email, status, source, whatsapp_authorized, created_at, updated_at
      FROM leads
      ORDER BY created_at ASC; -- Keep the oldest one
    `);
    
    // Group by normalized phone number
    const phoneGroups = {};
    leadsResult.rows.forEach(lead => {
      const normalizedPhone = lead.phone.replace(/[^0-9]/g, '');
      if (!phoneGroups[normalizedPhone]) {
        phoneGroups[normalizedPhone] = [];
      }
      phoneGroups[normalizedPhone].push(lead);
    });
    
    // Find and remove duplicates
    let duplicatesRemoved = 0;
    
    for (const [phone, leads] of Object.entries(phoneGroups)) {
      if (leads.length > 1) {
        console.log(`❌ Found duplicate for phone ${phone}:`);
        
        // Keep the first (oldest) lead and remove the rest
        const keepLead = leads[0];
        const toRemove = leads.slice(1);
        
        console.log(`   ✅ Keeping: ID ${keepLead.id}, Name: ${keepLead.name}, Created: ${keepLead.created_at}`);
        
        for (const duplicate of toRemove) {
          console.log(`   🗑️ Removing: ID ${duplicate.id}, Name: ${duplicate.name}, Created: ${duplicate.created_at}`);
          
          try {
            await pool.query('DELETE FROM leads WHERE id = $1', [duplicate.id]);
            duplicatesRemoved++;
            console.log(`     ✅ Deleted lead ${duplicate.id}`);
          } catch (error) {
            console.log(`     ❌ Error deleting lead ${duplicate.id}:`, error.message);
          }
        }
        console.log('');
      }
    }
    
    console.log(`🎉 Cleanup completed. Removed ${duplicatesRemoved} duplicate leads.`);
    
    // Show final state
    const finalResult = await pool.query(`
      SELECT id, name, phone, email, status, whatsapp_authorized, created_at
      FROM leads
      ORDER BY created_at DESC;
    `);
    
    console.log(`\n📋 Final state: ${finalResult.rows.length} leads remaining:\n`);
    finalResult.rows.forEach((lead, index) => {
      console.log(`${index + 1}. ${lead.name || 'Sin nombre'} - ${lead.phone} (WhatsApp: ${lead.whatsapp_authorized})`);
    });
    
  } catch (error) {
    console.error('❌ Error cleaning duplicates:', error.message);
  } finally {
    await pool.end();
  }
}

cleanDuplicates();
