const { PrismaClient, Prisma } = require('@prisma/client')

async function checkSystemTables() {
  const prisma = new PrismaClient()
  
  try {
    console.log('🔍 Verificando si hay datos en otras tablas del sistema...\n')
    
    // Verificar todas las tablas que existen
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `
    
    console.log('📋 Tablas encontradas en la base de datos:')
    tables.forEach((table, index) => {
      console.log(`${index + 1}. ${table.table_name}`)
    })
    
    console.log('\n🔍 Verificando datos en cada tabla...\n')
    
    // Verificar datos en tablas que no están en el schema de Prisma
    const systemTables = ['migrations', 'ai_training_interactions']
    
    for (const tableName of systemTables) {
      try {
        const count = await prisma.$queryRaw`
          SELECT COUNT(*) as count 
          FROM ${Prisma.raw(`"${tableName}"`)}
        `
        console.log(`📊 ${tableName}: ${count[0].count} registros`)
        
        if (count[0].count > 0) {
          const sample = await prisma.$queryRaw`
            SELECT * FROM ${Prisma.raw(`"${tableName}"`)} 
            LIMIT 3
          `
          console.log(`   Muestra de datos:`, sample.slice(0, 1))
        }
      } catch (error) {
        console.log(`❌ Error accediendo a ${tableName}: ${error.message}`)
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkSystemTables()
