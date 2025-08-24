async function showWhatsAppQR() {
    console.log('📱 Fetching WhatsApp QR Code...');
    
    const sessionId = 'real-session';
    
    try {
        // Get QR code from API
        const response = await fetch(`http://localhost:3002/sessions/${sessionId}/qr`);
        const data = await response.json();
        
        console.log('Response status:', response.status);
        console.log('Response data:', JSON.stringify(data, null, 2));
        
        if (data.success && data.data && data.data.qrCode) {
            const qrCodeData = data.data.qrCode;
            
            console.log('\n🔍 QR Code Data received');
            console.log('Status:', data.data.status);
            console.log('\n🌐 Open this URL in your browser to see the QR code:');
            console.log(`http://localhost:3002/sessions/${sessionId}/qr`);
            
            console.log('\n📋 Instructions:');
            console.log('1. Open the URL above in your web browser');
            console.log('2. Open WhatsApp on your phone');
            console.log('3. Go to Settings > Linked Devices');
            console.log('4. Tap "Link a Device"');
            console.log('5. Scan the QR code from your browser');
            
            // Monitor connection status
            console.log('\n🔄 Monitoring connection status...');
            console.log('(Press Ctrl+C to stop monitoring)');
            
            for (let i = 0; i < 60; i++) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                const statusResponse = await fetch('http://localhost:3002/sessions');
                const statusData = await statusResponse.json();
                const session = statusData.sessions?.find(s => s.id === sessionId);
                
                if (session) {
                    const timestamp = new Date().toLocaleTimeString();
                    console.log(`   [${timestamp}] Status: ${session.status} | Phone: ${session.phoneNumber || 'Not connected'}`);
                    
                    if (session.status === 'CONNECTED' || session.status === 'READY') {
                        console.log('\n🎉 WhatsApp connected successfully!');
                        console.log(`   📱 Phone Number: ${session.phoneNumber}`);
                        console.log(`   ✅ Status: ${session.status}`);
                        
                        // Test a simple message after connection
                        console.log('\n🧪 Connection established! You can now test messaging.');
                        break;
                    }
                    
                    if (session.status === 'DISCONNECTED' || session.status === 'FAILED') {
                        console.log('\n❌ Session failed or disconnected');
                        console.log('   Please try creating a new session');
                        break;
                    }
                } else {
                    console.log('   ❌ Session not found');
                    break;
                }
            }
            
        } else {
            console.log('❌ No QR code available');
            console.log('Error:', data.error || 'Unknown error');
            
            // Check session status
            const statusResponse = await fetch('http://localhost:3002/sessions');
            const statusData = await statusResponse.json();
            console.log('\nCurrent sessions:', statusData.sessions);
        }
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    }
}

showWhatsAppQR();
