async function testDashboardSimulation() {
    console.log('🔍 Simulating exact dashboard behavior...');
    
    try {
        // Step 1: Get leads (like dashboard does)
        console.log('\n1️⃣ Getting leads...');
        const leadsResponse = await fetch('http://localhost:3002/leads');
        const leadsData = await leadsResponse.json();
        
        if (!leadsData.success || !leadsData.leads?.length) {
            console.log('❌ No leads available');
            return;
        }
        
        const selectedLead = leadsData.leads[0];
        console.log('   Selected lead:', selectedLead.id, selectedLead.name);
        
        // Step 2: Get sessions (like dashboard does)
        console.log('\n2️⃣ Getting sessions...');
        const sessionsResponse = await fetch('http://localhost:3002/sessions');
        const sessionsResult = await sessionsResponse.json();
        
        let sessionId = 'demo-session';
        
        if (sessionsResult.success && sessionsResult.sessions.length > 0) {
            sessionId = sessionsResult.sessions[0].id;
        }
        
        console.log('   Session ID to use:', sessionId);
        console.log('   Available sessions:', sessionsResult.sessions?.length || 0);
        
        // Step 3: Simulate different scenarios
        const scenarios = [
            {
                name: 'No template selected (selectedTemplate = null)',
                selectedTemplate: null,
                customMessage: 'Custom message without template',
                variables: {}
            },
            {
                name: 'Template with string ID (mock template)',
                selectedTemplate: { 
                    id: 'default_welcome',
                    name: 'Welcome Template',
                    content: 'Hello {{nombre}}!'
                },
                previewContent: 'Hello Miguelito!',
                variables: { nombre: selectedLead.name }
            },
            {
                name: 'Template with undefined ID',
                selectedTemplate: { 
                    id: undefined,
                    name: 'Broken Template'
                },
                previewContent: 'Test content',
                variables: {}
            }
        ];
        
        for (const scenario of scenarios) {
            console.log(`\n3️⃣ Testing scenario: ${scenario.name}`);
            
            // Simulate dashboard logic exactly
            const content = scenario.selectedTemplate ? 
                (scenario.previewContent || scenario.customMessage) : 
                scenario.customMessage;
            
            const payload = {
                leadId: selectedLead.id,
                templateId: scenario.selectedTemplate?.id,
                sessionId,
                content,
                variables: scenario.variables
            };
            
            console.log('   Payload:', JSON.stringify(payload, null, 2));
            
            try {
                const response = await fetch('http://localhost:3002/proactive-messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                console.log('   Status:', response.status, response.statusText);
                
                const result = await response.json();
                
                if (response.ok) {
                    console.log('   ✅ SUCCESS!');
                    console.log('   Message ID:', result.data?.messageId);
                } else {
                    console.log('   ❌ FAILED!');
                    console.log('   Error:', result.error);
                    
                    // Show full error response for debugging
                    console.log('   Full response:', JSON.stringify(result, null, 2));
                }
                
            } catch (error) {
                console.log('   ❌ NETWORK ERROR:', error.message);
            }
            
            console.log('   ' + '='.repeat(80));
        }
        
    } catch (error) {
        console.error('❌ MAIN ERROR:', error.message);
        console.error(error.stack);
    }
}

testDashboardSimulation();
