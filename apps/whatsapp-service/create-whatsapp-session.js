async function createWhatsAppSession() {
    console.log('🔍 Creating WhatsApp session for real message testing...');
    
    try {
        // Verificar estado actual
        console.log('\n1️⃣ Checking current sessions...');
        const currentResponse = await fetch('http://localhost:3002/sessions');
        const currentData = await currentResponse.json();
        
        console.log('   Current sessions:', currentData.sessions?.length || 0);
        if (currentData.sessions?.length) {
            console.log('   Existing sessions:', currentData.sessions.map(s => ({ 
                id: s.id, 
                status: s.status,
                phone: s.phoneNumber 
            })));
        }
        
        // Crear nueva sesión
        console.log('\n2️⃣ Creating new WhatsApp session...');
        
        const createResponse = await fetch('http://localhost:3002/sessions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId: 'real-session',
                name: 'Real WhatsApp Session for Testing'
            })
        });
        
        const createResult = await createResponse.json();
        
        console.log('   Creation status:', createResponse.status);
        console.log('   Creation result:', createResult);
        
        if (createResult.success) {
            console.log('\n✅ Session created successfully!');
            console.log('   Session ID:', createResult.session?.id);
            
            // Wait a moment for initialization
            console.log('\n3️⃣ Waiting for session initialization...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Check QR code
            console.log('\n4️⃣ Checking for QR code...');
            try {
                const qrResponse = await fetch(`http://localhost:3002/sessions/${createResult.session?.id}/qr`);
                const qrResult = await qrResponse.json();
                
                if (qrResult.success && qrResult.qr) {
                    console.log('   QR Code available! Open WhatsApp Web scanner and scan the QR');
                    console.log('   QR Code URL: http://localhost:3002/sessions/' + createResult.session?.id + '/qr');
                } else {
                    console.log('   No QR code available yet. Session might be connecting...');
                }
            } catch (qrError) {
                console.log('   Could not check QR code:', qrError.message);
            }
            
            // Check final status
            console.log('\n5️⃣ Final session status check...');
            const finalResponse = await fetch('http://localhost:3002/sessions');
            const finalData = await finalResponse.json();
            
            console.log('   Total sessions:', finalData.sessions?.length || 0);
            if (finalData.sessions?.length) {
                finalData.sessions.forEach(session => {
                    console.log(`   - ${session.id}: ${session.status} (Phone: ${session.phoneNumber || 'Not connected'})`);
                });
            }
            
        } else {
            console.log('\n❌ Failed to create session');
            console.log('   Error:', createResult.error);
        }
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    }
}

createWhatsAppSession();
