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
- **The `message` webhook payload's `data` field is a frozen wire contract:** `{ id, from, to, body, timestamp, type, isGroup, fromMe }`. `apps/api/src/whatsapp/whatsapp.controller.ts:33` types it as `any` and `whatsapp.service.ts:135,138` reads `data.from` and `data.body`, so no typecheck on either side can see a drift, and the two apps deploy separately. `IncomingMessagePipeline` already maps the DTO back to this shape. **Do not touch that mapping.**
- **Do not change REST route shapes** (`apps/whatsapp-service/src/routes/index.ts`) **or Socket.IO payloads** (`SocketService.ts`). The dashboard is deployed separately on Vercel.
- **Two `authenticated` webhooks per session lifecycle is frozen behaviour.** `EventDispatcher.ts:142` (inside `ready`) and `:178` (inside `authenticated`) both emit one; `SocketService.ts:275` turns each into `session:connected` via `emitSessionConnected` (declared at `:214`). Reproduce exactly two — not one, not three.
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
- Modify: `apps/whatsapp-service/src/services/whatsapp-core/IncomingMessagePipeline.ts` — the `<TTransport>` generic at its three declaration sites (interface at 12, class at 36, `handle` at 42) and the forwarding call at 77
- Modify: `apps/whatsapp-service/src/services/whatsapp-core/IncomingMessagePipeline.spec.ts:41,44,65,74,87,107,117,118,133,141,151,157,160`
- Modify: `apps/whatsapp-service/src/services/whatsapp-core/EventDispatcher.ts:42-44,75,321`

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
- Line 75 becomes `const pipeline = new IncomingMessagePipeline({` — the `<Message>` type argument goes. Replace the two-line comment above it with: `// The pipeline is engine-agnostic. Message only appears below, where this` / `// dispatcher wraps it in a ReplyPort.`
- Line 321 becomes `await pipeline.handle(dto, makeWwebjsReplyPort(message));`

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
- Modify: `apps/whatsapp-service/src/services/whatsapp-core/EventDispatcher.ts:355-509` — the six methods only. The class closes at 510 and `export default` follows; taking either leaves the file without a class.

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

In `apps/whatsapp-service/src/types/index.ts`, delete two declarations **by symbol, not by line range** — the ranges below are where they sit today and are given only to help you find them:

- `export interface ISessionManager { … }`, declaration at line 108, together with its doc comment above.
- `export interface IWhatsAppSessionManager extends ISessionManager { … }`, declaration at line 602, together with its doc comment above.

Do not take the `/** Message Processing */` separator that follows the first one — it belongs to `IMessageProcessor`, which stays.

- [ ] **Step 3: Drop `getClient` from the live interface**

In `apps/whatsapp-service/src/interfaces/IWhatsAppSessionManager.ts`, delete exactly this block and nothing more — it is lines 38-41 today:

```ts
  /**
   * Get WhatsApp client for session
   */
  getClient(sessionId: string): any;
```

**Do not start the cut at line 36.** Line 36 is `  } | null>;`, the closing of `getSessionStatus`'s return type; taking it breaks the interface in a way that reads as a missing brace rather than an over-eager delete.

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
    //
    // "signed string equals sent string" alone is not enough -- `const body =
    // '{}'` satisfies it and delivers nothing. The payload has to be pinned
    // as well, or the test proves only internal consistency.
    const input = payload();
    await new WhatsAppEventPublisher(URL).sendWebhook(input as any);

    expect(mockSignServiceRequest).toHaveBeenCalledTimes(1);
    const signedBody = mockSignServiceRequest.mock.calls[0][0];
    expect(signedBody).toBe(JSON.stringify(input));
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

Create `apps/whatsapp-service/src/services/WhatsAppEventPublisher.ts` by **moving** — not rewriting — `sendWebhook`, `sendForceDisconnectWebhook`, `sendBrowserDisconnectWebhook`, `setWebhookUrl`, `getWebhookUrl` and `testWebhook` out of `EventDispatcher.ts:355-509`.

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
  - `BaileysSessionManager` — full public surface declared in Step 18.

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

- [ ] **Step 1b: Write the logger adapter Baileys requires**

`makeWASocket` and `makeCacheableSignalKeyStore` both demand a `ILogger`, and this repo's logger does not satisfy it — not by a little:

```ts
// what Baileys requires (lib/Utils/logger.d.ts)
interface ILogger {
  level: string;
  child(obj: Record<string, unknown>): ILogger;
  trace(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;   // (obj, msg)
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

// what src/utils/logger.ts exports
{ info, error, warn, debug, verbose }        // (message: string, meta?: any)
```

`level`, `child` and `trace` are missing, and **the argument order is inverted**. Passing our logger fails the typecheck; casting past it would make every Baileys log line record the object as its message and the message as metadata.

Create `apps/whatsapp-service/src/services/baileys/baileys-logger.ts`:

```ts
import { logger } from '../../utils/logger';
import type { ILogger } from '@whiskeysockets/baileys';

/**
 * Baileys' ILogger over this repo's winston logger.
 *
 * Two incompatibilities, not one: ILogger needs `level`, `child` and `trace`,
 * and its methods take (obj, msg) where ours take (message, meta). Casting
 * instead of adapting would compile and then log every Baileys line with the
 * object where the message should be.
 */
export function makeBaileysLogger(bindings: Record<string, unknown> = {}): ILogger {
  const prefix = Object.entries(bindings)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(' ');
  const line = (obj: unknown, msg?: string): [string, unknown] => {
    // Baileys calls both log(obj, msg) and log(msg). Normalize to our shape.
    const text = msg ?? (typeof obj === 'string' ? obj : '');
    const meta = msg === undefined && typeof obj === 'string' ? undefined : obj;
    return [prefix ? `[baileys ${prefix}] ${text}` : `[baileys] ${text}`, meta];
  };

  return {
    level: process.env.LOG_LEVEL || 'info',
    child: (obj: Record<string, unknown>) => makeBaileysLogger({ ...bindings, ...obj }),
    // Baileys' trace is extremely chatty (every binary node). Map it to debug
    // so LOG_LEVEL still governs it and it never reaches production logs.
    trace: (obj, msg) => logger.debug(...(line(obj, msg) as [string, any])),
    debug: (obj, msg) => logger.debug(...(line(obj, msg) as [string, any])),
    info: (obj, msg) => logger.info(...(line(obj, msg) as [string, any])),
    warn: (obj, msg) => logger.warn(...(line(obj, msg) as [string, any])),
    error: (obj, msg) => logger.error(...(line(obj, msg) as [string, any])),
  };
}
```

Add to `apps/whatsapp-service/src/services/baileys/baileys-logger.spec.ts`:

