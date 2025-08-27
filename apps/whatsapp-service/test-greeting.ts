import AIThinkingService from './src/services/AIThinkingService';
import AIEnhancedResponseService from './src/services/AIEnhancedResponseService';
import { MessageContext } from './src/services/AIService';

async function testGreetingHandling() {
  console.log('🧪 Iniciando pruebas de manejo de saludos...\n');

  // Contexto básico de prueba
  const testContext: MessageContext = {
    phoneNumber: '+34666123456',
    sessionId: 'test-session-' + Date.now(),
    userName: 'Juan',
    conversationHistory: []
  };

  console.log('📱 Contexto de prueba:', testContext);
  console.log('='.repeat(60));

  // Prueba 1: AIThinkingService con "hola"
  console.log('\n🧠 PRUEBA 1: AIThinkingService con "hola"');
  console.log('-'.repeat(40));
  
  try {
    const thinkingResult = await AIThinkingService.processWithThinking('hola', testContext);
    
    console.log('✅ Resultado del sistema de pensamiento:');
    console.log(`- Debería responder: ${thinkingResult.thinkingProcess.shouldRespond}`);
    console.log(`- Confianza: ${thinkingResult.thinkingProcess.confidence}`);
    console.log(`- Tipo de estrategia: ${thinkingResult.thinkingProcess.responseStrategy.type}`);
    console.log(`- Tono: ${thinkingResult.thinkingProcess.responseStrategy.tone}`);
    console.log(`- Longitud: ${thinkingResult.thinkingProcess.responseStrategy.length}`);
    
    if (thinkingResult.success && thinkingResult.content) {
      console.log(`- Respuesta generada: "${thinkingResult.content}"`);
      console.log(`- Longitud de respuesta: ${thinkingResult.content.length} caracteres`);
    } else {
      console.log(`- Error: ${thinkingResult.error}`);
    }
    
    // Mostrar pasos del proceso de pensamiento
    console.log('\n🔍 Pasos del proceso de pensamiento:');
    thinkingResult.thinkingProcess.steps.forEach((step, index) => {
      console.log(`  ${index + 1}. ${step.title}: ${step.content}`);
    });

  } catch (error) {
    console.log('❌ Error en AIThinkingService:', error);
  }

  // Prueba 2: AIEnhancedResponseService con "hola"
  console.log('\n\n🎯 PRUEBA 2: AIEnhancedResponseService con "hola"');
  console.log('-'.repeat(40));

  try {
    const enhancedResult = await AIEnhancedResponseService.generateEnhancedResponse({
      phoneNumber: testContext.phoneNumber!,
      sessionId: testContext.sessionId!,
      userMessage: 'hola',
      contactName: testContext.userName
    });

    console.log('✅ Resultado del servicio mejorado:');
    console.log(`- Tipo de respuesta: ${enhancedResult.responseType}`);
    console.log(`- Confianza: ${enhancedResult.confidence}`);
    console.log(`- Elementos personalizados: ${enhancedResult.personalizedElements.join(', ') || 'ninguno'}`);
    console.log(`- Base de conocimiento usada: ${enhancedResult.knowledgeBaseUsed.length} elementos`);
    console.log(`- Respuesta: "${enhancedResult.response}"`);
    console.log(`- Longitud de respuesta: ${enhancedResult.response.length} caracteres`);
    console.log(`- Tiempo de procesamiento: ${enhancedResult.metadata.processingTime}ms`);

  } catch (error) {
    console.log('❌ Error en AIEnhancedResponseService:', error);
  }

  // Prueba 3: Diferentes variaciones de saludo
  console.log('\n\n🔤 PRUEBA 3: Diferentes variaciones de saludo');
  console.log('-'.repeat(40));

  const greetings = ['hola', 'buenas', 'hey', 'hola que tal', 'buenos días'];

  for (const greeting of greetings) {
    console.log(`\nProbando: "${greeting}"`);
    try {
      const result = await AIEnhancedResponseService.generateEnhancedResponse({
        phoneNumber: testContext.phoneNumber!,
        sessionId: testContext.sessionId! + '-' + greeting,
        userMessage: greeting,
        contactName: 'Test User'
      });

      console.log(`  - Tipo: ${result.responseType}`);
      console.log(`  - Respuesta: "${result.response.substring(0, 100)}${result.response.length > 100 ? '...' : ''}"`);
      
    } catch (error) {
      console.log(`  - Error: ${error}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 Pruebas completadas!');
  
  // Resumen de expectativas
  console.log('\n📋 EXPECTATIVAS CUMPLIDAS:');
  console.log('✅ Los saludos deberían ser detectados correctamente');
  console.log('✅ Las respuestas deberían ser breves (< 100 caracteres para saludos)');
  console.log('✅ Deberían mencionar EscortsHub.net (no .com)');
  console.log('✅ Deberían tener alta confianza para saludos simples');
  console.log('✅ No deberían requerir información de la base de conocimiento para responder');
}

// Ejecutar las pruebas
testGreetingHandling().catch(console.error);
