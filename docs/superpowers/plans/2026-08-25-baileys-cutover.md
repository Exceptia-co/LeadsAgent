# Baileys Migration — Phase 2: Engine Cutover

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `whatsapp-web.js` with `@whiskeysockets/baileys` as the runtime engine of `apps/whatsapp-service`, and delete Puppeteer along with everything that existed only to serve Chromium.

**Architecture:** Six tasks. Tasks 5 and 6 are engine-neutral refactors that reach `main` while `whatsapp-web.js` still serves production. Task 7 lands Baileys compiled but unreachable at runtime. Tasks 8a and 8b are two commits of one branch with **no deploy between them** — the runtime cutover, then the purge. Task 9 deploys and smokes.

**Tech Stack:** TypeScript, Node 20, Express, Prisma 6.15 (`@leadcrm/db`), PostgreSQL 17.6 (Supabase), Redis, Jest + ts-jest, pnpm 9 / Turborepo, `@whiskeysockets/baileys@6.7.24`.

**Spec:** `docs/superpowers/specs/2026-08-25-baileys-cutover-design.md` — read it before Task 5. It carries the verified ground truth this plan argues from, and the reasoning behind every boundary drawn here.

**Predecessor:** `docs/superpowers/plans/2026-08-25-baileys-migration-foundation.md` (Phase 1, merged as PR #14). Task numbering continues from it: Phase 1 was Tasks 1-4.

---

## Global Constraints

- **Pin `@whiskeysockets/baileys@6.7.24` exactly — no caret.** `latest` is `7.0.0-rc14`; `6.7.24` carries the `legacy` dist-tag. A bare `pnpm add @whiskeysockets/baileys` installs a release candidate.
- **Never run `prisma migrate deploy`.** Production's `_prisma_migrations` shares no name with `packages/db/prisma/migrations`. This phase needs no new migration — `whatsapp_auth_keys` already exists in production and matches `schema.prisma`.
- **The `message` webhook payload's `data` field is a frozen wire contract:** `{ id, from, to, body, timestamp, type, isGroup, fromMe }`. `apps/api/src/whatsapp/whatsapp.controller.ts:32` types it as `any` and `whatsapp.service.ts:134,137` reads `data.from` and `data.body`, so no typecheck on either side can see a drift, and the two apps deploy separately. `IncomingMessagePipeline` already maps the DTO back to this shape. **Do not touch that mapping.**
- **Do not change REST route shapes** (`apps/whatsapp-service/src/routes/index.ts`) **or Socket.IO payloads** (`SocketService.ts`). The dashboard is deployed separately on Vercel.
- **Two `authenticated` webhooks per session lifecycle is frozen behaviour.** `EventDispatcher.ts:142` (inside `ready`) and `:178` (inside `authenticated`) both emit one; `SocketService.ts:265` turns each into `session:connected`. Reproduce exactly two — not one, not three.
- **Response shape for all Express JSON:** `{ success: boolean, data?: T, error?: string }`.
- **Tests:** Jest, `*.spec.ts` colocated with the source. Run from `apps/whatsapp-service`. `jest.config.js` uses `preset: 'ts-jest'`, `roots: ['<rootDir>/src']`, `moduleNameMapper` `^@/(.*)$ → <rootDir>/src/$1`.
- **Baseline before this plan: 104 passing in `apps/whatsapp-service` across 14 suites, 61 in `apps/api`.** Every task leaves both green.
- **Commit style:** Conventional Commits. Commit at the end of every task, never mid-task.
- **Builds on the VPS use filters:** `--filter=@leadcrm/api --filter=@leadcrm/whatsapp-service`. An unfiltered `pnpm build` fails on the dashboard, which needs a Clerk key that only exists in Vercel.
- **`strictNullChecks` is off in this project.** Nothing mechanical catches a `null` reaching a `string`. Coerce explicitly where the spec says to.

### Permission to stop

**If a step does not match the code you find, stop and ask. Do not approximate.**

This is not politeness — in Phase 1 it surfaced six defects that were in the plan rather than in the code. A step that says "modify line 247" and finds something else there is reporting a fact about the plan, not an obstacle to route around. Say what you found and wait.

---

## File Structure

**Task 5 — reply port**

| File | Responsibility |
|---|---|
| `src/types/reply-port.ts` (create) | The `ReplyPort` interface. Engine-neutral; survives the cutover. |
| `src/services/whatsapp-core/wwebjs-reply-port.ts` (create) | `makeWwebjsReplyPort`. The only file that knows how a wwebjs `Message` answers. **Deleted in Task 8b.** |
| `src/services/whatsapp-core/wwebjs-reply-port.spec.ts` (create) | Pins each verb to its wwebjs call. **Deleted in Task 8b.** |
| `src/services/whatsapp-core/MessageHandler.ts` (modify) | `processMessageWithAI(dto, port)`; every `transport.*` call site rewritten. |
| `src/services/whatsapp-core/IncomingMessagePipeline.ts` (modify) | Generic `TTransport` removed. |
| `src/services/whatsapp-core/IncomingMessagePipeline.spec.ts` (modify) | Fake transport becomes a fake port. |
| `src/services/whatsapp-core/EventDispatcher.ts` (modify) | Constructs the port at the boundary. |

**Task 6 — engine-neutral tidy**

| File | Responsibility |
|---|---|
| `src/types/index.ts` (modify) | Delete two dead interfaces. |
| `src/interfaces/IWhatsAppSessionManager.ts` (modify) | Drop the dead `getClient`. |
| `src/services/WhatsAppEventPublisher.ts` (create) | Webhook + Socket.IO emission, extracted so Task 8b can delete `EventDispatcher` without taking it along. |
| `src/services/WhatsAppEventPublisher.spec.ts` (create) | Pins HMAC signing and the Socket.IO-before-HTTP ordering. |
| `src/services/whatsapp-core/EventDispatcher.ts` (modify) | Delegates to the publisher. No duplicated logic. |

**Task 7 — Baileys, isolated**

| File | Responsibility |
|---|---|
| `src/services/baileys/baileys-normalizer.ts` (create) | The only place a `WAMessage` becomes a DTO. |
| `src/services/baileys/baileys-normalizer.spec.ts` (create) | LID, group, ephemeral, media, empty. |
| `src/services/session-credentials/SessionCredentialsStore.ts` (modify) | Transactional multi-category batch + `hasCredentials`. |
| `src/services/session-credentials/SessionCredentialsStore.spec.ts` (modify) | Pins the transaction and the batch. |
| `src/services/baileys/BaileysAuthState.ts` (create) | `AuthenticationState` over the store. The only file that knows `app-state-sync-key` is a protobuf. |
| `src/services/baileys/BaileysAuthState.spec.ts` (create) | Pins the protobuf revival and the merge semantics of `saveCreds`. |
| `src/services/baileys/baileys-reply-port.ts` (create) | `makeBaileysReplyPort`. |
| `src/services/baileys/baileys-reply-port.spec.ts` (create) | Pins quoting and presence. |
| `src/services/baileys/BaileysSessionManager.ts` (create) | The single runtime import of the library. |
| `src/services/baileys/BaileysSessionManager.spec.ts` (create) | Drives a fake socket through the lifecycle. |

**Task 8a — runtime cutover** and **Task 8b — purge**: file lists are in the tasks themselves.

---

## Task 5: The reply port

The `transport` handle threaded through `MessageHandler` is the last library object on the inbound path. It carries no data — everything read in `processMessageWithAI` comes from the DTO — and survives only because the reply strategies need a handle on the chat.

**Files:**
- Create: `apps/whatsapp-service/src/types/reply-port.ts`
- Create: `apps/whatsapp-service/src/services/whatsapp-core/wwebjs-reply-port.ts`
- Test: `apps/whatsapp-service/src/services/whatsapp-core/wwebjs-reply-port.spec.ts`
- Modify: `apps/whatsapp-service/src/services/whatsapp-core/MessageHandler.ts:1,117,136,216,295,316,339,344,388,397-435`
- Modify: `apps/whatsapp-service/src/services/whatsapp-core/IncomingMessagePipeline.ts:12,22,36,42,76`
- Modify: `apps/whatsapp-service/src/services/whatsapp-core/IncomingMessagePipeline.spec.ts:41,44,65,74,87,107,117,118,133,141,151,157,160`
- Modify: `apps/whatsapp-service/src/services/whatsapp-core/EventDispatcher.ts:42,74,320`

**Interfaces:**
- Consumes: `NormalizedWhatsAppMessage` from `src/types/messages.ts` (Phase 1, Task 3).
- Produces:
  - `ReplyPort` — `{ reply(text: string): Promise<void>; send(text: string): Promise<void>; startTyping(): Promise<void>; stopTyping(): Promise<void> }`.
  - `makeWwebjsReplyPort(message: Message): ReplyPort`.
  - `MessageHandler.processMessageWithAI(dto: NormalizedWhatsAppMessage, port: ReplyPort): Promise<void>` — Task 8a keeps this signature; only the port implementation changes.
  - `IncomingMessagePipeline.handle(dto: NormalizedWhatsAppMessage, port: ReplyPort): Promise<void>` — no longer generic.

**Scope note.** `MessageHandler` keeps `import type { Client }` after this task. `sendMessage(client, sessionId, to, message, onStatusUpdate)` at `MessageHandler.ts:21` is the **outbound** path, called only from `WhatsAppServiceSimple.ts:247`, and `BaileysSessionManager` takes it over in Task 8a. Do not abstract it here.

- [ ] **Step 1: Write the failing test**

Create `apps/whatsapp-service/src/services/whatsapp-core/wwebjs-reply-port.spec.ts`:

```ts
import { makeWwebjsReplyPort } from './wwebjs-reply-port';

function makeMessage() {
  const chat = {
    sendMessage: jest.fn().mockResolvedValue(undefined),
    sendStateTyping: jest.fn().mockResolvedValue(undefined),
    clearState: jest.fn().mockResolvedValue(undefined),
  };
  const message = {
    reply: jest.fn().mockResolvedValue(undefined),
    getChat: jest.fn().mockResolvedValue(chat),
  };
  return { message, chat };
}

describe('makeWwebjsReplyPort', () => {
  it('reply_quotes_through_the_message_and_never_opens_the_chat', async () => {
    // reply() and send() differ only in whether the answer quotes the inbound
    // message. Asserting "reply was called" alone would still pass if reply
    // were implemented as chat.sendMessage -- which silently drops the quote,
    // the one thing that distinguishes the two verbs.
    const { message, chat } = makeMessage();

    await makeWwebjsReplyPort(message as any).reply('con cita');

    expect(message.reply).toHaveBeenCalledWith('con cita');
    expect(message.getChat).not.toHaveBeenCalled();
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });

  it('send_goes_through_the_chat_and_never_quotes', async () => {
    const { message, chat } = makeMessage();

    await makeWwebjsReplyPort(message as any).send('sin cita');

    expect(chat.sendMessage).toHaveBeenCalledWith('sin cita');
    expect(message.reply).not.toHaveBeenCalled();
  });

  it('typing_verbs_share_a_single_chat_lookup', async () => {
    // getChat() is a round-trip into the Puppeteer page context. The handler
    // starts typing at entry and clears it in a finally, so an unmemoized port
    // would pay for that round-trip twice on every single message. Deleting
    // the memoization is a one-line change and must fail here.
    const { message, chat } = makeMessage();
    const port = makeWwebjsReplyPort(message as any);

    await port.startTyping();
    await port.stopTyping();

    expect(message.getChat).toHaveBeenCalledTimes(1);
    expect(chat.sendStateTyping).toHaveBeenCalledTimes(1);
    expect(chat.clearState).toHaveBeenCalledTimes(1);
  });

  it('a_failed_chat_lookup_is_not_memoized', async () => {
    // Memoizing the *promise* rather than the resolved chat would cache a
    // rejection forever: one transient failure and the session stops being
    // able to answer at all until it restarts. Caching the resolved value
    // leaves the retry path intact.
    const { message, chat } = makeMessage();
    message.getChat
      .mockRejectedValueOnce(new Error('Execution context was destroyed'))
      .mockResolvedValue(chat);
    const port = makeWwebjsReplyPort(message as any);

    await expect(port.startTyping()).rejects.toThrow('Execution context was destroyed');
    await port.startTyping();

    expect(message.getChat).toHaveBeenCalledTimes(2);
    expect(chat.sendStateTyping).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "wwebjs-reply-port"`

Expected: FAIL with `Cannot find module './wwebjs-reply-port'`.

- [ ] **Step 3: Define the port**

Create `apps/whatsapp-service/src/types/reply-port.ts`:

```ts
/**
 * How the AI layer answers, without knowing what is carrying the answer.
 *
 * The inbound DTO (`NormalizedWhatsAppMessage`) deliberately carries no
 * library object, so a quoted reply -- which needs the original message
 * handle -- cannot be reconstructed from it. The port is therefore built at
 * the engine boundary with that handle captured in its closure, and is the
 * only thing on this path that ever holds one.
 */
export interface ReplyPort {
  /** Answer quoting the inbound message. */
  reply(text: string): Promise<void>;
  /** Answer in the same chat without quoting. */
  send(text: string): Promise<void>;
  startTyping(): Promise<void>;
  stopTyping(): Promise<void>;
}
```

- [ ] **Step 4: Write the wwebjs port**

Create `apps/whatsapp-service/src/services/whatsapp-core/wwebjs-reply-port.ts`:

```ts
import type { Message } from 'whatsapp-web.js';
import type { ReplyPort } from '../../types/reply-port';

type Chat = Awaited<ReturnType<Message['getChat']>>;

/**
 * The only place that knows how a whatsapp-web.js Message answers. Task 8b
 * deletes this file; `makeBaileysReplyPort` replaces it behind the same
 * interface.
 */
export function makeWwebjsReplyPort(message: Message): ReplyPort {
  // Memoize the resolved chat, never the promise: a rejected promise would
  // be cached forever, so one transient "Execution context was destroyed"
  // would leave the session permanently unable to answer.
  let chat: Chat | null = null;
  const openChat = async (): Promise<Chat> => {
    if (!chat) chat = await message.getChat();
    return chat;
  };

  return {
    async reply(text: string): Promise<void> {
      await message.reply(text);
    },
    async send(text: string): Promise<void> {
      await (await openChat()).sendMessage(text);
    },
    async startTyping(): Promise<void> {
      await (await openChat()).sendStateTyping();
    },
    async stopTyping(): Promise<void> {
      await (await openChat()).clearState();
    },
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "wwebjs-reply-port"`

Expected: PASS, 4 tests.

- [ ] **Step 6: Drop the generic from the pipeline**

In `apps/whatsapp-service/src/services/whatsapp-core/IncomingMessagePipeline.ts`:

- Add `import type { ReplyPort } from '../../types/reply-port';`
- `IncomingMessagePipelineDeps<TTransport>` becomes `IncomingMessagePipelineDeps` (no generic), and its `messageHandler` member becomes:
  ```ts
  messageHandler: {
    processMessageWithAI(dto: NormalizedWhatsAppMessage, port: ReplyPort): Promise<void>;
  };
  ```
- Delete the file-level comment block that explains the generic (lines 6-11) — it documents a mechanism that no longer exists.
- `export class IncomingMessagePipeline<TTransport>` becomes `export class IncomingMessagePipeline`.
- `async handle(dto: NormalizedWhatsAppMessage, transport: TTransport)` becomes `async handle(dto: NormalizedWhatsAppMessage, port: ReplyPort)`.
- The single forwarding call becomes `await this.deps.messageHandler.processMessageWithAI(dto, port);`.

Everything else in the file — the dedupe, the group filter, the health throttle, the frozen webhook mapping — is untouched.

- [ ] **Step 7: Update the pipeline spec**

In `apps/whatsapp-service/src/services/whatsapp-core/IncomingMessagePipeline.spec.ts`, replace the `TRANSPORT` constant and the `makePipeline` factory:

```ts
// A stand-in for the reply port. The pipeline must never call it -- it only
// forwards it -- so a bare object with an identity is enough.
const PORT = { id: 'fake-port' } as any;

function makePipeline() {
  return new IncomingMessagePipeline({
    authChecker: { checkPhoneNumberAllowedWithLog: mockCheckPhone } as any,
    messageHandler: { processMessageWithAI: mockProcessWithAI } as any,
    sessionManager: { updateSessionStatus: mockUpdateStatus } as any,
    sendWebhook: mockSendWebhook,
  });
}
```

Then replace every `TRANSPORT` argument with `PORT`, and update the identity assertion at line 74 to `expect(mockProcessWithAI.mock.calls[0][1]).toBe(PORT);`.

Keep the comment at lines 69-72 explaining why `.toBe` is used instead of `toHaveBeenCalledWith` — the reasoning applies unchanged to the port.

- [ ] **Step 8: Rewrite `MessageHandler`'s inbound path**

In `apps/whatsapp-service/src/services/whatsapp-core/MessageHandler.ts`:

- Line 1 becomes `import type { Client } from 'whatsapp-web.js';` — `Message` goes, `Client` stays for the outbound path.
- Add `import type { ReplyPort } from '../../types/reply-port';`
- The signature at line 117 becomes:
  ```ts
  async processMessageWithAI(dto: NormalizedWhatsAppMessage, port: ReplyPort): Promise<void> {
  ```
- Replace the doc comment above it (lines 108-116, the one calling `transport` "the Phase 2 seam") with:
  ```ts
  /**
   * Process message with AI integration.
   *
   * `port` is how this method answers. It holds the engine's message handle
   * privately; nothing here knows which engine produced it. Everything read
   * comes from `dto`.
   */
  ```
- The early typing block at lines 135-141 becomes:
  ```ts
      try {
        await port.startTyping();
        logger.debug('⌨️  Typing indicator activated early (covering LLM + humanized delay)');
      } catch (typingErr) {
        logger.warn('⚠️  Early typing indicator failed (non-blocking):', typingErr);
      }
  ```
  Keep the long Spanish comment above it (lines 122-133) explaining *why* typing starts here — that is a product decision recorded against a real user test, not an implementation detail. Change only its last sentence, which names `whatsapp-web.js`, to: `El transporte mantiene el state ~25s sin clearState, suficiente para cubrir el flow.`
- Line 216 becomes `await this.sendResponseWithStrategy(port, dto.text, thinkingResult.content, strategy);`
- Every `await transport.reply(x)` — lines 295, 316, 339, 344 — becomes `await port.reply(x)`. The surrounding try/catch structure does not change.
- `sendResponseWithStrategy` (lines 386-435) becomes:

```ts
  private async sendResponseWithStrategy(
    port: ReplyPort,
    userMessageText: string,
    responseText: string,
    strategy: any
  ): Promise<void> {
    // Fase A3 (2026-04-19): typing indicator para que la respuesta de la IA
    // se vea natural en WhatsApp. Sin esto el mensaje aparece "de golpe" y el
    // usuario percibe al bot como robótico.
    try {
      await port.startTyping();
    } catch (typingErr) {
      // No bloqueante: si falla, seguimos con el envío sin indicator. Evita
      // que un problema transitorio impida la respuesta.
      logger.warn('⚠️  Could not send typing state (continuing without):', typingErr);
    }

    try {
      if (
        strategy.shouldQuote ||
        this.shouldQuoteBasedOnContext(userMessageText, responseText, strategy)
      ) {
        await port.reply(responseText);
        logger.debug('📝 Response sent with quote');
      } else {
        await port.send(responseText);
        logger.debug('📝 Response sent without quote');
      }
    } catch (error) {
      logger.error('Error in sendResponseWithStrategy:', error);
      // Fallback to simple reply
      await port.reply(responseText);
    } finally {
      // Limpiar el typing state siempre — tanto en éxito como en fallback.
      // Antes esto iba condicionado a haber obtenido el chat; el port ya
      // encapsula esa búsqueda, así que se llama incondicionalmente y el
      // catch absorbe el caso en que nunca llegó a activarse.
      try {
        await port.stopTyping();
      } catch (clearErr) {
        logger.debug('Could not clear typing state (non-critical):', clearErr);
      }
    }
  }
```

- [ ] **Step 9: Build the port at the engine boundary**

In `apps/whatsapp-service/src/services/whatsapp-core/EventDispatcher.ts`:

- Add `import type { ReplyPort } from '../../types/reply-port';` and `import { makeWwebjsReplyPort } from './wwebjs-reply-port';`
- The `messageHandler` parameter type at line 42-44 becomes:
  ```ts
      messageHandler: {
        processMessageWithAI: (dto: NormalizedWhatsAppMessage, port: ReplyPort) => Promise<void>;
      },
  ```
- Line 74 becomes `const pipeline = new IncomingMessagePipeline({` — the `<Message>` type argument goes. Replace the two-line comment above it with: `// The pipeline is engine-agnostic. Message only appears below, where this` / `// dispatcher wraps it in a ReplyPort.`
- Line 320 becomes `await pipeline.handle(dto, makeWwebjsReplyPort(message));`

`EventDispatcher` keeps `import type { Client, Message }` at line 1. It is the engine boundary until Task 8a and needs both.

- [ ] **Step 10: Verify the seam actually moved**

```bash
cd apps/whatsapp-service
grep -c "whatsapp-web.js" src/services/whatsapp-core/IncomingMessagePipeline.ts || echo "0 — correct"
grep -n "whatsapp-web.js" src/services/whatsapp-core/MessageHandler.ts
```

Expected: nothing in `IncomingMessagePipeline.ts`; exactly one line in `MessageHandler.ts`, and it must read `import type { Client } from 'whatsapp-web.js';`. If `Message` still appears there, a call site was missed.

- [ ] **Step 11: Typecheck and run the full suite**

```bash
pnpm typecheck
cd apps/whatsapp-service && pnpm run test
```

Expected: typecheck clean; **108 passing across 15 suites** (104 baseline + 4 new).

- [ ] **Step 12: Commit**

```bash
git add apps/whatsapp-service/src/types/reply-port.ts \
        apps/whatsapp-service/src/services/whatsapp-core/wwebjs-reply-port.ts \
        apps/whatsapp-service/src/services/whatsapp-core/wwebjs-reply-port.spec.ts \
        apps/whatsapp-service/src/services/whatsapp-core/MessageHandler.ts \
        apps/whatsapp-service/src/services/whatsapp-core/IncomingMessagePipeline.ts \
        apps/whatsapp-service/src/services/whatsapp-core/IncomingMessagePipeline.spec.ts \
        apps/whatsapp-service/src/services/whatsapp-core/EventDispatcher.ts
git commit -m "refactor(whatsapp-service): answer through a reply port, not a library object

processMessageWithAI took a whatsapp-web.js Message purely to reach
getChat().sendStateTyping(), .reply() and chat.sendMessage(). Those five
verbs collapse into a four-method port, so the AI layer no longer knows
which engine is carrying its answer.

The port is built at the dispatcher rather than derived from the DTO,
because a quoted reply needs the original message handle and the DTO
deliberately does not carry one.

The chat lookup is memoized by resolved value, not by promise: caching a
rejected promise would turn one transient Puppeteer context loss into a
session that can never answer again.

IncomingMessagePipeline loses its TTransport generic and its last
reference to the library. MessageHandler keeps Client for the outbound
path, which BaileysSessionManager takes over at cutover."
```

---

## Task 6: Delete the dead interfaces, extract the event publisher

Two independent pieces of engine-neutral tidying that both have to happen before the cutover, for different reasons: the interfaces are the last place a library type could re-enter through an `any`, and the publisher would otherwise be deleted along with `EventDispatcher` in Task 8b.

**Files:**
- Modify: `apps/whatsapp-service/src/types/index.ts:108-124` and `:600-618`
- Modify: `apps/whatsapp-service/src/interfaces/IWhatsAppSessionManager.ts:36-41`
- Create: `apps/whatsapp-service/src/services/WhatsAppEventPublisher.ts`
- Test: `apps/whatsapp-service/src/services/WhatsAppEventPublisher.spec.ts`
- Modify: `apps/whatsapp-service/src/services/whatsapp-core/EventDispatcher.ts:351-512`

**Interfaces:**
- Consumes: nothing from Task 5.
- Produces: `WhatsAppEventPublisher` with `sendWebhook(payload: WebhookPayload): Promise<void>`, `sendForceDisconnectWebhook(sessionId: string): Promise<void>`, `sendBrowserDisconnectWebhook(sessionId: string, disconnectType: string): Promise<void>`, `setWebhookUrl(url: string): void`, `getWebhookUrl(): string | undefined`, `testWebhook(): Promise<{ success: boolean; error?: string }>`. Task 8a wires `BaileysSessionManager` to it.

**What is actually dead here, verified.** `getClient(sessionId)` has **no callers anywhere** — the only `getClient()` calls in the repo are `redisClient.getClient()`, which is unrelated. `ISessionManager` (`types/index.ts:108`) and the `IWhatsAppSessionManager` that extends it (`types/index.ts:602`) have **no consumers**: nothing imports them and nothing declares `implements`. The live interface is `interfaces/IWhatsAppSessionManager.ts`, used by `core/ServiceLocator.ts:8,22`. So this is not a three-way merge — it is two deletions and one method removal.

- [ ] **Step 1: Confirm the interfaces are dead before deleting them**

```bash
cd apps/whatsapp-service
grep -rn "ISessionManager" src
grep -rn "getClient(" src ../api/src
```

Expected: `ISessionManager` appears only at `src/types/index.ts:108` (declaration) and `:602` (the `extends`). `getClient(` appears only at `src/config/redis.ts:328`, its two call sites in `RedisController.ts` and `cacheService.ts`, `WhatsAppServiceSimple.ts:138` (all `redisClient.getClient()`), and the three interface declarations.

**If any other consumer appears, stop and report it.** The deletion below assumes there are none.

- [ ] **Step 2: Delete the two dead interfaces**

In `apps/whatsapp-service/src/types/index.ts`, delete `export interface ISessionManager { … }` (lines 108-124, including the `/** Message Processing */` separator only if it belongs to the deleted block — check before cutting) and `export interface IWhatsAppSessionManager extends ISessionManager { … }` (lines 600-618, including its doc comment).

- [ ] **Step 3: Drop `getClient` from the live interface**

In `apps/whatsapp-service/src/interfaces/IWhatsAppSessionManager.ts`, delete lines 36-41:

```ts
  /**
   * Get WhatsApp client for session
   */
  getClient(sessionId: string): any;
```

This is the last declared escape hatch through which a library type could reach a consumer. It has no callers, so removing it is free — but leaving it would let the cutover reintroduce one silently.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`

Expected: clean. If it is not, a consumer exists that Step 1 did not find — stop and report it rather than restoring the interface.

- [ ] **Step 5: Write the failing test for the publisher**

Create `apps/whatsapp-service/src/services/WhatsAppEventPublisher.spec.ts`:

```ts
const mockNotifySocketEvent = jest.fn();
const mockSignServiceRequest = jest.fn();

jest.mock('./WhatsAppService', () => ({
  __esModule: true,
  default: { notifySocketEvent: (...args: unknown[]) => mockNotifySocketEvent(...args) },
}));

jest.mock('../middleware/auth', () => ({
  signServiceRequest: (...args: unknown[]) => mockSignServiceRequest(...args),
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { WhatsAppEventPublisher } from './WhatsAppEventPublisher';

const URL = 'https://api.example.test/api/whatsapp/webhook';

function payload() {
  return {
    event: 'message' as const,
    sessionId: 's1',
    data: { id: 's1:ABC', from: '34600000000', body: 'hola' },
    timestamp: '2026-08-25T10:00:00.000Z',
  };
}

let fetchMock: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.WHATSAPP_SERVICE_HMAC_SECRET = 'a'.repeat(64);
  mockNotifySocketEvent.mockResolvedValue(undefined);
  mockSignServiceRequest.mockReturnValue({ timestamp: '1756000000', signature: 'deadbeef' });
  fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
  (global as any).fetch = fetchMock;
});

describe('WhatsAppEventPublisher', () => {
  it('signs_the_exact_body_it_sends', async () => {
    // The API verifies the HMAC over the raw body. Signing a re-serialized
    // object would produce a different byte string for the same data and
    // every webhook would 401 -- which no local test would catch, because
    // the signature is only checked on the other side of the network.
    await new WhatsAppEventPublisher(URL).sendWebhook(payload() as any);

    expect(mockSignServiceRequest).toHaveBeenCalledTimes(1);
    const signedBody = mockSignServiceRequest.mock.calls[0][0];
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].body).toBe(signedBody);
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      'x-service-timestamp': '1756000000',
      'x-service-signature': 'deadbeef',
    });
  });

  it('emits_the_socket_event_before_the_http_webhook', async () => {
    // The dashboard reacts to Socket.IO; the API persists from the webhook.
    // Emitting after the HTTP round-trip would add its latency to every UI
    // update, and a slow webhook endpoint would look like a frozen dashboard.
    const order: string[] = [];
    mockNotifySocketEvent.mockImplementation(async () => {
      order.push('socket');
    });
    fetchMock.mockImplementation(async () => {
      order.push('http');
      return { ok: true, status: 200 };
    });

    await new WhatsAppEventPublisher(URL).sendWebhook(payload() as any);

    expect(order).toEqual(['socket', 'http']);
  });

  it('still_emits_the_socket_event_when_no_webhook_url_is_configured', async () => {
    await new WhatsAppEventPublisher(undefined).sendWebhook(payload() as any);

    expect(mockNotifySocketEvent).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses_to_send_unsigned_when_the_secret_is_missing', async () => {
    // Sending unsigned would be rejected by the API anyway, but silently:
    // the failure would look like a network problem rather than a
    // misconfiguration. Not sending at all keeps the cause visible.
    delete process.env.WHATSAPP_SERVICE_HMAC_SECRET;

    await new WhatsAppEventPublisher(URL).sendWebhook(payload() as any);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockNotifySocketEvent).toHaveBeenCalledTimes(1);
  });

  it('a_failing_webhook_does_not_throw', async () => {
    // WhatsApp traffic must not stop because the API is down.
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      new WhatsAppEventPublisher(URL).sendWebhook(payload() as any)
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "WhatsAppEventPublisher"`

Expected: FAIL with `Cannot find module './WhatsAppEventPublisher'`.

- [ ] **Step 7: Extract the publisher**

Create `apps/whatsapp-service/src/services/WhatsAppEventPublisher.ts` by **moving** — not rewriting — `sendWebhook`, `sendForceDisconnectWebhook`, `sendBrowserDisconnectWebhook`, `setWebhookUrl`, `getWebhookUrl` and `testWebhook` out of `EventDispatcher.ts:351-512`.

The class takes the webhook URL in its constructor, exactly as `EventDispatcher` does today:

```ts
import { logger } from '../utils/logger';
import type { WebhookPayload } from '../types';
import { signServiceRequest } from '../middleware/auth';

/**
 * Emits session and message events to the dashboard (Socket.IO) and to the
 * Nest API (HMAC-signed HTTP webhook).
 *
 * Extracted from EventDispatcher so the engine cutover can delete that class
 * without taking the emission path with it. Nothing here is engine-specific.
 */
export class WhatsAppEventPublisher {
  constructor(private webhookUrl?: string) {}

  // … the six methods, moved verbatim. `private async sendWebhook` becomes
  // `async sendWebhook` — Task 8a calls it from outside.
}

export default WhatsAppEventPublisher;
```

Keep every behaviour: the dynamic `await import('../WhatsAppService')` becomes `await import('./WhatsAppService')` (the path changes because the file moved up one directory — check it), Socket.IO first, the `AbortSignal.timeout(5000)`, and every `logger.warn` that swallows a failure so WhatsApp traffic is not interrupted.

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "WhatsAppEventPublisher"`

Expected: PASS, 5 tests.

- [ ] **Step 9: Make `EventDispatcher` delegate**

In `apps/whatsapp-service/src/services/whatsapp-core/EventDispatcher.ts`:

- Add `import { WhatsAppEventPublisher } from '../WhatsAppEventPublisher';`
- Replace the `webhookUrl` field with `private publisher: WhatsAppEventPublisher;`, built in the constructor from the same argument.
- Delete the six moved methods and replace each internal `this.sendWebhook(...)` call with `this.publisher.sendWebhook(...)`.
- Keep `setWebhookUrl`, `getWebhookUrl`, `testWebhook`, `sendForceDisconnectWebhook` and `sendBrowserDisconnectWebhook` as one-line forwarders — external callers exist and their signatures must not change.

Verify the forwarders are still needed:

```bash
grep -rn "eventDispatcher\.\(setWebhookUrl\|getWebhookUrl\|testWebhook\|sendForceDisconnectWebhook\|sendBrowserDisconnectWebhook\)" src
```

**Do not duplicate any logic.** If a method's body still contains a `fetch` after this step, the extraction did not happen.

- [ ] **Step 10: Typecheck and run the full suite**

```bash
pnpm typecheck
cd apps/whatsapp-service && pnpm run test
```

Expected: typecheck clean; **113 passing across 16 suites** (108 + 5 new).

- [ ] **Step 11: Commit**

```bash
git add apps/whatsapp-service/src/types/index.ts \
        apps/whatsapp-service/src/interfaces/IWhatsAppSessionManager.ts \
        apps/whatsapp-service/src/services/WhatsAppEventPublisher.ts \
        apps/whatsapp-service/src/services/WhatsAppEventPublisher.spec.ts \
        apps/whatsapp-service/src/services/whatsapp-core/EventDispatcher.ts
git commit -m "refactor(whatsapp-service): drop dead session interfaces, extract the event publisher

types/index.ts declared an ISessionManager and an IWhatsAppSessionManager
extending it. Neither had a consumer: nothing imported them, nothing
implemented them. The live interface is the one in interfaces/, used by
ServiceLocator.

getClient(sessionId): any was declared in all three and called from
nowhere -- the only getClient() calls in the repo are redisClient's,
which is unrelated. It was the last declared route by which a library
type could reach a consumer, so it goes before the cutover rather than
after.

WhatsAppEventPublisher moves the Socket.IO emission, the HMAC-signed
webhook and testWebhook out of EventDispatcher, which the cutover
deletes. None of it was engine-specific; leaving it there would have
meant deleting the outbound event path along with the engine."
```

---

## Task 7: Baileys, isolated and unwired

Everything here compiles — `tsconfig` includes all of `src/**/*` — and nothing reaches it at runtime. Built in dependency order, with the manager last because it composes the other three.

**Files:**
- Create: `apps/whatsapp-service/src/services/baileys/baileys-normalizer.ts` (+ spec)
- Modify: `apps/whatsapp-service/src/services/session-credentials/SessionCredentialsStore.ts` (+ spec)
- Create: `apps/whatsapp-service/src/services/baileys/BaileysAuthState.ts` (+ spec)
- Create: `apps/whatsapp-service/src/services/baileys/baileys-reply-port.ts` (+ spec)
- Create: `apps/whatsapp-service/src/services/baileys/BaileysSessionManager.ts` (+ spec)

**Interfaces:**
- Consumes: `ReplyPort` (Task 5), `WhatsAppEventPublisher` (Task 6), `NormalizedWhatsAppMessage` and `SessionCredentialsStore` (Phase 1).
- Produces:
  - `normalizeBaileysMessage(message: WAMessage, sessionId: string): NormalizedWhatsAppMessage | null`
  - `SessionCredentialsStore.setBatch(sessionId: string, data: Record<string, Record<string, unknown | null>>): Promise<void>`
  - `SessionCredentialsStore.hasCredentials(sessionId: string): Promise<boolean>`
  - `makeBaileysAuthState(sessionId: string, store: SessionCredentialsStore): Promise<{ state: AuthenticationState; saveCreds: (update: Partial<AuthenticationCreds>) => Promise<void> }>`
  - `makeBaileysReplyPort(sock: WASocket, message: WAMessage): ReplyPort`
  - `BaileysSessionManager` — see Step 14.

- [ ] **Step 1: Add the dependency**

```bash
pnpm --filter @leadcrm/whatsapp-service add @whiskeysockets/baileys@6.7.24
```

Then confirm the exact pin landed:

```bash
grep '"@whiskeysockets/baileys"' apps/whatsapp-service/package.json
```

Expected: `"@whiskeysockets/baileys": "6.7.24"` — **no caret**. If pnpm wrote `^6.7.24`, edit it to the exact version and re-run `pnpm install`. A caret would let `6.7.25` in, and the 7.x line is a release candidate.

The install pulls `sharp` (a non-optional peer) and resolves `libsignal` from a GitHub tarball pinned at commit `bcea72d`. Both are expected. If the install fails with `ERR_PNPM_EXOTIC_SUBDEP`, the local pnpm is 11.x — this repo requires pnpm 9 (`packageManager: pnpm@9.0.0`); run through corepack.

- [ ] **Step 2: Write the failing normalizer test**

Create `apps/whatsapp-service/src/services/baileys/baileys-normalizer.spec.ts`:

```ts
import { normalizeBaileysMessage } from './baileys-normalizer';

const SESSION_ID = 'smoke';

function waMessage(overrides: any = {}): any {
  return {
    key: {
      remoteJid: '34600111222@s.whatsapp.net',
      fromMe: false,
      id: 'ABC123',
      ...(overrides.key ?? {}),
    },
    message: overrides.message ?? { conversation: 'hola' },
    messageTimestamp: overrides.messageTimestamp ?? 1756000000,
    pushName: 'Tester',
  };
}

describe('normalizeBaileysMessage', () => {
  it('normalizes_a_plain_one_to_one_text_message', () => {
    expect(normalizeBaileysMessage(waMessage(), SESSION_ID)).toEqual({
      id: `${SESSION_ID}:ABC123`,
      sessionId: SESSION_ID,
      senderPhone: '34600111222',
      recipientPhone: '34600111222',
      text: 'hola',
      timestamp: 1756000000,
      type: 'text',
      isGroup: false,
      fromMe: false,
    });
  });

  it('reads_the_phone_from_senderPn_when_the_jid_is_a_lid', () => {
    // A LID's user part is a 15-digit number, which passes /^[1-9]\d{7,14}$/
    // exactly like a real phone number. Trusting remoteJid here would mint a
    // plausible-looking number belonging to nobody, create a Lead under it,
    // and answer a stranger. This is the single most dangerous line in the
    // file, and removing the isLidUser branch must fail here.
    const dto = normalizeBaileysMessage(
      waMessage({ key: { remoteJid: '182736451827364@lid', senderPn: '34600111222@s.whatsapp.net' } }),
      SESSION_ID
    );

    expect(dto?.senderPhone).toBe('34600111222');
  });

  it('returns_null_for_a_lid_with_no_phone_number_attached', () => {
    // Better a dropped message than a message attributed to an invented
    // number. Returning a partial DTO here is what the null exists to prevent.
    expect(
      normalizeBaileysMessage(waMessage({ key: { remoteJid: '182736451827364@lid' } }), SESSION_ID)
    ).toBeNull();
  });

  it('takes_the_sender_from_the_participant_in_a_group', () => {
    const dto = normalizeBaileysMessage(
      waMessage({
        key: {
          remoteJid: '120363000000000000@g.us',
          participant: '34600111222@s.whatsapp.net',
        },
      }),
      SESSION_ID
    );

    expect(dto?.isGroup).toBe(true);
    expect(dto?.senderPhone).toBe('34600111222');
    expect(dto?.recipientPhone).toBeNull();
  });

  it('unwraps_an_ephemeral_message_before_reading_its_type_and_text', () => {
    // getContentType on the wrapper returns 'ephemeralMessage' and the text is
    // lost. Disappearing-message chats are ordinary, so skipping the unwrap
    // silently drops every message from them. Deleting the
    // extractMessageContent call is a one-line change and must fail here.
    const dto = normalizeBaileysMessage(
      waMessage({ message: { ephemeralMessage: { message: { conversation: 'efímero' } } } }),
      SESSION_ID
    );

    expect(dto?.type).toBe('text');
    expect(dto?.text).toBe('efímero');
  });

  it('reads_text_from_extendedTextMessage_and_from_media_captions', () => {
    expect(
      normalizeBaileysMessage(
        waMessage({ message: { extendedTextMessage: { text: 'con enlace' } } }),
        SESSION_ID
      )
    ).toMatchObject({ type: 'text', text: 'con enlace' });

    expect(
      normalizeBaileysMessage(
        waMessage({ message: { imageMessage: { caption: 'pie de foto' } } }),
        SESSION_ID
      )
    ).toMatchObject({ type: 'image', text: 'pie de foto' });

    expect(
      normalizeBaileysMessage(waMessage({ message: { audioMessage: {} } }), SESSION_ID)
    ).toMatchObject({ type: 'audio', text: '' });
  });

  it('coerces_a_long_timestamp_to_a_plain_number_of_seconds', () => {
    // protobufjs hands back a Long for int64 fields. Writing that object into
    // the DTO puts {low, high, unsigned} on the frozen webhook wire, where
    // apps/api does `new Date(timestamp * 1000)` on it.
    const dto = normalizeBaileysMessage(
      waMessage({ messageTimestamp: { low: 1756000000, high: 0, unsigned: false } }),
      SESSION_ID
    );

    expect(typeof dto?.timestamp).toBe('number');
    expect(dto?.timestamp).toBe(1756000000);
  });

  it('drops_a_message_with_no_id_and_a_message_with_no_content', () => {
    expect(normalizeBaileysMessage(waMessage({ key: { id: undefined } }), SESSION_ID)).toBeNull();
    expect(normalizeBaileysMessage(waMessage({ message: null }), SESSION_ID)).toBeNull();
  });

  it('prefixes_the_dto_id_with_the_session_it_was_normalized_for', () => {
    // Two tenants can legitimately see the same provider message id. The
    // pipeline's Redis dedupe key is built from dto.id alone, so the session
    // scope has to be introduced here or one tenant's message silently
    // suppresses another's.
    const a = normalizeBaileysMessage(waMessage(), 'tenant-a');
    const b = normalizeBaileysMessage(waMessage(), 'tenant-b');

    expect(a?.id).toBe('tenant-a:ABC123');
    expect(b?.id).toBe('tenant-b:ABC123');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "baileys-normalizer"`

Expected: FAIL with `Cannot find module './baileys-normalizer'`.

- [ ] **Step 4: Write the normalizer**

Create `apps/whatsapp-service/src/services/baileys/baileys-normalizer.ts`:

```ts
import { extractMessageContent, getContentType, isJidGroup, isLidUser, jidDecode } from '@whiskeysockets/baileys';
import type { WAMessage } from '@whiskeysockets/baileys';
import type { NormalizedWhatsAppMessage, NormalizedMessageType } from '../../types/messages';

const E164 = /^[1-9]\d{7,14}$/;

function toPhone(jid: string | null | undefined): string | null {
  if (!jid) return null;
  // jidDecode strips the device suffix (`:12`) on its own.
  const user = jidDecode(jid)?.user;
  return user && E164.test(user) ? user : null;
}

/**
 * A LID's user part is a 15-digit number and passes the E.164 test, so it
 * cannot be told apart from a phone number by shape alone. The real number
 * travels beside it on the key, in `senderPn` (one-to-one) or `participantPn`
 * (group). When the JID is a LID and no PN accompanies it, there is no phone
 * number -- returning null is correct, inventing one is not.
 */
function resolvePhone(jid: string | null | undefined, pn: string | null | undefined): string | null {
  if (isLidUser(jid)) return toPhone(pn);
  return toPhone(jid);
}

function toType(contentType: string | undefined): NormalizedMessageType {
  switch (contentType) {
    case 'imageMessage':
      return 'image';
    case 'audioMessage':
      return 'audio';
    case 'videoMessage':
      return 'video';
    case 'documentMessage':
      return 'document';
    default:
      return 'text';
  }
}

function toText(content: Record<string, any>, contentType: string | undefined): string {
  switch (contentType) {
    case 'conversation':
      return content.conversation ?? '';
    case 'extendedTextMessage':
      return content.extendedTextMessage?.text ?? '';
    case 'imageMessage':
    case 'videoMessage':
      return content[contentType]?.caption ?? '';
    default:
      return '';
  }
}

/** protobufjs returns a Long for int64 fields; the wire contract wants a number. */
function toSeconds(ts: unknown): number {
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') return Number(ts);
  if (ts && typeof ts === 'object' && 'low' in (ts as any)) return Number((ts as any).low);
  return 0;
}

/**
 * The single place a Baileys WAMessage becomes a DTO. Mirrors
 * normalizeWwebjsMessage's signature exactly; nothing downstream changes.
 *
 * Returns null rather than a partial DTO -- a half-populated message is worse
 * than a dropped one.
 */
export function normalizeBaileysMessage(
  message: WAMessage,
  sessionId: string
): NormalizedWhatsAppMessage | null {
  const providerId = message.key?.id;
  if (!providerId) return null;

  // Unwrap first. getContentType on an ephemeralMessage wrapper returns
  // 'ephemeralMessage' and the text never surfaces; disappearing-message
  // chats are ordinary, so this is not an edge case.
  const content = extractMessageContent(message.message);
  if (!content) return null;
  const contentType = getContentType(content);

  const isGroup = !!isJidGroup(message.key.remoteJid);

  const senderPhone = isGroup
    ? resolvePhone(message.key.participant, message.key.participantPn)
    : resolvePhone(message.key.remoteJid, message.key.senderPn);
  if (!senderPhone) return null;

  return {
    id: `${sessionId}:${providerId}`,
    sessionId,
    senderPhone,
    recipientPhone: isGroup ? null : senderPhone,
    text: toText(content as Record<string, any>, contentType),
    timestamp: toSeconds(message.messageTimestamp),
    type: toType(contentType),
    isGroup,
    fromMe: !!message.key.fromMe,
  };
}
```

**Note on `recipientPhone`.** In wwebjs, `message.to` is the connected number. Baileys does not put it on the message: for an inbound one-to-one message `remoteJid` *is* the other party, and the connected number lives on `sock.user.id`. Mirroring the wwebjs behaviour exactly would require threading the socket into the normalizer, which breaks its signature. The DTO field feeds `data.to` on the frozen webhook, and `apps/api` never reads it — only `data.from` and `data.body`. The test above pins the chosen behaviour; **if you disagree with it, stop and ask rather than changing it silently.**

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "baileys-normalizer"`

Expected: PASS, 9 tests.

- [ ] **Step 6: Write the failing store test**

Append to `apps/whatsapp-service/src/services/session-credentials/SessionCredentialsStore.spec.ts` — read the existing file first and reuse its mock setup rather than building a second one:

```ts
describe('SessionCredentialsStore batch writes', () => {
  it('writes_every_category_of_one_batch_inside_a_single_transaction', async () => {
    // Baileys wraps this store in its own transaction buffer and flushes one
    // batch per commit, retrying the whole commit up to ten times. The retry
    // is idempotent, so a failure mid-batch is survivable -- unless the
    // process dies during the 3s backoff, at which point Postgres keeps a
    // partial write: a consumed pre-key deleted, the session never advanced.
    // That desynchronises the Signal ratchet irrecoverably for that contact.
    const store = new SessionCredentialsStore(prismaMock as any);

    await store.setBatch('s1', {
      'pre-key': { '1': null },
      session: { '34600111222.0': { some: 'state' } },
    });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    // Every write must be inside the callback, none outside it.
    expect(txMock.whatsAppAuthKey.deleteMany).toHaveBeenCalledTimes(1);
    expect(txMock.whatsAppAuthKey.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.whatsAppAuthKey.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.whatsAppAuthKey.upsert).not.toHaveBeenCalled();
  });

  it('scopes_the_delete_by_category_as_well_as_by_key_id', async () => {
    // Two categories can legitimately hold the same keyId. Deleting by
    // (sessionId, keyId) alone would take an unrelated key with it.
    const store = new SessionCredentialsStore(prismaMock as any);

    await store.setBatch('s1', { 'pre-key': { '1': null }, session: { '1': null } });

    const wheres = txMock.whatsAppAuthKey.deleteMany.mock.calls.map((c: any[]) => c[0].where);
    expect(wheres).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sessionId: 's1', category: 'pre-key' }),
        expect.objectContaining({ sessionId: 's1', category: 'session' }),
      ])
    );
  });

  it('hasCredentials_is_true_only_when_the_creds_row_exists', async () => {
    // "Do I have credentials" must not be answered by "are there any rows":
    // a session can hold orphaned pre-keys with no creds row, and recovering
    // it would fail after the socket is already up.
    const store = new SessionCredentialsStore(prismaMock as any);

    prismaMock.whatsAppAuthKey.count.mockResolvedValueOnce(1);
    await expect(store.hasCredentials('s1')).resolves.toBe(true);
    expect(prismaMock.whatsAppAuthKey.count).toHaveBeenCalledWith({
      where: { sessionId: 's1', category: 'creds' },
    });

    prismaMock.whatsAppAuthKey.count.mockResolvedValueOnce(0);
    await expect(store.hasCredentials('s1')).resolves.toBe(false);
  });
});
```

The existing spec's Prisma mock does not yet expose `$transaction` or `count`. Extend it so `$transaction(cb)` invokes `cb(txMock)` and returns its result, where `txMock.whatsAppAuthKey` has `deleteMany` and `upsert` jest mocks. **Read the existing mock before writing this — do not duplicate it.**

- [ ] **Step 7: Run the test to verify it fails**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "SessionCredentialsStore"`

