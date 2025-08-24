async function monitorWhatsAppSession() {
    console.log('👀 Monitoring WhatsApp session status...');
    
    const sessionId = 'real-session';
    
    try {
        // Monitor session status and QR code availability
        for (let attempt = 1; attempt <= 10; attempt++) {
            console.log(`\n📋 Check ${attempt}/10:`);
            
            // Check session status
            const statusResponse = await fetch('http://localhost:3002/sessions');
            const statusData = await statusResponse.json();
            
            const session = statusData.sessions?.find(s => s.id === sessionId);
            
            if (session) {
                console.log(`   Session Status: ${session.status}`);
                console.log(`   Phone: ${session.phoneNumber || 'Not connected'}`);
                console.log(`   Last Seen: ${session.lastSeen || 'Unknown'}`);
                
                // If session is ready, we can try sending messages
                if (session.status === 'CONNECTED' || session.status === 'READY') {
                    console.log('\n🎉 Session is ready for messaging!');
                    console.log(`   Phone Number: ${session.phoneNumber}`);
                    break;
                }
                
                // Check for QR code if still connecting
                if (session.status === 'CONNECTING' || session.status === 'INITIALIZING') {
                    try {
                        const qrResponse = await fetch(`http://localhost:3002/sessions/${sessionId}/qr`);
                        const qrResult = await qrResponse.json();
                        
                        if (qrResult.success && qrResult.qr) {
                            console.log('   📱 QR Code Available!');
                            console.log('   🔗 QR URL: http://localhost:3002/sessions/' + sessionId + '/qr');
                            console.log('   👆 Open this URL in your browser and scan with WhatsApp');
                        } else if (qrResult.error) {
                            console.log('   ⚠️ QR Error:', qrResult.error);
                        } else {
                            console.log('   ⏳ No QR code yet, still initializing...');
                        }
                    } catch (qrError) {
                        console.log('   ❌ QR check failed:', qrError.message);
                    }
                }
                
            } else {
                console.log('   ❌ Session not found!');
                break;
            }
            
            // Wait before next check
            if (attempt < 10) {
                console.log('   ⏱️ Waiting 5 seconds...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        
        // Final status check
        console.log('\n🏁 Final Status Check:');
        const finalResponse = await fetch('http://localhost:3002/sessions');
        const finalData = await finalResponse.json();
        
        if (finalData.sessions?.length) {
            finalData.sessions.forEach(session => {
                console.log(`   📱 ${session.id}: ${session.status}`);
                if (session.phoneNumber) {
                    console.log(`      Phone: ${session.phoneNumber}`);
                }
            });
        }
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    }
}

monitorWhatsAppSession();
