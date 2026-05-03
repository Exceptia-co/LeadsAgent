# Secrets Rotation Runbook

Operational log and procedure for rotating credentials used by LeadsCRM. Each entry records what was rotated, where it had to be propagated, and how the new secret was validated. New rotations append to the log at the top.

---

## How to rotate a secret (general procedure)

1. **Inventory** every place the secret lives. For LeadsCRM the canonical surfaces are:
   - `.env`, `.env.production`, `apps/dashboard/.env.local`, `apps/api/.env`, `apps/whatsapp-service/.env` (all gitignored).
   - `.mcp.json` at repo root (gitignored, used by Claude Code MCP servers).
   - GitHub Actions repository secrets (`Settings → Secrets and variables → Actions`) consumed by `.github/workflows/*`.
   - Production VPS `/opt/leadcrm/apps/{api,whatsapp-service}/.env` on Hetzner `46.225.26.89`.
   - Vercel project env vars (Production / Preview / Development) for `guatsapp.me`.
2. **Provision the new credential** before invalidating the old one. Generate the new value at the source (Hetzner / Clerk / Supabase / Vercel / OpenRouter / etc.) and capture it once.
3. **Propagate** to every surface from step 1 in any order. Use `gh secret set NAME --repo Exceptia-co/LeadsAgent` for GitHub. Use the Vercel CLI or dashboard for Vercel envs. Use SSH + `pm2 restart all --update-env` on the VPS.
4. **Validate** the new credential is alive and the old one is no longer required. Preferred: trigger the relevant CI workflow (`gh workflow run audit-infra.yml`) so the validation runs in the same context where the secret is used.
5. **Revoke** the old credential at the source. Only after validation.
6. **Append an entry** to this log with date, scope, what was rotated, and validation evidence.

> Never embed the secret value in the log. Reference prefixes and timestamps only.

---

## 2026-05-02 — `HCLOUD_TOKEN` (Hetzner Cloud API)

**Reason**: token had been quoted verbatim in earlier chat sessions and persisted in `~/.claude/history.jsonl` and a now-cleaned-up `.claude/settings.local.json` of a sibling repo. Repo history was clean (the `.mcp.json` containing the token was always gitignored). Rotated for hygiene.

**Old token (revoked)**: prefix `PegXXZFPH8aS1Lyx...` — description `LeadsAgent` (Read+Write).
**New token**: prefix `DYkCQuP3x3rLlMpv...` — description `LeadsAgent-2026-05-02` (Read+Write).

**Surfaces touched**:

| Surface | Action | Evidence |
| --- | --- | --- |
| `.mcp.json` (repo root, gitignored) | `HETZNER_API_TOKEN` field replaced | `Edit` against `.mcp.json:7` |
| GitHub Actions secret `HCLOUD_TOKEN` (`Exceptia-co/LeadsAgent`) | `gh secret set HCLOUD_TOKEN --repo ...` | `gh secret list` shows `2026-05-02T13:22:46Z` |
| Hetzner Console — token `LeadsAgent` | Deleted via UI confirm dialog | Token list now: `LeadsAgent-2026-05-02`, `leadsagent-ci-audit` |
| `.env*` files | None touched — `HCLOUD_TOKEN` is not consumed by app runtime, only by `scripts/audit-infra.ts` | Grep confirmed in `apps/api/src/`, `apps/whatsapp-service/src/`, `apps/dashboard/` |
| Hetzner VPS `/opt/leadcrm/...` | None — VPS does not consume `HCLOUD_TOKEN` | `CLAUDE.md §Production deployment notes` lists envs; no Hetzner API token among them |
| Vercel envs | None — dashboard does not consume `HCLOUD_TOKEN` | Same |

**Validation**:

- GitHub Actions workflow run `25252898319` (`audit-infra.yml` on `feature/b1-clerk-organizations`, dispatched manually): completed in 37s with all steps green.
  - `HCLOUD_TOKEN: ***` masked in env step.
  - `[C] Hetzner firewall` section: `PASS C1 App ports 3002/3003 not open to world`, `PASS C2 SSH (22) not open to world`.
  - That confirms the new token authenticated against `https://api.hetzner.cloud/v1/firewalls/${HETZNER_FIREWALL_ID}` (firewall id `10443894`) and read the live ruleset.

**Local follow-up required**:

- Restart Claude Code so the MCP server `hetzner` (`@lazyants/hetzner-mcp-server`) respawns and picks up the new `HETZNER_API_TOKEN` from the updated `.mcp.json`. Until restart, the in-memory subprocess still holds the revoked token and will get 401 on any `mcp__hetzner__*` call. Not a security issue (old token is gone server-side); just a stale subprocess.

**Where the token does NOT live** (verified during inventory):

- Repo git history (commit `beb577a` removed an earlier `.mcp.json` whose contents were Codex/Gemini/BrowserMCP/Playwright — no Hetzner token).
- Sibling repo `Kymatio_GitLab/hap_app` (grep returned no matches).
- Any `.env*` checked-in template (`.env.example` is the only committed one and does not include `HCLOUD_TOKEN`).

---

## Inventory — secret-to-surface map (live as of 2026-05-02)

For future rotations, this is where each secret currently has to be propagated:

| Secret | App runtime envs | `.mcp.json` | GitHub Actions | Vercel | Hetzner VPS `.env` | Source of truth |
| --- | --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | ✅ all 3 apps | — | ✅ | ✅ dashboard | ✅ both apps | Supabase project `yxjzsargboxnuwnbuzax` |
| `DIRECT_URL` | ✅ api (migrations) | — | — | — | ✅ api | Supabase |
| `CLERK_SECRET_KEY` | ✅ api, dashboard | — | — | ✅ dashboard | ✅ api | Clerk Dashboard |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅ dashboard | — | ✅ | ✅ dashboard | — | Clerk Dashboard |
| `CLERK_WEBHOOK_SECRET` | ✅ dashboard | — | — | ✅ dashboard | — | Clerk Dashboard |
| `WHATSAPP_SERVICE_HMAC_SECRET` | ✅ all 3 apps (must match) | — | — | ✅ dashboard | ✅ both apps | Generated locally with `node -e "require('crypto').randomBytes(32).toString('hex')"` |
| `OPENROUTER_API_KEY` | ✅ whatsapp-service | — | — | — | ✅ whatsapp-service | OpenRouter Dashboard |
| `GEMINI_API_KEY` (fallback) | ✅ whatsapp-service | — | — | — | ✅ whatsapp-service | Google AI Studio |
| `HCLOUD_TOKEN` | — | ✅ (MCP server) | ✅ | — | — | Hetzner Console → Security → API tokens |
| `SUPABASE_PAT` | — | — | ✅ | — | — | Supabase account |
| `VERCEL_TOKEN` | — | — | ✅ | — | — | Vercel account |
| `CLAUDE_CODE_OAUTH_TOKEN` | — | — | ✅ | — | — | Claude Code |
| `VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY` | — | — | ✅ | — | — | Hetzner VPS provisioning |

Legend: ✅ means the surface needs to be updated when the secret rotates. — means not applicable.

> Source-of-truth column tells you where to regenerate the secret from. The other ✅ columns tell you where to propagate it.