Expected: FAIL — `store.setBatch is not a function`.

- [ ] **Step 8: Add the batch and the presence check to the store**

In `apps/whatsapp-service/src/services/session-credentials/SessionCredentialsStore.ts`, add two methods. Leave `get`, `set` and `clear` exactly as they are — `set` stays for single-category callers and tests.

```ts
  /**
   * Write one Baileys SignalDataSet atomically.
   *
   * `data` is keyed by category, then by key id; a null value means delete.
   * Everything goes in one transaction because Baileys flushes a whole batch
   * per commit: a pre-key deletion that lands while its matching session
   * write does not leaves the Signal ratchet desynchronised, and no retry
   * can repair it because the consumed key is already gone.
   */
  async setBatch(
    sessionId: string,
    data: Record<string, Record<string, unknown | null>>
  ): Promise<void> {
    const deletes: Array<{ category: string; keyIds: string[] }> = [];
    const writes: Array<{ category: string; keyId: string; value: EncryptedValue }> = [];

    for (const [category, values] of Object.entries(data)) {
      if (!values) continue;
      const keyIds = Object.keys(values);
      const toDelete = keyIds.filter(k => values[k] === null);
      if (toDelete.length > 0) deletes.push({ category, keyIds: toDelete });
      for (const keyId of keyIds.filter(k => values[k] !== null)) {
        // Seal outside the transaction: AES-GCM is CPU work, and holding a
        // Postgres transaction open across it lengthens the window for no
        // reason.
        writes.push({ category, keyId, value: this.seal(values[keyId]) });
      }
    }

    if (deletes.length === 0 && writes.length === 0) return;

    await this.prisma.$transaction(async tx => {
      for (const { category, keyIds } of deletes) {
        await tx.whatsAppAuthKey.deleteMany({
          where: { sessionId, category, keyId: { in: keyIds } },
        });
      }
      for (const { category, keyId, value } of writes) {
        await tx.whatsAppAuthKey.upsert({
          where: { sessionId_category_keyId: { sessionId, category, keyId } },
          create: { sessionId, category, keyId, value: value as unknown as object },
          update: { value: value as unknown as object },
        });
      }
    });
  }

  /**
   * Whether this session can reconnect without a new QR.
   *
   * Scoped to the `creds` category on purpose: a session can hold orphaned
   * pre-keys with no credentials, and answering "yes" for it would fail after
   * the socket is already up rather than before it starts.
   */
  async hasCredentials(sessionId: string): Promise<boolean> {
    const count = await this.prisma.whatsAppAuthKey.count({
      where: { sessionId, category: 'creds' },
    });
    return count > 0;
  }
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "SessionCredentialsStore"`

