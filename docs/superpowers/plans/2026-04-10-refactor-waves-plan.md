# LeadsCRM 3-Wave Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove ~3,100+ lines of dead code, decompose 5 monolithic files into focused modules, and establish type safety + test coverage across the LeadsCRM monorepo.

**Architecture:** Wave-based approach — Wave 1 removes noise, Wave 2 restructures monoliths into <400-line modules with repository pattern and component extraction, Wave 3 adds strict typing, standardized error handling, and tests.

**Tech Stack:** TypeScript, NestJS, Next.js 14, Prisma 6.15, Express, Jest, pnpm/Turborepo

**Spec:** `docs/superpowers/specs/2026-04-10-refactor-waves-design.md`

---

## File Structure

### Wave 1 — Deletions Only (no new files)

Files to delete:
- `apps/docs/` (entire directory — 21 files)
- `apps/dashboard/app/api/debug/` (3 route files, 871 lines)
- `apps/dashboard/app/test-clerk/page.tsx` (60 lines)
- `apps/dashboard/app/layout.backup.tsx` (38 lines)
- `apps/whatsapp-service/src/services/WhatsAppServiceRefactored.ts` (866 lines)
- `apps/whatsapp-service/src/services/WhatsAppAuthorizationService.ts` (308 lines)
- `apps/whatsapp-service/src/services/whatsapp-authorization/` (4 files, 1,829 lines)
- `apps/whatsapp-service/src/services/whatsapp/` (9 files, 4,100 lines)

Files to modify:
- `apps/whatsapp-service/src/services/WhatsAppService.ts` — remove toggle logic
- `.env.example` — remove orphaned feature flags (lines 162-169)
- `CLAUDE.md` — remove stale branch references (lines 145-150)
- `apps/dashboard/middleware.ts` — remove test-clerk whitelist (line 11)

### Wave 2 — New Files

```
apps/whatsapp-service/src/services/
├── repositories/
│   ├── LeadRepository.ts
│   ├── MessageRepository.ts
│   ├── SessionRepository.ts
│   ├── ConversationRepository.ts
│   ├── TemplateRepository.ts
│   ├── KnowledgeBaseRepository.ts
│   ├── AIConfigRepository.ts
│   ├── WhitelistRepository.ts
│   ├── TrainingRepository.ts
│   ├── SystemVariableRepository.ts
│   └── ProactiveMessageRepository.ts
├── DatabaseService.ts (refactored — facade only)

apps/dashboard/app/dashboard/
├── whatsapp/
│   ├── components/
│   │   ├── SessionsTab.tsx
│   │   ├── SendTab.tsx
│   │   ├── ConversationsTab.tsx
│   │   └── TemplatesTab.tsx
│   ├── hooks/
│   │   └── useWhatsAppSessions.ts
│   └── page.tsx (refactored — composition only)
├── messaging/
│   ├── components/
│   │   ├── TemplatesTab.tsx
│   │   └── ProactiveTab.tsx
│   ├── hooks/
│   │   └── useMessaging.ts
│   └── page.tsx (refactored)
├── ai/
│   ├── components/
│   │   ├── OverviewTab.tsx
│   │   ├── TestTab.tsx
│   │   ├── ConfigTab.tsx
│   │   └── KnowledgeBaseTab.tsx
│   ├── hooks/
│   │   └── useAIConfig.ts
│   └── page.tsx (refactored)
├── leads/
│   ├── components/
│   │   ├── LeadsTable.tsx
│   │   ├── LeadFilters.tsx
│   │   └── LeadStats.tsx
│   ├── hooks/
│   │   └── useLeads.ts
│   └── page.tsx (refactored)

apps/api/src/whatsapp/
├── automation-orchestrator.service.ts
├── automation-rules.service.ts
├── ai-response.service.ts
├── automation.service.ts (refactored — thin facade)
```

### Wave 3 — New Files

```
apps/whatsapp-service/src/utils/
└── errors.ts

apps/whatsapp-service/src/services/repositories/__tests__/
├── LeadRepository.spec.ts
├── MessageRepository.spec.ts
└── SessionRepository.spec.ts

apps/api/src/whatsapp/__tests__/
└── automation-orchestrator.spec.ts
```

---

## WAVE 1: CLEAN SURGERY

---

### Task 1: Delete apps/docs skeleton

**Files:**
- Delete: `apps/docs/` (entire directory — 21 files)

- [ ] **Step 1: Verify no workspace references**

Run: `grep -r "apps/docs" pnpm-workspace.yaml turbo.json package.json`

`pnpm-workspace.yaml` uses `"apps/*"` glob — no explicit docs reference. `turbo.json` has no docs-specific config. Safe to delete.

- [ ] **Step 2: Delete the directory**

```bash
rm -rf apps/docs
```

- [ ] **Step 3: Verify build still passes**

```bash
pnpm build
```

Expected: Build succeeds — docs app was never included in build pipeline.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove skeleton docs app

Unused Next.js boilerplate with no content, not in turbo.json build pipeline."
```

---

### Task 2: Delete dashboard debug routes and test pages

**Files:**
- Delete: `apps/dashboard/app/api/debug/auth-flow/route.ts` (302 lines)
- Delete: `apps/dashboard/app/api/debug/real-clerk-migration/route.ts` (280 lines)
- Delete: `apps/dashboard/app/api/debug/test-migration/route.ts` (289 lines)
- Delete: `apps/dashboard/app/test-clerk/page.tsx` (60 lines)
- Delete: `apps/dashboard/app/layout.backup.tsx` (38 lines)
- Modify: `apps/dashboard/middleware.ts` — remove test-clerk from whitelist

- [ ] **Step 1: Check for any imports of these routes**

```bash
grep -rn "debug/auth-flow\|debug/test-migration\|debug/real-clerk-migration\|test-clerk" apps/dashboard/
```

Expected: Only hits in the files themselves and middleware.ts whitelist.

- [ ] **Step 2: Delete the files and directories**

```bash
rm -rf apps/dashboard/app/api/debug
rm -rf apps/dashboard/app/test-clerk
rm apps/dashboard/app/layout.backup.tsx
```

- [ ] **Step 3: Remove test-clerk from middleware whitelist**

In `apps/dashboard/middleware.ts`, line 11: remove `/test-clerk` from the public routes array. Read the file first to find the exact string, then edit.

- [ ] **Step 4: Verify build**

```bash
cd apps/dashboard && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove debug routes, test pages, and orphaned backup

