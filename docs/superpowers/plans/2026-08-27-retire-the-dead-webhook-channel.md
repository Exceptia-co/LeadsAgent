# Retire the Dead Webhook Channel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the Nest inbound webhook channel — which has never run in production — and give the writer that *does* run the three fields the dead one was supposed to add.

**Architecture:** whatsapp-service already writes both rows of an exchange through `DatabaseService.saveConversation`. The Nest API has a parallel writer behind an HTTP webhook that is never delivered, because `WEBHOOK_URL` is unset and `WhatsAppEventPublisher` skips delivery without it. Wiring that channel up would produce two rows per inbound, run a whitelist *after* the AI had already replied, and let `authenticated` overwrite the `ready` status Baileys writes on connect. So it goes, along with everything that exists only to serve it.

**Tech Stack:** NestJS 10 (`apps/api`), Express + Baileys (`apps/whatsapp-service`), Prisma 6.15, Jest.

**Spec:** No separate spec document. This plan argues from production state measured on 2026-08-26/27 (Findings, below) and from a codex review of its first draft, which rejected one of its four tasks outright. The vault note `Efforts/LeadsAgent/Cutover a Baileys — ejecución y post-mortem.md` carries the surrounding history.

## Findings this plan argues from

| Claim | How it was verified |
|---|---|
| The Nest API has never received a webhook | `pm2 logs leadcrm-api` shows no `Processing message from …` since its last boot, only bootstrap lines |
| Because `WEBHOOK_URL` is unset on the VPS | `grep -E "^WEBHOOK_URL" /opt/leadcrm/apps/whatsapp-service/.env` → no match |
| And the publisher silently skips without it | `WhatsAppEventPublisher.ts:32` returns early at `debug` level |
| Socket.IO events are unaffected | Emitted before the HTTP half; the dashboard worked throughout the cutover smoke |
| `authenticated` would overwrite `ready` | `whatsapp.service.ts:270` writes `status: 'authenticated'`; Baileys' `onOpen` already wrote `ready` |
| No consumer of the endpoint outside whatsapp-service | Verified across dashboard, crons and scripts: the only producer is `WhatsAppEventPublisher` |
| `HmacAuthGuard` serves only this endpoint | `grep -rn "HmacAuthGuard" apps/api/src` → the webhook route and its spec override |
| `toMessageDate` serves only this endpoint | One caller: `whatsapp.service.ts:224`, inside `handleIncomingMessage` |
| `ContextEnricher` reads conversation history from the database | `ContextEnricher.ts:91` calls `DatabaseService.getConversationHistory` — the reason Task 4 of the first draft was withdrawn |
| 27 messages carry `leadId: null`, across 4 numbers | Grouped by the linked `whatsapp_conversations.phone_number`; 20 of them `14155238886`, Twilio's WhatsApp sandbox |
| Only 2 of the 27 resolve to an existing lead | Preflight counting leads per `(tenant_id, normalised phone)`: 2 resolvable, 25 with no candidate, 0 ambiguous |

The null `leadId`s were caused by the inbound path calling a read-only authorization method; fixed in `1d77a3d`. This plan does not revisit that.

## Global Constraints

- **Never run `prisma migrate deploy` against production.** No task here changes the schema, so no task here touches the database structure at all.
- **`apps/api` goes from 61 tests / 9 suites to 36 / 6**, plus whatever Task 1 Step 4 adds. It has been deliberately unmoved at 61/9 through the whole Baileys migration as evidence the frozen webhook contract survived, so the drop must be stated in the commit message or the next person reads it as a regression. The 25 deleted tests are: 5 (`whatsapp.controller.spec.ts`), 14 (`whatsapp.service.spec.ts` — 6 handler tests, 4 plain `toMessageDate` tests, and 4 more from the `it.each([undefined, 0, -1, NaN])` at `:205`), 6 (`hmac-auth.guard.spec.ts`); all three files go entirely. Note the `it.each`: counting `it(` occurrences gives 21 and is wrong, which is how the first draft of this plan got the number wrong twice. **Never add filler tests to protect the count.**
- **Socket.IO emission is out of scope.** Every task must leave `SocketService` untouched.
- **Deploy order: whatsapp-service, then the API.** Cleanest, but not a hard dependency — API-first would produce 404s that the publisher absorbs, not an outage. Do not write it up as a dependency.

---

## File Structure

| File | Responsibility after this plan |
|---|---|
| `apps/api/src/whatsapp/whatsapp.controller.ts` | Manual outbound send and whitelist admin. **No webhook endpoint.** |
| `apps/api/src/whatsapp/whatsapp.service.ts` | Manual outbound writer, session/tenant helpers. **No inbound handlers, no `toMessageDate`.** |
| `apps/api/src/whatsapp/hmac-auth.guard.ts` | **Deleted** — it guarded only the webhook route. |
| `apps/whatsapp-service/src/services/WhatsAppEventPublisher.ts` | Socket.IO emission only. **No HTTP delivery.** |
| `apps/whatsapp-service/src/services/DatabaseService.ts` | Sole writer of `messages` + `whatsapp_conversations`, now recording status, provider id, real time, and the lead's contact state |

---

### Task 1: Retire the Nest inbound channel

