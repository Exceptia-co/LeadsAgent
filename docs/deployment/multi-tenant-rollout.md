# Multi-tenant rollout runbook (PR1-PR5a)

Deploy gate for PR #11 (B1 multi-tenant foundation + runtime enforcement).
This runbook is **operative**, not informational — every step is a hard
gate. Skipping any one of them risks silent data corruption or runtime
message drops.

---

## Order of operations (READ FIRST)

The HMAC contract is **breaking**: code post-PR5a expects
`HMAC(timestamp.tenantId.body)`, code pre-PR5a expects `HMAC(timestamp.body)`.
Once any of the three apps deploys the new code while the others are
still on the old code, every cross-app request fails signature
verification until the lagging app catches up.

That makes the rollout sensitive to **what triggers a deploy**:

- Vercel auto-deploys the dashboard on every push to `main`.
- `develop` does NOT auto-deploy anywhere. Merging into `develop` is
  safe at any point and is required for the pre-staging step.
- Hetzner is manual; nothing happens until somebody runs `pm2 restart`.
- Supabase prod migrations and backfill are independent of either.

The safe order is therefore:

  pre-flight → merge PR #11 into `develop` (safe — no auto-deploy) → migrations (Step 1) → backfill (Step 2) → pre-stage Hetzner build from `origin/develop` (Step 3) → merge `develop` → `main` + immediate `pm2 restart` Hetzner (Step 4 — the cutover) → post-deploy smoke (Step 5)

Two distinct merges happen, each at a different gate:

| Merge | When | Why |
|---|---|---|
| PR #11 → `develop` | Pre-flight (safe) | `develop` is the source for Hetzner pre-staging in Step 3. Without this merge, Step 3 pre-stages stale code and Step 4 deploys nothing new. |
| `develop` → `main` | Step 4 (cutover) | This is what triggers Vercel to auto-deploy the dashboard with the new HMAC contract. Pair it with the Hetzner restart inside the same window. |

Do **not** merge to `main` during pre-flight — that flips Vercel to the
new HMAC contract before the schema and data are ready, and before
Hetzner can flip with it. Vercel's auto-deploy from `main` cannot be
rolled back without a force-push or a revert PR, both of which extend
the mismatch window.

---

## Pre-flight

- [ ] PR #11 approved by reviewers and CI green on `feature/b1-pr5a-runtime-enforcement`.
- [ ] **Merge PR #11 into `develop`** (NOT into `main` yet). `develop` does not auto-deploy anywhere; this merge is what makes the PR5a stack reachable for the Hetzner pre-stage in Step 3. Confirm by checking that the PR head commit is now an ancestor of `origin/develop` (this works regardless of which round of follow-up commits the PR is at):
      ```bash
      git fetch origin develop feature/b1-pr5a-runtime-enforcement
      PR_HEAD=$(git rev-parse origin/feature/b1-pr5a-runtime-enforcement)
      git merge-base --is-ancestor "$PR_HEAD" origin/develop \
        && echo "✅ PR #11 head $PR_HEAD is in develop" \
        || { echo "❌ PR #11 head $PR_HEAD is NOT yet in develop — merge it before continuing"; exit 1; }
      ```
