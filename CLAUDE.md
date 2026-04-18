# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LeadsCRM is an AI-powered CRM with WhatsApp automation. Turborepo monorepo with pnpm workspace containing three main applications and shared packages.

## Commands

### Development

```bash
pnpm dev                   # Start all services (dashboard:3001, api:3003, whatsapp:3002)
pnpm dev:dashboard         # Dashboard only (port 3001)
pnpm dev:api               # API only (port 3003)
pnpm dev:whatsapp          # WhatsApp service only (port 3002)

# Docker (solo Redis — DB es Supabase cloud)
docker compose up -d       # Start Redis
docker compose down        # Stop Redis
```

### Build & Quality

```bash
pnpm build                 # Full build with dependencies
pnpm build:fast            # Parallel build without daemon
pnpm lint                  # ESLint check
pnpm lint:fix              # Auto-fix lint issues
pnpm typecheck             # TypeScript validation
pnpm format                # Prettier formatting
```

### Testing

```bash
pnpm test                  # Run all tests
pnpm test:e2e              # E2E tests
pnpm test:coverage         # Coverage reports

# Single test (API)
cd apps/api && pnpm test -- --testNamePattern "Name|Regex"
cd apps/api && pnpm test:watch
```

### Database

```bash
pnpm db:generate           # Generate Prisma client (run after schema changes)
pnpm db:generate:win       # Windows-specific generation
pnpm db:migrate:dev        # Create migrations
pnpm db:studio             # Prisma Studio GUI
pnpm db:reset              # Reset database
```

### Maintenance

```bash
pnpm clean:cache           # Clear Turborepo cache
pnpm rebuild               # Full cleanup and rebuild
pnpm whatsapp:cleanup-chrome  # Cleanup Chrome sessions
```

## Architecture

```
apps/
├── dashboard/             # Next.js 14 frontend (port 3001)
├── api/                   # NestJS REST API (port 3003)
├── whatsapp-service/      # Express + whatsapp-web.js (port 3002)
└── docs/                  # Documentation site

packages/
├── db/                    # Prisma schema & client
└── config-*/              # Shared ESLint/TypeScript configs
```

Note: `packages/ui` was removed in T3.2 — absorbed into `apps/dashboard/components/ui/` (Alert, Toggle). No new dependency on a shared UI package.

**Data Flow:**

```
WhatsApp <-> WhatsApp Service <-> NestJS API <-> PostgreSQL
                                       |
                                 Next.js Dashboard
```

### Key Technologies

- **API**: NestJS 10, class-validator DTOs, Clerk JWT auth, Swagger docs
- **Dashboard**: Next.js 14, Tailwind CSS, Radix UI, Clerk auth, SWR
- **WhatsApp**: Express, whatsapp-web.js, Puppeteer, Redis caching, Winston logging
- **Database**: PostgreSQL with Prisma 6.15, UUID primary keys

### Workspace Packages

Use workspace imports: `@leadcrm/db`, `@leadcrm/config-eslint`, `@leadcrm/config-ts` (`@leadcrm/ui` was removed in T3.2).

## Database Schema

**Core Models:**

- `Lead` - CRM entity with unique phone, WhatsApp authorization tracking
- `Message` - Conversation history with direction (INBOUND/OUTBOUND) and status
- `WhatsAppConversation` - Session tracking with AI provider info
- `WhatsAppSession` - Session management with QR codes and reconnect logic
- `ai_knowledge_base` - Knowledge base with categories and keywords

**Enums (Spanish domain):**

- `LeadStatus`: NUEVO, CONTACTADO, QUALIFIED, GANADO, PERDIDO
- `MessageDirection`: INBOUND, OUTBOUND
- `MessageStatus`: PENDING, SENT, DELIVERED, READ, FAILED

## Code Patterns

### NestJS API