Delete 3 debug/migration API routes (security risk), test-clerk diagnostic
page, and layout.backup.tsx. Remove test-clerk from middleware whitelist."
```

---

### Task 3: Delete dead WhatsApp service code

**Files:**
- Delete: `apps/whatsapp-service/src/services/WhatsAppServiceRefactored.ts` (866 lines)
- Delete: `apps/whatsapp-service/src/services/WhatsAppAuthorizationService.ts` (308 lines)
- Delete: `apps/whatsapp-service/src/services/whatsapp-authorization/` (4 files, 1,829 lines)
- Delete: `apps/whatsapp-service/src/services/whatsapp/` (9 files, 4,100 lines)

- [ ] **Step 1: Verify these are truly dead — grep for imports**

```bash
# Check WhatsAppServiceRefactored imports (expect only WhatsAppService.ts toggle)
grep -rn "WhatsAppServiceRefactored" apps/whatsapp-service/src/ --include="*.ts"

# Check WhatsAppAuthorizationService imports (expect 0)
grep -rn "WhatsAppAuthorizationService" apps/whatsapp-service/src/ --include="*.ts"

# Check whatsapp-authorization directory imports (expect 0 outside directory)
grep -rn "whatsapp-authorization" apps/whatsapp-service/src/ --include="*.ts"

# Check whatsapp/ directory imports (expect only WhatsAppServiceRefactored)
grep -rn "from.*['\"].*\/whatsapp\/" apps/whatsapp-service/src/ --include="*.ts" | grep -v "whatsapp-core\|whatsapp-authorization\|node_modules\|WhatsAppServiceRefactored\|whatsapp-web"
```

- [ ] **Step 2: Delete the files**

```bash
rm apps/whatsapp-service/src/services/WhatsAppServiceRefactored.ts
rm apps/whatsapp-service/src/services/WhatsAppAuthorizationService.ts
rm -rf apps/whatsapp-service/src/services/whatsapp-authorization
rm -rf apps/whatsapp-service/src/services/whatsapp
```

- [ ] **Step 3: Verify typecheck**

```bash
cd apps/whatsapp-service && pnpm typecheck
```

Expected: Passes — these files had zero live imports.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove dead WhatsApp service variants and authorization chain

Delete WhatsAppServiceRefactored (866 lines, 0 imports),
WhatsAppAuthorizationService (308 lines, never imported),
whatsapp-authorization/ (4 files, 1829 lines — dead chain),
whatsapp/ (9 files, 4100 lines — Refactored components)."
```

---

### Task 4: Clean WhatsAppService facade toggle logic

**Files:**
- Modify: `apps/whatsapp-service/src/services/WhatsAppService.ts`

- [ ] **Step 1: Read the current facade file**

Read `apps/whatsapp-service/src/services/WhatsAppService.ts` fully. Identify:
- The `useRefactoredService` property (line ~57)
- All `if (this.useRefactoredService)` branches
- The `refactoredService` property and its type import
- All imports from deleted files

- [ ] **Step 2: Remove toggle logic**

Remove:
- The `useRefactoredService` property declaration
- The `refactoredService` property declaration
- The `import` of `WhatsAppServiceRefactored` (if any top-level import)
- All `if (this.useRefactoredService) { ... } else { ... }` branches — keep only the `else` branch (the Simple path)
- The constructor logic that checks `process.env.USE_WHATSAPP_REFACTORED`
- The "REFACTORED v2.0" vs "LEGACY v1.0" log line — replace with a single log

The result should be a clean facade that unconditionally delegates to `WhatsAppServiceSimple` while keeping all cross-cutting concerns (caching, stats, Redis monitoring, rate limiting).

- [ ] **Step 3: Verify typecheck and build**

```bash
cd apps/whatsapp-service && pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/whatsapp-service/src/services/WhatsAppService.ts
git commit -m "refactor: remove feature toggle from WhatsApp facade

WhatsAppService now unconditionally delegates to WhatsAppServiceSimple.
Removes USE_WHATSAPP_REFACTORED toggle, keeps cross-cutting concerns
(caching, stats, rate limiting, Redis monitoring)."
```

---

### Task 5: Clean environment config and documentation

**Files:**
- Modify: `.env.example` — remove lines 162-169 (orphaned feature flags)
- Modify: `CLAUDE.md` — remove lines 145-150 (stale branch reference)

- [ ] **Step 1: Read .env.example and identify the feature flags section**

Read `.env.example` around lines 158-170. Find and remove these flags:
- `USE_WHATSAPP_REFACTORED=false`
- `USE_AI_MODULAR_SERVICES=false`
- `USE_AI_LEARNING_MODULAR=false`
- `USE_WHATSAPP_AUTHORIZATION_MODULAR=true`
- `USE_SESSION_HEALTH_CHECK_MODULAR=false`

Also check: are there remaining valid flags in this section? If `USE_DATABASE_REPOSITORIES`, `USE_SESSION_RECOVERY_MODULAR`, or `USE_AI_RESPONSE_MODULAR` are still used in code (grep for them), keep those. Only remove flags with zero grep matches + the ones whose code was deleted in Task 3.

- [ ] **Step 2: Edit .env.example**

Remove the orphaned flags. If the section header "Feature Flags" remains with valid flags, keep it. If all flags in the section are removed, remove the section header too.

- [ ] **Step 3: Read CLAUDE.md and remove stale reference**

Read `CLAUDE.md` lines 140-155. Remove the "Active Refactoring" section (lines 145-150) that references the `refactor/whatsapp-service` branch. This branch no longer exists.

- [ ] **Step 4: Verify no broken references**

```bash
grep -rn "USE_WHATSAPP_REFACTORED\|USE_WHATSAPP_AUTHORIZATION_MODULAR\|USE_AI_MODULAR_SERVICES\|USE_AI_LEARNING_MODULAR\|USE_SESSION_HEALTH_CHECK_MODULAR" apps/ --include="*.ts"
```

Expected: Zero matches (all code referencing these was deleted in Tasks 3-4).

- [ ] **Step 5: Commit**

```bash
git add .env.example CLAUDE.md
git commit -m "chore: remove orphaned feature flags and stale docs

Remove 5 dead feature flags from .env.example. Remove CLAUDE.md
reference to non-existent refactor/whatsapp-service branch."
```

---

### Task 6: Wave 1 verification checkpoint

- [ ] **Step 1: Full build verification**

```bash
pnpm build
```

Expected: All apps build successfully.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: Passes (or same baseline errors as before — no new errors).

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Expected: No new warnings introduced.

- [ ] **Step 4: Verify no dangling imports**

