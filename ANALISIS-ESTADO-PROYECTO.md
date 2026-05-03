# Informe de Estado Real — LeadsCRM

**Fecha:** 2026-05-01 (v6 — post double-init fix + B1 PR1 foundation schema)
**Branch analizado:** `feature/b1-foundation-schema` (HEAD `364979a`; base `develop` actualizado a `730599e`)
**Método:** Auditoría `path:line` verificable + checks locales (`prisma validate`, `db:generate`, `typecheck`, `test`, `build`, `lint`) + inspección de migration SQL additive-only. La información live de Supabase/Hetzner/Vercel se conserva del snapshot v5 salvo donde se indica explícitamente.

> **Novedad v6:** Además del MVP estabilizado de v5, el fix de double-init del whatsapp-service ya quedó mergeado a `develop` y la primera pieza de Fase B.1 quedó implementada en branch: schema foundation multi-tenant additive-only. No se ha aplicado la migration B1 a Supabase producción; el despliegue de DB se acumula para PR1+PR2+PR3 con backfill. El smoke local del 2026-05-01 confirmó que API/dashboard de esta rama no deben correr contra una DB sin esa migration: Prisma Client selecciona columnas nuevas y `/leads`/`/templates` devuelven 500.

---

## 1. Resumen Ejecutivo

LeadsCRM es un CRM con automatización de WhatsApp en **estado MVP estabilizado y en producción**, con el primer PR técnico de multi-tenant ya preparado en branch. El flujo crítico (leads + WhatsApp + IA) es end-to-end funcional: recepción de mensaje → whitelist → lead/message persistidos atómicamente → pipeline IA (OpenRouter primario / Gemini fallback) → respuesta con rate limit por sesión. El bug de double-init del whatsapp-service quedó resuelto con lazy idempotent init y smoke runtime real. La **superficie de autenticación actual está cerrada**: Clerk JWT gate desde el usuario hasta la API Nest; HMAC SHA-256 con replay protection para tráfico server-to-server hacia el whatsapp-service; guards aplicados en cada controller Nest sensible. Multi-tenancy todavía no está activo en runtime ni en producción, pero la base de datos ya tiene una migration preparada: `Tenant`, `AiAgent`, `AiProduct`, `tenant_id` nullable, `ai_agent_id`, `agent_id` y `whatsapp_session_id`, sin drops/renames/NOT NULL. Lo que queda para activar multi-tenant real: Clerk Organizations/webhook, backfill, enforcement en Prisma/Nest, RLS secundaria y UI.

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

### Integraciones Externas (verificadas live 2026-04-18)

