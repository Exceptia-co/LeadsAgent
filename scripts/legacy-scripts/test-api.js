// Script de prueba para la API de Leads
const http = require('http');

function testApiEndpoint(path, description) {
  return new Promise((resolve, reject) => {
    console.log(`\n🧪 Probando: ${description}`);
    console.log(`📡 Endpoint: http://localhost:3001${path}`);
    
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`📊 Status: ${res.statusCode}`);
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const jsonData = JSON.parse(data);
            console.log('✅ Response OK');
            console.log(`📋 Data preview:`, JSON.stringify(jsonData, null, 2).substring(0, 200) + '...');
            resolve({ status: res.statusCode, data: jsonData });
          } catch (e) {
            console.log('✅ Response OK (non-JSON)');
            console.log(`📋 Response:`, data.substring(0, 200) + '...');
            resolve({ status: res.statusCode, data: data });
          }
        } else {
          console.log(`❌ Error: ${res.statusCode}`);
          console.log(`📋 Error data:`, data);
          resolve({ status: res.statusCode, data: data, error: true });
        }
      });
    });

    req.on('error', (error) => {
      console.log(`❌ Connection error: ${error.message}`);
      reject(error);
    });

    req.setTimeout(5000, () => {
      console.log('⏱️  Timeout - API may not be running');
      reject(new Error('Timeout'));
    });

    req.end();
  });
}

async function runTests() {
  console.log('🚀 Iniciando pruebas de la API LeadsCRM');
  console.log('=' .repeat(50));
  
  const tests = [
    { path: '/', description: 'Health check endpoint' },
    { path: '/leads', description: 'Get all leads' },
    { path: '/leads/stats', description: 'Get leads statistics' },
  ];
  
  let passedTests = 0;
  let totalTests = tests.length;
  
  for (const test of tests) {
    try {
      const result = await testApiEndpoint(test.path, test.description);
      if (!result.error) {
        passedTests++;
      }
      
      // Esperar un poco entre requests
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.log(`❌ Test failed: ${error.message}`);
    }
  }
  
  console.log('\n' + '=' .repeat(50));
  console.log(`📊 Resultados: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 ¡Todos los tests pasaron! La API está funcionando correctamente.');
  } else {
    console.log('⚠️  Algunos tests fallaron. Revisa los logs de la API.');
  }
  
  console.log('\n💡 Para ver más detalles, revisa los logs de la API en la terminal.');
  console.log('💡 La documentación está disponible en: http://localhost:3001/api/docs');
}

// Dar tiempo a que la API se inicie
console.log('⏳ Esperando 8 segundos para que la API se inicie...');
setTimeout(() => {
  runTests().catch(console.error);
}, 8000);