**Files:**
- Modify: `apps/api/src/whatsapp/whatsapp.controller.ts` (delete `@Post('webhook')` and the `HmacAuthGuard`/`WebhookPayload` imports)
- Modify: `apps/api/src/whatsapp/whatsapp.service.ts` (delete `handleIncomingMessage`, `handleSessionAuthenticated`, `handleSessionDisconnected`, `handleStatusChange`, `scopedSessionUpdate`, `toMessageDate`, the `WhatsAppMessage` type if it becomes unused, and the `WhitelistService` constructor injection — Prisma is all that remains)
- Modify: `apps/api/src/whatsapp/whitelist.service.ts` (delete `isNumberAuthorized`, `WhitelistCheckResult`, `checkSuspiciousPatterns`, `logWhitelistDecision` — all inbound-only; `updateLeadAuthorization`, which the admin endpoint uses, stays)
- Delete: `apps/api/src/whatsapp/hmac-auth.guard.ts`, `apps/api/src/whatsapp/hmac-auth.guard.spec.ts`, `apps/api/src/whatsapp/whatsapp.controller.spec.ts`, `apps/api/src/whatsapp/whatsapp.service.spec.ts`
- Create: `apps/api/src/whatsapp/tenant-scope.spec.ts`
- Modify: `apps/api/src/main.ts` (the raw-body comment only — **keep the capture**), `apps/api/src/whatsapp/whitelist.service.ts` (a comment naming `handleIncomingMessage`), `CLAUDE.md`, `AGENTS.md`, `apps/api/README.md`, `docs/reference/project-status.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing other tasks depend on. Tasks 1 and 2 are independent; either order works.

- [ ] **Step 1: Confirm what dies with the endpoint**

Run each and read the output before deleting anything:

```bash
grep -rn "HmacAuthGuard" apps/api/src --include="*.ts"
grep -rn "toMessageDate" apps/api/src --include="*.ts"
grep -rn "scopedSessionUpdate" apps/api/src --include="*.ts"
grep -rn "WhatsAppMessage" apps/api/src --include="*.ts"
grep -rn "isNumberAuthorized\|checkSuspiciousPatterns\|logWhitelistDecision" apps/api/src --include="*.ts"
```

The whitelist surface is the surprise: `isNumberAuthorized` has exactly one
caller, inside `handleIncomingMessage`. The admin endpoint at
`whatsapp.controller.ts:159` uses `updateLeadAuthorization`, a different
method, and survives. So the inbound half of `WhitelistService` dies here
too — and with it the reason `WhatsAppService` is injected with it at all.

Expected: every match falls inside the webhook route, the four handlers, their specs, or a comment. If any lands somewhere else, that symbol survives — narrow the deletion rather than following this plan blindly.

- [ ] **Step 2: Delete the endpoint and the guard**

Remove `handleWebhook` from `whatsapp.controller.ts` together with the `HmacAuthGuard` and `WebhookPayload` imports. Delete `hmac-auth.guard.ts` and `hmac-auth.guard.spec.ts`.

In `apps/api/src/main.ts`, the raw-body capture stays — the Clerk Organizations webhook needs it. Only its comment changes, because it names `HmacAuthGuard` as the reason:

```ts
  // Capture rawBody so signature-verifying webhook handlers can recompute a
  // digest over the exact bytes received. The WhatsApp webhook that
  // originally needed this was retired on 2026-08-27; the Clerk
  // Organizations webhook still needs it.
```

- [ ] **Step 3: Delete the handlers and their helpers**

From `whatsapp.service.ts`, delete `handleIncomingMessage`, `handleSessionAuthenticated`, `handleSessionDisconnected`, `handleStatusChange`, `scopedSessionUpdate` and `toMessageDate`. Keep `sendMessage`, `assertSessionTenant`, `getSessionTenantId` and `__resetCachesForTests`.

Delete `whatsapp.controller.spec.ts` and `whatsapp.service.spec.ts` outright. Every test in both covers deleted code; stripping their `describe` blocks would leave two suites with no tests, which Jest reports as a failure.

- [ ] **Step 4: Write tests for what survives**

The deleted specs were the only coverage `assertSessionTenant` and `getSessionTenantId` had. Cross-tenant access control is a security boundary and must not become untested collateral of this cleanup. Create `apps/api/src/whatsapp/tenant-scope.spec.ts`:

```ts
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';

function makeService(sessionTenantId: string | null) {
  const prisma = {
    whatsAppSession: {
      findUnique: jest
        .fn()
        .mockResolvedValue(sessionTenantId === null ? null : { tenantId: sessionTenantId }),
    },
  };
  return new WhatsAppService(prisma as any);
}

beforeEach(() => WhatsAppService.__resetCachesForTests());

