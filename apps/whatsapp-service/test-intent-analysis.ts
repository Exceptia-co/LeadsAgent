import AIService from './src/services/AIService';

async function testIntentAnalysis() {
  console.log('🧪 Prueba del análisis de intención mejorado...\n');

  const testMessages = [
    'hola',
    'gracias, no me interesa',
    'cuánto cuesta',
    'quiero registrarme',
    'tengo un problema',
    'buenos días',
    'no entiendo nada'
  ];

  for (const message of testMessages) {
    console.log(`🔍 Analizando: "${message}"`);
    
    try {
      const result = await AIService.analyzeIntent(message);
      
      console.log(`  ✅ Intención: ${result.intent}`);
      console.log(`  📊 Confianza: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`  😊 Sentimiento: ${result.sentiment}`);
      console.log(`  📝 Entidades: ${Object.keys(result.entities).length > 0 ? JSON.stringify(result.entities) : 'ninguna'}`);
      
    } catch (error) {
      console.log(`  ❌ Error: ${error}`);
    }
    
    console.log(''); // Línea en blanco
  }
  
  console.log('🎉 Prueba completada. Si no hay warnings de "Error parseando análisis de intención", la mejora funcionó correctamente.');
}

// Ejecutar la prueba
testIntentAnalysis().catch(console.error);