- [ ] **Do NOT merge `develop` → `main` yet** — that merge is Step 4 (cutover). Vercel watches `main`; flipping main now would deploy the new HMAC contract before the database is ready and before Hetzner can flip with it.
- [ ] Hetzner VPS `46.225.26.89` SSH access verified.
- [ ] Supabase prod project `yxjzsargboxnuwnbuzax` (CRMWhatsApp) accessible via the `prisma` CLI from your local repo (DATABASE_URL/DIRECT_URL captured).
- [ ] Clerk Production org "EscortsHub" created in `dashboard.clerk.com` (Production environment, not Development). Capture its `org_id` — it differs from the Development one.
- [ ] **Clerk Production webhook for `organization.*` events configured**:
      - URL: `https://api.<your-domain>/api/webhooks/clerk/organizations`
      - Subscribed events: `organization.created`, `organization.updated`, `organization.deleted` (only these three, no others).
      - Capture the Signing Secret (`whsec_*`) and store it as `CLERK_ORG_WEBHOOK_SECRET` in `/opt/leadcrm/apps/<api>/.env` on Hetzner.
      - **Note**: this is a *separate* secret from `CLERK_WEBHOOK_SECRET` — that one drives the user-events webhook (`/api/webhooks/clerk` in the Next dashboard, runs on Vercel). The org webhook handler runs in the Nest API on Hetzner; Vercel does not consume `CLERK_ORG_WEBHOOK_SECRET`.
      - Without this step, new orgs created in Clerk Production never auto-create a `tenants` row, and any user belonging to a non-backfilled org receives `403 "Tenant not provisioned"`. EscortsHub specifically was bootstrapped manually during initial rollout, so it is not affected.
      - Verification: `ssh hetzner 'grep "^CLERK_ORG_WEBHOOK_SECRET=" /opt/leadcrm/apps/api/.env'` returns a non-empty value, and `pm2 logs leadcrm-api` after restart shows route `Mapped {/api/webhooks/clerk/organizations, POST}` without `CLERK_ORG_WEBHOOK_SECRET is not configured` errors.