```ts
import { makeBaileysLogger } from './baileys-logger';

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { logger } from '../../utils/logger';

describe('makeBaileysLogger', () => {
  it('puts_the_message_first_and_the_object_second', () => {
    // The whole reason this adapter exists. Baileys calls info(obj, msg);
    // our logger is info(message, meta). Forwarding the arguments unchanged
    // compiles and logs "[object Object]" for every line Baileys emits.
    makeBaileysLogger().info({ sessionId: 's1' }, 'socket opened');

    expect(logger.info).toHaveBeenCalledWith('[baileys] socket opened', { sessionId: 's1' });
  });

  it('handles_the_single_argument_form', () => {
    makeBaileysLogger().warn('just a string');

    expect(logger.warn).toHaveBeenCalledWith('[baileys] just a string', undefined);
  });

  it('child_carries_its_bindings_into_the_message', () => {
    makeBaileysLogger({ class: 'baileys' }).child({ sessionId: 's1' }).info({}, 'x');

    expect(logger.info).toHaveBeenCalledWith('[baileys class=baileys sessionId=s1] x', {});
  });
});
```

Run it: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "baileys-logger"` — expect PASS, 3 tests.

Every `makeWASocket` and `makeCacheableSignalKeyStore` call in this task uses `makeBaileysLogger({ sessionId })`, never `logger` directly.

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

    // toStrictEqual on the complete `where`, not objectContaining: dropping
    // `keyId: { in: keyIds }` would delete every key in the category and an
    // objectContaining assertion would still pass, which is the opposite of
    // what a test named "scopes the delete" is for.
    const wheres = txMock.whatsAppAuthKey.deleteMany.mock.calls.map((c: any[]) => c[0].where);
    expect(wheres).toStrictEqual([
      { sessionId: 's1', category: 'pre-key', keyId: { in: ['1'] } },
      { sessionId: 's1', category: 'session', keyId: { in: ['1'] } },
    ]);
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

    // The class matters, not only the bytes: decoding the base64 by hand into
    // a plain object would satisfy a keyData-only assertion while handing
    // Baileys something that is not a protobuf message.
    expect(read.k1).toBeInstanceOf(proto.Message.AppStateSyncKeyData);
    expect(Buffer.from(read.k1!.keyData as Uint8Array)).toEqual(Buffer.from(original.keyData));
    expect(read.k1!.fingerprint!.deviceIndexes).toEqual([0, 1]);
    expect(read.k1!.timestamp!.toString()).toBe('1756000000000');
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

    // Assert the payload, not just its key names. An adapter that forwarded
    // the right categories with their values emptied -- or that dropped the
    // nulls, which are the deletions -- would satisfy a keys-only assertion
    // and lose every pre-key deletion silently.
    expect(store.setBatch).toHaveBeenCalledTimes(1);
    expect(store.set).not.toHaveBeenCalled();
    expect(store.setBatch.mock.calls[0][0]).toBe('s1');
    expect(store.setBatch.mock.calls[0][1]).toStrictEqual({
      'pre-key': { '1': null },
      session: { 'a.0': Buffer.from([9]) },
    });
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
    const read = await state.keys.get('session', ['missing']);

    // toStrictEqual, not toEqual: Jest's toEqual ignores properties whose
    // value is undefined, so `{ missing: undefined }` would pass -- and that
    // is precisely the distinction this test claims to make. Baileys checks
    // key presence, so an explicit undefined is not the same as absence.
    expect(read).toStrictEqual({});
    expect(read).not.toHaveProperty('missing');
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
const mockMakeCacheableSignalKeyStore = jest.fn();

jest.mock('@whiskeysockets/baileys', () => {
  const actual = jest.requireActual('@whiskeysockets/baileys');
  return {
    ...actual,
    __esModule: true,
    default: (...args: unknown[]) => mockMakeWASocket(...args),
    makeWASocket: (...args: unknown[]) => mockMakeWASocket(...args),
    makeCacheableSignalKeyStore: (...args: unknown[]) =>
      mockMakeCacheableSignalKeyStore(...args),
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
  // Each call returns a distinct wrapper, mirroring the real function's
  // per-call cache.
  mockMakeCacheableSignalKeyStore.mockImplementation((keys: unknown) => ({ wrapped: keys }));
  store = { hasCredentials: jest.fn().mockResolvedValue(false), clear: jest.fn() };
  publisher = { sendWebhook: jest.fn().mockResolvedValue(undefined) };
  sessionStatus = jest.fn().mockResolvedValue(undefined);
  pipeline = { handle: jest.fn().mockResolvedValue(undefined) };
});

let sessionDisconnect: jest.Mock;

function makeManager() {
  sessionDisconnect = jest.fn().mockResolvedValue(undefined);
  return new BaileysSessionManager({
    store,
    publisher,
    pipeline,
    updateSessionStatus: sessionStatus,
    handleSessionDisconnect: sessionDisconnect,
    // Deterministic jitter. The production default is Math.random; pinning it
    // to 0 here is what lets the backoff test advance to an exact
    // millisecond. Without the injection, "2 s with jitter" and
    // advanceTimersByTime(2000) contradict each other and the test is either
    // flaky or meaningless.
    jitter: () => 0,
  });
}

describe('BaileysSessionManager construction', () => {
  it('opens_no_socket_until_createSession_is_called', async () => {
    // Task 7 lands this class in main while whatsapp-web.js is still serving
    // production. A makeWASocket at module scope, or in the constructor,
    // would connect to WhatsApp the moment anything imports the file --
    // turning "compiled but unreachable" into a second live engine.
    makeManager();

    expect(mockMakeWASocket).not.toHaveBeenCalled();
    expect(mockMakeBaileysAuthState).not.toHaveBeenCalled();
  });

  it('wraps_every_session_in_its_own_cacheable_key_store', async () => {
    // makeCacheableSignalKeyStore builds a fresh cache per call when no cache
    // is passed. Hoisting the call to module scope -- the obvious way to
    // "avoid rebuilding it" -- would share one cache across every session and
    // cross two tenants' Signal keys in memory.
    //
    // Comparing the two `auth.keys` for inequality is not enough: passing
    // `{ ...state.keys }` gives two distinct objects without calling the
    // wrapper at all. The mock is what proves the wrapper ran.
    const manager = makeManager();
    await manager.createSession('tenant-a');
    await manager.createSession('tenant-b');

    expect(mockMakeCacheableSignalKeyStore).toHaveBeenCalledTimes(2);
    // No shared cache argument -- the third parameter must stay unset so each
    // call builds its own.
    expect(mockMakeCacheableSignalKeyStore.mock.calls[0][2]).toBeUndefined();
    const keysA = mockMakeWASocket.mock.calls[0][0].auth.keys;
    const keysB = mockMakeWASocket.mock.calls[1][0].auth.keys;
    expect(keysA).not.toBe(keysB);
  });

  it('passes_the_configuration_the_cutover_depends_on', async () => {
    // syncFullHistory would replay old conversations through the AI and
    // answer them; printQRInTerminal would dump QR codes into production
    // logs. Neither has a test anywhere else.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    expect(mockMakeWASocket).toHaveBeenCalledTimes(1);
    expect(mockMakeWASocket.mock.calls[0][0]).toMatchObject({
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });
  });

  it('returns_the_provider_message_id_from_an_outbound_send', async () => {
    // WhatsAppServiceSimple.sendMessage's response shape is a published REST
    // contract that the dashboard reads. A send that works but returns no
    // messageId breaks the caller without failing anything here otherwise.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    const result = await manager.sendMessage(SESSION_ID, '34600111222', 'hola');

    expect(sock.sendMessage).toHaveBeenCalledWith('34600111222@s.whatsapp.net', { text: 'hola' });
    expect(result).toMatchObject({ success: true, messageId: 'OUT1' });
  });
});

describe('BaileysSessionManager connection lifecycle', () => {
  it('emits_exactly_two_authenticated_webhooks_per_successful_pairing', async () => {
    // Phase 1 froze this: EventDispatcher emitted one from `authenticated`
    // with the number unknown, and one from `ready` with the real number.
    // SocketService turns each into session:connected. Baileys collapses both
    // sources into connection.update, so emitting one would drop a dashboard
    // notification and emitting three would duplicate it.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    // Three creds.update events, not one. Baileys emits this repeatedly
    // during a single handshake -- keys rotate, myAppStateKeyId arrives, the
    // account record fills in. An implementation that emits `authenticated`
    // on every creds.update satisfies a test that fires the event once, and
    // then floods the dashboard with session:connected in production.
    sock.emit('creds.update', {});
    sock.emit('creds.update', { myAppStateKeyId: 'AAAA' });
    sock.emit('creds.update', { account: {} });
    sock.emit('connection.update', { connection: 'open' });
    await Promise.resolve();

    const authEvents = publisher.sendWebhook.mock.calls
      .map((c: any[]) => c[0])
      .filter((p: any) => p.event === 'authenticated');
    expect(authEvents).toHaveLength(2);
    expect(authEvents[0].data.number).toBe('unknown');
    expect(authEvents[1].data.number).toBe('34600111222');
  });

  it('does_not_emit_a_third_authenticated_when_the_connection_reopens', async () => {
    // The mirror case. `open` fires again after every reconnect, and Phase 1's
    // contract is two per session lifecycle -- not two per connection.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    sock.emit('creds.update', {});
    sock.emit('connection.update', { connection: 'open' });
    sock.emit('connection.update', { connection: 'open' });
    await Promise.resolve();

    const authEvents = publisher.sendWebhook.mock.calls
      .map((c: any[]) => c[0])
      .filter((p: any) => p.event === 'authenticated');
    expect(authEvents).toHaveLength(2);
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

  it('backs_off_between_reconnects_and_gives_up_after_five', async () => {
    // Baileys does not reconnect on its own. A close handler that calls
    // createSession() directly is an unthrottled loop against WhatsApp's
    // servers -- deleting the delay is a one-line change, and the cost of it
    // is the exact risk this migration was approved on the promise of not
    // making worse.
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    mockMakeWASocket.mockClear();

    const close = () =>
      sock.emit('connection.update', {
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
      });

    // Assert on both sides of every rung. Advancing straight to the total
    // would pass for any shorter delay -- including zero -- which is exactly
    // the regression the schedule exists to prevent.
    let expected = 0;
    for (const rung of [2000, 5000, 10000, 30000, 60000]) {
      close();
      await jest.advanceTimersByTimeAsync(rung - 1);
      expect(mockMakeWASocket).toHaveBeenCalledTimes(expected);   // not yet
      await jest.advanceTimersByTimeAsync(1);
      expect(mockMakeWASocket).toHaveBeenCalledTimes(++expected); // now
    }

    // Sixth close: the five-attempt budget is spent, the session gives up.
    close();
    await jest.advanceTimersByTimeAsync(120000);
    expect(mockMakeWASocket).toHaveBeenCalledTimes(5);
    expect(sessionStatus).toHaveBeenCalledWith(SESSION_ID, 'disconnected', expect.anything());

    jest.useRealTimers();
  });

  it('schedules_only_one_retry_when_close_fires_twice_for_one_disconnect', async () => {
    // A single disconnect can emit connection:'close' more than once -- the
    // socket emits it, and end() during teardown emits it again. Scheduling
    // per event instead of per session leaves two timers racing to rebuild
    // the same session, which ends with two live sockets and every inbound
    // message delivered twice.
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    mockMakeWASocket.mockClear();

    const close = () =>
      sock.emit('connection.update', {
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
      });
    close();
    close();
    await jest.advanceTimersByTimeAsync(10000);

    expect(mockMakeWASocket).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('resets_the_backoff_budget_after_a_successful_connection', async () => {
    // Without the reset, a session that reconnects fine five times over a
    // month is permanently out of retries on the sixth blip -- and nothing
    // logs why.
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    mockMakeWASocket.mockClear();

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
    });
    await jest.advanceTimersByTimeAsync(2000);
    sock.emit('connection.update', { connection: 'open' });
    await Promise.resolve();

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
    });
    // Back to the first rung, not the second.
    await jest.advanceTimersByTimeAsync(2000);
    expect(mockMakeWASocket).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
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

    // The full payload, not objectContaining: a webhook carrying the right
    // QR under the wrong sessionId routes a working pairing code to another
    // tenant's dashboard, and objectContaining would let it through.
    expect(sessionStatus).toHaveBeenCalledWith(SESSION_ID, 'connecting', { qrCode: 'QR-PAYLOAD' });
    expect(publisher.sendWebhook).toHaveBeenCalledTimes(1);
    const sent = publisher.sendWebhook.mock.calls[0][0];
    expect(sent.event).toBe('qr_updated');
    expect(sent.sessionId).toBe(SESSION_ID);
    expect(sent.data).toStrictEqual({ qrCode: 'QR-PAYLOAD' });
  });
});

describe('BaileysSessionManager observable state', () => {
  it('moves_the_session_through_the_states_the_dashboard_reads', async () => {
    // Without this, a manager whose createSession returns {} and never
    // updates anything passes every other test in this file. The dashboard
    // reads these values; "compiles and emits webhooks" is not the contract.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    expect(manager.getSession(SESSION_ID)!.status).toBe('connecting');

    sock.emit('connection.update', { qr: 'QR-PAYLOAD' });
    await Promise.resolve();
    expect(manager.getSession(SESSION_ID)!.qrCode).toBe('QR-PAYLOAD');

    sock.emit('connection.update', { connection: 'open' });
    await Promise.resolve();
    expect(manager.getSession(SESSION_ID)!.status).toBe('ready');
    expect(manager.getSession(SESSION_ID)!.connectedNumber).toBe('34600111222');
    expect(manager.isSessionReady(SESSION_ID)).toBe(true);
  });

  it('reports_health_in_the_shape_the_rest_route_already_publishes', async () => {
    // { status, hasLocalAuth, heartbeatAge?, authInvalidated? } is a
    // published response body. Returning { hasCredentials, connected }
    // instead compiles and breaks the consumer silently.
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    store.hasCredentials.mockResolvedValue(true);

    const health = await manager.getSessionHealth(SESSION_ID);

    expect(Object.keys(health).sort()).toEqual(
      ['authInvalidated', 'hasLocalAuth', 'heartbeatAge', 'status'].filter(k =>
        Object.prototype.hasOwnProperty.call(health, k)
      )
    );
    expect(health.status).toBe('connecting');
    expect(health.hasLocalAuth).toBe(true);
    expect(store.hasCredentials).toHaveBeenCalledWith(SESSION_ID);
  });

  it('reports_the_disconnect_upstream_on_every_close_that_is_not_a_restart', async () => {
    // handleSessionDisconnect is injected so the persisted row and its
    // reconnectCount keep being maintained. A manager that never calls it
    // drops that bookkeeping and nothing else in this file notices.
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.restartRequired } } },
    });
    await Promise.resolve();
    expect(sessionDisconnect).not.toHaveBeenCalled();

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
    });
    await Promise.resolve();
    expect(sessionDisconnect).toHaveBeenCalledWith(
      SESSION_ID, 'WHATSAPP_DISCONNECT', expect.anything()
    );

    sessionDisconnect.mockClear();
    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.loggedOut } } },
    });
    await Promise.resolve();
    expect(sessionDisconnect).toHaveBeenCalledWith(
      SESSION_ID, 'WHATSAPP_LOGGED_OUT', expect.anything()
    );

    jest.useRealTimers();
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
    // The port is the second argument and nothing downstream can answer
    // without it. Omitting it entirely leaves a DTO-only assertion green and
    // produces a bot that receives every message and replies to none.
    const port = pipeline.handle.mock.calls[0][1];
    expect(typeof port?.reply).toBe('function');
    expect(typeof port?.send).toBe('function');
    expect(typeof port?.startTyping).toBe('function');
    expect(typeof port?.stopTyping).toBe('function');
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

  it('shutdownAll_closes_every_session_in_shutdown_mode', async () => {
    // This is the path a pm2 restart actually takes. Testing destroySession
    // directly leaves shutdownAll -- the only caller in production -- with no
    // coverage at all, which is where the Phase 1 bug lived.
    const manager = makeManager();
    await manager.createSession('a');
    await manager.createSession('b');
    const spy = jest.spyOn(manager, 'destroySession');

    await manager.shutdownAll();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls.map(c => c[1])).toEqual(['shutdown', 'shutdown']);
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('cancels_a_pending_reconnect_when_the_session_is_destroyed', async () => {
    // A timer sleeping through a 60s rung outlives the session it belongs to.
    // Without the clearTimeout, deleting a session leaves a callback that
    // fires half a minute later and opens a socket for a session that no
    // longer exists, using credentials destroySession already cleared.
    jest.useFakeTimers();
    const manager = makeManager();
    await manager.createSession(SESSION_ID);
    mockMakeWASocket.mockClear();

    sock.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.connectionLost } } },
    });
    await manager.destroySession(SESSION_ID, 'delete');
    await jest.advanceTimersByTimeAsync(120000);

    expect(mockMakeWASocket).not.toHaveBeenCalled();
    jest.useRealTimers();
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

**The public surface, in full.** `WhatsAppServiceSimple` delegates to this class in Task 8a without changing its own API, so every method that survives there needs a counterpart here. Declare all of it before implementing any of it:

```ts
class BaileysSessionManager {
  constructor(deps: {
    store: SessionCredentialsStore;
    publisher: WhatsAppEventPublisher;
    pipeline: IncomingMessagePipeline;
    updateSessionStatus(sessionId: string, status: string, data?: unknown): Promise<void>;
    handleSessionDisconnect(sessionId: string, type: string, reason?: unknown): Promise<void>;
    /** Extra milliseconds added to each backoff rung. Defaults to Math.random() * 1000. */
    jitter?: () => number;
  });

