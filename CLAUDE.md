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

# Docker (PostgreSQL + Redis)
docker compose up -d       # Start database services
docker compose down        # Stop database services
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
├── dashboard/             # Next.js 14 frontend (port 3000)
├── api/                   # NestJS REST API (port 3003)
├── whatsapp-service/      # Express + whatsapp-web.js (port 3002)
└── docs/                  # Documentation site

packages/
├── db/                    # Prisma schema & client
├── ui/                    # Shared React components
└── config-*/              # Shared ESLint/TypeScript configs
```

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

Use workspace imports: `@leadcrm/db`, `@leadcrm/ui`, `@leadcrm/config-eslint`, `@leadcrm/config-ts`

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

- Module-based: AuthModule, LeadsModule, WhatsAppModule, PrismaModule
- Guards: ClerkAuthGuard for protected routes
- Decorators: `@CurrentUser()` for user context injection
- Response format: `{ success: boolean, data?: any, error?: string }`

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

## Active Refactoring

Branch `refactor/whatsapp-service` contains ongoing AIThinkingService modularization:

- Extracting 1,686-line monolith into focused modules
- New structure in `src/services/ai-thinking/`
- Components: CacheManager, IntentAnalyzer, ContextEnricher, ComplexityAnalyzer, KnowledgeRetriever, ResponseGenerator, StrategySelector, DecisionEngine
- See `refactor/plan.md` for full details

## Environment Variables

Environment files:

- `.env` → Development (Docker local)
- `.env.production` → Production (Supabase)
- `.env.example` → Template (committed to repo)

**Service Ports:**
| Service | Port | URL |
|------------|------|------------------------|
| Dashboard | 3001 | http://localhost:3001 |
| API | 3003 | http://localhost:3003 |
| WhatsApp | 3002 | http://localhost:3002 |
| PostgreSQL | 5433 | localhost:5433 |
| Redis | 6379 | localhost:6379 |
| Adminer | 8080 | http://localhost:8080 |

**Quick Start:**

```bash
docker compose up -d       # Start PostgreSQL + Redis
pnpm db:generate           # Generate Prisma client
pnpm db:migrate:dev        # Run migrations
pnpm dev                   # Start all services
```