Expected: PASS — the pre-existing tests plus the 3 new ones.

- [ ] **Step 10: Write the failing auth-state test**

Create `apps/whatsapp-service/src/services/baileys/BaileysAuthState.spec.ts`:

```ts
import { initAuthCreds, proto } from '@whiskeysockets/baileys';
import { makeBaileysAuthState } from './BaileysAuthState';

function makeStore() {
  return {
    get: jest.fn().mockResolvedValue({}),
    set: jest.fn().mockResolvedValue(undefined),
    setBatch: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    hasCredentials: jest.fn().mockResolvedValue(false),
  } as any;
}

describe('makeBaileysAuthState', () => {
  it('generates_fresh_credentials_when_the_session_has_none', async () => {
    const store = makeStore();

    const { state } = await makeBaileysAuthState('s1', store);

    expect(state.creds.registrationId).toEqual(expect.any(Number));
    expect(Buffer.isBuffer(state.creds.noiseKey.private)).toBe(true);
  });

  it('revives_app_state_sync_keys_as_protobuf_messages', async () => {
    // protobufjs installs its own toJSON on the message prototype, and
    // JSON.stringify consults it before the store's replacer runs -- so what
    // comes back out is a plain object with a base64 string where Baileys
    // expects bytes. Baileys' own useMultiFileAuthState calls fromObject for
    // exactly this category. Without it, app-state sync fails days later,
    // silently, with the session still showing as connected.
    const store = makeStore();
    const original = proto.Message.AppStateSyncKeyData.fromObject({
      keyData: Buffer.from('0123456789abcdef0123456789abcdef', 'utf8'),
      fingerprint: { rawId: 7, currentIndex: 1, deviceIndexes: [0, 1] },
      timestamp: 1756000000000,
    });
    // What the store actually returns after a round-trip through JSON.
    store.get.mockResolvedValue({ k1: JSON.parse(JSON.stringify(original)) });

    const { state } = await makeBaileysAuthState('s1', store);
    const read = await state.keys.get('app-state-sync-key', ['k1']);

    expect(Buffer.from(read.k1!.keyData as Uint8Array)).toEqual(Buffer.from(original.keyData));
  });

  it('does_not_apply_fromObject_to_any_other_category', async () => {
    // session and sender-key are plain Uint8Array. Running them through a
    // protobuf constructor would corrupt them.
    const store = makeStore();
    const raw = Buffer.from([1, 2, 3, 4]);
    store.get.mockResolvedValue({ 'k1': raw });

    const { state } = await makeBaileysAuthState('s1', store);

    expect(await state.keys.get('session', ['k1'])).toEqual({ k1: raw });
    expect(await state.keys.get('sender-key', ['k1'])).toEqual({ k1: raw });
  });

  it('writes_the_whole_data_set_through_setBatch_not_one_call_per_category', async () => {
    const store = makeStore();
    const { state } = await makeBaileysAuthState('s1', store);

    await state.keys.set({
      'pre-key': { '1': null },
      session: { 'a.0': Buffer.from([9]) },
    } as any);

    expect(store.setBatch).toHaveBeenCalledTimes(1);
    expect(store.set).not.toHaveBeenCalled();
    expect(store.setBatch.mock.calls[0][0]).toBe('s1');
    expect(Object.keys(store.setBatch.mock.calls[0][1]).sort()).toEqual(['pre-key', 'session']);
  });

  it('merges_partial_creds_updates_instead_of_replacing_them', async () => {
    // creds.update carries a patch, not a full record. myAppStateKeyId in
    // particular is assigned mid-handshake; persisting the patch alone would
    // drop noiseKey and every identity key with it, and the next boot would
    // demand a new QR.
    const store = makeStore();
    const { state, saveCreds } = await makeBaileysAuthState('s1', store);
    const originalNoiseKey = state.creds.noiseKey.private;

    await saveCreds({ myAppStateKeyId: 'AAAA' } as any);

    expect(store.setBatch).toHaveBeenCalledTimes(1);
    const written = store.setBatch.mock.calls[0][1].creds.creds as any;
    expect(written.myAppStateKeyId).toBe('AAAA');
    expect(written.noiseKey.private).toEqual(originalNoiseKey);
    // And the in-memory object Baileys keeps reading must have moved too.
    expect(state.creds.myAppStateKeyId).toBe('AAAA');
  });

  it('a_key_the_store_cannot_return_is_simply_absent', async () => {
    const store = makeStore();
    store.get.mockResolvedValue({});

    const { state } = await makeBaileysAuthState('s1', store);

    expect(await state.keys.get('session', ['missing'])).toEqual({});
  });
});
```

