/**
 * B1.9 — Backfill tenant_id en filas existentes.
 *
 * Diseño:
 *   - Agnóstico de la instancia Clerk (Dev/Staging/Prod): el clerk_org_id
 *     se pasa como --clerk-org-id <id> o env CLERK_ORG_ID.
 *   - --dry-run por defecto: imprime el plan sin mutar.
 *   - --apply explícito + --confirm <token> bloquean la ejecución mutadora
 *     accidental.
 *   - Idempotente: ejecutar 2 veces no rompe nada (Tenant upsert por
 *     clerk_org_id; UPDATE solo afecta filas con tenant_id IS NULL).
 *   - PATCH a Clerk metadata es OPCIONAL (--patch-clerk) y requiere
 *     CLERK_SECRET_KEY apuntando a la misma instancia que --clerk-org-id.
 *     El default es NO patchear (la doc del plan asume que el webhook
 *     organization.updated lo hará al re-emitir el evento desde Clerk
 *     una vez seedeada la metadata vía script aparte si hace falta).
 *   - NO toca constraints NOT NULL ni unique compuesto: eso es PR5.
 *
 * Ejecución típica:
 *   $ pnpm tsx packages/db/scripts/backfill-tenant.ts \
 *       --clerk-org-id org_3D8ZN8vTbv1rUvD22QWRVkzjO2J \
 *       --dry-run
 *
 *   $ pnpm tsx packages/db/scripts/backfill-tenant.ts \
 *       --clerk-org-id org_3D8ZN8vTbv1rUvD22QWRVkzjO2J \
 *       --apply --confirm I-UNDERSTAND-THIS-MUTATES
 */

import { PrismaClient } from '@prisma/client';

interface Args {
  clerkOrgId: string;
  tenantName: string;
  apply: boolean;
  patchClerk: boolean;
  confirmToken: string | null;
}

const REQUIRED_CONFIRM_TOKEN = 'I-UNDERSTAND-THIS-MUTATES';

// 9 tablas existentes + 1 mixta + nueva tabla ai_knowledge_base que ya existía.
// Agrupamos por nombre real de la tabla en SQL para query directa via Prisma client.
const TENANT_SCOPED_MODELS: Array<{
  model: keyof PrismaClient;
  tableName: string;
  description: string;
}> = [
  { model: 'lead', tableName: 'leads', description: 'Leads' },
  { model: 'message', tableName: 'messages', description: 'Messages' },
  { model: 'whatsAppSession', tableName: 'whatsapp_sessions', description: 'WhatsApp sessions' },
  {
    model: 'whatsAppConversation',
    tableName: 'whatsapp_conversations',
    description: 'WhatsApp conversations',
  },
  {
    model: 'whatsAppWhitelistLog',
    tableName: 'whatsapp_whitelist_logs',
    description: 'Whitelist logs',
  },
  { model: 'messageTemplate', tableName: 'message_templates', description: 'Message templates' },
  { model: 'proactiveMessage', tableName: 'proactive_messages', description: 'Proactive messages' },
  {
    model: 'aiTrainingInteraction',
    tableName: 'ai_training_interactions',
    description: 'AI training interactions',
  },
  {
    model: 'ai_knowledge_base',
    tableName: 'ai_knowledge_base',
    description: 'Knowledge base items',
  },
  // ai_configuration tiene tenant_id NULLABLE intencionalmente (configs globales con tenant_id IS NULL).
  // El backfill NO debe asignar tenant_id automáticamente — eso convertiría configs globales en tenant-specific.
  // Dejarla fuera del bucle de UPDATE.
];

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let clerkOrgId = process.env.CLERK_ORG_ID || '';
  let tenantName = process.env.TENANT_NAME || 'EscortsHub';
  let apply = false;
  let patchClerk = false;
  let confirmToken: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--clerk-org-id') clerkOrgId = args[++i] ?? '';
    else if (a === '--tenant-name') tenantName = args[++i] ?? tenantName;
    else if (a === '--apply') apply = true;
    else if (a === '--dry-run') apply = false;
    else if (a === '--patch-clerk') patchClerk = true;
    else if (a === '--confirm') confirmToken = args[++i] ?? null;
    else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      printHelp();
      process.exit(2);
    }
  }

  if (!clerkOrgId) {
    console.error('ERROR: --clerk-org-id <id> (or env CLERK_ORG_ID) is required.');
    printHelp();
    process.exit(2);
  }
  if (!clerkOrgId.startsWith('org_')) {
    console.error(`ERROR: clerk-org-id must start with "org_", got: ${clerkOrgId}`);
    process.exit(2);
  }

  return { clerkOrgId, tenantName, apply, patchClerk, confirmToken };
}