```bash
# Check for imports of anything we deleted
grep -rn "WhatsAppServiceRefactored\|WhatsAppAuthorizationService\|whatsapp-authorization\|layout\.backup\|test-clerk\|debug/auth-flow\|debug/test-migration\|debug/real-clerk-migration" apps/ --include="*.ts" --include="*.tsx"
```

Expected: Zero matches.

- [ ] **Step 5: Tag wave completion**

```bash
git tag wave-1-complete
```

---

## WAVE 2: RESTRUCTURING

---

### Task 7: Extract LeadRepository from DatabaseService

**Files:**
- Create: `apps/whatsapp-service/src/services/repositories/LeadRepository.ts`
- Modify: `apps/whatsapp-service/src/services/DatabaseService.ts`

- [ ] **Step 1: Create the repositories directory**

```bash
mkdir -p apps/whatsapp-service/src/services/repositories
```

- [ ] **Step 2: Read DatabaseService.ts lead methods**

Read `apps/whatsapp-service/src/services/DatabaseService.ts` lines 647-948 to get the exact lead method implementations: `getAllLeads()`, `findLeadByPhone()`, `findLeadById()`, `createLead()`.

- [ ] **Step 3: Create LeadRepository.ts**

Extract the 4 lead methods into a new class. The class receives `PrismaClient` via constructor:

```typescript
import { PrismaClient } from '@prisma/client';
import logger from '@/utils/logger';

export class LeadRepository {
  constructor(private prisma: PrismaClient) {}

  async getAll() { /* move getAllLeads() body here */ }
  async findByPhone(phoneNumber: string) { /* move findLeadByPhone() body */ }
  async findById(leadId: string) { /* move findLeadById() body */ }
  async create(leadData: any) { /* move createLead() body */ }
}
```

Copy the exact implementation from DatabaseService — do not rewrite logic, just move it.

- [ ] **Step 4: Update DatabaseService to delegate to LeadRepository**

In `DatabaseService.ts`, add a `leads` property:

```typescript
import { LeadRepository } from './repositories/LeadRepository';

// In constructor or initialization:
this.leads = new LeadRepository(this.prisma);
```

Replace the original method bodies with delegation:

```typescript
async getAllLeads() { return this.leads.getAll(); }
async findLeadByPhone(phone: string) { return this.leads.findByPhone(phone); }
async findLeadById(id: string) { return this.leads.findById(id); }
async createLead(data: any) { return this.leads.create(data); }
```

Keep the old method names as pass-through wrappers so existing callers don't break.

- [ ] **Step 5: Verify typecheck**

```bash
cd apps/whatsapp-service && pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/whatsapp-service/src/services/repositories/LeadRepository.ts apps/whatsapp-service/src/services/DatabaseService.ts
git commit -m "refactor: extract LeadRepository from DatabaseService

Move getAllLeads, findLeadByPhone, findLeadById, createLead into
LeadRepository. DatabaseService delegates via this.leads property."
```

---

### Task 8: Extract MessageRepository and ConversationRepository

**Files:**
- Create: `apps/whatsapp-service/src/services/repositories/MessageRepository.ts`
- Create: `apps/whatsapp-service/src/services/repositories/ConversationRepository.ts`
- Modify: `apps/whatsapp-service/src/services/DatabaseService.ts`

- [ ] **Step 1: Read DatabaseService message/conversation methods**

Read `apps/whatsapp-service/src/services/DatabaseService.ts` lines 345-524 and 987-1488 to get all conversation and message methods.

- [ ] **Step 2: Create ConversationRepository.ts**

Extract these methods:
- `saveConversation()` (lines 345-438)
- `getConversationHistory()` (lines 442-479)
- `getRecentContext()` (lines 483-524)
- `getRecentConversations()` (lines 987-1034)
- `getConversations()` (lines 1290-1370)
- `getConversationById()` (lines 1373-1400)
- `getConversationMessages()` (lines 1403-1463)
- `createOrUpdateConversation()` (lines 1466-1488)
- `searchConversations()` (lines 572-620)
- `getStats()` (lines 527-569)

Same pattern as LeadRepository — class with PrismaClient constructor.

- [ ] **Step 3: Create MessageRepository.ts**

If there are standalone message methods (not conversation-scoped), extract them. Otherwise, messages are handled within ConversationRepository. Check the exact code to decide.

- [ ] **Step 4: Update DatabaseService to delegate**

Add `conversations` and `messages` properties. Add pass-through wrappers for all extracted methods.

- [ ] **Step 5: Verify typecheck**

```bash
cd apps/whatsapp-service && pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/whatsapp-service/src/services/repositories/ apps/whatsapp-service/src/services/DatabaseService.ts
git commit -m "refactor: extract ConversationRepository and MessageRepository

Move 10 conversation/message methods into focused repositories.
DatabaseService delegates via this.conversations and this.messages."
```

---

### Task 9: Extract SessionRepository

**Files:**
- Create: `apps/whatsapp-service/src/services/repositories/SessionRepository.ts`
- Modify: `apps/whatsapp-service/src/services/DatabaseService.ts`

- [ ] **Step 1: Read DatabaseService session-related methods**

Search DatabaseService.ts for all methods that operate on `whatsapp_sessions` or `WhatsAppSession` model. Read their full implementations.

- [ ] **Step 2: Create SessionRepository.ts**

Extract session lifecycle methods (create, update status, find by sessionId, delete, etc.) into `SessionRepository`. Same pattern.

- [ ] **Step 3: Update DatabaseService to delegate**

Add `sessions` property. Add pass-through wrappers.

- [ ] **Step 4: Verify typecheck and commit**

```bash
cd apps/whatsapp-service && pnpm typecheck
git add apps/whatsapp-service/src/services/repositories/SessionRepository.ts apps/whatsapp-service/src/services/DatabaseService.ts
git commit -m "refactor: extract SessionRepository from DatabaseService"
```

---

### Task 10: Extract remaining repositories (Template, KnowledgeBase, AIConfig, Whitelist, Training, SystemVariable, ProactiveMessage)

**Files:**
- Create: `apps/whatsapp-service/src/services/repositories/TemplateRepository.ts`
- Create: `apps/whatsapp-service/src/services/repositories/KnowledgeBaseRepository.ts`
- Create: `apps/whatsapp-service/src/services/repositories/AIConfigRepository.ts`
- Create: `apps/whatsapp-service/src/services/repositories/WhitelistRepository.ts`
- Create: `apps/whatsapp-service/src/services/repositories/TrainingRepository.ts`
- Create: `apps/whatsapp-service/src/services/repositories/SystemVariableRepository.ts`
- Create: `apps/whatsapp-service/src/services/repositories/ProactiveMessageRepository.ts`
- Modify: `apps/whatsapp-service/src/services/DatabaseService.ts`

