# Informe de Estado Real — LeadsCRM

**Fecha:** 2026-05-05 (v11 — Fase B.2 completa + review fixes + smoke local verde)
**Branch analizado:** `feat/b2.0-tenant-scope-defense` (HEAD `d6f70ad` — 19 commits sobre `develop`)
**Método:** Auditoría `path:line` verificable + checks locales (`prisma validate`, `db:generate`, `typecheck`, `test`, `build`, `lint`) + verificación live Supabase MCP + Hetzner SSH + Clerk Dashboard (Chrome MCP) + smoke webhook E2E con org `WebhookSmokeTest` el 2026-05-03 19:51 UTC.

> **Novedad v7:** Fase B.1 (multi-tenant foundation + runtime enforcement) cerrada en producción. PR #11 (commit `dcf81dd` = "feat(b1): multi-tenant foundation + runtime enforcement (PR1-PR5a combo)") mergeado a `main` 2026-05-02 con 4 follow-up merges de fixes Vercel-Prisma (binaryTargets, postinstall, externalize @prisma/client, JWT v2 shape). Migration B1 aplicada a Supabase prod via Supabase MCP `execute_sql`. Tenant `EscortsHub` provisionado (`923493fc-ffe9-49c6-9963-74e24eae0689` ↔ `org_3DDKQD4ThoPcwJnHC5mWTmrr5L3`); 731 filas backfilled. Clerk Production webhook para `organization.*` configurado 2026-05-03 19:51 UTC con `CLERK_ORG_WEBHOOK_SECRET` en Hetzner; smoke real verde end-to-end. Multi-tenancy ahora activo en runtime y en producción.

---

## 1. Resumen Ejecutivo

LeadsCRM es un CRM con automatización de WhatsApp en **estado MVP estabilizado y en producción multi-tenant**. El flujo crítico (leads + WhatsApp + IA) es end-to-end funcional: recepción de mensaje → whitelist → lead/message persistidos atómicamente → pipeline IA (OpenRouter primario / Gemini fallback) → respuesta con rate limit por sesión. La **superficie de autenticación está cerrada y tenant-aware**: Clerk JWT gate desde el usuario hasta la API Nest; `TenantContextGuard` valida cada request server-side resolviendo `orgId → tenantId` (cache LRU 60s); HMAC SHA-256 tenant-aware (`${timestamp}.${tenantId}.${body}`) con replay protection para tráfico server-to-server. Multi-tenancy **activo en runtime y producción desde 2026-05-02**: tabla `tenants` poblada (`EscortsHub` provisionado), 9 tablas tenant-scoped backfilled (731 filas), `TenantContextGuard` activo en cada controller, webhook Clerk Production auto-crea `tenants` y patcha `public_metadata.tenant_id` para nuevas orgs desde 2026-05-03. Cross-tenant requests devuelven 404 (no 403 — evitar leak de id-existence). Lo que queda como deuda técnica menor: Prisma extension global (B1.13 — PR5a optó por scoping manual per-service), ESLint rule `no-unscoped-prisma` (B1.14 depende de B1.13), JWT template "supabase" (B1.2(a) Vía A — bloqueado por plan Student de Clerk; Vía B lookup server-side activa), y los destructive cleanups (B1.5 unique compuesto + B1.7b rename `ai_knowledge_items`) postponed hasta post-stabilization de prod.

---

## 2. Arquitectura Actual

### Apps y Servicios

| App | Tecnología | Puerto | Responsabilidad |
|-----|-----------|--------|-----------------|
| `apps/dashboard` | Next.js 14.2, Tailwind, Clerk, SWR | 3001 | UI del CRM: leads, WhatsApp, IA, settings, templates |
| `apps/api` | NestJS 10, Prisma 6.15, Clerk guards | 3003 | REST API: Leads, Templates (nuevo), WhatsApp controller |
| `apps/whatsapp-service` | Express, whatsapp-web.js, Redis, Socket.IO, HMAC middleware | 3002 | Sesiones WhatsApp, pipeline IA, mensajería, Socket.IO |
| `apps/docs` | Next.js 14 | — | Página de enlaces (mínima, sin dependencia de @leadcrm/ui) |

### Packages Compartidos

| Package | Función | Estado |
|---------|---------|--------|
| `@leadcrm/db` | Prisma schema + client | Usado por API, WhatsApp service, seed. En branch B1 ya incluye foundation multi-tenant additive-only |
| `@leadcrm/config-eslint` | Config ESLint compartida | Activo |
| `@leadcrm/config-ts` | Configs TypeScript base | Activo |
| ~~`@leadcrm/ui`~~ | — | **Eliminado (T3.2)**; los 2 componentes usados (Alert, Toggle) viven ahora en `apps/dashboard/components/ui/` |

### Integraciones Externas (verificadas live 2026-05-03)

