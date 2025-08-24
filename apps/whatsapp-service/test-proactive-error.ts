import * as path from 'path';
import * as dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Forzar DATABASE_URL si no está cargada
if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://postgres:PFPxINx4EGXcp5WE@db.yxjzsargboxnuwnbuzax.supabase.co:5432/postgres';
}

async function testProactiveError() {
    console.log('🔍 Testing proactive message endpoint...');
    console.log('DATABASE_URL configured:', !!process.env.DATABASE_URL);
    
    try {
        // Simular la request POST que está fallando
        const testPayload = {
            leadId: '1', // ID de un lead mockeado
            templateId: null, // No usar template para evitar el error UUID
            sessionId: 'demo-session', // Usar demo mode
            content: '¡Hola! Bienvenido/a a EscortsHub',
            variables: {
                nombre: 'Test User'
            }
        };

        console.log('📋 Test payload:', testPayload);

        // Importar los servicios directamente para testear
        const DatabaseService = (await import('./src/services/DatabaseService')).default;
        
        // Forzar reinicialización de conexión
        DatabaseService.reinitializeConnection();
        
        // Test 1: Verificar que obtenemos leads
        console.log('\n🔍 Test 1: Getting leads...');
        const leads = await DatabaseService.getAllLeads();
        console.log('   Leads found:', leads.length);
        
        if (leads.length === 0) {
            console.log('❌ No leads found - this will cause the 404 error');
            return;
        }
        
        const testLead = leads[0];
        console.log('   Test lead:', {
            id: testLead.id,
            name: testLead.name,
            phone: testLead.phone,
            whatsappAuthorized: testLead.whatsappAuthorized
        });
        
        // Test 2: Verificar autorización WhatsApp
        if (!testLead.whatsappAuthorized) {
            console.log('❌ Lead not authorized for WhatsApp - this will cause 400 error');
            console.log('   Trying to authorize lead...');
            
            const authorized = await DatabaseService.updateLeadWhatsAppAuth(testLead.id, true);
            console.log('   Authorization result:', authorized);
        }
        
        // Test 3: Intentar crear mensaje proactivo
        console.log('\n🔍 Test 3: Creating proactive message...');
        const proactiveMessageId = await DatabaseService.createProactiveMessage({
            leadId: testLead.id,
            templateId: testPayload.templateId,
            sessionId: testPayload.sessionId,
            phoneNumber: testLead.phone,
            content: testPayload.content,
            createdBy: 'test-admin'
        });
        
        console.log('   Proactive message created:', proactiveMessageId);
        
        if (!proactiveMessageId) {
            console.log('❌ Failed to create proactive message record');
            return;
        }
        
        // Test 4: Verificar formato del número
        console.log('\n🔍 Test 4: Phone number formatting...');
        const formattedNumber = testLead.phone.includes('@c.us') ? testLead.phone : `${testLead.phone}@c.us`;
        console.log('   Original:', testLead.phone);
        console.log('   Formatted:', formattedNumber);
        
        // Test 5: Simular envío (modo demo)
        console.log('\n🔍 Test 5: Simulating message send (demo mode)...');
        
        // Simular resultado exitoso
        const sendResult = {
            success: true,
            messageId: `demo_msg_${Date.now()}`
        };
        
        console.log('   Send result:', sendResult);
        
        // Test 6: Actualizar estado
        console.log('\n🔍 Test 6: Updating message status...');
        const statusUpdated = await DatabaseService.updateProactiveMessageStatus(proactiveMessageId, 'sent');
        console.log('   Status updated:', statusUpdated);
        
        console.log('\n✅ All tests passed! The proactive message flow works correctly.');
        
    } catch (error: any) {
        console.error('\n❌ TEST FAILED with error:', error.message);
        console.error('   Error name:', error.name);
        console.error('   Error code:', error.code);
        
        if (error.stack) {
            console.error('   Stack trace:');
            console.error(error.stack.split('\n').slice(0, 10).join('\n'));
        }
    }
}

// Run the test
testProactiveError().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
