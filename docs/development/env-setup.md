# Environment setup — quickstart for new devs

This monorepo uses 4 different env files. This document tells you what
goes where so you can onboard a new machine in under 10 minutes.

> The files marked `*.example` are tracked in git; the un-suffixed ones
> are gitignored and contain real credentials. **Never commit a real
> credential to git.** Always copy from `*.example` and fill in.

```
.env                      ← gitignored. Local dev. Read by every service via dotenv.
.env.example              ← tracked. Template for `.env`. Copy to `.env` and fill in.
.env.production           ← gitignored. Production reference (mirror of Hetzner /opt/leadcrm/.env).
.env.production.example   ← tracked. Template for prod deploy. Used as Hetzner deploy reference.
apps/dashboard/.env.local ← gitignored. Next.js reads ONLY this for local dev. Keep in sync with root `.env` for the dashboard-relevant subset.
```

**Where each surface reads from at runtime:**

| Surface | env file in code | notes |
|---|---|---|
| Local dev whatsapp-service | root `.env` (dotenv.config in `apps/whatsapp-service/src/index.ts`) | Turborepo runs each app in its own dir but dotenv falls back to root |
| Local dev API (Nest) | root `.env` (`ConfigModule.forRoot({envFilePath: [cwd/.env, ../../.env]})`) | works regardless of CWD |
| Local dev dashboard (Next) | `apps/dashboard/.env.local` | Next convention; root `.env` is **not** read |
| Production whatsapp-service (Hetzner) | `/opt/leadcrm/apps/whatsapp-service/.env` (PM2) | per-app overlay over root |
| Production API (Hetzner) | `/opt/leadcrm/apps/api/.env` | per-app overlay |
| Production dashboard (Vercel) | Vercel Environment Variables panel | not files; managed at vercel.com |

---

## Quickstart: brand-new clone

```bash
git clone <repo>
cd LeadsAgent
pnpm install        # postinstall runs prisma generate
docker compose up -d   # Redis on :6381 (only Docker dep — DB is Supabase cloud)

# Root .env (read by api + whatsapp-service)
cp .env.example .env
# Fill in:
#   DATABASE_URL / DIRECT_URL   ← Supabase project (Settings > Database > Connection string)
#   CLERK_SECRET_KEY            ← Clerk dashboard > API Keys (use sk_test_ for dev)
#   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ← idem (pk_test_ for dev)
#   CLERK_WEBHOOK_SECRET        ← Clerk dashboard > Webhooks (or whsec_dev_placeholder for first run)
#   WHATSAPP_SERVICE_HMAC_SECRET ← node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
#   OPENROUTER_API_KEY          ← openrouter.ai dashboard
#   SNAPSHOT_ENCRYPTION_KEY     ← node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Dashboard .env.local (Next.js doesn't read root .env)
cp .env.example apps/dashboard/.env.local
# Same Clerk and Supabase values; can mirror root .env

pnpm db:generate    # generates Prisma client (also runs via postinstall, but explicit is safer)
pnpm dev            # starts dashboard:3001, api:3003, whatsapp-service:3002
```

Visit http://localhost:3001 → sign in with Clerk → /select-org → /dashboard.

---

## Per-variable reference (what each var does and where to get it)

### Database (Supabase Postgres)

| Var | Source | Notes |
|---|---|---|
| `DATABASE_URL` | Supabase Dashboard > Settings > Database > Connection string > Transaction pooler (port 6543) | App reads/writes go through this. Includes `?pgbouncer=true` |
| `DIRECT_URL` | Supabase Dashboard > Settings > Database > Connection string > Direct connection (port 5432) | Used by `prisma migrate` only. Bypasses the pooler so DDL works. |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Public, safe to ship to client. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard > Settings > API > anon public | Public, safe to ship. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard > Settings > API > service_role | **Secret. Never ship to client.** Used for server-side admin ops only. |

### Authentication (Clerk)