describe('assertSessionTenant', () => {
  it('accepts a session the tenant owns', async () => {
    await expect(
      makeService('tenant-1').assertSessionTenant('s1', 'tenant-1')
    ).resolves.toBeUndefined();
  });

  it('refuses a session that belongs to another tenant', async () => {
    await expect(makeService('tenant-2').assertSessionTenant('s1', 'tenant-1')).rejects.toThrow(
      ForbiddenException
    );
  });

  it('refuses a session that does not exist', async () => {
    await expect(makeService(null).assertSessionTenant('s1', 'tenant-1')).rejects.toThrow(
      NotFoundException
    );
  });
});
```

These assert the behaviour the code has today: `NotFoundException` when the
session is missing, `ForbiddenException` when it exists under another
tenant. An earlier draft asserted 404 for the cross-tenant case, reasoning
from a leak-safety note elsewhere in the codebase — which would have
smuggled a behaviour change into a cleanup commit, through a test. If 404
is wanted there, it is its own change with its own argument.

The single-argument constructor above assumes Step 3 removed the
`WhitelistService` injection. Check the real signature before running, and
match it.

- [ ] **Step 5: Correct the documentation that describes the dead channel**

In `CLAUDE.md`, replace the deploy-order note:

> If you ever deploy the two services separately, **`leadcrm-api` goes first**: the proactive consent gate in `whatsapp-service` filters by `sessionId`, and the Nest webhook is what persists that `sessionId` on the inbound message.

with:

```markdown
Deploy order between the two services does not affect message persistence.
It was once claimed that `leadcrm-api` had to go first, because the Nest
webhook persisted `sessionId` on inbound messages and the proactive
consent gate filters by it. That was never true in this deployment:
`WEBHOOK_URL` was unset, so no webhook was ever delivered, and
`DatabaseService.saveConversation` has been writing `sessionId` itself all
along. The Nest inbound channel was retired on 2026-08-27.
```

Then grep the other three and fix every reference to the webhook endpoint, the guard, or Nest-side inbound persistence:

```bash
grep -n "webhook" AGENTS.md apps/api/README.md docs/reference/project-status.md
```

Also update the comment in `apps/api/src/whatsapp/whitelist.service.ts` that names `handleIncomingMessage` as its caller — after this task, its callers are the whitelist admin endpoints only.

- [ ] **Step 6: Run the API suite and record the real number**

Run:
```bash
cd apps/api && pnpm run test
```
Expected: PASS at **39 tests / 6 suites** — 61 minus the 25 deleted, plus the 3 added in Step 4. Record the number you actually observe and use it in the commit message; do not trust this plan's arithmetic, which was wrong twice before it was right. A failure here is a deletion that went too far, not a count to be massaged.

- [ ] **Step 7: Prove the surface is gone**

```bash
grep -rn "handleIncomingMessage\|handleSessionAuthenticated\|handleSessionDisconnected\|handleStatusChange\|HmacAuthGuard\|toMessageDate" apps/api/src apps/dashboard --include="*.ts" --include="*.tsx"
```

Expected: no output. If `whitelist.service.ts` still matches, its comment was missed in Step 5.

- [ ] **Step 8: Typecheck**

Run: `pnpm typecheck` from the repo root. Expected: 4 successful tasks.

- [ ] **Step 9: Commit**

```bash
git add apps/api CLAUDE.md AGENTS.md docs/reference/project-status.md
git commit -m "$(cat <<'EOF'
refactor(api)!: retire the inbound webhook channel that never ran

`WEBHOOK_URL` is unset on the VPS, so `WhatsAppEventPublisher` has been
skipping HTTP delivery since before the Baileys cutover and the Nest API
has never received a webhook. Its four handlers -- inbound message,
authenticated, disconnected, status_change -- have been dead in
production for months.

Wiring the channel up would have been worse than leaving it: a second
`messages` row per inbound, a whitelist evaluated after the AI had
already replied, and `authenticated` overwriting the `ready` status
Baileys writes on connect.

`HmacAuthGuard` and `toMessageDate` guarded and served only this route,
so they go too. The raw-body capture in main.ts stays: the Clerk
Organizations webhook needs it.

apps/api drops from 61 tests to <N>, and from 9 suites to 6. That count
was deliberately unmoved through the whole migration as evidence the
frozen webhook contract survived; this is the feature those tests covered
being removed, not a regression. Three tests were added for
`assertSessionTenant`, which the deleted specs were the only coverage of
-- cross-tenant access control must not become collateral of a cleanup.
EOF
)"
```

---

### Task 2: Delete the publisher's HTTP delivery

**Files:**
- Modify: `apps/whatsapp-service/src/services/WhatsAppEventPublisher.ts` (constructor param, the HTTP half of `sendWebhook`, `setWebhookUrl`, `getWebhookUrl`, `testWebhook`, `sendForceDisconnectWebhook`)
- Modify: `apps/whatsapp-service/src/services/WhatsAppServiceSimple.ts` (`:53` construction, `:342` the `sendForceDisconnectWebhook` call, `:473` status report, its own `testWebhook()` wrapper, and the `process.env.WEBHOOK_URL` in `persistSession`)
- Modify: `apps/whatsapp-service/src/types/index.ts` (drop `'force_disconnected'` from the event union)
- Modify: `apps/whatsapp-service/src/services/WhatsAppServiceSimple.cutover.spec.ts` (remove stubs of the deleted methods)
- Modify: `apps/whatsapp-service/src/services/baileys/BaileysSessionManager.ts` (its `process.env.WEBHOOK_URL` use)
- Modify: `apps/whatsapp-service/src/config/env.ts` (drop `WEBHOOK_URL` from the zod schema)
- Modify: `.env.example`, `.env.production.example`, `turbo.json`, `docs/reference/environment-vars.md` (`:132`, `:141`, `:437` — `WEBHOOK_URL` and `WHATSAPP_WEBHOOK_SECRET`), `apps/whatsapp-service/ecosystem.config.js:44` (a commented-out `WHATSAPP_WEBHOOK_SECRET`)
- Modify: `apps/whatsapp-service/src/services/WhatsAppEventPublisher.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `sendWebhook(payload)` keeps its exact signature; every caller is untouched. The constructor loses its parameter: `new WhatsAppEventPublisher()`.

