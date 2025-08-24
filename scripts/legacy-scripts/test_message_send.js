// No need to import fetch in Node.js 18+

async function testMessageSend() {
  try {
    console.log('🧪 Probando envío de mensaje...\n');
    
    // Primero obtener sesiones disponibles
    console.log('📋 Obteniendo sesiones disponibles...');
    const sessionsResponse = await fetch('http://localhost:3002/api/sessions');
    const sessionsData = await sessionsResponse.json();
    console.log('Sesiones:', JSON.stringify(sessionsData, null, 2));
    
    // Si hay sesiones disponibles, usar la primera
    if (sessionsData.sessions && sessionsData.sessions.length > 0) {
      const sessionId = sessionsData.sessions[0].id;
      console.log(`\n✅ Usando sesión: ${sessionId}\n`);
      
      // Probar envío de mensaje
      console.log('📤 Enviando mensaje de prueba...');
      const messagePayload = {
        sessionId: sessionId,
        to: '+34666777888',
        message: 'Mensaje de prueba desde la API'
      };
      
      console.log('Payload:', JSON.stringify(messagePayload, null, 2));
      
      const messageResponse = await fetch('http://localhost:3002/api/messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messagePayload)
      });
      
      const messageResult = await messageResponse.json();
      console.log('\n📨 Resultado del envío:', JSON.stringify(messageResult, null, 2));
      
    } else {
      console.log('⚠️ No hay sesiones disponibles. Crea una sesión primero.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testMessageSend();
