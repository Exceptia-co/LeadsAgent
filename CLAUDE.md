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

- `Lead` — CRM entity, unique phone, `whatsapp_authorized` boolean, soft-delete (`deleted_at`)
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
- `CLERK_WEBHOOK_SECRET` — required by `apps/dashboard/app/api/webhooks/clerk/route.ts`
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

## Project State

The stabilization PRD (`PRD-ESTABILIZACION.md` v5.23) closed on 2026-04-18. All five phases + T0.4-ter shipped:

- **Phase 0 — Security**: HMAC server-to-server auth, Clerk guards on every Nest controller, Hetzner firewall locked down (SSH /24, ports 3002/3003 closed externally), Postgres 17.6
- **Phase 1 — Integrity**: Unified dual-write — `whatsapp_conversations.message_id` FK, transactional writer, JOIN reader, backfilled 58 orphans, dropped duplicate columns
- **Phase 2 — Wiring**: Socket.IO `auth_failure → AUTH_INVALID`, Templates moved to Nest, per-session WhatsApp rate limit (200/h)
- **Phase 3 — Cleanup**: `WhatsAppServiceRefactored` + `@leadcrm/ui` removed (~−4,350 LOC net)
- **Phase 4 — Scalability**: Soft delete, pagination, N+1 in `getConversations` eliminated via SQL JOIN
- **Phase 5 — Testing**: 22+ Jest unit tests across API + whatsapp-service

The AIThinkingService modularization (formerly branch `refactor/whatsapp-service`) is complete; module lives at `apps/whatsapp-service/src/services/ai-thinking/`.

### PLAN-WHATSAPP-AGENT-MULTITENANT (v7.3)

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
- **T3**: `apps/api/src/whatsapp/whatsapp.service.ts:114` interprets WhatsApp epoch in seconds as milliseconds → `created_at` lands in 1970. Functional but messes up date ordering
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
  pnpm install
  pm2 restart all --update-env
'
```

Effects: ~15-30s downtime while installing deps and restarting; the WhatsApp `test` session disconnects briefly and reconnects via LocalAuth. Verify with `pm2 logs whatsapp-service --lines 30` — should show `Environment validated (NODE_ENV=production)` and `[DEDUPE] Checking msgId=...` on inbound messages.

**Vercel (dashboard at `guatsapp.me`)** auto-deploys from the configured Production Branch (typically `main`). To promote `develop` → prod: `git checkout main && git merge develop && git push`.

**Phase C will add** `.github/workflows/deploy-hetzner.yml` with `workflow_dispatch` (semi-automatic deploy via GitHub Actions button), using `pm2 reload` (not restart) once the whatsapp-service supports zero-downtime reload. Auto-on-push-to-main is vetoed until then because each restart drops the WhatsApp Chromium session.