- [ ] **Step 1: Read remaining method groups from DatabaseService**

Read the following ranges:
- Templates: lines 1987-2233
- Knowledge base: lines 1584-1778, 2677-2763
- AI config: lines 1626-1702
- Whitelist: lines 1037-1283
- Training: lines 2581-2676, 2907-3053
- System variables: lines 3059-3238
- Proactive messages: lines 2234-2389

- [ ] **Step 2: Create each repository file**

For each domain, create a repository class following the same pattern:

```typescript
import { PrismaClient } from '@prisma/client';
import logger from '@/utils/logger';

export class TemplateRepository {
  constructor(private prisma: PrismaClient) {}
  // ... extracted methods
}
```

Methods per repository:
- **TemplateRepository:** getAll, getById, create, update, delete, incrementUsage (6 methods)
- **KnowledgeBaseRepository:** getAll, search, add, clear (4 methods)
- **AIConfigRepository:** get, update (2 methods)
- **WhitelistRepository:** logDecision, getLogs, getStats (3 methods)
- **TrainingRepository:** save, getAll, getStats, search, cleanup (5 methods)
- **SystemVariableRepository:** getAll, get, update, updateBatch, replace (5 methods)
- **ProactiveMessageRepository:** create, updateStatus, getAll (3 methods)

- [ ] **Step 3: Update DatabaseService to be facade only**

DatabaseService should now be ~100-150 lines:

```typescript
import { PrismaClient } from '@prisma/client';
import { LeadRepository } from './repositories/LeadRepository';
import { ConversationRepository } from './repositories/ConversationRepository';
// ... all other imports

class DatabaseService {
  private prisma: PrismaClient;
  readonly leads: LeadRepository;
  readonly conversations: ConversationRepository;
  readonly sessions: SessionRepository;
  readonly templates: TemplateRepository;
  readonly knowledgeBase: KnowledgeBaseRepository;
  readonly aiConfig: AIConfigRepository;
  readonly whitelist: WhitelistRepository;
  readonly training: TrainingRepository;
  readonly systemVariables: SystemVariableRepository;
  readonly proactiveMessages: ProactiveMessageRepository;

  constructor() {
    this.prisma = new PrismaClient();
    this.leads = new LeadRepository(this.prisma);
    this.conversations = new ConversationRepository(this.prisma);
    // ... etc
  }

  // Keep pass-through methods for backward compatibility
  // (callers still use db.createLead() etc.)

  async initializeTable() { /* keep — runs migrations */ }
  async testConnection() { /* keep */ }
  async close() { /* keep */ }
}
```

- [ ] **Step 4: Verify typecheck and full build**

```bash
cd apps/whatsapp-service && pnpm typecheck
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add apps/whatsapp-service/src/services/repositories/ apps/whatsapp-service/src/services/DatabaseService.ts
git commit -m "refactor: extract 7 remaining repositories from DatabaseService

DatabaseService is now a thin facade (~150 lines) over 11 domain
repositories. All 47 public methods delegated. Zero behavior change."
```

---

### Task 11: Extract whatsapp/page.tsx into components and hooks

**Files:**
- Create: `apps/dashboard/app/dashboard/whatsapp/components/SessionsTab.tsx`
- Create: `apps/dashboard/app/dashboard/whatsapp/components/SendTab.tsx`
- Create: `apps/dashboard/app/dashboard/whatsapp/components/ConversationsTab.tsx`
- Create: `apps/dashboard/app/dashboard/whatsapp/components/TemplatesTab.tsx`
- Create: `apps/dashboard/app/dashboard/whatsapp/hooks/useWhatsAppSessions.ts`
- Modify: `apps/dashboard/app/dashboard/whatsapp/page.tsx`

- [ ] **Step 1: Read whatsapp/page.tsx fully**

Read `apps/dashboard/app/dashboard/whatsapp/page.tsx` to understand:
- All state variables and their types
- Socket.io setup logic
- Tab rendering logic
- Which state is shared across tabs vs tab-local

- [ ] **Step 2: Extract the custom hook**

Create `hooks/useWhatsAppSessions.ts` containing:
- All session-related state (`sessions`, `loading`, `error`, `selectedSession`)
- Socket.io connection and event handlers
- Fetch functions (fetchSessions, createSession, destroySession, etc.)
- QR code polling logic

The hook should return an object with all state and actions that tabs need.

- [ ] **Step 3: Extract SessionsTab component**

Move the sessions grid/cards rendering (lines ~518-1007) into `components/SessionsTab.tsx`. It receives props from the hook.

- [ ] **Step 4: Extract SendTab component**

Move the message sending UI (lines ~1008-1385) into `components/SendTab.tsx`.

- [ ] **Step 5: Extract ConversationsTab and TemplatesTab**

Move conversations tab (lines ~1387-1537) and templates tab (lines ~1538-1657) into their own components.

- [ ] **Step 6: Refactor page.tsx to composition**

`page.tsx` should become ~60-80 lines:

```tsx
'use client';

import { useWhatsAppSessions } from './hooks/useWhatsAppSessions';
import { SessionsTab } from './components/SessionsTab';
import { SendTab } from './components/SendTab';
import { ConversationsTab } from './components/ConversationsTab';
import { TemplatesTab } from './components/TemplatesTab';

export default function WhatsAppPage() {
  const sessions = useWhatsAppSessions();
  const [activeTab, setActiveTab] = useState('sessions');

  return (
    <div>
      {/* Tab navigation */}
      {activeTab === 'sessions' && <SessionsTab {...sessions} />}
      {activeTab === 'send' && <SendTab {...sessions} />}
      {activeTab === 'conversations' && <ConversationsTab />}
      {activeTab === 'templates' && <TemplatesTab />}
    </div>
  );
}
```

- [ ] **Step 7: Verify build**

```bash
cd apps/dashboard && pnpm build
```

- [ ] **Step 8: Commit**

```bash
git add apps/dashboard/app/dashboard/whatsapp/
git commit -m "refactor: decompose whatsapp page into components and hooks

Extract SessionsTab, SendTab, ConversationsTab, TemplatesTab components
and useWhatsAppSessions hook. Page reduced from 1684 to ~70 lines."
```

---

### Task 12: Extract messaging/page.tsx into components and hooks

**Files:**
- Create: `apps/dashboard/app/dashboard/messaging/components/TemplatesTab.tsx`
- Create: `apps/dashboard/app/dashboard/messaging/components/ProactiveTab.tsx`
- Create: `apps/dashboard/app/dashboard/messaging/hooks/useMessaging.ts`
- Modify: `apps/dashboard/app/dashboard/messaging/page.tsx`

