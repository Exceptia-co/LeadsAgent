# Handoff: bump `whatsapp-web.js` 1.34.6 → 1.34.7

**Status: BLOCKED — not a drop-in patch bump.** Reviewed 2026-05-22 from Windows PowerShell session. The version pin is `^1.34.6` but the bump is gated by a local `pnpm patch` whose target API was refactored upstream in 1.34.7. Details below. Not urgent: 1.34.6 + local patch is currently the safer state than 1.34.7 without it.

This file lives at repo root: `C:\Users\admin\Desktop\LeadsAgent\HANDOFF-BUMP-WAWEB.md`. Keep it until the bump actually ships.

---

## The blocker (discovered 2026-05-22)

`pnpm-lock.yaml` and root `package.json` register a patch:

```jsonc
// package.json (root)
"pnpm": {
  "patchedDependencies": {
    "whatsapp-web.js@1.34.6": "patches/whatsapp-web.js@1.34.6.patch"
  }
}
```

The patch (`patches/whatsapp-web.js@1.34.6.patch`) fixes a race condition in `Client.js` (upstream issue #5758): if `AuthStore.AppState.hasSynced` is already `true` when the listener registers, the `change:hasSynced` event never fires and the session hangs. The patch adds a proactive check + revalidates the flag on every change.

**Why this blocks the bump:**

1. **Upstream refactored the target API in 1.34.7.** The hook moved from `window.AuthStore.AppState.on('change:hasSynced', …)` → `window.require('WAWebSocketModel').Socket.on('change:hasSynced', …)`. This aligns with the changelog item _"remove all mentions of window.Store"_ — they're decoupling from the legacy `Store` and moving to `WAWeb*` modules.
2. **The race condition is still present in 1.34.7.** Verified by fetching `https://unpkg.com/whatsapp-web.js@1.34.7/src/Client.js`: upstream still registers the listener without checking `hasSynced` first.
3. **The patch as-written will not apply.** Its diff context targets `AuthStore.AppState` lines that no longer exist in 1.34.7 → `pnpm install` will fail with `ERR_PNPM_PATCH_NOT_APPLIED`.
4. **Dropping the patch is not safe.** It would reintroduce the original race in production (silent auth-timeout hangs).

Net: this is a **30-minute manual job to regenerate the patch against 1.34.7**, not a `pnpm up && commit`. See "How to unblock" below.

---

## Why the bump is _desirable_ (but not urgent)

Patch release (semver-safe). 1.34.7 includes fixes that touch our pain points:

- **`disconnected event is not being fired`** — would harden our Socket.IO `auth_failure → AUTH_INVALID` flow (Phase 2 wiring). Note: our flow already works in prod; this is incremental robustness, not a fix for an active bug.
- **`Fix: Frozen WhatsApp Start or Auth Timeout`** — overlaps with what our local patch fixes; could mean upstream is converging toward the same fix in a different location, but as of 1.34.7 the race is still there.
- **`Fix loading_screen event`** — boot sequence; aligns with our lazy idempotent init.
- **`pass session name to store.save instead of full path`** — affects `LocalAuth` (we use it in `apps/whatsapp-service/src/config/puppeteer.config.ts`).
- **`recover ciphertext messages via PLACEHOLDER_MESSAGE_RESEND (PDO type 4)`** — would reduce ciphertext-drop scenarios on multi-device. Helps the T-debt around multi-device dedupe (CLAUDE.md "Known technical debt", to be addressed in Phase C anyway).
- **`remove all mentions of window.Store`** — internal refactor. We don't monkey-patch `window.Store` (verified: no references in `apps/whatsapp-service/src` except a diagnostic log string in `EventDispatcher.ts:168`).

Non-relevant: channels, group metadata, block/unblock, biz contacts, PDF caption, profile pic, `Event Call` (we don't handle calls).

---

## Pre-bump safety checks (verified 2026-05-22, still valid)

```powershell
# 1. sendReaction API moved to Client in 1.34.x changelog — check we don't use it
cd C:\Users\admin\Desktop\LeadsAgent
# Equivalent of repo Grep tool, used during review:
#   grep -rn "sendReaction|\.react\(" apps/whatsapp-service/src
# Result on 2026-05-22: 0 hits. Safe.

# 2. window.Store monkey-patch — would break with the internal refactor
#   grep -rn "window\.Store" apps/whatsapp-service/src
# Result: 1 hit at EventDispatcher.ts:168 — diagnostic log string, NOT a monkey-patch. Safe.
```

If somebody changes `whatsapp-service` between now and the bump, re-run both checks before proceeding.

---

## How to unblock: regenerate the patch against 1.34.7

```powershell
# 1. Pin the new version (this fails until we also rename the patch entry — fix in step 4)
cd C:\Users\admin\Desktop\LeadsAgent\apps\whatsapp-service
pnpm up whatsapp-web.js@1.34.7
```

```powershell
# 2. Use pnpm patch to get an editable copy of the 1.34.7 source
cd C:\Users\admin\Desktop\LeadsAgent
pnpm patch whatsapp-web.js@1.34.7
# pnpm prints a temp path like:
#   C:\Users\admin\AppData\Local\Temp\pnpm_patches\<hash>\node_modules\whatsapp-web.js
```

```text
3. In that temp path, open src/Client.js. Find the equivalent block (search for
   "change:hasSynced"). In 1.34.7 it looks like:

       window.require('WAWebSocketModel').Socket.on('change:hasSynced', () => {
           window.onAppStateHasSyncedEvent();
       });

   Replace with the proactive-check pattern from our 1.34.6 patch, adapted to
   the new module:

       const Socket = window.require('WAWebSocketModel').Socket;
       if (Socket.hasSynced) {
           window.onAppStateHasSyncedEvent();
       }
       Socket.on('change:hasSynced', (_, hasSynced) => {
           if (hasSynced) {
               window.onAppStateHasSyncedEvent();
           }
       });

   Caveat: confirm in DevTools that `Socket.hasSynced` is the right property
   on the new `WAWebSocketModel.Socket` object. The 1.34.6 version exposed it
   on `AuthStore.AppState.hasSynced`. If the new Socket model uses a different
   name (e.g. `synced`, `isSynced`), adapt accordingly — there's no guarantee
   the property survived the refactor.
```

```powershell
# 4. Commit the patch
pnpm patch-commit <temp path printed by step 2>
# This:
#   - writes patches/whatsapp-web.js@1.34.7.patch
#   - removes the old patches/whatsapp-web.js@1.34.6.patch
#   - updates root package.json: patchedDependencies key becomes
#     "whatsapp-web.js@1.34.7": "patches/whatsapp-web.js@1.34.7.patch"
#   - regenerates pnpm-lock.yaml

# 5. Confirm new version + patch applied
pnpm list whatsapp-web.js
# Expect: whatsapp-web.js 1.34.7 (with "patched" annotation)
```

```powershell
# 6. Typecheck + unit tests
pnpm --filter @leadcrm/whatsapp-service typecheck
pnpm --filter @leadcrm/whatsapp-service test
# Expected: 21/21 pass (per CLAUDE.md "Test suite status").
```

---

## Smoke test (after the patch is regenerated)

WSL note: production runs Linux. Windows smoke is a sanity check, not a prod gate (Puppeteer Chrome path differs).

```powershell
# Headless so manual interaction doesn't kill the JS context
$env:PUPPETEER_HEADLESS = "true"

docker compose up -d
pnpm dev
```

In a second window:

1. WhatsApp service boots: `Environment validated (NODE_ENV=development)` + QR served.
2. Scan QR with a test device.
3. Send inbound message → log shows `[DEDUPE] Checking msgId=…` + lead created/updated.
4. **The critical regression check for the patch**: kill the WhatsApp Web session from the phone ("Log out from this device"). Service must emit `disconnected` → Socket.IO propagates `AUTH_INVALID` → dashboard refreshes QR widget. Before our patch, this could hang silently.
5. **The critical regression check for the bump**: cold-boot the service twice in a row. On the second boot, if `hasSynced` is already true when the listener registers, with the proactive check the session should still come up. Without our patch (or with a broken-port patch), the second boot can hang on "Authenticating…" indefinitely. Wait at least 60s; if it hangs, the patch port is wrong — see step 3 of "How to unblock".

If all 5 pass: ship it.

---

## Commit (only after smoke passes)

Files touched: `apps/whatsapp-service/package.json`, `package.json` (root, `patchedDependencies` key renamed), `pnpm-lock.yaml`, `patches/whatsapp-web.js@1.34.6.patch` (deleted), `patches/whatsapp-web.js@1.34.7.patch` (new).

Conventional Commits:

```text
chore(whatsapp-service): bump whatsapp-web.js 1.34.6 -> 1.34.7

Patch release. Notable upstream fixes for our pain points:
- disconnected event now fires reliably (hardens Phase 2 auth_failure flow)
- frozen start / auth timeout fix
- loading_screen event fix
- LocalAuth store.save path bug
- PLACEHOLDER_MESSAGE_RESEND (PDO type 4) recovers ciphertext drops

Local race-condition patch (issue #5758) regenerated against 1.34.7
because upstream refactored AuthStore.AppState -> WAWebSocketModel.Socket
("remove all mentions of window.Store" changelog item). The race is still
present upstream in 1.34.7 — patch is still needed.

No API surface changed in our code path (no sendReaction usage,
no window.Store monkey-patching). 21/21 unit tests pass.
```

Recommend a dedicated branch `chore/wweb-bump-1.34.7` (not piggyback on
`feat/b2.0-tenant-scope-defense`) because the bump is isolated and easy to
roll back if a prod regression shows up.

---

## Rollback

```powershell
# If not yet committed:
cd C:\Users\admin\Desktop\LeadsAgent
git checkout -- apps/whatsapp-service/package.json package.json pnpm-lock.yaml patches/
pnpm install   # restores the 1.34.6 patch state

# If already committed:
git revert HEAD
```

---

## After ship

Delete this file:

```powershell
Remove-Item C:\Users\admin\Desktop\LeadsAgent\HANDOFF-BUMP-WAWEB.md
```

Production deploy follows the manual Hetzner flow in `CLAUDE.md` "Production deployment notes":

```bash
ssh root@46.225.26.89 '
  set -e
  cd /opt/leadcrm
  git pull origin main
  pnpm install
  pm2 restart all --update-env
'
```

Verify on prod: `pm2 logs whatsapp-service --lines 50` shows `Environment validated (NODE_ENV=production)` and the test session reconnects via LocalAuth. **Critical**: watch the first 2-3 minutes of logs after restart for any `PATCH_NOT_APPLIED` warning — if it shows up, the patch didn't propagate cleanly to the prod node_modules and the race is unguarded.

---

## Open follow-ups (not part of this bump)

- WSL/Windows store split — long-term: migrate repo to `~/leadcrm` (ext4) inside WSL for faster IO and prod parity. Out of scope here.
- Baileys / wppconnect engine evaluation — discussed but vetoed for now. No concrete pain signal that justifies engine swap.
- OpenWA (`rmyndharis/OpenWA`) as a reference for webhook HMAC + storage abstraction patterns — bookmark, not a dependency.
- Upstream issue #5758 — if upstream ever lands a proactive `hasSynced` check, we can drop the local patch entirely. Worth re-checking when 1.35.x lands.
