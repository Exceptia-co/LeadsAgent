async function testRealWhatsApp() {
    console.log('🔍 Testing REAL WhatsApp sending...');
    
    try {
        // Verificar sesiones disponibles
        console.log('\n1️⃣ Checking available sessions...');
        const sessionsResponse = await fetch('http://localhost:3002/sessions');
        const sessionsData = await sessionsResponse.json();
        
        console.log('   Sessions available:', sessionsData.sessions?.length || 0);
        
        if (!sessionsData.sessions?.length) {
            console.log('❌ No WhatsApp sessions available');
            console.log('   Please create a WhatsApp session first via the dashboard or API');
            return;
        }
        
        const connectedSession = sessionsData.sessions.find(s => s.status === 'CONNECTED');
        
        if (!connectedSession) {
            console.log('❌ No CONNECTED sessions found');
            console.log('   Available sessions:', sessionsData.sessions.map(s => ({ id: s.id, status: s.status })));
            console.log('   Please connect a WhatsApp session first');
            return;
        }
        
        console.log('   Using connected session:', connectedSession.id);
        console.log('   Session phone number:', connectedSession.phoneNumber);
        
        // Obtener leads
        console.log('\n2️⃣ Getting leads...');
        const leadsResponse = await fetch('http://localhost:3002/leads');
        const leadsData = await leadsResponse.json();
        
        const testLead = leadsData.leads?.find(l => l.phone === '+34658333517');
        
        if (!testLead) {
            console.log('❌ Target lead with phone +34658333517 not found');
            console.log('   Available leads:', leadsData.leads?.map(l => ({ name: l.name, phone: l.phone })));
            return;
        }
        
        console.log('   Target lead found:', testLead.name, testLead.phone);
        console.log('   WhatsApp authorized:', testLead.whatsappAuthorized);
        
        // Enviar mensaje real
        console.log('\n3️⃣ Sending REAL WhatsApp message...');
        
        const testPayload = {
            leadId: testLead.id,
            sessionId: connectedSession.id, // Usar sesión real conectada
            content: `🚀 Mensaje de prueba real desde el sistema!\n\n¡Hola ${testLead.name}! Este es un mensaje enviado directamente a través de WhatsApp usando nuestra sesión conectada.\n\nFecha: ${new Date().toLocaleString()}\nSesión: ${connectedSession.id}`,
            variables: {
                nombre: testLead.name
            }
        };
        
        console.log('   Payload (real session):', {
            leadId: testPayload.leadId,
            sessionId: testPayload.sessionId,
            contentLength: testPayload.content.length,
            targetPhone: testLead.phone
        });
        
        const response = await fetch('http://localhost:3002/proactive-messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testPayload)
        });
        
        const result = await response.json();
        
        console.log('   Response status:', response.status);
        
        if (response.ok) {
            console.log('\n✅ SUCCESS! Message sent');
            console.log('   Message ID:', result.data?.messageId);
            console.log('   Proactive ID:', result.data?.proactiveMessageId);
            
            if (result.data?.messageId?.includes('demo') || result.data?.messageId?.includes('fallback')) {
                console.log('   ⚠️ Used demo/fallback mode (not real WhatsApp)');
            } else {
                console.log('   🎉 REAL WhatsApp message sent successfully!');
                console.log(`   🎯 Check your WhatsApp (${testLead.phone}) for the message!`);
            }
        } else {
            console.log('\n❌ FAILED!');
            console.log('   Error:', result.error);
        }
        
        // También probar envío directo para comparar
        console.log('\n4️⃣ Testing direct WhatsApp service for comparison...');
        
        try {
            const directResponse = await fetch(`http://localhost:3002/sessions/${connectedSession.id}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: testLead.phone,
                    message: '📱 Test directo desde la API de sesiones - ' + new Date().toLocaleTimeString()
                })
            });
            
            const directResult = await directResponse.json();
            console.log('   Direct send result:', directResult.success ? 'SUCCESS' : 'FAILED');
            
            if (directResult.success) {
                console.log(`   🎯 Direct message sent! Check WhatsApp (${testLead.phone})`);
            } else {
                console.log('   Direct send error:', directResult.error);
            }
        } catch (directError) {
            console.log('   Direct send failed:', directError.message);
        }
        
    } catch (error) {
        console.error('❌ MAIN ERROR:', error.message);
    }
}

testRealWhatsApp();
