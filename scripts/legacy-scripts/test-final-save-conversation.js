const path = require('path');

// Configurar dotenv desde la raíz del proyecto
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function testFinalSaveConversation() {
    console.log('🔍 Testing final saveConversation functionality...');
    console.log('DATABASE_URL configured:', !!process.env.DATABASE_URL);
    
    try {
        // Importar el DatabaseService corregido
        const { default: DatabaseService } = await import('./apps/whatsapp-service/src/services/DatabaseService.js');
        
        console.log('\n📋 Testing corrected saveConversation...');
        
        // Datos de test con los campos correctos (sin message_type)
        const testData = {
            phoneNumber: '+34658333517',
            messageText: 'Mensaje de prueba final',
            responseText: 'Respuesta de prueba final',
            isFromUser: true,
            sessionId: 'test-session-final',
            contactName: 'Test Contact Final',
            aiProvider: 'openrouter',
            inputTokens: 50,
            outputTokens: 75,
            totalTokens: 125
        };
        
        console.log('Test data:', {
            phoneNumber: testData.phoneNumber,
            messageText: testData.messageText.substring(0, 20) + '...',
            responseText: testData.responseText.substring(0, 20) + '...',
            isFromUser: testData.isFromUser,
            sessionId: testData.sessionId
        });
        
        const result = await DatabaseService.saveConversation(testData);
        
        if (result) {
            console.log('✅ Final test SUCCESSFUL! Conversation saved with ID:', result.id);
            console.log('   Created at:', result.created_at);
            console.log('   Phone:', result.phone_number);
            console.log('   Session:', result.session_id);
            
            // Verificar que se guardó correctamente consultando la base
            const saved = await DatabaseService.getConversationHistory(testData.phoneNumber, 1);
            console.log('\n📊 Verification query result:');
            console.log('   Records found:', saved.length);
            if (saved.length > 0) {
                console.log('   Last record phone:', saved[0].phone_number);
                console.log('   Last record session:', saved[0].session_id);
                console.log('   Last record created:', saved[0].created_at);
            }
            
        } else {
            console.log('❌ Final test FAILED: No result returned');
        }
        
    } catch (error) {
        console.error('❌ Final test FAILED with error:', error.message);
        if (error.code) {
            console.error('   Error code:', error.code);
        }
        console.error('   Stack:', error.stack);
    }
}

// Ejecutar el test
testFinalSaveConversation().catch(console.error);
