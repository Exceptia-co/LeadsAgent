const path = require('path');

// Cargar variables desde el .env del proyecto
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function testFinalSave() {
    console.log('🔍 Testing final saveConversation...');
    console.log('DATABASE_URL:', !!process.env.DATABASE_URL);
    
    if (!process.env.DATABASE_URL) {
        console.log('❌ DATABASE_URL not found. Checking .env file...');
        return;
    }
    
    try {
        // Importar el DatabaseService corregido
        const { default: DatabaseService } = await import('./src/services/DatabaseService.js');
        
        console.log('\n📋 Running final test...');
        
        const testData = {
            phoneNumber: '+34658333517',
            messageText: 'Test final corregido',
            responseText: 'Respuesta final corregida',
            isFromUser: true,
            sessionId: 'test-final-session',
            contactName: 'Test Final',
            aiProvider: 'openrouter',
            inputTokens: 10,
            outputTokens: 15,
            totalTokens: 25
        };
        
        const result = await DatabaseService.saveConversation(testData);
        
        if (result) {
            console.log('✅ SUCCESS! Conversation saved:');
            console.log('   ID:', result.id);
            console.log('   Phone:', result.phone_number);
            console.log('   Created:', result.created_at);
            console.log('   Session:', result.session_id);
            
            // Probar también getConversations
            console.log('\n📊 Testing getConversations...');
            const conversations = await DatabaseService.getConversations(5, 0);
            console.log('   Found conversations:', conversations.length);
            if (conversations.length > 0) {
                console.log('   Latest:', {
                    id: conversations[0].id,
                    phone: conversations[0].lead?.phone || 'N/A',
                    lastMessage: conversations[0].lastMessage?.content?.substring(0, 20) || 'N/A'
                });
            }
        } else {
            console.log('❌ FAILED: No result returned');
        }
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
        console.error('Code:', error.code);
        console.error('Stack:', error.stack);
    }
}

testFinalSave().catch(console.error);
