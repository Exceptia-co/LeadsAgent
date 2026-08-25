# Baileys Migration — Phase 1: Engine-Neutral Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop production from logging every WhatsApp session out on each deploy, delete the verified-dead auth-snapshot subsystem, and put an engine-neutral message DTO and a durable credential store in place — so the Baileys cutover (Phase 2) becomes a transport swap rather than a product rewrite.

**Architecture:** Every task in this plan ships to `main` with `whatsapp-web.js` still running in production. No Baileys dependency is added here. Tasks 1 and 2 are pure bug-fix and dead-code removal that stand on their own merit even if the migration were cancelled. Tasks 3 and 4 build the two seams the cutover needs: a normalized message DTO that keeps library types out of the AI and DB layers, and a key-value credential store in Postgres that replaces both the Chromium profile on disk and Baileys' `useMultiFileAuthState`.

**Tech Stack:** TypeScript, Node 20, Express, Prisma 6.15 (`@leadcrm/db`), PostgreSQL 17.6 (Supabase), Redis, Jest + ts-jest, pnpm workspace / Turborepo.

**Spec:** `HANDOFF-BAILEYS-MIGRATION.md` (repo root) — the decision record. This plan supersedes its "Alcance real" section; see *Deviations from the spec* below.

---

## Global Constraints

- **Do not add `@whiskeysockets/baileys` in this plan.** It is Phase 2. Adding it here makes every task in this plan un-mergeable until the whole migration is done, which defeats the purpose.
- **Do not remove `puppeteer`, `patches/whatsapp-web.js@1.34.6.patch`, the `patchedDependencies` key in the root `package.json`, `config/puppeteer.config.ts`, `PUPPETEER_*` in `turbo.json:15`, or `chromium` from `apps/whatsapp-service/Dockerfile`.** `whatsapp-web.js` is still the running engine throughout Phase 1. All of these are Phase 2 deletions.
- **Do not change the REST route shapes in `apps/whatsapp-service/src/routes/index.ts` or the Socket.IO payloads in `apps/whatsapp-service/src/services/SocketService.ts`,** except for the three backup endpoints explicitly removed in Task 2. The dashboard is deployed separately on Vercel and must keep working against an unchanged contract.
- **The `message` webhook payload's `data` field is a frozen wire contract.** It must keep the shape `{ id, from, to, body, timestamp, type, isGroup, fromMe }` no matter what the service's internal types look like. `apps/api/src/whatsapp/whatsapp.service.ts:134,137` reads `data.from` and `data.body`, and `whatsapp.controller.ts:32` types the field as `any` before handing it to a method declaring a different type — so neither app's typecheck can see a drift, and the two deploy separately. Emitting an internal DTO here throws `undefined.replace()` in the API on every inbound message.
- **Response shape for all Nest/Express JSON:** `{ success: boolean, data?: T, error?: string }`.
- **Tests:** Jest, `*.spec.ts` colocated with the source file. `jest.config.js` uses `preset: 'ts-jest'`, `roots: ['<rootDir>/src']`, and `moduleNameMapper` `^@/(.*)$ → <rootDir>/src/$1`. Run from `apps/whatsapp-service`.
- **Baseline test count before this plan:** 71 passing in `apps/whatsapp-service`, 61 in `apps/api`. Every task must leave both green.
- **Commit style:** Conventional Commits. Commit at the end of every task, never mid-task.
- **Prisma:** after any `schema.prisma` change run `pnpm db:generate` from the repo root before typechecking.
- **Do not implement C7 or C8** from `PLAN-WHATSAPP-AGENT-MULTITENANT.md:530-531`. Both are Chromium workarounds and are already marked superseded; they would be thrown away at cutover.
- **Do not write the B3.3 multi-tenant E2E tests** (`PLAN-WHATSAPP-AGENT-MULTITENANT.md:504`) before Phase 2 lands. Written against the outgoing engine they are double work.

---

## Ground Truth (verified 2026-08-25, do not re-derive)

Checked directly against production via the Supabase and Hetzner MCP connectors. These numbers are why the plan looks the way it does.

**Supabase — project `CRMWhatsApp` (`yxjzsargboxnuwnbuzax`), PostgreSQL 17.6.1:**

| Fact | Value | Consequence |
|---|---|---|
| `whatsapp_sessions` rows | 30 | — |
| ...with `status = 'disconnected'` | **30 of 30** | No session is connected. Nothing to re-pair. |
| ...with `is_active = true` | 2 | — |
| `whatsapp_sessions.auth_data` non-null | **0 of 30** (`max(pg_column_size)` = 0 bytes) | `SnapshotService` has never written a row in production. |
| `messages` rows | 183, spanning 2025-09-01 → 2026-06-30 | No inbound traffic for ~2 months. |
| `messages` with `created_at < 1980` | **0** | `PREEXISTING-ISSUES.md` § PR12-1 has no rows to repair. |
| `messages` with `lead_id IS NULL` | 27 of 183 | Debt T1 is live but out of scope here. |
| `tenants` / `leads` / `whatsapp_conversations` | 2 / 14 / 140 | Pilot scale. |
| Max session `last_seen` | 2026-08-25 06:32 UTC | The service is alive and writing; sessions just never stay connected. |

**Hetzner — server `whatsapp-service` (id `118344573`):** CX23, 2 shared vCPU, 4 GB RAM, 40 GB disk, Ubuntu 24.04, `nbg1`, running, firewall `10443894` applied, **`backup_window: null` — the VPS has no Hetzner backups.** There is no infrastructure snapshot to roll back to.

**Snapshot feature flag:** `SnapshotService` sets `this.enabled = process.env.ENABLE_AUTH_SNAPSHOTS === 'true'` (`SnapshotService.ts:22`) and `isEnabled()` also requires `EncryptionService.isConfigured()`. `auth_data` being null on all 30 rows is consistent with the flag being off. The subsystem is dead by configuration, not silently failing.

---

## The bug this plan opens with

Production has zero connected sessions because **every graceful shutdown deactivates every session in the database.** The chain, all verified by reading the code:

```
SIGTERM  (index.ts:224)
  → whatsappService.shutdown()                          (index.ts:203)
    → WhatsAppServiceSimple.shutdown()                  (WhatsAppServiceSimple.ts:362)
      → sessionManager.shutdownAllSessions(clients, cb) (SessionManager.ts:312)
        → destroySession(sessionId, client, cb)         (SessionManager.ts:162)
          → SessionPersistenceService.deactivateSession(sessionId)
              →  UPDATE whatsapp_sessions
                 SET is_active = false, status = 'disconnected'     ← fires on every pm2 restart
          → cb(sessionId) = authenticationManager.cleanupSessionAuth(sessionId)
              →  intends to delete ./wwebjs_auth/session-<id>       ← currently a silent no-op, see below
```

`shutdownAllSessions` is a shutdown path, but `destroySession` is a *delete* path. Wiring them together means `pm2 restart` — i.e. every deploy — is indistinguishable from "the user deleted this session".

**The disk half is currently masked by a path bug, and that is the only reason credentials still exist.** `AuthenticationManager.cleanupSessionAuth` checks the correct directory and then asks the util to delete a different one:

```ts
// AuthenticationManager.ts:342 — correct path, used only for the existence check
const sessionAuthPath = path.join(authDataPath, `session-${sessionId}`);   // ./wwebjs_auth/session-test
if (fs.existsSync(sessionAuthPath)) {
  // AuthenticationManager.ts:347 — passes an already-prefixed id
  await SessionCleanupUtil.cleanupSession(`session-${sessionId}`, authDataPath);
}

// utils/sessionCleanup.ts:16 — prefixes it a second time
const sessionPath = path.join(sessionsPath, `session-${sessionId}`);        // ./wwebjs_auth/session-session-test
if (!fs.existsSync(sessionPath)) return;                                    // → returns, deletes nothing
```

So `DELETE /sessions/:id` does not actually remove auth files either — it only looks like it does in the logs (`🧹 Cleaning up auth files for session X` is logged before the no-op).

**Ordering is safety-critical.** Fixing the double prefix on its own converts a latent bug into an active credential wipe on every deploy. Task 1 therefore separates shutdown from delete *first* and repairs the prefix *last*, in that order, in a single commit.

---

## Deviations from the spec

`HANDOFF-BAILEYS-MIGRATION.md` was written before the production data above was available. Three of its instructions are superseded:

1. **"Borrar: `scripts/cleanup-chrome.ps1`"** — the file does not exist and is not in git, while `apps/whatsapp-service/package.json:19-20` still invokes it. `pnpm whatsapp:cleanup-chrome` is broken today. Removing the two dead script aliases is folded into Task 2.
2. **"Reescribir `services/auth-snapshot/SnapshotService.ts` → JSON en Postgres"** — with `auth_data` null on all 30 rows, there is nothing to rewrite. Task 2 deletes it and extracts only the AES-GCM helper.
3. **"~5–8 sesiones concurrentes"/"cada cliente tendrá que reescanear el QR"** — there are currently zero connected sessions. The re-pairing runbook, the timed rollback window, and the long-running parallel canary described in the handoff all address a risk that does not exist today. Phase 2 collapses them into a single smoke test on a disposable number.

The handoff's three stale line references should also be corrected: `PLAN-WHATSAPP-AGENT-MULTITENANT.md:37 → :41`, `:53 → :57`, `:73 → :77`. Folded into Task 2.

---

## File Structure

**Task 1 — shutdown/delete separation**

| File | Responsibility |
|---|---|
| `apps/whatsapp-service/src/services/whatsapp-core/SessionManager.ts` (modify) | `destroySession` gains a `mode` parameter; `shutdownAllSessions` stops deactivating and stops running the cleanup callback. |
| `apps/whatsapp-service/src/services/WhatsAppServiceSimple.ts` (modify) | `shutdown()` stops passing an auth-cleanup callback. |
| `apps/whatsapp-service/src/services/whatsapp-core/AuthenticationManager.ts` (modify) | Double-`session-` prefix repaired so the delete path actually deletes. |
| `apps/whatsapp-service/src/services/whatsapp-core/SessionManager.shutdown.spec.ts` (create) | Locks the shutdown-vs-delete contract. |

**Task 2 — remove the snapshot subsystem**