| Servicio | Propósito | Estado |
|----------|-----------|--------|
| **Clerk** | JWT auth dashboard + guards API Nest + Organizations sync | App `app_31WLEq9qTjC0BUewQuM1ACMLsAp`. **2 webhooks configurados**: (1) user-events `/api/webhooks/clerk` — secret `CLERK_WEBHOOK_SECRET` (Vercel/Next handler); (2) **org-events `/api/webhooks/clerk/organizations` — secret `CLERK_ORG_WEBHOOK_SECRET`** (Hetzner Nest handler, configurado 2026-05-03 19:51 UTC, suscripto a `organization.created/updated/deleted`). Tenant `EscortsHub` (`org_3DDKQD4ThoPcwJnHC5mWTmrr5L3`) ↔ Supabase `923493fc-ffe9-49c6-9963-74e24eae0689` |
| **Supabase PostgreSQL** | DB principal | Proyecto `yxjzsargboxnuwnbuzax` (`CRMWhatsApp`), region `eu-west-3`, status `ACTIVE_HEALTHY`, versión `17.6.1.104` (arm64). **Advisor security: 0 lints.** service_role con GRANTs desde migration `grant_service_role_access_public_schema`. 16 tablas en `public` (3 nuevas en B1: `tenants`, `ai_agents`, `ai_products`) |
| **Redis** | Cache sesiones, QR, IA, pub/sub | `ioredis` en whatsapp-service, Docker local en dev |
| **OpenRouter** | IA primario | `OpenRouterProvider.ts` |
| **Google Gemini** | IA fallback | `GeminiProvider.ts` |
| **Socket.IO** | Namespace `/whatsapp-sessions` | T2.3 cerrado el bug: `auth_failure` mapea a `AUTH_INVALID` |
| **Vercel** | Deploy dashboard | Team `udeope's projects`, project `dashboard` (`prj_3JGVC3KT0dnixeuZZwpcHTT0u3F6`), Node 24, dominio **`guatsapp.me`**. Producción actual: HEAD `main` (`0d949ac` Merge develop -> main: Next.js Prisma bundling). Envs prod: `WHATSAPP_SERVICE_HMAC_SECRET`, `CLERK_SECRET_KEY` (sk_live_), `CLERK_WEBHOOK_SECRET`, `DATABASE_URL`/`DIRECT_URL` (Supabase prod) |
| **Hetzner** | API + whatsapp-service (misma VM) | Server `118344573` ("whatsapp-service"), CX23, Nuremberg, IP `46.225.26.89`. Commit deployado: HEAD de `main` (`0d949ac`). PM2 con 2 procesos (leadcrm-api id=1 PID 1421178 reiniciado 2026-05-03 19:49 UTC tras secret sync, whatsapp-service id=0 uptime 7h+), ambos `online`. `.env` separados por app: `/opt/leadcrm/apps/api/.env` con `CLERK_ORG_WEBHOOK_SECRET` set + `WHATSAPP_SERVICE_HMAC_SECRET` sincronizado |
| **GitHub Actions** | CI | 2 workflows: `Infra Audit` (blocking, 15/1/0/0) + `CI/CD - LeadsCRM` (auto-format, no blocking sobre Prettier) |

---

## 3. Seguridad (cambió radicalmente vs v4)

