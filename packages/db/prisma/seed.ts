import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

// Load environment variables from root .env
dotenv.config({ path: '../../.env' })

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Crear usuarios de ejemplo
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@leadcrm.com' },
    update: {},
    create: {
      email: 'admin@leadcrm.com',
      clerkId: 'clerk_admin_123',
      role: 'admin',
    },
  })

  const agentUser = await prisma.user.upsert({
    where: { email: 'agent@leadcrm.com' },
    update: {},
    create: {
      email: 'agent@leadcrm.com',
      clerkId: 'clerk_agent_123',
      role: 'agent',
    },
  })

  console.log('✅ Users created:', { adminUser, agentUser })

  // Crear leads de ejemplo con conversaciones
  const lead1 = await prisma.lead.create({
    data: {
      name: 'Juan Pérez',
      phone: '+1234567890',
      status: 'NEW',
      score: 0.8,
      conversation: {
        create: {
          messages: {
            create: [
              {
                content: 'Hola, estoy interesado en sus productos',
                direction: 'INBOUND',
                aiMetadata: JSON.stringify({
                  model: 'gpt-3.5-turbo',
                  classification: 'HOT',
                  score: 0.8,
                  keywords: ['interesado', 'productos']
                })
              },
              {
                content: '¡Hola Juan! Me da mucho gusto saber de tu interés. ¿En qué producto específico estás interesado?',
                direction: 'OUTBOUND'
              }
            ]
          }
        }
      }
    },
    include: {
      conversation: {
        include: {
          messages: true
        }
      }
    }
  })

  const lead2 = await prisma.lead.create({
    data: {
      name: 'María García',
      phone: '+0987654321',
      status: 'CONTACTED',
      score: 0.6,
      conversation: {
        create: {
          messages: {
            create: [
              {
                content: 'Buenos días, me pueden dar información sobre precios?',
                direction: 'INBOUND',
                aiMetadata: JSON.stringify({
                  model: 'gpt-3.5-turbo',
                  classification: 'WARM',
                  score: 0.6,
                  keywords: ['información', 'precios']
                })
              }
            ]
          }
        }
      }
    }
  })

  const lead3 = await prisma.lead.create({
    data: {
      name: 'Carlos Rodríguez',
      phone: '+1122334455',
      status: 'HOT',
      score: 0.9,
      conversation: {
        create: {
          messages: {
            create: [
              {
                content: 'Necesito comprar 50 unidades urgente, cuando pueden entregar?',
                direction: 'INBOUND',
                aiMetadata: JSON.stringify({
                  model: 'gpt-3.5-turbo',
                  classification: 'HOT',
                  score: 0.9,
                  keywords: ['comprar', 'urgente', '50 unidades', 'entrega']
                })
              },
              {
                content: 'Perfecto Carlos! Podemos tener las 50 unidades listas en 2 días. ¿Cuál es tu dirección de entrega?',
                direction: 'OUTBOUND'
              },
              {
                content: 'Excelente! Mi dirección es Av. Principal 123, Ciudad',
                direction: 'INBOUND',
                aiMetadata: JSON.stringify({
                  model: 'gpt-3.5-turbo',
                  classification: 'HOT',
                  score: 0.95,
                  keywords: ['dirección', 'entrega', 'confirmación']
                })
              }
            ]
          }
        }
      }
    }
  })

  console.log('✅ Leads with conversations created:', { 
    lead1: lead1.id, 
    lead2: lead2.id, 
    lead3: lead3.id 
  })

  // Crear algunos leads sin conversaciones
  await prisma.lead.createMany({
    data: [
      {
        name: 'Ana López',
        phone: '+5566778899',
        status: 'COLD',
        score: 0.3
      },
      {
        phone: '+9988776655',
        status: 'NEW'
      }
    ]
  })

  console.log('✅ Additional leads created')

  const totalLeads = await prisma.lead.count()
  const totalMessages = await prisma.message.count()
  const totalUsers = await prisma.user.count()

  console.log('📊 Database seeded successfully!')
  console.log(`   - ${totalUsers} users`)
  console.log(`   - ${totalLeads} leads`) 
  console.log(`   - ${totalMessages} messages`)
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