| Servicio | Propósito | Estado |
|----------|-----------|--------|
| **Clerk** | JWT auth dashboard + guards API Nest | Webhook configurado apuntando a `cromgod.space/api/webhooks/clerk`; secret inyectado en Vercel env |
| **Supabase PostgreSQL** | DB principal | Proyecto `yxjzsargboxnuwnbuzax` (`CRMWhatsApp`), region `eu-west-3`, status `ACTIVE_HEALTHY`, versión `17.6` (arm64). **Advisor security: 0 lints.** service_role con GRANTs desde migration `grant_service_role_access_public_schema` |
| **Redis** | Cache sesiones, QR, IA, pub/sub | `ioredis` en whatsapp-service, Docker local en dev |
| **OpenRouter** | IA primario | `OpenRouterProvider.ts` |
| **Google Gemini** | IA fallback | `GeminiProvider.ts` |
| **Socket.IO** | Namespace `/whatsapp-sessions` | T2.3 cerrado el bug: `auth_failure` mapea a `AUTH_INVALID` |
| **Vercel** | Deploy dashboard | Team `udeope's projects`, project `dashboard` (`prj_3JGVC3KT0dnixeuZZwpcHTT0u3F6`), Node 24, dominio `cromgod.space`. Producción actual `53927ab` (merge PR #3) + auto-deploy pendiente de `78ae524` (merge PR #4). Env var `WHATSAPP_SERVICE_HMAC_SECRET` configurada en los 3 environments |
| **Hetzner** | API + whatsapp-service (misma VM) | Server `118344573` ("whatsapp-service"), CX23, Nuremberg. Commit deployado `1eeb155`. PM2 con 2 procesos (leadcrm-api + whatsapp-service), ambos online. `.env` separados por app con `WHATSAPP_SERVICE_HMAC_SECRET` sincronizado |
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
| Auth + multi-tenancy | 🟡 Single-user/admin operativo + schema foundation listo | Clerk webhook poblando `users` vía svix; runtime sigue single tenant. Branch `feature/b1-foundation-schema` añade base Prisma multi-tenant sin enforcement ni backfill todavía |
| Leads CRUD | ✅ Completo | Nest `LeadsController` con 7 endpoints (create/findAll/findOne/update/updateStatus/updateWhatsAppAuth/remove) + soft delete (`deletedAt`) |
| Templates CRUD | ✅ Nuevo (T2.2) | Nest `TemplatesModule` con `ClerkAuthGuard`, DTOs `class-validator`, preview engine |
| WhatsApp sessions | ✅ Persistencia + snapshots | `SessionManager` en `whatsapp-core/`, `SnapshotService` encriptado, reconexión automática con toggle. Double-init resuelto en `develop`; schema B1 añade `tenant_id`/`ai_agent_id` nullable para futuro |
| WhatsApp incoming + whitelist | ✅ | 4 etapas de filtrado, logging a `whatsapp_whitelist_logs` (383 filas, +356 desde v4) |
| WhatsApp sending (API → service) | ✅ | `WhatsAppService.sendMessage` firma HMAC antes de POST al whatsapp-service |
| WhatsApp proactive/bulk | ✅ | Rate limit por sesión (200/h), delay adaptativo 1/2/4× si uso >80%/>90%; bulk fail-closed |
| Socket.IO | ✅ T2.3 fix aplicado | Mapeo `auth_failure → AUTH_INVALID` correcto; tipos `useSocket.ts` alineados con `types/index.ts` (ambos incluyen 6 estados) |
| IA pipeline | ✅ Intacto | AIOrchestrator → Intent → Context → Knowledge → Response; cache Redis; 8 tests unitarios en `ai-thinking/__tests__/`. Pendiente Fase B.2: parametrizar prompts/agentes y retirar branding hardcoded del runtime |
| AutomationService "keyword rules" | 🗑️ Eliminado (T2.1) | El servicio era código muerto (nunca inyectado); eliminado junto con sus 234 líneas |
| Dual-write `messages` ↔ `whatsapp_conversations` | ✅ Cerrado end-to-end | Writer unificado transaccional en `DatabaseService.saveConversation`; FK `message_id` poblada al 100%; readers via JOIN Prisma |
| AI training interactions | ✅ Modelo Prisma ahora | `AiTrainingInteraction` añadido en T1.1 Phase A; writer sigue siendo `AILearningService` vía SQL raw (follow-up: migrarlo a Prisma) |
| Campañas | ❌ Siguen sin existir | Migraciones Supabase legacy dropeadas (T1.4); feature no prioritaria para el MVP |
| Seed DB | ✅ Idempotente (T1.2) | `packages/db/prisma/seed.ts` con enums Prisma, upsert por clave unique, `createMany skipDuplicates` |
| Testing | ✅ Base funcional | API: 10 tests `leads.service.spec.ts` + 6 tests `whatsapp.controller.spec.ts`; whatsapp-service: 6 tests `auth.spec.ts` + 8 tests ai-thinking + 1 integration; 22+ tests unitarios jest totales |
| CI | ✅ | `Infra Audit` blocking (15/1/0/0); `CI/CD - LeadsCRM` con auto-format no-blocking |

---

## 5. Base de Datos (snapshot live 2026-04-18)

### Tablas en `public` (13, sin cambios vs v4 pero con contenidos distintos)

> **Nota v6:** la tabla siguiente describe producción/Supabase del snapshot v5. En branch `feature/b1-foundation-schema`, el schema Prisma ya prepara el siguiente estado con `tenants`, `ai_agents`, `ai_products`, `tenant_id` nullable en tablas scopeadas, `ai_agent_id`, `agent_id` y `whatsapp_session_id`. Esa migration no se ha aplicado a producción.

| Tabla | Cols | Filas | Δ vs v4 | Nota |
|-------|------|-------|---------|------|
| `leads` | 14 | 12 | +11 | +`deleted_at` (T4.1) |
| `messages` | 12 | 82 | +65 | +`deleted_at` (T4.1); 58 filas nuevas por backfill T1.1-bis step 2 + 7 del seed + nuevos del flujo |
| `whatsapp_conversations` | 18 | 59 | +21 | +`message_id` (T1.1 Phase A); −`message_text` −`response_text` (T1.1-bis step 4). **59/59 linked al 100%** |
| `ai_training_interactions` | 9 | 29 | +10 | Ahora **modelado en Prisma** como `AiTrainingInteraction` |
| `ai_knowledge_base` | 9 | 3 | +3 | Seed T1.2 pobló con 3 entradas |
| `message_templates` | 11 | 1 | +1 | Una plantilla test creada durante validación T2.2 |
| `whatsapp_sessions` | 15 | 24 | 0 | |
| `whatsapp_whitelist_logs` | 13 | 383 | +356 | `lead_id` ahora `uuid` (T1.3) |
| `proactive_messages` | 15 | 0 | 0 | 3 pares de índices duplicados eliminados (T1.3) |
| `users` | 12 | 2 | +2 | admin + agent del seed |
| `ai_configuration` | 7 | 0 | 0 | |
| `_prisma_migrations` | 8 | 2 | 0 | |
| `migrations` | 5 | 0 | 0 | **Legacy**; `MigrationService.ts` ya no existe en código, pero la tabla vacía persiste en DB — drop manual pendiente |

### RLS, policies y advisors

- **RLS**: 0/13 habilitado (opción C del PRD T0.1).
- **pg_policies**: 0 en `public`.
- **Advisors security**: `lints: []` (antes había `vulnerable_postgres_version`; cerrado por el upgrade Postgres).

### FKs clave (tras T4.1)

```
messages.lead_id               → leads(id) ON DELETE SET NULL
proactive_messages.lead_id     → leads(id) ON DELETE SET NULL
whatsapp_conversations.lead_id → leads(id) ON DELETE SET NULL
whatsapp_conversations.message_id → messages(id) ON DELETE SET NULL
```

Historial de FKs pre-T4.1: las tres primeras eran `ON DELETE CASCADE` — se relajaron para que un hard delete de un lead no destruya su historial.

---

## 6. Infraestructura (live 2026-04-18)

### Hetzner

- Server `118344573` ("whatsapp-service"), CX23, Nuremberg `nbg1-dc3`, Ubuntu 24.04, IP `46.225.26.89`.
- **Firewall `whatsapp-firewall` (id 10443894)**: 3 reglas in (antes 5):
  - SSH `:22` → **`83.46.152.0/24`** (ISP operador, T0.2 opción B).
  - HTTP `:80` → `0.0.0.0/0, ::/0` (redirect a HTTPS en reverse proxy).
  - HTTPS `:443` → `0.0.0.0/0, ::/0` (reverse proxy termina TLS y reenvía a `:3002`/`:3003` localmente).
- **Puertos 3002 y 3003 ya no son accesibles desde internet**.
- Código deployado: commit `1eeb155` (post-`git pull origin/develop` + `pnpm install` + `pnpm db:generate:win` + `pnpm build` + `pm2 restart all --update-env`).
- `.env` separados por app: `/opt/leadcrm/apps/whatsapp-service/.env` y `/opt/leadcrm/apps/api/.env`, ambos con `WHATSAPP_SERVICE_HMAC_SECRET` sincronizado con el de Vercel.

### Vercel

- Project `dashboard` (`prj_3JGVC3KT0dnixeuZZwpcHTT0u3F6`), Node 24, Next.js.
- Dominio producción: `cromgod.space`.
- Env var nueva: `WHATSAPP_SERVICE_HMAC_SECRET` en Production + Preview + Development.
- Producción actual: `53927ab` (merge PR #3). PR #4 mergeó a main como `78ae524` → auto-deploy disparado.
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
| Multi-tenant runtime aún no activo | Alto | B1 PR1 solo preparó schema additive-only en branch. Faltan Clerk Organizations/webhook, backfill, Prisma extension/TenantContextGuard, RLS secundaria y UI |
| Migration B1 no aplicada en prod | Alto | Deliberado: aplicar solo PR1 dejaría `tenant_id=NULL` sin Tenant real. Se aplica como combo PR1+PR2+PR3 con backfill |
| Runtime B1 contra DB vieja | Alto | Confirmado en Playwright: `/dashboard/leads` carga shell pero `GET localhost:3003/leads` y `/templates` devuelven 500 porque la DB no tiene `tenant_id`. No usar Supabase prod para smoke de esta rama; preparar local/staging migrado |
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

La siguiente fase activa ya está definida: **Fase B.1 multi-tenant**. Estado actual:

- PR1 schema foundation: implementado y commiteado en branch.
- PR2 pendiente: Clerk Organizations + webhook de organizaciones + metadata `tenant_id`.
- PR3 pendiente: backfill `tenant_id`, `ai_agent_id`, `whatsapp_session_id` y creación de AiAgent default.
- PR4 pendiente: enforcement (`TenantContextGuard`, Prisma extension, ESLint rule), `NOT NULL`, unicidad compuesta de `Lead.phone`, rename runtime-aware `ai_knowledge_base → ai_knowledge_items`.
- PR5 pendiente: UI `/select-org` + `OrganizationSwitcher`.

No aplicar la migration B1 a Supabase producción hasta coordinar PR1+PR2+PR3.

---

## 11. Correcciones respecto a v4 (deltas verificables)

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