- [ ] **Step 1: Read messaging/page.tsx fully**

Read `apps/dashboard/app/dashboard/messaging/page.tsx` (1,116 lines) to map state and rendering sections.

- [ ] **Step 2: Extract hook and components**

Same pattern as Task 11:
- `hooks/useMessaging.ts` — template CRUD state, proactive message state
- `components/TemplatesTab.tsx` — template grid, search, create/edit modals (lines ~463-823)
- `components/ProactiveTab.tsx` — send and history sub-tabs (lines ~825-1116)

- [ ] **Step 3: Refactor page.tsx to composition (~60 lines)**

- [ ] **Step 4: Verify build and commit**

```bash
cd apps/dashboard && pnpm build
git add apps/dashboard/app/dashboard/messaging/
git commit -m "refactor: decompose messaging page into components and hooks

Extract TemplatesTab, ProactiveTab and useMessaging hook.
Page reduced from 1116 to ~60 lines."
```

---

### Task 13: Extract ai/page.tsx into components and hooks

**Files:**
- Create: `apps/dashboard/app/dashboard/ai/components/OverviewTab.tsx`
- Create: `apps/dashboard/app/dashboard/ai/components/TestTab.tsx`
- Create: `apps/dashboard/app/dashboard/ai/components/ConfigTab.tsx`
- Create: `apps/dashboard/app/dashboard/ai/components/KnowledgeBaseTab.tsx`
- Create: `apps/dashboard/app/dashboard/ai/hooks/useAIConfig.ts`
- Modify: `apps/dashboard/app/dashboard/ai/page.tsx`

- [ ] **Step 1: Read ai/page.tsx fully**

Read `apps/dashboard/app/dashboard/ai/page.tsx` (931 lines). Map 6 tabs: overview, test, history, analytics, config, knowledge base.

- [ ] **Step 2: Extract hook and components**

- `hooks/useAIConfig.ts` — AI config state, test/history state, knowledge base state
- `components/OverviewTab.tsx` — provider cards, stats (lines ~165-321)
- `components/TestTab.tsx` — test input + response display + history + analytics (lines ~323-567, combine smaller tabs)
- `components/ConfigTab.tsx` — system prompt editor, parameters (lines ~569-697)
- `components/KnowledgeBaseTab.tsx` — KB CRUD, search (lines ~699-928)

- [ ] **Step 3: Refactor page.tsx to composition (~60 lines)**

- [ ] **Step 4: Verify build and commit**

```bash
cd apps/dashboard && pnpm build
git add apps/dashboard/app/dashboard/ai/
git commit -m "refactor: decompose AI page into components and hooks

Extract OverviewTab, TestTab, ConfigTab, KnowledgeBaseTab and
useAIConfig hook. Page reduced from 931 to ~60 lines."
```

---

### Task 14: Extract leads/page.tsx into components and hooks

**Files:**
- Create: `apps/dashboard/app/dashboard/leads/components/LeadsTable.tsx`
- Create: `apps/dashboard/app/dashboard/leads/components/LeadFilters.tsx`
- Create: `apps/dashboard/app/dashboard/leads/components/LeadStats.tsx`
- Create: `apps/dashboard/app/dashboard/leads/hooks/useLeads.ts`
- Modify: `apps/dashboard/app/dashboard/leads/page.tsx`

- [ ] **Step 1: Read leads/page.tsx fully**

Read `apps/dashboard/app/dashboard/leads/page.tsx` (850 lines). Map sections: filters, stats grid, table, pagination, modals.

- [ ] **Step 2: Extract hook and components**

- `hooks/useLeads.ts` — lead CRUD, filters state, selection state, SWR data fetching
- `components/LeadFilters.tsx` — search bar, status filter, date filter (lines ~402-455)
- `components/LeadStats.tsx` — summary cards (lines ~457-491)
- `components/LeadsTable.tsx` — sortable table + pagination + bulk actions (lines ~493-820)

- [ ] **Step 3: Refactor page.tsx to composition (~70 lines)**

Page keeps the modal components (AddLeadModal, EditLeadModal, DeleteConfirmDialog) as they're already separate component files.

- [ ] **Step 4: Verify build and commit**

```bash
cd apps/dashboard && pnpm build
git add apps/dashboard/app/dashboard/leads/
git commit -m "refactor: decompose leads page into components and hooks

Extract LeadsTable, LeadFilters, LeadStats and useLeads hook.
Page reduced from 850 to ~70 lines."
```

---

### Task 15: Consolidate WhatsApp facade — fix bypassed imports

**Files:**
- Modify: `apps/whatsapp-service/src/routes/index.ts` (7 dynamic imports at lines 110, 129, 148, 163, 615, 988, 1174)
- Modify: `apps/whatsapp-service/src/controllers/SessionController.ts` (line 2)
- Modify: `apps/whatsapp-service/src/routes/health.ts` (line 8)

- [ ] **Step 1: Read the current state of WhatsAppService.ts (facade)**

After Task 4, the facade should be toggle-free. Verify it exports a singleton or static methods that match what routes currently call on WhatsAppServiceSimple.

- [ ] **Step 2: Update routes/index.ts**

Replace all 7 dynamic imports:

```typescript
// Before (7 occurrences at lines 110, 129, 148, 163, 615, 988, 1174):
const { default: WhatsAppService } = await import('../services/WhatsAppServiceSimple');

// After:
const { default: WhatsAppService } = await import('../services/WhatsAppService');
```

- [ ] **Step 3: Update SessionController.ts**

```typescript
// Before (line 2):
import WhatsAppService from '../services/WhatsAppServiceSimple';

// After:
import WhatsAppService from '../services/WhatsAppService';
```

- [ ] **Step 4: Update health.ts**

```typescript
// Before (line 8):
import WhatsAppServiceSimple from '../services/WhatsAppServiceSimple';

// After:
import WhatsAppService from '../services/WhatsAppService';
```

Update all usages of `WhatsAppServiceSimple` in health.ts to `WhatsAppService`.

- [ ] **Step 5: Verify typecheck and build**

```bash
cd apps/whatsapp-service && pnpm typecheck
```

Ensure the facade's public API matches what routes expect. Fix any signature mismatches.

- [ ] **Step 6: Commit**

```bash
git add apps/whatsapp-service/src/routes/ apps/whatsapp-service/src/controllers/
git commit -m "refactor: route all WhatsApp calls through facade

Update 9 imports from WhatsAppServiceSimple to WhatsAppService.
Caching, rate limiting, and stats now apply to actual requests."
```