| Capa | v4 (antes) | v5 (ahora) |
|------|------------|------------|
| `WhatsAppController` Nest sin guard | ❌ **Crítico** | ✅ `@UseGuards(ClerkAuthGuard)` en `send`, `whitelist/stats`, `whitelist/authorize` (`apps/api/src/whatsapp/whatsapp.controller.ts:105, 130, 148`); webhook sigue con header check — su HMAC global dependerá de T0.4-ter si se quiere firmar también el path Nest→Nest |
| whatsapp-service Express sin auth | ❌ **Crítico** | ✅ Middleware `verifyServiceSignature` en `apps/whatsapp-service/src/middleware/auth.ts` antes de los routers; bypass sólo en `/api/health` y `NODE_ENV=test` |
| Rutas debug (`/api/debug/*`) con SERVICE_ROLE_KEY | ❌ **Crítico** | ✅ Los 3 archivos eliminados (T0.4); `git rm` aplicado |
| Proxy Next sin auth | ❌ **Crítico** | ✅ `app/api/whatsapp/[...path]/route.ts` hace `requireClerkToken()` y firma HMAC antes de forwardear |
| Duplicación `/public/leads` (API + whatsapp-service) | ❌ **Crítico** | ✅ `PublicLeadsController` eliminado; `GET/POST /public/leads` + `GET/POST/PATCH /leads` eliminados de `routes/index.ts` (T0.7) |
| Doble montaje `/ + /api` en whatsapp-service | ❌ Alto | ✅ Sólo `/api` (T0.4-ter) |
| Rate limit deshabilitado en dev | ❌ Bajo | ✅ Bypass ahora solo en `NODE_ENV=test` (T2.4) |
| Rate limit cuota por sesión WhatsApp | ❌ Alto | ✅ `rateLimitBySession` (200 msgs/h default, throttle adaptativo 1/2/4×) |
| RLS + 0 policies | ❌ **Crítico** (v4) | ⚠️ **WARN aceptado (opción C)** — operación single-admin, clientes DB bypass RLS by design. Tracked como reabrible si aparece segundo usuario, exposición PostgREST o JWT Clerk↔Supabase |
| Firewall `0.0.0.0/0` en 22/80/443/3002/3003 | ❌ **Crítico** | ✅ SSH → `83.46.152.0/24` (ISP operador); HTTP/HTTPS → abiertos (internet-facing reverse proxy); **3002 y 3003 eliminados** |
| Postgres con patches pendientes | ❌ Alto | ✅ Upgrade 17.4.1.069 → 17.6.1.104 aplicado; advisor `vulnerable_postgres_version` cerrado |
| Matcher `/api/webhook` singular | ❌ Bajo | ✅ Fix → `/api/webhooks/(.*)` |
| Templates/bulk sin auth | ❌ Alto | ✅ CRUD movido a Nest con `ClerkAuthGuard` (T2.2); AI endpoints siguen en whatsapp-service pero cubiertos por HMAC + proxy Clerk |
| Webhook Nest header estático | ⚠️ | ⚠️ sigue así; elevarlo a HMAC completo es follow-up técnico tracked pero no crítico (la mayor parte del tráfico ya va por HMAC) |

**Autenticación end-to-end hoy**: Clerk JWT desde navegador → dashboard (Next middleware) → proxy `/api/whatsapp/*` (`requireClerkToken`) firma HMAC → whatsapp-service verifica con `timingSafeEqual`. Para tráfico server-to-server (API Nest → whatsapp-service), la API firma con el mismo helper (`apps/api/src/whatsapp/service-auth.ts`) antes de cada fetch outbound.

---

## 4. Funcionalidades y Estado por Dominio

| Dominio | Estado | Notas clave |
|---------|--------|-------------|
| Auth + multi-tenancy | ✅ Activo en producción | PR #11 deployado 2026-05-02. Tenant `EscortsHub` provisionado, 731 filas backfilled, `TenantContextGuard` valida cada request en NestJS API + middleware equivalente en whatsapp-service, HMAC tenant-aware (`${timestamp}.${tenantId}.${body}`), cross-tenant → 404. Webhook Clerk Production auto-crea Tenants para nuevas orgs desde 2026-05-03. Smoke E2E verde con `WebhookSmokeTest`. Pendientes menores: B1.13 Prisma extension global (PR5a optó por scoping manual per-service), B1.14 ESLint rule, B1.2(a) JWT template (Vía A bloqueado por plan Student; Vía B lookup activa) |
| Leads CRUD | ✅ Completo | Nest `LeadsController` con 7 endpoints (create/findAll/findOne/update/updateStatus/updateWhatsAppAuth/remove) + soft delete (`deletedAt`) |
| Templates CRUD | ✅ Nuevo (T2.2) | Nest `TemplatesModule` con `ClerkAuthGuard`, DTOs `class-validator`, preview engine |
| WhatsApp sessions | ✅ Persistencia + snapshots | `SessionManager` en `whatsapp-core/`, `SnapshotService` encriptado, reconexión automática con toggle. Double-init resuelto en `develop`; schema B1 añade `tenant_id`/`ai_agent_id` nullable para futuro |
| WhatsApp incoming + whitelist | ✅ | 4 etapas de filtrado, logging a `whatsapp_whitelist_logs` (383 filas, +356 desde v4) |
| WhatsApp sending (API → service) | ✅ | `WhatsAppService.sendMessage` firma HMAC antes de POST al whatsapp-service |
| WhatsApp proactive/bulk | ✅ | Rate limit por sesión (200/h), delay adaptativo 1/2/4× si uso >80%/>90%; bulk fail-closed |
| Socket.IO | ✅ T2.3 fix aplicado | Mapeo `auth_failure → AUTH_INVALID` correcto; tipos `useSocket.ts` alineados con `types/index.ts` (ambos incluyen 6 estados) |
| IA pipeline | ✅ Tenant-scoped + prompt dinámico (B2.0+B2.1) | Tenant-scoped (B2.0): `MessageHandler` resuelve `tenantId` + `aiAgentId` via `getSessionContext()` en un solo query. **B2.1 prompt dinámico**: `SystemPromptService.buildAgentSystemPrompt()` compone prompt desde 10 capas (channel, persona, negocio, tono, instrucciones custom, knowledge, productos, goal, contexto, formato). `AIOrchestratorService` y `ResponseGenerator` delegan al prompt dinámico. Hardcoded EscortsHub eliminado de `getFormatInstructions`. Fallback legacy cuando `aiAgentId` es null |
| AutomationService "keyword rules" | 🗑️ Eliminado (T2.1) | El servicio era código muerto (nunca inyectado); eliminado junto con sus 234 líneas |
| Dual-write `messages` ↔ `whatsapp_conversations` | ✅ Cerrado end-to-end | Writer unificado transaccional en `DatabaseService.saveConversation`; FK `message_id` poblada al 100%; readers via JOIN Prisma |
| AI training interactions | ✅ Modelo Prisma ahora | `AiTrainingInteraction` añadido en T1.1 Phase A; writer sigue siendo `AILearningService` vía SQL raw (follow-up: migrarlo a Prisma) |
| Campañas | ❌ Siguen sin existir | Migraciones Supabase legacy dropeadas (T1.4); feature no prioritaria para el MVP |
| Seed DB | ✅ Idempotente (T1.2) | `packages/db/prisma/seed.ts` con enums Prisma, upsert por clave unique, `createMany skipDuplicates` |
| Testing | ✅ Expandida (B2) | API: 10 `leads.service.spec.ts` + 6 `whatsapp.controller.spec.ts` + 6 `whatsapp.service.spec.ts` + **8 `ai-agents.service.spec.ts`** + 6 `clerk-organizations.*` + 3 otros = **9 suites / 53 tests**; whatsapp-service: 6 `auth.spec.ts` + 10 `DatabaseService.tenant-scope.spec.ts` + **9 `SystemPromptService.spec.ts`** + init/alert/tenant tests = **7 suites / 62 tests**. **Total: 115 tests** |
| CI | ✅ | `Infra Audit` blocking (15/1/0/0); `CI/CD - LeadsCRM` con auto-format no-blocking |