| File | Responsibility |
|---|---|
| `apps/whatsapp-service/src/services/crypto/AesGcm.ts` (create) | The AES-256-GCM primitive, extracted and made key-agnostic so Task 4 can reuse it. |
| `apps/whatsapp-service/src/services/crypto/AesGcm.spec.ts` (create) | Round-trip and tamper-detection. |
| `apps/whatsapp-service/src/services/auth-snapshot/` (delete) | `SnapshotService.ts`, `EncryptionService.ts`, `types.ts`. |
| `apps/whatsapp-service/src/services/WhatsAppServiceSimple.ts` (modify) | 9 `SnapshotService` call sites and the snapshot interval removed. |
| `apps/whatsapp-service/src/services/SessionRecoveryService.ts` (modify) | 4 `SnapshotService` call sites removed. |
| `apps/whatsapp-service/src/services/SessionPersistenceService.ts` (modify) | `SnapshotData` import, `saveSnapshotData`, `clearSnapshotData` removed. |
| `apps/whatsapp-service/src/routes/index.ts` (modify) | 3 backup endpoints removed. |
| `apps/dashboard/app/dashboard/whatsapp/page.tsx` (modify) | Backup/restore buttons and their fetch calls removed. |
| `apps/whatsapp-service/package.json`, root `package.json`, `HANDOFF-BAILEYS-MIGRATION.md` (modify) | `tar` dep, broken `cleanup-chrome` aliases, stale line refs. |

**Task 3 — normalized message DTO + characterization tests**

| File | Responsibility |
|---|---|
| `apps/whatsapp-service/src/types/messages.ts` (create) | `NormalizedWhatsAppMessage` — the only message shape the AI and DB layers may see. |
| `apps/whatsapp-service/src/services/whatsapp-core/IncomingMessagePipeline.ts` (create) | Engine-agnostic orchestration: dedupe → filter → authorize → AI → persist → webhook. Takes the DTO, never a library type. |
| `apps/whatsapp-service/src/services/whatsapp-core/wwebjs-normalizer.ts` (create) | The only place a `whatsapp-web.js` `Message` becomes a DTO. Phase 2 replaces this file and nothing else. |
| `apps/whatsapp-service/src/services/whatsapp-core/EventDispatcher.ts` (modify) | `onMessage` shrinks to: normalize, hand to the pipeline. |
| `apps/whatsapp-service/src/services/whatsapp-core/IncomingMessagePipeline.spec.ts` (create) | The 5 characterization tests. No `Message`, `Client` or `WASocket` mocks. |

**Task 4 — durable credential store**

| File | Responsibility |
|---|---|
| `packages/db/prisma/schema.prisma` (modify) | `WhatsAppAuthKey` model. |
| `apps/whatsapp-service/src/services/session-credentials/SessionCredentialsStore.ts` (create) | Key-value get/set/delete over `whatsapp_auth_keys`, values encrypted at rest with `AesGcm`. |
| `apps/whatsapp-service/src/services/session-credentials/SessionCredentialsStore.spec.ts` (create) | Round-trip, isolation, concurrent writes, delete-on-logout. |
| `apps/whatsapp-service/src/config/env.ts` (modify) | `WHATSAPP_AUTH_ENCRYPTION_KEY` added to the zod schema. |

### Decisions arbitrated during planning

Two design questions came back with conflicting answers from the two review agents. Both are settled here.

**Credential storage: a dedicated key-value table, not a JSON blob on `whatsapp_sessions`.** Baileys' `SignalKeyStore` interface is literally `get(type, ids[])` / `set(data)`. A single blob column forces read-modify-write under a per-session mutex on the hot cryptographic path, where a lost update corrupts the Signal ratchet irrecoverably. A key-value table maps 1:1 to the interface and needs no lock.

**No `tenantId` column on `whatsapp_auth_keys`.** The table is engine-internal and only ever read by `sessionId`, which is `@unique` on `WhatsAppSession` and already tenant-scoped. `TenantContextGuard` never reaches this table, so the PR5a "explicit scoping everywhere" convention buys no isolation here — only a denormalized column to keep in sync on the hottest write path. If auth keys ever become user-queryable, adding a nullable column is a trivial migration.

**Values are encrypted at rest by the application.** Supabase encrypts the disk, which defends against someone stealing the disk — not against a leaked `DATABASE_URL`, a service-role key, SQL injection, or the Supabase dashboard. These rows are the equivalent of a permanent session token for the client's *personal* phone number, so full account takeover is the failure mode. AES-256-GCM over a few hundred bytes with AES-NI is microseconds, and this system has moved 183 messages in a year; the CPU argument does not apply at this scale.

---

## Task 1: Separate shutdown from delete

**Files:**
- Modify: `apps/whatsapp-service/src/services/whatsapp-core/SessionManager.ts:162-215` and `:312-345`
- Modify: `apps/whatsapp-service/src/services/WhatsAppServiceSimple.ts:362-365`
- Modify: `apps/whatsapp-service/src/services/whatsapp-core/AuthenticationManager.ts:337-357`
- Test: `apps/whatsapp-service/src/services/whatsapp-core/SessionManager.shutdown.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `destroySession(sessionId: string, client?: Client, cleanupCallback?: (sessionId: string) => Promise<void>, mode?: 'shutdown' | 'delete'): Promise<void>` — `mode` defaults to `'delete'` so existing call sites keep their behaviour. `shutdownAllSessions(clients: Map<string, Client>): Promise<void>` — the `cleanupCallback` parameter is **removed**, not made optional, so no caller can reintroduce the wipe.

- [ ] **Step 1: Write the failing test**

Create `apps/whatsapp-service/src/services/whatsapp-core/SessionManager.shutdown.spec.ts`:

```ts
const mockDeactivateSession = jest.fn().mockResolvedValue(true);
const mockUpdateSessionStatus = jest.fn().mockResolvedValue(true);
const mockLoadActiveSessions = jest.fn().mockResolvedValue([]);

