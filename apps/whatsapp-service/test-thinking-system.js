#!/usr/bin/env node

/**
 * Script de Prueba del Sistema de Pensamiento Estructurado
 * 
 * Este script simula diferentes tipos de mensajes para probar
 * el nuevo sistema de pensamiento de la IA.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Mock de servicios para testing
const mockServices = {
  DatabaseService: {
    searchKnowledgeBase: async (query) => {
      console.log(`📚 [MOCK] Buscando conocimiento para: "${query}"`);
      
      // Simular conocimiento relevante basado en query
      if (query.toLowerCase().includes('precio') || query.toLowerCase().includes('coste')) {
        return [
          {
            id: 'pricing_info',
            title: 'Información de Precios EscortsHub',
            content: 'Paquete Plus: 500 HUB por 300€ (mejor precio). Anuncio Doble Top: 900 HUB por 30 días.',
            category: 'pricing',
            priority: 10
          }
        ];
      }
      
      if (query.toLowerCase().includes('hola') || query.toLowerCase().includes('saludo')) {
        return [
          {
            id: 'greeting_info',
            title: 'Mensajes de Saludo',
            content: 'Responder de manera amigable y profesional a los saludos.',
            category: 'social',
            priority: 5
          }
        ];
      }
      
      return [];
    },
    
    getKnowledgeBase: async (category) => {
      console.log(`📚 [MOCK] Obteniendo knowledge base para categoría: ${category}`);
      return [];
    },
    
    getConversationHistory: async (phoneNumber, limit) => {
      console.log(`💬 [MOCK] Obteniendo historial para ${phoneNumber} (límite: ${limit})`);
      return [
        {
          messageText: 'Mensaje anterior del usuario',
          responseText: null,
          intent: 'general',
          createdAt: new Date(Date.now() - 3600000), // 1 hora atrás
          isFromUser: true
        }
      ];
    },
    
    getAllLeads: async () => {
      return [
        {
          id: '1',
          name: 'Juan Pérez',
          phone: '+5491123456789',
          whatsappAuthorized: true
        }
      ];
    },
    
    getAIConfiguration: async (key) => {
      const configs = {
        'system_prompt': 'Eres un asistente virtual profesional de EscortsHub...'
      };
      return configs[key] || null;
    }
  },
  
  AIService: {
    generateResponse: async (message, context) => {
      console.log(`🤖 [MOCK] Generando respuesta para: "${message}"`);
      
      // Simular respuestas diferentes según el mensaje
      const responses = {
        'hola': '¡Hola! 👋 Bienvenido a EscortsHub. ¿En qué puedo ayudarte?',
        'precios': '💰 Nuestros precios: Paquete Plus 500 HUB por 300€ (¡mejor oferta!)',
        'queja': 'Entiendo tu preocupación. Un supervisor se pondrá en contacto contigo pronto.',
        'default': 'Gracias por tu mensaje. ¿Hay algo específico en lo que pueda ayudarte?'
      };
      
      const responseContent = responses[message.toLowerCase()] || responses.default;
      
      return {
        success: true,
        content: responseContent,
        provider: 'mock',
        tokensUsed: Math.floor(Math.random() * 100) + 50
      };
    },
    
    analyzeIntent: async (message) => {
      console.log(`🔍 [MOCK] Analizando intención para: "${message}"`);
      
      const intentMap = {
        'hola': { intent: 'greeting', confidence: 0.95, sentiment: 'positive' },
        'buenos días': { intent: 'greeting', confidence: 0.9, sentiment: 'positive' },
        'precios': { intent: 'pricing_inquiry', confidence: 0.9, sentiment: 'neutral' },
        'cuánto cuesta': { intent: 'pricing_inquiry', confidence: 0.85, sentiment: 'neutral' },
        'queja': { intent: 'complaint', confidence: 0.8, sentiment: 'negative' },
        'problema': { intent: 'complaint', confidence: 0.75, sentiment: 'negative' },
        'ayuda': { intent: 'information_request', confidence: 0.7, sentiment: 'neutral' }
      };
      
      const messageLower = message.toLowerCase();
      for (const [keyword, analysis] of Object.entries(intentMap)) {
        if (messageLower.includes(keyword)) {
          return {
            ...analysis,
            entities: {},
            confidence: analysis.confidence + (Math.random() * 0.1 - 0.05) // Pequeña variación
          };
        }
      }
      
      return {
        intent: 'general',
        confidence: 0.6,
        entities: {},
        sentiment: 'neutral'
      };
    },
    
    getCurrentProvider: () => 'mock'
  }
};

// Función principal de prueba
async function testThinkingSystem() {
  console.log('🧠 INICIANDO PRUEBAS DEL SISTEMA DE PENSAMIENTO ESTRUCTURADO\n');
  console.log('=' .repeat(80));
  
  try {
    // Cargar el servicio de pensamiento - cambiar a TypeScript
    const { default: AIThinkingService } = await import('./src/services/AIThinkingService.ts');
    
    // Casos de prueba
    const testCases = [
      {
        name: 'Saludo Simple',
        message: 'Hola',
        context: {
          phoneNumber: '+5491123456789',
          sessionId: 'test-session',
          from: 'test-user'
        },
        expectedIntent: 'greeting',
        expectedShouldRespond: true
      },
      {
        name: 'Consulta de Precios',
        message: 'Quiero saber cuánto cuesta el anuncio premium',
        context: {
          phoneNumber: '+5491123456789',
          sessionId: 'test-session', 
          from: 'test-user'
        },
        expectedIntent: 'pricing_inquiry',
        expectedShouldRespond: true
      },
      {
        name: 'Queja o Problema',
        message: 'Tengo un problema grave con mi cuenta, necesito ayuda urgente',
        context: {
          phoneNumber: '+5491123456789',
          sessionId: 'test-session',
          from: 'test-user'
        },
        expectedIntent: 'complaint',
        expectedShouldRespond: false // Debería escalar a humano
      },
      {
        name: 'Mensaje Confuso',
        message: 'xyz123 asdflkjh qwerty',
        context: {
          phoneNumber: '+5491123456789',
          sessionId: 'test-session',
          from: 'test-user'
        },
        expectedIntent: 'general',
        expectedShouldRespond: false // Baja confianza
      },
      {
        name: 'Pregunta Específica',
        message: '¿Cuál es la diferencia entre el anuncio doble y el anuncio top?',
        context: {
          phoneNumber: '+5491123456789',
          sessionId: 'test-session',
          from: 'test-user'
        },
        expectedIntent: 'product_inquiry',
        expectedShouldRespond: true
      }
    ];
    
    // Ejecutar pruebas
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      
      console.log(`\n🧪 PRUEBA ${i + 1}: ${testCase.name}`);
      console.log('-'.repeat(50));
      console.log(`📝 Mensaje: "${testCase.message}"`);
      
      const startTime = Date.now();
      
      try {
        const result = await AIThinkingService.processWithThinking(
          testCase.message, 
          testCase.context
        );
        
        const processingTime = Date.now() - startTime;
        
        console.log(`\n🧠 RESULTADO DEL PENSAMIENTO:`);
        console.log(`   ⏱️  Tiempo total: ${processingTime}ms`);
        console.log(`   🎯 Decisión: ${result.thinkingProcess.shouldRespond ? '✅ RESPONDER' : '❌ NO RESPONDER'}`);
        console.log(`   📊 Confianza: ${(result.thinkingProcess.confidence * 100).toFixed(1)}%`);
        console.log(`   🔄 Complejidad: ${result.thinkingProcess.estimatedComplexity.toUpperCase()}`);
        console.log(`   📋 Pasos ejecutados: ${result.thinkingProcess.steps.length}`);
        
        // Mostrar pasos detallados
        console.log(`\n🔍 PASOS DEL PENSAMIENTO:`);
        result.thinkingProcess.steps.forEach((step, index) => {
          console.log(`   ${step.step}. [${step.type.toUpperCase()}] ${step.title}`);
          console.log(`      📝 ${step.content}`);
          console.log(`      📊 Confianza: ${(step.confidence * 100).toFixed(1)}%`);
          if (step.data && typeof step.data === 'object') {
            const dataKeys = Object.keys(step.data);
            if (dataKeys.length > 0) {
              console.log(`      🗂️  Datos: ${dataKeys.join(', ')}`);
            }
          }
        });
        
        // Mostrar estrategia de respuesta
        const strategy = result.thinkingProcess.responseStrategy;
        console.log(`\n🎭 ESTRATEGIA DE RESPUESTA:`);
        console.log(`   🎨 Tipo: ${strategy.type}`);
        console.log(`   🗣️  Tono: ${strategy.tone}`);
        console.log(`   📏 Longitud: ${strategy.length}`);
        console.log(`   📄 Quote: ${strategy.shouldQuote ? 'Sí' : 'No'}`);
        console.log(`   😀 Emojis: ${strategy.shouldUseEmojis ? 'Sí' : 'No'}`);
        console.log(`   ⚡ Prioridad: ${strategy.priority}`);
        
        // Mostrar respuesta si la hay
        if (result.success && result.content) {
          console.log(`\n💬 RESPUESTA GENERADA:`);
          console.log(`   "${result.content}"`);
          console.log(`   📊 Tokens usados: ${result.tokensUsed || 'N/A'}`);
          console.log(`   🤖 Proveedor: ${result.provider}`);
        }
        
        // Validar resultado contra expectativas
        console.log(`\n✅ VALIDACIÓN:`);
        const intentStep = result.thinkingProcess.steps.find(s => s.title.includes('Intención'));
        const detectedIntent = intentStep?.data?.intent || 'unknown';
        
        console.log(`   🎯 Intención esperada: ${testCase.expectedIntent} | Detectada: ${detectedIntent}`);
        console.log(`   📝 Respuesta esperada: ${testCase.expectedShouldRespond ? 'Sí' : 'No'} | Real: ${result.thinkingProcess.shouldRespond ? 'Sí' : 'No'}`);
        
        const intentMatch = detectedIntent === testCase.expectedIntent || detectedIntent.includes(testCase.expectedIntent);
        const responseMatch = result.thinkingProcess.shouldRespond === testCase.expectedShouldRespond;
        
        if (intentMatch && responseMatch) {
          console.log(`   🎉 PRUEBA EXITOSA`);
        } else {
          console.log(`   ⚠️  PRUEBA PARCIAL: ${intentMatch ? 'Intención correcta' : 'Intención incorrecta'}, ${responseMatch ? 'Decisión correcta' : 'Decisión incorrecta'}`);
        }
        
      } catch (error) {
        console.log(`\n❌ ERROR EN LA PRUEBA:`);
        console.error(`   ${error.message}`);
      }
      
      console.log('\n' + '='.repeat(80));
    }
    
    console.log('\n🏁 PRUEBAS COMPLETADAS');
    console.log('💡 Para habilitar el sistema de pensamiento en producción:');
    console.log('   1. El sistema ya está integrado en WhatsAppServiceSimple.ts');
    console.log('   2. Los mensajes automáticamente usarán el nuevo sistema');
    console.log('   3. Los logs mostrarán el proceso de pensamiento detallado');
    console.log('   4. Las respuestas serán más inteligentes y contextuales');
    
  } catch (error) {
    console.error('💥 Error ejecutando las pruebas:', error);
  }
}

// Mock de módulos para evitar dependencias
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  if (id.endsWith('/DatabaseService')) {
    return { default: mockServices.DatabaseService };
  }
  if (id.endsWith('/AIService')) {
    return { default: mockServices.AIService };
  }
  return originalRequire.apply(this, arguments);
};

// Ejecutar las pruebas
if (require.main === module) {
  testThinkingSystem().catch(console.error);
}

module.exports = { testThinkingSystem };