---

## 5. Base de Datos (snapshot live 2026-05-03)

### Tablas en `public` (16 — 3 nuevas en B1: `tenants`, `ai_agents`, `ai_products`)

| Tabla | Cols | Filas | Δ vs v6 | Nota |
|-------|------|-------|---------|------|
| **`tenants`** | **7** | **2** | NEW | B1 — `EscortsHub` (prod `org_3DDKQD4ThoPcwJnHC5mWTmrr5L3`) + `Testing` (dev `org_3DHAHhfxwHHw366iGotiys4Mpfc`, creado durante smoke 2026-05-05) |
| **`ai_agents`** | **22** | **2** | NEW | B1 — `EscortsHub Default` (backfill) + `Testing Default` (smoke 2026-05-05) |
| **`ai_products`** | **13** | **0** | NEW | B1 — vacía hasta que se diseñe UI de productos en Fase B.2 |
| `leads` | 15 | 13 | +1, +1 col (`tenant_id`) | Crecimiento orgánico en prod |
| `messages` | 13 | 132 | +50 filas, +1 col (`tenant_id`) | +50 mensajes reales prod desde v6 |
| `whatsapp_conversations` | 20 | 89 | +30 filas, +2 cols (`tenant_id`, `whatsapp_session_id`) | +30 conversaciones reales prod |
| `whatsapp_sessions` | 17 | 27 | +3 filas, +2 cols (`tenant_id`, `ai_agent_id`) | |
| `ai_training_interactions` | 10 | ~30 | +1 col (`tenant_id`) | |
| `ai_knowledge_base` | 11 | 3 | +2 cols (`tenant_id`, `agent_id`) | Rename a `ai_knowledge_items` postponed (B1.7b PR5b destructive) |
| `message_templates` | 12 | 1 | +1 col (`tenant_id`) | |
| `whatsapp_whitelist_logs` | 14 | ~400 | +1 col (`tenant_id`) | |
| `proactive_messages` | 16 | 0 | +1 col (`tenant_id`) | |
| `users` | 12 | 2 | 0 | admin + agent del seed |
| `ai_configuration` | 8 | 0 | +1 col (`tenant_id` nullable; intencional para configs globales) | |
| `_prisma_migrations` | 8 | 5 | +3 (B1 foundation + soft delete baseline + ai_training_interactions) | |
| `migrations` | 5 | 0 | 0 | **Legacy**; tabla vacía sin uso, drop manual pendiente |

### RLS, policies y advisors

- **RLS**: 0/13 habilitado (opción C del PRD T0.1).
- **pg_policies**: 0 en `public`.
- **Advisors security**: `lints: []` (antes había `vulnerable_postgres_version`; cerrado por el upgrade Postgres).

### FKs clave (tras T4.1 + B1)