- [ ] **Step 1: Find every site first**

```bash
grep -rn "WEBHOOK_URL\|WHATSAPP_WEBHOOK_SECRET" apps packages turbo.json \
  .env.example .env.production.example docs/reference/environment-vars.md \
  apps/whatsapp-service/ecosystem.config.js
grep -rn "setWebhookUrl\|getWebhookUrl\|testWebhook\|sendForceDisconnectWebhook\|force_disconnected" apps --include="*.ts"
```

Expected: `WEBHOOK_URL` in `WhatsAppEventPublisher.ts`, `WhatsAppServiceSimple.ts` (twice: the constructor and `persistSession`), `BaileysSessionManager.ts`, `config/env.ts`, both `.example` files and `turbo.json`. The second grep additionally finds `WhatsAppServiceSimple.testWebhook()` — a wrapper around the publisher's, easy to miss because the name matches the method being deleted rather than the caller — and `sendForceDisconnectWebhook`, which emits `force_disconnected`, an event `SocketService`'s switch does not handle. Once HTTP is gone it reaches nothing, so it goes with the type union member.

Write the list down; Step 6 checks it is empty.

- [ ] **Step 2: Delete the existing HTTP tests**

`WhatsAppEventPublisher.spec.ts` contains tests that construct the publisher with a URL and assert on `fetch`. They cannot survive a constructor that takes no URL — they will fail to compile, not fail as tests. Delete them now, before touching the source, so Step 4's failure is legible.

- [ ] **Step 3: Write the failing test**

Add to `WhatsAppEventPublisher.spec.ts`:

```ts
it('emits over Socket.IO and never over HTTP', async () => {
  // The HTTP half delivered to exactly one endpoint, in the Nest API,
  // which is retired. Leaving a `fetch` here means a future WEBHOOK_URL
  // resumes POSTing events at whatever answers that address.
  const fetchSpy = jest.spyOn(global, 'fetch');

  await new WhatsAppEventPublisher().sendWebhook({
    event: 'message',
    sessionId: 's1',
    data: { body: 'hola' },
    timestamp: new Date().toISOString(),
  });

  expect(fetchSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Make it fail for the right reason**

Run:
```bash
cd apps/whatsapp-service && pnpm exec jest --runInBand --testPathPattern "WhatsAppEventPublisher"
```

This test **passes before the change** — with no URL configured, the current code returns before `fetch`. That is exactly the shape of unfalsifiable test this plan has been bitten by twice. To prove it discriminates: temporarily pass a URL (`new WhatsAppEventPublisher('http://example.test/hook')`), confirm it now FAILS because `fetch` is called, then remove the argument. Only proceed once you have seen it fail.

- [ ] **Step 5: Strip the HTTP delivery**

In `WhatsAppEventPublisher.ts`, keep the Socket.IO emission and everything above it; delete from the `// Send traditional webhook if configured` comment through the end of the HTTP block, so `sendWebhook` ends after the Socket.IO try/catch. Change the constructor to `constructor() {}`. Delete `setWebhookUrl`, `getWebhookUrl` and `testWebhook`.

Then fix the call sites:
- `WhatsAppServiceSimple.ts:53` → `private publisher = new WhatsAppEventPublisher();`
- `WhatsAppServiceSimple.ts:473` → delete the `webhookUrl: this.publisher.getWebhookUrl(),` line; it described a delivery target that no longer exists.
- `WhatsAppServiceSimple.persistSession` and `BaileysSessionManager` → both pass `process.env.WEBHOOK_URL` as the session's `webhookUrl`. Pass `undefined` instead and leave the column alone (see the note below).
- `WhatsAppServiceSimple.testWebhook()` → delete; it only forwarded to the publisher method being removed.
- `WhatsAppServiceSimple.ts:342` and `WhatsAppEventPublisher.sendForceDisconnectWebhook` → delete both, and `'force_disconnected'` from the event union in `types/index.ts`. `SocketService` never handled that event, so with HTTP gone it has no receiver at all.
- `config/env.ts` → delete the `WEBHOOK_URL` line from the zod schema.
- `.env.example`, `.env.production.example`, `turbo.json` → delete the `WEBHOOK_URL` entries.
- `.env.example`, `.env.production.example`, `docs/reference/environment-vars.md` (`:132`, `:437`), `apps/whatsapp-service/ecosystem.config.js:44` → delete every `WHATSAPP_WEBHOOK_SECRET`. No code reads it — confirm with `grep -rn "WHATSAPP_WEBHOOK_SECRET" apps packages --include="*.ts"`, which returns nothing. The secret this system signs with is `WHATSAPP_SERVICE_HMAC_SECRET`. A documented env var that nothing reads is a trap for whoever tries to configure it.

- [ ] **Step 6: Run the tests and re-run the grep**