jest.mock('../SessionPersistenceService', () => ({
  __esModule: true,
  default: {
    deactivateSession: (sessionId: string) => mockDeactivateSession(sessionId),
    updateSessionStatus: (...args: unknown[]) => mockUpdateSessionStatus(...args),
    loadActiveSessions: () => mockLoadActiveSessions(),
    saveSession: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { SessionManager } from './SessionManager';

const SESSION_ID = 'smoke-session';

function makeClient() {
  return { destroy: jest.fn().mockResolvedValue(undefined) } as any;
}

describe('SessionManager shutdown vs delete', () => {
  let manager: SessionManager;
  let cleanup: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks wipes call history but keeps implementations, so the
    // default must be restored or one test's override leaks into the next.
    mockLoadActiveSessions.mockResolvedValue([]);
    manager = new SessionManager();
    cleanup = jest.fn().mockResolvedValue(undefined);
    (manager as any).sessions.set(SESSION_ID, { id: SESSION_ID, status: 'ready' });
  });

  it('shutdown_does_not_deactivate_session_in_database', async () => {
    const clients = new Map([[SESSION_ID, makeClient()]]);

    await manager.shutdownAllSessions(clients);

    expect(mockDeactivateSession).not.toHaveBeenCalled();
  });

  it('shutdown_closes_the_client_and_delegates_in_shutdown_mode', async () => {
    const client = makeClient();
    const clients = new Map([[SESSION_ID, client]]);
    const destroySpy = jest.spyOn(manager, 'destroySession');

    await manager.shutdownAllSessions(clients);

    expect(client.destroy).toHaveBeenCalledTimes(1);
    // The 4th argument is the mode. Asserting it here is what makes the
    // no-cleanup guarantee real: shutdownAllSessions no longer accepts a
    // cleanup callback at all, so asserting "cleanup was not called" would
    // be true by construction and prove nothing.
    expect(destroySpy).toHaveBeenCalledWith(SESSION_ID, client, undefined, 'shutdown');
  });

  it('shutdown_sweep_does_not_touch_autoReconnect_either_way', async () => {
    const clients = new Map([[SESSION_ID, makeClient()]]);
    mockLoadActiveSessions.mockResolvedValue([{ sessionId: SESSION_ID, metadata: {} }]);

    await manager.shutdownAllSessions(clients);

    const [, , payload] = mockUpdateSessionStatus.mock.calls[0];
    // Not false (that is what barred recovery), and not true either: writing
    // true would resurrect sessions something else deliberately stopped.
    expect(payload.metadata).not.toHaveProperty('autoReconnect');
    expect(payload.metadata.shutdownReason).toBe('Server shutdown');
    // The payload omits lastError so a planned shutdown is not recorded as an
    // error. This asserts the payload shape only -- updateSessionStatus skips
    // undefined fields, so any previously persisted lastError is left alone,
    // which is deliberate.
    expect(payload).not.toHaveProperty('lastError');
  });

  it('shutdown_sweep_preserves_a_deliberate_do_not_reconnect_decision', async () => {
    const clients = new Map([[SESSION_ID, makeClient()]]);
    mockLoadActiveSessions.mockResolvedValue([
      {
        sessionId: SESSION_ID,
        metadata: { autoReconnect: false, forceDisconnected: true },
      },
    ]);

    await manager.shutdownAllSessions(clients);

    const [, , payload] = mockUpdateSessionStatus.mock.calls[0];
    // A session stopped on purpose must stay stopped across a restart.
    expect(payload.metadata.autoReconnect).toBe(false);
    expect(payload.metadata.forceDisconnected).toBe(true);
  });

  it('delete_deactivates_session_and_runs_auth_cleanup', async () => {
    await manager.destroySession(SESSION_ID, makeClient(), cleanup, 'delete');

    expect(mockDeactivateSession).toHaveBeenCalledWith(SESSION_ID);
    expect(cleanup).toHaveBeenCalledWith(SESSION_ID);
  });

  it('destroySession_defaults_to_delete_mode_for_existing_callers', async () => {
    await manager.destroySession(SESSION_ID, makeClient(), cleanup);

    expect(mockDeactivateSession).toHaveBeenCalledWith(SESSION_ID);
    expect(cleanup).toHaveBeenCalledWith(SESSION_ID);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "SessionManager.shutdown"`

Expected: FAIL. `shutdown_does_not_deactivate_session_in_database` fails because `deactivateSession` was called once. `destroySession_defaults_to_delete_mode_for_existing_callers` may pass already — that is fine, it is a regression guard, not a new behaviour.

- [ ] **Step 3: Add the `mode` parameter to `destroySession`**

In `apps/whatsapp-service/src/services/whatsapp-core/SessionManager.ts`, change the signature at line 162 and gate the two destructive blocks. The client destroy and the in-memory removal stay unconditional — both are correct for shutdown *and* delete.

```ts
  async destroySession(
    sessionId: string,
    client?: Client,
    cleanupCallback?: (sessionId: string) => Promise<void>,
    mode: 'shutdown' | 'delete' = 'delete'
  ): Promise<void> {
    try {
      logger.info(`🗑️ Starting ${mode} of session ${sessionId}`);

      if (client) {
        try {
          await client.destroy();
          logger.info(`WhatsApp client for session ${sessionId} destroyed successfully`);
        } catch (clientError) {
          logger.warn(`Error destroying WhatsApp client for session ${sessionId}:`, clientError);
        }
      }

      this.sessions.delete(sessionId);

      // Shutdown is not deletion: a restart must leave the session row and its
      // credentials exactly as they were, or every deploy logs the tenant out.
      if (mode === 'delete') {
        try {
          await SessionPersistenceService.deactivateSession(sessionId);
          logger.info(`Session ${sessionId} deactivated in database`);
        } catch (dbError) {
          logger.error(`Error deactivating session ${sessionId} in database:`, dbError);
        }

        if (cleanupCallback) {
          try {
            await cleanupCallback(sessionId);
            logger.info(`Custom cleanup completed for session ${sessionId}`);
          } catch (cleanupError) {
            logger.error(`Error in custom cleanup for session ${sessionId}:`, cleanupError);
          }
        }
      }
```

Leave the rest of the method body (the closing `catch`, any logging after the cleanup block) untouched.

- [ ] **Step 4: Drop the cleanup callback from `shutdownAllSessions`**

In the same file at line 312, remove the `cleanupCallback` parameter entirely and pass `'shutdown'` through:

```ts
  async shutdownAllSessions(clients: Map<string, Client>): Promise<void> {
    logger.info('🛑 Starting graceful shutdown of all sessions...');

    const sessionIds = Array.from(this.sessions.keys());
    logger.info(`🔄 Shutting down ${sessionIds.length} active sessions...`);

    const shutdownPromises = sessionIds.map(async sessionId => {
      return new Promise<void>(resolve => {
        const timeoutId = setTimeout(() => {
          logger.warn(`⚠️ Timeout shutting down session ${sessionId}, forcing cleanup`);
          this.sessions.delete(sessionId);
          resolve();
        }, 10000);

        const client = clients.get(sessionId);
        this.destroySession(sessionId, client, undefined, 'shutdown')
          .then(() => {
            clearTimeout(timeoutId);
            logger.info(`✅ Session ${sessionId} shutdown complete`);
```

Leave the remainder of the method (the `.catch`, the `Promise.all`) unchanged.

- [ ] **Step 5: Stop `shutdown()` passing an auth-cleanup callback**

In `apps/whatsapp-service/src/services/WhatsAppServiceSimple.ts`, replace lines 362-365:

```ts
    // Shutdown all sessions using SessionManager. No auth cleanup here on
    // purpose: a restart must not look like a session deletion.
    await this.sessionManager.shutdownAllSessions(this.clients);
```

- [ ] **Step 5b: Stop the shutdown sweep from barring recovery**

`shutdownAllSessions` ends with a second, independent destructive block — a "Final cleanup" sweep that runs *after* the per-session `destroySession` calls and is therefore untouched by Steps 3-5. It loads every active session from the database and writes `autoReconnect: false` on each. `RecoveryRunner.ts:274` reads exactly that flag and returns `shouldRecover: false, reason: 'autoReconnect disabled in metadata'`, so the next boot refuses to restore the session. This is what makes the logout permanent rather than momentary, and fixing only `destroySession` would ship a half-cure.

In `apps/whatsapp-service/src/services/whatsapp-core/SessionManager.ts`, in the `// Final cleanup` block near the end of `shutdownAllSessions`, replace the `updateSessionStatus` call:

```ts
        await SessionPersistenceService.updateSessionStatus(session.sessionId, 'disconnected', {
          metadata: {
            ...(session.metadata ?? {}),
            shutdownReason: 'Server shutdown',
            shutdownTimestamp: new Date().toISOString(),
          },
        });
```

Two deliberate changes, and one deliberate non-change.

**`autoReconnect` is no longer written at all** — not `false`, and not `true` either. `RecoveryRunner.ts:274` blocks only on `autoReconnect === false`, so simply omitting the key lets a healthy session recover. Writing `true` would be just as wrong as writing `false`, in the opposite direction: `loadActiveSessions()` filters on `isActive` alone (`SessionPersistenceService.ts:95-99`), so the sweep touches every active row in the database — including sessions this process never managed, and sessions deliberately stopped by `forceDisconnectSession` (`SessionManager.ts:237`), `ConnectionManager.ts:355`, `EventDispatcher.ts:505` or the conservative `default:` branch of `handleSessionDisconnect` (`SessionManager.ts:281-288`). For that last one, `autoReconnect: false` is the *only* signal keeping the session out of recovery: its `lastError` ("Unknown disconnect: …") matches neither `AuthValidator.isSessionClosedByUser` nor `RecoveryRunner`'s `permanentFailureIndicators`. Blanket-writing `true` would silently resurrect it.

**`metadata` is merged, not replaced.** `updateSessionStatus` assigns the object wholesale (`SessionPersistenceService.ts:228`), so a bare literal would erase `forceDisconnected`, `authInvalidated` and `manualDisconnect` — all of which are written elsewhere and read by the recovery path. Spread the existing `session.metadata` first.

**`lastError: 'Server shutdown'` is dropped**, because a planned shutdown is not an error and `lastError` feeds recovery heuristics. Note this does not clear an existing value: `updateSessionStatus` skips `undefined` fields (`SessionPersistenceService.ts:225`), so whatever was there stays. That is intentional — clearing error history is not this task's job.

The `status: 'disconnected'` write stays: while the process is down the session genuinely is disconnected, and the dashboard should say so. Keep the surrounding `try`/`catch`, the `loadActiveSessions()` call and the log line exactly as they are.

**Consequence for production:** the 30 rows already carrying `autoReconnect: false` from previous deploys are *not* repaired by this change. That is a one-off SQL update, tracked as operational follow-up, not code.

- [ ] **Step 6: Run the test to verify the first four cases pass**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "SessionManager.shutdown"`

Expected: PASS, 4/4.

- [ ] **Step 7: Repair the double `session-` prefix in the delete path**

Only now that shutdown no longer reaches this code is it safe to make the delete actually delete. In `apps/whatsapp-service/src/services/whatsapp-core/AuthenticationManager.ts:347`, pass the bare id — `SessionCleanupUtil.cleanupSession` adds the `session-` prefix itself at `utils/sessionCleanup.ts:16`:

```ts
        await SessionCleanupUtil.cleanupSession(sessionId, authDataPath);
```

- [ ] **Step 8: Verify no other caller relies on the old shutdown signature**

Run: `cd apps/whatsapp-service && grep -rn "shutdownAllSessions\|cleanupSessionAuth" src --include="*.ts"`

Expected: `shutdownAllSessions` appears only at its definition in `SessionManager.ts` and the single call in `WhatsAppServiceSimple.ts`. `cleanupSessionAuth` appears at its definition in `AuthenticationManager.ts` and in the session-delete path only — **not** in any shutdown path. If a third caller exists, give it an explicit `mode` argument before continuing.

- [ ] **Step 9: Typecheck and run the full suite**

Run: `cd apps/whatsapp-service && pnpm typecheck && pnpm run test`

Expected: typecheck clean; 76 passing (71 baseline + 5 new).

- [ ] **Step 10: Commit**

```bash
git add apps/whatsapp-service/src/services/whatsapp-core/SessionManager.ts \
        apps/whatsapp-service/src/services/whatsapp-core/SessionManager.shutdown.spec.ts \
        apps/whatsapp-service/src/services/whatsapp-core/AuthenticationManager.ts \
        apps/whatsapp-service/src/services/WhatsAppServiceSimple.ts
git commit -m "fix(whatsapp-service): stop deploys from logging every session out

shutdownAllSessions routed through destroySession, which deactivates the
session in Postgres and runs cleanupSessionAuth. Every pm2 restart therefore
set is_active=false and status='disconnected' on all sessions -- which is why
production shows 30/30 disconnected with no traffic since 2026-06-30.

destroySession now takes an explicit mode ('shutdown' | 'delete', default
'delete' so existing callers are unchanged) and only deactivates + cleans up
in delete mode. shutdownAllSessions drops its cleanupCallback parameter
entirely so the wipe cannot be reintroduced by a caller.

The same method's trailing 'Final cleanup' sweep was the other half, and the
half that made the logout permanent: it wrote autoReconnect=false on every
active session, which RecoveryRunner reads to refuse recovery on the next
boot ('autoReconnect disabled in metadata'). It now writes true -- and since
updateSessionStatus replaces metadata wholesale, that also clears the stale
false left by earlier deploys. lastError='Server shutdown' is dropped: a
planned shutdown is not an error and lastError feeds recovery heuristics.

Also repairs the double 'session-' prefix in cleanupSessionAuth, which made
the delete path a silent no-op against ./wwebjs_auth/session-session-<id>.
That bug is the only reason credentials survived until now, so it is fixed
strictly after shutdown stopped reaching this code."
```

---

## Task 2: Delete the auth-snapshot subsystem

`auth_data` is null on all 30 production rows and `ENABLE_AUTH_SNAPSHOTS` gates the whole feature, so this removes a subsystem that has never produced a byte in production — along with the `tar` dependency and a set of REST endpoints and dashboard buttons that cannot do anything useful. The AES-GCM primitive is worth keeping; Task 4 reuses it.

**Files:**
- Create: `apps/whatsapp-service/src/services/crypto/AesGcm.ts`
- Test: `apps/whatsapp-service/src/services/crypto/AesGcm.spec.ts`
- Delete: `apps/whatsapp-service/src/services/auth-snapshot/` (`SnapshotService.ts`, `EncryptionService.ts`, `types.ts`)
- Modify: `apps/whatsapp-service/src/services/WhatsAppServiceSimple.ts` (lines 7, 128, 180-184, 554, 639-648, 668-678, 739)

> **Line numbers in this task are from before Task 1.** Task 1 already edited `WhatsAppServiceSimple.shutdown()`, so everything below its edit has shifted. Locate each site by content, not by line number. In particular, `shutdown()` now ends with `await this.sessionManager.shutdownAllSessions(this.clients);` and **must keep that single-argument call** — removing the snapshot interval from the same method must not restore the cleanup callback Task 1 deleted.
- Modify: `apps/whatsapp-service/src/services/SessionRecoveryService.ts` (lines 3, 113-121)
- Modify: `apps/whatsapp-service/src/services/SessionPersistenceService.ts` (line 4, `saveSnapshotData`, `clearSnapshotData`)
- Modify: `apps/whatsapp-service/src/routes/index.ts` (lines 144-196)
- Modify: `apps/dashboard/app/dashboard/whatsapp/page.tsx` (lines ~773, 808, 837-840 and their buttons)
- Modify: `apps/whatsapp-service/package.json`, root `package.json`, `HANDOFF-BAILEYS-MIGRATION.md`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `AesGcm.encrypt(plaintext: Buffer, keyHex: string): { ciphertext: Buffer; iv: Buffer; authTag: Buffer }` and `AesGcm.decrypt(ciphertext: Buffer, iv: Buffer, authTag: Buffer, keyHex: string): Buffer`. The key is a parameter, not read from a fixed env var, so Task 4 can pass `WHATSAPP_AUTH_ENCRYPTION_KEY` without inheriting `SNAPSHOT_ENCRYPTION_KEY`.

- [ ] **Step 1: Write the failing test for the extracted primitive**

Create `apps/whatsapp-service/src/services/crypto/AesGcm.spec.ts`:

```ts
jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { AesGcm } from './AesGcm';

const KEY = 'a'.repeat(64);
const OTHER_KEY = 'b'.repeat(64);

describe('AesGcm', () => {
  it('round_trips_a_buffer_with_the_same_key', () => {
    const plaintext = Buffer.from(JSON.stringify({ creds: 'signal-state' }), 'utf8');

    const { ciphertext, iv, authTag } = AesGcm.encrypt(plaintext, KEY);
    const decrypted = AesGcm.decrypt(ciphertext, iv, authTag, KEY);

    expect(decrypted.toString('utf8')).toBe(plaintext.toString('utf8'));
    expect(ciphertext.equals(plaintext)).toBe(false);
  });

  it('produces_a_different_iv_per_call', () => {
    const plaintext = Buffer.from('same input', 'utf8');

    const first = AesGcm.encrypt(plaintext, KEY);
    const second = AesGcm.encrypt(plaintext, KEY);

    expect(first.iv.equals(second.iv)).toBe(false);
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
  });

  it('throws_when_decrypting_with_the_wrong_key', () => {
    const { ciphertext, iv, authTag } = AesGcm.encrypt(Buffer.from('x', 'utf8'), KEY);

    expect(() => AesGcm.decrypt(ciphertext, iv, authTag, OTHER_KEY)).toThrow();
  });

  it('throws_when_the_ciphertext_has_been_tampered_with', () => {
    const { ciphertext, iv, authTag } = AesGcm.encrypt(Buffer.from('tamper me', 'utf8'), KEY);
    ciphertext[0] ^= 0xff;

    expect(() => AesGcm.decrypt(ciphertext, iv, authTag, KEY)).toThrow();
  });

  it('rejects_a_key_that_is_not_64_hex_chars', () => {
    expect(() => AesGcm.encrypt(Buffer.from('x', 'utf8'), 'tooshort')).toThrow(
      /64-character hex/
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "AesGcm"`

Expected: FAIL with `Cannot find module './AesGcm'`.

- [ ] **Step 3: Write the extracted primitive**

Create `apps/whatsapp-service/src/services/crypto/AesGcm.ts`:

```ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/**
 * AES-256-GCM over Node's native crypto. Extracted from the deleted
 * auth-snapshot/EncryptionService so the key is a parameter rather than a
 * fixed env var: snapshots and Baileys credentials must not share a key.
 */
export class AesGcm {
  private static toKey(keyHex: string): Buffer {
    if (!keyHex || keyHex.length !== 64) {
      throw new Error(
        'Encryption key must be a 64-character hex string (32 bytes). ' +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }
    return Buffer.from(keyHex, 'hex');
  }

  static encrypt(
    plaintext: Buffer,
    keyHex: string
  ): { ciphertext: Buffer; iv: Buffer; authTag: Buffer } {
    const key = this.toKey(keyHex);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { ciphertext, iv, authTag: cipher.getAuthTag() };
  }

  static decrypt(ciphertext: Buffer, iv: Buffer, authTag: Buffer, keyHex: string): Buffer {
    const key = this.toKey(keyHex);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "AesGcm"`

Expected: PASS, 5/5.

- [ ] **Step 5: Remove the snapshot call sites from `WhatsAppServiceSimple.ts`**

Delete the `import SnapshotService from './auth-snapshot/SnapshotService';` at line 7. Then remove each of the following, along with the now-unreachable branches around them:

- Line 128: the `if (SnapshotService.isEnabled() && !this.snapshotIntervalId)` block that starts the periodic snapshot interval, and the `snapshotIntervalId` field declaration.
- Lines 180-184: the `!authFileInfo.exists && SnapshotService.isEnabled()` restore-on-boot branch. Keep the `authFileInfo.exists` check itself; only the restore attempt goes.
- Line 554: the `createSnapshot` call inside the periodic task; delete the enclosing method if it has no other purpose.
- Lines 639-648 (`backupSession`), 668-678 (`restoreBackup`), 739 (`getBackupStatus`): delete these three public methods outright.

In `shutdown()`, the `if (this.snapshotIntervalId) { clearInterval(...) }` block at lines 351-355 goes with the field.

- [ ] **Step 6: Remove the snapshot call sites from `SessionRecoveryService.ts`**

Delete the `import SnapshotService from './auth-snapshot/SnapshotService';` at line 3 and the whole `if (SnapshotService.isEnabled())` block spanning lines 113-121, including the nested `hasLocalAuth` / `restoreSnapshot` attempt. Recovery falls back to whatever the method already did when snapshots were disabled — which is the production behaviour today.

- [ ] **Step 7: Remove snapshot persistence from `SessionPersistenceService.ts`**

Delete the `import type { SnapshotData } from './auth-snapshot/types';` at line 4, and delete the `saveSnapshotData`, `clearSnapshotData` (the latter at line 403) **and `getSnapshotData`** methods. `getSnapshotData` is typed on the `SnapshotData` import being removed, and all three of its callers disappear under the other steps of this task, so leaving it behind would be dead code that does not typecheck. Leave the `authData` column in the schema alone — Task 4 does not use it, and dropping a column is a Phase 2 concern.

**`clearSnapshotData` has one caller outside the snapshot subsystem**: `WhatsAppServiceSimple.handleAuthInvalidated` (the `auth_failure` / unpaired-from-phone handler, around line 594) calls it as its step 2, "Clear stale snapshot from DB". Remove that call and its `try`/`catch` along with the method. Keep the rest of `handleAuthInvalidated` — its step 1, `cleanupSessionAuth`, is the legitimate delete path and must survive. Renumber the comments in that method so they stay accurate.

- [ ] **Step 7b: Re-source `getSessionHealth` off the snapshot subsystem**

`WhatsAppServiceSimple.getSessionHealth` survives — it backs `GET /sessions/:sessionId/health` (`routes/index.ts:202`), which this task keeps — but two of its fields come from code being deleted. It currently calls `SnapshotService.hasLocalAuth(sessionId)` and `this.getBackupStatus(sessionId)`.

**Drop `backupStatus` entirely** from both the return type and the body. It reports on a feature that no longer exists, and in production it has only ever reported "no backup" because `auth_data` is null on every row.

**Keep `hasLocalAuth`, re-sourced.** "Does this session have credentials on disk" is useful diagnostics and has nothing to do with snapshots — it only lived in `SnapshotService` by accident. Take it from `AuthenticationManager.getAuthFileInfo` instead, which builds the same path and is already used three times inside that class:

```ts
    const authInfo = await this.authenticationManager.getAuthFileInfo(sessionId, './wwebjs_auth');
    const hasLocalAuth = authInfo.exists;
```

Note `getAuthFileInfo` takes `authDataPath` with no default, unlike `cleanupSessionAuth`. Pass the `'./wwebjs_auth'` literal, matching what `WhatsAppServiceSimple` already hardcodes at line 173. Do not extract a shared constant — that is refactoring beyond this task.

Leave `heartbeatAge` and `authInvalidated` exactly as they are.

- [ ] **Step 8: Remove the three backup endpoints**

In `apps/whatsapp-service/src/routes/index.ts`, delete the route blocks at lines 144-159 (`POST /sessions/:sessionId/backup`), 164-179 (`POST /sessions/:sessionId/restore-backup`) and 184-196 (`GET /sessions/:sessionId/backup-status`), together with the comment block at lines 141-143 that introduces them.

Leave `POST /sessions/restore` (line 53) and `GET /sessions/backup` (line 59) alone — those are `sessionController` methods for a different concern, not the snapshot subsystem. Confirm with `grep -n "restoreSessions\|backupSessions" src/controllers/SessionController.ts` before deleting anything else.

- [ ] **Step 9: Remove the dashboard backup UI**

In `apps/dashboard/app/dashboard/whatsapp/page.tsx`, delete the `backupInProgress` state at line ~773, the handler containing the `fetch(...)/backup` call at line ~808, the handler containing the `confirm(...)` and `fetch(...)/restore-backup` calls at lines ~837-840, and the two buttons that invoke them. Search for `backupInProgress` to find every reference.

Also, in the "Health & Backup Indicators" block (around lines 1083-1152), delete the **backup** indicator — the rows reading `health.backupStatus?.hasBackup` and `health.backupStatus.lastBackupDate` (around lines 1118-1124) — because Step 7b removes that field from the health payload. **Keep the auth indicator** at lines ~1141-1146 (`health.hasLocalAuth`): that field survives, re-sourced. Keep the heartbeat rows untouched. Rename the block's comment to "Health Indicators".

Do **not** touch `apps/dashboard/app/dashboard/settings/page.tsx` — its `"backup"` tab is a different, unrelated settings section.

- [ ] **Step 10: Delete the directory and the dependency**

```bash
rm -rf apps/whatsapp-service/src/services/auth-snapshot
cd apps/whatsapp-service && pnpm remove tar && pnpm remove -D @types/tar 2>/dev/null || true
```

If `@types/tar` is not present, the second command's failure is expected and harmless.

- [ ] **Step 11: Remove the two broken cleanup-chrome aliases**

`apps/whatsapp-service/scripts/cleanup-chrome.ps1` does not exist and is not tracked in git, so both aliases fail today. Delete lines 19-20 of `apps/whatsapp-service/package.json`:

```jsonc
    "cleanup-chrome": "pwsh -ExecutionPolicy Bypass -File scripts/cleanup-chrome.ps1",
    "cleanup-chrome-force": "pwsh -ExecutionPolicy Bypass -File scripts/cleanup-chrome.ps1 -Force",
```

and lines 39-40 of the root `package.json`:

```jsonc
    "whatsapp:cleanup-chrome": "turbo run cleanup-chrome --filter=@leadcrm/whatsapp-service",
    "whatsapp:cleanup-chrome-force": "turbo run cleanup-chrome-force --filter=@leadcrm/whatsapp-service",
```

Then remove the `pnpm whatsapp:cleanup-chrome` / `-force` rows from the "Maintenance" command list in `CLAUDE.md`.

- [ ] **Step 12: Correct the stale line references in the handoff**

In `HANDOFF-BAILEYS-MIGRATION.md`, change `PLAN-WHATSAPP-AGENT-MULTITENANT.md:37` to `:41`, `:73` to `:77`, and the prose "lo dice en la línea 53" to "línea 57". Change "Los 9 eventos se vuelven uno" to "Los 8 eventos se vuelven uno" (`qr`, `ready`, `authenticated`, `auth_failure`, `disconnected`, `change_state`, `loading_screen`, `message`). Replace the "Reescribir … `services/auth-snapshot/SnapshotService.ts`" bullet with a note that the subsystem was deleted in this task, and delete `scripts/cleanup-chrome.ps1` from the "Borrar" list.

- [ ] **Step 13: Verify nothing still references the deleted module**

Run:

```bash
cd apps/whatsapp-service
grep -rn "SnapshotService\|auth-snapshot\|SnapshotData\|snapshotIntervalId\|from 'tar'" src --include="*.ts"
grep -rn "restore-backup\|backup-status\|backupInProgress" ../dashboard/app --include="*.tsx"
```

Expected: no output from either command.

- [ ] **Step 14: Typecheck all three apps and run the suite**

Run: `pnpm typecheck && cd apps/whatsapp-service && pnpm run test`

Expected: typecheck clean across dashboard, api and whatsapp-service; 81 passing (76 + 5 new).

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "refactor(whatsapp-service): delete the auth-snapshot subsystem

whatsapp_sessions.auth_data is NULL on all 30 production rows and the whole
feature is gated behind ENABLE_AUTH_SNAPSHOTS, so SnapshotService has never
written a byte in production. Removes it along with EncryptionService, the
tar dependency, the three backup REST endpoints and the dashboard buttons
that drove them.

AES-256-GCM survives as services/crypto/AesGcm.ts with the key passed in
rather than read from SNAPSHOT_ENCRYPTION_KEY, so the Baileys credential
store can reuse it under its own key.

Also drops the two cleanup-chrome script aliases (the .ps1 they invoke is
absent and untracked, so both have been failing) and corrects three stale
line references plus the event count in HANDOFF-BAILEYS-MIGRATION.md."
```

---

## Task 3: Normalized message DTO and characterization tests

The inbound path — dedupe, group/broadcast filter, whitelist, AI, persistence, webhook — has no direct test coverage and is the code that moves most in Phase 2. This task pins its behaviour against an engine-agnostic DTO so the tests survive the library swap.

**Files:**
- Create: `apps/whatsapp-service/src/types/messages.ts`
- Create: `apps/whatsapp-service/src/services/whatsapp-core/wwebjs-normalizer.ts`
- Create: `apps/whatsapp-service/src/services/whatsapp-core/IncomingMessagePipeline.ts`
- Test: `apps/whatsapp-service/src/services/whatsapp-core/IncomingMessagePipeline.spec.ts`
- Modify: `apps/whatsapp-service/src/services/whatsapp-core/EventDispatcher.ts:312-393`
- Modify: `apps/whatsapp-service/src/services/whatsapp-core/MessageHandler.ts:130` (the `processMessageWithAI` signature — see Step 7)

**Interfaces:**
- Consumes: nothing from Tasks 1-2.
- Produces:
  - `NormalizedWhatsAppMessage` (see Step 3) — the only message shape allowed past this boundary.
  - `normalizeWwebjsMessage(message: Message, sessionId: string): NormalizedWhatsAppMessage | null` — returns `null` when the sender phone cannot be resolved or the payload carries no supported content. Phase 2 replaces this function with a Baileys equivalent of the same signature and nothing else changes.
  - `IncomingMessagePipeline<TTransport>.handle(dto: NormalizedWhatsAppMessage, transport: TTransport): Promise<void>` — the engine-agnostic orchestration. Generic over the transport handle so the pipeline threads it to the reply path without importing a library type.

**Note on `WhatsAppMessage`:** `types/index.ts:5` already defines a `WhatsAppMessage` with `from`/`to`/`body`. Leave it in place — `parseMessage`, the webhook payload and `EnrichedContext.conversationHistory` all consume it, and renaming it is a bigger change than this task needs. `NormalizedWhatsAppMessage` is the new inbound-path type; `WhatsAppMessage` stays the webhook/history type until Phase 2 decides whether to merge them.

- [ ] **Step 1: Write the failing characterization test**

Create `apps/whatsapp-service/src/services/whatsapp-core/IncomingMessagePipeline.spec.ts`:

```ts
const mockSetNX = jest.fn();
const mockCheckPhone = jest.fn();
const mockProcessWithAI = jest.fn();
const mockSendWebhook = jest.fn();
const mockUpdateStatus = jest.fn();

jest.mock('../../config/redis', () => ({
  redisClient: { setNX: (...args: unknown[]) => mockSetNX(...args) },
  REDIS_KEYS: { MESSAGE_DEDUP: 'whatsapp:dedup:' },
  REDIS_TTL: { MESSAGE_DEDUP_SECONDS: 300 },
  REDIS_CHANNELS: {},
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { IncomingMessagePipeline } from './IncomingMessagePipeline';
import type { NormalizedWhatsAppMessage } from '../../types/messages';

const SESSION_ID = 's1';
const SENDER = '34600000000';

function dto(overrides: Partial<NormalizedWhatsAppMessage> = {}): NormalizedWhatsAppMessage {
  return {
    id: `${SESSION_ID}:ABC123`,
    sessionId: SESSION_ID,
    senderPhone: SENDER,
    recipientPhone: '34999999999',
    text: 'hola',
    timestamp: 1756000000,
    type: 'text',
    isGroup: false,
    fromMe: false,
    ...overrides,
  };
}

// A stand-in for the library object. The pipeline must never look inside it,
// so anything with an identity we can assert on will do.
const TRANSPORT = { id: 'fake-transport' };

function makePipeline() {
  return new IncomingMessagePipeline<typeof TRANSPORT>({
    authChecker: { checkPhoneNumberAllowedWithLog: mockCheckPhone } as any,
    messageHandler: { processMessageWithAI: mockProcessWithAI } as any,
    sessionManager: { updateSessionStatus: mockUpdateStatus } as any,
    sendWebhook: mockSendWebhook,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSetNX.mockResolvedValue(true);
  mockCheckPhone.mockResolvedValue({ allowed: true });
  mockProcessWithAI.mockResolvedValue(undefined);
  mockSendWebhook.mockResolvedValue(undefined);
  mockUpdateStatus.mockResolvedValue(undefined);
});

describe('IncomingMessagePipeline', () => {
  it('processes_authorized_inbound_message_and_sends_one_webhook', async () => {
    await makePipeline().handle(dto(), TRANSPORT);

    expect(mockCheckPhone).toHaveBeenCalledWith(SENDER, SESSION_ID, 'hola');
    expect(mockProcessWithAI).toHaveBeenCalledTimes(1);
    expect(mockProcessWithAI).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        senderPhone: SENDER,
        text: 'hola',
      }),
      // The transport handle is threaded through untouched -- the pipeline
      // never inspects it, but the reply path downstream depends on it.
      TRANSPORT
    );
    expect(mockSendWebhook).toHaveBeenCalledTimes(1);
    expect(mockSendWebhook.mock.calls[0][0]).toMatchObject({
      event: 'message',
      sessionId: SESSION_ID,
    });
  });

  it('deduplicates_same_message_id_before_authorization_ai_and_webhook', async () => {
    const pipeline = makePipeline();
    mockSetNX.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await pipeline.handle(dto(), TRANSPORT);
    await pipeline.handle(dto(), TRANSPORT);

    expect(mockSetNX).toHaveBeenCalledTimes(2);
    expect(mockCheckPhone).toHaveBeenCalledTimes(1);
    expect(mockProcessWithAI).toHaveBeenCalledTimes(1);
    expect(mockSendWebhook).toHaveBeenCalledTimes(1);
  });

  it('scopes_the_dedupe_key_by_session', async () => {
    await makePipeline().handle(dto(), TRANSPORT);

    expect(mockSetNX).toHaveBeenCalledWith(`whatsapp:dedup:${SESSION_ID}:ABC123`, '1', 300);
  });

  it('skips_ai_but_still_webhooks_when_sender_is_not_allowed', async () => {
    mockCheckPhone.mockResolvedValue({ allowed: false, reason: 'not whitelisted' });

    await makePipeline().handle(dto(), TRANSPORT);

    expect(mockProcessWithAI).not.toHaveBeenCalled();
    expect(mockSendWebhook).toHaveBeenCalledTimes(1);
  });

  it('drops_group_and_own_messages_before_authorization', async () => {
    const pipeline = makePipeline();

    await pipeline.handle(dto({ isGroup: true }), TRANSPORT);
    await pipeline.handle(dto({ fromMe: true }), TRANSPORT);
    await pipeline.handle(dto({ text: '   ' }), TRANSPORT);

    expect(mockCheckPhone).not.toHaveBeenCalled();
    expect(mockProcessWithAI).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "IncomingMessagePipeline"`

Expected: FAIL with `Cannot find module './IncomingMessagePipeline'`.

- [ ] **Step 3: Define the DTO**

Create `apps/whatsapp-service/src/types/messages.ts`:

```ts
export type NormalizedMessageType = 'text' | 'image' | 'audio' | 'video' | 'document';

/**
 * The only message shape allowed past the engine boundary. No library type,
 * JID, LID or protobuf reaches the AI layer or the database through this.
 */
export interface NormalizedWhatsAppMessage {
  /** `${sessionId}:${providerMessageId}` — opaque, never a JID. */
  id: string;
  sessionId: string;
  /** E.164 without the leading '+': /^[1-9]\d{7,14}$/ */
  senderPhone: string;
  /** null when the chat is not one-to-one. */
  recipientPhone: string | null;
  /** Already extracted from conversation / extendedTextMessage.text / caption. */
  text: string;
  /** Unix seconds. */
  timestamp: number;
  type: NormalizedMessageType;
  isGroup: boolean;
  fromMe: boolean;
}
```

- [ ] **Step 4: Write the pipeline**

Create `apps/whatsapp-service/src/services/whatsapp-core/IncomingMessagePipeline.ts`:

```ts
import { redisClient, REDIS_KEYS, REDIS_TTL } from '../../config/redis';
import { logger } from '../../utils/logger';
import type { NormalizedWhatsAppMessage } from '../../types/messages';

/**
 * Generic over the transport handle so this file threads it through without
 * ever importing a library type. `EventDispatcher` instantiates it as
 * `IncomingMessagePipeline<Message>`; the pipeline itself only passes the
 * value along and never inspects it.
 */
export interface IncomingMessagePipelineDeps<TTransport> {
  authChecker: {
    checkPhoneNumberAllowedWithLog(
      phone: string,
      sessionId: string,
      body: string
    ): Promise<{ allowed: boolean; reason?: string }>;
  };
  messageHandler: {
    processMessageWithAI(dto: NormalizedWhatsAppMessage, transport: TTransport): Promise<void>;
  };
  sessionManager: {
    updateSessionStatus(sessionId: string, status: string, data?: unknown): Promise<void>;
  };
  sendWebhook(payload: {
    event: string;
    sessionId: string;
    data: NormalizedWhatsAppMessage;
    timestamp: string;
  }): Promise<void>;
}

const HEALTH_UPDATE_INTERVAL_MS = 30000;

export class IncomingMessagePipeline<TTransport> {
  private lastHealthUpdate = 0;

  constructor(private readonly deps: IncomingMessagePipelineDeps<TTransport>) {}

  async handle(dto: NormalizedWhatsAppMessage, transport: TTransport): Promise<void> {
    try {
      // Dedupe first: the transport may re-emit the same message on reconnect.
      // The key is session-scoped -- two tenants can legitimately see the same
      // provider message id.
      const dedupeKey = `${REDIS_KEYS.MESSAGE_DEDUP}${dto.id}`;
      logger.info(`[DEDUPE] Checking msgId=${dto.id} session=${dto.sessionId}`);
      const isFirstTime = await redisClient.setNX(
        dedupeKey,
        '1',
        REDIS_TTL.MESSAGE_DEDUP_SECONDS
      );
      if (!isFirstTime) {
        logger.info(`[DEDUPE] Skipping already-processed message ${dto.id}`);
        return;
      }

      if (dto.isGroup) {
        logger.debug(`[FILTER] Skipping group message in session ${dto.sessionId}`);
        return;
      }

      const now = Date.now();
      if (now - this.lastHealthUpdate > HEALTH_UPDATE_INTERVAL_MS) {
        this.lastHealthUpdate = now;
        await this.deps.sessionManager.updateSessionStatus(dto.sessionId, 'ready', {
          lastHealthCheck: new Date(),
        });
      }

      if (!dto.fromMe && dto.text.trim()) {
        const verdict = await this.deps.authChecker.checkPhoneNumberAllowedWithLog(
          dto.senderPhone,
          dto.sessionId,
          dto.text
        );
        if (verdict.allowed) {
          logger.info(`📱 Respuesta automática permitida para: ${dto.senderPhone}`);
          await this.deps.messageHandler.processMessageWithAI(dto, transport);
        } else {
          logger.info(
            `🚫 Respuesta automática bloqueada para: ${dto.senderPhone} - ${verdict.reason}`
          );
        }
      }

      // The webhook wire format is FROZEN. `apps/api` consumes this payload
      // over HTTP and reads `data.from` and `data.body`; its controller types
      // the field as `any`, so neither side's typecheck can catch a drift.
      // Emitting the DTO raw here throws `undefined.replace()` in the API on
      // every inbound message. Map back to the published shape instead.
      await this.deps.sendWebhook({
        event: 'message',
        sessionId: dto.sessionId,
        data: {
          id: dto.id,
          from: dto.senderPhone,
          to: dto.recipientPhone,
          body: dto.text,
          timestamp: dto.timestamp,
          type: dto.type,
          isGroup: dto.isGroup,
          fromMe: dto.fromMe,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(`Error processing message in session ${dto.sessionId}:`, error);
    }
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "IncomingMessagePipeline"`

Expected: PASS, 5/5. If `drops_group_and_own_messages_before_authorization` fails on the `fromMe`/blank-text cases, note that those two are filtered *after* the health update rather than before — that is intentional and matches today's behaviour; only `isGroup` short-circuits early.

- [ ] **Step 6: Write the wwebjs normalizer**

Create `apps/whatsapp-service/src/services/whatsapp-core/wwebjs-normalizer.ts`:

```ts
import type { Message } from 'whatsapp-web.js';
import type { NormalizedWhatsAppMessage, NormalizedMessageType } from '../../types/messages';

const E164 = /^[1-9]\d{7,14}$/;

function toPhone(jid: string | undefined): string | null {
  if (!jid) return null;
  const bare = jid.split('@')[0].split(':')[0];
  return E164.test(bare) ? bare : null;
}

function toType(raw: string): NormalizedMessageType {
  switch (raw) {
    case 'image':
    case 'audio':
    case 'video':
    case 'document':
      return raw;
    default:
      return 'text';
  }
}

/**
 * The single place a whatsapp-web.js Message becomes a DTO. Phase 2 replaces
 * this file with a Baileys equivalent of the same signature; nothing else in
 * the inbound path should need to change.
 *
 * Returns null rather than a partial DTO when the sender cannot be resolved --
 * a half-populated message is worse than a dropped one.
 */
export function normalizeWwebjsMessage(
  message: Message,
  sessionId: string
): NormalizedWhatsAppMessage | null {
  const isGroup = message.from?.endsWith('@g.us') ?? false;

  // Order matters. In a group, `from` is the GROUP's JID -- an 18+ digit id
  // that fails the E164 test -- and the actual sender is in `author`. Resolving
  // `from` first would return null before `isGroup` was ever set, so every
  // group message would leave here as "unparseable" and the pipeline's group
  // branch would be unreachable dead code.
  const senderPhone = toPhone(isGroup ? message.author : message.from);
  if (!senderPhone) return null;

  return {
    id: `${sessionId}:${message.id._serialized}`,
    sessionId,
    senderPhone,
    recipientPhone: toPhone(message.to),
    text: message.body ?? '',
    timestamp: message.timestamp,
    type: toType(message.type as string),
    isGroup,
    fromMe: message.fromMe,
  };
}
```

- [ ] **Step 7: Rewire `EventDispatcher.onMessage`**

In `apps/whatsapp-service/src/services/whatsapp-core/EventDispatcher.ts`, replace the body of `onMessage` (lines 313-391) with a normalize-and-delegate. Keep the `status@broadcast` guard here — it is a transport concern, not a pipeline one, and the DTO has no field for it.

```ts
    const onMessage = async (message: Message) => {
      if (message.from === 'status@broadcast') {
        logger.debug(`[FILTER] Skipping status@broadcast in session ${sessionId}`);
        return;
      }

      const dto = normalizeWwebjsMessage(message, sessionId);
      if (!dto) {
        logger.warn(
          `[NORMALIZE] Dropping unparseable message in session ${sessionId} from=${message.from}`
        );
        return;
      }

      await pipeline.handle(dto, message);
    };
```

Construct `pipeline` once where the dispatcher already has `authChecker`, `messageHandler` and `sessionManager` in scope, as `new IncomingMessagePipeline<Message>({ … })`, passing `this.sendWebhook.bind(this)` as `sendWebhook`. This is the only place the transport type is named: the dispatcher already imports `Message`, so binding the generic here costs nothing and keeps the pipeline file free of library imports. Add the two imports at the top of the file. Delete the now-unused `lastHealthUpdate` local — the pipeline owns it.

`processMessageWithAI` currently takes `(originalMessage: Message, whatsappMessage: WhatsAppMessage, sessionId: string)`. Change it to:

```ts
  async processMessageWithAI(
    dto: NormalizedWhatsAppMessage,
    transport: Message
  ): Promise<void> {
```

The DTO replaces `whatsappMessage` and `sessionId` — every piece of **data** the method reads now comes from it. `transport` is the same object that used to arrive as `originalMessage`, renamed for what it actually is: the handle used to reach the chat, and nothing else.

Rename the parameter throughout the method body and in `sendResponseWithStrategy`, and put this comment above the signature:

```ts
  /**
   * `transport` is the Phase 2 seam — the one library object still reaching the
   * AI path. It carries no data: everything read here comes from `dto`. It
   * survives only because the reply strategies need a handle on the chat
   * (`getChat().sendStateTyping()`, `.reply()`, `chat.sendMessage()`).
   * Replacing it with a narrow reply port is the first step of the cutover.
   */
```

**Why not a single `dto` argument:** the three send paths inside this method — `getChat().sendStateTyping()` for the early typing indicator, `.reply()` in the fallback branches, and `targetChat.sendMessage()` in the strategy branch — all operate on that library object, and `MessageHandler` is stateless with no other route to a `Client` or `Chat` (the only client registry lives in `WhatsAppServiceSimple`). Dropping the parameter while keeping those paths is not possible: it either fails to compile or silently guts the reply path while the tests stay green.

**Why not introduce the reply port now:** it is the right end state, but `sendResponseWithStrategy` chooses between `reply()` and `sendMessage()` per strategy, so the port needs both verbs plus typing, and it has to be constructed where the library object is in scope. That is a design step of its own, and doing it here would turn a seam-building task into a rewrite of an 821-line file. Task 3's deliverable is that all **data** flows through the DTO; the transport handle is deliberately deferred, named and documented so Phase 2 can find it with a grep.

- [ ] **Step 8: Typecheck and run the full suite**

Run: `cd apps/whatsapp-service && pnpm typecheck && pnpm run test`

Expected: typecheck clean; 86 passing (81 + 5 new).

- [ ] **Step 9: Verify no library type crosses the boundary**

Run: `cd apps/whatsapp-service && grep -rn "whatsapp-web.js" src/services/whatsapp-core/IncomingMessagePipeline.ts src/types/messages.ts`

Expected: no output. The only `whatsapp-web.js` import in the inbound path should be in `wwebjs-normalizer.ts` and the dispatcher's own `Client`/`Message` types.

- [ ] **Step 10: Commit**

```bash
git add apps/whatsapp-service/src/types/messages.ts \
        apps/whatsapp-service/src/services/whatsapp-core/IncomingMessagePipeline.ts \
        apps/whatsapp-service/src/services/whatsapp-core/IncomingMessagePipeline.spec.ts \
        apps/whatsapp-service/src/services/whatsapp-core/wwebjs-normalizer.ts \
        apps/whatsapp-service/src/services/whatsapp-core/EventDispatcher.ts \
        apps/whatsapp-service/src/services/whatsapp-core/MessageHandler.ts
git commit -m "refactor(whatsapp-service): put a normalized DTO at the engine boundary

The inbound path had no direct tests and is the code that moves most in the
Baileys migration. Extracts the orchestration out of EventDispatcher.onMessage
into IncomingMessagePipeline, which only ever sees NormalizedWhatsAppMessage,
and isolates every whatsapp-web.js detail in wwebjs-normalizer.ts -- the one
file Phase 2 replaces.

Five characterization tests cover dedupe, session-scoped dedupe keys,
whitelist allow and deny, and the group/own/blank drops. They mock no library
type, so they survive the engine swap.

Also scopes the Redis dedupe key by sessionId. It was global, so two tenants
receiving the same provider message id would have silently deduped each
other."
```

---

## Task 4: Durable credential store

Replaces both the Chromium profile on disk and Baileys' file-based `useMultiFileAuthState` with a key-value table. Written now, while `whatsapp-web.js` is still running, so Phase 2 only has to wire Baileys' `AuthenticationState` onto an already-tested store.

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `apps/whatsapp-service/src/services/session-credentials/SessionCredentialsStore.ts`
- Test: `apps/whatsapp-service/src/services/session-credentials/SessionCredentialsStore.spec.ts`
- Modify: `apps/whatsapp-service/src/config/env.ts`

**Interfaces:**
- Consumes: `AesGcm.encrypt` / `AesGcm.decrypt` from Task 2.
- Produces:
  - `SessionCredentialsStore.get(sessionId: string, category: string, keyIds: string[]): Promise<Record<string, unknown>>` — missing ids are simply absent from the result.
  - `SessionCredentialsStore.set(sessionId: string, category: string, values: Record<string, unknown | null>): Promise<void>` — a `null` value deletes that key. Matches Baileys' `SignalKeyStore.set` semantics exactly.
  - `SessionCredentialsStore.clear(sessionId: string): Promise<void>` — deletes every row for the session. Called only on explicit logout or session delete, never on shutdown.

- [ ] **Step 1: Add the Prisma model**

In `packages/db/prisma/schema.prisma`, add:

```prisma
model WhatsAppAuthKey {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  sessionId String   @map("session_id") @db.VarChar(255)
  category  String   @db.VarChar(50)
  keyId     String   @map("key_id") @db.VarChar(255)
  value     Json
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  session WhatsAppSession @relation(fields: [sessionId], references: [sessionId], onDelete: Cascade, onUpdate: NoAction)

  @@unique([sessionId, category, keyId], map: "uniq_whatsapp_auth_keys_session_cat_key")
  @@index([sessionId, category], map: "idx_whatsapp_auth_keys_session_cat")
  @@map("whatsapp_auth_keys")
}
```

Add the back-relation to the existing `WhatsAppSession` model, next to `whatsappConversations`:

```prisma
  whatsappAuthKeys      WhatsAppAuthKey[]
```

`value` holds `{ ciphertext, iv, authTag }` as base64 strings — the plaintext Signal material never lands in Postgres. No `tenantId`: see *Decisions arbitrated during planning*.

- [ ] **Step 2: Generate the client and create the migration**

Run:

```bash
pnpm db:generate
pnpm db:migrate:dev --name add_whatsapp_auth_keys
```

Expected: `packages/db/prisma/migrations/<timestamp>_add_whatsapp_auth_keys/migration.sql` created, containing `CREATE TABLE "whatsapp_auth_keys"` and the unique index. Read the generated SQL before continuing and confirm it contains no `DROP`.

- [ ] **Step 3: Add the encryption key to the env contract**

In `apps/whatsapp-service/src/config/env.ts`, add to the zod schema alongside the other secrets:

```ts
  WHATSAPP_AUTH_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'WHATSAPP_AUTH_ENCRYPTION_KEY must be 64 hex chars (32 bytes)')
    .optional(),
```

Validate the **hex**, not just the length — a 64-character non-hex string would otherwise pass bootstrap and fail later inside `AesGcm`, which does check the character class.

**Do NOT add this key to the production fail-fast block.** `WHATSAPP_SERVICE_HMAC_SECRET` fails fast because it is used on every request; this key is used by nothing until Phase 2 wires the store. Calling `process.exit(1)` for a missing secret that no code path reads turns merging this branch into a boot loop on Hetzner unless someone sets the variable first — an outage caused by a task that is otherwise inert. A `logger.warn` outside test environments is the most this warrants. `SessionCredentialsStore.key()` already throws when the store is actually used without it, which is the right place to fail.

Add it to `.env.example` with a generation hint:

```bash
# 32 bytes hex. Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
WHATSAPP_AUTH_ENCRYPTION_KEY=
```

- [ ] **Step 4: Write the failing test**

Create `apps/whatsapp-service/src/services/session-credentials/SessionCredentialsStore.spec.ts`:

```ts
const mockUpsert = jest.fn();
const mockFindMany = jest.fn();
const mockDeleteMany = jest.fn();

jest.mock('@leadcrm/db', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    whatsAppAuthKey: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  })),
  Prisma: {},
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

process.env.WHATSAPP_AUTH_ENCRYPTION_KEY = 'c'.repeat(64);

import { SessionCredentialsStore } from './SessionCredentialsStore';

const SESSION_ID = 's1';

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue({});
  mockFindMany.mockResolvedValue([]);
  mockDeleteMany.mockResolvedValue({ count: 0 });
});

describe('SessionCredentialsStore', () => {
  it('round_trips_a_value_through_encryption', async () => {
    const store = new SessionCredentialsStore();
    const secret = { privateKey: 'signal-private-key', counter: 7 };

    await store.set(SESSION_ID, 'creds', { creds: secret });

    const stored = mockUpsert.mock.calls[0][0].create.value;
    expect(JSON.stringify(stored)).not.toContain('signal-private-key');

    mockFindMany.mockResolvedValue([{ keyId: 'creds', value: stored }]);
    const read = await store.get(SESSION_ID, 'creds', ['creds']);

    expect(read).toEqual({ creds: secret });
  });

  it('scopes_every_read_and_write_by_session_and_category', async () => {
    const store = new SessionCredentialsStore();

    await store.get(SESSION_ID, 'pre-key', ['1', '2']);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { sessionId: SESSION_ID, category: 'pre-key', keyId: { in: ['1', '2'] } },
      select: { keyId: true, value: true },
    });
  });

  it('writes_each_key_independently_so_concurrent_sets_cannot_lose_updates', async () => {
    const store = new SessionCredentialsStore();

    await store.set(SESSION_ID, 'session', { a: { v: 1 }, b: { v: 2 } });

    expect(mockUpsert).toHaveBeenCalledTimes(2);
    const keyIds = mockUpsert.mock.calls.map(c => c[0].where.sessionId_category_keyId.keyId);
    expect(keyIds.sort()).toEqual(['a', 'b']);
  });

  it('deletes_a_key_when_its_value_is_null', async () => {
    const store = new SessionCredentialsStore();

    await store.set(SESSION_ID, 'pre-key', { '3': null });

    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { sessionId: SESSION_ID, category: 'pre-key', keyId: { in: ['3'] } },
    });
  });

  it('omits_missing_keys_from_the_result_instead_of_returning_undefined_entries', async () => {
    const store = new SessionCredentialsStore();
    mockFindMany.mockResolvedValue([]);

    const read = await store.get(SESSION_ID, 'pre-key', ['missing']);

    expect(read).toEqual({});
  });

  it('clear_removes_every_row_for_the_session', async () => {
    const store = new SessionCredentialsStore();

    await store.clear(SESSION_ID);

    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { sessionId: SESSION_ID } });
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "SessionCredentialsStore"`

Expected: FAIL with `Cannot find module './SessionCredentialsStore'`.

- [ ] **Step 6: Write the store**

Create `apps/whatsapp-service/src/services/session-credentials/SessionCredentialsStore.ts`:

```ts
import { PrismaClient } from '@leadcrm/db';
import { AesGcm } from '../crypto/AesGcm';
import { logger } from '../../utils/logger';

interface EncryptedValue {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/**
 * Key-value credential store for WhatsApp session state.
 *
 * Shaped to match Baileys' SignalKeyStore (get by category + ids, set a batch,
 * null value means delete) so the auth adapter is a thin wrapper. One row per
 * key means concurrent Signal key rotations never contend, which a single JSON
 * blob could not offer without a per-session mutex on the crypto hot path.
 */
export class SessionCredentialsStore {
  constructor(private readonly prisma = new PrismaClient()) {}

  private key(): string {
    const key = process.env.WHATSAPP_AUTH_ENCRYPTION_KEY;
    if (!key) {
      throw new Error('WHATSAPP_AUTH_ENCRYPTION_KEY is not set; refusing to store credentials');
    }
    return key;
  }

  /**
   * Signal key material is binary. Plain JSON.stringify turns a Buffer into
   * `{"type":"Buffer","data":[…]}` and JSON.parse hands back that plain object
   * rather than a Buffer, so the round trip is lossy in exactly the case this
   * store exists for. These two mirror Baileys' own BufferJSON helpers, which
   * we cannot import yet because the dependency is Phase 2.
   */
  private static bufferReplacer(_key: string, value: unknown): unknown {
    if (value instanceof Uint8Array) {
      return { __buf: Buffer.from(value).toString('base64') };
    }
    // JSON.stringify pre-converts a Buffer to {type:'Buffer',data:[…]} before
    // the replacer sees it in some Node versions; catch that shape too.
    if (
      value &&
      typeof value === 'object' &&
      (value as { type?: string }).type === 'Buffer' &&
      Array.isArray((value as { data?: unknown }).data)
    ) {
      return { __buf: Buffer.from((value as { data: number[] }).data).toString('base64') };
    }
    return value;
  }

  private static bufferReviver(_key: string, value: unknown): unknown {
    if (value && typeof value === 'object' && typeof (value as { __buf?: string }).__buf === 'string') {
      return Buffer.from((value as { __buf: string }).__buf, 'base64');
    }
    return value;
  }

  private seal(value: unknown): EncryptedValue {
    const plaintext = Buffer.from(
      JSON.stringify(value, SessionCredentialsStore.bufferReplacer),
      'utf8'
    );
    const { ciphertext, iv, authTag } = AesGcm.encrypt(plaintext, this.key());
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  private open(stored: EncryptedValue): unknown {
    const plaintext = AesGcm.decrypt(
      Buffer.from(stored.ciphertext, 'base64'),
      Buffer.from(stored.iv, 'base64'),
      Buffer.from(stored.authTag, 'base64'),
      this.key()
    );
    return JSON.parse(plaintext.toString('utf8'), SessionCredentialsStore.bufferReviver);
  }

  async get(
    sessionId: string,
    category: string,
    keyIds: string[]
  ): Promise<Record<string, unknown>> {
    if (keyIds.length === 0) return {};

    const rows = await this.prisma.whatsAppAuthKey.findMany({
      where: { sessionId, category, keyId: { in: keyIds } },
      select: { keyId: true, value: true },
    });

    const result: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        result[row.keyId] = this.open(row.value as unknown as EncryptedValue);
      } catch (error) {
        // A key we cannot decrypt is a key we do not have. Surfacing it as
        // missing lets Baileys regenerate rather than crash the session.
        logger.error(
          `Failed to decrypt auth key ${category}/${row.keyId} for session ${sessionId}:`,
          error
        );
      }
    }
    return result;
  }

  async set(
    sessionId: string,
    category: string,
    values: Record<string, unknown | null>
  ): Promise<void> {
    const toDelete = Object.keys(values).filter(k => values[k] === null);
    const toWrite = Object.keys(values).filter(k => values[k] !== null);

    if (toDelete.length > 0) {
      await this.prisma.whatsAppAuthKey.deleteMany({
        where: { sessionId, category, keyId: { in: toDelete } },
      });
    }

    for (const keyId of toWrite) {
      const sealed = this.seal(values[keyId]);
      await this.prisma.whatsAppAuthKey.upsert({
        where: { sessionId_category_keyId: { sessionId, category, keyId } },
        create: { sessionId, category, keyId, value: sealed as unknown as object },
        update: { value: sealed as unknown as object },
      });
    }
  }

  /** Only on explicit logout or session delete. Never on shutdown. */
  async clear(sessionId: string): Promise<void> {
    await this.prisma.whatsAppAuthKey.deleteMany({ where: { sessionId } });
    logger.info(`Cleared all auth keys for session ${sessionId}`);
  }
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "SessionCredentialsStore"`

Expected: PASS, 6/6.

- [ ] **Step 8: Typecheck and run the full suite**

Run: `pnpm db:generate && pnpm typecheck && cd apps/whatsapp-service && pnpm run test`

Expected: typecheck clean; 92 passing (86 + 6 new).

- [ ] **Step 9: Apply the migration to Supabase**

The migration adds a table and touches no existing data, so it is safe to apply ahead of Phase 2. Apply it to `yxjzsargboxnuwnbuzax` and confirm:

```sql
select count(*) from whatsapp_auth_keys;
```

Expected: `0`. Confirm `whatsapp_sessions` still reports 30 rows and `messages` still reports 183 — the migration must not have touched either.

- [ ] **Step 10: Commit**

```bash
git add packages/db/prisma/schema.prisma \
        packages/db/prisma/migrations \
        apps/whatsapp-service/src/services/session-credentials/ \
        apps/whatsapp-service/src/config/env.ts \
        .env.example
git commit -m "feat(whatsapp-service): durable credential store in Postgres

Adds whatsapp_auth_keys, a key-value table shaped to match Baileys'
SignalKeyStore (get by category + ids, batch set, null value deletes) so the
Phase 2 auth adapter is a thin wrapper rather than a rewrite.

One row per key rather than a JSON blob on whatsapp_sessions.auth_data:
Signal rotates keys on the message hot path, and a blob forces
read-modify-write under a per-session mutex where a lost update corrupts the
ratchet irrecoverably.

Values are sealed with AES-256-GCM under WHATSAPP_AUTH_ENCRYPTION_KEY before
they reach Postgres. Disk-level encryption does not defend against a leaked
DATABASE_URL or service-role key, and these rows are a permanent session
token for the client's personal number.

No tenantId column: the table is engine-internal, read only by sessionId,
which is @unique on WhatsAppSession and already tenant-scoped."
```

---

## Phase 2 — scope of the follow-up plan

Not expanded into steps here, deliberately. Tasks 5-7 below are a `@whiskeysockets/baileys` implementation, and writing step-level code for a library that is not yet a dependency — against a contract that Tasks 3 and 4 are still in the process of establishing — would produce exactly the invented code this plan is supposed to avoid. Write `docs/superpowers/plans/<date>-baileys-cutover.md` once Task 4 has merged and the real interfaces exist.

What Phase 2 covers, with the boundaries already settled:

**Task 5 — Baileys engine behind the existing contract.** Pin `@whiskeysockets/baileys@6.7.x` (not 7.x, still a release candidate). Create `services/baileys/BaileysSessionManager.ts` as the single runtime import of the library: `makeWASocket`, the socket map, `connection.update`, `messages.upsert`, `sendText`, typing, close/logout, and an `AuthenticationState` adapter over `SessionCredentialsStore`. Replace `wwebjs-normalizer.ts` with a Baileys normalizer of the identical signature. Not yet wired to the facade — tested against a fake socket.

The eight `whatsapp-web.js` events collapse into `connection.update` with numeric `DisconnectReason` codes, so "transient reconnect vs real failure" becomes application logic. Two details to preserve: `EventDispatcher.ts:137` and `:183` both emit an `authenticated` payload today, and `SocketService.ts:265` turns it into `session:connected` — freeze that behaviour explicitly rather than letting the single Baileys event silently duplicate or drop it.

**Task 6 — atomic cutover.** `WhatsAppServiceSimple` delegates only to `BaileysSessionManager`. Then delete, in one commit: `whatsapp-web.js` and `puppeteer` deps, the `patchedDependencies` key in the root `package.json` **and** `patches/whatsapp-web.js@1.34.6.patch` (leaving the key without the dep fails `pnpm install` with `ERR_PNPM_PATCH_NOT_APPLIED`), `config/puppeteer.config.ts`, `PUPPETEER_*` from `turbo.json:15`, and `chromium` from `apps/whatsapp-service/Dockerfile:8,20,21`. Also resolve the two live `IWhatsAppSessionManager` definitions — `interfaces/IWhatsAppSessionManager.ts:12` and `types/index.ts:604` — into one, and drop `getClient(sessionId): any` from it, which is the last hole through which a library type escapes.

Two known landmines for that task: `SessionController.ts:2` and several routes import `WhatsAppServiceSimple` directly while bootstrap goes through `WhatsAppService.ts:45`, so changing one facade leaves a mixed runtime. And `SessionRecoveryService.ts:101`, `session/RecoveryRunner.ts:202`, `session/AuthValidator.ts:31` and `session-health-check/HealthMetrics.ts:139` all inspect `./wwebjs_auth` on the filesystem; they need to become `hasCredentials(sessionId)` against the store.

**Task 7 — smoke and deploy.** With zero connected sessions in production there is nothing to re-pair and no traffic to protect, so the handoff's re-pairing runbook, timed rollback window and long parallel canary all collapse into a single gate: deploy to Hetzner, connect one disposable number, and verify QR → ready, inbound → AI → DB → reply, outbound via REST, a duplicate message producing exactly one response, `pm2 restart` reconnecting **without a new QR**, and logout forcing one.

That restart check is the important one, and it is a direct regression test for Task 1:

```bash
pm2 restart whatsapp-service && sleep 5 && pm2 logs whatsapp-service --lines 35 --nostream
```

A `qr` in that output means credentials were purged on shutdown and the Task 1 separation regressed.

**Rollback, stated honestly.** Git restores code; it does not restore scanned session state, and the VPS has no Hetzner backups. The only artefact worth preserving before the cutover is `/opt/leadcrm/apps/whatsapp-service/wwebjs_auth/`, tarred with a checksum. Because production currently has zero connected sessions, that directory may well be empty — in which case there is genuinely nothing to lose, and the migration is cheaper right now than the handoff assumed.

### Risks the migration does not reduce

The spec requires these to be written into the plan before cutover rather than left as a footnote, because both get worse, not better, and neither is addressed by any task above.

**Ban risk rises slightly, and the number at stake is the client's personal one.** Bans are driven by sending behaviour, not by the client library, so nothing in this migration reduces that. But `whatsapp-web.js` drives a real Chrome and therefore presents a genuine browser fingerprint, while Baileys synthesises the protocol — its fingerprint is synthetic, so the *technical* risk is if anything marginally higher. This is the entire reason Phase 2's smoke test uses a disposable number rather than a pilot's or the operator's own.

**Resistance to WhatsApp-side changes gets worse.** `whatsapp-web.js` inherits WhatsApp Web's own updates through the browser and largely adapts on its own. Baileys reimplements the protocol, so a server-side change breaks it outright and stays broken until upstream ships a patch. Pinning `6.7.x` bounds the blast radius but does not remove it; budget for an unplanned dependency bump on someone else's schedule.

Neither risk blocks the migration — the 300-400 MB/session Chromium ceiling is the larger problem, and the pilot window is the cheap moment to pay for it. They are recorded here so the decision is made with both sides visible.

**Deploy.** Follow `CLAUDE.md` § "Production deployment notes" exactly. `pnpm build` is not optional — `apps/whatsapp-service` starts from `dist/index.js`, so skipping it restarts the previous bundle and the deploy looks successful while shipping nothing. Note that the deploy snippet at the end of `HANDOFF-BUMP-WAWEB.md:232` is the old, incorrect version (`pnpm install` without `--frozen-lockfile`, no build step); that file is WONTFIX, but fix the snippet so nobody reopening it deploys from it.
