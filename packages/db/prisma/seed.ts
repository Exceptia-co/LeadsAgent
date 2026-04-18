import {
  PrismaClient,
  LeadStatus,
  MessageDirection,
  MessageType,
  MessageStatus,
} from '@prisma/client';
import dotenv from 'dotenv';

// Load environment variables from root .env
dotenv.config({ path: '../../.env' });

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ---------- Users (idempotente: upsert por clerk_id, el único @unique) ----------
  const adminUser = await prisma.user.upsert({
    where: { clerk_id: 'clerk_seed_admin' },
    update: {},
    create: {
      email: 'admin@leadcrm.com',
      clerk_id: 'clerk_seed_admin',
      first_name: 'Admin',
      last_name: 'User',
      role: 'admin',
      is_active: true,
    },
  });

  const agentUser = await prisma.user.upsert({
    where: { clerk_id: 'clerk_seed_agent' },
    update: {},
    create: {
      email: 'agent@leadcrm.com',
      clerk_id: 'clerk_seed_agent',
      first_name: 'Agent',
      last_name: 'User',
      role: 'agent',
      is_active: true,
    },
  });

  console.log(`✅ Users upserted: admin=${adminUser.id}, agent=${agentUser.id}`);

  // ---------- Leads + Messages (idempotente: upsert por phone) ----------
  const lead1 = await prisma.lead.upsert({
    where: { phone: '1234567890' },
    update: {},
    create: {
      name: 'Juan Pérez',
      phone: '1234567890',
      email: 'juan@example.com',
      status: LeadStatus.NUEVO,
      moodScore: 0.8,
      assignedTo: agentUser.clerk_id,
      tags: ['interesado', 'productos'],
      messages: {
        create: [
          {
            content: 'Hola, estoy interesado en sus productos',
            messageType: MessageType.TEXT,
            direction: MessageDirection.INBOUND,
            status: MessageStatus.READ,
          },
          {
            content:
              '¡Hola Juan! Me da mucho gusto saber de tu interés. ¿En qué producto específico estás interesado?',
            messageType: MessageType.TEXT,
            direction: MessageDirection.OUTBOUND,
            status: MessageStatus.SENT,
          },
        ],
      },
    },
  });

  const lead2 = await prisma.lead.upsert({
    where: { phone: '0987654321' },
    update: {},
    create: {
      name: 'María García',
      phone: '0987654321',
      email: 'maria@example.com',
      status: LeadStatus.CONTACTADO,
      moodScore: 0.6,
      tags: ['información', 'precios'],
      messages: {
        create: [
          {
            content: 'Buenos días, me pueden dar información sobre precios?',
            messageType: MessageType.TEXT,
            direction: MessageDirection.INBOUND,
            status: MessageStatus.READ,
          },
        ],
      },
    },
  });

  const lead3 = await prisma.lead.upsert({
    where: { phone: '1122334455' },
    update: {},
    create: {
      name: 'Carlos Rodríguez',
      phone: '1122334455',
      email: 'carlos@example.com',
      status: LeadStatus.QUALIFIED,
      moodScore: 0.9,
      tags: ['comprar', 'urgente', 'entrega'],
      messages: {
        create: [
          {
            content: 'Necesito comprar 50 unidades urgente, cuando pueden entregar?',
            messageType: MessageType.TEXT,
            direction: MessageDirection.INBOUND,
            status: MessageStatus.READ,
          },
          {
            content:
              'Perfecto Carlos! Podemos tener las 50 unidades listas en 2 días. ¿Cuál es tu dirección de entrega?',
            messageType: MessageType.TEXT,
            direction: MessageDirection.OUTBOUND,
            status: MessageStatus.SENT,
          },
          {
            content: 'Excelente! Mi dirección es Av. Principal 123, Ciudad',
            messageType: MessageType.TEXT,
            direction: MessageDirection.INBOUND,
            status: MessageStatus.READ,
          },
        ],
      },
    },
  });

  console.log(`✅ Seed leads: lead1=${lead1.id}, lead2=${lead2.id}, lead3=${lead3.id}`);

  // ---------- Leads adicionales sin mensajes (idempotente) ----------
  await prisma.lead.upsert({
    where: { phone: '5566778899' },
    update: {},
    create: {
      name: 'Ana López',
      phone: '5566778899',
      email: 'ana@example.com',
      status: LeadStatus.PERDIDO,
      moodScore: 0.3,
    },
  });

  await prisma.lead.upsert({
    where: { phone: '9988776655' },
    update: {},
    create: {
      phone: '9988776655',
      status: LeadStatus.NUEVO,
    },
  });

  console.log('✅ Additional leads upserted');

  // ---------- ai_knowledge_base (seed solo si la tabla está vacía) ----------
  const knowledgeCount = await prisma.ai_knowledge_base.count();
  if (knowledgeCount === 0) {
    await prisma.ai_knowledge_base.createMany({
      data: [
        {
          category: 'products',
          title: 'Catálogo de productos',
          content:
            'Nuestro catálogo incluye los planes ANUNCIO TOP, ANUNCIO DOBLE y DOBLE TOP. Cada uno con distinta visibilidad y precio.',
          keywords: ['catálogo', 'productos', 'planes'],
          priority: 10,
          is_active: true,
        },
        {
          category: 'pricing',
          title: 'Tabla de precios',
          content:
            'Los precios varían según el plan y la duración. Consulta al equipo comercial para una cotización personalizada.',
          keywords: ['precios', 'cotización', 'tarifa'],
          priority: 9,
          is_active: true,
        },
        {
          category: 'support',
          title: 'Horario de atención',
          content: 'Atención de lunes a viernes de 9:00 a 18:00 hora de España.',
          keywords: ['horario', 'atención', 'soporte'],
          priority: 5,
          is_active: true,
        },
      ],
    });
    console.log('✅ ai_knowledge_base seeded (3 entries)');
  } else {
    console.log(`ℹ️ ai_knowledge_base already has ${knowledgeCount} rows — skipping seed`);
  }

  // ---------- message_templates (seed solo si vacía) ----------
  const templateCount = await prisma.messageTemplate.count();
  if (templateCount === 0) {
    await prisma.messageTemplate.createMany({
      data: [
        {
          name: 'Bienvenida',
          category: 'welcome',
          subject: 'Bienvenido/a',
          content: '¡Hola {{nombre}}! 👋\n\nBienvenido/a a EscortsHub. Estoy aquí para ayudarte.',
          variables: ['nombre'],
          isActive: true,
          createdBy: 'seed',
        },
        {
          name: 'Seguimiento',
          category: 'follow_up',
          content:
            'Hola {{nombre}}, solo quería hacerte seguimiento sobre tu consulta. ¿Sigues interesado/a en {{producto}}?',
          variables: ['nombre', 'producto'],
          isActive: true,
          createdBy: 'seed',
        },
      ],
    });
    console.log('✅ message_templates seeded (2 entries)');
  } else {
    console.log(`ℹ️ message_templates already has ${templateCount} rows — skipping seed`);
  }

  // ---------- Resumen final ----------
  const [totalUsers, totalLeads, totalMessages, totalKnowledge, totalTemplates] = await Promise.all(
    [
      prisma.user.count(),
      prisma.lead.count(),
      prisma.message.count(),
      prisma.ai_knowledge_base.count(),
      prisma.messageTemplate.count(),
    ],
  );

  console.log('📊 Database seeded successfully!');
  console.log(`   - ${totalUsers} users`);
  console.log(`   - ${totalLeads} leads`);
  console.log(`   - ${totalMessages} messages`);
  console.log(`   - ${totalKnowledge} knowledge entries`);
  console.log(`   - ${totalTemplates} message templates`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