```bash
(cd apps/whatsapp-service && pnpm exec jest --runInBand --testPathPattern "WhatsAppEventPublisher")
grep -rn "WEBHOOK_URL\|WHATSAPP_WEBHOOK_SECRET\|setWebhookUrl\|getWebhookUrl\|testWebhook\|sendForceDisconnectWebhook\|force_disconnected" \
  apps packages turbo.json .env.example .env.production.example \
  docs/reference/environment-vars.md apps/whatsapp-service/ecosystem.config.js
```

A match on `WHATSAPP_WEBHOOK_SECRET` here means Step 5 missed one.

The subshell matters: without it the `cd` persists and the grep's
repo-root paths do not resolve.

Expected: tests PASS, and the grep returns **exactly one line**:
`middleware/validation.ts:87: code: 'INVALID_WEBHOOK_URL'`. That string
contains `WEBHOOK_URL` as a substring but belongs to the per-session
`webhookUrl` validation this task deliberately keeps — demanding zero
output here would be a gate nobody could pass. Anything else is a site
Step 5 missed, and a match inside a `.spec.ts` means a test still stubs a
symbol that no longer exists.

Note: `whatsapp_sessions.webhook_url` and the `webhookUrl` field accepted by `POST /sessions` (`middleware/validation.ts:80`) stay. With no `fetch` anywhere they are inert rather than dangerous, and removing a request field is an API contract change that deserves its own reasoning.

- [ ] **Step 7: Full suite and typecheck**

Run `pnpm test` and `pnpm typecheck` from the repo root. Expected: all green, `apps/api` at whatever Task 1 recorded.

- [ ] **Step 8: Commit**

```bash
git add apps/whatsapp-service .env.example .env.production.example turbo.json docs/reference/environment-vars.md
git commit -m "$(cat <<'EOF'
refactor(whatsapp-service)!: drop HTTP webhook delivery, keep Socket.IO

The only endpoint this ever delivered to was the Nest inbound channel,
retired in the previous commit. Left in place it is a loaded gun: setting
WEBHOOK_URL on some future deploy would resume POSTing events at whatever
answers that address.

`sendWebhook` keeps its name and signature -- every caller is unchanged --
and keeps emitting over Socket.IO, which is what the dashboard consumes.
`setWebhookUrl`, `getWebhookUrl` and `testWebhook` had zero callers
between them and go with it, along with WEBHOOK_URL in the env schema,
both .env examples and turbo.json.

`whatsapp_sessions.webhook_url` and the per-session `webhookUrl` on
POST /sessions stay: inert now that no fetch exists anywhere, and
removing a request field is a contract change of its own.
EOF
)"
```

---

### Task 3: Record what the dead writer was going to record

**Files:**
- Modify: `apps/whatsapp-service/src/services/DatabaseService.ts` (`ConversationData` at `:27`, the transaction at `:582`)
- Modify: `apps/whatsapp-service/src/services/whatsapp-core/MessageHandler.ts` (`persistMessagePair` passes the new fields)
- Create: `apps/whatsapp-service/src/services/message-persistence.spec.ts`, `apps/whatsapp-service/src/services/whatsapp-core/fallback-persistence.spec.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1-2.
- Produces: `ConversationData` gains three optional fields, read only inside `DatabaseService`:
  ```ts
  providerMessageId?: string;  // the id the transport gave this message
  occurredAt?: Date;           // when WhatsApp says it happened
  status?: 'READ' | 'SENT';    // READ for a processed inbound, SENT for a dispatched reply
  ```

**On `SENT`:** it means accepted by the transport, after `sock.sendMessage()` resolves — not delivered to the handset. That is the honest reading, and better than leaving every row `PENDING` forever, which is what happens today. Real `DELIVERED`/`READ` needs Baileys' `messages.update` and `message-receipt.update`, plus persisting the id `ReplyPort` currently discards so acks can be correlated. That is a separate piece of work, not a field.

**On the id:** `dto.id` is `${sessionId}:${providerId}`, not WhatsApp's own identifier. Store the provider suffix and name the field for what it holds.

- [ ] **Step 1: Write both failing tests**

Two spec files, both written now: Step 5 runs them together, so creating
the second one later would mean Step 5 silently ran one file and reported
a green it had not earned.

First, `apps/whatsapp-service/src/services/message-persistence.spec.ts`:

```ts
import DatabaseService from './DatabaseService';

const create = jest.fn().mockResolvedValue({ id: 'msg-1' });
const conversationCreate = jest.fn().mockResolvedValue({ id: 'conv-1' });
const leadUpdate = jest.fn().mockResolvedValue({ count: 1 });

const BASE = { sessionId: 's1', phoneNumber: '34600111222' };

beforeEach(() => {
  jest.clearAllMocks();
  (DatabaseService as any).prisma = {
    lead: { findFirst: jest.fn().mockResolvedValue({ id: 'lead-1', status: 'NUEVO' }) },
    $transaction: async (fn: any) =>
      fn({
        message: { create },
        whatsAppConversation: { create: conversationCreate },
        lead: { updateMany: leadUpdate },
      }),
  };
  jest.spyOn(DatabaseService as any, 'getSessionTenantId').mockResolvedValue('tenant-1');
});