- [ ] **Step 11: Run the test to verify it fails**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "BaileysAuthState"`

Expected: FAIL with `Cannot find module './BaileysAuthState'`.

- [ ] **Step 12: Write the auth adapter**

Create `apps/whatsapp-service/src/services/baileys/BaileysAuthState.ts`:

```ts
import { initAuthCreds, proto } from '@whiskeysockets/baileys';
import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataSet,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import type { SessionCredentialsStore } from '../session-credentials/SessionCredentialsStore';

const CREDS_CATEGORY = 'creds';
const CREDS_KEY = 'creds';

/**
 * Baileys' AuthenticationState over the durable credential store.
 *
 * This is the only file that knows one Signal category is a protobuf message.
 * The store deliberately stays protobuf-agnostic: it seals and unseals JSON
 * and nothing else.
 */
export async function makeBaileysAuthState(
  sessionId: string,
  store: SessionCredentialsStore
): Promise<{
  state: AuthenticationState;
  saveCreds: (update: Partial<AuthenticationCreds>) => Promise<void>;
}> {
  const stored = await store.get(sessionId, CREDS_CATEGORY, [CREDS_KEY]);
  // makeWASocket reads `creds` synchronously at construction, so it has to be
  // a plain resolved object -- not a promise, not a lazy proxy.
  const creds: AuthenticationCreds = (stored[CREDS_KEY] as AuthenticationCreds) ?? initAuthCreds();

  const persistCreds = () => store.setBatch(sessionId, { [CREDS_CATEGORY]: { [CREDS_KEY]: creds } });

  const state: AuthenticationState = {
    creds,
    keys: {
      async get<T extends keyof SignalDataTypeMap>(type: T, ids: string[]) {
        const rows = await store.get(sessionId, type as string, ids);
        if (type !== 'app-state-sync-key') {
          return rows as { [id: string]: SignalDataTypeMap[T] };
        }
        // JSON.stringify called protobufjs's own toJSON on the way in, so
        // `keyData` is a base64 string and `timestamp` a string by now.
        // fromObject accepts both and rebuilds the message byte-for-byte.
        const revived: Record<string, unknown> = {};
        for (const [id, value] of Object.entries(rows)) {
          revived[id] = proto.Message.AppStateSyncKeyData.fromObject(value as object);
        }
        return revived as { [id: string]: SignalDataTypeMap[T] };
      },

      async set(data: SignalDataSet): Promise<void> {
        // One transaction for the whole set. Splitting it per category would
        // let a pre-key deletion commit while its matching session write does
        // not, which desynchronises the ratchet with no way back.
        await store.setBatch(sessionId, data as Record<string, Record<string, unknown | null>>);
      },
    },
  };

  return {
    state,
    async saveCreds(update: Partial<AuthenticationCreds>): Promise<void> {
      // creds.update is a patch. Mutating the same object Baileys holds keeps
      // its in-memory view and the persisted row in step; replacing it would
      // leave Baileys writing into an orphan.
      Object.assign(creds, update);
      await persistCreds();
    },
  };
}
```

- [ ] **Step 13: Run the test to verify it passes**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "BaileysAuthState"`