| Var | Source | Notes |
|---|---|---|
| `CLERK_SECRET_KEY` | Clerk Dashboard > API Keys > Secret keys > "default" > Show key | Server-only. `sk_test_` for dev, `sk_live_` for prod. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Dashboard > API Keys > Publishable key | Public, safe. `pk_test_` for dev, `pk_live_` for prod. |
| `CLERK_WEBHOOK_SECRET` | Clerk Dashboard > Webhooks > [endpoint] > Signing Secret | Per-endpoint. Used by Svix to verify webhook signatures. |
| `CLERK_ISSUER` | `https://<clerk-instance>.clerk.accounts.dev` (dev) / `https://clerk.<your-domain>` (prod) | Used by Nest to verify JWT issuer. |

### Service-to-service HMAC (PR5a-bis contract)

| Var | Source | Notes |
|---|---|---|
| `WHATSAPP_SERVICE_HMAC_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | **Same value across all 3 surfaces** (dashboard, api, whatsapp-service). Used to sign + verify `${timestamp}.${tenantId}.${body}` payload. Mismatch breaks every cross-app request. |
| `WHATSAPP_OPERATOR_HMAC_TENANT_ID` | Leave **unset** in prod (default-safe) | Tenant UUID treated as "operator" for global mutations (`/ai/switch`, `/system/variables` writes, `/sessions/health`). With unset, those endpoints fail-closed with 403. PR5b will replace with proper role claim. |

### AI providers

| Var | Source | Notes |
|---|---|---|
| `AI_PROVIDER` | Choice: `openrouter` \| `gemini` \| `openai` | Selects which provider to use at runtime. |
| `OPENROUTER_API_KEY` | openrouter.ai > Keys | Required if `AI_PROVIDER=openrouter`. |
| `OPENROUTER_MODEL` | e.g. `openai/gpt-4o-mini` or `openai/gpt-oss-120b` | Per OpenRouter model catalog. |
| `GEMINI_API_KEY` | Google AI Studio > API key | Optional fallback. |
| `OPENAI_API_KEY` | platform.openai.com > API keys | Optional fallback. |

### Redis (local dev only)

| Var | Source | Notes |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6381` | Docker compose maps host 6381 → container 6379 to avoid collision with system Redis. |

In production, Redis is co-located on the Hetzner VPS at `localhost:6379`.

### WhatsApp behavior flags

| Var | Default | Notes |
|---|---|---|
| `WHATSAPP_ALLOW_NEW_LEADS` | `true` | Bot accepts messages from unknown numbers and creates a new Lead. Set to `false` for closed support deployments. |
| `WHATSAPP_REQUIRE_WHITELIST` | `true` | Only allow messages from numbers that pass the whitelist heuristic. |
| `WHATSAPP_BLOCK_NEWSLETTERS` | `true` | Drop messages matching newsletter patterns (unsubscribe, do-not-reply, etc). |
| `WHATSAPP_ENABLE_AUTO_RECOVERY` | `false` (dev) / `true` (prod) | Whether the service tries to reconnect dropped WhatsApp sessions on boot. |
| `PUPPETEER_HEADLESS` | `false` (dev) / `true` (prod) | `false` shows the Chrome window for debugging; `true` runs headless. |

### Auth snapshot (session backup)

| Var | Notes |
|---|---|
| `ENABLE_AUTH_SNAPSHOTS=true` | Persists WhatsApp session auth state to Postgres (encrypted) so it survives Hetzner restarts and migrations without re-scanning QR. |
| `SNAPSHOT_ENCRYPTION_KEY` | 64-char hex, generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. **Never rotate without first decrypting all existing snapshots** — you'll lose all backed-up sessions. |
| `SNAPSHOT_INTERVAL_HOURS=4` | How often the auto-backup runs for active sessions. |

---

## Production specifics (Vercel + Hetzner)

### Vercel (dashboard)

Set in Vercel project Settings → Environment Variables. Production scope:

