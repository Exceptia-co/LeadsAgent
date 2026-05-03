# B1 Local DB Smoke

Use this runbook to test the B1 Prisma schema branch against a database that has the B1 migration applied. Do not point this branch at Supabase production unless the production migration has been applied in the coordinated PR1+PR2+PR3 window.

## Start local dependencies

```powershell
pnpm db:local:up
```

Local Postgres connection string:

```text
postgresql://leadcrm:leadcrm_dev_password@localhost:15432/leadcrm_local
```

## Apply schema and seeds

Run these commands in the same PowerShell session so the env override wins over root `.env`.

```powershell
$env:DATABASE_URL = "postgresql://leadcrm:leadcrm_dev_password@localhost:15432/leadcrm_local"
$env:DIRECT_URL = $env:DATABASE_URL

pnpm --dir packages/db exec prisma migrate deploy
pnpm db:generate
pnpm --dir packages/db run db:seed

$env:SMOKE_WHATSAPP_PHONE = "<phone-with-country-code-no-plus>"
$env:SMOKE_LEAD_NAME = "Smoke WhatsApp Lead"
$env:SMOKE_SESSION_ID = "testing"
pnpm db:seed:smoke
```

`SMOKE_WHATSAPP_PHONE` is intentionally required so real phone numbers never live in git.

## Runtime smoke

Start the app from the same shell:

```powershell
$env:PUPPETEER_HEADLESS = "true"
$env:WHATSAPP_ENABLE_AUTO_RECOVERY = "false"
pnpm dev
```

Acceptance checks:

- `http://localhost:3001/dashboard/leads` loads without 500 responses.
- API and whatsapp-service logs do not contain `tenant_id does not exist`.
- QR login reaches WhatsApp `READY`.
- One real inbound message produces exactly one `[DEDUPE] Checking msgId=` and zero `[DEDUPE] Skipping already-processed`.
- AI decides `RESPOND`, the mobile receives the reply, and logs show `Enhanced AI response sent successfully`.
- Local DB contains new `incoming` and `outgoing` rows in `messages`; `tenant_id IS NULL` is expected until B1.9 backfill.

## Stop local dependencies

```powershell
pnpm db:local:down
```
