import { PrismaClient, LeadStatus } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const prisma = new PrismaClient();

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function normalizePhone(value: string): string {
  const normalized = value.replace(/[^\d]/g, '');
  if (!normalized) {
    throw new Error('SMOKE_WHATSAPP_PHONE must contain at least one digit');
  }
  return normalized;
}

async function main(): Promise<void> {
  const phone = normalizePhone(requiredEnv('SMOKE_WHATSAPP_PHONE'));
  const name = process.env.SMOKE_LEAD_NAME?.trim() || 'Smoke WhatsApp Lead';
  const sessionId = process.env.SMOKE_SESSION_ID?.trim() || 'testing';

  const lead = await prisma.lead.upsert({
    where: { phone },
    update: {
      name,
      status: LeadStatus.NUEVO,
      source: 'local-smoke',
      whatsappAuthorized: true,
      deletedAt: null,
      tags: ['local-smoke', 'whatsapp-smoke'],
    },
    create: {
      name,
      phone,
      status: LeadStatus.NUEVO,
      source: 'local-smoke',
      whatsappAuthorized: true,
      tags: ['local-smoke', 'whatsapp-smoke'],
    },
  });

  console.log('Smoke lead ready');
  console.log(`  lead_id=${lead.id}`);
  console.log(`  phone=${phone}`);
  console.log(`  session_id=${sessionId}`);
  console.log('Expected PR1 state: tenant_id remains NULL until B1.9 backfill.');
}

main()
  .catch((error) => {
    console.error('Smoke seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
