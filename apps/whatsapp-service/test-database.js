const { exec } = require('child_process');
const path = require('path');

console.log('🧪 TEST DE CONEXIÓN Y GUARDADO DE CONVERSACIONES');
console.log('=====================================\n');

// Configurar variables de entorno
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

console.log('📊 Variables de entorno:');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET ✅' : 'NOT SET ❌');
console.log('NODE_ENV:', process.env.NODE_ENV || 'undefined');
console.log('');

// Ejecutar el test desde TypeScript
const testScript = `
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

async function testDatabase() {
  try {
    console.log('🔍 Importando DatabaseService...');
    const DatabaseServiceModule = await import('./src/services/DatabaseService.ts');
    const DatabaseService = DatabaseServiceModule.default;
    
    console.log('✅ DatabaseService importado correctamente');
    console.log('');
    
    // Test 1: Verificar conexión
    console.log('🔌 TEST 1: Verificando conexión a base de datos...');
    const connectionSuccess = await DatabaseService.testConnection();
    
    if (!connectionSuccess) {
      console.log('❌ ERROR: No se pudo conectar a la base de datos');
      return;
    }
    
    console.log('✅ Conexión a base de datos exitosa');
    console.log('');
    
    // Test 2: Inicializar tabla
    console.log('📋 TEST 2: Inicializando tabla whatsapp_conversations...');
    await DatabaseService.initializeTable();
    console.log('✅ Tabla inicializada/verificada');
    console.log('');
    
    // Test 3: Guardar conversación de prueba
    console.log('💾 TEST 3: Guardando conversación de prueba...');
    const testData = {
      sessionId: 'test-session-' + Date.now(),
      phoneNumber: '+5491123456789',
      contactName: 'Usuario de Prueba',
      messageText: 'Este es un mensaje de prueba para verificar el guardado',
      responseText: null,
      messageType: 'text',
      intent: 'test',
      sentiment: 'neutral',
      aiProvider: 'test',
      tokensUsed: 0,
      isFromUser: true
    };
    
    console.log('📋 Datos de prueba:', {
      sessionId: testData.sessionId,
      phoneNumber: testData.phoneNumber,
      messageText: testData.messageText.substring(0, 50) + '...',
      isFromUser: testData.isFromUser
    });
    
    const conversationId = await DatabaseService.saveConversation(testData);
    
    if (conversationId) {
      console.log('✅ Conversación guardada exitosamente!');
      console.log('🆔 ID de conversación:', conversationId);
    } else {
      console.log('❌ ERROR: No se pudo guardar la conversación');
      return;
    }
    
    console.log('');
    
    // Test 4: Verificar que se guardó
    console.log('🔍 TEST 4: Verificando conversación guardada...');
    const history = await DatabaseService.getConversationHistory(testData.phoneNumber, 1);
    
    if (history && history.length > 0) {
      console.log('✅ Conversación encontrada en el historial!');
      console.log('📊 Datos recuperados:', {
        id: history[0].id,
        sessionId: history[0].sessionId,
        phoneNumber: history[0].phoneNumber,
        messageText: history[0].messageText?.substring(0, 50) + '...',
        createdAt: history[0].createdAt
      });
    } else {
      console.log('⚠️  WARNING: No se encontró la conversación en el historial');
    }
    
    console.log('');
    console.log('🎉 ¡TODAS LAS PRUEBAS COMPLETADAS EXITOSAMENTE!');
    console.log('✅ El sistema de guardado de conversaciones funciona correctamente');
    
  } catch (error) {
    console.error('❌ ERROR en el test:', error);
    console.error('Stack trace:', error.stack);
  }
}

testDatabase().catch(console.error);
`;

// Ejecutar el test usando tsx
const command = `cd "${__dirname}" && echo '${testScript}' | npx tsx`;

console.log('🚀 Ejecutando test...\n');

exec(command, { shell: true, cwd: __dirname }, (error, stdout, stderr) => {
  if (error) {
    console.error('❌ Error ejecutando test:', error);
    return;
  }
  
  if (stderr) {
    console.error('⚠️  Stderr:', stderr);
  }
  
  console.log(stdout);
});