---

### Task 16: Split automation.service.ts in API

**Files:**
- Create: `apps/api/src/whatsapp/automation-orchestrator.service.ts`
- Create: `apps/api/src/whatsapp/automation-rules.service.ts`
- Create: `apps/api/src/whatsapp/ai-response.service.ts`
- Modify: `apps/api/src/whatsapp/automation.service.ts`

- [ ] **Step 1: Read automation.service.ts fully**

Read `apps/api/src/whatsapp/automation.service.ts` (511 lines). Map the 3 responsibilities:
- Orchestration: `processIncomingMessage`, `processLeadCreated`, `processStatusChange`
- Rules: `processAutoResponses`, `processWorkflows`, `evaluateConditions`, `executeWorkflowActions`, hardcoded rules/workflows
- AI: `sendWelcomeMessage`, `processStatusChangeResponses`, AI provider calls

- [ ] **Step 2: Extract AutomationRules**

Move hardcoded rules, workflows, `evaluateConditions`, `executeWorkflowActions` into `automation-rules.service.ts` as a NestJS `@Injectable()`.

- [ ] **Step 3: Extract AIResponseService**

Move welcome message logic, status-change responses, and AI provider communication into `ai-response.service.ts` as a NestJS `@Injectable()`.

- [ ] **Step 4: Refactor AutomationService to orchestrator**

`automation.service.ts` becomes a thin orchestrator that injects `AutomationRulesService` and `AIResponseService`, coordinating the flow. Keep the 3 public entry points.

- [ ] **Step 5: Update the NestJS module**

In `apps/api/src/whatsapp/whatsapp.module.ts`, register the new services as providers.

- [ ] **Step 6: Verify build**

```bash
cd apps/api && pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/whatsapp/
git commit -m "refactor: split automation.service into orchestrator, rules, and AI response

AutomationService is now a thin orchestrator delegating to
AutomationRulesService and AIResponseService. 511 lines → 3 focused modules."
```

---

### Task 17: Wave 2 verification checkpoint

- [ ] **Step 1: Full build**

