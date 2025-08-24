// Usar fetch nativo de Node.js (18+)

async function testHttpProactive() {
    console.log('🔍 Testing HTTP POST to /proactive-messages...');
    
    // Datos que se envían desde el frontend
    const testData = {
        leadId: '3e6b9340-4bae-40d0-9454-985b2604fe66', // ID real del lead que obtuvimos
        templateId: 'default_welcome', // Este era el problema - no es UUID
        sessionId: 'demo-session',
        content: '¡Hola! Este es un mensaje de prueba desde el dashboard',
        variables: {
            nombre: 'Miguelito'
        }
    };
    
    console.log('📤 Payload:', JSON.stringify(testData, null, 2));
    
    try {
        const response = await fetch('http://localhost:3002/proactive-messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testData)
        });
        
        console.log('📥 Response status:', response.status);
        console.log('📥 Response statusText:', response.statusText);
        
        const result = await response.json();
        console.log('📥 Response body:', JSON.stringify(result, null, 2));
        
        if (response.ok) {
            console.log('✅ SUCCESS! The endpoint is working correctly now.');
        } else {
            console.log('❌ FAILED: Still getting error response');
        }
        
    } catch (error) {
        console.error('❌ NETWORK ERROR:', error.message);
        console.error('Make sure the WhatsApp service is running on port 3002');
    }
}

testHttpProactive();
