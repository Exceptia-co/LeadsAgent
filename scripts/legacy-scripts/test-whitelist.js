const fetch = require('node-fetch');

async function testWhitelistSystem() {
    console.log('🧪 Probando sistema de whitelist...\n');

    // 1. Obtener leads disponibles
    console.log('1️⃣ Obteniendo leads...');
    const leadsResponse = await fetch('http://localhost:3002/api/leads');
    const leadsData = await leadsResponse.json();
    console.log(`   ✅ ${leadsData.leads.length} leads encontrados\n`);

    // 2. Encontrar un lead autorizado y uno no autorizado
    const authorizedLead = leadsData.leads.find(lead => lead.whatsappAuthorized);
    const unauthorizedLead = leadsData.leads.find(lead => !lead.whatsappAuthorized);

    if (!authorizedLead || !unauthorizedLead) {
        console.log('❌ Necesitas tener al menos un lead autorizado y uno no autorizado para la prueba');
        return;
    }

    console.log(`   🟢 Lead autorizado: ${authorizedLead.name || 'Sin nombre'} (${authorizedLead.phone})`);
    console.log(`   🔴 Lead no autorizado: ${unauthorizedLead.name || 'Sin nombre'} (${unauthorizedLead.phone})\n`);

    // 3. Simular algunos logs de whitelist directamente en la base de datos
    console.log('2️⃣ Simulando logs de whitelist...');

    const DatabaseService = require('./apps/whatsapp-service/src/services/DatabaseService').default;

    // Logs para lead autorizado (permitido)
    await DatabaseService.addWhitelistLog({
        phoneNumber: authorizedLead.phone,
        sessionId: 'test-session',
        decision: 'ALLOWED',
        reason: `Lead encontrado y autorizado: ${authorizedLead.name || 'Sin nombre'}`,
        leadId: authorizedLead.id,
        leadName: authorizedLead.name,
        messagePreview: 'Hola, ¿pueden ayudarme con información sobre sus servicios?',
        aiProvider: 'gemini',
        ipAddress: '127.0.0.1',
        userAgent: 'WhatsApp/Test'
    });

    // Logs para lead no autorizado (bloqueado)
    await DatabaseService.addWhitelistLog({
        phoneNumber: unauthorizedLead.phone,
        sessionId: 'test-session',
        decision: 'BLOCKED',
        reason: `Lead encontrado pero no autorizado para IA: ${unauthorizedLead.name || 'Sin nombre'}`,
        leadId: unauthorizedLead.id,
        leadName: unauthorizedLead.name,
        messagePreview: 'Buenos días, me gustaría saber más sobre los precios',
        aiProvider: 'gemini',
        ipAddress: '127.0.0.1',
        userAgent: 'WhatsApp/Test'
    });

    // Log para número desconocido (bloqueado)
    await DatabaseService.addWhitelistLog({
        phoneNumber: '+1555123456',
        sessionId: 'test-session',
        decision: 'BLOCKED',
        reason: 'Número de teléfono no encontrado en la base de leads',
        messagePreview: 'Spam message: Buy crypto now!',
        aiProvider: 'gemini',
        ipAddress: '127.0.0.1',
        userAgent: 'WhatsApp/Test'
    });

    console.log('   ✅ Logs de whitelist simulados\n');

    // 4. Verificar estadísticas
    console.log('3️⃣ Verificando estadísticas...');
    const statsResponse = await fetch('http://localhost:3002/api/stats/whitelist');
    const statsData = await statsResponse.json();
    
    console.log(`   📊 Total decisiones: ${statsData.totalDecisions}`);
    console.log(`   🟢 Permitidas: ${statsData.allowedCount} (${statsData.allowedPercentage}%)`);
    console.log(`   🔴 Bloqueadas: ${statsData.blockedCount} (${statsData.blockedPercentage}%)`);
    console.log(`   📱 Números únicos: ${statsData.uniquePhones}\n`);

    console.log('🎉 ¡Prueba completada! Ahora puedes ver los datos en el dashboard:\n');
    console.log('   📊 Estadísticas: http://localhost:3000/dashboard/whatsapp-stats');
    console.log('   👥 Leads: http://localhost:3000/dashboard/leads');
    console.log('   💬 Conversaciones: http://localhost:3000/dashboard/conversations\n');
}

// Si se ejecuta directamente
if (require.main === module) {
    testWhitelistSystem().catch(console.error);
}

module.exports = { testWhitelistSystem };
