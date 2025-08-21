const { Client } = require('pg');

async function testConnection() {
  console.log('🔍 Testing database connection...');
  
  // URLs a probar (formato correcto según documentación Supabase)
  const urls = [
    {
      name: 'Transaction Mode Pooler (6543)',
      url: "postgresql://postgres.PROJECT_REF_REMOVED:CUyXQGfNf2u3Yd2p@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
    },
    {
      name: 'Session Mode Pooler (5432)',
      url: "postgresql://postgres.PROJECT_REF_REMOVED:CUyXQGfNf2u3Yd2p@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
    },
    {
      name: 'Transaction Mode (Alternative)',
      url: "postgresql://postgres.PROJECT_REF_REMOVED:CUyXQGfNf2u3Yd2p@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require"
    },
    {
      name: 'Direct Connection',
      url: "postgresql://postgres:CUyXQGfNf2u3Yd2p@db.PROJECT_REF_REMOVED.supabase.co:5432/postgres"
    }
  ];

  for (const { name, url } of urls) {
    console.log(`\n📡 Testing ${name}...`);
    
    try {
      const client = new Client({ connectionString: url });
      await client.connect();
      
      // Probar una consulta simple
      const result = await client.query('SELECT NOW() as current_time, version() as postgres_version;');
      console.log(`✅ ${name} - Connection successful!`);
      console.log(`   Time: ${result.rows[0].current_time}`);
      console.log(`   PostgreSQL: ${result.rows[0].postgres_version.split(' ')[0]}`);
      
      // Probar acceso a nuestras tablas
      const leadCount = await client.query('SELECT COUNT(*) as count FROM leads;');
      console.log(`   Leads count: ${leadCount.rows[0].count}`);
      
      await client.end();
      
      // Si esta URL funciona, actualizar la configuración
      console.log(`\n🎯 WORKING URL: ${url}`);
      break;
      
    } catch (error) {
      console.log(`❌ ${name} - Failed:`, error.message);
    }
  }
}

testConnection().catch(console.error);