- Module-based: AuthModule, LeadsModule, TemplatesModule (new, T2.2), WhatsAppModule, PrismaModule
- Guards: `ClerkAuthGuard` at the class level on every sensitive controller
- Decorators: `@CurrentUser()` for user context injection
- Response format: `{ success: boolean, data?: any, error?: string }`
- Outbound calls from API → whatsapp-service use `signServiceRequest()` (HMAC-SHA256 with `x-service-timestamp` + `x-service-signature`) — see `apps/api/src/whatsapp/service-auth.ts` and `WhatsAppService.sendMessage`

### WhatsApp Service Path Aliases

```typescript
("@/*",
  "@/types/*",
  "@/services/*",
  "@/controllers/*",
  "@/utils/*",
  "@/config/*");
```

### Naming Conventions

- Variables/functions: `camelCase`
- Classes/Components: `PascalCase`
- Files: `kebab-case.ts` or `PascalCase.tsx`
- Backend tests: `*.spec.ts`
- Frontend tests: `*.test.tsx`

## State of the Project

The stabilization PRD (`PRD-ESTABILIZACION.md`, v5.23) closed on 2026-04-18. All five phases + T0.4-ter are complete:

- **Phase 0 — Security**: HMAC server-to-server auth, Clerk guards on every Nest controller, firewall Hetzner restricted (SSH /24, ports 3002/3003 closed), Postgres 17.6 upgrade.
- **Phase 1 — Integrity**: dual-write unified (`whatsapp_conversations.message_id` FK + transactional writer + JOIN reader + backfill + drop of duplicate columns).
- **Phase 2 — Wiring**: Socket.IO `auth_failure → AUTH_INVALID` fixed, Templates moved to Nest, rate limit per WhatsApp session (200/h).
- **Phase 3 — Cleanup**: `WhatsAppServiceRefactored` + `@leadcrm/ui` removed (~−4,350 lines net).
- **Phase 4 — Scalability**: soft delete, pagination, N+1 in `getConversations` eliminated via SQL JOIN.
- **Phase 5 — Testing**: 22+ Jest unit tests across API + whatsapp-service.

`ANALISIS-ESTADO-PROYECTO.md` v5 is the canonical snapshot of the post-stabilization state.

The AIThinkingService modularization (formerly in branch `refactor/whatsapp-service`) is **complete** — the module lives at `apps/whatsapp-service/src/services/ai-thinking/` with CacheManager, IntentAnalyzer, ContextEnricher, ComplexityAnalyzer, KnowledgeRetriever, ResponseGenerator, StrategySelector, DecisionEngine. Integration with the rest of the service is via `AIThinkingModuleFactory`.

## Environment Variables

Environment files:

- `.env` → Development (root, Supabase + Docker Redis)
- `apps/dashboard/.env.local` → Next.js reads this; must contain `NEXT_PUBLIC_API_URL`, `CLERK_*`, and `WHATSAPP_SERVICE_HMAC_SECRET`
- `apps/*/.env` → per-service overrides in production (on the Hetzner VPS: `/opt/leadcrm/apps/whatsapp-service/.env` and `/opt/leadcrm/apps/api/.env`)
- `.env.production` → production defaults (Supabase + Hetzner)
- `.env.example` → template (committed to repo)

**Critical env vars that, if missing, break the HMAC chain:**

- `WHATSAPP_SERVICE_HMAC_SECRET` (64 hex chars) — must be the **same** in Vercel (dashboard), on the Hetzner VPS (both apps' `.env`), and in every developer's local `.env`. Without it the whatsapp-service returns `500 "service auth misconfigured"` on signed requests, and the proxy in Next returns `500 "Proxy misconfigured: missing service auth secret"`.
- `CLERK_WEBHOOK_SECRET` — required only by the dashboard's `/api/webhooks/clerk` route handler.

**Service Ports:**
| Service | Port | URL |
|------------|------|------------------------|
| Dashboard | 3001 | http://localhost:3001 |
| API | 3003 | http://localhost:3003 |
| WhatsApp | 3002 | http://localhost:3002 |
| Redis | 6381 | localhost:6381 |

**Quick Start:**

```bash
docker compose up -d       # Start Redis (DB is Supabase cloud)
pnpm db:generate           # Generate Prisma client
pnpm db:migrate:dev        # Run migrations
pnpm dev                   # Start all services
```
