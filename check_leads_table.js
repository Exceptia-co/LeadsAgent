const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTable() {
  try {
    console.log('🔍 Verificando estructura de la tabla leads...\n');
    
    // Obtener un registro de ejemplo
    const { data: sampleData, error: sampleError } = await supabase
      .from('leads')
      .select('*')
      .limit(1);
    
    if (sampleError) {
      console.error('Error obteniendo datos de ejemplo:', sampleError);
      return;
    }
    
    if (sampleData && sampleData.length > 0) {
      console.log('📊 Columnas disponibles en la tabla leads:');
      const columns = Object.keys(sampleData[0]);
      columns.forEach((col, index) => {
        console.log(`${index + 1}. ${col}`);
      });
      
      console.log('\n🔎 Verificando columna whatsappAuthorized...');
      const hasWhatsappAuth = columns.includes('whatsappAuthorized');
      console.log('¿Existe whatsappAuthorized?', hasWhatsappAuth ? '✅ SÍ' : '❌ NO');
      
      if (!hasWhatsappAuth) {
        console.log('\n🚨 ACCIÓN REQUERIDA:');
        console.log('Necesitas agregar la columna whatsappAuthorized a la tabla leads.');
        console.log('\n📝 Ejecuta este SQL en el editor SQL de Supabase:');
        console.log('ALTER TABLE leads ADD COLUMN "whatsappAuthorized" BOOLEAN DEFAULT FALSE;');
        console.log('\n🌐 Ve a: https://supabase.com/dashboard/project/[tu-proyecto]/sql');
      } else {
        console.log('\n✅ ¡Perfecto! La columna whatsappAuthorized ya existe.');
        
        // Mostrar algunos valores de ejemplo
        console.log('\n📋 Valores de ejemplo:');
        sampleData.slice(0, 3).forEach((lead, index) => {
          console.log(`Lead ${index + 1}: ${lead.name || 'Sin nombre'} - whatsappAuthorized: ${lead.whatsappAuthorized}`);
        });
      }
      
    } else {
      console.log('⚠️ No hay datos en la tabla leads para verificar la estructura.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkTable();
