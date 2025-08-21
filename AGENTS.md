# AGENTS.md - LeadsCRM Development Guide

## Project Overview

LeadsCRM es un sistema integral de gestión de leads que automatiza la recepción y procesamiento de mensajes de WhatsApp mediante inteligencia artificial.

**Stack:** Next.js 15.4.2 + NestJS + PostgreSQL/Supabase + Prisma + Clerk Auth + Turborepo + pnpm  
**Estado:** ✅ MVP Dashboard + API + DB | 🔄 Integración WhatsApp + IA

## Build/Test Commands

**Development:**

- `pnpm dev` (all services) | `pnpm dev:dashboard/api/whatsapp` (specific service)
- `pnpm build` | `pnpm build:fast` (parallel) | `pnpm build:production`

**Testing:**

- `pnpm test` (all) | `cd apps/api && pnpm test:watch` (watch mode)
- `cd apps/api && pnpm test -- --testNamePattern="specific test"` (single test)
- `pnpm test:e2e` | `pnpm test:cov` (coverage)

**Quality & DB:**

- `pnpm lint` | `pnpm lint:fix` | `pnpm typecheck` | `pnpm format`
- `pnpm db:generate` (after schema changes) | `pnpm db:studio` | `pnpm db:migrate:dev`
- `pnpm clean:cache` | `pnpm rebuild` (full cleanup)

## Monorepo Structure

```
apps/dashboard/     # Next.js frontend (port 3000)
apps/api/           # NestJS backend (port 3003)
apps/whatsapp-service/  # WhatsApp integration (port 3002)
packages/db/        # Prisma schema + client (PostgreSQL)
packages/ui/        # Shared React components (shadcn/ui)
packages/config-*/  # Shared ESLint/TypeScript configs
```

## Code Style & Architecture

**TypeScript Conventions:**

- Variables/functions: `camelCase` | Classes/Components: `PascalCase`
- Files: `kebab-case.ts` or `PascalCase.tsx` | Constants: `UPPER_SNAKE_CASE`
- Backend tests: `*.spec.ts` | Frontend tests: `*.test.tsx` in `__tests__/`

**Imports & Dependencies:**

- Use workspace packages: `@leadcrm/db`, `@leadcrm/ui`, `@leadcrm/config-*`
- Check existing packages before adding new dependencies
- Absolute imports preferred over relative imports

**Error Handling & Validation:**

- Backend: class-validator DTOs, structured try/catch with logging
- Frontend: Error boundaries, client-side validation before API calls
- API responses: `{ success: boolean, data?: any, error?: string }`

**Architecture Patterns:**

- Backend: NestJS modules (AuthModule, LeadsModule, MessagingModule)
- Frontend: Next.js App Router, React components with TypeScript
- Database: Prisma with PostgreSQL, UUIDs as PKs, proper indexes

## Database Schema (PostgreSQL)

**Key Models:** User (Clerk integration), Lead, Message, Campaign, CampaignLead  
**Features:** UUID PKs, native arrays (tags[]), enums in Spanish, auto timestamps  
**Relations:** Messages → Lead (direct, no Conversation table), Campaign ←→ Lead (many-to-many)

## Security & Environment

**Environment Variables (Required):**

```bash
DATABASE_URL="postgresql://..."        # Supabase PostgreSQL
DIRECT_URL="postgresql://..."          # Direct connection
CLERK_SECRET_KEY="sk_test_..."         # Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
OPENAI_API_KEY="sk-..."               # AI services (optional)
```

**Security Rules:**

- NEVER commit secrets/keys - use .env files only
- All API endpoints except webhooks require Clerk JWT authentication
- Use class-validator for input validation, sanitize user inputs
- Enable Row Level Security (RLS) in Supabase for production

## API Endpoints

**Auth:** Clerk JWT required except `/api/webhooks/*`  
**Format:** Standard `{ success, data, error }` responses  
**Key Routes:** `/api/leads` (CRUD), `/api/ai/suggest`, `/api/webhooks/whatsapp`

## Testing Strategy

**Unit Tests:** Jest with `*.spec.ts` (backend) and `*.test.tsx` (frontend)  
**Integration:** Supertest for API endpoints in `/test/` directories  
**Coverage:** Minimum 80% for critical business logic  
**Commands:** `pnpm test:watch` for development, `pnpm test:cov` for coverage

## Git & Development Workflow

**Branches:** `feature/description`, `fix/issue-number`, `hotfix/critical`  
**Commits:** Conventional format - `feat(leads): add AI classification`  
**PRs:** Include tests, screenshots for UI changes, document breaking changes

## Turborepo & Performance

**Task Dependencies:** Build depends on db:generate, typecheck on ^typecheck  
**Caching:** Intelligent caching for unchanged code, parallel execution  
**Troubleshooting:** `pnpm clean:cache`, `turbo daemon stop`, `pnpm rebuild`

## AI Assistant Integration

**MCP Tools (Mandatory):**

- Always use `byterover-retrieve-knowledge` before starting tasks
- Use `byterover-store-knowledge` after completing critical work
- Maintains persistent context across development sessions

**Benefits:** Reduced context explanation, better architectural decisions, shared knowledge base
