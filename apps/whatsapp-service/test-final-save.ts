import * as path from 'path';
import * as dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Forzar DATABASE_URL si no está cargada
if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://postgres:PASSWORD_REMOVED@db.PROJECT_REF_REMOVED.supabase.co:5432/postgres';
}

import DatabaseService from './src/services/DatabaseService';

async function testFinalSave() {
    console.log('🔍 Testing final saveConversation...');
    console.log('DATABASE_URL configured:', !!process.env.DATABASE_URL);
    console.log('DATABASE_URL value (first 30 chars):', process.env.DATABASE_URL?.substring(0, 30) + '...');
    
    if (!process.env.DATABASE_URL) {
        console.log('❌ DATABASE_URL not found');
        return;
    }
    
    // Forzar reinicialización de la conexión
    console.log('🔄 Reinitializing database connection...');
    DatabaseService.reinitializeConnection();
    
    try {
        console.log('\n📋 Running final test with corrected saveConversation...');
        
        const testData = {
            phoneNumber: '+34658333517',
            messageText: 'Test final - mensaje corregido',
            responseText: 'Test final - respuesta corregida',
            isFromUser: true,
            sessionId: 'test-final-corrected',
            contactName: 'Test Corrected',
            messageType: 'text',
            intent: 'test_intent',
            sentiment: 'positive',
            aiProvider: 'openrouter' as const,
            tokensUsed: 30
        };
        
        console.log('Data to save:', {
            phone: testData.phoneNumber,
            message: testData.messageText.substring(0, 30) + '...',
            session: testData.sessionId,
            isFromUser: testData.isFromUser
        });
        
        const result = await DatabaseService.saveConversation(testData);
        
        if (result) {
            console.log('\n✅ SUCCESS! Conversation saved successfully:');
            console.log('   ID:', result);
            console.log('   Phone:', testData.phoneNumber);
            console.log('   Session:', testData.sessionId);
            console.log('   Is from user:', testData.isFromUser);
            
            // Test getConversations method
            console.log('\n📊 Testing getConversations method...');
            const conversations = await DatabaseService.getConversations(3, 0);
            console.log('   Total conversations found:', conversations.length);
            
            if (conversations.length > 0) {
                const latest = conversations[0];
                console.log('   Latest conversation:');
                console.log('     ID:', latest.id);
                console.log('     Lead phone:', latest.lead?.phone || 'N/A');
                console.log('     Last message:', latest.lastMessage?.content?.substring(0, 30) + '...' || 'N/A');
                console.log('     Unread count:', latest.unreadCount);
            }
            
            // Test conversation history
            console.log('\n📚 Testing getConversationHistory...');
            const history = await DatabaseService.getConversationHistory(testData.phoneNumber, 3);
            console.log('   History records:', history.length);
            if (history.length > 0) {
                console.log('   Latest history entry:');
                console.log('     Phone:', history[0].phone_number);
                console.log('     Message:', history[0].message_text?.substring(0, 30) + '...' || 'N/A');
                console.log('     Response:', history[0].response_text?.substring(0, 30) + '...' || 'N/A');
            }
            
            console.log('\n🎉 All tests PASSED! SaveConversation is working correctly.');
            
        } else {
            console.log('❌ FAILED: saveConversation returned null/undefined');
        }
        
    } catch (error: any) {
        console.error('\n❌ TEST FAILED with error:', error.message);
        if (error.code) {
            console.error('   Error code:', error.code);
        }
        if (error.stack) {
            console.error('   Stack trace:', error.stack.split('\n').slice(0, 5).join('\n'));
        }
    }
}

// Run the test
testFinalSave().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
