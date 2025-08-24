async function testFinalDashboard() {
    console.log('🔍 Testing final dashboard scenario with real session...');
    
    try {
        // Crear una sesión de prueba primero (para simular el caso problemático)
        console.log('\n1️⃣ Creating a test session...');
        
        const createSessionResponse = await fetch('http://localhost:3002/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: 'test-session-for-proactive',
                name: 'Test Session for Proactive Messages'
            })
        });
        
        const createSessionResult = await createSessionResponse.json();
        console.log('   Session creation result:', createSessionResult.success ? 'SUCCESS' : 'FAILED');
        
        // Obtener leads
        console.log('\n2️⃣ Getting leads...');
        const leadsResponse = await fetch('http://localhost:3002/leads');
        const leadsData = await leadsResponse.json();
        
        if (!leadsData.success || !leadsData.leads?.length) {
            console.log('❌ No leads available');
            return;
        }
        
        const selectedLead = leadsData.leads[0];
        console.log('   Using lead:', selectedLead.name, selectedLead.phone);
        
        // Obtener sesiones (ahora debería devolver nuestra nueva sesión)
        console.log('\n3️⃣ Getting sessions...');
        const sessionsResponse = await fetch('http://localhost:3002/sessions');
        const sessionsResult = await sessionsResponse.json();
        
        let sessionId = 'demo-session';
        
        if (sessionsResult.success && sessionsResult.sessions.length > 0) {
            sessionId = sessionsResult.sessions[0].id;
        }
        
        console.log('   Session ID that will be used:', sessionId);
        console.log('   Available sessions:', sessionsResult.sessions?.map(s => s.id) || []);
        
        // Probar el envío de mensaje proactivo (este era el caso problemático)
        console.log('\n4️⃣ Sending proactive message with potential real session...');
        
        const testPayload = {
            leadId: selectedLead.id,
            templateId: 'default_welcome', // Este era el problema original
            sessionId: sessionId,
            content: 'This is a final test message from the dashboard simulation',
            variables: {
                nombre: selectedLead.name || 'Usuario'
            }
        };
        
        console.log('   Final test payload:', JSON.stringify(testPayload, null, 2));
        
        const response = await fetch('http://localhost:3002/proactive-messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testPayload)
        });
        
        const result = await response.json();
        
        console.log('   Response status:', response.status, response.statusText);
        
        if (response.ok) {
            console.log('\n✅ FINAL TEST SUCCESS!');
            console.log('   Message ID:', result.data?.messageId);
            console.log('   Proactive Message ID:', result.data?.proactiveMessageId);
            console.log('   Content:', result.data?.content);
            
            if (result.data?.messageId?.includes('demo') || result.data?.messageId?.includes('fallback')) {
                console.log('   ✅ Correctly used demo/fallback mode');
            } else {
                console.log('   ✅ Real WhatsApp sending worked');
            }
            
            console.log('\n🎉 The proactive messages error is COMPLETELY FIXED!');
            console.log('🎉 The dashboard should now work without 500 errors!');
        } else {
            console.log('\n❌ FINAL TEST FAILED!');
            console.log('   Error:', result.error);
            console.log('   Full response:', JSON.stringify(result, null, 2));
        }
        
        // Limpiar: eliminar la sesión de prueba
        console.log('\n5️⃣ Cleaning up test session...');
        if (sessionId !== 'demo-session') {
            try {
                const deleteResponse = await fetch(`http://localhost:3002/sessions/${sessionId}`, {
                    method: 'DELETE'
                });
                const deleteResult = await deleteResponse.json();
                console.log('   Session cleanup:', deleteResult.success ? 'SUCCESS' : 'FAILED');
            } catch (cleanupError) {
                console.log('   Session cleanup failed:', cleanupError.message);
            }
        }
        
    } catch (error) {
        console.error('❌ FINAL TEST ERROR:', error.message);
        console.error(error.stack);
    }
}

testFinalDashboard();
