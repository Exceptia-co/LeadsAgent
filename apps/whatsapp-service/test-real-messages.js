async function testRealWhatsAppMessages() {
    console.log('🧪 Testing Real WhatsApp Message Sending...');
    
    const sessionId = 'real-session';
    
    try {
        // First, check if session is connected
        console.log('\n1️⃣ Checking session status...');
        const statusResponse = await fetch('http://localhost:3002/sessions');
        const statusData = await statusResponse.json();
        const session = statusData.sessions?.find(s => s.id === sessionId);
        
        if (!session) {
            console.log('❌ Session not found. Please create a session first.');
            return;
        }
        
        console.log(`   Status: ${session.status}`);
        console.log(`   Phone: ${session.phoneNumber || 'Not connected'}`);
        
        if (session.status !== 'CONNECTED' && session.status !== 'READY') {
            console.log('⚠️ Session is not connected yet. Please scan QR code first.');
            console.log('   Run: node show-qr.js');
            return;
        }
        
        console.log('✅ Session is connected! Proceeding with tests...');
        console.log(`   📱 Connected Phone: ${session.phoneNumber}`);
        
        // Test 1: Send message to yourself (if possible)
        console.log('\n2️⃣ Test 1: Attempting to get contacts...');
        try {
            const contactsResponse = await fetch(`http://localhost:3002/sessions/${sessionId}/contacts`);
            if (contactsResponse.ok) {
                const contactsData = await contactsResponse.json();
                console.log(`   Found ${contactsData.contacts?.length || 0} contacts`);
                
                // Show first few contacts (without revealing sensitive data)
                if (contactsData.contacts?.length > 0) {
                    console.log('   Sample contacts:');
                    contactsData.contacts.slice(0, 3).forEach((contact, idx) => {
                        console.log(`     ${idx + 1}. ${contact.name || 'No name'} (${contact.id.split('@')[0]}...)`);
                    });
                }
            } else {
                console.log('   Contacts endpoint not available or failed');
            }
        } catch (contactError) {
            console.log('   Could not fetch contacts:', contactError.message);
        }
        
        // Test 2: Test message to a specific number (you need to provide this)
        console.log('\n3️⃣ Test 2: Test message (Demo mode)');
        
        // Ask for a test number (this would be interactive in real usage)
        const testNumber = '1234567890'; // Replace with actual number for testing
        
        console.log(`   Testing message to: ${testNumber}`);
        console.log('   Note: Replace testNumber in script with real number for actual testing');
        
        // Test the proactive message endpoint that was having issues
        console.log('\n4️⃣ Test 3: Testing proactive message endpoint...');
        
        const proactivePayload = {
            phoneNumber: session.phoneNumber, // Send to self as test
            message: 'Hello! This is a test message from your LeadCRM WhatsApp integration. 🚀',
            sessionId: sessionId
        };
        
        console.log('   Payload:', JSON.stringify(proactivePayload, null, 2));
        
        const messageResponse = await fetch('http://localhost:3001/proactive-messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(proactivePayload)
        });
        
        console.log('   Response status:', messageResponse.status);
        const messageResult = await messageResponse.json();
        console.log('   Response:', JSON.stringify(messageResult, null, 2));
        
        if (messageResponse.ok && messageResult.success) {
            console.log('\n✅ Proactive message sent successfully!');
            console.log(`   Message ID: ${messageResult.data?.messageId}`);
        } else {
            console.log('\n❌ Failed to send proactive message');
            console.log('   Error:', messageResult.error);
        }
        
        // Test 4: Test with template (if available)
        console.log('\n5️⃣ Test 4: Testing with invalid template ID (should handle gracefully)...');
        
        const templatePayload = {
            phoneNumber: session.phoneNumber,
            message: 'Template test message',
            templateId: 'invalid-template-id',
            sessionId: sessionId
        };
        
        const templateResponse = await fetch('http://localhost:3001/proactive-messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(templatePayload)
        });
        
        console.log('   Template test status:', templateResponse.status);
        const templateResult = await templateResponse.json();
        console.log('   Template test result:', JSON.stringify(templateResult, null, 2));
        
        console.log('\n🎯 Test Summary:');
        console.log(`   Session Status: ${session.status}`);
        console.log(`   Phone Number: ${session.phoneNumber}`);
        console.log(`   Proactive Message: ${messageResponse.ok ? 'SUCCESS' : 'FAILED'}`);
        console.log(`   Template Handling: ${templateResponse.ok ? 'SUCCESS' : 'FAILED'}`);
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    }
}

// Check if we have command line arguments for phone number
if (process.argv.length > 2) {
    console.log('📞 Custom phone number provided:', process.argv[2]);
}

testRealWhatsAppMessages();
