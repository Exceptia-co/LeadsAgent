#!/usr/bin/env tsx
/**
 * LeadsCRM infra smoke test.
 *
 * Runs invariant checks against:
 *   [A] Supabase Postgres (via DATABASE_URL)
 *   [B] Supabase Management API advisors (needs SUPABASE_PAT)
 *   [C] Hetzner Cloud API firewall rules (needs HCLOUD_TOKEN)
 *   [D] Vercel REST API project state (needs VERCEL_TOKEN)
 *   [E] Code invariants (file existence + grep)
 *
 * Run from repo root:
 *   pnpm run audit:infra
 *
 * Exit codes:
 *   0 = no FAIL findings (WARN/SKIP allowed)
 *   1 = at least one FAIL finding
 *
 * Env vars required per section; missing creds turn that section into SKIP
 * rather than failing the whole run, so the script is safe to invoke without
 * provisioning every secret locally.
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: path.resolve(process.cwd(), '.env') });

// --- Configuration (IDs verified live via MCPs 2026-04-17) ---
const SUPABASE_PROJECT_REF = 'yxjzsargboxnuwnbuzax';
const HETZNER_FIREWALL_ID = 10443894;
const VERCEL_TEAM_ID = 'team_mP2bYgdUeXS5ArWzTHfw3RY5';
const VERCEL_PROJECT_ID = 'prj_3JGVC3KT0dnixeuZZwpcHTT0u3F6';
const REPO_ROOT = process.cwd();

// --- Finding model ---
type Level = 'PASS' | 'WARN' | 'FAIL' | 'SKIP';
interface Finding {
  section: string;
  id: string;
  level: Level;
  title: string;
  detail: string;
}
const findings: Finding[] = [];
const record = (f: Finding) => findings.push(f);

// --- File helpers ---
function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(REPO_ROOT, relPath));
}
function readFile(relPath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf-8');
}
function walk(relDir: string): string[] {
  const abs = path.join(REPO_ROOT, relDir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  const recurse = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) recurse(full);
      else out.push(full);
    }
  };
  recurse(abs);
  return out;
}

// --- Section A: Supabase DB (via DATABASE_URL) ---
async function checkSupabaseDb(): Promise<void> {
  const section = 'A';
  const url = process.env.DATABASE_URL;
  if (!url) {
    record({
      section,
      id: 'A0',
      level: 'SKIP',
      title: 'DATABASE_URL present',
      detail: 'env var missing',
    });
    return;
  }

  const client = new Client({ connectionString: url });
  try {
    await client.connect();

    // A1: RLS-on tables with 0 policies (hard fail — RLS on with no policy blocks Prisma)
    const rlsNoPolicy = await client.query<{ tablename: string }>(`
      SELECT t.tablename
      FROM pg_tables t
      LEFT JOIN (
        SELECT schemaname, tablename, COUNT(*)::int AS pc
        FROM pg_policies
        WHERE schemaname = 'public'
        GROUP BY schemaname, tablename
      ) p ON t.schemaname = p.schemaname AND t.tablename = p.tablename
      WHERE t.schemaname = 'public'
        AND t.rowsecurity = true
        AND (p.pc IS NULL OR p.pc = 0)
      ORDER BY t.tablename;
    `);
    if (rlsNoPolicy.rows.length === 0) {
      record({
        section,
        id: 'A1',
        level: 'PASS',
        title: 'RLS-on tables have >=1 policy',
        detail: '',
      });
    } else {
      const list = rlsNoPolicy.rows.map((r) => r.tablename).join(', ');
      record({
        section,
        id: 'A1',
        level: 'FAIL',
        title: 'RLS-on tables have >=1 policy',
        detail: `${rlsNoPolicy.rows.length} tables with RLS on and 0 policies: ${list}`,
      });
    }

    // A2: tables with RLS off (WARN — informational until T0.1 done)
    const rlsOff = await client.query<{ tablename: string }>(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND rowsecurity = false
      ORDER BY tablename;
    `);
    const offTables = rlsOff.rows.map((r) => r.tablename);
    if (offTables.length === 0) {
      record({
        section,
        id: 'A2',
        level: 'PASS',
        title: 'All public tables have RLS on',
        detail: '',
      });
    } else {
      record({
        section,
        id: 'A2',
        level: 'WARN',
        title: 'All public tables have RLS on',
        detail: `${offTables.length} tables still with RLS off: ${offTables.join(', ')}`,
      });
    }

    // A3: duplicate index groups in proactive_messages (indexes over identical columns)
    const dupIdx = await client.query<{ col: string; n: number }>(`
      SELECT
        regexp_replace(indexdef, '.*\\(([^)]+)\\).*', '\\1') AS col,
        COUNT(*)::int AS n
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'proactive_messages'
        AND indexname <> 'proactive_messages_pkey'
      GROUP BY regexp_replace(indexdef, '.*\\(([^)]+)\\).*', '\\1')
      HAVING COUNT(*) > 1;
    `);
    if (dupIdx.rows.length === 0) {
      record({
        section,
        id: 'A3',
        level: 'PASS',
        title: 'proactive_messages has no duplicate indexes',
        detail: '',
      });
    } else {
      const groups = dupIdx.rows.map((r) => `${r.col}(x${r.n})`).join(', ');
      record({
        section,
        id: 'A3',
        level: 'FAIL',
        title: 'proactive_messages has no duplicate indexes',
        detail: `Duplicate groups: ${groups}`,
      });
    }

    // A4: whatsapp_whitelist_logs.lead_id must be uuid
    const leadIdCol = await client.query<{ data_type: string | null }>(`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'whatsapp_whitelist_logs'
        AND column_name = 'lead_id';
    `);
    const dtype = leadIdCol.rows[0]?.data_type ?? null;
    if (dtype === 'uuid') {
      record({
        section,
        id: 'A4',
        level: 'PASS',
        title: 'whatsapp_whitelist_logs.lead_id is uuid',
        detail: '',
      });
    } else {
      record({
        section,
        id: 'A4',
        level: 'FAIL',
        title: 'whatsapp_whitelist_logs.lead_id is uuid',
        detail: `Current: ${dtype ?? '<not found>'}`,
      });
    }

    // A5: orphan campaigns migrations vs missing table
    const campaignsRel = await client.query<{ reg: string | null }>(`
      SELECT to_regclass('public.campaigns')::text AS reg;
    `);
    const campaignsExists = campaignsRel.rows[0]?.reg !== null;

    let orphanMigrationFound = false;
    try {
      const q = await client.query<{ name: string }>(`
        SELECT name
        FROM supabase_migrations.schema_migrations
        WHERE name IN ('create_campaigns_table', 'create_campaign_leads_table');
      `);
      orphanMigrationFound = q.rows.length > 0;
    } catch {
      // supabase_migrations may be inaccessible to this role — silently tolerate.
    }

    if (!campaignsExists && orphanMigrationFound) {
      record({
        section,
        id: 'A5',
        level: 'FAIL',
        title: 'No orphan campaigns migrations',
        detail: 'campaigns migrations applied but table does not exist',
      });
    } else if (campaignsExists) {
      record({
        section,
        id: 'A5',
        level: 'WARN',
        title: 'No orphan campaigns migrations',
        detail: 'campaigns table unexpectedly exists (PRD says feature removed)',
      });
    } else {
      record({
        section,
        id: 'A5',
        level: 'PASS',
        title: 'No orphan campaigns migrations',
        detail: '',
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    record({ section, id: 'A0', level: 'SKIP', title: 'Postgres reachable', detail: msg });
  } finally {
    await client.end().catch(() => {});
  }
}

// --- Section B: Supabase Management API advisors ---
async function checkSupabaseAdvisors(): Promise<void> {
  const section = 'B';
  const pat = process.env.SUPABASE_PAT;
  if (!pat) {
    record({
      section,
      id: 'B0',
      level: 'SKIP',
      title: 'SUPABASE_PAT present',
      detail: 'env var missing',
    });
    return;
  }
  try {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/advisors/security`,
      { headers: { Authorization: `Bearer ${pat}` } },
    );
    if (!res.ok) {
      record({
        section,
        id: 'B0',
        level: 'SKIP',
        title: 'Supabase Management API reachable',
        detail: `HTTP ${res.status}`,
      });
      return;
    }
    const body = (await res.json()) as
      | { lints?: Array<{ name: string; title?: string; detail?: string }> }
      | Array<{ name: string; title?: string; detail?: string }>;
    const lints = Array.isArray(body) ? body : (body.lints ?? []);

    const vpv = lints.find((l) => l.name === 'vulnerable_postgres_version');
    record({
      section,
      id: 'B1',
      level: vpv ? 'FAIL' : 'PASS',
      title: 'No vulnerable_postgres_version advisor',
      detail: vpv ? (vpv.detail ?? vpv.title ?? '') : '',
    });

    const rls = lints.find(
      (l) => l.name === 'rls_enabled_no_policy' || l.name === 'rls_disabled_in_public',
    );
    record({
      section,
      id: 'B2',
      level: rls ? 'FAIL' : 'PASS',
      title: 'No RLS misconfiguration advisor',
      detail: rls ? (rls.detail ?? rls.title ?? '') : '',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    record({
      section,
      id: 'B0',
      level: 'SKIP',
      title: 'Supabase Management API reachable',
      detail: msg,
    });
  }
}

// --- Section C: Hetzner firewall ---
async function checkHetznerFirewall(): Promise<void> {
  const section = 'C';
  const token = process.env.HCLOUD_TOKEN;
  if (!token) {
    record({
      section,
      id: 'C0',
      level: 'SKIP',
      title: 'HCLOUD_TOKEN present',
      detail: 'env var missing',
    });
    return;
  }
  try {
    const res = await fetch(`https://api.hetzner.cloud/v1/firewalls/${HETZNER_FIREWALL_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      record({
        section,
        id: 'C0',
        level: 'SKIP',
        title: 'Hetzner API reachable',
        detail: `HTTP ${res.status}`,
      });
      return;
    }
    const body = (await res.json()) as {
      firewall?: {
        rules?: Array<{
          direction: string;
          port: string;
          source_ips: string[];
          description?: string;
        }>;
      };
    };
    const rules = body.firewall?.rules ?? [];
    const openToWorld = (ips: string[]) => ips.includes('0.0.0.0/0') || ips.includes('::/0');

    // C1: app ports 3002 and 3003 must NOT be open to the world
    const openApp = rules.filter(
      (r) =>
        r.direction === 'in' &&
        (r.port === '3002' || r.port === '3003') &&
        openToWorld(r.source_ips),
    );
    record({
      section,
      id: 'C1',
      level: openApp.length === 0 ? 'PASS' : 'FAIL',
      title: 'App ports 3002/3003 not open to world',
      detail: openApp.length === 0 ? '' : `Still open: ${openApp.map((r) => r.port).join(', ')}`,
    });

    // C2: SSH must NOT be open to the world
    const openSsh = rules.find(
      (r) => r.direction === 'in' && r.port === '22' && openToWorld(r.source_ips),
    );
    record({
      section,
      id: 'C2',
      level: openSsh ? 'FAIL' : 'PASS',
      title: 'SSH (22) not open to world',
      detail: openSsh ? `source_ips: ${openSsh.source_ips.join(', ')}` : '',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    record({ section, id: 'C0', level: 'SKIP', title: 'Hetzner API reachable', detail: msg });
  }
}

// --- Section D: Vercel ---
async function checkVercel(): Promise<void> {
  const section = 'D';
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    record({
      section,
      id: 'D0',
      level: 'SKIP',
      title: 'VERCEL_TOKEN present',
      detail: 'env var missing',
    });
    return;
  }
  try {
    const res = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&teamId=${VERCEL_TEAM_ID}&target=production&limit=5&state=READY`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      record({
        section,
        id: 'D0',
        level: 'SKIP',
        title: 'Vercel API reachable',
        detail: `HTTP ${res.status}`,
      });
      return;
    }
    const body = (await res.json()) as {
      deployments?: Array<{ uid: string; state: string; target?: string | null; created: number }>;
    };
    const prodReady = (body.deployments ?? []).filter(
      (d) => d.state === 'READY' && d.target === 'production',
    );
    record({
      section,
      id: 'D1',
      level: prodReady.length > 0 ? 'PASS' : 'FAIL',
      title: 'Vercel has a production deployment in READY state',
      detail:
        prodReady.length > 0
          ? `${prodReady.length} READY production deployment(s); latest uid=${prodReady[0].uid}`
          : 'no READY deployment with target=production found',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    record({ section, id: 'D0', level: 'SKIP', title: 'Vercel API reachable', detail: msg });
  }
}

// --- Section E: code invariants ---
function checkCode(): void {
  const section = 'E';

  // E1: WhatsAppController (NestJS) guarded with @UseGuards(ClerkAuthGuard)
  const controllerPath = 'apps/api/src/whatsapp/whatsapp.controller.ts';
  if (fileExists(controllerPath)) {
    const src = readFile(controllerPath);
    const hasGuard = /@UseGuards\s*\(\s*ClerkAuthGuard/.test(src);
    record({
      section,
      id: 'E1',
      level: hasGuard ? 'PASS' : 'FAIL',
      title: 'NestJS WhatsAppController has @UseGuards(ClerkAuthGuard)',
      detail: hasGuard ? '' : `missing @UseGuards(ClerkAuthGuard) in ${controllerPath}`,
    });
  } else {
    record({
      section,
      id: 'E1',
      level: 'SKIP',
      title: 'WhatsAppController file present',
      detail: `${controllerPath} not found`,
    });
  }

  // E2: no debug routes under apps/dashboard/app/api/debug/
  const debugFiles = walk('apps/dashboard/app/api/debug').filter(
    (f) => f.endsWith('.ts') || f.endsWith('.tsx'),
  );
  record({
    section,
    id: 'E2',
    level: debugFiles.length === 0 ? 'PASS' : 'FAIL',
    title: 'No /api/debug/ routes in dashboard',
    detail: debugFiles.length === 0 ? '' : `${debugFiles.length} file(s) remain`,
  });

  // E3: whatsapp-service has no /public/leads endpoints
  const routesPath = 'apps/whatsapp-service/src/routes/index.ts';
  if (fileExists(routesPath)) {
    const src = readFile(routesPath);
    const matches = src.match(/['"]\/public\/leads/g) ?? [];
    record({
      section,
      id: 'E3',
      level: matches.length === 0 ? 'PASS' : 'FAIL',
      title: 'whatsapp-service has no /public/leads endpoints',
      detail: matches.length === 0 ? '' : `${matches.length} occurrence(s) in ${routesPath}`,
    });
  } else {
    record({
      section,
      id: 'E3',
      level: 'SKIP',
      title: 'whatsapp-service routes file present',
      detail: '',
    });
  }

  // E4: PublicLeadsController removed
  const plcPath = 'apps/api/src/leads/public-leads.controller.ts';
  const plcExists = fileExists(plcPath);
  record({
    section,
    id: 'E4',
    level: plcExists ? 'FAIL' : 'PASS',
    title: 'PublicLeadsController removed',
    detail: plcExists ? `${plcPath} still present` : '',
  });

  // E5: AutomationService either removed or wired into WhatsAppModule.providers
  const automationPath = 'apps/api/src/whatsapp/automation.service.ts';
  const modulePath = 'apps/api/src/whatsapp/whatsapp.module.ts';
  if (!fileExists(automationPath)) {
    record({
      section,
      id: 'E5',
      level: 'PASS',
      title: 'AutomationService wired or removed',
      detail: 'automation.service.ts removed',
    });
  } else if (fileExists(modulePath)) {
    const src = readFile(modulePath);
    const providersBlock = src.match(/providers\s*:\s*\[[^\]]*\]/s);
    const wired = !!providersBlock && /AutomationService/.test(providersBlock[0]);
    record({
      section,
      id: 'E5',
      level: wired ? 'PASS' : 'FAIL',
      title: 'AutomationService wired or removed',
      detail: wired ? '' : 'automation.service.ts exists but missing from WhatsAppModule.providers',
    });
  } else {
    record({ section, id: 'E5', level: 'SKIP', title: 'WhatsAppModule file present', detail: '' });
  }

  // E6: middleware matches /api/webhooks (plural), not the broken singular /api/webhook
  const mwPath = 'apps/dashboard/middleware.ts';
  if (fileExists(mwPath)) {
    const src = readFile(mwPath);
    const hasPlural = /['"]\/api\/webhooks/.test(src);
    record({
      section,
      id: 'E6',
      level: hasPlural ? 'PASS' : 'WARN',
      title: 'middleware.ts covers /api/webhooks plural',
      detail: hasPlural
        ? ''
        : 'still uses /api/webhook singular — matcher does not catch /api/webhooks/clerk',
    });
  } else {
    record({ section, id: 'E6', level: 'SKIP', title: 'middleware.ts present', detail: '' });
  }
}

// --- Reporter ---
function report(): void {
  const sectionTitles: Record<string, string> = {
    A: '[A] Supabase DB',
    B: '[B] Supabase advisors',
    C: '[C] Hetzner firewall',
    D: '[D] Vercel',
    E: '[E] Code invariants',
  };
  const tally = { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0 };

  console.log('');
  console.log(`LeadsCRM infra audit — ${new Date().toISOString()}`);
  console.log('');

  const bySection = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!bySection.has(f.section)) bySection.set(f.section, []);
    bySection.get(f.section)!.push(f);
    tally[f.level]++;
  }

  for (const key of Array.from(bySection.keys()).sort()) {
    console.log(sectionTitles[key] ?? `[${key}]`);
    const rows = bySection.get(key)!.sort((a, b) => a.id.localeCompare(b.id));
    for (const r of rows) {
      const head = `  ${r.level.padEnd(4)}  ${r.id}  ${r.title}`;
      console.log(head);
      if (r.detail) console.log(`        ${r.detail}`);
    }
    console.log('');
  }

  console.log(
    `Summary: ${tally.PASS} pass, ${tally.WARN} warn, ${tally.FAIL} fail, ${tally.SKIP} skip`,
  );
  process.exit(tally.FAIL > 0 ? 1 : 0);
}

// --- Entry point ---
(async () => {
  await checkSupabaseDb();
  await checkSupabaseAdvisors();
  await checkHetznerFirewall();
  await checkVercel();
  checkCode();
  report();
})().catch((err) => {
  console.error('[audit-infra] fatal:', err);
  process.exit(2);
});