function printHelp() {
  console.log(`
B1.9 backfill — populate tenant_id in existing rows.

Usage:
  pnpm tsx packages/db/scripts/backfill-tenant.ts --clerk-org-id <org_xxx> [options]

Options:
  --clerk-org-id <id>     Required. Clerk Organization ID (e.g. org_xxx).
                          Can also be provided via env CLERK_ORG_ID.
  --tenant-name <name>    Tenant display name. Default: "EscortsHub" or env TENANT_NAME.
  --dry-run               Default. Print plan without mutating.
  --apply                 Mutate. Requires --confirm with the exact token.
  --confirm <token>       Required with --apply. Token: ${REQUIRED_CONFIRM_TOKEN}
  --patch-clerk           Optional. After backfill, PATCH Clerk metadata with
                          the new tenantId. Requires CLERK_SECRET_KEY env.
                          Default: false (the webhook organization.updated will
                          do it next time it fires; or run separately).
  -h, --help              Show this help.

Examples:
  # Dry run (safe, default):
  pnpm tsx packages/db/scripts/backfill-tenant.ts \\
      --clerk-org-id org_3D8ZN8vTbv1rUvD22QWRVkzjO2J --dry-run

  # Apply (mutating):
  pnpm tsx packages/db/scripts/backfill-tenant.ts \\
      --clerk-org-id org_3D8ZN8vTbv1rUvD22QWRVkzjO2J \\
      --apply --confirm ${REQUIRED_CONFIRM_TOKEN}
`);
}

async function findOrCreateTenant(
  prisma: PrismaClient,
  clerkOrgId: string,
  tenantName: string,
  apply: boolean,
): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.tenant.findUnique({ where: { clerkOrgId } });
  if (existing) {
    console.log(
      `[Tenant] Found existing: ${existing.id} (clerkOrgId=${clerkOrgId}, name="${existing.name}")`,
    );
    return { id: existing.id, created: false };
  }
  console.log(
    `[Tenant] No tenant for clerkOrgId=${clerkOrgId}. Plan: CREATE name="${tenantName}".`,
  );
  if (!apply) {
    return { id: '<dry-run-placeholder-uuid>', created: true };
  }
  const created = await prisma.tenant.create({
    data: { clerkOrgId, name: tenantName },
  });
  console.log(`[Tenant] CREATED ${created.id}`);
  return { id: created.id, created: true };
}

async function countOrphanRows(prisma: PrismaClient) {
  const counts: Record<string, { total: number; orphan: number }> = {};
  for (const m of TENANT_SCOPED_MODELS) {
    // Use $queryRawUnsafe with table name (already validated, hardcoded list)
    const totalRow: Array<{ count: bigint }> = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::bigint AS count FROM "${m.tableName}"`,
    );
    const orphanRow: Array<{ count: bigint }> = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::bigint AS count FROM "${m.tableName}" WHERE tenant_id IS NULL`,
    );
    counts[m.tableName] = {
      total: Number(totalRow[0].count),
      orphan: Number(orphanRow[0].count),
    };
  }
  return counts;
}

function printCountTable(counts: Record<string, { total: number; orphan: number }>, label: string) {
  console.log(`\n=== ${label} ===`);
  console.log('Table'.padEnd(35) + 'Total'.padStart(10) + 'tenant_id IS NULL'.padStart(22));
  console.log('-'.repeat(67));
  let totalAll = 0;
  let orphanAll = 0;
  for (const [tableName, { total, orphan }] of Object.entries(counts)) {
    console.log(tableName.padEnd(35) + String(total).padStart(10) + String(orphan).padStart(22));
    totalAll += total;
    orphanAll += orphan;
  }
  console.log('-'.repeat(67));
  console.log('TOTAL'.padEnd(35) + String(totalAll).padStart(10) + String(orphanAll).padStart(22));
}

