# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LeadsCRM is an AI-powered CRM with WhatsApp automation. Turborepo monorepo (pnpm workspace) with three apps and shared packages.

The companion `AGENTS.md` is a ~80-line quick reference; `CLAUDE.md` (this file) is the canonical source of architectural and historical context. The detailed multi-tenant rollout plan lives in `PLAN-WHATSAPP-AGENT-MULTITENANT.md`; the post-stabilization snapshot lives in `ANALISIS-ESTADO-PROYECTO.md`.

## Commands

### Development

```bash
pnpm dev                   # Start all services (dashboard:3001, api:3003, whatsapp:3002)
pnpm dev:dashboard         # Dashboard only (port 3001)
pnpm dev:api               # API only (port 3003)
pnpm dev:whatsapp          # WhatsApp service only (port 3002)

# Docker (only Redis — DB is Supabase cloud)
docker compose up -d       # Start Redis on host port 6381 → container 6379
docker compose down
```

### Build & Quality

```bash
pnpm build                 # Full build with dependency graph
pnpm build:fast            # Parallel build, no daemon
pnpm lint                  # ESLint
pnpm lint:fix              # Auto-fix
pnpm typecheck             # TS validation across all workspaces
pnpm format                # Prettier write
```

### Testing

```bash
pnpm test                  # All tests (Jest in API + whatsapp-service)
pnpm test:e2e              # E2E
pnpm test:coverage         # Coverage reports

# Single test file/regex
cd apps/api            && pnpm run test -- --testNamePattern "Name|Regex"
cd apps/whatsapp-service && pnpm run test -- --testPathPattern "redis|hmac"
```

### Database

```bash
pnpm db:generate           # Generate Prisma client (run after schema changes)
pnpm db:generate:win       # Windows-specific (PowerShell wrapper)
pnpm db:migrate:dev        # Create migration
pnpm db:studio             # Prisma Studio GUI
pnpm db:reset              # Reset DB (⚠️ destructive)
```

### Maintenance

```bash
pnpm clean:cache                    # Clear Turborepo + .next/dist caches
pnpm rebuild                        # clean:cache + install + db:generate + build:fast
pnpm whatsapp:cleanup-chrome        # Kill stale Puppeteer Chrome sessions
pnpm whatsapp:cleanup-chrome-force  # Force-kill (use only after locked sessions)
pnpm audit:infra                    # Run scripts/audit-infra.ts (Hetzner/Supabase/Vercel sanity check)
```

## Architecture

```
apps/
├── dashboard/             # Next.js 14 frontend (port 3001) — Clerk auth, SWR, Tailwind, Radix UI
├── api/                   # NestJS 10 REST API (port 3003) — Clerk JWT, Prisma, Throttler
├── whatsapp-service/      # Express + whatsapp-web.js (port 3002) — Puppeteer, Socket.IO, Redis
└── docs/                  # Next.js docs site

packages/
├── db/                    # Prisma 6.15 schema & client — published as @leadcrm/db
├── config-eslint/         # @leadcrm/config-eslint
└── config-ts/             # @leadcrm/config-ts
```

`packages/ui` was removed in T3.2 (commit `04c1113`); the two components actually used (Alert, Toggle) live in `apps/dashboard/components/ui/`. The local artifact directory was cleaned up on 2026-05-01 — there is no shared UI package to reinstate.

**Data Flow:**

```
WhatsApp ↔ WhatsApp Service ↔ NestJS API ↔ PostgreSQL (Supabase)
                                    ↑
                            Next.js Dashboard
```

The dashboard never talks directly to the whatsapp-service; every call is proxied through Next route handlers that sign requests with HMAC-SHA256 (see `apps/dashboard/app/api/**/route.ts` and `apps/api/src/whatsapp/service-auth.ts`). The whatsapp-service rejects any unsigned request with `500 "service auth misconfigured"` if the secret is missing.

### Workspace imports

Use `@leadcrm/db`, `@leadcrm/config-eslint`, `@leadcrm/config-ts`. There is no shared `@leadcrm/ui`.

## Database Schema

Schema lives in `packages/db/prisma/schema.prisma`. Core models:

- `Lead` — CRM entity, unique phone, `whatsapp_authorized` boolean (nullable), soft-delete (`deleted_at`).
  `whatsapp_authorized` authorises **conversation**, not outbound initiative. Proactive sends
  additionally require a non-deleted INBOUND `Message` for the same tenant **and session**
  within `PROACTIVE_INBOUND_WINDOW_DAYS` (default 30, capped at 90) — see PR #12
