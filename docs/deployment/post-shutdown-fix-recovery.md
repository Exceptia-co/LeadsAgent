# Post-shutdown-fix session recovery

Operational follow-up for the shutdown/delete separation fix (Baileys
migration foundation, Task 1). That fix stops **future** deploys from
poisoning sessions. It does **not** repair the rows already poisoned by
every deploy before it.

## What the bug was, and what the fix does

Before the fix, `shutdownAllSessions` routed every graceful shutdown
through `destroySession`, which deactivates the session in Postgres and
runs auth cleanup — the same path a deliberate `DELETE /sessions/:id`
takes. Every `pm2 restart` (i.e. every deploy) was therefore
indistinguishable from "the user deleted this session": it set
`is_active = false`, `status = 'disconnected'`, and — via a separate
"final cleanup" sweep — `metadata.autoReconnect = false` on every active
session.

The fix gives `destroySession` an explicit `mode: 'shutdown' | 'delete'`
and only deactivates + cleans up in `'delete'` mode. `shutdownAllSessions`
no longer accepts a cleanup callback at all, and its final sweep no longer
writes `autoReconnect` in either direction. From the fix onward, a restart
leaves a session's row and its `autoReconnect` decision exactly as they
were.

This is a fix to the code path, not to the data. Production already has
30 `whatsapp_sessions` rows, all `status = 'disconnected'`, with only 2
carrying `is_active = true`. Those rows do not repair themselves.

## The two latches blocking recovery

Two independent conditions in the existing recovery path currently keep
every poisoned row out of recovery, verify both by reading the code
rather than trusting this doc:

1. **`loadActiveSessions` filters on `isActive` alone**
   (`apps/whatsapp-service/src/services/SessionPersistenceService.ts:94-99`).
   A session with `is_active = false` is never handed to the recovery
   runner in the first place — it doesn't matter what else is true about
   the row.
2. **`RecoveryRunner` refuses to recover a session with
   `metadata.autoReconnect === false`**
   (`apps/whatsapp-service/src/services/session/RecoveryRunner.ts:274`).
   Even for a session that did make it past latch 1, this flag stops it
   cold with reason `'autoReconnect disabled in metadata'`.

Both latches were tripped on the same rows, by the same bug, on every
deploy since it was introduced.

## Diagnostic query — run this first

Before changing anything, see what you're dealing with per session:

```sql
SELECT
  session_id,
  status,
  is_active,
  metadata ->> 'autoReconnect' AS auto_reconnect,
  last_seen
FROM whatsapp_sessions
ORDER BY last_seen DESC;
```

Read the output before deciding anything. `auto_reconnect` will show as
the string `'false'`, the string `'true'`, or SQL `NULL` if the key was
never written for that row.

## Targeted repair — one named session at a time

**Do not run a blanket `UPDATE` across all rows.** After the fact there is
no way to tell a session that this bug deactivated from a session the
user genuinely deleted on purpose — both end up with
`is_active = false` and no distinguishing marker. A blanket update would
silently resurrect sessions the user intentionally removed.

Instead, the operator picks a specific `session_id` to revive — one they
can independently confirm should still exist — and repairs only that row:

```sql
UPDATE whatsapp_sessions
SET
  is_active = true,
  metadata = metadata - 'autoReconnect'
WHERE session_id = '<the specific session_id you have chosen to revive>';
```

`metadata - 'autoReconnect'` removes the key entirely rather than setting
it to `true`. `RecoveryRunner` only blocks when the flag is `=== false`;
an absent key and `true` behave identically for recovery purposes, and
removing the key avoids asserting a fact ("this was deliberately re-armed
for auto-reconnect") that isn't true — it was just never touched by the
bug's opposite case.

## What to expect afterwards

Once the row is repaired, the session becomes **eligible** for recovery
on the next `whatsapp-service` start — it passes both latches. Whether it
actually reconnects is a separate question and depends on the WhatsApp
auth files for that session still existing on disk. For most of these
rows they will not have survived, in which case recovery will fail
cleanly and the operator needs a fresh QR scan for that session. Treat a
successful repair as "eligible to try," not "guaranteed to reconnect."

## Known issue: the double-prefix bug is still live one function over

Task 1 fixed the double `session-` prefix in the **delete** path
(`AuthenticationManager.cleanupSessionAuth`, now calling
`SessionCleanupUtil.cleanupSession(sessionId, ...)` at
`apps/whatsapp-service/src/services/whatsapp-core/AuthenticationManager.ts:347`).
The same bug is still live in a different function two calls over:

`apps/whatsapp-service/src/services/whatsapp-core/AuthenticationManager.ts:153`
(`cleanupCorruptedAuthFiles`) passes `` `auth-${sessionId}` `` to
`SessionCleanupUtil.cleanupSession`, which prefixes the id with
`session-` itself — producing a path that never matches an existing
directory, so the deletion silently no-ops.

This is deliberately **not** fixed here. Fixing only the path would turn
a call that currently no-ops into one that actually deletes auth files —
on every `createSession` and during recovery — which is a behavior change
that deserves its own analysis, not a tack-on to this fix wave.

The other half of the same problem: regardless of whether the delete
no-ops, the caller unconditionally writes `metadata.authCorruptionDetected
= true` right after it
(`apps/whatsapp-service/src/services/whatsapp-core/AuthenticationManager.ts:145-160`).
`RecoveryRunner.ts:282` reads that flag as a **permanent** bar to
recovery — there is no code path that ever clears it. A session that
once triggered `cleanupCorruptedAuthFiles` is barred from recovery
forever, independent of the path bug. If you find a session stuck at
`'Authentication files are corrupted or invalid'` during recovery, this
is why; clearing `authCorruptionDetected` from that session's `metadata`
is a manual, per-session decision, not something this doc turns into a
recipe.

## Related

- CLAUDE.md § "Production deployment notes"
- `docs/superpowers/plans/2026-08-25-baileys-migration-foundation.md` — Task 1
