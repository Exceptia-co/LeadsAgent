// Test script para verificar el endpoint bulk-update-whatsapp
// Usamos fetch nativo disponible en Node.js 18+

async function testBulkUpdate() {
  const url = 'http://localhost:3000/api/public/leads/bulk-update-whatsapp';
  const testPayload = {
    leadIds: ['e69f7552-5c3c-488b-8728-2901b5e63940'], // ID real de Paquito
    whatsappAuthorized: false
  };

  try {
    console.log('🧪 Probando endpoint:', url);
    console.log('📦 Payload:', JSON.stringify(testPayload, null, 2));
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload)
    });

    console.log('\n📊 Resultado:');
    console.log('Status:', response.status, response.statusText);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));
    
    let responseData;
    const responseText = await response.text();
    console.log('Raw response:', responseText);
    
    try {
      responseData = JSON.parse(responseText);
      console.log('Parsed JSON:', JSON.stringify(responseData, null, 2));
    } catch (parseError) {
      console.log('❌ Error parsing JSON:', parseError.message);
      responseData = { rawResponse: responseText };
    }
    
    if (response.ok) {
      console.log('✅ Test exitoso - Endpoint funcionando correctamente');
    } else {
      console.log('❌ Test falló - Revisar configuración');
    }
    
  } catch (error) {
    console.error('💥 Error durante el test:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('🔌 El servidor no está corriendo en el puerto 3000');
      console.log('💡 Ejecuta: npm run dev en apps/dashboard');
    }
  }
}

// Ejecutar el test
if (require.main === module) {
  testBulkUpdate();
}

module.exports = { testBulkUpdate };