```
messages.lead_id               → leads(id) ON DELETE SET NULL
proactive_messages.lead_id     → leads(id) ON DELETE SET NULL
whatsapp_conversations.lead_id → leads(id) ON DELETE SET NULL
whatsapp_conversations.message_id → messages(id) ON DELETE SET NULL
whatsapp_conversations.whatsapp_session_id → whatsapp_sessions(id) (B1)
whatsapp_sessions.ai_agent_id  → ai_agents(id) (B1)
ai_knowledge_base.agent_id     → ai_agents(id) (B1)
<11 tablas>.tenant_id          → tenants(id) (B1, sin ON DELETE CASCADE)
```

Historial de FKs pre-T4.1: las tres primeras eran `ON DELETE CASCADE` — se relajaron para que un hard delete de un lead no destruya su historial. Las nuevas FKs `tenant_id` se añadieron sin `ON DELETE CASCADE` deliberadamente: el handler `organization.deleted` hace `prisma.tenant.deleteMany` que actualmente fallaría con FK error si el Tenant tiene relaciones (descubierto en smoke 2026-05-03; ver `docs/deployment/multi-tenant-rollout.md` gap 3.5). Decisión futura: switch a soft delete o añadir cascade — pending PR.

---

## 6. Infraestructura (live 2026-04-18)

### Hetzner

- Server `118344573` ("whatsapp-service"), CX23, Nuremberg `nbg1-dc3`, Ubuntu 24.04, IP `46.225.26.89`.
- **Firewall `whatsapp-firewall` (id 10443894)**: 3 reglas in (antes 5):
  - SSH `:22` → **`83.46.152.0/24`** (ISP operador, T0.2 opción B).
  - HTTP `:80` → `0.0.0.0/0, ::/0` (redirect a HTTPS en reverse proxy).
  - HTTPS `:443` → `0.0.0.0/0, ::/0` (reverse proxy termina TLS y reenvía a `:3002`/`:3003` localmente).
- **Puertos 3002 y 3003 ya no son accesibles desde internet**.
- Código deployado: HEAD `main` = `0d949ac` (Merge develop -> main: Next.js Prisma bundling). Pull/build/restart aplicado durante PR #11 cutover 2026-05-02 + restart 2026-05-03 19:49 UTC tras sync de `CLERK_ORG_WEBHOOK_SECRET`.
- `.env` separados por app: `/opt/leadcrm/apps/whatsapp-service/.env` y `/opt/leadcrm/apps/api/.env`. Envs prod relevantes:
  - `WHATSAPP_SERVICE_HMAC_SECRET` sincronizado con Vercel
  - **`CLERK_ORG_WEBHOOK_SECRET`** (nuevo en B.1, set 2026-05-03) — solo en `apps/api/.env`; Vercel no consume este secret porque el handler corre en Nest API
  - `WHATSAPP_OPERATOR_HMAC_TENANT_ID` deliberadamente UNSET (operator endpoints stay locked; PR5b feature)

### Vercel

- Project `dashboard` (`prj_3JGVC3KT0dnixeuZZwpcHTT0u3F6`), Node 24, Next.js.
- Dominio producción: **`guatsapp.me`**.
- Envs prod: `WHATSAPP_SERVICE_HMAC_SECRET`, `CLERK_SECRET_KEY` (sk_live_), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (pk_live_), `CLERK_WEBHOOK_SECRET`, `DATABASE_URL` + `DIRECT_URL` (Supabase prod), `NEXT_PUBLIC_API_URL=https://api.guatsapp.me`.
- Producción actual: HEAD de `main` = `0d949ac` (Merge develop -> main: Next.js Prisma bundling). 4 follow-up merges resolvieron cascade Vercel-Prisma post-PR#11: `bebdec6` (binaryTargets rhel-openssl-3.0.x), `c914cdb` (postinstall prisma generate), `0d949ac` (outputFileTracingIncludes + externalize @prisma/client), `c7efd6e` (JWT v2 shape `o.id` vs `org_id`).
- Repo visibility: `public` (decisión PO T0.6).

### Supabase

- Postgres `17.6.1.104` (arm64), ACTIVE_HEALTHY.
- 13 tablas en `public`, 0 advisors security abiertos.
- Migraciones aplicadas esta sesión (además de las 12 previas):
  - `t1_1_phase_a_add_message_id_fk`
  - `t1_1_bis_step_4_5_drop_legacy_columns_and_migrations_table`
  - `t1_1_bis_step_5_drop_legacy_migrations_table`
  - `t1_3_whitelist_logs_lead_id_to_uuid`
  - `t1_3_drop_duplicate_indexes_proactive_messages`
  - `t1_4_drop_legacy_campaigns_tables`
  - `t4_1_soft_delete_and_relax_cascade_fks`
  - `grant_service_role_access_public_schema`

---

## 7. Gaps Residuales (deuda menor, ordenados por impacto)

