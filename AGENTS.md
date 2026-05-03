# AGENTS.md - LeadsCRM Agent Quick Reference

<!-- ~20 line concise reference for autonomous coding agents. Keep terse. -->

## Scope

LeadsCRM: Next.js dashboard, NestJS API, WhatsApp svc, PostgreSQL (Prisma), Clerk auth, Turborepo.

Stack: Next.js 14.2.15 / NestJS / Supabase Postgres / Prisma / Clerk / pnpm 9.0.0.
Status: MVP (dashboard+api+db); WhatsApp+AI integrating.

## Commands

Run order: review docs -> execute tasks -> document learnings.

**Development:**

- `pnpm dev` (all services) | `pnpm dev:dashboard` | `pnpm dev:api` | `pnpm dev:whatsapp`

**Build & Test:**

- `pnpm build` | `pnpm build:fast` | `pnpm build:production`
- Single backend test: `cd apps/api && pnpm run test -- --testNamePattern "Name|Regex"`
- Test watch (API): `cd apps/api && pnpm test:watch`
- All tests: `pnpm test` | E2E: `pnpm test:e2e` | Coverage: `pnpm test:coverage`

Quality: pnpm lint | lint:fix | typecheck | format | clean:cache | rebuild

**Database:**

- `pnpm db:generate` | `pnpm db:migrate:dev` | `pnpm db:studio`

**Quality & DB:**

- `pnpm lint` | `pnpm lint:fix` | `pnpm typecheck` | `pnpm format`
- `pnpm db:generate` (after schema changes) | `pnpm db:studio` | `pnpm db:migrate:dev`
- `pnpm clean:cache` | `pnpm rebuild` (full cleanup)

## Monorepo Structure

```
apps/dashboard/           # Next.js frontend (port 3001)
apps/api/                 # NestJS backend (port 3003)
apps/docs/                # Documentation site (port 3004)
apps/whatsapp-service/    # WhatsApp integration (port 3002)
packages/db/              # Prisma schema + client (PostgreSQL)
packages/config-eslint/   # Shared ESLint config
packages/config-ts/       # Shared TypeScript config
```

Note: `packages/ui` was removed in T3.2 — the two components actually used (Alert, Toggle) now live in `apps/dashboard/components/ui/`. Dashboards consume their own `ui/` folder, not a shared package.

## Code Style & Architecture

**TypeScript Conventions:**

- Variables/functions: `camelCase` | Classes/Components: `PascalCase`
- Files: `kebab-case.ts` or `PascalCase.tsx` | Constants: `UPPER_SNAKE_CASE`
- Backend tests: `*.spec.ts` | Frontend tests: `*.test.tsx` in `__tests__/`

**Imports & Dependencies:**

- Use workspace packages: `@leadcrm/db`, `@leadcrm/config-eslint`, `@leadcrm/config-ts`
- Check existing packages before adding new dependencies
- Absolute imports preferred over relative imports

**Error Handling & Validation:**

- Backend: class-validator DTOs, structured try/catch with logging
- Frontend: Error boundaries, client-side validation before API calls
- API responses: `{ success: boolean, data?: any, error?: string }`

**Architecture & Formatting:**

- Prettier + ESLint; order imports: node, external, @leadcrm/\*, relative; no unused. Backend: NestJS modules (AuthModule, LeadsModule, MessagingModule)
- Types first: prefer explicit return types on public funcs; narrow unknown -> validate. Frontend: Next.js App Router, React components with TypeScript
- Error pattern: throw typed errors, log context once; client returns { success:false,error }. Database: Prisma with PostgreSQL, UUIDs as PKs, proper indexes

<!-- Copilot / Cursor rules integrated above (see .github/copilot-instructions.md) -->

## Database Schema (PostgreSQL)

**Key Models:** User (Clerk integration), Lead, Message, WhatsAppConversation, WhatsAppSession, WhatsAppWhitelistLog, MessageTemplate, ProactiveMessage, AiTrainingInteraction, ai_knowledge_base, ai_configuration
**Features:** UUID PKs, tags as JSON, enums in Spanish (LeadStatus, MessageDirection, MessageStatus, MessageType), auto timestamps, soft delete (`deletedAt`) on Lead and Message
**Relations:** Message → Lead (nullable FK, ON DELETE SET NULL), WhatsAppConversation → Message (nullable FK, ON DELETE SET NULL) — the dual-write between `messages` and `whatsapp_conversations` is unified via this FK (T1.1-bis)
**No Campaign model:** the `create_campaigns_table` / `create_campaign_leads_table` migrations were applied historically but the tables were dropped in T1.4. Do not reintroduce unless the feature is designed from scratch.

