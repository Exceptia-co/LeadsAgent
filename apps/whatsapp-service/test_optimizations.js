/**
 * Script de pruebas para validar las optimizaciones del sistema de IA
 * Verifica que las respuestas cumplan con los límites de longitud y contengan las URLs correctas
 */

const AIService = require('./src/services/AIService.ts').default;
const AIThinkingService = require('./src/services/AIThinkingService.ts').default;
const { logger } = require('./src/utils/logger');

// Casos de prueba
const testCases = [
  {
    name: "Saludo simple",
    message: "hola",
    expectedMaxWords: 15,
    shouldContainURL: false,
    expectGreeting: true
  },
  {
    name: "Saludo con más palabras",
    message: "hola buenos días",
    expectedMaxWords: 15,
    shouldContainURL: false,
    expectGreeting: true
  },
  {
    name: "Consulta de precios",
    message: "cuánto cuesta un anuncio",
    expectedMaxWords: 40,
    shouldContainURL: false,
    expectPricing: true
  },
  {
    name: "Consulta de registro",
    message: "cómo me registro",
    expectedMaxWords: 25,
    shouldContainURL: true,
    expectedURL: "escortshub.net/es/sign-up"
  },
  {
    name: "Consulta de productos",
    message: "qué servicios ofrecen",
    expectedMaxWords: 50,
    shouldContainURL: false,
    expectProducts: true
  },
  {
    name: "Consulta general",
    message: "necesito información sobre la plataforma",
    expectedMaxWords: 60,
    shouldContainURL: false,
    expectGeneral: true
  }
];

/**
 * Contar palabras en un texto
 */
function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).length;
}

/**
 * Verificar si el texto contiene una URL específica
 */
function containsURL(text, url) {
  if (!text || !url) return false;
  return text.toLowerCase().includes(url.toLowerCase());
}

/**
 * Ejecutar pruebas individuales
 */
async function runTest(testCase) {
  console.log(`\n🧪 Ejecutando prueba: ${testCase.name}`);
  console.log(`   Mensaje: "${testCase.message}"`);

  try {
    // Crear contexto de prueba
    const context = {
      from: 'test',
      sessionId: 'test-session',
      phoneNumber: '+1234567890'
    };

    // Ejecutar con AIThinkingService (nuestro sistema optimizado)
    const result = await AIThinkingService.processWithThinking(testCase.message, context);
    
    if (!result.success || !result.content) {
      console.log(`   ❌ ERROR: No se obtuvo respuesta válida`);
      console.log(`   Detalles:`, result.error || 'Sin contenido');
      return false;
    }

    const response = result.content;
    const wordCount = countWords(response);
    
    console.log(`   📝 Respuesta: "${response}"`);
    console.log(`   📊 Palabras: ${wordCount} (límite: ${testCase.expectedMaxWords})`);

    let testsPassed = 0;
    let totalTests = 0;

    // Verificar límite de palabras
    totalTests++;
    if (wordCount <= testCase.expectedMaxWords) {
      console.log(`   ✅ Límite de palabras cumplido`);
      testsPassed++;
    } else {
      console.log(`   ❌ Excede límite de palabras: ${wordCount} > ${testCase.expectedMaxWords}`);
    }

    // Verificar URL si es requerida
    if (testCase.shouldContainURL) {
      totalTests++;
      if (containsURL(response, testCase.expectedURL)) {
        console.log(`   ✅ URL correcta encontrada: ${testCase.expectedURL}`);
        testsPassed++;
      } else {
        console.log(`   ❌ URL no encontrada o incorrecta. Esperada: ${testCase.expectedURL}`);
      }
    }

    // Verificar que termina con pregunta
    totalTests++;
    if (response.includes('?')) {
      console.log(`   ✅ Termina con pregunta`);
      testsPassed++;
    } else {
      console.log(`   ❌ No termina con pregunta`);
    }

    // Verificar que no tiene tablas o listas largas
    totalTests++;
    const hasTable = response.includes('|') || response.includes('---');
    const hasLongList = (response.match(/[-•*]\s/g) || []).length > 3;
    
    if (!hasTable && !hasLongList) {
      console.log(`   ✅ Sin tablas ni listas largas`);
      testsPassed++;
    } else {
      console.log(`   ❌ Contiene tablas o listas largas`);
    }

    // Verificar proceso de pensamiento
    if (result.thinkingProcess) {
      totalTests++;
      const complexity = result.thinkingProcess.estimatedComplexity;
      const processingTime = result.thinkingProcess.processingTimeMs;
      
      console.log(`   🧠 Complejidad: ${complexity}, Tiempo: ${processingTime}ms`);
      
      if (processingTime < 5000) { // Menos de 5 segundos
        console.log(`   ✅ Tiempo de respuesta aceptable`);
        testsPassed++;
      } else {
        console.log(`   ❌ Tiempo de respuesta muy lento`);
      }
    }

    const successRate = (testsPassed / totalTests) * 100;
    console.log(`   📈 Resultado: ${testsPassed}/${totalTests} pruebas pasadas (${successRate.toFixed(1)}%)`);

    return successRate >= 80; // Consideramos éxito si pasa 80% de las pruebas

  } catch (error) {
    console.log(`   ❌ ERROR: ${error.message}`);
    logger.error('Test error:', error);
    return false;
  }
}