| Gap | Impacto | Detalle |
|-----|---------|---------|
| **PR5b destructive cleanup pending** | Bajo (postponed by design) | B1.5 (`@@unique([tenantId, phone])`) + B1.7b (rename `ai_knowledge_base → ai_knowledge_items`). Postponed hasta confirmar 1 semana de prod sin webhook fallidos. Deliberado: el unique compuesto no se puede aplicar mientras haya filas con `tenant_id NULL` (pasado, no hay; verificar antes de PR5b) |
| **FK cascade en `organization.deleted`** | Bajo | Handler ejecuta `prisma.tenant.deleteMany` (`apps/api/src/clerk-webhooks/clerk-organizations.service.ts:79`) sin `ON DELETE CASCADE` en relaciones. Una org con leads/messages asociados fallaría con `P2003`. Smoke 2026-05-03 confirma test orgs vírgenes pasan limpias. Future PR: soft delete vs cascade — ver `docs/deployment/multi-tenant-rollout.md` gap 3.5 |
| **Prisma extension global no shipped (B1.13)** | Bajo | PR5a optó por scoping manual per-service en lugar de extension global. Trade-off: más boilerplate pero más debuggable. Revisitar si emerge dolor de scaling con muchos services nuevos. ESLint rule `no-unscoped-prisma` (B1.14) depende de B1.13 |
| **JWT template "supabase" (B1.2(a) Vía A)** | Bajo | Bloqueado por plan Student de Clerk. Vía B (lookup server-side via TenantContextGuard) funciona como workaround; revisitar si y solo si se requiere `getToken({template:'supabase'})` para RLS directa |
| Webhook Nest con header estático | ⚠️ Medio | `apps/api/src/whatsapp/whatsapp.controller.ts:45-54` — solo valida presencia del header `x-whatsapp-service`. Elevar a HMAC completo es follow-up técnico; la exposición real es baja porque el whatsapp-service ya no es alcanzable desde internet |
| RLS deshabilitado con 0 policies | ⚠️ WARN aceptado | Opción C del PRD T0.1; reabrible si aparece segundo usuario, exposición PostgREST directa, o JWT Clerk↔Supabase |
| Tabla `migrations` legacy vacía en prod | Bajo | Código ya no la referencia ni recrea; drop manual pendiente (`DROP TABLE public.migrations;`) |
| Toggle `USE_DATABASE_REPOSITORIES` + repos huérfanos | Bajo | `apps/whatsapp-service/src/services/db/*` ya no se activa; eliminarlos completamente es hygiene. ~400 líneas a eliminar |
| Modelo `AiTrainingInteraction` sin writer en Prisma | Bajo | `AILearningService` sigue con SQL raw; migrarlo a Prisma client es pulimiento |
| Node 20 deprecation en GHA | Bajo | `actions/checkout@v4`/`setup-node@v4`/`pnpm/action-setup@v2` corren en Node 20; GitHub fuerza Node 24 el 2026-06-02 |
| ESLint warnings en whatsapp-service | Bajo | `any` types + unused vars; cleanup progresivo |
| `project.live: false` en Vercel | Info | Merece investigación, pero el dominio sí responde |

### Progreso v6 posterior al snapshot v5