describe('saveConversation records what the CRM needs', () => {
  it('marks an inbound READ rather than leaving it PENDING', async () => {
    // Every row this writer produces is PENDING, because the writer that set
    // READ was the Nest handler that never ran. (Nest's manual outbound path
    // does write SENT, so this is about saveConversation's rows, not every
    // row in the table.) A status column that holds one value for every
    // message the bot handles is not a status column.
    await DatabaseService.saveConversation({
      ...BASE, messageText: 'hola', isFromUser: true, status: 'READ',
    });

    expect(create.mock.calls[0][0].data.status).toBe('READ');
  });

  it('marks a dispatched reply SENT', async () => {
    await DatabaseService.saveConversation({
      ...BASE, responseText: 'hola!', isFromUser: false, status: 'SENT',
    });

    expect(create.mock.calls[0][0].data.status).toBe('SENT');
  });

  it("keeps the transport's message id", async () => {
    await DatabaseService.saveConversation({
      ...BASE, messageText: 'hola', isFromUser: true, providerMessageId: '3EB0ABC',
    });

    expect(create.mock.calls[0][0].data.whatsappMessageId).toBe('3EB0ABC');
  });

  it('uses the time WhatsApp reports, not the time we wrote the row', async () => {
    const occurredAt = new Date('2026-08-27T10:00:00.000Z');

    await DatabaseService.saveConversation({
      ...BASE, messageText: 'hola', isFromUser: true, occurredAt,
    });

    expect(create.mock.calls[0][0].data.createdAt).toEqual(occurredAt);
  });

  it('lets the column default when no usable timestamp was given', async () => {
    // Omitted, never nulled and never an Invalid Date: that is how T3 put
    // production rows in 1970 once already.
    await DatabaseService.saveConversation({ ...BASE, messageText: 'hola', isFromUser: true });

    expect(create.mock.calls[0][0].data.createdAt).toBeUndefined();
  });

  it('records the contact time on an inbound', async () => {
    await DatabaseService.saveConversation({ ...BASE, messageText: 'hola', isFromUser: true });

    expect(leadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'lead-1', tenantId: 'tenant-1', deletedAt: null }),
        data: expect.objectContaining({ lastContact: expect.any(Date) }),
      })
    );
  });

  it('promotes to CONTACTADO through the WHERE, not through a value read earlier', async () => {
    // The lead was fetched before the transaction opened. Deciding from the
    // status we read then lets an inbound drag a lead that became GANADO in
    // the meantime back to CONTACTADO. The condition has to reach the
    // database.
    await DatabaseService.saveConversation({ ...BASE, messageText: 'hola', isFromUser: true });

    const promotion = leadUpdate.mock.calls.find(c => c[0].data?.status === 'CONTACTADO');
    expect(promotion).toBeDefined();
    expect(promotion![0].where).toMatchObject({ status: 'NUEVO' });
  });

  it('leaves the lead alone on an outbound', async () => {
    // A reply we sent is not the contact writing in.
    await DatabaseService.saveConversation({
      ...BASE, responseText: 'hola!', isFromUser: false, status: 'SENT',
    });

    expect(leadUpdate).not.toHaveBeenCalled();
  });
});
```

Then `apps/whatsapp-service/src/services/whatsapp-core/fallback-persistence.spec.ts`.
Its content is specified in Step 6, beside the bug it pins — but write it
**now**, because Step 5 runs both files and a spec that does not exist yet
turns Step 5's green into a green it has not earned.

- [ ] **Step 2: Run them and confirm they fail**

```bash
(cd apps/whatsapp-service && pnpm exec jest --runInBand --testPathPattern "message-persistence|fallback-persistence")
```
Expected: FAIL at compile time — `status`, `providerMessageId` and `occurredAt` are not on `ConversationData`.

- [ ] **Step 3: Extend `ConversationData`**

In `DatabaseService.ts`, add to the interface at `:27`:

```ts
  /** The id the transport assigned this message. Not a WhatsApp-global id. */
  providerMessageId?: string;
  /** When WhatsApp says the message happened, not when we wrote the row. */
  occurredAt?: Date;
  /** READ for an inbound we processed, SENT for a reply we dispatched. */
  status?: 'READ' | 'SENT';
```

- [ ] **Step 4: Write them, and update the lead**

In the `tx.message.create` call, add to `data`:

```ts
            whatsappMessageId: data.providerMessageId,
            status: data.status ? MessageStatus[data.status] : undefined,
            // Omitted rather than nulled when absent: Prisma applies the
            // column default, and an Invalid Date here is how T3 put rows
            // in 1970.
            createdAt: data.occurredAt,
```

Add `MessageStatus` to the existing `@leadcrm/db` import beside `MessageDirection`.

Then, inside the same transaction and only when `isFromUser` and a lead was found, record the contact:

```ts
        if (isFromUser && lead) {
          // Always true for an inbound.
          await tx.lead.updateMany({
            where: { id: lead.id, tenantId, deletedAt: null },
            data: { lastContact: new Date() },
          });

          // Only the first rung, and the condition lives in the WHERE rather
          // than in a value read earlier: `lead` was fetched before this
          // transaction opened, so deciding from `lead.status` would let an
          // inbound drag a lead that became GANADO in between back to
          // CONTACTADO. Postgres evaluates this against the row as it is now.
          await tx.lead.updateMany({
            where: { id: lead.id, tenantId, deletedAt: null, status: LeadStatus.NUEVO },
            data: { status: LeadStatus.CONTACTADO },
          });
        }
