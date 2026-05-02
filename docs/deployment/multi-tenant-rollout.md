# Multi-tenant rollout runbook (PR1-PR5a)

Deploy gate for PR #11 (B1 multi-tenant foundation + runtime enforcement).
This runbook is **operative**, not informational — every step is a hard
gate. Skipping any one of them risks silent data corruption or runtime
message drops.

---

## Pre-flight

- [ ] PR #11 merged to `develop`, `develop` merged to `main`. Vercel will auto-deploy the dashboard from `main` — do not skip this branch order.
- [ ] Hetzner VPS `46.225.26.89` SSH access verified.
- [ ] Supabase prod project `yxjzsargboxnuwnbuzax` (CRMWhatsApp) accessible (MCP token or `supabase` CLI).
- [ ] Clerk Production org "EscortsHub" created in `dashboard.clerk.com` (Production environment, not Development). Capture its `org_id` — it differs from the Development one.
- [ ] HMAC secret rotated and propagated to all 3 surfaces (.env Hetzner, Vercel envs, dashboard developers' local .env). See `docs/deployment/secrets-rotation.md`.

---

## Step 1 — Apply migrations to Supabase prod

> **DO NOT** use the Supabase MCP `apply_migration` tool to run these
> migrations directly as raw SQL. The B1 migration file uses
> `CREATE TYPE`, `ALTER TABLE ADD COLUMN`, `CREATE TABLE` and
> `CREATE INDEX` **without** `IF NOT EXISTS`, so re-applying it as raw SQL
> via MCP fails with `42710` / `42P07` if any chunk has already been
> applied. The Prisma migration runner handles this correctly because it
> tracks `_prisma_migrations` and skips already-applied versions.

Use `prisma migrate deploy` from the local repo, pointing at Supabase
prod via the `DATABASE_URL` exported only for this command:

```bash
# Prefer a transient export (drop the variable from your shell after).
export DATABASE_URL="postgresql://<user>:<password>@aws-0-eu-west-3.pooler.supabase.com:5432/postgres?pgbouncer=true"
export DIRECT_URL="postgresql://<user>:<password>@aws-0-eu-west-3.pooler.supabase.com:5432/postgres"

cd packages/db
pnpm exec prisma migrate deploy
```

Expected output ends with:

```
3 migrations found in prisma/migrations
Applying migration `20260501115800_baseline_soft_delete_and_conversation_message`
Applying migration `20260501115900_create_ai_training_interactions`
Applying migration `20260501120000_b1_foundation_schema`
All migrations have been successfully applied.
```

If any prior migrations are listed as "Applying" unexpectedly, abort and
investigate — the prod schema diverged from the repo.

Verification:

```sql
-- Columns added by B1 must exist
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='leads' AND column_name='tenant_id';
-- Should return 1 row
```

---

## Step 2 — Backfill prod (BEFORE deploying any code)

If the code is deployed first, the runtime drops every inbound WhatsApp
message with `[UNIFIED-WRITE] session ... has no tenantId`. Backfill
must come first.

```bash
# Same DATABASE_URL/DIRECT_URL as step 1.
# Replace org_<prod_uuid> with the Clerk Production org_id captured in pre-flight.
pnpm tsx packages/db/scripts/backfill-tenant.ts \
  --clerk-org-id org_<prod_uuid> \
  --tenant-name EscortsHub \
  --dry-run

# Inspect the dry-run output. The "rows" counts must match the
# pre-backfill snapshot from Counts BEFORE.

pnpm tsx packages/db/scripts/backfill-tenant.ts \
  --clerk-org-id org_<prod_uuid> \
  --tenant-name EscortsHub \
  --apply --confirm I-UNDERSTAND-THIS-MUTATES \
  --patch-clerk
```

`--patch-clerk` writes the resulting `tenant_id` into Clerk's
`org.public_metadata.tenant_id`. This requires `CLERK_SECRET_KEY` in env;
without it the patch is skipped with a warning (the script still
completes successfully).

Re-run with `--apply` once more to confirm idempotency: every UPDATE
should report `0 rows updated`.

Verification:

```sql
SELECT 'leads' AS t, COUNT(*) FILTER (WHERE tenant_id IS NULL) AS null_t FROM leads
UNION ALL SELECT 'messages', COUNT(*) FILTER (WHERE tenant_id IS NULL) FROM messages
UNION ALL SELECT 'whatsapp_conversations', COUNT(*) FILTER (WHERE tenant_id IS NULL) FROM whatsapp_conversations
UNION ALL SELECT 'whatsapp_sessions', COUNT(*) FILTER (WHERE tenant_id IS NULL) FROM whatsapp_sessions
UNION ALL SELECT 'message_templates', COUNT(*) FILTER (WHERE tenant_id IS NULL) FROM message_templates
UNION ALL SELECT 'proactive_messages', COUNT(*) FILTER (WHERE tenant_id IS NULL) FROM proactive_messages
UNION ALL SELECT 'ai_knowledge_base', COUNT(*) FILTER (WHERE tenant_id IS NULL) FROM ai_knowledge_base;
```

Every row except possibly `ai_configuration` (intentionally NULL for
global config) must show `null_t = 0`. Abort the deploy if any row
shows >0.

---

## Step 3 — Deploy code coordinated

The HMAC contract is **breaking**: `signature = HMAC(timestamp.tenantId.body)`
across all 3 senders + 1 receiver. Deploy in this order:

1. Merge `develop` → `main`. Vercel auto-deploys the dashboard. Wait
   for green build before continuing.
2. SSH to Hetzner. Pull main and rebuild:
   ```bash
   ssh root@46.225.26.89
   cd /opt/leadcrm
   git fetch origin main && git reset --hard origin/main
   pnpm install --frozen-lockfile
   pnpm --filter @leadcrm/api build
   pnpm --filter @leadcrm/whatsapp-service build
   ```
3. Restart both services in fast succession to minimize the HMAC mismatch
   window:
   ```bash
   pm2 restart leadcrm-api whatsapp-service --update-env
   ```
4. Watch the WhatsApp session reconnect:
   ```bash
   pm2 logs whatsapp-service --lines 50
   ```
   Expected: `Environment validated (NODE_ENV=production)`, then the
   WhatsApp client reconnects within 30 seconds. WhatsApp messages sent
   during the gap are queued by WhatsApp and delivered on reconnect.

Confirm `WHATSAPP_OPERATOR_HMAC_TENANT_ID` is **UNSET** in
`/opt/leadcrm/apps/whatsapp-service/.env`:

```bash
grep -c "^WHATSAPP_OPERATOR_HMAC_TENANT_ID" /opt/leadcrm/apps/whatsapp-service/.env
# Must print 0
```

This is intentional. `/ai/switch`, `/ai/test`, `PUT /system/variables*`,
and `/sessions/health` return 403 without the env, blocking global
mutations from any tenant.

---

## Step 4 — Post-deploy smoke

From a fresh browser session against the production dashboard:

1. Sign in. Verify redirect to `/select-org`.
2. Select the EscortsHub org. Verify redirect to `/dashboard`.
3. Open `/dashboard/leads`. Verify list renders (tenant-scoped).
4. Open `/dashboard/whatsapp`. Verify session "tester" (or current prod
   session name) shows up with status.
5. Send a real WhatsApp message to the connected number. Verify the
   inbound shows up in the conversation view within 5 seconds.

Concurrently, on Hetzner:

```bash
pm2 logs whatsapp-service --lines 200 | grep -E "UNIFIED-WRITE|UNSCOPED-READ|TENANT-GUARD"
```

Expected:

- Zero `[UNIFIED-WRITE] session ... has no tenantId` lines. Any
  occurrence means a session row missed the backfill — abort and
  re-backfill.
- `[UNSCOPED-READ]` lines are expected for now in AI-thinking flows
  (`getAllLeads()`, `findLeadByPhone`). They are tracked in PR5b as
  scoped-read migrations. Each warn includes the call signature for
  triage.
- Zero `[TENANT-GUARD]` rejections from production traffic. Any
  occurrence means a tenant attempted to access another tenant's
  resource — investigate the request log.

---

## Step 5 — Lock down

Once 30 minutes of clean logs pass and one real customer interaction has
been validated, this PR's deploy is considered stable. Then:

- [ ] Append an entry to `docs/deployment/secrets-rotation.md` documenting any secret movement during this rollout.
- [ ] Open the PR5b tracking issue for the destructive cleanup (NOT NULL constraints, `@@unique([phone, tenantId])`, DROP `messages.session_id`, RENAME `ai_knowledge_base`).
- [ ] Decide if the `WHATSAPP_OPERATOR_HMAC_TENANT_ID` workflow is needed; if not, leave unset permanently.

---

## Rollback

If step 4 reveals data leak or runtime drops that backfill couldn't
prevent, rollback in reverse:

1. `pm2 stop whatsapp-service leadcrm-api` on Hetzner. Inbound WhatsApp
   queues at the WhatsApp side.
2. `git revert <merge-commit-of-PR-11>` on `main` and force-push to
   trigger Vercel revert.
3. SSH Hetzner: `cd /opt/leadcrm && git fetch && git reset --hard <pre-PR11-commit> && pnpm install && pnpm --filter @leadcrm/api build && pnpm --filter @leadcrm/whatsapp-service build && pm2 restart all --update-env`.
4. The migrations applied in step 1 are **additive** (new nullable
   columns, new tables) and stay in place. They do not need to be rolled
   back; the old code ignores them.
5. The `tenant_id` values populated in step 2 stay in place. They do not
   harm the old code.

After rollback, post-mortem before retry.