## Security & Environment

**Environment Variables (Required):**

```bash
DATABASE_URL="postgresql://..."        # Supabase PostgreSQL (pooler)
DIRECT_URL="postgresql://..."          # Supabase direct (migrations)
CLERK_SECRET_KEY="sk_test_..."         # API server-side
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_WEBHOOK_SECRET="whsec_..."       # Signed Clerk → /api/webhooks/clerk
WHATSAPP_SERVICE_HMAC_SECRET="<64-hex>" # Shared HMAC across dashboard, API Nest, whatsapp-service. Without it the service returns 500 to every signed request.
OPENROUTER_API_KEY="sk-or-..."         # AI primary
GEMINI_API_KEY="..."                   # AI fallback
```

**Security Rules:**

- NEVER commit secrets/keys — use `.env` files only (all `.env*` are in `.gitignore` except `.env.example`).
- All Nest controllers are gated by `@UseGuards(ClerkAuthGuard)` except the webhook endpoints (`/whatsapp/webhook` and `/api/webhooks/clerk`).
- Server-to-server traffic to the whatsapp-service is gated by HMAC-SHA256 (`x-service-signature` + `x-service-timestamp`, 5-min replay window). Helpers at `apps/dashboard/lib/service-auth.ts` and `apps/api/src/whatsapp/service-auth.ts`; verifier at `apps/whatsapp-service/src/middleware/auth.ts`.
- Use class-validator for input validation (every Nest DTO).
- **RLS in Supabase is intentionally off** (13/13 tables, 0 policies). Option C of PRD T0.1 — operation is single-admin and every DB client uses a role that bypasses RLS. Re-open if a second user appears, PostgREST is exposed, or a Clerk↔Supabase JWT bridge is introduced.

## API Endpoints

**Auth:** Clerk JWT required everywhere except `/api/webhooks/*` (which carry their own signing).
**Format:** Standard `{ success, data, error }` responses.
**Key Routes:** `/api/leads` (CRUD + soft delete), `/api/templates` (CRUD + preview), `/api/whatsapp/webhook`, `/api/webhooks/clerk`.
**Proxy to whatsapp-service:** the dashboard never calls `localhost:3002` directly — every request goes through `apps/dashboard/app/api/whatsapp/[...path]/route.ts`, which `requireClerkToken` + signs HMAC before forwarding. WebSocket (Socket.IO) is the only channel that bypasses the proxy — it uses `getWhatsAppSocketUrl()` directly.

## Testing Strategy

**Unit Tests:** Jest with `*.spec.ts` (backend) and `*.test.tsx` (frontend).
**What exists today:** 10 tests `leads.service.spec.ts`, 6 tests `whatsapp.controller.spec.ts` (Nest guard overridden via `overrideGuard(ClerkAuthGuard)`), 6 tests `apps/whatsapp-service/src/middleware/auth.spec.ts` (HMAC round-trip + replay window + tamper detection), 8 tests in `apps/whatsapp-service/src/services/ai-thinking/__tests__/`, 1 integration spec.
**Commands:** `pnpm test:watch` for development, `pnpm test:coverage` for coverage.
**Coverage target:** no enforced minimum yet; aspirational 80% on critical business logic.

## Git & Development Workflow

**Branches:** `feature/description`, `fix/issue-number`, `hotfix/critical`  
**Commits:** Conventional format - `feat(leads): add AI classification`  
**PRs:** Include tests, screenshots for UI changes, document breaking changes

## Turborepo & Performance

**Task Dependencies:** Build depends on db:generate, typecheck on ^typecheck  
**Caching:** Intelligent caching for unchanged code, parallel execution  
**Troubleshooting:** `pnpm clean:cache`, `turbo daemon stop`, `pnpm rebuild`

## AI Assistant Integration

**MCP Tools:**

- Context7: Real-time library documentation
- Sequential Thinking: Complex problem analysis
- Browser: Web automation and testing

**Benefits:** Reduced context explanation, better architectural decisions, shared knowledge base