```

`lead.findFirst` keeps selecting only `{ id: true }` — the status decision is the database's, not ours. Add `LeadStatus` to the `@leadcrm/db` import.

- [ ] **Step 5: Run the writer's tests only**

```bash
(cd apps/whatsapp-service && pnpm exec jest --runInBand --testPathPattern "message-persistence")
```
Expected: PASS, 8 tests. **Not** the fallback spec: it pins a bug in
`MessageHandler`, which Step 6 has not fixed yet, so it is still red and
correctly so. Running both here would demand a green that cannot exist.

- [ ] **Step 6: Pass the fields from the handler**

In `MessageHandler.ts`, add `providerMessageId?: string` and `occurredAt?: Date` to `persistMessagePair`'s params, destructure them, and pass on the two `saveConversation` calls: the user one gets both plus `status: 'READ'`; the bot one gets `status: 'SENT'` only — the reply is ours, and the inbound's id and time do not describe it.

**Three call sites, not one.** `MessageHandler` writes an inbound in three
places, and the other two were missed by the first draft:

| Site | What it writes | What it needs |
|---|---|---|
| `persistMessagePair` | the normal pair | both new fields, `READ` / `SENT` |
| `:177` — the "no response" path | the inbound, when the AI decided not to reply | both new fields, `READ` |
| `:204` — the fallback reply | the fallback the customer received | **see below** |

The fallback site carries a bug this task must fix, not inherit. It passes
the reply text as `messageText` with `isFromUser: false` — and
`saveConversation` reads `responseText` when `isFromUser` is false, so
`canonicalContent` is `null` and the row is dropped with a warning. Every
intelligent-fallback reply ever sent has gone unrecorded: the customer got
an answer, the CRM has no trace of it. The comment above `persistMessagePair`
describes this exact bug being found and fixed on 2026-04-19 — in one place,
twelve lines from the other. Change it to `responseText: intelligentFallback`,
`messageText: undefined`, `status: 'SENT'`.

This needs a test that reaches `MessageHandler`, not one that calls
`saveConversation` directly. A direct call passes the correct shape by
construction and would go green with `:204` still broken — the third time
in this work that a test was written which could not fail. `MessageHandler`
has no constructor and resolves its dependencies through dynamic
`await import(...)`, so `jest.mock` on the module paths intercepts them.

Put it in its own file, `apps/whatsapp-service/src/services/whatsapp-core/fallback-persistence.spec.ts`:

```ts
const saveConversation = jest.fn().mockResolvedValue('row-1');