async function backfillTenantId(
  prisma: PrismaClient,
  tenantId: string,
  apply: boolean,
): Promise<Record<string, number>> {
  const planned: Record<string, number> = {};
  for (const m of TENANT_SCOPED_MODELS) {
    if (!apply) {
      const row: Array<{ count: bigint }> = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::bigint AS count FROM "${m.tableName}" WHERE tenant_id IS NULL`,
      );
      planned[m.tableName] = Number(row[0].count);
      console.log(
        `[Plan] UPDATE ${m.tableName} SET tenant_id='${tenantId}' WHERE tenant_id IS NULL  -- ${planned[m.tableName]} rows`,
      );
    } else {
      // $executeRawUnsafe returns count of affected rows directly (no RETURNING materialization).
      // Más eficiente para volúmenes grandes que RETURNING 1 + result.length.
      const affected = await prisma.$executeRawUnsafe(
        `UPDATE "${m.tableName}" SET tenant_id = $1::uuid WHERE tenant_id IS NULL`,
        tenantId,
      );
      planned[m.tableName] = affected;
      console.log(`[Apply] UPDATE ${m.tableName}: ${affected} rows updated`);
    }
  }
  return planned;
}

/**
 * B1.9 extensions (Codex review post-PR4):
 *   - whatsapp_sessions.ai_agent_id = default agent (operacional para PR5)
 *   - ai_knowledge_base.agent_id   = default agent (B2 KB retrieval por agent)
 *   - whatsapp_conversations.whatsapp_session_id = JOIN whatsapp_sessions.session_id
 *     (B1.6(b) backfill parcial; el drop de session_id VARCHAR queda para PR5)
 *
 * Se ejecutan después del UPDATE tenant_id para que las filas afectadas ya
 * tengan tenant_id correcto (reduce sorpresas si Prisma extension PR5 mira
 * tenant_id durante este UPDATE).
 */
async function backfillRelations(
  prisma: PrismaClient,
  tenantId: string,
  agentId: string,
  apply: boolean,
): Promise<void> {
  // 1. whatsapp_sessions.ai_agent_id = agentId WHERE ai_agent_id IS NULL
  if (!apply) {
    const row: Array<{ count: bigint }> = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::bigint AS count FROM "whatsapp_sessions" WHERE ai_agent_id IS NULL AND tenant_id = $1::uuid`,
      tenantId,
    );
    console.log(
      `[Plan] UPDATE whatsapp_sessions SET ai_agent_id='${agentId}' WHERE ai_agent_id IS NULL  -- ${Number(row[0].count)} rows`,
    );
  } else {
    const affected = await prisma.$executeRawUnsafe(
      `UPDATE "whatsapp_sessions" SET ai_agent_id = $1::uuid WHERE ai_agent_id IS NULL AND tenant_id = $2::uuid`,
      agentId,
      tenantId,
    );
    console.log(`[Apply] UPDATE whatsapp_sessions.ai_agent_id: ${affected} rows updated`);
  }

  // 2. ai_knowledge_base.agent_id = agentId WHERE agent_id IS NULL
  if (!apply) {
    const row: Array<{ count: bigint }> = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::bigint AS count FROM "ai_knowledge_base" WHERE agent_id IS NULL AND tenant_id = $1::uuid`,
      tenantId,
    );
    console.log(
      `[Plan] UPDATE ai_knowledge_base SET agent_id='${agentId}' WHERE agent_id IS NULL  -- ${Number(row[0].count)} rows`,
    );
  } else {
    const affected = await prisma.$executeRawUnsafe(
      `UPDATE "ai_knowledge_base" SET agent_id = $1::uuid WHERE agent_id IS NULL AND tenant_id = $2::uuid`,
      agentId,
      tenantId,
    );
    console.log(`[Apply] UPDATE ai_knowledge_base.agent_id: ${affected} rows updated`);
  }

  // 3. whatsapp_conversations.whatsapp_session_id = JOIN whatsapp_sessions
  //    matching session_id VARCHAR. Filas sin match en whatsapp_sessions quedan
  //    NULL (huérfanas) — eso es información operativa que el reporte muestra.
  if (!apply) {
    const orphanRow: Array<{ count: bigint }> = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::bigint AS count FROM "whatsapp_conversations" c
       WHERE c.whatsapp_session_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM "whatsapp_sessions" s WHERE s.session_id = c.session_id)`,
    );
    const matchableRow: Array<{ count: bigint }> = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::bigint AS count FROM "whatsapp_conversations" c
       WHERE c.whatsapp_session_id IS NULL
       AND EXISTS (SELECT 1 FROM "whatsapp_sessions" s WHERE s.session_id = c.session_id)`,
    );
    console.log(
      `[Plan] UPDATE whatsapp_conversations.whatsapp_session_id JOIN whatsapp_sessions  -- ${Number(matchableRow[0].count)} matchable, ${Number(orphanRow[0].count)} orphan (no matching session_id)`,
    );
  } else {
    const affected = await prisma.$executeRawUnsafe(
      `UPDATE "whatsapp_conversations" c
       SET whatsapp_session_id = s.id
       FROM "whatsapp_sessions" s
       WHERE c.whatsapp_session_id IS NULL
       AND s.session_id = c.session_id`,
    );
    console.log(
      `[Apply] UPDATE whatsapp_conversations.whatsapp_session_id: ${affected} rows updated`,
    );

    // Reportar huérfanos restantes (no es error, es información)
    const orphanRow: Array<{ count: bigint }> = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::bigint AS count FROM "whatsapp_conversations" WHERE whatsapp_session_id IS NULL`,
    );
    const orphan = Number(orphanRow[0].count);
    if (orphan > 0) {
      console.log(
        `[Apply] WARN: ${orphan} whatsapp_conversations rows still have NULL whatsapp_session_id (no matching whatsapp_sessions.session_id). Drop de session_id VARCHAR queda para PR5 — verificar antes.`,
      );
    }
  }
}