- **Double-init del whatsapp-service resuelto**: `fix/whatsapp-double-init` mergeado a `develop`; `WhatsAppService`/`WhatsAppServiceSimple` usan lazy idempotent init y se eliminaron scheduler legacy/zombie intervals.
- **B1 PR1 foundation schema commiteado**: commit `364979a` en `feature/b1-foundation-schema`.
- **Prisma migrations recuperadas en Git**: `.gitignore` ya no ignora `packages/db/prisma/migrations/`; se versionaron las migrations históricas y `20260501120000_b1_foundation_schema`.
- **B1 schema es additive-only**: mantiene `Lead.phone @unique`, mantiene `whatsapp_conversations.session_id`, mantiene `ai_knowledge_base` sin rename y añade columnas nuevas nullable en paralelo.
- **Smoke runtime B1 requiere DB migrada**: additive-only no significa app-backward-compatible con DB vieja; Prisma Client generado pide columnas nuevas por defecto.
- **Checks verdes**: `prisma validate`, `pnpm db:generate`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm lint`.

**Todos los gaps críticos de v4 están resueltos.**

---

## 8. Conteo de cambios vs v4

Base en los 58 commits entre `2395d04` (v4 point-in-time) y `1eeb155` (HEAD actual):

- **+7.383 / −11.733 líneas** (net **−4.350**).
- **18 archivos nuevos** críticos: `apps/api/src/templates/*` (7), helpers `service-auth.ts` (2), `apps/whatsapp-service/src/middleware/auth{,spec}.ts` (2), `scripts/backfill-orphan-conversations.ts`, `scripts/test-{unified-write,reader-join,soft-delete}.ts`, `leads.service.spec.ts`, `whatsapp.controller.spec.ts`, `auth.spec.ts`.
- **9 archivos eliminados** críticos: `WhatsAppServiceRefactored.ts`, `MigrationService.ts`, `automation.service.ts`, `public-leads.controller.ts`, `packages/ui/*`, 7 archivos muertos en `services/whatsapp/`, `app/api/debug/*` (3), `app/api/whatsapp/stats/route.ts`.
- **Migraciones Supabase**: 9 nuevas aplicadas vía MCP `apply_migration`.

### Comparativa de divergencia dual-write (métrica clave de T1.1)

| Métrica | v4 | v5 |
|---------|----|----|
| `messages` | 17 | 82 |
| `whatsapp_conversations` | 38 | 59 |
| `wc` con `message_id` | 0 (campo no existía) | **59 (100%)** |
| Huérfanos `wc` sin equivalente en `messages` | 21 | 0 |
| Columnas `message_text`/`response_text` duplicadas | existen | dropeadas |

---

## 9. Conclusión Operativa

### Partes más sólidas

- **Seguridad end-to-end**: Clerk JWT (usuario → dashboard → API Nest) + HMAC (server-to-server a whatsapp-service).
- **Dual-write resuelto**: writer unificado atómico + readers via JOIN; 0 divergencia a futuro.
- **Firewall endurecido**: SSH restringido a /24 del operador; puertos de servicio cerrados al público.
- **CI blocking `audit-infra` estable**: 15/1/0/0; regresión protegida en cada PR.
- **Rate limiting anti-ban WhatsApp**: cuota por sesión (200/h) + throttle adaptativo.
- **Pipeline IA con tests**: 8 tests en ai-thinking + 1 integration + 16 tests Nest + 6 tests HMAC.

### Partes donde seguir invirtiendo

- **Observabilidad**: logs centralizados + alertas anti-ban (T2.4 mide la cuota, falta disparador de alertas).
- **Tests E2E**: integrar un flujo completo "mensaje entrante → IA → respuesta" con Playwright o similar.
- **Hygiene restante**: drop `migrations`, eliminar `USE_DATABASE_REPOSITORIES`, migrar `AILearningService` a Prisma, upgrade Node 24 en GHA.

### Nivel de madurez del MVP

**MVP estabilizado en producción con CI protegido, deploy automático y seguridad end-to-end.** El producto puede demostrar el ciclo completo (registro → lead → WhatsApp QR → mensaje → IA → respuesta). La superficie de ataque se redujo drásticamente: de "servicio Express sin auth + 3 rutas debug con SERVICE_ROLE_KEY + firewall abierto + RLS sin policies + Postgres outdated + dual-write divergente" a "0 rutas debug + whatsapp-service con HMAC + firewall restringido + advisor Supabase limpio + writer unificado". La brecha crítica de v4 está cerrada.

---

## 10. Pending / Next Phase

**Fase B.1 multi-tenant CERRADA en producción** (PR #11 mergeado a main 2026-05-02; webhook Clerk Production configurado 2026-05-03 19:51 UTC; smoke E2E verde con `WebhookSmokeTest`). Detalles + post-mortem en `docs/deployment/multi-tenant-rollout.md`.

**Fase B.2 completa. Siguiente fase: B.3 — UI + E2E + RLS secundaria**.
B2.0–B2.9 completados en branch `feat/b2.0-tenant-scope-defense` (19 commits, pendiente merge a `develop`). Incluye: tenant-scope en DB + pipeline IA/autorización, prompt dinámico por agente (10 capas), knowledge/product retrieval scoped por tenant+agent, 13 endpoints CRUD NestJS (`AiAgentsModule`), preview endpoint, review fixes (sanitización ILIKE wildcards, tests AiAgentsService). Smoke local 2026-05-05 verde: dashboard/leads/whatsapp cargan, endpoints B2.7-B2.9 responden 200/201, tenant isolation verificada (tenant Testing ve 0 leads, EscortsHub ve 13). Tests: API 53/53, whatsapp-service 62/62 = 115 total.

**Cleanup PR diferido: PR5b destructive** (B1.5 `@@unique([tenantId, phone])` + B1.7b rename `ai_knowledge_base → ai_knowledge_items`). Postponed hasta confirmar ≥1 semana de prod sin webhook fallidos ni regresiones, evitando coordinar destructive migrations con la estabilización de B.1.

**Mejoras opcionales sin urgencia**: B1.13 Prisma extension global (revisitar si scaling pain), B1.14 ESLint rule (depende de B1.13), B1.2(a) Vía A JWT template (requeriría upgrade plan Clerk Pro+).

---

## 11. Correcciones respecto a v6 (deltas verificables)

| Afirmación v6 | Estado v7 | Evidencia |
|---|---|---|
| "Multi-tenancy todavía no está activo en runtime ni en producción" | Resuelto — activo en prod desde 2026-05-02 | `git log main` muestra PR #11 merged; Supabase live `tenants` count=1 (EscortsHub); `apps/api/src/auth/tenant-context.guard.ts` activo |
| "Migration B1 no aplicada en prod" | Resuelto — aplicada via Supabase MCP `execute_sql` 2026-05-02 | `_prisma_migrations` count = 5 (vs 2 en v6); 731 filas backfilled |
| "Runtime B1 contra DB vieja" | Resuelto — DB y código sincronizados | Smoke E2E `WebhookSmokeTest` verde 2026-05-03; runbook `docs/deployment/multi-tenant-rollout.md` |
| "PR2 pendiente: Clerk Organizations + webhook" | Resuelto — webhook configurado prod 2026-05-03 19:51 UTC | `pm2 logs leadcrm-api` línea `Mapped {/api/webhooks/clerk/organizations, POST}`; smoke verbatim en runbook gap 3.5 |
| Hetzner commit `1eeb155` | Resuelto — actualizado a `0d949ac` (HEAD main) | `ssh root@46.225.26.89 'cd /opt/leadcrm && git rev-parse HEAD'` |

## 12. Correcciones respecto a v4 (deltas verificables — histórico)

| Afirmación v4 | Estado v5 | Evidencia |
|---------------|-----------|-----------|
| `WhatsAppController` Nest sin guard | Resuelto — guards individuales en `send`, `whitelist/stats`, `whitelist/authorize` | `whatsapp.controller.ts:105,130,148` |
| whatsapp-service Express sin auth | Resuelto — middleware HMAC con timingSafeEqual + replay 5min | `apps/whatsapp-service/src/middleware/auth.ts` |
| Rutas debug con SERVICE_ROLE_KEY | Resuelto — archivos eliminados (T0.4) | `git log --diff-filter=D` del commit `50cde96` |
| `PublicLeadsController` + duplicación `/public/leads` | Resuelto — eliminados en ambas apps | `git rm` T0.3/T0.7 |
| Firewall `0.0.0.0/0` en 22/80/443/3002/3003 | Resuelto — 3 reglas: SSH/24, HTTP/0/0, HTTPS/0/0 | `hetzner_get_firewall` MCP live |
| Postgres `17.4.1.069` vulnerable | Resuelto — `17.6.1.104` tras upgrade | `SELECT version()` MCP live |
| RLS off + 0 policies | **Aceptado como WARN** (opción C); NO cerrado en sentido estricto, tracked | PRD v5.7 |
| 3 implementaciones WhatsApp | Resuelto — solo Simple activa, −4.700 líneas | `git log` T3.1 |
| `AutomationService` código muerto | Resuelto — eliminado (T2.1) | archivo no existe |
| Dual-write divergente 17 vs 38 | Resuelto — unificado transaccional + backfill 58→0 huérfanos | T1.1 Phase A + T1.1-bis steps 1-5 |
| Seed roto por schema drift | Resuelto — enums Prisma + idempotente | T1.2 |
| Bug Socket.IO `auth_failure → CONNECTING` | Resuelto — `→ AUTH_INVALID` | `SocketService.ts:144-159` |
| Índices duplicados en `proactive_messages` | Resuelto — 3 pares eliminados | T1.3 migration |
| `whatsapp_whitelist_logs.lead_id VARCHAR(255)` | Resuelto — ahora `uuid` | `information_schema.columns` live |
| `ai_training_interactions` fuera de Prisma | Resuelto — modelo añadido | `schema.prisma:AiTrainingInteraction` |
| `@leadcrm/ui` parcialmente huérfano | Resuelto — package eliminado, 2 componentes absorbidos | T3.2 |
| Templates/bulk sin auth | Resuelto parcial — CRUD en Nest con `ClerkAuthGuard`; AI endpoints detrás de HMAC via proxy | T2.2 |
| Rate limit por IP 300/min, bypass dev | Resuelto — +rate limit por sesión 200/h, bypass solo en `test` | T2.4 |
| Tests API = 1 spec boilerplate | Resuelto — 16 tests unitarios (leads + whatsapp controller) | T5.1/T5.2 |
| Migraciones huérfanas `campaigns`/`campaign_leads` | Resuelto — DROP aplicado | T1.4 |
| Matcher `/api/webhook` singular | Resuelto — `/api/webhooks/(.*)` | `middleware.ts` |
| Doble montaje `/ + /api` whatsapp-service | Resuelto — sólo `/api` | T0.4-ter |
| Webhook Clerk con secret placeholder | Resuelto — secret real en Vercel env, webhook configurado | T0.5 |