- `Message` — Conversation log with `direction` (INBOUND/OUTBOUND) and `status`
- `WhatsAppConversation` — Session metadata; canonical link to `Message` is `message_id` FK (T1.1-bis unified the legacy dual-write)
- `WhatsAppSession` — QR codes, reconnect state
- `ai_knowledge_base` — Knowledge entries with category + keyword search
- `ai_configuration` — Key/value config, used by `SystemPromptService` for runtime prompt overrides (cache + background refresh pattern)

**Spanish-domain enums:**

- `LeadStatus`: `NUEVO | CONTACTADO | QUALIFIED | GANADO | PERDIDO`
- `MessageDirection`: `INBOUND | OUTBOUND`
- `MessageStatus`: `PENDING | SENT | DELIVERED | READ | FAILED`

UUIDs are primary keys throughout. Cascade was relaxed in T4.1 to support soft delete.

## Code Patterns

### NestJS API (apps/api)

- Modules: `AuthModule`, `LeadsModule`, `TemplatesModule`, `WhatsAppModule`, `ProactiveMessagesModule`, `PrismaModule`
- `ClerkAuthGuard` is class-level on every sensitive controller; `@CurrentUser()` injects user context
- Response shape: `{ success: boolean, data?: T, error?: string }`
- Outbound calls API → whatsapp-service use `signServiceRequest()` with `x-service-timestamp` + `x-service-signature` (HMAC-SHA256). See `apps/api/src/whatsapp/service-auth.ts` and `WhatsAppService.sendMessage`
- `app.module.ts` already loads `.env` via `ConfigModule.forRoot({ envFilePath: [process.cwd()/.env, ../../.env] })` — Nest reads root `.env` even when CWD is `apps/api/`

### WhatsApp Service (apps/whatsapp-service)

- TS path aliases (see `tsconfig.json`): `@/*`, `@/types/*`, `@/services/*`, `@/controllers/*`, `@/utils/*`, `@/config/*`, `@/middleware/*`, `@/routes/*`
- AI thinking pipeline modularized at `src/services/ai-thinking/`: `CacheManager`, `IntentAnalyzer`, `ContextEnricher`, `ComplexityAnalyzer`, `KnowledgeRetriever`, `ResponseGenerator`, `StrategySelector`, `DecisionEngine`. Wired through `AIThinkingModuleFactory`
- Env validation: `src/config/env.ts` with zod — fail-fast in production if `WHATSAPP_SERVICE_HMAC_SECRET` is missing, warnings in dev
- Inbound message dedupe: Redis `SETNX whatsapp:dedup:{message.id}` with TTL 300s via `redisClient.setNX()` (fail-open: Redis error → treat as first-time). Reuse this primitive for any new dedupe flow
- Group/broadcast filter: `@g.us` and `status@broadcast` JIDs are dropped before parsing
- Typing indicator wraps the entire `processMessageWithAI` (start at handler entry, clear in `finally`) so the user sees "typing..." for the full ~5-6s LLM thinking window
- The runtime stays alive on `uncaughtException` / `unhandledRejection` (no `process.exit(1)`) so a crash in one session doesn't kill the others
- **Dev local con `PUPPETEER_HEADLESS=false`**: el Chrome de Puppeteer queda visible con DevTools abierto (`devtools = !isProduction && !headless` en `puppeteer.config.ts:103`). Cualquier interacción tuya con esa ventana (abrir DevTools, refrescar, scroll en panel de elementos) puede destruir el JS context y causar `Protocol error: Execution context was destroyed` en el siguiente `Client.sendMessage`. Para smoke runtime fiable: `PUPPETEER_HEADLESS=true pnpm dev` (la env var debe estar declarada en `turbo.json globalEnv` — ya incluida como `PUPPETEER_*`, ver patrón whitelist; también `dotenv.config()` no pisa env vars existentes, así que el override de shell gana sobre `.env`). Producción siempre es headless por `NODE_ENV=production`.

### Dashboard (apps/dashboard)

- Next.js 14 App Router, Clerk middleware in `middleware.ts`
- Every WhatsApp consumer goes through `/api/**/route.ts` proxies that sign requests with `WHATSAPP_SERVICE_HMAC_SECRET` (T0.4-ter)
- SWR for client-side data, Radix UI primitives, Tailwind with `tailwind-merge` + `clsx` (`cn` helper at `lib/utils.ts`)
- Reads env from `apps/dashboard/.env.local` (Next convention)

### Naming Conventions

- Variables/functions: `camelCase` | Classes/Components: `PascalCase`
- Files: `kebab-case.ts` or `PascalCase.tsx`
- Backend tests: `*.spec.ts` | Frontend tests: `*.test.tsx` (under `__tests__/`)