jest.mock('../DatabaseService', () => ({
  __esModule: true,
  default: {
    saveConversation,
    getSessionContext: jest.fn().mockResolvedValue({ tenantId: 't1', aiAgentId: null }),
    getConversationHistory: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../AIThinkingService', () => ({
  __esModule: true,
  default: {
    // The branch under test: the AI errored, so the handler sends an
    // intelligent fallback and records it.
    processWithThinking: jest.fn().mockResolvedValue({
      content: '',
      provider: 'test',
      tokensUsed: 0,
      error: 'LLM unavailable',
      thinkingProcess: {
        shouldRespond: true,
        finalDecision: 'RESPOND',
        processingTimeMs: 1,
        confidence: 0,
        // The no-response branch reads steps[0]?.data for intent and
        // sentiment; without the array it throws before reaching the
        // fallback this test is about.
        steps: [],
      },
    }),
  },
}));

it('records the fallback reply it just sent', async () => {
  // The reply text used to be passed as `messageText` with
  // `isFromUser: false`. saveConversation reads `responseText` in that case,
  // so canonicalContent was null and the row was dropped with a warning --
  // every fallback ever sent went unrecorded.
  await runFallbackPath();

  const outbound = saveConversation.mock.calls
    .map(c => c[0])
    .find(d => d.isFromUser === false);

  expect(outbound).toBeDefined();
  expect(outbound.responseText).toBeTruthy();
  expect(outbound.messageText).toBeUndefined();
  expect(outbound.status).toBe('SENT');
});
```

`runFallbackPath` constructs a `MessageHandler`, calls
`processMessageWithAI` with a minimal DTO and a stub `ReplyPort`, and
awaits it. `processWithThinking` is the real method name
(`MessageHandler.ts:71`); read `ReplyPort`'s shape before stubbing it.

Derive the two fields once, and pass them **only to the two inbound
writes**. The fallback at `:204` is an outbound: the customer's message id
and arrival time do not describe the reply we sent, and attaching them
would make the row claim to be something it is not. It gets
`status: 'SENT'` and nothing else new.

The timestamp is in seconds:

```ts
const occurredAt = (() => {
  const seconds = Number(dto.timestamp);
  // `> 0`, not just "not NaN": `new Date(0 * 1000)` is a perfectly valid
  // Date — 1 Jan 1970 — and Number.isNaN waves it straight through. That is
  // T3 exactly, and T3 only stopped being harmless when the proactive
  // consent window started reasoning about recency.
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return new Date(seconds * 1000);
})();
// dto.id is `${sessionId}:${providerId}` — keep the provider half.
const providerMessageId = dto.id.includes(':') ? dto.id.split(':').slice(1).join(':') : dto.id;
```

- [ ] **Step 7: Now run both specs**

```bash
(cd apps/whatsapp-service && pnpm exec jest --runInBand --testPathPattern "message-persistence|fallback-persistence")
```
Expected: PASS, 9 tests across **2** suites. The pattern has to name both
files; with only `message-persistence` the fallback spec is silently not
run, and a spec that never runs is worth less than no spec.

Then prove the fallback test discriminates: revert `:204` to
`messageText` / `isFromUser: false`, confirm it fails, restore.

- [ ] **Step 8: Full suite and typecheck**

Run `pnpm test` and `pnpm typecheck` from the repo root. Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add apps/whatsapp-service
git commit -m "$(cat <<'EOF'
feat(whatsapp-service): record status, provider id, time and lead contact

Every row `saveConversation` writes is PENDING, because the writer that
set READ was the Nest webhook handler that never ran. That is every
message the bot handles. Same for the transport's message id, the
inbound's real timestamp, and the lead's `lastContact` and
NUEVO -> CONTACTADO transition -- all of them things the dead handler was
going to do.

Now that whatsapp-service is the sole writer they belong here, and the
lead update rides in the same transaction as the message.

`SENT` means accepted by the transport, not delivered to the handset:
honest, and better than PENDING forever. Real DELIVERED/READ needs
Baileys' receipt events and the message id ReplyPort currently discards,
which is its own piece of work.

`createdAt` is omitted rather than nulled when WhatsApp gave no usable
timestamp -- an Invalid Date is how T3 put rows in 1970 once already.
A lead past NUEVO keeps its status; only `lastContact` moves.
EOF
)"
```

---

## Withdrawn: persisting the inbound before the AI runs

The first draft of this plan had a fourth task: write the inbound row before calling the AI, so a thrown LLM call could not lose the customer's message. A codex review rejected it, and the rejection is correct. It is recorded here so the idea is not rediscovered as if it were simple.

| Blocker | Why it stops the task as designed |
|---|---|
| `ContextEnricher.ts:91` reads history from the database | The just-saved inbound comes back as history, so the model receives the current message twice |
| `intent`, `sentiment`, `aiProvider`, `tokensUsed` | All produced *by* the AI call; an inbound written first has none of them, so either the row is poorer or it needs a second write to enrich |
| `saveConversation` returns `null` on failure | It swallows its own errors, so the proposed `try/catch` would not detect the normal failure mode |
| Inbound writes already exist in the "no response" and fallback branches | Adding an earlier one without removing those produces duplicates |
| `MessageHandler` has no injectable constructor, and `processMessageWithAI` catches its own errors | The test as drafted could never fail: nothing to inject, and the promise never rejects |

Whoever picks this up decides two things first: how the current message is excluded from its own context, and whether the AI-derived metadata is abandoned or written by a follow-up update. Then the harness question. It is a redesign, not a reorder.

---

## Rejected: backfilling the 27 orphaned rows

| | |
|---|---|
| Rows with `leadId: null` | 27, across **4** phone numbers |
| `14155238886` | 20 rows, Sept 2025 — **Twilio's WhatsApp sandbox** |
| `34670970060` / `34644773622` / `9999920225` | 4 / 2 / 1 rows; the last is not a real number |
| Resolvable to an existing lead | **2 of 27** |
| No candidate lead at all | 25 |
| Ambiguous | 0 |

Repairing the 25 means creating leads for a Twilio sandbox and a placeholder number — inventing CRM entities that never existed so a historical count looks better. The 2 that could be linked carry no operational value either.

**Do this instead**, a week after Task 3 deploys, to confirm the fix in `1d77a3d` holds:

```sql
SELECT count(*) AS nuevos_nulos
FROM messages
WHERE lead_id IS NULL
  AND created_at >= TIMESTAMPTZ '<exact UTC instant of the deploy>';
```

Use the real deploy timestamp, not a date literal: `'2026-08-27'` would sweep in everything from local midnight and depends on the session time zone. A non-zero result means lead creation still fails on some path — that is worth chasing. The historical 27 are not.

---

## Self-review

**Coverage.** Every finding maps to a task: the dead Nest channel, `HmacAuthGuard`, `toMessageDate` and `authenticated`-overwrites-`ready` → Task 1; the loaded-gun publisher and its five `WEBHOOK_URL` sites → Task 2; the fields the dead writer would have set → Task 3; the AI-failure data loss → withdrawn, with its blockers recorded; the 27 orphans → rejected, with a verification query.

**Placeholders.** One deliberate: Task 1 Step 9's commit message carries `<N>` for the test count, because Step 6 instructs the implementer to record the number they actually observe rather than trust this plan's arithmetic. The first draft asserted "56" and was wrong twice over.

**Type consistency.** `providerMessageId`, `occurredAt` and `status` are defined in Task 3 Step 3 and used with those names in Steps 4 and 6. `MessageStatus` and `LeadStatus` are Prisma enums imported alongside the existing `MessageDirection`.

**Two traps this plan sets on purpose.** Task 2 Step 4 tells the implementer that the new test passes before the change and must be made to fail first — that shape of unfalsifiable test has bitten this work twice. Task 1 Step 4 says the constructor signature in its test is a guess to be corrected against the real one, rather than something to preserve.
