const { PrismaClient } = require('@prisma/client')

async function checkDataStatus() {
  const prisma = new PrismaClient()
  
  try {
    console.log('🔍 Verificando estado actual de los datos...\n')
    
    // Verificar leads
    const leadsCount = await prisma.lead.count()
    console.log(`📊 Leads actuales: ${leadsCount}`)
    
    if (leadsCount > 0) {
      const recentLeads = await prisma.lead.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          phone: true,
          createdAt: true,
          source: true
        }
      })
      
      console.log('\n📋 Últimos 5 leads:')
      console.table(recentLeads.map(lead => ({
        id: lead.id.substring(0, 8) + '...',
        name: lead.name || 'Sin nombre',
        phone: lead.phone,
        source: lead.source,
        created: lead.createdAt?.toISOString().split('T')[0]
      })))
    }
    
    // Verificar mensajes
    const messagesCount = await prisma.message.count()
    console.log(`\n💬 Mensajes actuales: ${messagesCount}`)
    
    // Verificar conversaciones WhatsApp
    const conversationsCount = await prisma.whatsAppConversation.count()
    console.log(`📱 Conversaciones WhatsApp: ${conversationsCount}`)
    
    // Verificar logs de whitelist
    const whitelistLogsCount = await prisma.whatsAppWhitelistLog.count()
    console.log(`📝 Logs de whitelist: ${whitelistLogsCount}`)
    
    // Verificar templates de mensajes
    const templatesCount = await prisma.messageTemplate.count()
    console.log(`📝 Templates de mensajes: ${templatesCount}`)
    
    // Verificar configuración AI
    const aiConfigCount = await prisma.ai_configuration.count()
    console.log(`🤖 Configuraciones AI: ${aiConfigCount}`)
    
    const knowledgeBaseCount = await prisma.ai_knowledge_base.count()
    console.log(`📚 Base de conocimiento AI: ${knowledgeBaseCount}`)
    
    console.log('\n' + '='.repeat(50))
    
    if (leadsCount === 0 && messagesCount === 0 && conversationsCount === 0) {
      console.log('❌ LA BASE DE DATOS PARECE ESTAR VACÍA')
      console.log('🚨 Los datos fueron eliminados durante el proceso de migración')
    } else {
      console.log('✅ Hay datos en la base de datos')
    }
    
  } catch (error) {
    console.error('❌ Error verificando datos:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkDataStatus()