Expected: PASS, 6 tests.

- [ ] **Step 14: Write the failing reply-port test**

Create `apps/whatsapp-service/src/services/baileys/baileys-reply-port.spec.ts`:

```ts
import { makeBaileysReplyPort } from './baileys-reply-port';

const JID = '34600111222@s.whatsapp.net';

function makeSock() {
  return {
    sendMessage: jest.fn().mockResolvedValue(undefined),
    sendPresenceUpdate: jest.fn().mockResolvedValue(undefined),
  } as any;
}

const message = { key: { remoteJid: JID, id: 'ABC123', fromMe: false } } as any;

describe('makeBaileysReplyPort', () => {
  it('reply_quotes_the_original_message', async () => {
    // The quote is the only thing separating reply from send. Dropping the
    // `quoted` option is a one-line change and must fail here.
    const sock = makeSock();

    await makeBaileysReplyPort(sock, message).reply('con cita');

    expect(sock.sendMessage).toHaveBeenCalledWith(JID, { text: 'con cita' }, { quoted: message });
  });

  it('send_does_not_quote', async () => {
    const sock = makeSock();

    await makeBaileysReplyPort(sock, message).send('sin cita');

    expect(sock.sendMessage).toHaveBeenCalledWith(JID, { text: 'sin cita' });
  });

  it('typing_maps_to_composing_and_paused_on_the_same_jid', async () => {
    const sock = makeSock();
    const port = makeBaileysReplyPort(sock, message);

    await port.startTyping();
    await port.stopTyping();

    expect(sock.sendPresenceUpdate.mock.calls).toEqual([
      ['composing', JID],
      ['paused', JID],
    ]);
  });
});
```