```bash
pnpm build
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Verify file size targets**

```bash
# Check no restructured file exceeds 400 lines
wc -l apps/whatsapp-service/src/services/DatabaseService.ts
wc -l apps/whatsapp-service/src/services/repositories/*.ts
wc -l apps/dashboard/app/dashboard/whatsapp/page.tsx
wc -l apps/dashboard/app/dashboard/messaging/page.tsx
wc -l apps/dashboard/app/dashboard/ai/page.tsx
wc -l apps/dashboard/app/dashboard/leads/page.tsx
wc -l apps/api/src/whatsapp/automation.service.ts
```

Expected: All under 400 lines.

- [ ] **Step 4: Tag wave completion**

```bash
git tag wave-2-complete
```

---

## WAVE 3: QUALITY & ROBUSTNESS

---

### Task 18: Create shared error utilities

**Files:**
- Create: `apps/whatsapp-service/src/utils/errors.ts`

- [ ] **Step 1: Create the error utilities file**

```typescript
// apps/whatsapp-service/src/utils/errors.ts

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) return error.stack;
  return undefined;
}

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/whatsapp-service/src/utils/errors.ts
git commit -m "feat: add shared error utilities for typed error handling"
```

---

### Task 19: Enable noImplicitAny in whatsapp-service

**Files:**
- Modify: `apps/whatsapp-service/tsconfig.json`
- Modify: Multiple `.ts` files to fix resulting errors

- [ ] **Step 1: Enable noImplicitAny**

In `apps/whatsapp-service/tsconfig.json`, add to `compilerOptions`:

```json
"noImplicitAny": true
```

- [ ] **Step 2: Run typecheck to see all errors**

```bash
cd apps/whatsapp-service && pnpm typecheck 2>&1 | head -100
```

Count the errors and categorize them.

- [ ] **Step 3: Fix errors file by file**

For each error, add explicit types. Use the patterns from the spec:
- Function parameters: add types
- Catch blocks: change `error` to `error: unknown`, use `getErrorMessage(error)`
- Event handlers: type the event parameter
- Callbacks: type callback parameters

Work through files one at a time. After each file, verify the error count decreases.

- [ ] **Step 4: Verify typecheck passes clean**

```bash
cd apps/whatsapp-service && pnpm typecheck
```

Expected: Zero errors.

- [ ] **Step 5: Commit**

```bash
git add apps/whatsapp-service/
git commit -m "refactor: enable noImplicitAny in whatsapp-service

Add explicit types to all function parameters, catch blocks,
and callbacks. First step toward full strict mode."
```

---

### Task 20: Enable strictNullChecks in whatsapp-service

**Files:**
- Modify: `apps/whatsapp-service/tsconfig.json`
- Modify: Multiple `.ts` files to fix null-related errors

- [ ] **Step 1: Enable strictNullChecks**

```json
"strictNullChecks": true
```

- [ ] **Step 2: Fix null/undefined errors**

Common patterns:
- Add null checks before property access
- Use optional chaining (`?.`) where appropriate
- Add return type annotations that include `| null` or `| undefined`
- Use non-null assertion (`!`) only where the value is guaranteed (e.g., after a guard check)

- [ ] **Step 3: Verify typecheck**

```bash
cd apps/whatsapp-service && pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/whatsapp-service/
git commit -m "refactor: enable strictNullChecks in whatsapp-service

Add null guards, optional chaining, and explicit null return types.
Second step toward full strict mode."
```

---

### Task 21: Enable full strict mode in whatsapp-service

**Files:**
- Modify: `apps/whatsapp-service/tsconfig.json`

- [ ] **Step 1: Replace individual flags with strict: true**

Remove `noImplicitAny` and `strictNullChecks` lines. Add:

```json
"strict": true
```

- [ ] **Step 2: Fix remaining strict mode errors**

These will be from `strictBindCallApply`, `strictFunctionTypes`, `strictPropertyInitialization`, `noImplicitThis`, `alwaysStrict`. Usually fewer errors than the first two steps.

- [ ] **Step 3: Verify typecheck and commit**

```bash
cd apps/whatsapp-service && pnpm typecheck
git add apps/whatsapp-service/
git commit -m "refactor: enable full strict mode in whatsapp-service

All strict TypeScript checks now enabled. Completes strict mode migration."
```

---

### Task 22: Eliminate any types at system boundaries (P0)

**Files:**
- Modify: `apps/api/src/auth/user.decorator.ts` — type `@CurrentUser()` with Clerk types
- Modify: `apps/api/src/whatsapp/automation.service.ts` — type method parameters
- Modify: Various DTOs and controller parameters

- [ ] **Step 1: Find all P0 any instances**

```bash
grep -rn ": any\|as any" apps/api/src/ --include="*.ts" | grep -i "controller\|dto\|decorator\|guard"
```

- [ ] **Step 2: Fix @CurrentUser() decorator**

Read `apps/api/src/auth/user.decorator.ts`. Replace `any` return type with the actual Clerk user type or a defined interface:

```typescript
interface ClerkUser {
  userId: string;
  sessionId: string;
  // add fields as needed from actual Clerk JWT payload
}
```

- [ ] **Step 3: Fix DTO types**

Ensure all DTO classes use concrete types instead of `any` for their properties.

- [ ] **Step 4: Fix controller method return types**

Replace `any` return types on controller methods with concrete response types.

- [ ] **Step 5: Verify and commit**

```bash
cd apps/api && pnpm typecheck
git add apps/api/src/
git commit -m "refactor: eliminate any types from API boundaries

Type @CurrentUser decorator, DTOs, and controller return types
with concrete interfaces instead of any."
```

---

### Task 23: Standardize catch blocks across the codebase

**Files:**
- Modify: Multiple files across all apps

- [ ] **Step 1: Find all generic catch blocks**

```bash
grep -rn "catch (error)" apps/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".spec."
```

- [ ] **Step 2: Update whatsapp-service catch blocks**

For each catch block in whatsapp-service, apply:

```typescript
// Before:
catch (error) {
  logger.error('Operation failed:', error.message);
}

// After:
import { getErrorMessage } from '@/utils/errors';

catch (error: unknown) {
  logger.error('Operation failed:', getErrorMessage(error));
}
```

Add contextual information (sessionId, operation name) to each log call.

- [ ] **Step 3: Update API catch blocks**

Same pattern for NestJS services. Use NestJS HttpException for user-facing errors.

- [ ] **Step 4: Update dashboard catch blocks**

For dashboard API route handlers:

```typescript
catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return NextResponse.json({ error: message }, { status: 500 });
}
```

- [ ] **Step 5: Verify and commit**

```bash
pnpm typecheck
git add apps/
git commit -m "refactor: standardize catch blocks with typed error handling

Replace all generic catch(error) blocks with catch(error: unknown)
and typed error extraction across all apps."
```

---

### Task 24: Resolve TODOs

**Files:**
- Modify: `apps/api/src/whatsapp/automation.service.ts` — line 457 (user assignment)
- Modify: `apps/api/src/whatsapp/whatsapp.service.ts` — lines 145-157 (session status)
- Modify: `apps/whatsapp-service/src/routes/index.ts` — lines 848, 1047 (auth context)
- Modify: `apps/whatsapp-service/src/services/AIThinkingService.ts` — lines 613, 769

- [ ] **Step 1: Read each TODO location**

Read the exact lines around each TODO to understand what's needed.

- [ ] **Step 2: Implement user assignment (automation.service.ts:457)**

The `assignToUser` method currently has a TODO. Implement basic assignment:

```typescript
async assignToUser(leadId: string, params: { role: string }) {
  await this.whatsappService.updateLead(leadId, {
    assigned_to: params.role,
  });
}
```

- [ ] **Step 3: Implement session status updates (whatsapp.service.ts:145-157)**

Read the context and implement the status update calls using the WhatsApp service client.

- [ ] **Step 4: Fix hardcoded auth (routes/index.ts:848, 1047)**

Replace `createdBy: 'admin'` with the actual auth context. Read the route handler to see if request has auth information (e.g., from a middleware or header).

- [ ] **Step 5: Implement or remove AI TODOs**

For `AIThinkingService.ts:613` (message limit) — implement a simple count check.
For `AIThinkingService.ts:769` (thinking process table) — evaluate if this feature is needed. If not, remove the TODO and the dead code around it.

- [ ] **Step 6: Verify no TODOs remain in scope**

```bash
grep -rn "TODO\|FIXME\|HACK\|XXX" apps/api/src/whatsapp/ apps/whatsapp-service/src/services/AIThinkingService.ts apps/whatsapp-service/src/routes/index.ts --include="*.ts"
```

- [ ] **Step 7: Commit**

```bash
git add apps/
git commit -m "fix: resolve 8 pending TODOs across API and WhatsApp service

Implement user assignment, session status updates, auth context
extraction, and message limit verification."
```

---

### Task 25: Fix Prisma schema drift and cleanup

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Read current schema**

Read `packages/db/prisma/schema.prisma` fully.

- [ ] **Step 2: Add missing ai_training_interactions model**

This table exists in Supabase (19 rows) but is not in the Prisma schema. Add:

```prisma
model AiTrainingInteraction {
  id                  String   @id @default(uuid()) @db.Uuid
  userMessage         String   @map("user_message") @db.Text
  aiResponse          String   @map("ai_response") @db.Text
  contextData         Json     @map("context_data")
  feedbackMetrics     Json     @map("feedback_metrics")
  knowledgeBaseIdsUsed String[] @map("knowledge_base_ids_used") @db.Text
  successScore        Decimal? @default(0.50) @db.Decimal
  createdAt           DateTime? @default(now()) @map("created_at") @db.Timestamp(6)
  updatedAt           DateTime? @default(now()) @map("updated_at") @db.Timestamp(6)

  @@map("ai_training_interactions")
}
```

- [ ] **Step 3: Deduplicate indices on ProactiveMessage**

Find and remove duplicate indices. Keep the ones with the `idx_proactive_messages_` prefix, remove the shorter aliases.

- [ ] **Step 4: Add @@map for snake_case models**

```prisma
// Rename model to PascalCase, preserve DB table name:
model AiConfiguration {
  // ... existing fields
  @@map("ai_configuration")
}

model AiKnowledgeBase {
  // ... existing fields
  @@map("ai_knowledge_base")
}
```

- [ ] **Step 5: Add missing indices**

```prisma
// In AiKnowledgeBase:
@@index([createdAt], name: "idx_knowledge_base_created_at")

// In AiConfiguration:
@@index([createdAt], name: "idx_ai_configuration_created_at")
```

- [ ] **Step 6: Generate Prisma client and create migration**

```bash
cd packages/db && pnpm db:generate
cd packages/db && npx prisma migrate dev --name fix_schema_drift_and_cleanup
```

- [ ] **Step 7: Verify build with new schema**

```bash
pnpm build
```

- [ ] **Step 8: Commit**

```bash
git add packages/db/
git commit -m "fix: sync Prisma schema with Supabase reality

Add missing ai_training_interactions model, deduplicate ProactiveMessage
indices, normalize model names to PascalCase with @@map, add missing
created_at indices."
```

---

### Task 26: Add tests for LeadRepository

**Files:**
- Create: `apps/whatsapp-service/src/services/repositories/__tests__/LeadRepository.spec.ts`

- [ ] **Step 1: Read LeadRepository to understand the interface**

Read `apps/whatsapp-service/src/services/repositories/LeadRepository.ts` to see all public methods and their signatures.

- [ ] **Step 2: Write tests with mocked Prisma**

```typescript
import { LeadRepository } from '../LeadRepository';

// Mock PrismaClient
const mockPrisma = {
  lead: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
} as any;

describe('LeadRepository', () => {
  let repo: LeadRepository;

  beforeEach(() => {
    repo = new LeadRepository(mockPrisma);
    jest.clearAllMocks();
  });

  describe('getAll', () => {
    it('should return all leads', async () => {
      const mockLeads = [{ id: '1', phone: '+1234567890', name: 'Test' }];
      mockPrisma.lead.findMany.mockResolvedValue(mockLeads);

      const result = await repo.getAll();

      expect(result).toEqual(mockLeads);
      expect(mockPrisma.lead.findMany).toHaveBeenCalled();
    });
  });

  describe('findByPhone', () => {
    it('should find lead by phone number', async () => {
      const mockLead = { id: '1', phone: '+1234567890' };
      mockPrisma.lead.findFirst.mockResolvedValue(mockLead);

      const result = await repo.findByPhone('+1234567890');

      expect(result).toEqual(mockLead);
    });

    it('should return null when no lead found', async () => {
      mockPrisma.lead.findFirst.mockResolvedValue(null);

      const result = await repo.findByPhone('+0000000000');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new lead', async () => {
      const leadData = { phone: '+1234567890', name: 'New Lead' };
      const created = { id: '1', ...leadData };
      mockPrisma.lead.create.mockResolvedValue(created);

      const result = await repo.create(leadData);

      expect(result).toEqual(created);
    });

    // Add test for duplicate phone handling based on actual implementation
  });
});
```

Adapt the test cases to match the actual method signatures and behavior found in Step 1.

- [ ] **Step 3: Run tests**

```bash
cd apps/whatsapp-service && pnpm test -- --testPathPattern="LeadRepository"
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/whatsapp-service/src/services/repositories/__tests__/
git commit -m "test: add LeadRepository unit tests

Test getAll, findByPhone, findById, and create with mocked Prisma client."
```

---

### Task 27: Add tests for SessionRepository and MessageRepository

**Files:**
- Create: `apps/whatsapp-service/src/services/repositories/__tests__/SessionRepository.spec.ts`
- Create: `apps/whatsapp-service/src/services/repositories/__tests__/MessageRepository.spec.ts`

- [ ] **Step 1: Read both repositories**

Read `SessionRepository.ts` and `MessageRepository.ts` (or `ConversationRepository.ts` if messages were merged there).

- [ ] **Step 2: Write SessionRepository tests**

Test session lifecycle: create, find by sessionId, update status, delete. Mock PrismaClient same pattern as Task 26.

- [ ] **Step 3: Write MessageRepository tests**

Test message operations: save conversation, get history, get recent context.

- [ ] **Step 4: Run all repository tests**

```bash
cd apps/whatsapp-service && pnpm test -- --testPathPattern="repositories"
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/whatsapp-service/src/services/repositories/__tests__/
git commit -m "test: add SessionRepository and MessageRepository unit tests"
```

---

### Task 28: Add tests for AutomationOrchestrator

**Files:**
- Create: `apps/api/src/whatsapp/__tests__/automation-orchestrator.spec.ts`

- [ ] **Step 1: Read the orchestrator**

Read `apps/api/src/whatsapp/automation-orchestrator.service.ts` (or whatever the refactored name is from Task 16).

- [ ] **Step 2: Write orchestrator tests**

Test the 3 public entry points with mocked dependencies:

```typescript
describe('AutomationOrchestratorService', () => {
  describe('processIncomingMessage', () => {
    it('should process auto-responses for matching keywords', async () => {
      // Test that a greeting message triggers auto-response
    });

    it('should skip auto-response when no keyword matches', async () => {
      // Test that non-matching messages pass through
    });
  });

  describe('processLeadCreated', () => {
    it('should send welcome message for new leads', async () => {
      // Test welcome message workflow
    });
  });

  describe('processStatusChange', () => {
    it('should send qualification message when status changes to QUALIFIED', async () => {
      // Test status-specific messaging
    });
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd apps/api && pnpm test -- --testPathPattern="automation-orchestrator"
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/whatsapp/__tests__/
git commit -m "test: add AutomationOrchestrator unit tests

Test processIncomingMessage, processLeadCreated, and processStatusChange
with mocked rule and AI response services."
```

---

### Task 29: Wave 3 verification checkpoint

- [ ] **Step 1: Full build**

```bash
pnpm build
```

- [ ] **Step 2: Full typecheck**

```bash
pnpm typecheck
```

Expected: Passes with strict mode on whatsapp-service.

- [ ] **Step 3: Run all tests**

```bash
pnpm test
```

Expected: All tests pass (existing + new).

- [ ] **Step 4: Lint**

```bash
pnpm lint
```

Expected: No new warnings.

- [ ] **Step 5: Verify success criteria**

```bash
# No file >400 lines in restructured areas
wc -l apps/whatsapp-service/src/services/DatabaseService.ts
wc -l apps/whatsapp-service/src/services/repositories/*.ts
wc -l apps/dashboard/app/dashboard/*/page.tsx
wc -l apps/api/src/whatsapp/automation*.ts

# No any at boundaries
grep -rn ": any\|as any" apps/api/src/ --include="*.ts" | grep -i "controller\|dto\|decorator" | wc -l

# No unresolved TODOs in scope
grep -rn "TODO" apps/api/src/whatsapp/ apps/whatsapp-service/src/routes/index.ts --include="*.ts" | wc -l

# Strict mode enabled
grep "strict" apps/whatsapp-service/tsconfig.json
```

- [ ] **Step 6: Generate Prisma client one final time**

```bash
pnpm db:generate
```

- [ ] **Step 7: Tag wave completion**

```bash
git tag wave-3-complete
```

---

## Post-Refactor

After all tasks complete:

1. Update `CLAUDE.md` if any architectural patterns changed
2. Run `pnpm build && pnpm typecheck && pnpm test && pnpm lint` one final time
3. The develop branch should be ready for PR to main
