const { Pool } = require('pg');

async function createLead() {
  const pool = new Pool({
    connectionString: "postgresql://postgres:PFPxINx4EGXcp5WE@db.yxjzsargboxnuwnbuzax.supabase.co:5432/postgres",
    ssl: { rejectUnauthorized: false }
  });

  try {
    // First, check enum values for LeadStatus
    console.log('📋 Verificando valores enum LeadStatus...');
    const enumResult = await pool.query(`
      SELECT unnest(enum_range(NULL::"LeadStatus")) as enum_value;
    `);
    
    console.log('Valores válidos para LeadStatus:');
    enumResult.rows.forEach(row => {
      console.log(`- ${row.enum_value}`);
    });
    
    // First, check table structure
    console.log('\n📋 Verificando estructura de tabla leads...');
    const structure = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'leads' 
      ORDER BY ordinal_position;
    `);
    
    console.log('Columnas disponibles:');
    structure.rows.forEach(col => {
      console.log(`- ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
    });
    
    // Then try to insert with correct column names and enum values
    const firstEnumValue = enumResult.rows[0]?.enum_value || 'ACTIVE'; // Fallback
    const result = await pool.query(`
      INSERT INTO leads (name, phone, email, status, source, "createdAt", "updatedAt") 
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) 
      ON CONFLICT (phone) DO UPDATE SET 
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        "updatedAt" = NOW()
      RETURNING *;
    `, [
      'Dianita',
      '+34658333517',
      'dianita@test.com',
      firstEnumValue,
      'whatsapp'
    ]);

    console.log('✅ Lead creado exitosamente:');
    console.log(result.rows[0]);
  } catch (error) {
    console.error('❌ Error creando lead:', error.message);
  } finally {
    await pool.end();
  }
}

createLead();
