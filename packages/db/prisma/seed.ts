import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

// Load environment variables from root .env
dotenv.config({ path: '../../.env' });

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Crear usuarios de ejemplo
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@leadcrm.com' },
    update: {},
    create: {
      email: 'admin@leadcrm.com',
      name: 'Admin User',
      clerkId: 'clerk_admin_123',
      role: 'ADMIN',
    },
  });

  const agentUser = await prisma.user.upsert({
    where: { email: 'agent@leadcrm.com' },
    update: {},
    create: {
      email: 'agent@leadcrm.com',
      name: 'Agent User',
      clerkId: 'clerk_agent_123',
      role: 'AGENT',
    },
  });

  console.log('✅ Users created:', { adminUser, agentUser });

  // Crear leads de ejemplo con mensajes directos
  const lead1 = await prisma.lead.create({
    data: {
      name: 'Juan Pérez',
      phone: '+1234567890',
      email: 'juan@example.com',
      status: 'NUEVO',
      moodScore: 0.8,
      assignedTo: agentUser.clerkId,
      tags: ['interesado', 'productos'],
      messages: {
        create: [
          {
            content: 'Hola, estoy interesado en sus productos',
            type: 'TEXT',
            direction: 'INBOUND',
            sentiment: 'positive',
            confidence: 0.8,
            aiAnalyzed: true,
          },
          {
            content:
              '¡Hola Juan! Me da mucho gusto saber de tu interés. ¿En qué producto específico estás interesado?',
            type: 'TEXT',
            direction: 'OUTBOUND',
            status: 'SENT',
          },
        ],
      },
    },
    include: {
      messages: true,
    },
  });

  const lead2 = await prisma.lead.create({
    data: {
      name: 'María García',
      phone: '+0987654321',
      email: 'maria@example.com',
      status: 'CONTACTADO',
      moodScore: 0.6,
      tags: ['información', 'precios'],
      messages: {
        create: [
          {
            content: 'Buenos días, me pueden dar información sobre precios?',
            type: 'TEXT',
            direction: 'INBOUND',
            sentiment: 'neutral',
            confidence: 0.6,
            aiAnalyzed: true,
          },
        ],
      },
    },
  });

  const lead3 = await prisma.lead.create({
    data: {
      name: 'Carlos Rodríguez',
      phone: '+1122334455',
      email: 'carlos@example.com',
      status: 'QUALIFIED',
      moodScore: 0.9,
      tags: ['comprar', 'urgente', 'entrega'],
      messages: {
        create: [
          {
            content: 'Necesito comprar 50 unidades urgente, cuando pueden entregar?',
            type: 'TEXT',
            direction: 'INBOUND',
            sentiment: 'urgent',
            confidence: 0.9,
            aiAnalyzed: true,
          },
          {
            content:
              'Perfecto Carlos! Podemos tener las 50 unidades listas en 2 días. ¿Cuál es tu dirección de entrega?',
            type: 'TEXT',
            direction: 'OUTBOUND',
            status: 'SENT',
          },
          {
            content: 'Excelente! Mi dirección es Av. Principal 123, Ciudad',
            type: 'TEXT',
            direction: 'INBOUND',
            sentiment: 'positive',
            confidence: 0.95,
            aiAnalyzed: true,
          },
        ],
      },
    },
  });

  console.log('✅ Leads with conversations created:', {
    lead1: lead1.id,
    lead2: lead2.id,
    lead3: lead3.id,
  });

  // Crear algunos leads sin mensajes
  await prisma.lead.createMany({
    data: [
      {
        name: 'Ana López',
        phone: '+5566778899',
        email: 'ana@example.com',
        status: 'PERDIDO',
        moodScore: 0.3,
      },
      {
        phone: '+9988776655',
        status: 'NUEVO',
      },
    ],
  });

  console.log('✅ Additional leads created');

  const totalLeads = await prisma.lead.count();
  const totalMessages = await prisma.message.count();
  const totalUsers = await prisma.user.count();

  console.log('📊 Database seeded successfully!');
  console.log(`   - ${totalUsers} users`);
  console.log(`   - ${totalLeads} leads`);
  console.log(`   - ${totalMessages} messages`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