- [ ] **Step 15: Run the test to verify it fails, then write the port**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "baileys-reply-port"` — expect `Cannot find module`.

Create `apps/whatsapp-service/src/services/baileys/baileys-reply-port.ts`:

```ts
import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import type { ReplyPort } from '../../types/reply-port';

/**
 * The Baileys half of the reply port. Replaces makeWwebjsReplyPort behind the
 * same interface; MessageHandler cannot tell them apart.
 *
 * No chat handle to memoize here -- Baileys addresses the chat by JID, so
 * every verb is a direct socket call.
 */
export function makeBaileysReplyPort(sock: WASocket, message: WAMessage): ReplyPort {
  const jid = message.key.remoteJid as string;

  return {
    async reply(text: string): Promise<void> {
      await sock.sendMessage(jid, { text }, { quoted: message });
    },
    async send(text: string): Promise<void> {
      await sock.sendMessage(jid, { text });
    },
    async startTyping(): Promise<void> {
      await sock.sendPresenceUpdate('composing', jid);
    },
    async stopTyping(): Promise<void> {
      await sock.sendPresenceUpdate('paused', jid);
    },
  };
}
```

Run the test again — expect PASS, 3 tests.

- [ ] **Step 16: Write the failing session-manager test**

Create `apps/whatsapp-service/src/services/baileys/BaileysSessionManager.spec.ts`. The socket is a fake: an `EventEmitter`-backed `ev` plus jest mocks for the methods used.

```ts
const mockMakeWASocket = jest.fn();
const mockMakeBaileysAuthState = jest.fn();

jest.mock('@whiskeysockets/baileys', () => {
  const actual = jest.requireActual('@whiskeysockets/baileys');
  return {
    ...actual,
    __esModule: true,
    default: (...args: unknown[]) => mockMakeWASocket(...args),
    makeWASocket: (...args: unknown[]) => mockMakeWASocket(...args),
  };
});

jest.mock('./BaileysAuthState', () => ({
  makeBaileysAuthState: (...args: unknown[]) => mockMakeBaileysAuthState(...args),
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { EventEmitter } from 'events';
import { DisconnectReason } from '@whiskeysockets/baileys';
import { BaileysSessionManager } from './BaileysSessionManager';

const SESSION_ID = 'smoke';

function makeFakeSocket() {
  const emitter = new EventEmitter();
  return {
    ev: {
      on: (event: string, handler: (...a: any[]) => void) => emitter.on(event, handler),
      off: (event: string, handler: (...a: any[]) => void) => emitter.off(event, handler),
    },
    emit: (event: string, payload: unknown) => emitter.emit(event, payload),
    user: { id: '34600111222:12@s.whatsapp.net' },
    sendMessage: jest.fn().mockResolvedValue({ key: { id: 'OUT1' } }),
    sendPresenceUpdate: jest.fn().mockResolvedValue(undefined),
    logout: jest.fn().mockResolvedValue(undefined),
    end: jest.fn(),
  };
}

let sock: ReturnType<typeof makeFakeSocket>;
let store: any;
let publisher: any;
let sessionStatus: jest.Mock;
let pipeline: any;

beforeEach(() => {
  jest.clearAllMocks();
  sock = makeFakeSocket();
  mockMakeWASocket.mockReturnValue(sock);
  mockMakeBaileysAuthState.mockResolvedValue({
    state: { creds: {}, keys: { get: jest.fn(), set: jest.fn() } },
    saveCreds: jest.fn().mockResolvedValue(undefined),
  });
  store = { hasCredentials: jest.fn().mockResolvedValue(false), clear: jest.fn() };
  publisher = { sendWebhook: jest.fn().mockResolvedValue(undefined) };
  sessionStatus = jest.fn().mockResolvedValue(undefined);
  pipeline = { handle: jest.fn().mockResolvedValue(undefined) };
});

function makeManager() {
  return new BaileysSessionManager({
    store,
    publisher,
    pipeline,
    updateSessionStatus: sessionStatus,
    handleSessionDisconnect: jest.fn().mockResolvedValue(undefined),
  });
}

describe('BaileysSessionManager connection lifecycle', () => {
  it('emits_exactly_two_authenticated_webhooks_per_successful_pairing', async () => {
    // Phase 1 froze this: EventDispatcher emitted one from `authenticated`
    // with the number unknown, and one from `ready` with the real number.
    // SocketService turns each into session:connected. Baileys collapses both
    // sources into connection.update, so emitting one would drop a dashboard
    // notification and emitting three would duplicate it.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    sock.emit('creds.update', {});
    sock.emit('connection.update', { connection: 'open' });
    await Promise.resolve();

    const authEvents = publisher.sendWebhook.mock.calls
      .map((c: any[]) => c[0])
      .filter((p: any) => p.event === 'authenticated');
    expect(authEvents).toHaveLength(2);
    expect(authEvents[0].data.number).toBe('unknown');
    expect(authEvents[1].data.number).toBe('34600111222');
  });

  it('treats_restartRequired_as_a_reconnect_and_not_as_a_failure', async () => {
    // 515 fires on the first pairing and is a normal step. Treating it as a
    // disconnect is the classic Baileys integration bug: the session pairs,
    // instantly "fails", and never comes up.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    mockMakeWASocket.mockClear();

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.restartRequired } } },
    });
    await Promise.resolve();

    expect(store.clear).not.toHaveBeenCalled();
    expect(mockMakeWASocket).toHaveBeenCalledTimes(1);
  });

  it('clears_the_credentials_only_on_loggedOut', async () => {
    // 401 is the one code that means the credentials are dead. Every other
    // code is a reconnect -- and connectionLost and timedOut are both 408, so
    // any branch trying to tell those two apart is wrong by construction.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
    });
    await Promise.resolve();
    expect(store.clear).not.toHaveBeenCalled();

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.loggedOut } } },
    });
    await Promise.resolve();
    expect(store.clear).toHaveBeenCalledWith(SESSION_ID);
  });

  it('publishes_the_qr_and_caches_it_on_the_session_row', async () => {
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    sock.emit('connection.update', { qr: 'QR-PAYLOAD' });
    await Promise.resolve();

    expect(sessionStatus).toHaveBeenCalledWith(SESSION_ID, 'connecting', { qrCode: 'QR-PAYLOAD' });
    expect(publisher.sendWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'qr_updated', data: { qrCode: 'QR-PAYLOAD' } })
    );
  });
});

describe('BaileysSessionManager inbound messages', () => {
  it('processes_notify_batches_and_ignores_history_appends', async () => {
    // 'append' is history sync. Feeding it to the pipeline would replay old
    // conversations through the AI and answer them.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    sock.emit('messages.upsert', {
      type: 'append',
      messages: [{ key: { remoteJid: '34600111222@s.whatsapp.net', id: 'OLD' }, message: { conversation: 'viejo' } }],
    });
    await Promise.resolve();
    expect(pipeline.handle).not.toHaveBeenCalled();

    sock.emit('messages.upsert', {
      type: 'notify',
      messages: [{ key: { remoteJid: '34600111222@s.whatsapp.net', id: 'NEW' }, message: { conversation: 'nuevo' } }],
    });
    await Promise.resolve();
    expect(pipeline.handle).toHaveBeenCalledTimes(1);
    expect(pipeline.handle.mock.calls[0][0].text).toBe('nuevo');
  });

  it('drops_status_broadcast_before_normalizing', async () => {
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    sock.emit('messages.upsert', {
      type: 'notify',
      messages: [{ key: { remoteJid: 'status@broadcast', id: 'S1' }, message: { conversation: 'x' } }],
    });
    await Promise.resolve();

    expect(pipeline.handle).not.toHaveBeenCalled();
  });
});

