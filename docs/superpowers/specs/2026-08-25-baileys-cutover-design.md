# Baileys Migration — Phase 2: Engine Cutover (design)

**Status:** approved 2026-08-25 by the user, `codexplan` (decomposition lens) and `agyplan` (operations/risk lens), after three review rounds plus a final ratification.

**Goal:** replace `whatsapp-web.js` with `@whiskeysockets/baileys` as the runtime engine of `apps/whatsapp-service`, delete Puppeteer and everything that only existed to serve Chromium, and do it as a transport swap rather than a product rewrite.

**Predecessor:** `docs/superpowers/plans/2026-08-25-baileys-migration-foundation.md` (Phase 1, merged as PR #14, deployed). Its *"Phase 2 — scope of the follow-up plan"* section is the brief this document answers. Where the two disagree, this document wins: it was written against verified data that Phase 1 did not have.

**Decision record:** `HANDOFF-BAILEYS-MIGRATION.md`. Several of its claims were already superseded by Phase 1; two more are superseded here (see *Corrections to inherited documents*).

---

## Why the cutover is cheap right now

Phase 1 left exactly one runtime import of the outgoing library. `git grep whatsapp-web.js` over `apps/whatsapp-service/src` returns six files, and **five of them are `import type`** — declarations that vanish at compile time and carry no runtime coupling:

| File | Import | Nature |
|---|---|---|
| `whatsapp-core/ConnectionManager.ts:1` | `Client`, `LocalAuth` | **runtime** — the only one |
| `whatsapp-core/EventDispatcher.ts:1` | `type Client, Message` | type-only |
| `whatsapp-core/MessageHandler.ts:1` | `type Client, Message` | type-only |
| `whatsapp-core/SessionManager.ts:1` | `type Client` | type-only |
| `whatsapp-core/wwebjs-normalizer.ts:1` | `type Message` | type-only |
| `WhatsAppServiceSimple.ts:3` | `type Client` | type-only |

The real coupling is therefore two things: the 119 lines of `ConnectionManager` + `puppeteer.config.ts`, and the five verbs of the `transport` handle threaded through `MessageHandler`.

---

## Ground truth (verified 2026-08-25 — do not re-derive)

Checked directly against npm, the installed package, Supabase production and the Hetzner VPS. These findings are why the design looks the way it does.

### The library

| Fact | Value | Consequence |
|---|---|---|
| Last `6.7.x` release | **6.7.24**, dist-tag `legacy` | Pin it exactly. |
| `latest` dist-tag | `7.0.0-rc14` | A bare `pnpm add @whiskeysockets/baileys` installs a release candidate. The version must be explicit, and without a caret. |
| `engines.node` | `>=20.0.0` | VPS runs v20.20.0. ✓ |
| `libsignal` dependency | `git+https://github.com/whiskeysockets/libsignal-node.git`, resolved to a `codeload.github.com` tarball pinned at commit `bcea72d` | Every cold install needs git and GitHub reachability. Verified reachable from the VPS with `git ls-remote`. |
| `sharp` | peerDependency, **not** marked optional | pnpm auto-installs it: `sharp@0.35.3` plus `@img/sharp-linux-x64` and musl variants. |
| `jimp`, `audio-decode`, `link-preview-js` | optional peers | Not installed. |

### Install behaviour across pnpm versions

Probed with a throwaway package, not inferred:

| pnpm | Result |
|---|---|
| **9.0.0** — what the repo declares in `packageManager` | Installs clean. 92 packages. |
| **10.28.1** — what the VPS actually runs | Installs, but prints `Ignored build scripts: @whiskeysockets/baileys, protobufjs`. **Verified harmless**: `makeWASocket`, `initAuthCreds`, `proto.*` and `makeCacheableSignalKeyStore` all load and behave identically with the scripts skipped. |
| **11.21.0** | **Hard failure**: `ERR_PNPM_EXOTIC_SUBDEP — Exotic dependency "libsignal" (resolved via git-repository) is not allowed in subdependencies`. |

The repo declares `pnpm@9.0.0`; `/usr/bin/pnpm` on the VPS is a globally npm-installed pnpm 10.28.1, **not** a corepack shim, so it ignores `packageManager` entirely. Three pnpm versions currently resolve the same lockfile. Baileys turns that latent drift into a version ceiling.

### The credential codec

Phase 1's `SessionCredentialsStore` carries `bufferReplacer`/`bufferReviver`. Real Baileys credentials were round-tripped through them:

```
OK    noiseKey.private survives as Buffer, bytes identical
OK    signedIdentityKey.public survives as Buffer
OK    signedPreKey.signature survives as Buffer
OK    registrationId stays a number
OK    advSecretKey stays a string
OK    pre-key from Curve.generateKeyPair() round-trips whole

FAIL  app-state-sync-key does not survive as a protobuf message
```

**The mechanism is not what it looks like.** protobufjs installs its own `toJSON` on the message prototype, and `JSON.stringify` consults that *before* calling the replacer. By the time `bufferReplacer` runs, `keyData` is already a base64 string and `timestamp` is already a string. The store has no defect — a protobuf message simply never enters through that door.

`proto.Message.AppStateSyncKeyData.fromObject()` rebuilds it byte-for-byte identically (verified). **The repair belongs in the auth adapter, never in the store**, so the store stays protobuf-agnostic.

The real `SignalDataTypeMap` (`lib/Types/Auth.d.ts:63-72`) settles which categories need it:

```ts
'pre-key':                KeyPair                              // codec covers it
session:                  Uint8Array                           // codec covers it
'sender-key':             Uint8Array                           // codec covers it
'sender-key-memory':      { [jid: string]: boolean }           // plain
'app-state-sync-key':     proto.Message.IAppStateSyncKeyData   // ← the only protobuf
'app-state-sync-version': LTHashState                          // plain object, version is a number
```

Exactly one category needs `fromObject`.

### Transactionality is partly Baileys' job already

`lib/Socket/socket.js:43` wraps the store before use:

```js
const keys = addTransactionCapability(authState.keys, logger, transactionOpts)
```

with `transactionOpts = { maxCommitRetries: 10, delayBetweenTriesMs: 3000 }` (`lib/Defaults/index.js:49`). The store therefore receives **one batched flush per commit**, not a stream of individual writes, and a throwing `set()` causes Baileys to retry the whole commit up to ten times.

That is buffering, serialisation and retry — but not durability. The failure window survives: `deleteMany` commits, upsert *k* of *N* fails, Baileys sleeps 3 s, and if the process dies in that gap the in-memory buffer is lost while Postgres keeps the partial write. A consumed pre-key is gone and the session never advanced; the Signal ratchet is then irrecoverably desynchronised for that contact (`Bad MAC`). Retries are otherwise idempotent — deletes trivially, upserts by the unique index; only the ciphertext differs, because the IV is random.

**Therefore:** the whole `SignalDataSet` is flattened and written in a single `prisma.$transaction`. `BaileysAuthState.keys.set(data)` must not do `Promise.all(categories.map(store.set))`.

### Pre-key constants

`lib/Defaults/index.js:93-94`: `MIN_PREKEY_COUNT = 5`, `INITIAL_PREKEY_COUNT = 30`.

### Production

**Supabase (`yxjzsargboxnuwnbuzax`)** — `whatsapp_auth_keys` exists and matches `schema.prisma`: primary key, `FOREIGN KEY (session_id) REFERENCES whatsapp_sessions(session_id) ON DELETE CASCADE`, unique index on `(session_id, category, key_id)`, index on `(session_id, category)`. Zero rows. 30 sessions, all `disconnected`, `auth_data` null on all 30. The user has confirmed these are test sessions with nothing to preserve.

`createSession` calls `persistSession()` **before** `initializeClient()`, so the FK parent row already exists when the socket starts. Baileys must preserve that ordering: persist the session row, then load auth state, then `makeWASocket`.

**Hetzner (`46.225.26.89`)** — node v20.20.0, git 2.43.0, pnpm 10.28.1, corepack 0.34.1 present but not enabled. 16 GB free of 38. 3.0 GB RAM available. `leadcrm-api` and `whatsapp-service` online under PM2. Branch `develop` at `9c997c8`. No Hetzner backups (`backup_window: null`).

`/opt/leadcrm/apps/whatsapp-service/wwebjs_auth` is **990 MB** across ~10 session profiles. Phase 1 speculated this directory might be empty; it is not. Its contents are disposable by the user's explicit decision, and deleting it after a green smoke recovers 1 GB.

### Two pre-existing defects this design freezes rather than fixes

**`status = 'ready'` never settles on connect.** `EventDispatcher`'s `ready` handler writes `'ready'` locally through `SessionPersistenceService.updateSessionStatus`, then emits an `authenticated` webhook; `apps/api`'s `handleSessionAuthenticated` writes `status: 'authenticated'` to **the same row**. The row only reaches `'ready'` when the first inbound message triggers the pipeline's 30-second health update. This is engine-independent and predates Baileys. The Phase 1 brief proposed a `QR → ready` smoke gate, which would have measured something that does not happen; the gate is adjusted instead (see T9). Recorded as debt, not fixed — the alternative touches either `apps/api` or the Socket.IO `session:connected` contract that the separately-deployed dashboard consumes.

**`getClient(sessionId): any` is declared in three places, not two.** The Phase 1 brief named `interfaces/IWhatsAppSessionManager.ts` and `types/index.ts:604`. There is a third at `types/index.ts:118`, inside `ISessionManager`, which the second one extends — so deleting `types/index.ts:604` does not remove the escape hatch.

**`WHATSAPP_AUTH_ENCRYPTION_KEY` is `.optional()` in the env contract** (`config/env.ts:18-21`, with a correct `/^[0-9a-fA-F]{64}$/` regex) while `SessionCredentialsStore.ts:23-25` throws when it is missing. The service therefore boots green without the key and dies at the first `creds.update`. This was deliberate: `env.ts:86-90` carries a comment explaining that nothing on the Phase 1 branch reads the key yet, that exiting production boot for an unused secret would boot-loop Hetzner, and that Phase 2 is where it gets wired. T8a is that moment.

---

## Global constraints

- **The `message` webhook payload's `data` field is a frozen wire contract:** `{ id, from, to, body, timestamp, type, isGroup, fromMe }`. `apps/api/src/whatsapp/whatsapp.service.ts:134,137` reads `data.from` and `data.body`; `whatsapp.controller.ts:32` types the field as `any`. Neither app's typecheck can see a drift and the two deploy separately. `IncomingMessagePipeline` already maps the DTO back to this shape — that mapping must survive the cutover untouched.
- **REST route shapes (`routes/index.ts`) and Socket.IO payloads (`SocketService.ts`) do not change.** The dashboard is on Vercel and deploys independently.
- **The double `authenticated` emission is frozen behaviour.** `EventDispatcher.ts:142` (inside `ready`) and `:178` (inside `authenticated`) both emit an `authenticated` webhook; `SocketService.ts:265` turns each into `session:connected`. Both are `once`, both are idempotent on the API side, and they differ only in `data.number` — the first usually carries `'unknown'` because `client.info` is not populated yet. Baileys collapses eight events into one `connection.update`; the adapter must reproduce **two** emissions with that same distinction, not one and not three.
- **Response shape for all Express JSON:** `{ success: boolean, data?: T, error?: string }`.
- **Tests:** Jest, `*.spec.ts` colocated. Baseline before this phase: **104 passing in `apps/whatsapp-service` across 14 suites, 61 in `apps/api`**. Every task leaves both green.
- **Never run `prisma migrate deploy`.** Production's `_prisma_migrations` history shares no name with `packages/db/prisma/migrations`. Migrations are applied by direct SQL through the Supabase MCP connector. This phase needs no new migration.
- **Builds on the VPS use filters:** `--filter=@leadcrm/api --filter=@leadcrm/whatsapp-service`. An unfiltered `pnpm build` fails on the dashboard, which needs a Clerk key that only lives in Vercel.
- **`pnpm build` is not optional on deploy.** `apps/whatsapp-service` starts from `dist/index.js`; skipping it restarts the previous bundle while the deploy reports success.

---

## Decisions arbitrated during review

**Six tasks, two of them mergeable before Baileys exists.** T5 (reply port) and T6 (engine-neutral tidy) are refactors of code that already runs, so they reach `main` with `whatsapp-web.js` still serving production. This preserves the property that made Phase 1 work: every increment stands on its own merit, and only one commit is irreversible.

**T8 is split into two commits but deployed once.** `codexplan` argued for the split on reviewability: T8a modifies ~15 files while T8b deletes ~1500 lines, and mixing them makes both unreviewable. `agyplan` argued against it on operational risk: a half-cut engine in production, `pnpm install` still applying a patch for a dead dependency, dead modules polluting `dist/`. Both were right about different units — one about the commit, the other about the deployment. Separating them dissolves the disagreement: **T8a and T8b are two commits on one branch with no deploy between them, and T9 deploys the result of both.** Consequences written into the plan: T8a must compile and pass tests on its own so branch CI stays green, and T8a must never be deployed, cherry-picked or reverted in isolation.

**The disk-auth layer is deleted, not reimplemented.** `AuthenticationManager` (413 lines) and `session/AuthValidator` (237) are file-system validators end to end, plus scattered checks in `SessionRecoveryService`, `RecoveryRunner`, both `HealthMetrics` files and `WhatsAppServiceSimple:539`. Against a key-value store, "do I have credentials for this session" is one query. Keeping the shape and swapping the implementation would leave ~400 lines of scaffolding — corruption detection, file counts, file sizes — with no subject. Deleting the layer also retires both defects recorded in `docs/deployment/post-shutdown-fix-recovery.md` § *Known issue*: the double `session-` prefix in `cleanupCorruptedAuthFiles`, and the permanent `authCorruptionDetected` latch that bars a session from recovery forever with no code path to clear it. Neither needs a fix once neither has a subject.

**`WhatsAppEventPublisher` is extracted in T6, not T8a.** `EventDispatcher.ts:358-512` holds `sendWebhook` (Socket.IO through the facade, HMAC signing, `fetch`), `sendForceDisconnectWebhook`, `sendBrowserDisconnectWebhook`, `setWebhookUrl`, `getWebhookUrl` and `testWebhook`. T8b deletes `EventDispatcher` entirely, which would take the webhook emitter with it. The extraction is a pure engine-neutral refactor, so it ships early and keeps T8a smaller. `EventDispatcher` must delegate to it immediately rather than keeping a duplicate.

**`EventDispatcher` keeps its `import type { Message }` until T8a.** After T5 it is the engine boundary and still needs to type the `message` callback and `makeWwebjsReplyPort(message)`. Moving the adapter elsewhere would only relocate the import; replacing `Message` with a local structural interface would hide incompatibilities without removing any runtime coupling. T5's goal is that `MessageHandler.ts` and `IncomingMessagePipeline.ts` reach zero mentions — not a cosmetic zero at the boundary.

**Key rotation support is not built.** A `WHATSAPP_AUTH_ENCRYPTION_KEY_FALLBACK` plus a re-encryption CLI is the correct long-term answer and is premature at zero rows and two tenants. Rotating the key today means re-pairing, which is free with disposable sessions. The runbook states it in one sentence; no code.

---

## Architecture

### The two seams, after the cutover

```
Baileys socket                    wwebjs Client              (deleted in T8b)
      |                                  |
      v                                  v
baileys-normalizer.ts            wwebjs-normalizer.ts        (deleted in T8b)
      |                                  |
      +---------> NormalizedWhatsAppMessage <---------+
                            |
                            v
                  IncomingMessagePipeline          engine-neutral since Phase 1
                            |
                            v
              MessageHandler.processMessageWithAI(dto, port)
                            |
                            v
                        ReplyPort                  engine-neutral from T5
                       /         \
      baileys-reply-port      wwebjs-reply-port    (deleted in T8b)
```

### The reply port

The `transport` handle threaded through `MessageHandler` today uses exactly five verbs and nothing else — `transport.getChat()`, `chat.sendStateTyping()`, `chat.clearState()`, `chat.sendMessage(text)`, `transport.reply(text)`. They collapse into four:

```ts
export interface ReplyPort {
  /** Send quoting the inbound message. */
  reply(text: string): Promise<void>;
  /** Send to the same chat without quoting. */
  send(text: string): Promise<void>;
  startTyping(): Promise<void>;
  stopTyping(): Promise<void>;
}
```

A quoted reply in Baileys is `sock.sendMessage(jid, { text }, { quoted: waMessage })`, which needs the **raw** `WAMessage`. The DTO deliberately does not carry it. The port is therefore constructed at the dispatcher with the raw message captured in its closure, exactly as `makeWwebjsReplyPort` will be — the port is the only thing that ever holds a library object, and it holds it privately.

Behaviour to preserve verbatim, because it is a product decision and not an implementation detail: typing starts at handler entry (covering the whole 5-6 s LLM window, not just the send) and is cleared in a `finally`; a failure inside `sendResponseWithStrategy` falls back to `reply`.

### The auth adapter

`SessionCredentialsStore` already matches `SignalKeyStore` shape by construction. The adapter over it:

```ts
makeBaileysAuthState(sessionId): Promise<{
  state: { creds: AuthenticationCreds; keys: SignalKeyStore };
  saveCreds: () => Promise<void>;
}>
```

- `creds` is read once at construction; `initAuthCreds()` when absent. It must be a plain synchronous object — `makeWASocket` reads it at construction.
- `keys.get` / `keys.set` are `Awaitable`, so promises are fine.
- `keys.get('app-state-sync-key', …)` passes each value through `proto.Message.AppStateSyncKeyData.fromObject()`. No other category does.
- `keys.set(data)` flattens the whole `SignalDataSet` — every category, writes and `null` deletions alike — into one `prisma.$transaction`.
- `saveCreds` persists the **merged** credentials. `creds.update` is a partial patch, not a replacement; `myAppStateKeyId` in particular is assigned mid-handshake and a lost write means `KeyNotFoundError: missing app-state-sync-key` on the next boot.
- `makeCacheableSignalKeyStore(store, logger)` is called **inside per-session setup**. Its third parameter is the cache; omitted, it builds a fresh one per call, so isolation is free. Hoisting it to a module-level singleton would share one cache across every session.

---

## Tasks

### T5 — Reply port
*Mergeable to `main` with `whatsapp-web.js` still serving production.*

| File | Change |
|---|---|
| `src/types/reply-port.ts` | create — the interface. Engine-neutral; survives T8b. |
| `src/services/whatsapp-core/wwebjs-reply-port.ts` | create — `makeWwebjsReplyPort(message: Message): ReplyPort`. **Deleted in T8b.** |
| `src/services/whatsapp-core/MessageHandler.ts` | `processMessageWithAI(dto, port: ReplyPort)`; every `transport.*` call site rewritten, `sendResponseWithStrategy` included; wwebjs import dropped. |
| `src/services/whatsapp-core/IncomingMessagePipeline.ts` | generic `TTransport` removed; `handle(dto, port)`. |
| `src/services/whatsapp-core/EventDispatcher.ts` | `pipeline.handle(dto, makeWwebjsReplyPort(message))`. Keeps `import type { Message }`. |
| specs | the fake port replaces every `Message` mock. |

**Done when** `IncomingMessagePipeline.ts` contains zero mentions of `whatsapp-web.js`, and `MessageHandler.ts` no longer imports `Message`.

`MessageHandler` keeps `import type { Client }` after T5, and that is correct rather than an oversight: `sendMessage(client, sessionId, to, message, onStatusUpdate)` at `MessageHandler.ts:21` is the **outbound** path, called only from `WhatsAppServiceSimple.ts:247`, and it is a different seam from the reply port. `BaileysSessionManager` takes ownership of outbound in T8a. Promising "zero mentions" for this file in T5 would force the outbound abstraction into a task that has no reason to carry it.

### T6 — Engine-neutral tidy
*Mergeable to `main` with `whatsapp-web.js` still serving production.*

- Collapse the three `IWhatsAppSessionManager` / `ISessionManager` declarations into one and drop `getClient(sessionId): any` from all three sites — `interfaces/IWhatsAppSessionManager.ts:39`, `types/index.ts:604`, `types/index.ts:118`. Note that the two existing interfaces are not merely duplicated but *incompatible*: the `types/index.ts` one extends `ISessionManager` and its `getSessionStatus` returns a different shape.
- Extract `src/services/WhatsAppEventPublisher.ts` from `EventDispatcher.ts:358-512`. `EventDispatcher` delegates; no duplicated logic.

### T7 — Baileys, isolated and unwired
*Mergeable to `main`. The code compiles (`tsconfig` include is `["src/**/*"]`) but nothing reaches it at runtime.*

`pnpm add @whiskeysockets/baileys@6.7.24` — exact, no caret.

Built in this order, because the manager is the composition of the other three and must land last:

1. `src/services/baileys/baileys-normalizer.ts` — identical signature to `normalizeWwebjsMessage`. Returns `null` rather than a partial DTO. Two behaviours here are not portable from the wwebjs normalizer and were verified against the installed library, because both fail silently rather than loudly:

   **A LID passes the E.164 test and becomes a fake phone number.** `jidDecode('182736451827364@lid').user` returns `'182736451827364'` — fifteen digits, which `/^[1-9]\d{7,14}$/` accepts. Copying `toPhone(jid)` from the wwebjs normalizer would therefore mint a plausible-looking phone number that belongs to no one, create a `Lead` under it, and answer the wrong person. The Baileys normalizer must test `isLidUser()` and read the real number from `key.senderPn` (one-to-one) or `key.participantPn` (group) — fields that exist on `WAMessageKey` precisely for this — falling back to `key.remoteJid` / `key.participant` only when the JID is not a LID.

   **`extractMessageContent` must run before `getContentType`.** Verified: `getContentType({ ephemeralMessage: { message: { conversation: 'x' } } })` returns `'ephemeralMessage'`, and the text is lost; after `extractMessageContent` it returns `'conversation'`. Same for `viewOnceMessageV2` → `imageMessage`. Disappearing-message chats are ordinary in production, so skipping the unwrap silently drops every message from them.

   Beyond those: text lives in `conversation` / `extendedTextMessage.text` / `imageMessage.caption` / `videoMessage.caption`; `fromMe` comes from `key.fromMe`; the id is the session-scoped `${sessionId}:${key.id}`; `messageTimestamp` may be a protobuf `Long` and needs coercing to a plain number of seconds.
2. `SessionCredentialsStore` gains the multi-category transactional batch and `hasCredentials(sessionId)`; `src/services/baileys/BaileysAuthState.ts` is written on top.
3. `src/services/baileys/baileys-reply-port.ts`.
4. `src/services/baileys/BaileysSessionManager.ts` — the single runtime import of the library. Inert constructor: `makeWASocket` is called only inside `createSession`.

   Eight `whatsapp-web.js` events collapse into `connection.update`, whose payload is `Partial<ConnectionState>`: `{ connection: 'open' | 'connecting' | 'close', lastDisconnect?: { error, date }, qr?, isNewLogin? }`. The mapping to today's session states and webhooks is application logic now, and two details decide it:

   **`DisconnectReason.connectionLost` and `DisconnectReason.timedOut` are both `408`.** They are not distinguishable by code, so any branch that tries to tell them apart is wrong by construction. What matters operationally is a single split: `loggedOut` (401) means the credentials are dead — clear the store and force a fresh QR — while every other code is a reconnect.

   **`restartRequired` (515) fires on the first pairing** and is a normal step, not a failure. Treating it as a disconnect is the classic Baileys integration bug: the session pairs, immediately "fails", and never comes up.

   The two `authenticated` webhooks that Phase 1 froze must be reproduced from this single event: one when credentials first exist, carrying the number as `'unknown'`, and one on `connection: 'open'` carrying `sock.user?.id`.

Tested against a fake socket. No network, no real pairing.

### T8a — Runtime cutover
*Commit 1 of 2. Compiles and passes tests standalone. Not deployed on its own.*

| File | Change |
|---|---|
| `src/config/env.ts` | `WHATSAPP_AUTH_ENCRYPTION_KEY` required when `NODE_ENV=production`, regex preserved. Mirrors the existing `WHATSAPP_SERVICE_HMAC_SECRET` treatment: fail-fast in production, warning in dev. |
| `src/services/WhatsAppServiceSimple.ts` | delegates only to `BaileysSessionManager`; public API unchanged. |
| `src/services/WhatsAppService.ts` | facade; `createSession(sessionId, tenantId?)` keeps the tenant; exposes `getSessionHealth`. |
| `src/controllers/SessionController.ts:2` | imports the facade, not the `Simple` singleton. |
| `src/routes/index.ts:149,378,659,915` | four dynamic imports of `WhatsAppServiceSimple` rerouted. HTTP shapes preserved. |
| `src/routes/health.ts:8,174,202,212` | same. |
| `src/routes/proactive-consent.spec.ts:64` | mock follows the new import path. |
| `src/services/SessionRecoveryService.ts`, `src/services/session/RecoveryRunner.ts`, `src/services/session/HealthMetrics.ts`, `src/services/session-health-check/HealthMetrics.ts` | stop inspecting `./wwebjs_auth`; use `hasCredentials`. Public shapes may stay. |
| `src/services/baileys/BaileysSessionManager.ts` | real lifecycle, outbound, events, recovery, health, logout/delete. |

### T8b — Purge
*Commit 2 of 2. No deploy between T8a and T8b.*

Deleted — fifteen files:

```
src/config/puppeteer.config.ts
src/services/whatsapp-core/ConnectionManager.ts
src/services/whatsapp-core/EventDispatcher.ts
src/services/whatsapp-core/SessionManager.ts
src/services/whatsapp-core/SessionManager.shutdown.spec.ts
src/services/whatsapp-core/AuthenticationManager.ts
src/services/whatsapp-core/AuthenticationManager.cleanup.spec.ts
src/services/whatsapp-core/wwebjs-normalizer.ts
src/services/whatsapp-core/wwebjs-normalizer.spec.ts
src/services/whatsapp-core/wwebjs-reply-port.ts          ← created in T5
src/services/whatsapp-core/wwebjs-reply-port.spec.ts     ← created in T5
src/services/whatsapp-core/index.ts                      ← zero consumers, verified
src/services/session/AuthValidator.ts
src/utils/sessionCleanup.ts
src/scripts/cleanup-sessions.ts
```

Plus `apps/whatsapp-service/utils/sessionCleanup.ts` — a 295-line duplicate living **outside** `src/`, which `tsconfig`'s `include: ["src/**/*"]` never compiles and nobody imports. Its existence makes `git grep SessionCleanupUtil` misleading.

Modified: `apps/whatsapp-service/package.json` (drop `whatsapp-web.js`, `puppeteer`), root `package.json` (drop `patchedDependencies`), `pnpm-lock.yaml`, `turbo.json` (drop `PUPPETEER_*` from `globalEnv`), `apps/whatsapp-service/Dockerfile` (drop `chromium` and the three `PUPPETEER_*` / `CHROME_EXECUTABLE_PATH` env lines). Deleted: `patches/whatsapp-web.js@1.34.6.patch` — removing the `patchedDependencies` key while leaving the patch file, or vice versa, fails `pnpm install` with `ERR_PNPM_PATCH_NOT_APPLIED`.

**Ordering hazard:** deleting `config/puppeteer.config.ts` in T8a while `ConnectionManager.ts:3` still exists leaves an unresolvable import and breaks the build, because `tsconfig` compiles everything under `src/`. The same applies to removing the `whatsapp-web.js` dependency before all of its importers are gone in the same commit.

### T9 — Preflight, deploy, smoke

**Preflight, executed while `whatsapp-web.js` is still serving production** — so that if any of it breaks, it breaks under the known engine:

- `corepack enable` on the VPS, so `packageManager: pnpm@9.0.0` governs everywhere and the deploy stops depending on which global pnpm happens to be installed.
- Verify `WHATSAPP_AUTH_ENCRYPTION_KEY` is present and 64 hex characters in `/opt/leadcrm/apps/whatsapp-service/.env`, and that a copy exists outside the VPS. Losing this key makes every stored credential undecryptable.
- `git ls-remote` against the libsignal repository, confirming the git dependency will resolve.

**Deploy** — `leadcrm-api` first, `whatsapp-service` second. The proactive-consent gate filters by `sessionId`, and the Nest webhook is what persists that `sessionId` on the inbound message; the reverse order silently drops every proactive send, counted as `failed` rather than raised. Baileys does not change that reasoning. Build with `--filter=@leadcrm/api --filter=@leadcrm/whatsapp-service`.

**Smoke, on a disposable number** — never a pilot's number and never the operator's, because Baileys' fingerprint is synthetic and the technical ban risk is marginally higher than Chromium's:

- QR appears; pairing completes.
- **Immediately after pairing**, the cheap guard against the late failure below:
  ```sql
  SELECT count(*) FROM whatsapp_auth_keys
  WHERE category = 'pre-key' AND session_id = '<sessionId>';
  ```
  29-30 rows means the initial batch was generated *and* persisted. `0`, or fewer than 5, means the transactional insert failed during the handshake — **the cutover is not authorised**.
- Inbound → AI → database → reply.
- Outbound through REST.
- A duplicate message produces exactly one response.
- `pm2 restart whatsapp-service` reconnects **without a new QR**. A `qr` in the logs means credentials were purged on shutdown and Phase 1's Task 1 separation regressed.
- Logout does force a new QR.
- **Not asserted:** `status = 'ready'` on connect. See *Two pre-existing defects* above. Assert instead that `connected_number` is populated, and that the row reaches `'ready'` after the first inbound message.

**After a green smoke:** `rm -rf /opt/leadcrm/apps/whatsapp-service/wwebjs_auth` (990 MB) and clear orphaned Redis session keys so residual Puppeteer-era metrics do not contaminate the new service.

---

## Risks

**The one that compiles, passes tests, and does the opposite.** In T8a an implementer switches `WhatsAppService.ts:56,86` to start Baileys and leaves `SessionController.ts:2` or the four dynamic imports in `routes/index.ts` loading the legacy singleton. It compiles, mocked tests pass, and production starts Baileys at bootstrap and `whatsapp-web.js` the moment a route is touched — two real engines, while every test sees one. This is why every import site is enumerated in T8a above rather than described.

**The one that passes the smoke and appears on day 5-10.** Baileys generates 30 pre-keys at pairing and the smoke consumes one. In production each new contact consumes another; below five, Baileys uploads a fresh batch. If that upload fails and exhausts its retries, WhatsApp has no pre-keys left for the number. Existing conversations keep working and the dashboard stays green, but a new lead sees *"Waiting for this message"* on their phone — the message never reaches Baileys, never emits `messages.upsert`, never reaches the AI, and leaves no fatal error in the PM2 logs. The T9 pre-key count check catches the persistence half of this at minute one.

**Risks the migration does not reduce**, restated because they were the condition on which this migration was approved:

- *Ban risk rises slightly.* Bans follow sending behaviour, not the client library, so nothing here reduces it. But `whatsapp-web.js` drives a real Chrome and presents a genuine browser fingerprint, while Baileys synthesises the protocol. The number at stake is the client's personal one. Hence the disposable number in T9.
- *Resistance to WhatsApp-side changes gets worse.* `whatsapp-web.js` inherits WhatsApp Web's updates through the browser and largely adapts on its own; Baileys reimplements the protocol, so a server-side change breaks it outright until upstream ships a patch. Pinning `6.7.24` bounds the blast radius without removing it. Budget for an unplanned dependency bump on someone else's schedule.

**A new one, introduced here.** `libsignal` being a git dependency puts a ceiling on the project's pnpm version: pnpm 11 refuses to install this tree at all. `corepack enable` in T9's preflight pins the VPS to 9.0.0, but nothing stops a future `npm i -g pnpm@latest` from breaking the deploy with an error that never mentions Baileys. Recorded in `CLAUDE.md` and the deploy runbook.

## Rollback, stated honestly

Git restores code; it does not restore scanned session state, and the VPS has no Hetzner backups. What is worth preserving before T8:

- **The `.env` files on the VPS** — `/opt/leadcrm/apps/whatsapp-service/.env` and `/opt/leadcrm/apps/api/.env`, which hold `WHATSAPP_SERVICE_HMAC_SECRET`, `WHATSAPP_AUTH_ENCRYPTION_KEY` and the Supabase credentials.
- **Nothing else.** The 990 MB of `wwebjs_auth` are disposable by explicit decision; `whatsapp_auth_keys` has zero rows; all 30 sessions are disconnected test sessions.

Rolling the code back after T9 returns the service to `whatsapp-web.js` and requires re-pairing, which at this scale costs one QR scan.

## Out of scope

- **B3.3 multi-tenant E2E tests** — deliberately deferred past the cutover. Written against the outgoing engine they are double work.
- **C7 and C8** of `PLAN-WHATSAPP-AGENT-MULTITENANT.md` — Chromium workarounds, already marked superseded, discarded by this migration.
- **`HANDOFF-BUMP-WAWEB.md`** — closed WONTFIX. Its deploy snippet at `:232` is the old incorrect version (`pnpm install` without `--frozen-lockfile`, no build step) and gets corrected in place so nobody deploys from it, but the document stays closed.
- **Key rotation tooling** — see *Decisions arbitrated*.
- **The `status = 'ready'` overwrite** and the `T1` / `T2` message-persistence debts — recorded, untouched.

## Corrections to inherited documents

`docs/superpowers/plans/2026-08-25-baileys-migration-foundation.md`, *Phase 2* section:

1. *"that directory may well be empty — in which case there is genuinely nothing to lose"* — `wwebjs_auth` holds 990 MB across ~10 profiles. The conclusion still stands, but because the user declared the sessions disposable, not because the directory is empty.
2. *"the two live `IWhatsAppSessionManager` definitions"* — there are three declarations of `getClient(): any`; the third is inherited from `ISessionManager` at `types/index.ts:118`.
3. The `QR → ready` smoke gate measures a state the row does not reach on connect.

`HANDOFF-BAILEYS-MIGRATION.md`, *Trampas conocidas*:

4. Trap 2 says to keep LID and protobufs out of the AI and database layers — already done in Phase 1, and this design keeps it by replacing one normalizer with another of the same signature.
5. Trap 1 says not to use `useMultiFileAuthState`; the durable replacement already exists and is tested. What the handoff could not know is that a store built on `JSON.stringify` needs a protobuf exception for exactly one Signal category.