  createSession(sessionId: string, tenantId?: string): Promise<WhatsAppSession>;
  getSession(sessionId: string): WhatsAppSession | null;          // in-memory, sync
  getAllSessions(): Promise<WhatsAppSession[]>;
  isSessionReady(sessionId: string): boolean;
  sendMessage(sessionId: string, to: string, text: string): Promise<SendMessageResponse>;
  destroySession(sessionId: string, mode: 'shutdown' | 'delete'): Promise<void>;
  shutdownAll(): Promise<void>;                                    // every session, 'shutdown' mode
  forceDisconnect(sessionId: string): Promise<void>;
  getSessionHealth(sessionId: string): Promise<{
    status: string;
    hasLocalAuth: boolean;          // ← name preserved, source changed
    heartbeatAge?: number;
    authInvalidated?: boolean;
  }>;
}
```

**`getSessionHealth` keeps its published shape.** `WhatsAppServiceSimple.getSessionHealth` returns `{ status, hasLocalAuth, heartbeatAge?, authInvalidated? }` today and a REST route serves it. Returning `{ hasCredentials, connected }` instead would compile and break the consumer silently. **`hasLocalAuth` keeps its name and changes its source**: it becomes `await store.hasCredentials(sessionId)`. The name is now slightly wrong — the auth is not local any more — and renaming it is a dashboard change that does not belong in this task. `heartbeatAge` still comes from the Redis heartbeat key and `authInvalidated` still from the session's own status and metadata; neither had anything to do with Chromium.

**Who owns `WhatsAppSession`, and what it looks like.** This class owns the in-memory `Map<sessionId, WhatsAppSession>` and the `Map<sessionId, WASocket>`; `WhatsAppServiceSimple` keeps neither after Task 8a. Persistence stays where it is — `SessionPersistenceService` through the injected `updateSessionStatus` — so this class never imports Prisma.

`createSession` seeds the entry the way `SessionManager.createSessionObject` does today, and the entry then moves through observable states. Returning an empty object and leaving the status at `connecting` forever would compile and pass every other test in this task, so `getSession` is asserted directly:

| After | `getSession(id)!.status` |
|---|---|
| `createSession` | `'connecting'` |
| a `qr` in `connection.update` | `'connecting'`, with `qrCode` set |
| `connection: 'open'` | `'ready'`, with `connectedNumber` set |
| a non-`loggedOut` close, retry pending | `'connecting'` |
| the retry budget exhausted | `'disconnected'` |
| `loggedOut` | `'disconnected'` |
| between `sockets.delete` and `sockets.set` during a rebuild | **not** `'ready'` |

**`destroySession` has two callers with different intent.** `WhatsAppServiceSimple.destroySession(sessionId)` is the public REST delete and maps to `'delete'`; `shutdown()` maps to `'shutdown'`. Task 8a must not let the mode default — an omitted argument is how the Phase 1 bug returns.

Requirements the tests above pin, restated so they are not inferred from the test file:

- The constructor is **inert**. It stores its dependencies and nothing else. `makeWASocket` is called only from `createSession`, so importing this module can never open a socket.
- `createSession(sessionId, tenantId?)` builds the auth state through `makeBaileysAuthState`, calls `makeWASocket({ auth: { creds, keys: makeCacheableSignalKeyStore(state.keys, logger) }, logger, printQRInTerminal: false, browser: Browsers.ubuntu('Chrome'), syncFullHistory: false, markOnlineOnConnect: false })`, keeps the socket in a per-session `Map`, and wires the three event handlers.
- **`makeCacheableSignalKeyStore` is called here, per session.** Its third parameter is the cache; omitted, it builds a fresh one per call. Hoisting it to a module-level constant would share one cache across every session and cross tenants' Signal keys.
- `ev.on('creds.update', saveCreds)` — and the first time credentials exist, emit the first `authenticated` webhook with `data: { number: 'unknown' }`.
- `ev.on('connection.update', …)` handles, in this order: `qr` present → status `connecting` + `qr_updated` webhook; `connection === 'open'` → status `ready` + the second `authenticated` webhook with the number from `jidDecode(sock.user.id).user`; `connection === 'close'` → read `(lastDisconnect?.error as Boom)?.output?.statusCode`, and if it is `DisconnectReason.loggedOut` clear the store and emit `disconnected`, otherwise rebuild the socket.
- `ev.on('messages.upsert', …)` ignores `type !== 'notify'`, drops `status@broadcast` by JID, normalizes, and forwards `(dto, makeBaileysReplyPort(sock, message))` to the pipeline.
- **Rebuilding a socket means tearing the old one down first, in exactly this order:**

  ```
  ev.off(the three listeners)  →  sock.end(undefined)  →  sockets.delete(sessionId)
    →  makeWASocket(...)  →  sockets.set(sessionId, next)  →  next.ev.on(the three listeners)
  ```

  The `Map` is cleared before the new socket exists and populated after — it cannot be "replaced" in one step, because there is nothing to replace it with until `makeWASocket` returns. Between the `delete` and the `set`, `getSession` must not claim the session is ready.

  A reconnect that leaves the old emitter subscribed keeps a live listener on a dead socket, and any event it still delivers is processed a second time — the same inbound message reaching the pipeline twice under two different socket objects. Redis dedupe hides that (same `${sessionId}:${key.id}`), which is exactly why it would survive the smoke and surface later, once the 300-second window has expired, as duplicate replies.
- **`handleSessionDisconnect(sessionId, type, reason)` is called on every close that is not `restartRequired`,** before the backoff timer is scheduled, with `type` set to `'WHATSAPP_LOGGED_OUT'` for 401 and `'WHATSAPP_DISCONNECT'` otherwise. It is injected precisely so the persisted session row and its `reconnectCount` keep being updated the way they are today; an implementation that never calls it drops that bookkeeping silently and no test in this plan would notice.
- `sendMessage(sessionId, to, text)` for the outbound REST path, returning the same `SendMessageResponse` shape `MessageHandler.sendMessage` returns today, including the `messageId`.
- `destroySession(sessionId, mode: 'shutdown' | 'delete')` — **`'shutdown'` must not clear credentials.** This is the Phase 1 Task 1 contract; breaking it reintroduces the bug that logged every session out on every deploy.
- **Reconnect backoff, exactly this schedule.** Baileys does not reconnect on its own — rebuilding the socket is the application's job, and a naive `connection: 'close'` → `createSession()` is an unthrottled loop against WhatsApp's servers. Ban risk follows sending behaviour, and this migration was approved on the understanding that it does not make that risk worse; a reconnect storm would.

  | Close reason | Action |
  |---|---|
  | `restartRequired` (515) | Reconnect **immediately**. It fires on first pairing and is a normal step. |
  | `loggedOut` (401) | Do not reconnect. Clear the store, emit `disconnected`, wait for a fresh QR. |
  | anything else | Exponential backoff with jitter: **2 s, 5 s, 10 s, 30 s, 60 s**, capped at 60 s, **maximum 5 consecutive attempts**, then mark the session `disconnected` and stop. |

  The counter resets on a successful `connection: 'open'`. The jitter matters because every session on the box would otherwise retry in lockstep after a network blip and arrive as one burst.

  **At most one pending retry per session, and it is always cancellable.** Keep the `setTimeout` handle in a `Map<sessionId, NodeJS.Timeout>`; before scheduling, `clearTimeout` whatever is already there. `connection: 'close'` can arrive more than once for a single disconnect — the socket emits it, and `end()` during teardown can emit it again — and scheduling per event rather than per session gives two timers racing to rebuild the same socket, which produces two live sockets for one session and every inbound message delivered twice.

  `clearTimeout` also runs in `destroySession` (both modes), `forceDisconnect` and `shutdownAll`. A timer sleeping through a 60-second rung outlives the session it belongs to: the operator deletes a session, the callback fires half a minute later, and `makeWASocket` opens a socket for a session that no longer exists — using credentials `destroySession(id, 'delete')` has already cleared. During shutdown it is worse: a pending timer keeps the event loop alive and reconnects on the way out, so the process both fails to exit and re-pairs while exiting.

  **Use a deterministic jitter source.** Take it from an injectable function defaulting to `Math.random`, so the tests can pin the schedule. A schedule that cannot be asserted is a schedule nobody will notice regressing.

  **How a session with unusable credentials gets out.** With the Chromium-era cleanup retired, nothing wipes credentials automatically any more, so this is the recovery path and it needs to work: Baileys exhausts the five attempts, the session lands in `disconnected`, and the operator deletes it from the dashboard. That goes through `destroySession(id, 'delete')` → `store.clear(sessionId)` → a fresh QR. No manual database access, and no heuristic deciding on its own that credentials are bad.

**Stop and ask before inventing anything this list does not cover.** Presence handling on reconnect and history-sync policy beyond `syncFullHistory: false` are decisions, not details.

- [ ] **Step 19: Run the test to verify it passes**

Run: `cd apps/whatsapp-service && pnpm run test -- --testPathPattern "BaileysSessionManager"`

Expected: PASS, every `it(` in the four `describe` blocks — construction, connection lifecycle, inbound messages, shutdown vs delete.

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

Expected: typecheck clean, and the suite count grown by exactly the specs this plan added — **21 suites**, up from the 14 baseline:

| Task | Spec file | new suite? |
|---|---|---|
| 5 | `whatsapp-core/wwebjs-reply-port.spec.ts` | yes |
| 6 | `WhatsAppEventPublisher.spec.ts` | yes |
| 7 | `baileys/baileys-logger.spec.ts` | yes |
| 7 | `baileys/baileys-normalizer.spec.ts` | yes |
| 7 | `baileys/BaileysAuthState.spec.ts` | yes |
| 7 | `baileys/baileys-reply-port.spec.ts` | yes |
| 7 | `baileys/BaileysSessionManager.spec.ts` | yes |
| 7 | `session-credentials/SessionCredentialsStore.spec.ts` | no — existing file, more cases |

**Count the `it(` blocks in the specs you actually wrote and compare against the run**, rather than against a total written here: the test bodies in this plan were revised during review and an arithmetic total in a document is the first thing to go stale. What matters is that every number is accounted for — a suite that reports fewer tests than its file contains means Jest skipped something, and a run with more means a spec was duplicated.

Baseline for the comparison is 104 tests across 14 suites, from before Task 5.

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
- Create: `apps/whatsapp-service/src/config/env.spec.ts`
- Create: `apps/whatsapp-service/src/services/WhatsAppServiceSimple.cutover.spec.ts`
- Modify: `apps/whatsapp-service/src/services/WhatsAppServiceSimple.ts`
- Modify: `apps/whatsapp-service/src/services/WhatsAppService.ts:1,47,56`
- Modify: `apps/whatsapp-service/src/controllers/SessionController.ts:2`
- Modify: `apps/whatsapp-service/src/routes/index.ts:149,378,659,915`
- Modify: `apps/whatsapp-service/src/routes/health.ts:8,174,202,212`
- Modify: `apps/whatsapp-service/src/routes/proactive-consent.spec.ts:64`
- Modify: `apps/whatsapp-service/src/services/SessionRecoveryService.ts:101,239,250`
- Modify: `apps/whatsapp-service/src/services/session/RecoveryRunner.ts:236,267,284,295`
- Modify: `apps/whatsapp-service/src/services/session/HealthMetrics.ts`
- Modify: `apps/whatsapp-service/src/services/session-health-check/HealthMetrics.ts:141-142`
- Modify: `apps/whatsapp-service/src/services/whatsapp-core/MessageHandler.ts:1,21-106` — **delete `sendMessage(client, …)` and the last `whatsapp-web.js` import**
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
import { logger } from '../utils/logger';

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
  // "did not exit" is satisfied by a validateEnv that does nothing at all.
  // The positive assertion on the warning is what makes this discriminate.
  const exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  process.env.NODE_ENV = 'development';
  process.env.WHATSAPP_SERVICE_HMAC_SECRET = 'a'.repeat(64);
  delete process.env.WHATSAPP_AUTH_ENCRYPTION_KEY;

  validateEnv();

  expect(exit).not.toHaveBeenCalled();
  expect(logger.warn).toHaveBeenCalledWith(
    expect.stringContaining('WHATSAPP_AUTH_ENCRYPTION_KEY')
  );
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

- [ ] **Step 4b: Take the outbound path off `MessageHandler`**

Task 5 deliberately left `import type { Client }` in `MessageHandler.ts` because `sendMessage(client, sessionId, to, message, onStatusUpdate)` at lines 21-106 is the outbound path and belongs to a different seam. **This is that seam.** `BaileysSessionManager.sendMessage(sessionId, to, text)` replaces it, so the method and the import go here — Task 8b removes the `whatsapp-web.js` dependency, and a surviving `import type { Client }` would break the build.

- Delete `MessageHandler.sendMessage` and line 1's import entirely.
- Its only caller is `WhatsAppServiceSimple.ts:247`, which Step 4 already rerouted to `BaileysSessionManager`.
- `normalizePhoneNumber` is used by the deleted method — check whether anything else calls it before removing it. If nothing does, it goes too; if something does, keep it.

Verify:

```bash
cd apps/whatsapp-service
grep -n "whatsapp-web.js" src/services/whatsapp-core/MessageHandler.ts
```

Expected: **no output.** `MessageHandler` is now fully engine-neutral, which is what Task 8b's commit message claims about it.

- [ ] **Step 5: Retire the disk-auth policy — do not port it**

**Read this whole step before editing anything.** The obvious reading — "swap each `./wwebjs_auth` path for a store call" — is wrong, and wrong in a way that either does nothing or destroys credentials.

`AuthValidator` has **seven** consumer call sites across two files, and they are not all the same kind of thing:

| Site | What it actually is |
|---|---|
| `SessionRecoveryService.ts:101` `validateAllAuthFiles` | a **read**: counts and validates auth directories |
| `SessionRecoveryService.ts:239` `cleanupCorruptedAuth` | a **delete** |
| `SessionRecoveryService.ts:250` `cleanupCorruptedAuth` | a **delete** |
| `RecoveryRunner.ts:236` `cleanupCorruptedAuth` | a **delete**, gated on a matched error string |
| `RecoveryRunner.ts:267` `isSessionClosedByUser` | a **string match** on `lastError` — no filesystem at all |
| `RecoveryRunner.ts:284` `isAuthCorruptionError` | a **string match** — no filesystem at all |
| `RecoveryRunner.ts:295` `isRecentManualDisconnect` | a **timestamp comparison** — no filesystem at all |

Three deletes, one read, three heuristics that never touched the disk. Task 8b removes `AuthValidator`, so **all seven must be resolved here or Task 8b will not compile.**

**The deletes do not become `hasCredentials`.** That would replace a destructive operation with a query and silently turn the cleanup into a no-op — the code would look migrated and do nothing.

**Nor do they become `store.clear(sessionId)`.** Look at what gates `RecoveryRunner.ts:232`:

```ts
const isAuthError =
  lastError.message.includes('auth') ||
  lastError.message.includes('QR') ||
  lastError.message.includes('authentication');
if (isAuthError && options.cleanupCorruptedAuth) { … }
```

That is a Chromium-era heuristic: it existed because a half-written `wwebjs_auth` directory was a real and common failure, and matching an error substring was the cheapest way to detect it. Wiring it to `store.clear()` means **any transient error whose message happens to contain "auth" wipes a working session's Signal credentials and forces a re-pair.** With durable, transactional, encrypted rows in Postgres, the condition it was guarding no longer exists.

**So: delete the policy rather than port it.**

- Remove the three `cleanupCorruptedAuth` call sites and the `options.cleanupCorruptedAuth` flag entirely. Credentials are cleared in exactly one place from now on: `BaileysSessionManager` on `DisconnectReason.loggedOut`, and `destroySession(id, 'delete')`. Nothing else may call `store.clear`.
- Replace `validateAllAuthFiles` (`SessionRecoveryService.ts:101`) with `store.hasCredentials(sessionId)` per session — it is the only one of the seven that really was a read.
- The three string/timestamp heuristics move as-is into `RecoveryRunner` (or a small private helper), minus their `AuthValidator` import. They are unrelated to storage, and rewriting them is not this task's job. `isAuthCorruptionError` in particular now only decides whether to *retry*, never whether to *delete*.

Then the two `HealthMetrics` files:

| File | Today | Becomes |
|---|---|---|
| `session/HealthMetrics.ts` | `authFileExists` / `authCorruptionDetected` metadata | a `hasCredentials` boolean |
| `session-health-check/HealthMetrics.ts:141-142` | `path.join(authDataPath, 'session-' + sessionId)` | `store.hasCredentials(sessionId)` |

Public shapes may keep their names — `checkAuthFileHealth` can stay called that if its callers depend on it.

**A thrown `hasCredentials` is not an answer of `false`.** This moves "can this session reconnect?" from the local filesystem onto Postgres, which puts Supabase on the startup path of every session. `hasCredentials` propagates a database error rather than swallowing it, and every caller must keep it that way: a pooler timeout during boot means *unknown*, not *no credentials*. A caller that catches it into `false` marks a healthy session `auth_failure` and demands a QR that was never needed — and since the credentials are still in the database, the operator sees a session that "lost its pairing" for no visible reason. On a database error, leave the session `connecting` and let the next recovery pass retry.

- [ ] **Step 5b: Verify the cleanup policy really is gone**

```bash
cd apps/whatsapp-service
grep -rn "cleanupCorruptedAuth\|validateAllAuthFiles\|authCorruptionDetected" src
grep -rn "\.clear(" src/services/session src/services/SessionRecoveryService.ts
```

Expected: no `cleanupCorruptedAuth`, no `validateAllAuthFiles`. No `store.clear` anywhere under recovery — the only two callers in the whole codebase are in `BaileysSessionManager`.

```bash
grep -rn "wwebjs_auth" src --include=*.ts | grep -v "whatsapp-core/\|session/AuthValidator.ts"
```

Expected: **no output.** The exclusions are deliberate: `ConnectionManager`, `AuthenticationManager` and `AuthValidator` still exist until Task 8b and still contain the string. An unqualified grep cannot return zero here, and a step that demands the impossible teaches the executor to ignore its gates.

- [ ] **Step 5c: Pin the three invariants the delegation could silently drop**

The delegation in Step 4 rewires a class with fifteen public methods. Three of its behaviours are invisible in the diff, break nothing at compile time, and have no test anywhere. Add `apps/whatsapp-service/src/services/WhatsAppServiceSimple.cutover.spec.ts`:

```ts
describe('WhatsAppServiceSimple delegation invariants', () => {
  it('persists_the_session_row_before_the_socket_is_created', async () => {
    // whatsapp_auth_keys.session_id is a foreign key onto
    // whatsapp_sessions(session_id), and Baileys writes creds during the
    // handshake. Creating the socket first means the very first creds.update
    // fails on a constraint violation -- during pairing, where it reads as
    // "the QR did not work".
    const order: string[] = [];
    mockSaveSession.mockImplementation(async () => { order.push('persist'); });
    mockCreateSession.mockImplementation(async () => { order.push('socket'); return {} as any; });

    await service.createSession('s1', 'tenant-1');

    expect(order).toEqual(['persist', 'socket']);
  });

  it('carries_the_tenant_id_into_the_persisted_row', async () => {
    // PR5a-bis binds tenantId on first create. Dropping the argument during
    // the rewrite produces sessions with tenant_id NULL, which apps/api then
    // refuses to process -- every inbound message logged and discarded.
    //
    // Assert on saveSession's payload object, not on positional arguments:
    // persistSession's fourth parameter is authFileInfo, which disappears
    // with the auth layer, and expect.anything() does not match undefined.
    await service.createSession('s1', 'tenant-1');

    expect(mockSaveSession).toHaveBeenCalledTimes(1);
    expect(mockSaveSession.mock.calls[0][0]).toMatchObject({
      sessionId: 's1',
      tenantId: 'tenant-1',
    });
  });

  it('routes_shutdown_through_shutdownAll_and_delete_through_destroySession', async () => {
    // The Phase 1 bug in one line: shutdown() reaching a delete path is what
    // deactivated every session on every deploy. shutdownAll is the declared
    // entry point for it -- asserting destroySession here instead would pass
    // for an implementation that bypasses the interface.
    await service.shutdown();
    expect(mockShutdownAll).toHaveBeenCalledTimes(1);
    expect(mockDestroySession).not.toHaveBeenCalled();

    await service.destroySession('s1');
    expect(mockDestroySession).toHaveBeenCalledWith('s1', 'delete');
  });
});
```

Build the mocks against the seams Step 4 actually left: `mockSaveSession` is `SessionPersistenceService.saveSession`, and `mockCreateSession` / `mockDestroySession` / `mockShutdownAll` are `BaileysSessionManager`'s methods. **If the shape of the class after Step 4 makes any of these three untestable, that is a finding about Step 4, not about the test — stop and say so.**

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

The Chromium-era auth-cleanup policy is retired rather than ported.
Three of AuthValidator's seven call sites were deletes, not checks, and
one fired on lastError.message.includes('auth') -- a heuristic that
existed because a half-written wwebjs_auth directory was a common
failure. Against durable transactional rows in Postgres it has no
subject, and wiring it to store.clear() would have wiped a working
session's Signal credentials on any transient error containing the word.
Credentials are now cleared in exactly two places, both in
BaileysSessionManager: DisconnectReason.loggedOut, and an explicit
delete. The one site that really was a read becomes hasCredentials().

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

- [ ] **Step 2b: Clean up the four references the deletions do not reach**

Deleting the engine's files leaves four mentions behind, verified against `main`. Three are stale comments and one is a dead type member:

| Site | What it is | Do |
|---|---|---|
| `src/index.ts:14` | comment: *"cada sesión = 1 Chromium; si whatsapp-web.js dispara un error…"* | rewrite for Baileys — the reasoning about staying alive on `uncaughtException` still holds, the Chromium premise does not |
| `src/config/redis.ts:365` | comment: *"Cubre casi todos los re-emits de whatsapp-web.js…"* | say "del transporte" instead |
| `src/config/redis.spec.ts:6` | comment listing what the test avoids mocking | drop the two names |
| `src/types/index.ts:89` | `WhatsAppConfig.puppeteerOptions` | **delete the member.** Verified: `puppeteerOptions` has no reader anywhere in `apps/whatsapp-service` or `apps/api` — it is the last piece of Chromium in the type system |

- [ ] **Step 3: Verify the engine is gone**

```bash
grep -rn "whatsapp-web\|puppeteer\|Puppeteer" apps/whatsapp-service/src apps/whatsapp-service/package.json package.json turbo.json apps/whatsapp-service/Dockerfile
```

Expected: **no output.**

This gate only becomes achievable after Step 2b. Before it, four matches survive that no file deletion touches — which is why they get their own step rather than being left for this grep to discover. `docs/` is deliberately outside the search: historical prose there is a record, not a leak.

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
ssh root@46.225.26.89 'corepack enable && cd /opt/leadcrm && which pnpm && pnpm --version'
```

Expected: `/usr/local/bin/pnpm` and `9.0.0`.

Before this, `/usr/bin/pnpm` is a symlink to a globally npm-installed pnpm 10.28.1 which ignores `packageManager: pnpm@9.0.0` because it is not a corepack shim. pnpm 10 installs Baileys but skips its build scripts; pnpm 11 refuses the tree outright with `ERR_PNPM_EXOTIC_SUBDEP` because `libsignal` is a git dependency.

Root's `PATH` on this VPS is `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:…` — verified — so `/usr/local/bin`, where corepack writes its shims, wins over `/usr/bin`, and nothing lives there yet to collide with. If `which pnpm` still reports `/usr/bin/pnpm`, activate the version explicitly:

```bash
ssh root@46.225.26.89 'corepack prepare pnpm@9.0.0 --activate && which pnpm && pnpm --version'
```

**Do not work around this by uninstalling the global pnpm.** If neither form yields 9.0.0, stop and report.

- [ ] **Step 1b: Preflight — prove the new package manager installs the *current* tree**

```bash
ssh root@46.225.26.89 'cd /opt/leadcrm && pnpm install --frozen-lockfile'
```

Expected: success, no lockfile modification, no `ERR_PNPM_*`.

This runs with `whatsapp-web.js` still installed and still serving traffic. Its whole purpose is to separate two changes that would otherwise land together: the package manager changed in Step 1, and the engine changes in Step 4. Without this, a corepack problem surfaces only after `git pull` has already put the new code on disk, and the failure looks like "Baileys broke the deploy" when it is nothing of the sort.

If the lockfile comes back modified, `--frozen-lockfile` would have failed in Step 4 — stop and find out why before continuing.

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
- **0, or fewer than 5** — the transactional insert failed during the handshake. **The cutover is not authorised.** Abort with Step 8b below.

This is the cheap detection for the failure that otherwise appears on day 5-10: Baileys starts with `INITIAL_PREKEY_COUNT = 30` and uploads a fresh batch below `MIN_PREKEY_COUNT = 5`. If persistence is broken, existing conversations keep working and the dashboard stays green while every *new* contact sees "Waiting for this message" on their phone — no `messages.upsert`, no AI, no fatal error in the PM2 logs.

- [ ] **Step 8: The functional smoke**

Each of these must pass:

- Inbound message → AI → row in `messages` → reply delivered.
- Outbound through the REST endpoint.
- The dedupe primitive is live. You cannot make WhatsApp redeliver the same provider message id on demand, so do not try to stage a duplicate by hand — the behaviour is already pinned by `IncomingMessagePipeline.spec.ts`'s `deduplicates_same_message_id_before_authorization_ai_and_webhook`. What that unit test *cannot* prove is that the key is really being written in production under the session-scoped shape. Check that directly, right after an inbound message:

  ```bash
  ssh root@46.225.26.89 "redis-cli -p 6379 --scan --pattern 'whatsapp:dedup:*' | head"
  ```

  Expected: at least one key of the form `whatsapp:dedup:<sessionId>:<providerMessageId>`. A key missing the `<sessionId>:` prefix means the normalizer is not scoping the id, and two tenants receiving the same provider id would suppress each other's messages.
- The dashboard shows the session as connected — two `session:connected` events, matching the frozen behaviour.

**Not asserted: `status = 'ready'` on connect.** The row does not reach it — `apps/api`'s `handleSessionAuthenticated` rewrites the same row to `'authenticated'` right after the local write, and only the first inbound message's health update moves it to `'ready'`. This predates Baileys and is recorded as debt in the spec. Assert instead that `connected_number` is populated after pairing, and that `status` becomes `'ready'` after the first inbound message.

- [ ] **Step 8b: The abort procedure — read this before Step 7, not after it fails**

If the pre-key gate (Step 7) or any part of Step 8 fails, go back to the previous release rather than debugging in production:

```bash
ssh root@46.225.26.89 '
  set -e
  cd /opt/leadcrm
  git log --oneline -5                       # identify the pre-cutover commit
  git checkout <the commit before Task 8a>
  pnpm install --frozen-lockfile
  pnpm build --filter=@leadcrm/api --filter=@leadcrm/whatsapp-service
  pm2 restart leadcrm-api --update-env
  pm2 restart whatsapp-service --update-env
'
```

**What this restores and what it does not.** The code goes back and `whatsapp-web.js` runs again — `wwebjs_auth` is still on disk at this point, which is exactly why Step 10 comes last. What does not come back is the Baileys session you just paired: it lives in `whatsapp_auth_keys`, the old engine cannot read it, and re-attempting the cutover means scanning a fresh QR. That costs nothing here because the number is disposable, and it is the whole reason Step 6 insists on one.

Leave the `whatsapp_auth_keys` rows in place while diagnosing — they are the evidence. Clear them with `DELETE FROM whatsapp_auth_keys WHERE session_id = '<sessionId>'` only when starting a clean retry.

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

- [ ] **Step 10b: Watch the first days**

The pre-key gate in Step 7 proves persistence worked at pairing. It cannot prove the *replenishment* path works, because that only runs once the stock falls below `MIN_PREKEY_COUNT = 5` — days later, under real traffic. Check at 24 hours and again at a week:

```bash
ssh root@46.225.26.89 'pm2 logs whatsapp-service --lines 400 --nostream | grep -iE "connection.update|Bad MAC|PreKey|401|loggedOut|Decrypt"'
```

And the same count as the gate, which should stay at or above 5:

```sql
SELECT category, count(*) FROM whatsapp_auth_keys
WHERE session_id = '<sessionId>' GROUP BY category ORDER BY category;
```

A `pre-key` count that has fallen to zero and stayed there is the day-5-to-10 failure arriving: existing conversations keep working and the dashboard stays green while every *new* contact silently never reaches the service.

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

**Reconnect backoff was an open question and is now closed.** It was going to be left to the implementer; the operations review pushed back, correctly. Baileys does not reconnect on its own, so a close handler that rebuilds the socket directly is an unthrottled retry loop against WhatsApp — and this migration was approved on the explicit understanding that it does not raise ban risk. A decision that can only be made wrong in one direction is not a decision worth deferring. The schedule is specified in Task 7 Step 18 and pinned by two tests.

Two things remain deliberately open, because inventing them would be worse than asking:

1. **History sync beyond the flag.** `syncFullHistory: false` is settled — the pipeline would otherwise replay old conversations through the AI and answer them. What is *not* settled is whether the product wants historical messages in the database at all. That is a feature, not a cutover detail.
2. **`recipientPhone` in the Baileys normalizer.** Baileys does not put the connected number on an inbound message; the wwebjs behaviour cannot be mirrored without threading the socket into the normalizer and breaking its signature. Task 7 Step 4 documents the choice and pins it with a test. The field feeds `data.to` on the frozen webhook, which `apps/api` never reads — so this is low stakes, but it is a choice rather than a fact.

Also worth stating plainly: **Task 7 Step 18 is the only step in this plan that specifies requirements instead of showing code.** `BaileysSessionManager` is the composition of the other three pieces, and writing its lifecycle here — before the interfaces it composes exist in the repository — is precisely how a plan invents code that does not fit. The tests in Step 16 are the contract; the requirement list is what they are testing. If the two ever disagree, the tests are right.