## Environment Variables

Files:

- `.env` — Development (root, Supabase + Docker Redis); read by both whatsapp-service (`dotenv.config()` in `index.ts`) and the Nest API (via `ConfigModule.forRoot`)
- `apps/dashboard/.env.local` — Next.js reads only this file. Must contain `NEXT_PUBLIC_API_URL`, `CLERK_*`, and `WHATSAPP_SERVICE_HMAC_SECRET`
- `apps/*/.env` — Production overrides on Hetzner VPS at `/opt/leadcrm/apps/{whatsapp-service,api}/.env`
- `.env.production` — Production defaults
- `.env.example` — Template (committed)

**Critical envs that break the HMAC chain if missing or mismatched:**

- `WHATSAPP_SERVICE_HMAC_SECRET` (64 hex chars) — must be **identical** in Vercel (dashboard), Hetzner VPS (both apps' `.env`), and every developer's local `.env`. Without it: whatsapp-service returns `500 "service auth misconfigured"`, dashboard proxy returns `500 "Proxy misconfigured: missing service auth secret"`
- `CLERK_WEBHOOK_SECRET` — required by `apps/dashboard/app/api/webhooks/clerk/route.ts` (user events: `user.created/updated/deleted`). Runs on Vercel.
- `CLERK_ORG_WEBHOOK_SECRET` — required by `apps/api/src/clerk-webhooks/clerk-organizations.controller.ts` (org events: `organization.created/updated/deleted`). Runs on Hetzner Nest API. **Distinct from `CLERK_WEBHOOK_SECRET`** — different webhook endpoint, different runtime, different signing secret. Without it: new orgs in Clerk Production never auto-create a `tenants` row. Vercel does NOT consume this secret (only Hetzner needs it).
- `WHATSAPP_ALLOW_NEW_LEADS` — defaults to `true` in code (lead-capture mode). Set to `false` only for "private support" deployments. **Resolution order: env > DB config > hardcoded default**

**Service Ports:**

| Service   | Port | URL                   |
| --------- | ---- | --------------------- |
| Dashboard | 3001 | http://localhost:3001 |
| API       | 3003 | http://localhost:3003 |
| WhatsApp  | 3002 | http://localhost:3002 |
| Redis     | 6381 | localhost:6381        |

**Quick Start:**

```bash
docker compose up -d       # Start Redis (DB is Supabase cloud)
pnpm install
pnpm db:generate
pnpm dev
```

`pnpm dev` runs a `predev` hook that kills any process on ports 3001/3002/3003 first (via `pnpm dev:clean` → `npx kill-port`). If you have another legitimate service on those ports, run it elsewhere or skip the hook with `pnpm exec turbo run dev`.

## Project State

The stabilization PRD (`PRD-ESTABILIZACION.md` v5.23) closed on 2026-04-18. All five phases + T0.4-ter shipped:

- **Phase 0 — Security**: HMAC server-to-server auth, Clerk guards on every Nest controller, Hetzner firewall locked down (SSH /24, ports 3002/3003 closed externally), Postgres 17.6
- **Phase 1 — Integrity**: Unified dual-write — `whatsapp_conversations.message_id` FK, transactional writer, JOIN reader, backfilled 58 orphans, dropped duplicate columns
- **Phase 2 — Wiring**: Socket.IO `auth_failure → AUTH_INVALID`, Templates moved to Nest, per-session WhatsApp rate limit (200/h)
- **Phase 3 — Cleanup**: `WhatsAppServiceRefactored` + `@leadcrm/ui` removed (~−4,350 LOC net)
- **Phase 4 — Scalability**: Soft delete, pagination, N+1 in `getConversations` eliminated via SQL JOIN
- **Phase 5 — Testing**: 22+ Jest unit tests across API + whatsapp-service

The AIThinkingService modularization (formerly branch `refactor/whatsapp-service`) is complete; module lives at `apps/whatsapp-service/src/services/ai-thinking/`.

### Phase B.1 — Multi-tenant foundation (closed 2026-05-02 / 2026-05-03)

PR #11 (commit `dcf81dd` = "feat(b1): multi-tenant foundation + runtime enforcement (PR1-PR5a combo)") merged to `main` 2026-05-02 and deployed to prod, followed by 4 follow-up Vercel-Prisma fixes (`bebdec6`, `c914cdb`, `0d949ac` + JWT v2 fix `c7efd6e`). Migration B1 applied to Supabase prod via MCP `execute_sql`; 731 rows backfilled; tenant `EscortsHub` provisioned (`923493fc-ffe9-49c6-9963-74e24eae0689` ↔ `org_3DDKQD4ThoPcwJnHC5mWTmrr5L3`).

Runtime enforcement now active:
- `TenantContextGuard` at `apps/api/src/auth/tenant-context.guard.ts` resolves `orgId → tenantId` server-side (Vía B lookup, cache LRU 60s) and gates every Nest controller. Equivalent middleware in `apps/whatsapp-service/src/middleware/tenant-guard.ts`.
- HMAC contract is **tenant-aware**: signing payload is `${timestamp}.${tenantId}.${body}` with `x-service-tenant-id` header (PR5a-bis). Old contract (`${timestamp}.${body}`) no longer accepted — both apps must speak v2.
- Cross-tenant requests return **404, not 403** — avoids id-existence leak (PR5a-quater).
- `WHATSAPP_OPERATOR_HMAC_TENANT_ID` env-based operator role placeholder; left UNSET in prod (default fail-closed: 403 on global mutations). PR5b will replace with proper JWT role claim.

Clerk Production webhook for `organization.*` configured 2026-05-03 19:51 UTC at `https://api.guatsapp.me/api/webhooks/clerk/organizations`, subscribed to `organization.created/updated/deleted`, signing secret in `CLERK_ORG_WEBHOOK_SECRET` on Hetzner. Smoke verified end-to-end with org `WebhookSmokeTest`: create → tenant row + metadata patch → delete → row removed cleanly. Untested path (orgs with FK references) likely fails with `P2003` — see `docs/deployment/multi-tenant-rollout.md` gap 3.5 for the deferred resolution (soft delete vs cascade).

Items deferred from PR5a:
- **B1.13 Prisma extension global** — PR5a opted for explicit per-service tenant scoping (every service writes `where: { tenantId }`) instead of magic auto-injection. Trade-off: more boilerplate but more debuggable. Revisit if scaling pain emerges.
- **B1.14 ESLint rule `no-unscoped-prisma`** — depends on B1.13. Postponed.
- **B1.2(a) JWT template "supabase"** — Vía A blocked by Clerk Student plan (custom session token claims rejected). Vía B (server-side lookup via TenantContextGuard) is the active workaround.

Destructive cleanups deferred to PR5b (post-stabilization, ≥1 week without webhook failures):
- B1.5 (`@@unique([tenantId, phone])`) requires confirming `tenant_id IS NOT NULL` on all rows.
- B1.7b (rename `ai_knowledge_base → ai_knowledge_items`) is coordinated with consumer code updates.

Full runbook + post-mortem in `docs/deployment/multi-tenant-rollout.md`.

### PLAN-WHATSAPP-AGENT-MULTITENANT (v7.6)

The multi-tenant + configurable AI agent plan went through 12 review rounds and was approved for full execution in branches.

**Phase A — Foundation hotfixes (merged 2026-04-19, PR #10, commit `1fd9e95`)**:

15 changes shipped (A1–A15-ter); details and rationale in `PLAN-WHATSAPP-AGENT-MULTITENANT.md`. Architectural decisions kept post-Phase A:

- `redisClient.setNX(key, value, ttlSeconds)` is the public primitive for atomic dedupe — reuse it for any new dedupe flow
- `validateEnv()` in `apps/whatsapp-service/src/config/env.ts` is the env contract — extend the zod schema when adding new envs
- "Cache in-memory + background refresh" (`SystemPromptService`) is the model for loading config from DB without making callers async
- Typing indicator covers the full LLM thinking window (started at handler entry, cleared in `finally`) — no artificial humanized delay; total latency dropped from ~15-18s to ~5-6s
- `WHATSAPP_ALLOW_NEW_LEADS` defaults to `true` — the bot must respond to any new number for lead capture to work

### Known technical debt (not blocking)

Tracked in `PLAN-WHATSAPP-AGENT-MULTITENANT.md`. Highlights:

- **T1**: `Message` rows are created with `lead_id=null` from whatsapp-service when the lead doesn't yet exist. JOIN-based readers miss them. Fix scheduled for Phase B
- **T2**: Both whatsapp-service and Nest API persist inbound messages, producing 3 `messages` rows for 2 real messages. Fix scheduled for Phase C: Nest API becomes sole owner; whatsapp-service writes only `whatsapp_conversations`
- **T3** — *fixed in PR #12*: `apps/api/src/whatsapp/whatsapp.service.ts` interpreted the WhatsApp epoch
  (seconds) as milliseconds → `created_at` landed in 1970. Stopped being harmless once the proactive
  consent window started reasoning about recency. The writer now goes through `toMessageDate()`.
  **Remaining debt**: rows already written with a 1970 date are not repaired — audit and fix is
  operational work, see `PREEXISTING-ISSUES.md`
- **Whitelist evaluated twice**: once in whatsapp-service, once in Nest API. Defaults are in sync (`true`) but coupling is fragile. Phase C will unify
- **Multi-device dedupe**: WhatsApp Linked Devices (`@lid`) can deliver the same message with different `message.id`. Current dedupe by `message.id` doesn't catch it. Future fix: secondary dedupe by `(from, body-hash, ±3s)`

### Resolved: WhatsApp service double init (2026-05-01, branch `fix/whatsapp-double-init`)

The "Initializing WhatsApp service implementation" log fired twice per boot because `WhatsAppService.ts` called `this.initialize()` fire-and-forget in its constructor and `index.ts` then awaited a second `initialize()` on the same singleton. Fixed with the **lazy idempotent init pattern** (`initialized` flag + `initializePromise` cache):

- Constructor no longer triggers init; bootstrap is the only caller.
- Concurrent calls share the same in-flight promise; resolved calls are no-ops; failed calls clear the promise so callers can retry.
- Same pattern applied to `WhatsAppServiceSimple` for direct callers (e.g. tests).
- Side-effect cleanup: `snapshotIntervalId` guarded against duplicate `setInterval`; alert callback registered with stable identity; `AlertManager.registerAlertCallback` dedupes by reference; `SessionHealthCheckService.offAlert` exposed and called in shutdown.
- Legacy `SessionRecoveryService.scheduleHealthChecks` + `HealthMetrics.scheduleHealthChecks` + `HealthMetrics.updateSessionHealthMetadata` removed as zombie code: no consumer reads `metadata.lastHealthCheck` (verified across `apps/api`, `apps/dashboard`, `packages/db`); the active signals — Redis heartbeat (every 30s, TTL 120s) and reactive `lastHealthCheck` updates on session events — already cover the same need.
- Boot order intentionally changed: `checkRedisConnection()` now runs **after** `redisClient.connect()` (the previous order was the accidental side-effect of the fire-and-forget race).

The lazy idempotent init pattern (`initialized + initializePromise`) is the convention in this repo for singleton async init — reuse it when adding similar services.

### Test suite status

21/21 active tests pass (15 pre-existing — HMAC originals + edge cases + redis.spec — plus 4 init idempotency + 2 alert callback dedupe added with the double-init fix). 22 pre-existing tests in `ai-thinking/__tests__/*` and `phase4-integration.test.ts` were deleted as dead debt during Phase A.

## Production deployment notes

**Hetzner VPS (46.225.26.89)** runs both the API and whatsapp-service under PM2:

- `whatsapp-service` (id 0) reads `/opt/leadcrm/apps/whatsapp-service/.env` via `dotenv.config()`
- `leadcrm-api` (id 1) reads `/opt/leadcrm/apps/api/.env` and falls back to root `.env` via `ConfigModule.forRoot`

**Manual deploy** (current process — automation deferred to Phase C):

```bash
ssh root@46.225.26.89 '
  set -e
  cd /opt/leadcrm
  git pull origin develop   # or main once merged
  pnpm install --frozen-lockfile
  pnpm build                # required: whatsapp-service runs node dist/index.js
  pm2 restart all --update-env
'
```

Do **not** drop the `pnpm build`. `apps/whatsapp-service` starts from
`dist/index.js`, so without it PM2 restarts the previous bundle and the deploy
looks successful while shipping nothing.

If you ever deploy the two services separately, **`leadcrm-api` goes first**: the
proactive consent gate in `whatsapp-service` filters by `sessionId`, and the Nest
webhook is what persists that `sessionId` on the inbound message. The other order
silently stops every proactive send — they are counted as `failed`, not raised as
an error.

Effects: ~15-30s downtime while installing deps and restarting; the WhatsApp `test` session disconnects briefly and reconnects via LocalAuth. Verify with `pm2 logs whatsapp-service --lines 30` — should show `Environment validated (NODE_ENV=production)` and `[DEDUPE] Checking msgId=...` on inbound messages.

**Vercel (dashboard at `guatsapp.me`)** auto-deploys from the configured Production Branch (typically `main`). To promote `develop` → prod: `git checkout main && git merge develop && git push`.

**Phase C will add** `.github/workflows/deploy-hetzner.yml` with `workflow_dispatch` (semi-automatic deploy via GitHub Actions button), using `pm2 reload` (not restart) once the whatsapp-service supports zero-downtime reload. Auto-on-push-to-main is vetoed until then because each restart drops the WhatsApp Chromium session.
