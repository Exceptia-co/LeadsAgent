# LeadsCRM Refactor: 3-Wave Cleanup & Restructuring

**Date:** 2026-04-10
**Status:** Approved
**Approach:** Wave-based (Clean → Restructure → Quality)
**Timeline:** ~1-2 weeks aggressive refactor, no feature work in parallel

---

## Context

LeadsCRM is a Turborepo monorepo (pnpm) with 3 apps and 4 packages. Current state analysis reveals significant technical debt accumulated during rapid development. The project is not yet in production (1 lead, 17 messages in DB), making this the ideal time for an aggressive refactor.

### Infrastructure

| Service | Platform | Details |
|---------|----------|---------|
| Dashboard | Vercel | Next.js 14, team `udeopes-projects`, project `dashboard` |
| API + WhatsApp | Hetzner | cx23 (2 cores, 4GB), Ubuntu 24.04, IP `46.225.26.89` |
| Database | Supabase | PostgreSQL 17.4, project `CRMWhatsApp`, region `eu-west-3` |
| Cache | Redis | Docker local (dev), Hetzner (prod), port 6381 |
| Auth | Clerk | JWT-based, dashboard + API |

### Key Metrics

- **~2,300 lines** of confirmed dead code
- **444 instances** of `any` type annotations
- **12 files** exceeding 300 lines (worst: DatabaseService at 3,247)
- **4 dashboard pages** exceeding 850 lines
- **30+ generic catch blocks** without error discrimination
- **10 unresolved TODOs** (some in security-critical paths)
- **~13% test coverage** (10 test files for 78+ source files)
- **Schema drift:** `ai_training_interactions` table in Supabase not in Prisma schema

---

## Wave 1: Clean Surgery (1-2 days)

**Goal:** Remove all confirmed dead code and noise. Zero behavior changes.

### 1.1 File/Directory Deletions

| Target | Type | Lines | Reason |
|--------|------|-------|--------|
| `apps/docs/` | App | ~35 files | Skeleton with no content, not in turbo.json |
| `apps/dashboard/app/api/debug/` | Directory | ~765 | 3 debug/migration endpoints — security risk |
| `apps/dashboard/app/test-clerk/` | Directory | ~60 | Diagnostic page exposing internals |
| `apps/dashboard/app/layout.backup.tsx` | File | 38 | Manual backup, git serves this purpose |
| `apps/whatsapp-service/src/services/WhatsAppServiceRefactored.ts` | File | 866 | 0 imports, 75% duplication with Simple |
| `apps/whatsapp-service/src/services/WhatsAppAuthorizationService.ts` | File | ~100 | Never imported |
| `apps/whatsapp-service/src/services/whatsapp-authorization/` | Directory | ~500 | Dead chain: RiskAssessment, RuleEngine, LeadValidator, AuditLogger |
| `apps/whatsapp-service/src/services/whatsapp/` | Directory | ~800 | Components of the dead Refactored service (SessionManager, ConnectionManager, MessageProcessor, EventHandler, MediaHandler, ContactManager) |

**Estimated removal: ~3,100+ lines**

### 1.2 Configuration Cleanup

- **`WhatsAppService.ts` facade:** Remove `USE_WHATSAPP_REFACTORED` toggle logic and all `WhatsAppServiceRefactored` references
- **`.env.example` / `.env.production.example`:** Remove orphaned feature flags:
  - `USE_WHATSAPP_REFACTORED`
  - `USE_WHATSAPP_AUTHORIZATION_MODULAR`
  - `USE_AI_MODULAR_SERVICES` (no grep matches)
  - `USE_AI_LEARNING_MODULAR` (no grep matches)
  - `USE_SESSION_HEALTH_CHECK_MODULAR` (no grep matches)
- **`pnpm-workspace.yaml`:** Remove `apps/docs` entry if present
- **`CLAUDE.md`:** Remove section about `refactor/whatsapp-service` branch (no longer exists)
- **`apps/dashboard/middleware.ts`:** Remove `test-clerk` from route whitelist

### 1.3 Git Branch Cleanup