| Var | Value | Purpose |
|---|---|---|
| `DATABASE_URL` | Supabase prod pooler URI (port 6543) | tenant-lookup.ts in proxy reads Tenant table |
| `DIRECT_URL` | Supabase prod direct URI (port 5432) | rarely used at runtime; needed for build-time Prisma migrate (we don't run those on Vercel, but include for parity) |
| `NEXT_PUBLIC_API_URL` | `https://api.<your-domain>` | Dashboard makes XHR calls to Nest API directly |
| `NEXT_PUBLIC_WHATSAPP_SERVICE_URL` | `https://whatsapp.<your-domain>` | Used for direct WebSocket upgrade |
| `WHATSAPP_SERVICE_URL` | same as above | server-side reads |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_...` | Production Clerk |
| `CLERK_SECRET_KEY` | `sk_live_...` | Production Clerk server-side |
| `CLERK_WEBHOOK_SECRET` | `whsec_...` from Clerk Dashboard webhook endpoint | Verifies Clerk → API webhook signatures |
| `WHATSAPP_SERVICE_HMAC_SECRET` | same hex string as Hetzner | HMAC signing for proxy → whatsapp-service |
| `NEXT_PUBLIC_SUPABASE_URL` / `..._ANON_KEY` | Supabase prod public keys | Optional; for direct client access |

`WHATSAPP_OPERATOR_HMAC_TENANT_ID` is intentionally **NOT** set in Vercel prod.

### Hetzner VPS (api + whatsapp-service)

Two `.env` files at:
- `/opt/leadcrm/apps/api/.env`
- `/opt/leadcrm/apps/whatsapp-service/.env`

Both share most values with Vercel except they're full env files (not just per-key). The HMAC secret must be **identical** to Vercel's. The DATABASE_URL points to the same Supabase prod project.

PM2 ecosystem reads these via `ConfigModule.forRoot` (Nest) and `dotenv.config()` (whatsapp-service).

`WHATSAPP_OPERATOR_HMAC_TENANT_ID` is also **NOT** set in Hetzner prod env.

---

## Rotation runbook (when to update what)

When rotating secrets, all surfaces using that secret must update at the same time:

| Secret | Surfaces |
|---|---|
| `DATABASE_URL` password | Vercel + Hetzner api + Hetzner whatsapp-service + every dev's local `.env` |
| `WHATSAPP_SERVICE_HMAC_SECRET` | Vercel + Hetzner api + Hetzner whatsapp-service + every dev's local `.env` |
| `CLERK_SECRET_KEY` | Vercel + Hetzner api + Hetzner whatsapp-service + every dev's local `.env` |
| `CLERK_WEBHOOK_SECRET` | Vercel + Hetzner api (only the API verifies webhooks) + every dev's local `.env` |
| `SNAPSHOT_ENCRYPTION_KEY` | **Do not rotate** without coordinated decrypt-all-existing-snapshots step. |

Step-by-step rotation is tracked in `docs/deployment/secrets-rotation.md`.

---

## Common pitfalls

1. **Dashboard returns 500 from `/api/whatsapp/*`**: usually `DATABASE_URL` on Vercel is stale or `WHATSAPP_SERVICE_HMAC_SECRET` doesn't match Hetzner. Check Vercel runtime logs first.
2. **API returns 403 "No active organization"**: the user's Clerk session has no active org. They need to visit `/select-org` and pick or create one. (PR5a-bis: ClerkAuthGuard reads `payload.o?.id ?? payload.org_id` to support both v1 and v2 token shapes.)
3. **API returns 403 "Tenant not provisioned"**: the active org has no Tenant row in Supabase yet. The Clerk webhook should auto-create it; if the webhook isn't configured yet, manually `INSERT INTO tenants (clerk_org_id, name, plan)` for that org.
4. **whatsapp-service drops messages with `[UNIFIED-WRITE] session ... has no tenantId`**: the WhatsApp session row in Postgres has `tenant_id = NULL`. Run the backfill script: `pnpm tsx packages/db/scripts/backfill-tenant.ts --apply --confirm I-UNDERSTAND-THIS-MUTATES`.
5. **PrismaClientInitializationError on Vercel**: schema needs `binaryTargets = ["native", "rhel-openssl-3.0.x"]` and the dashboard's Vercel function needs `outputFileTracingIncludes` for the engine binary. Both already configured in `packages/db/prisma/schema.prisma` and `apps/dashboard/next.config.js`.

---

## See also

- `docs/deployment/multi-tenant-rollout.md` — full rollout runbook (PR1-PR5a)
- `docs/deployment/secrets-rotation.md` — secret rotation log
- `CLAUDE.md` — architecture + Phase A history