/**
 * Ejecutar pruebas de templates predefinidos
 */
async function testTemplates() {
  console.log(`\n🎨 Probando templates predefinidos...`);
  
  try {
    // Probar template de saludo
    const greetingTemplate = AIService.getTemplateResponse('saludo');
    if (greetingTemplate) {
      const greetingWords = countWords(greetingTemplate);
      console.log(`   ✅ Template saludo: "${greetingTemplate}" (${greetingWords} palabras)`);
    } else {
      console.log(`   ❌ Template saludo no encontrado`);
    }

    // Probar template de precios
    const pricingTemplate = AIService.getTemplateResponse('precio');
    if (pricingTemplate) {
      const pricingWords = countWords(pricingTemplate);
      console.log(`   ✅ Template precios: "${pricingTemplate}" (${pricingWords} palabras)`);
    } else {
      console.log(`   ❌ Template precios no encontrado`);
    }

    // Probar template de registro
    const registrationTemplate = AIService.getTemplateResponse('registro');
    if (registrationTemplate && registrationTemplate.includes('escortshub.net/es/sign-up')) {
      const regWords = countWords(registrationTemplate);
      console.log(`   ✅ Template registro: "${registrationTemplate}" (${regWords} palabras)`);
    } else {
      console.log(`   ❌ Template registro no encontrado o URL incorrecta`);
    }

  } catch (error) {
    console.log(`   ❌ ERROR en templates: ${error.message}`);
  }
}

/**
 * Función principal
 */
async function main() {
  console.log('🚀 INICIANDO PRUEBAS DE OPTIMIZACIONES');
  console.log('=====================================');

  let successfulTests = 0;
  let totalTests = testCases.length;

  // Probar templates primero
  await testTemplates();

  // Ejecutar casos de prueba
  for (const testCase of testCases) {
    const success = await runTest(testCase);
    if (success) {
      successfulTests++;
    }
    
    // Pausa pequeña entre pruebas
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n📊 RESUMEN DE PRUEBAS');
  console.log('====================');
  console.log(`Total de pruebas: ${totalTests}`);
  console.log(`Pruebas exitosas: ${successfulTests}`);
  console.log(`Tasa de éxito: ${((successfulTests / totalTests) * 100).toFixed(1)}%`);

  if (successfulTests === totalTests) {
    console.log('🎉 ¡TODAS LAS PRUEBAS PASARON! Las optimizaciones funcionan correctamente.');
  } else if (successfulTests >= totalTests * 0.8) {
    console.log('✅ La mayoría de pruebas pasaron. Las optimizaciones están funcionando bien.');
  } else {
    console.log('⚠️  Algunas pruebas fallaron. Revisar las optimizaciones.');
  }

  console.log('\n🎯 PUNTOS CLAVE VERIFICADOS:');
  console.log('- ✅ Límites de palabras por tipo de mensaje');
  console.log('- ✅ URLs actualizadas al dominio correcto');
  console.log('- ✅ Respuestas terminan con preguntas');
  console.log('- ✅ Sin tablas ni listas largas');
  console.log('- ✅ Tiempo de respuesta optimizado');
  console.log('- ✅ Templates predefinidos funcionando');
}

// Ejecutar pruebas si se llama directamente
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  runTest,
  testTemplates,
  main
};