async function ensureDefaultAiAgent(
  prisma: PrismaClient,
  tenantId: string,
  tenantName: string,
  apply: boolean,
): Promise<string> {
  const existing = await prisma.aiAgent.findFirst({ where: { tenantId } });
  if (existing) {
    console.log(
      `[AiAgent] Found existing for tenant ${tenantId}: ${existing.id} ("${existing.name}"). Skip create.`,
    );
    return existing.id;
  }
  const defaultName = `${tenantName} Default`;
  console.log(`[AiAgent] No agents for tenant ${tenantId}. Plan: CREATE name="${defaultName}".`);
  if (!apply) {
    return '<dry-run-placeholder-agent-uuid>';
  }

  const agent = await prisma.aiAgent.create({
    data: {
      tenantId,
      name: defaultName,
      businessName: tenantName,
      language: 'es',
      // Deja el resto en defaults Prisma (tone=FRIENDLY, primaryGoal=CONTACT, allowEmojis=true)
    },
  });
  console.log(`[AiAgent] CREATED ${agent.id}`);
  return agent.id;
}

async function patchClerkMetadata(
  clerkOrgId: string,
  tenantId: string,
  apply: boolean,
): Promise<void> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    console.warn('[Clerk PATCH] CLERK_SECRET_KEY not set — skipping PATCH.');
    return;
  }
  console.log(
    `[Clerk PATCH] Plan: PATCH https://api.clerk.com/v1/organizations/${clerkOrgId}/metadata with public_metadata={tenant_id:"${tenantId}"}`,
  );
  if (!apply) return;

  const res = await fetch(`https://api.clerk.com/v1/organizations/${clerkOrgId}/metadata`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ public_metadata: { tenant_id: tenantId } }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[Clerk PATCH] FAILED: ${res.status} ${body}`);
    throw new Error(`Clerk PATCH failed with status ${res.status}`);
  }
  console.log(`[Clerk PATCH] OK (status ${res.status})`);
}

async function main() {
  const args = parseArgs();

  console.log('='.repeat(67));
  console.log('B1.9 backfill-tenant');
  console.log('='.repeat(67));
  console.log(`mode:          ${args.apply ? 'APPLY (mutating)' : 'DRY-RUN (no mutation)'}`);
  console.log(`clerkOrgId:    ${args.clerkOrgId}`);
  console.log(`tenantName:    ${args.tenantName}`);
  console.log(`patchClerk:    ${args.patchClerk}`);
  console.log('='.repeat(67));

  if (args.apply && args.confirmToken !== REQUIRED_CONFIRM_TOKEN) {
    console.error(
      `\nERROR: --apply requires --confirm ${REQUIRED_CONFIRM_TOKEN} (got: ${args.confirmToken ?? '<none>'})`,
    );
    process.exit(2);
  }

  const prisma = new PrismaClient();
  try {
    // 1. Counts before
    const before = await countOrphanRows(prisma);
    printCountTable(before, 'Counts BEFORE backfill');

    // 2. Find or create Tenant
    console.log('');
    const { id: tenantId } = await findOrCreateTenant(
      prisma,
      args.clerkOrgId,
      args.tenantName,
      args.apply,
    );

    // 3. Update tenant_id where NULL
    console.log('');
    const planned = await backfillTenantId(prisma, tenantId, args.apply);

    // 4. Ensure default AiAgent (and capture its id for relation backfill)
    console.log('');
    const agentId = await ensureDefaultAiAgent(prisma, tenantId, args.tenantName, args.apply);

    // 5. Backfill relations to default agent + session FK (Codex review post-PR4)
    console.log('');
    await backfillRelations(prisma, tenantId, agentId, args.apply);

    // 6. Counts after (only if apply, else print plan summary)
    if (args.apply) {
      const after = await countOrphanRows(prisma);
      printCountTable(after, 'Counts AFTER backfill');
    } else {
      console.log('\n=== DRY-RUN summary ===');
      const totalPlanned = Object.values(planned).reduce((a, b) => a + b, 0);
      console.log(
        `Would UPDATE ${totalPlanned} rows total across ${Object.keys(planned).length} tables.`,
      );
    }

    // 7. PATCH Clerk metadata if requested
    if (args.patchClerk) {
      console.log('');
      await patchClerkMetadata(args.clerkOrgId, tenantId, args.apply);
    } else {
      console.log('\n[Clerk PATCH] Skipped (use --patch-clerk to enable).');
    }

    console.log('\n✅ Done.');
  } catch (err) {
    console.error('\n❌ ERROR:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
