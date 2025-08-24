async function debugProactiveError() {
    console.log('🔍 Debugging proactive messages error...');
    
    try {
        // Primero obtener un lead real
        console.log('\n1️⃣ Getting leads...');
        const leadsResponse = await fetch('http://localhost:3002/leads');
        const leadsData = await leadsResponse.json();
        
        console.log('   Leads response status:', leadsResponse.status);
        console.log('   Leads found:', leadsData.leads?.length || 0);
        
        if (!leadsData.success || !leadsData.leads?.length) {
            console.log('❌ No leads available for testing');
            return;
        }
        
        const testLead = leadsData.leads[0];
        console.log('   Using lead:', {
            id: testLead.id,
            name: testLead.name,
            phone: testLead.phone,
            whatsappAuthorized: testLead.whatsappAuthorized
        });
        
        // Verificar/autorizar el lead si es necesario
        if (!testLead.whatsappAuthorized) {
            console.log('\n2️⃣ Authorizing lead for WhatsApp...');
            const authResponse = await fetch(`http://localhost:3002/leads/${testLead.id}/whatsapp`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ whatsappAuthorized: true })
            });
            
            const authData = await authResponse.json();
            console.log('   Authorization result:', authData);
        }
        
        // Ahora intentar enviar el mensaje proactivo
        console.log('\n3️⃣ Sending proactive message...');
        
        // Probar varios payloads diferentes
        const testCases = [
            {
                name: 'Con templateId string (problema original)',
                payload: {
                    leadId: testLead.id,
                    templateId: 'default_welcome',
                    sessionId: 'demo-session',
                    content: 'Test message 1',
                    variables: { nombre: testLead.name || 'Usuario' }
                }
            },
            {
                name: 'Sin templateId',
                payload: {
                    leadId: testLead.id,
                    sessionId: 'demo-session',
                    content: 'Test message 2',
                    variables: { nombre: testLead.name || 'Usuario' }
                }
            },
            {
                name: 'Con templateId null',
                payload: {
                    leadId: testLead.id,
                    templateId: null,
                    sessionId: 'demo-session',
                    content: 'Test message 3',
                    variables: { nombre: testLead.name || 'Usuario' }
                }
            }
        ];
        
        for (const testCase of testCases) {
            console.log(`\n   Testing: ${testCase.name}`);
            console.log('   Payload:', JSON.stringify(testCase.payload, null, 2));
            
            try {
                const response = await fetch('http://localhost:3002/proactive-messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(testCase.payload)
                });
                
                const result = await response.json();
                
                console.log('   Status:', response.status);
                console.log('   Success:', response.ok);
                
                if (response.ok) {
                    console.log('   ✅ SUCCESS!');
                    console.log('   Message ID:', result.data?.messageId);
                } else {
                    console.log('   ❌ FAILED!');
                    console.log('   Error:', result.error);
                }
                
                // Mostrar solo los primeros caracteres de response large
                const responseStr = JSON.stringify(result, null, 2);
                if (responseStr.length > 500) {
                    console.log('   Response (truncated):', responseStr.substring(0, 500) + '...');
                } else {
                    console.log('   Response:', responseStr);
                }
                
            } catch (error) {
                console.log('   ❌ NETWORK ERROR:', error.message);
            }
            
            console.log('   ' + '='.repeat(60));
        }
        
    } catch (error) {
        console.error('❌ MAIN ERROR:', error.message);
        console.error(error.stack);
    }
}

debugProactiveError();