describe('BaileysSessionManager shutdown vs delete', () => {
  // This contract is inherited, not new. Phase 1 Task 1 established it after
  // finding that every pm2 restart -- i.e. every deploy -- ran the same path
  // as a deliberate DELETE /sessions/:id, deactivating the session and
  // wiping its credentials. Thirty disconnected sessions in production are
  // what that bug left behind.
  //
  // SessionManager.shutdown.spec.ts pinned it against the old engine and
  // Task 8b deletes that file. These two tests are where the guarantee
  // continues to live, so the deletion costs no coverage.

  it('shutdown_closes_the_socket_without_clearing_credentials', async () => {
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    await manager.destroySession(SESSION_ID, 'shutdown');

    expect(sock.end).toHaveBeenCalledTimes(1);
    expect(sock.logout).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('delete_logs_out_and_clears_credentials', async () => {
    // The mirror image. Without this, a destroySession that never cleared
    // anything would satisfy the test above and leave dead credentials
    // behind on every deliberate delete.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    await manager.destroySession(SESSION_ID, 'delete');

    expect(sock.logout).toHaveBeenCalledTimes(1);
    expect(store.clear).toHaveBeenCalledWith(SESSION_ID);
  });
});
```

- [ ] **Step 17: Run the test to verify it fails**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "BaileysSessionManager"`

Expected: FAIL with `Cannot find module './BaileysSessionManager'`.

- [ ] **Step 18: Write the session manager**

Create `apps/whatsapp-service/src/services/baileys/BaileysSessionManager.ts`. It is the single runtime import of the library.

Requirements the tests above pin, restated so they are not inferred from the test file:

- The constructor is **inert**. It stores its dependencies and nothing else. `makeWASocket` is called only from `createSession`, so importing this module can never open a socket.
- `createSession(sessionId, tenantId?)` builds the auth state through `makeBaileysAuthState`, calls `makeWASocket({ auth: { creds, keys: makeCacheableSignalKeyStore(state.keys, logger) }, logger, printQRInTerminal: false, browser: Browsers.ubuntu('Chrome'), syncFullHistory: false, markOnlineOnConnect: false })`, keeps the socket in a per-session `Map`, and wires the three event handlers.
- **`makeCacheableSignalKeyStore` is called here, per session.** Its third parameter is the cache; omitted, it builds a fresh one per call. Hoisting it to a module-level constant would share one cache across every session and cross tenants' Signal keys.
- `ev.on('creds.update', saveCreds)` — and the first time credentials exist, emit the first `authenticated` webhook with `data: { number: 'unknown' }`.
- `ev.on('connection.update', …)` handles, in this order: `qr` present → status `connecting` + `qr_updated` webhook; `connection === 'open'` → status `ready` + the second `authenticated` webhook with the number from `jidDecode(sock.user.id).user`; `connection === 'close'` → read `(lastDisconnect?.error as Boom)?.output?.statusCode`, and if it is `DisconnectReason.loggedOut` clear the store and emit `disconnected`, otherwise rebuild the socket.
- `ev.on('messages.upsert', …)` ignores `type !== 'notify'`, drops `status@broadcast` by JID, normalizes, and forwards `(dto, makeBaileysReplyPort(sock, message))` to the pipeline.
- `sendMessage(sessionId, to, text)` for the outbound REST path, returning the same `SendMessageResponse` shape `MessageHandler.sendMessage` returns today, including the `messageId`.
- `destroySession(sessionId, mode: 'shutdown' | 'delete')` — **`'shutdown'` must not clear credentials.** This is the Phase 1 Task 1 contract; breaking it reintroduces the bug that logged every session out on every deploy.

**Stop and ask before inventing anything this list does not cover.** Reconnect backoff, presence handling on reconnect, and history-sync policy are decisions, not details.

- [ ] **Step 19: Run the test to verify it passes**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "BaileysSessionManager"`

Expected: PASS, 8 tests.

- [ ] **Step 20: Verify Baileys is compiled but unreachable**

```bash
cd apps/whatsapp-service
grep -rn "@whiskeysockets/baileys" src --include=*.ts | grep -v "src/services/baileys/"
```

Expected: **no output.** Every import of the library lives under `src/services/baileys/`.

```bash
grep -rn "from '.*services/baileys" src --include=*.ts | grep -v "src/services/baileys/"
```

Expected: **no output.** Nothing outside that directory imports it yet — that is Task 8a.

- [ ] **Step 21: Typecheck and run the full suite**

```bash
pnpm typecheck
cd apps/whatsapp-service && pnpm run test
```

Expected: typecheck clean; **142 passing across 20 suites**.

The arithmetic, so a mismatch is diagnosable rather than shrugged at:

| | tests | suites |
|---|---|---|
| Baseline before Task 5 | 104 | 14 |
| Task 5 — `wwebjs-reply-port.spec.ts` | +4 | +1 |
| Task 6 — `WhatsAppEventPublisher.spec.ts` | +5 | +1 |
| Task 7 — `baileys-normalizer.spec.ts` | +9 | +1 |
| Task 7 — `SessionCredentialsStore.spec.ts` (existing file) | +3 | — |
| Task 7 — `BaileysAuthState.spec.ts` | +6 | +1 |
| Task 7 — `baileys-reply-port.spec.ts` | +3 | +1 |
| Task 7 — `BaileysSessionManager.spec.ts` | +8 | +1 |
| **Total** | **142** | **20** |

If the run reports anything else, find out why before continuing.

- [ ] **Step 22: Commit**

```bash
git add apps/whatsapp-service/package.json pnpm-lock.yaml \
        apps/whatsapp-service/src/services/baileys/ \
        apps/whatsapp-service/src/services/session-credentials/
git commit -m "feat(whatsapp-service): Baileys engine, compiled but unwired

Adds @whiskeysockets/baileys@6.7.24 pinned exactly -- the 7.x line is a
release candidate and `latest` points at it, so a caret would be a
version upgrade waiting to happen.

Four pieces, none of them reachable at runtime yet: a normalizer with
the same signature as the wwebjs one, an AuthenticationState adapter
over the existing credential store, a reply port, and a session manager
that owns the only runtime import of the library.

Two things the wwebjs normalizer cannot lend, both verified against the
installed package rather than assumed:

A LID's user part is fifteen digits and passes the E.164 regex, so
trusting remoteJid would mint a phone number belonging to nobody. The
real number is on key.senderPn / key.participantPn.

getContentType on an ephemeralMessage wrapper returns 'ephemeralMessage'
and loses the text; extractMessageContent has to run first.

The store gains a transactional multi-category batch. Baileys wraps the
key store in its own transaction buffer and flushes one batch per
commit, retrying up to ten times -- but a process death during the 3s
backoff leaves a partial write, and a consumed pre-key deleted without
its session write desynchronises the ratchet with no way back.

app-state-sync-key is the only Signal category that is a protobuf
message, and it is revived in the adapter so the store stays unaware of
protobuf."
```

---

## Task 8a: Runtime cutover

**Commit 1 of 2. Never deployed, cherry-picked or reverted on its own.** It must compile and pass tests standalone so branch CI stays green, but the deployable unit is 8a + 8b together.

**Files:**
- Modify: `apps/whatsapp-service/src/config/env.ts:86-95`
- Modify: `apps/whatsapp-service/src/services/WhatsAppServiceSimple.ts`
- Modify: `apps/whatsapp-service/src/services/WhatsAppService.ts:1,47,56`
- Modify: `apps/whatsapp-service/src/controllers/SessionController.ts:2`
- Modify: `apps/whatsapp-service/src/routes/index.ts:149,378,659,915`
- Modify: `apps/whatsapp-service/src/routes/health.ts:8,174,202,212`
- Modify: `apps/whatsapp-service/src/routes/proactive-consent.spec.ts:64`
- Modify: `apps/whatsapp-service/src/services/SessionRecoveryService.ts:241,252`
- Modify: `apps/whatsapp-service/src/services/session/RecoveryRunner.ts:238`
- Modify: `apps/whatsapp-service/src/services/session/HealthMetrics.ts`
- Modify: `apps/whatsapp-service/src/services/session-health-check/HealthMetrics.ts:141-142`
- Modify: `apps/whatsapp-service/src/services/baileys/BaileysSessionManager.ts`

**Interfaces:**
- Consumes: everything Tasks 5-7 produced.
- Produces: `WhatsAppServiceSimple` with its public API unchanged — `initialize`, `createSession(sessionId, tenantId?)`, `getSession`, `sendMessage`, `getSessionStatus`, `getAllSessions`, `destroySession`, `shutdown`, `forceDisconnectSession`, `recoverSessionWithAuthValidation`, `getArchitectureMode`, `getModuleStatus`, `testWebhook`, `getSessionHealth`.

- [ ] **Step 1: Write the failing test for the encryption-key gate**

`apps/whatsapp-service/src/config/env.spec.ts` does not exist — create it. `validateEnv()` reads `process.env` when called rather than at import time, so no module reset is needed, but the environment has to be restored between tests or one case leaks into the next.

```ts
jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { validateEnv } from './env';

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

it('exits_in_production_when_the_credential_encryption_key_is_missing', () => {
  // Until now this was a warning on purpose: nothing read the key, and
  // exiting for an unused secret would boot-loop Hetzner (see the comment
  // this step replaces). From the cutover on, the key is on the critical
  // path -- without it the service boots green and dies at the first
  // creds.update, which reads as "Baileys is broken" rather than "the env
  // is missing".
  const exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  process.env.NODE_ENV = 'production';
  process.env.WHATSAPP_SERVICE_HMAC_SECRET = 'a'.repeat(64);
  delete process.env.WHATSAPP_AUTH_ENCRYPTION_KEY;

  validateEnv();

  expect(exit).toHaveBeenCalledWith(1);
  exit.mockRestore();
});

it('only_warns_in_development_when_the_credential_encryption_key_is_missing', () => {
  const exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  process.env.NODE_ENV = 'development';
  process.env.WHATSAPP_SERVICE_HMAC_SECRET = 'a'.repeat(64);
  delete process.env.WHATSAPP_AUTH_ENCRYPTION_KEY;

  validateEnv();

  expect(exit).not.toHaveBeenCalled();
  exit.mockRestore();
});
```

- [ ] **Step 2: Run it, then close the gate**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "env"` — expect the first test to FAIL.

In `apps/whatsapp-service/src/config/env.ts`, replace lines 86-95 with:

```ts
    if (!env.WHATSAPP_AUTH_ENCRYPTION_KEY) {
      const msg =
        'WHATSAPP_AUTH_ENCRYPTION_KEY is required outside test — session credentials cannot be sealed or opened without it';
      if (isProd) {
        logger.error(`❌ ${msg}`);
        logger.error('🛑 Exiting because NODE_ENV=production and the credential encryption key is missing.');
        process.exit(1);
      }
      logger.warn(`⚠️  ${msg} (dev mode: continuing)`);
    }
```

Leave the zod schema entry at lines 18-21 exactly as it is — the `/^[0-9a-fA-F]{64}$/` regex still does its job, and making the field non-optional there would break dev without the environment split.

Re-run: both tests PASS.

- [ ] **Step 3: Point the facade and every direct consumer at one place**

`SessionController.ts:2` and `routes/health.ts:8` import the `WhatsAppServiceSimple` singleton directly, and `routes/index.ts` does it dynamically at lines 149, 378, 659 and 915, while bootstrap goes through `WhatsAppService.ts:56`. Two entry points into one runtime is exactly how a half-cut engine survives a green test suite.

Reroute all six sites to the `WhatsAppService` facade. Then verify none remain:

```bash
cd apps/whatsapp-service
grep -rn "WhatsAppServiceSimple" src --include=*.ts
```

Expected: matches only in `src/services/WhatsAppService.ts` (which owns the delegation) and `src/services/WhatsAppServiceSimple.ts` itself. `src/routes/proactive-consent.spec.ts:64` mocks the module — update its mock path to match wherever the route now imports from.

**If any of the four line numbers in `routes/index.ts` does not hold a dynamic import of `WhatsAppServiceSimple`, stop and report what is there.**

- [ ] **Step 4: Delegate `WhatsAppServiceSimple` to Baileys**

Rewrite `WhatsAppServiceSimple` so every method that used `ConnectionManager`, `EventDispatcher`, `SessionManager` or `AuthenticationManager` delegates to `BaileysSessionManager` instead. **The public API does not change** — see *Produces* above. `createSession` keeps its `tenantId` parameter and keeps calling `persistSession` **before** the socket starts: the `whatsapp_auth_keys.session_id` foreign key points at `whatsapp_sessions(session_id)`, so Baileys' first `creds.update` fails if the parent row does not exist yet.

`shutdown()` must still route through the `'shutdown'` mode, never `'delete'`.

- [ ] **Step 5: Replace every filesystem auth check with `hasCredentials`**

Four files inspect `./wwebjs_auth` on disk. Each becomes a store query:

| File | Today | Becomes |
|---|---|---|
| `SessionRecoveryService.ts:241,252` | `require('path').resolve('./wwebjs_auth')` | `await store.hasCredentials(sessionId)` |
| `session/RecoveryRunner.ts:238` | same | same |
| `session/HealthMetrics.ts` | `authFileExists` / `authCorruptionDetected` metadata | a `hasCredentials` boolean |
| `session-health-check/HealthMetrics.ts:141-142` | `path.join(authDataPath, 'session-' + sessionId)` | same |

Public shapes may keep their names — `checkAuthFileHealth` can stay called that if its callers depend on it. What must go is every `fs` call against `wwebjs_auth`.

Confirm:

```bash
cd apps/whatsapp-service
grep -rn "wwebjs_auth" src --include=*.ts
```

Expected: **no output.**

- [ ] **Step 6: Typecheck and run the full suite**

```bash
pnpm typecheck
cd apps/whatsapp-service && pnpm run test
cd ../api && pnpm run test
```

Expected: typecheck clean, both suites green. `apps/api` must be untouched at 61 — if its count moved, the frozen webhook contract was broken.

- [ ] **Step 7: Commit**

```bash
git add apps/whatsapp-service/src
git commit -m "feat(whatsapp-service)!: run on Baileys

WhatsAppServiceSimple now delegates to BaileysSessionManager. Its public
API is unchanged, so the REST routes, the Socket.IO payloads and the
message webhook contract are all untouched.

SessionController and routes/health.ts imported the Simple singleton
directly while bootstrap went through the WhatsAppService facade, and
routes/index.ts did it dynamically in four more places. All six now go
through the facade: two entry points into one runtime is how a half-cut
engine survives a green test suite and starts two engines in production.

The four filesystem auth checks against ./wwebjs_auth become
store.hasCredentials(). Nothing reads that directory any more.

WHATSAPP_AUTH_ENCRYPTION_KEY becomes fail-fast in production, which is
what the comment in env.ts said Phase 2 would do. Without it the service
boots green and dies at the first creds.update.

This commit is not deployable on its own -- Task 8b removes the engine
it replaces. Do not cherry-pick or revert it in isolation."
```

---

## Task 8b: Purge

**Commit 2 of 2. No deploy happened between 8a and this.**

- [ ] **Step 1: Delete the dead engine**

```bash
cd apps/whatsapp-service
git rm src/config/puppeteer.config.ts \
       src/services/whatsapp-core/ConnectionManager.ts \
       src/services/whatsapp-core/EventDispatcher.ts \
       src/services/whatsapp-core/SessionManager.ts \
       src/services/whatsapp-core/SessionManager.shutdown.spec.ts \
       src/services/whatsapp-core/AuthenticationManager.ts \
       src/services/whatsapp-core/AuthenticationManager.cleanup.spec.ts \
       src/services/whatsapp-core/wwebjs-normalizer.ts \
       src/services/whatsapp-core/wwebjs-normalizer.spec.ts \
       src/services/whatsapp-core/wwebjs-reply-port.ts \
       src/services/whatsapp-core/wwebjs-reply-port.spec.ts \
       src/services/whatsapp-core/index.ts \
       src/services/session/AuthValidator.ts \
       src/utils/sessionCleanup.ts \
       src/scripts/cleanup-sessions.ts \
       utils/sessionCleanup.ts
```

`utils/sessionCleanup.ts` — note the missing `src/` — is a 295-line duplicate of the file above it, living outside the compiled tree (`tsconfig` include is `["src/**/*"]`), imported by nobody. Its existence is why `git grep SessionCleanupUtil` reads as though the module had two consumers.

`whatsapp-core/MessageHandler.ts`, `IncomingMessagePipeline.ts`, `IncomingMessagePipeline.spec.ts` and `types/messages.ts` **stay** — they became engine-neutral in Task 5.

- [ ] **Step 2: Drop the dependencies and the patch together**

- `apps/whatsapp-service/package.json`: remove `"whatsapp-web.js"` and `"puppeteer"`.
- Root `package.json`: remove the whole `pnpm.patchedDependencies` key.
- `git rm patches/whatsapp-web.js@1.34.6.patch`.
- `turbo.json`: remove `"PUPPETEER_*"` and `"CHROME_EXECUTABLE_PATH"` from `globalEnv`.
- `apps/whatsapp-service/Dockerfile`: remove `chromium` and the font/`libxss1` packages from the `apt-get install`, and the three `ENV` lines `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD`, `PUPPETEER_EXECUTABLE_PATH`, `CHROME_EXECUTABLE_PATH`.

Removing the `patchedDependencies` key while leaving the patch file — or the reverse — fails `pnpm install` with `ERR_PNPM_PATCH_NOT_APPLIED`. Both go in this commit.

Then: `pnpm install`

- [ ] **Step 3: Verify the engine is gone**

```bash
grep -rn "whatsapp-web.js\|puppeteer\|Puppeteer" apps/whatsapp-service/src apps/whatsapp-service/package.json package.json turbo.json apps/whatsapp-service/Dockerfile
```

Expected: **no output**, except possibly historical prose in `docs/`. If a source file still matches, an importer was missed — and because `tsconfig` compiles all of `src/**/*`, the build would have caught it, so check whether the file is outside `src/`.

- [ ] **Step 4: Typecheck, test, build**

```bash
pnpm typecheck
cd apps/whatsapp-service && pnpm run test
cd ../.. && pnpm build --filter=@leadcrm/api --filter=@leadcrm/whatsapp-service
```

Expected: typecheck clean, tests green, build produces `apps/whatsapp-service/dist/index.js`.

The suite shrinks by exactly **15 tests across 4 suites**, and no others:

| Deleted spec | tests |
|---|---|
| `SessionManager.shutdown.spec.ts` | 6 |
| `AuthenticationManager.cleanup.spec.ts` | 1 |
| `wwebjs-normalizer.spec.ts` | 4 |
| `wwebjs-reply-port.spec.ts` | 4 |

`SessionManager.shutdown.spec.ts` is what pinned the Phase 1 contract that a shutdown must not deactivate a session or wipe its credentials — the bug that left thirty disconnected sessions in production. That coverage does not leave with the file: Task 7's `BaileysSessionManager shutdown vs delete` block carries it forward against the new engine, and Task 9 Step 9 checks the same property in production. **Confirm those two tests exist and pass before deleting this file.**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(whatsapp-service)!: delete whatsapp-web.js, Puppeteer and the disk-auth layer

Sixteen files, the two dependencies, the patch, the patchedDependencies
key, the PUPPETEER_* entries in turbo.json and chromium in the
Dockerfile. Nothing here was reachable after the previous commit.

AuthenticationManager and AuthValidator were filesystem validators end to
end. Against a key-value credential store, 'do I have credentials for
this session' is one query, so ~650 lines of corruption detection, file
counting and size checking lost their subject. Both defects recorded in
docs/deployment/post-shutdown-fix-recovery.md go with them: the double
'session-' prefix that made cleanupCorruptedAuthFiles a silent no-op,
and the authCorruptionDetected latch that barred a session from recovery
permanently with no code path to clear it.

utils/sessionCleanup.ts -- outside src/, so never compiled, imported by
nobody -- was a 295-line duplicate of the real one.

The patch file and the patchedDependencies key are removed together:
either one without the other fails pnpm install with
ERR_PNPM_PATCH_NOT_APPLIED."
```

---

## Task 9: Preflight, deploy, smoke

The preflight runs **while `whatsapp-web.js` is still serving production**, so that anything it breaks breaks under the known engine.

**No step here is optional and none can be reordered.** The deploy order and the pre-key check both exist because of specific failure modes documented in the spec.

- [ ] **Step 1: Preflight — pin the package manager**

```bash
ssh root@46.225.26.89 'corepack enable && cd /opt/leadcrm && pnpm --version'
```

Expected: `9.0.0`. Before this, `/usr/bin/pnpm` is a globally npm-installed 10.28.1 that ignores `packageManager: pnpm@9.0.0`; pnpm 10 installs Baileys but skips its build scripts, and pnpm 11 refuses the tree outright with `ERR_PNPM_EXOTIC_SUBDEP` because `libsignal` is a git dependency.

If it still reports 10.28.1, corepack's shims are not ahead of `/usr/bin` on `PATH`. **Stop and report** — do not work around it by uninstalling the global pnpm.

- [ ] **Step 2: Preflight — the encryption key**

```bash
ssh root@46.225.26.89 \
  "grep -qE '^WHATSAPP_AUTH_ENCRYPTION_KEY=[0-9a-fA-F]{64}$' /opt/leadcrm/apps/whatsapp-service/.env \
   && echo ENCRYPTION_KEY_OK || echo MISSING"
```

If `MISSING`, generate one **and store it outside the VPS before writing it there**:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Losing this key makes every stored credential undecryptable and forces a re-pair of every session. There is deliberately no rotation tooling — see the spec. Put it in the team's password manager, then append it to the `.env`.

- [ ] **Step 3: Preflight — the git dependency resolves from the VPS**

```bash
ssh root@46.225.26.89 'git ls-remote https://github.com/whiskeysockets/libsignal-node.git HEAD'
```

Expected: a commit hash. `libsignal` is pulled from a GitHub tarball, so an install with no GitHub reachability fails **after** `git pull` has already landed the new code, with the old bundle still running.

- [ ] **Step 4: Deploy**

`leadcrm-api` goes first. The proactive-consent gate filters by `sessionId`, and the Nest webhook is what persists that `sessionId` on the inbound message; the reverse order silently drops every proactive send, counted as `failed` rather than raised as an error. Baileys does not change that.

```bash
ssh root@46.225.26.89 '
  set -e
  cd /opt/leadcrm
  git pull origin main
  pnpm install --frozen-lockfile
  pnpm build --filter=@leadcrm/api --filter=@leadcrm/whatsapp-service
  pm2 restart leadcrm-api --update-env
  pm2 restart whatsapp-service --update-env
'
```

`pnpm build` is not optional: `apps/whatsapp-service` starts from `dist/index.js`, so skipping it restarts the previous bundle while the deploy reports success. The filters are not optional either — an unfiltered build fails on the dashboard, which needs a Clerk key that only lives in Vercel.

- [ ] **Step 5: Confirm the new engine actually booted**

```bash
ssh root@46.225.26.89 'pm2 logs whatsapp-service --lines 40 --nostream'
```

Expected: `✅ Environment validated (NODE_ENV=production)` and no Chromium or Puppeteer lines at all. A `PUPPETEER_EXECUTABLE_PATH` message means the old bundle is running and the build was skipped.

- [ ] **Step 6: Pair a disposable number**

Create a session from the dashboard and scan the QR **with a disposable number** — never a pilot's, never the operator's. Bans follow sending behaviour rather than the client library, so this migration does not reduce that risk; but Baileys synthesises the protocol instead of driving a real Chrome, so its fingerprint is synthetic and the technical risk is marginally higher.

- [ ] **Step 7: The gate — pre-keys reached the database**

Immediately after pairing, through the Supabase MCP connector:

```sql
SELECT count(*) FROM whatsapp_auth_keys
WHERE category = 'pre-key' AND session_id = '<sessionId>';
```

- **29 or 30** — the initial batch was generated *and* persisted. Continue.
- **0, or fewer than 5** — the transactional insert failed during the handshake. **The cutover is not authorised.** Stop and diagnose.

This is the cheap detection for the failure that otherwise appears on day 5-10: Baileys starts with `INITIAL_PREKEY_COUNT = 30` and uploads a fresh batch below `MIN_PREKEY_COUNT = 5`. If persistence is broken, existing conversations keep working and the dashboard stays green while every *new* contact sees "Waiting for this message" on their phone — no `messages.upsert`, no AI, no fatal error in the PM2 logs.

- [ ] **Step 8: The functional smoke**

Each of these must pass:

- Inbound message → AI → row in `messages` → reply delivered.
- Outbound through the REST endpoint.
- The same message delivered twice produces exactly **one** response (Redis dedupe on `${sessionId}:${key.id}`).
- The dashboard shows the session as connected — two `session:connected` events, matching the frozen behaviour.

**Not asserted: `status = 'ready'` on connect.** The row does not reach it — `apps/api`'s `handleSessionAuthenticated` rewrites the same row to `'authenticated'` right after the local write, and only the first inbound message's health update moves it to `'ready'`. This predates Baileys and is recorded as debt in the spec. Assert instead that `connected_number` is populated after pairing, and that `status` becomes `'ready'` after the first inbound message.

- [ ] **Step 9: The regression test for Phase 1**

```bash
ssh root@46.225.26.89 'pm2 restart whatsapp-service && sleep 8 && pm2 logs whatsapp-service --lines 40 --nostream'
```

Expected: the session reconnects **with no new QR**. A `qr` in that output means credentials were purged on shutdown, and the Phase 1 Task 1 shutdown/delete separation regressed — `destroySession` is being called in `'delete'` mode from a shutdown path.

Then confirm the opposite still works: log the device out from the phone, and verify a new QR *is* required.

- [ ] **Step 10: Reclaim the disk, only after everything above is green**

```bash
ssh root@46.225.26.89 '
  du -sh /opt/leadcrm/apps/whatsapp-service/wwebjs_auth
  rm -rf /opt/leadcrm/apps/whatsapp-service/wwebjs_auth
  df -h /opt | tail -1
'
```

990 MB of Chromium profiles for thirty disconnected test sessions. **This is irreversible** — do not run it before Step 9 passes.

Then clear orphaned Redis session keys so Puppeteer-era metrics do not contaminate the new service's health reporting:

```bash
ssh root@46.225.26.89 "redis-cli --scan --pattern 'whatsapp:session:*' | head -20"
```

Inspect before deleting. Delete only keys belonging to sessions that no longer exist.

- [ ] **Step 11: Record what changed for whoever deploys next**

Update, in one commit:

- `CLAUDE.md` — the whatsapp-service section still describes `whatsapp-web.js` and Puppeteer, `pnpm whatsapp:cleanup-chrome`, and the `PUPPETEER_HEADLESS=false` dev note. All of it is now false. Add the pnpm ceiling: **this repo does not install under pnpm 11** because `libsignal` is a git dependency; the VPS is pinned to 9.0.0 through corepack.
- `docs/deployment/post-shutdown-fix-recovery.md` — its *Known issue* section describes two defects in `AuthenticationManager`, which no longer exists. Record that both were retired by deletion rather than fixed.
- `HANDOFF-BAILEYS-MIGRATION.md` — delete it. Its own header says to: *"bórralo cuando el cutover esté hecho."*
- `HANDOFF-BUMP-WAWEB.md:232` — the deploy snippet there is the old incorrect one (`pnpm install` without `--frozen-lockfile`, no build step). The document stays WONTFIX, but fix the snippet so nobody deploys from it.
- Add one sentence to the runbook: rotating `WHATSAPP_AUTH_ENCRYPTION_KEY` invalidates every stored credential and requires re-pairing every session. There is no rotation tooling, deliberately.

```bash
git add -A
git commit -m "docs: record the Baileys cutover

CLAUDE.md still described Puppeteer, Chromium and the headless dev
workflow. The post-shutdown recovery runbook still described two defects
in a file that no longer exists. The Baileys handoff asked to be deleted
once the cutover was done.

Adds the constraint the migration introduced: libsignal is a git
dependency, pnpm 11 refuses to install the tree, and the VPS is pinned
to 9.0.0 through corepack."
```

---

## Self-review notes

Three things this plan deliberately leaves as decisions rather than steps, because inventing them would be worse than asking:

1. **Reconnect backoff in `BaileysSessionManager`.** Task 7 Step 18 says a non-`loggedOut` close rebuilds the socket. How fast, how many times, and whether to give up are policy. Ask.
2. **History sync.** `syncFullHistory: false` is proposed because the pipeline would otherwise replay old conversations through the AI. If the product wants history in the database, that is a separate feature.
3. **`recipientPhone` in the Baileys normalizer.** Baileys does not put the connected number on an inbound message. Task 7 Step 4 documents the chosen behaviour and pins it with a test; the field feeds `data.to`, which `apps/api` never reads.