- Verify and delete stale remote branches:
  - `refactor/phase1-dashboard-modularization` (all Vercel deployments CANCELED)
  - `fix/whatsapp-session-status` (has open PR #1 — evaluate if still needed)

### 1.4 Verification

- `pnpm build` passes
- `pnpm lint` — no new warnings
- `pnpm typecheck` passes
- Grep all deleted module names — zero remaining imports

---

## Wave 2: Restructuring (3-5 days)

**Goal:** Break all monolithic files into focused modules of <400 lines each.

### 2.1 DatabaseService.ts (3,247 lines → ~8 repository modules)

**Location:** `apps/whatsapp-service/src/services/DatabaseService.ts`
**Pattern:** Repository per domain, DatabaseService becomes thin facade.

| New Module | Responsibility | Est. Lines |
|------------|----------------|------------|
| `repositories/LeadRepository.ts` | CRUD leads, search, stats, deduplication | ~300 |
| `repositories/MessageRepository.ts` | Message history, direction, status tracking | ~250 |
| `repositories/SessionRepository.ts` | WhatsApp session lifecycle, QR, state | ~300 |
| `repositories/ConversationRepository.ts` | Conversation tracking, AI provider info | ~200 |
| `repositories/TemplateRepository.ts` | Message templates, variable substitution | ~150 |
| `repositories/KnowledgeBaseRepository.ts` | AI knowledge base, categories, keywords | ~200 |
| `repositories/AIConfigRepository.ts` | ai_configuration CRUD | ~150 |
| `repositories/WhitelistRepository.ts` | Whitelist logs, validation decisions | ~200 |
| `DatabaseService.ts` (refactored) | Prisma instance + facade exposing repos as properties | ~100 |

**Access pattern change:**
```typescript
// Before
db.createLead(data)
db.getMessages(leadId)

// After
db.leads.create(data)
db.messages.getByLead(leadId)
```

Each repository receives `PrismaClient` via constructor. `DatabaseService` instantiates all repositories and exposes them as readonly properties.

### 2.2 Dashboard Pages (4 monoliths → components + hooks)

**Pattern for each page:**
- `page.tsx` (~50-80 lines): Layout, composition, high-level state
- `components/*.tsx` (~150-300 lines each): UI and presentation logic
- `hooks/use*.ts` (~100-200 lines): Data fetching, mutations, shared state
- Location: `app/dashboard/[feature]/components/` and `app/dashboard/[feature]/hooks/`

#### whatsapp/page.tsx (1,684 → ~5 modules)

| Module | Responsibility |
|--------|---------------|
| `components/WhatsAppSessionPanel.tsx` | Session cards, status, actions |
| `components/WhatsAppQRDisplay.tsx` | QR code rendering, scan instructions |
| `components/WhatsAppMessageList.tsx` | Message history, real-time updates |
| `hooks/useWhatsAppSession.ts` | Session state, Socket.io, polling |
| `page.tsx` | Composition only |

#### messaging/page.tsx (1,116 → ~4 modules)

| Module | Responsibility |
|--------|---------------|
| `components/ConversationList.tsx` | Sidebar conversation list, search |
| `components/MessageThread.tsx` | Message bubbles, timestamps |
| `components/MessageComposer.tsx` | Input, send, attachments |
| `hooks/useConversation.ts` | Conversation data, message mutations |

#### ai/page.tsx (931 → ~4 modules)

| Module | Responsibility |
|--------|---------------|
| `components/AIConfigForm.tsx` | AI provider settings, model selection |
| `components/KnowledgeBaseManager.tsx` | Knowledge entries CRUD |
| `components/AITestPanel.tsx` | Test AI responses, preview |
| `hooks/useAIConfig.ts` | Config state, save/load |

#### leads/page.tsx (850 → ~4 modules)

| Module | Responsibility |
|--------|---------------|
| `components/LeadsTable.tsx` | Table with sorting, pagination |
| `components/LeadFilters.tsx` | Status, date, search filters |
| `components/LeadStats.tsx` | Summary cards, conversion rates |
| `hooks/useLeads.ts` | Lead data, CRUD mutations, SWR |

### 2.3 WhatsApp Facade Consolidation

**Current problem:** Routes and controllers import `WhatsAppServiceSimple` directly, bypassing the `WhatsAppService` facade that adds caching, rate limiting, and stats.

**Actions:**
1. Remove toggle logic from `WhatsAppService.ts` (the facade)
2. Make it a clean wrapper over `WhatsAppServiceSimple` keeping cross-cutting concerns (caching, stats, Redis monitoring)
3. Update all imports in routes/controllers: `WhatsAppServiceSimple` → `WhatsAppService`
4. Result: facade actually applies to real requests

**Target:** `WhatsAppService.ts` goes from 576 → ~300 lines.

### 2.4 API automation.service.ts (14.6 KB → 3 modules)

**Location:** `apps/api/src/whatsapp/automation.service.ts`

| New Module | Responsibility |
|------------|---------------|
| `AutomationOrchestrator.ts` | Flow coordination, message routing decisions |
| `AIResponseService.ts` | AI provider communication (OpenRouter, Gemini) |
| `AutomationRules.ts` | Business rules, conditions, triggers |

### 2.5 Verification

- `pnpm build` passes
- `pnpm typecheck` passes
- All API routes respond identically (manual or e2e verification)
- Grep: 0 files >400 lines in restructured modules

---

## Wave 3: Quality & Robustness (3-5 days)

**Goal:** Type safety, consistent error handling, tests, schema cleanup.

### 3.1 TypeScript Strict Mode (whatsapp-service)

Enable incrementally in `apps/whatsapp-service/tsconfig.json`:

1. **Step 1:** `noImplicitAny: true` — forces explicit typing, exposes implicit `any`
2. **Step 2:** `strictNullChecks: true` — catches null/undefined bugs
3. **Step 3:** `strict: true` — enables all remaining checks

Each step is committed only when it compiles without errors.

### 3.2 Eliminate `any` Types (444 instances)

**Priority order by risk:**

| Priority | Zone | Examples | Why |
|----------|------|---------|-----|
| P0 | Boundaries (DTOs, API responses) | `@CurrentUser() user: any` → Clerk type | Data entering/leaving system |
| P1 | Core services | `catch (error: any)` → `unknown` with narrowing | Critical business logic |
| P2 | UI state | `useState<any>` → concrete types | UX and maintainability |
| P3 | Internals | Utility casts | Lower risk |

### 3.3 Standardized Error Handling

Create shared error utilities:

```typescript
// utils/errors.ts
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
  }
}
```

Apply across all 30+ catch blocks with contextual logging (sessionId, operation, etc.).

### 3.4 Resolve TODOs

| TODO | Location | Action |
|------|----------|--------|
| User assignment logic | `automation.service.ts:457` | Implement basic lead-to-user assignment |
| Session status updates (×3) | `whatsapp.service.ts:145-157` | Implement status update calls |
| Auth from context (×2) | `routes/index.ts:848,1047` | Get `createdBy` from actual auth context |
| Message limit verification | `AIThinkingService.ts:613` | Implement message count check |
| Thinking process table | `AIThinkingService.ts:769` | Implement or remove if unneeded |
| File validation | `MessageProcessor.ts:363` | Validate file type and size |

### 3.5 Test Coverage

Target: >50% on restructured core modules.

| Module | Tests | Priority |
|--------|-------|----------|
| `LeadRepository` | CRUD, search, duplicates | High |
| `MessageRepository` | History, direction, status | High |
| `SessionRepository` | Lifecycle, states, QR | High |
| `AutomationOrchestrator` | Decision flow, rules | Medium |
| `AIResponseService` | Provider handling, fallbacks | Medium |
| Dashboard hooks (`useLeads`, etc.) | Data fetching, mutations | Medium |
| `WhatsAppService` facade | Caching, rate limiting | Low |

**Tools:** Jest (already configured), `@testing-library/react-hooks` for dashboard hooks.

### 3.6 Prisma Schema Cleanup

1. **Deduplicate indices** on `ProactiveMessage`:
   - Remove `idx_proactive_created` (duplicates `idx_proactive_messages_created_at`)
   - Remove `idx_proactive_status` (duplicates `idx_proactive_messages_status`)

2. **Normalize model naming** with `@@map` to preserve DB table names:
   - `ai_configuration` → `AiConfiguration` (`@@map("ai_configuration")`)
   - `ai_knowledge_base` → `AiKnowledgeBase` (`@@map("ai_knowledge_base")`)

3. **Add missing indices:**
   - `created_at` on `ai_knowledge_base`
   - `created_at` on `ai_configuration`

4. **Fix schema drift:**
   - Add `ai_training_interactions` model to Prisma schema (table exists in Supabase with 19 rows but is not in schema)
   - Evaluate `migrations` table (created by WhatsApp service scripts) — either add to schema or remove if superseded by Prisma migrations

### 3.7 Verification

- `pnpm build` passes
- `pnpm typecheck` with strict mode passes on whatsapp-service
- `pnpm test` — all new tests pass
- `pnpm lint` — 0 new warnings
- Grep: 0 instances of `as any` in boundaries (DTOs, controllers)
- Grep: 0 unresolved TODOs in worked zones
- Schema: `pnpm db:generate` succeeds after Prisma changes

---

## Out of Scope

These items were identified during analysis but are explicitly excluded from this refactor:

- **Next.js 14 → 15 upgrade** — separate initiative after refactor stabilizes
- **Supabase RLS enablement** — requires auth architecture review
- **Hetzner firewall hardening** (SSH from 0.0.0.0/0) — infrastructure task, not code refactor
- **New features** — no feature work during refactor period
- **Dashboard component library expansion** — packages/ui cleanup is cosmetic
- **CI/CD pipeline changes** — current GitHub Actions workflow is functional

---

## Success Criteria

After all 3 waves:

1. No file in the codebase exceeds 400 lines (excluding generated/config files)
2. Zero dead code (no unused imports, no orphaned files, no unreachable branches)
3. TypeScript strict mode enabled on whatsapp-service
4. `any` eliminated from all system boundaries (DTOs, controllers, API responses)
5. All catch blocks use typed error handling with `unknown`
6. >50% test coverage on restructured core modules
7. Prisma schema matches Supabase reality (no drift)
8. All TODOs in scope are resolved
9. `pnpm build && pnpm typecheck && pnpm test && pnpm lint` all pass clean