- [ ] HMAC secret rotated and propagated to all 3 surfaces (.env Hetzner, Vercel envs, dashboard developers' local .env). See `docs/deployment/secrets-rotation.md`.
- [ ] Confirm `WHATSAPP_OPERATOR_HMAC_TENANT_ID` is **UNSET** on Hetzner. Operator endpoints stay locked.
- [ ] Decide on the cutover window. Plan for a ~3-5 min total mismatch tolerance (see Step 4).

---

## Step 1 — Apply migrations to Supabase prod

*Executed: 2026-05-02. Variation from runbook: instead of `prisma migrate deploy`,
the migration was applied via Supabase MCP `execute_sql` with the full SQL of
the B1 foundation migration. This was a valid path because no fragments of
that migration had been previously applied to prod, so the "no `IF NOT EXISTS`"
caveat below did not bite. Future runs SHOULD prefer `prisma migrate deploy`
to keep `_prisma_migrations` in sync.*

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

The schema is now compatible with both PR5a code (which writes
`tenant_id`) and pre-PR5a code (which ignores the new nullable column).
You are still safe to NOT have merged to `main` yet — production code is
still pre-PR5a, the schema is compatible.

---

## Step 2 — Backfill prod (BEFORE merging to `main`)

If the new code reaches production before backfill finishes, the runtime
drops every inbound WhatsApp message with
`[UNIFIED-WRITE] session ... has no tenantId`. Backfill must come first.

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

At this point the database is ready for the new code. The dashboard,
API and whatsapp-service are still running pre-PR5a. **Production is
intact** — old code reads/writes the new columns as null and the
backfilled tenant_ids are simply ignored.

---

## Step 3 — Pre-stage Hetzner build (no restart yet)

Build the new code on Hetzner so the cutover in Step 4 is just a
`pm2 restart`, not a multi-minute rebuild. This step does **not** flip
the running code yet — pm2 keeps serving the old build until the
restart command in Step 4.

`origin/develop` is the source of truth here. Pre-flight already merged
PR #11 into `develop`, so `origin/develop` contains the PR5a stack but
no Vercel deploy was triggered (Vercel watches `main`, not `develop`).

```bash
ssh root@46.225.26.89

cd /opt/leadcrm
# Capture the currently-running commit so rollback (Step 7) knows the
# exact state to restore.
git rev-parse HEAD > /tmp/leadcrm-pre-pr5a.sha

# Pull the merged develop (which now has PR #11 from pre-flight).
# Do NOT touch main yet — that merge is Step 4.
git fetch origin develop
git checkout origin/develop -- .

# Sanity check: the working tree should now contain the PR5a code.
# Spot-check by grepping for the new HMAC tenant header that PR5a-bis
# introduced:
grep -q "x-service-tenant-id" apps/whatsapp-service/src/middleware/auth.ts \
  && echo "✅ PR5a stack staged" \
  || { echo "❌ aborting: develop is missing PR5a code"; exit 1; }

pnpm install --frozen-lockfile
pnpm --filter @leadcrm/api build
pnpm --filter @leadcrm/whatsapp-service build
```

Verify the new dist exists but the running pm2 process is still on the
old code:

```bash
ls -la apps/api/dist/main.js apps/whatsapp-service/dist/index.js
pm2 jlist | jq '.[] | {name, status, pid, uptime}'
```

Both `dist/` files should be freshly modified, but the pm2 `pid` and
`uptime` fields should be unchanged from before this step. The running
processes are still the pre-PR5a build until Step 4's `pm2 restart`.

> **Alternative — pre-stage from the PR branch directly** (use only if
> your team policy forbids touching `develop` until a release boundary):
>
> A bare `git fetch origin <sha>` fails on GitHub unless the SHA is
> already advertised by a ref. Use one of these instead:
>
> ```bash
> # Option A — fetch the PR's head ref. This works on any GitHub PR
> # without needing the branch to exist locally.
> git fetch origin pull/11/head:pr-11
> git checkout pr-11 -- .
>
> # Option B — fetch the feature branch directly.
> git fetch origin feature/b1-pr5a-runtime-enforcement
> git checkout origin/feature/b1-pr5a-runtime-enforcement -- .
> ```
>
> If you take this path, Step 4 must merge that **same commit** into
> `main`, not `develop`. Replace
> `git merge --ff-only develop` with
> `git merge --ff-only origin/feature/b1-pr5a-runtime-enforcement` (or
> the local `pr-11` ref). The two halves of the deploy must come from
> the same commit; pinning via the PR ref is the only way to guarantee
> that without going through `develop`.

Stay logged in to Hetzner for Step 4.

---

## Step 4 — Merge to `main` and cutover Vercel + Hetzner together

*Executed: 2026-05-02. Variation from runbook: the merge used `git merge --no-ff`
instead of `--ff-only` because `main` was already ahead of `develop` by accumulated
merge commits from prior PRs (#6-#9), making fast-forward impossible. This is
the standard merge style of this repo. Cutover sequence and risk profile are
unchanged.*

This is the breaking moment. Your goal is to flip both Vercel and
Hetzner within ~30 seconds of each other so the HMAC mismatch window is
small. WhatsApp inbounds during the window are queued by WhatsApp's own
servers and delivered after the gap closes.

In a single coordinated stretch:

1. From your laptop, merge `develop` → `main`. Push.
   ```bash
   git checkout main
   git merge --ff-only develop
   git push origin main
   ```
   Vercel starts building the dashboard immediately. Watch in
   `vercel.com/dashboard` — note the build duration on previous deploys
   (typically 2-3 min for this repo).

2. While Vercel is building, watch the build log. As soon as the Vercel
   "Ready" state is about to land (last 30s of the build), trigger the
   Hetzner restart from the Hetzner SSH session you kept from Step 3:
   ```bash
   pm2 restart leadcrm-api whatsapp-service --update-env
   ```
   This restarts both Hetzner services on the pre-staged build instantly
   (~5s).

3. Watch the Vercel deploy go green. The dashboard now signs with the
   new HMAC contract; Hetzner now verifies the new HMAC contract.

4. Confirm `pm2 logs whatsapp-service --lines 30` shows
   `Environment validated (NODE_ENV=production)` and the WhatsApp client
   reconnects within 30 seconds.

The mismatch window is bounded by the time between (Hetzner pm2 restart)
and (Vercel deploy go-live). Aim for <60 seconds. WhatsApp messages sent
during that window are NOT lost — WhatsApp's servers retry until they
get a 200 from the inbound webhook, which kicks in once Hetzner is
back.

If you cannot watch Vercel build progress in real time, an even simpler
ordering: push to `main`, immediately `pm2 restart` on Hetzner. Vercel
takes 2-3 min to build; Hetzner restart takes ~5s. The dashboard is
unavailable during the Vercel build (showing the previous deploy until
the new one is ready), so any dashboard request that needs the new
contract will be queued client-side or fail with a transient error
that resolves on retry.

---

## Step 5 — Post-deploy smoke

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

## Step 6 — Lock down

Once 30 minutes of clean logs pass and one real customer interaction has
been validated, this PR's deploy is considered stable. Then:

- [ ] Append an entry to `docs/deployment/secrets-rotation.md` documenting any secret movement during this rollout.
- [ ] Open the PR5b tracking issue for the destructive cleanup (NOT NULL constraints, `@@unique([phone, tenantId])`, DROP `messages.session_id`, RENAME `ai_knowledge_base`).
- [ ] Decide if the `WHATSAPP_OPERATOR_HMAC_TENANT_ID` workflow is needed; if not, leave unset permanently.

---

## Rollback

If Step 5 reveals data leak or runtime drops that backfill couldn't
prevent, rollback in reverse:

1. From the Hetzner SSH session, restart back onto the pre-PR5a build:
   ```bash
   PRE_SHA=$(cat /tmp/leadcrm-pre-pr5a.sha)
   git checkout "$PRE_SHA" -- .
   pnpm install --frozen-lockfile
   pnpm --filter @leadcrm/api build
   pnpm --filter @leadcrm/whatsapp-service build
   pm2 restart leadcrm-api whatsapp-service --update-env
   ```
   Hetzner is back on the old HMAC contract within ~30 seconds.

2. Revert the merge on the dashboard side:
   ```bash
   git checkout main
   git revert -m 1 <merge-commit-sha-of-PR-11>
   git push origin main
   ```
   Vercel auto-deploys the revert (2-3 min). The dashboard is back on
   the old HMAC contract once the build lands.

3. The migrations applied in Step 1 are **additive** (new nullable
   columns, new tables) and stay in place. They do not need to be rolled
   back; the old code ignores them.

4. The `tenant_id` values populated in Step 2 stay in place. They do not
   harm the old code.

After rollback, post-mortem before retry. Save the failing logs from
`pm2 logs --lines 1000` for analysis.

---

## Scope and reusability

This runbook is **one-shot for the initial PR1-PR5a multi-tenant foundation**.
It is not the right entry point for adding a new tenant to a system that already
has the multi-tenant stack live (no migrations to apply, no backfill needed —
just create the Org in Clerk Production and let the configured webhook auto-create
the `tenants` row). For that flow, see `docs/deployment/onboard-new-tenant.md`
(TODO if not yet present).

---

## Observed behavior of `organization.deleted` (smoke 2026-05-03)

The `organization.deleted` webhook handler executes
`prisma.tenant.deleteMany({ where: { clerkOrgId } })` (`apps/api/src/clerk-webhooks/clerk-organizations.service.ts:79`).
This is a **hard delete with no `try/catch`** — Prisma errors propagate as
`InternalServerErrorException` (HTTP 500), triggering Svix retries.

Smoke run on 2026-05-03 19:51-19:53 UTC:

- Created a virgin test org `WebhookSmokeTest` in Clerk Production.
- The handler created the `tenants` row in ~3 s (logs:
  `Synced Clerk organization org_3DECW... to tenant d1405e3a-...`).
- An automatic `organization.updated` followed because the handler
  patches `public_metadata.tenant_id` back to Clerk; the second sync
  was an idempotent no-op (Prisma `upsert` with the same fields).
- Deleted the test org from Clerk. The handler emitted
  `Deleted local tenant for Clerk organization org_3DECW...` and the
  `tenants` row disappeared cleanly. No FK constraint involved because
  the test org had no leads/messages/sessions associated.

**Untested path** (do NOT exercise in prod): an org with FK references
(real customer data) would likely trigger `P2003`/`P2014` on delete,
since the schema defines `Tenant` foreign keys without `ON DELETE CASCADE`.
Two viable resolutions for a future PR:

1. Switch the handler to soft delete (set `deleted_at` on `tenants`,
   propagate scoped reads to filter it out). Preserves customer data.
2. Add `ON DELETE CASCADE` to all `tenant_id` FKs in the Prisma schema.
   Aggressive — destroys customer data on org deletion. Only acceptable
   if compliance requires hard delete on tenant offboarding.

For now, deleting an org with associated data via the Clerk UI will fail
the webhook with 500 + Svix retries. The Tenant row will remain orphaned
in Supabase until manually reconciled.
