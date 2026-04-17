# PRD — Estabilización y Corrección de LeadsCRM

**Fecha:** 2026-04-17 (v5 — contexto de infra verificado live vía MCPs)
**Branch base:** `develop`
**Origen:** Análisis exhaustivo de código + infraestructura real (Supabase, Hetzner, Vercel, Clerk) + revisión cruzada GPT-5.4 (v3) + auditoría `path:line` (v4) + verificación live de Supabase / Hetzner / Vercel MCPs el 2026-04-17 (v5).
**Objetivo:** Cerrar los gaps funcionales, resolver riesgos de seguridad, eliminar deuda técnica crítica y llevar el MVP a un estado coherente y desplegable.

> **Novedad v5:**
> - Se añade **T0.8** (upgrade de Postgres — advisor `vulnerable_postgres_version` activo).
> - Se añade **T1.4** (limpiar migraciones huérfanas `create_campaigns_table` y `create_campaign_leads_table`).
> - Se refina **T0.1** con el hallazgo verificado de **0 policies** en `pg_policies` (habilitar RLS sin policies bloquea a Prisma con service role — requiere diseñar policies antes).
> - Se refina **T0.2** con las reglas de firewall exactas verificadas (`whatsapp-firewall` id 10443894, SSH/HTTP/HTTPS/3002/3003 todos a `0.0.0.0/0` + `::/0`, IP pública `46.225.26.89`).
> - Contexto de infraestructura ahora lleva los IDs exactos de Supabase project, Hetzner server, Vercel project/team.
>
> **Novedad v4 (heredada):** T0.4-bis, T0.4-ter y T0.7; correcciones de cifras ("14 ubicaciones" → 12 en 7 archivos; "6 tests" → 8; "1 consumer" → 2); cita Socket.IO corregida; matices sobre validación y rate limiting.

---

## Contexto de infraestructura (verificado live — 2026-04-17)

| Componente | Servicio | IDs / estado verificado |
|-----------|----------|--------------------------|
| **Frontend** | Vercel (Next.js) | Team `team_mP2bYgdUeXS5ArWzTHfw3RY5` · Project `dashboard` (`prj_3JGVC3KT0dnixeuZZwpcHTT0u3F6`), Node 24.x · dominio `cromgod.space` · producción actual = commit `467e83c` (2026-04-02); commits posteriores no promovidos a producción · `project.live: false` en última consulta (investigar) |
| **Backend** | Hetzner CX23 (2 vCPU, 4 GB, 40 GB SSD) | Server `118344573` llamado `whatsapp-service`, Nuremberg `nbg1-dc3`, IP pública `46.225.26.89` · running · corre **API :3003 y WhatsApp :3002 en la misma máquina** |
| **Firewall** | `whatsapp-firewall` (id 10443894) | Reglas `in`: 22/80/443/3002/3003 todos a `0.0.0.0/0` + `::/0`. Sin reglas `out` |
| **Base de datos** | Supabase PostgreSQL `17.4.1.069` | Project `yxjzsargboxnuwnbuzax` (`CRMWhatsApp`), eu-west-3, `ACTIVE_HEALTHY` · **13 tablas en `public`** · **RLS OFF en 13/13** · **0 policies** en `pg_policies` · advisor security activo: `vulnerable_postgres_version` |
| **Cache** | Redis 7 (Docker en Hetzner) | Puerto 6381 |
| **Auth** | Clerk | JWT funcional en dashboard y `LeadsController`; `WhatsAppController` sin guard; webhook Clerk NO verificable desde MCPs actuales (secret en env Vercel, no expuesto) |
| **IA** | OpenRouter (primario) + Gemini (fallback) | Integrado en whatsapp-service |
| **Repo** | GitHub `Exceptia-co/LeadsAgent` | `githubRepoVisibility: "public"` (confirmado en metadata de deployments Vercel) |

**Datos reales en producción (Supabase MCP, 2026-04-17 — snapshot, cambia con tráfico):**

| Tabla | Filas |
|-------|-------|
| `leads` | 1 |
| `messages` | 17 |
| `whatsapp_conversations` | 38 |
| `whatsapp_sessions` | 24 |
| `whatsapp_whitelist_logs` | 27 |
| `ai_training_interactions` | 19 (fuera de Prisma) |
| `_prisma_migrations` | 2 |
| `users` | 0 |
| `ai_configuration`, `ai_knowledge_base`, `message_templates`, `proactive_messages`, `migrations` (legacy) | 0 |

**Migraciones Supabase aplicadas (12 en total)**, incluyendo las huérfanas **`20250821100704_create_campaigns_table`** y **`20250821100720_create_campaign_leads_table`** — las tablas no existen hoy (ver T1.4).

---

## Principios de ejecución

- Cada tarea es autocontenida y mergeable de forma independiente.
- Se prioriza por impacto: seguridad > integridad de datos > funcionalidad > escalabilidad.
- No se añaden features nuevas — solo se conecta, corrige o elimina lo existente.
- Cada tarea debe incluir al menos un test que valide el cambio.
- **Verificar dependencias antes de eliminar:** no borrar endpoints/rutas sin confirmar que el frontend no las consume.
- **Citar `path:line` verificable:** cualquier afirmación sobre el código debe tener cita reproducible con grep/read. Las cifras agregadas (conteos, sumas) deben ser recalculables.

---

## Decisiones arquitectónicas (resueltas)

| # | Decisión | Resolución | Justificación |
|---|----------|-----------|---------------|
| D1 | `whatsapp_conversations` | **Mantener como capa de enriquecimiento IA** | Tiene 10 campos exclusivos usados por ContextEnricher, ConversationRepository y dashboard. Vincular con FK a `messages`. GPT-5.4 concuerda: solo es válido si se redefine como read model derivado, no como fuente canónica paralela |
| D2 | Ubicación de automatización | **Ejecución en WhatsApp Service, gestión/CRUD en API** | El mensaje nace en whatsapp-service; la API gestiona reglas. La política de negocio CRM (whitelist, lead status) debe mantenerse centralizada |
| D3 | Bulk/Proactive messaging | **Proteger y normalizar los endpoints existentes** (`routes/index.ts:976, 1148`) | Existen con rate-limit global por IP (300/min, deshabilitado en dev) y delay 2s entre bulk; faltan auth y cuota por sesión WhatsApp |
| D4 | Simple vs Refactored WhatsApp | **Quedarse con Simple** | Simple tiene snapshot/backup, recovery, health y whitelist. Eliminar Refactored |
| D5 | `@leadcrm/ui` | **Reducir a utility local del dashboard o eliminar** | 2 archivos consumidores reales; 5 de 8 componentes importados; `apps/docs` consume 1 botón — evaluar absorber en el dashboard |

---

## Fases y Tareas

---

### FASE 0 — Seguridad (Urgente - Bloqueante)

> Riesgos activos en producción descubiertos vía infraestructura real + auditoría claim-by-claim del código.

#### T0.1 — Habilitar RLS en Supabase (con policies)

**Problema:** Row Level Security está deshabilitado en las **13 tablas** de `public` (verificado live 2026-04-17 vía `list_tables` y `pg_tables`).

**Estado actual (verificado live):**
- `rls_enabled: false` en las 13 tablas (`leads`, `messages`, `whatsapp_conversations`, `whatsapp_sessions`, `whatsapp_whitelist_logs`, `users`, `ai_configuration`, `ai_knowledge_base`, `message_templates`, `proactive_messages`, `ai_training_interactions`, `_prisma_migrations`, `migrations` legacy).
- **`pg_policies` en `public` devuelve 0 filas** — no hay ninguna policy definida.
- El acceso desde la API NestJS usa Prisma con connection string directo (rol `postgres` o `service_role`).
- Algunas rutas Next (`app/api/debug/*`, `app/api/admin/migrate-users/route.ts:23`) usan `SUPABASE_SERVICE_ROLE_KEY` directamente vía cliente Supabase JS.

**Trampa conocida:** habilitar RLS con `ALTER TABLE … ENABLE ROW LEVEL SECURITY` sin policies **bloquea a cualquier rol distinto de `service_role` / `postgres`**, incluyendo a Prisma si se conecta con rol limitado. Diseñar policies ANTES de activar RLS.

**Cambios requeridos:**
1. Inventariar qué roles acceden a cada tabla (Prisma vía DATABASE_URL, Supabase JS vía SERVICE_ROLE_KEY, PostgREST si aplica).
2. Crear policies para cada tabla:
   - Policy `service_role_all` o equivalente que permita todo al role de servicio.
   - Si PostgREST se usa en algún momento futuro, policies `authenticated_select_own` ligadas a `clerk_id`.
3. Habilitar RLS sólo después de las policies: `ALTER TABLE x ENABLE ROW LEVEL SECURITY`.
4. Verificar que API y WhatsApp Service siguen funcionando tras el cambio (tests de humo sobre cada endpoint que toque DB).
5. Ejecutar Supabase advisor `get_advisors({ type: "security" })` y confirmar que `rls_enabled_no_policy` no aparece.

**Criterio de aceptación:**
- `rls_enabled: true` en las 13 tablas.
- Cada tabla tiene al menos 1 policy efectiva.
- API y WhatsApp Service sin errores 500 en los tests de humo.

---

#### T0.2 — Restringir firewall de Hetzner  ✅ CERRADA (commits `dce85d7` + firewall update, 2026-04-17: puertos 3002/3003 eliminados; SSH restringido a `83.46.152.0/24` opción B del PRD)

**Problema (verificado live 2026-04-17):** el firewall `whatsapp-firewall` (id 10443894), aplicado al server `118344573` (IP `46.225.26.89`), tiene TODAS sus reglas `in` abiertas a `0.0.0.0/0` + `::/0`:

| Descripción | Puerto | Source |
|-------------|--------|--------|
| SSH | 22 | `0.0.0.0/0`, `::/0` |
| HTTP | 80 | `0.0.0.0/0`, `::/0` |
| HTTPS | 443 | `0.0.0.0/0`, `::/0` |
| WhatsApp Service | 3002 | `0.0.0.0/0`, `::/0` |
| NestJS API | 3003 | `0.0.0.0/0`, `::/0` |

No hay reglas `out` configuradas.

**Cambios requeridos:**
1. Instalar nginx/Caddy en el servidor como reverse proxy con TLS (certificados Let's Encrypt para `api.cromgod.space`). Proxy pass:
   - `/whatsapp/*` → `http://127.0.0.1:3002`
   - `/leads/*`, `/public/*` (temporal hasta T0.3/T0.7) → `http://127.0.0.1:3003`
2. Actualizar reglas de firewall Hetzner vía MCP `hetzner_set_firewall_rules` (id 10443894):
   - **Cerrar** 3002 y 3003 completamente (remover reglas).
   - Dejar **80/443** abiertos (requerido para el reverse proxy).
   - **Restringir SSH (22)** a IPs conocidas (home/office del equipo, o bastion host).
3. Verificar que dashboard + whatsapp-service siguen funcionando vía el proxy.
4. Añadir rate-limit a nivel nginx/Caddy como capa extra (ya hay rate-limit en la app, pero reforzar).

**Criterio de aceptación:**
- Puertos 3002/3003 NO accesibles desde internet público (test con `nmap` externo).
- Servicios accesibles vía HTTPS a través del proxy en `api.cromgod.space`.
- SSH solo responde a las IPs del allowlist.

---

#### T0.3 — Migrar dashboard de `/public/leads` a endpoints autenticados, luego eliminar

**Problema:** Los endpoints `/public/leads` permiten CRUD sin autenticación. El dashboard depende de ellos en **12 ocurrencias repartidas en 7 archivos**.

**Estado actual — Dependencias del dashboard (verificado con `grep`):**

| Archivo | Líneas |
|---------|--------|
| `apps/dashboard/lib/swr-config.ts` | 129, 130 (`LEADS`, `LEAD_STATS`) |
| `apps/dashboard/lib/api.ts` | 237, 257, 277, 297 (create/update/delete) |
| `apps/dashboard/components/AddLeadModal.tsx` | 131 (create) |
| `apps/dashboard/app/dashboard/leads/page.tsx` | 231 (bulk update WhatsApp) |
| `apps/dashboard/app/api/public/leads/route.ts` | 43, 118 (proxy Next GET/POST) |
| `apps/dashboard/app/api/public/leads/stats/route.ts` | 8 (proxy Next stats) |
| `apps/dashboard/app/api/leads/[id]/whatsapp/route.ts` | 14 (reuso de `/public/leads/:id/whatsapp`) |
| **Total dashboard** | **12 ocurrencias / 7 archivos** |

**Rewrites adicionales:**
- `vercel.json:44-46` → `/api/public/:path*` → `https://api.cromgod.space/public/:path*`
- `apps/dashboard/vercel.json:31-36` → rewrite genérico `/api/:path*` → backend

**Backend a eliminar:**
- `apps/api/src/leads/public-leads.controller.ts:18` — `PublicLeadsController` (4 endpoints sin guard)
- **Ver T0.7 — existe una segunda superficie `/public/leads` en el whatsapp-service que debe eliminarse en paralelo.**

**Cambios requeridos (en orden estricto):**
1. **Primero:** Migrar las rutas del dashboard de `/public/leads` a `/leads` (endpoints autenticados con Clerk JWT).
   - Actualizar `swr-config.ts:129-130`: `LEADS: "/leads"`, `LEAD_STATS: "/leads/stats"`
   - Actualizar `AddLeadModal.tsx:131`: fetch a `/leads`
   - Actualizar `api.ts:237-297`: todas las mutaciones a `/leads`
   - Actualizar proxies Next (`api/public/leads/route.ts`, `stats/route.ts`) para inyectar Clerk token y reescribir al path autenticado
2. **Verificar** que el dashboard funciona con endpoints autenticados.
3. **Después:** Eliminar `PublicLeadsController` y su registro en `LeadsModule`.
4. Remover rewrite `/api/public` en `vercel.json` y el rewrite genérico en `apps/dashboard/vercel.json` si no es necesario.

**Criterio de aceptación:**
- Dashboard funciona con endpoints autenticados.
- No hay endpoints de leads sin auth en la API NestJS.
- Zero downtime en la migración.

---

#### T0.4 — Eliminar rutas debug y proteger proxy WhatsApp  ✅ CERRADA (commit `50cde96`, 2026-04-17)

**Problema:** Existen rutas debug con credenciales privilegiadas y un proxy catch-all sin autenticación que expone todo el WhatsApp Service.

**Estado actual (verificado):**
- `apps/dashboard/app/api/debug/test-migration/route.ts:23` → usa `SUPABASE_SERVICE_ROLE_KEY` sin auth
- `apps/dashboard/app/api/debug/real-clerk-migration/route.ts:13, 73` → migración Clerk con `SUPABASE_SERVICE_ROLE_KEY` + `CLERK_SECRET_KEY` sin auth
- `apps/dashboard/app/api/debug/auth-flow/route.ts:13` → usa `SUPABASE_SERVICE_ROLE_KEY`; llama a `auth()` en `:61` pero la rama sin `userId` devuelve `200` con el debugInfo (no 401)
- `apps/dashboard/app/api/whatsapp/[...path]/route.ts:14-77` → **proxy catch-all** que reenvía CUALQUIER request a WhatsApp Service sin verificar auth
- **Proxies auxiliares adicionales también sin auth:**
  - `apps/dashboard/app/api/whatsapp/stats/route.ts:8-36`
  - `apps/dashboard/app/api/logs/whitelist/route.ts:8-36`
  - `apps/dashboard/app/api/stats/whitelist/route.ts:8-38`
- **Middleware matcher roto:** `apps/dashboard/middleware.ts:9` declara pública `/api/webhook` (singular), pero el webhook real vive en `/api/webhooks/clerk` (plural). Esto es un bug cosmético del matcher, pero también implica que el webhook **no está en `isPublicRoute`** — funciona porque tampoco está en `isProtectedRoute`, pero debería normalizarse.

**Cambios requeridos:**
1. Eliminar las 3 rutas debug completas (`app/api/debug/*`).
2. Proteger el proxy WhatsApp y proxies auxiliares con auth de Clerk:
   - Verificar JWT en cada request antes de proxear.
   - O restringir a solo las rutas que el dashboard realmente necesita (sessions, send, conversations, stats).
3. Normalizar matcher: cambiar `'/api/webhook'` a `'/api/webhooks/(.*)'` en `middleware.ts:9`.
4. Verificar que el middleware de Next.js cubre correctamente las rutas sensibles.

**Archivos afectados:**
- `apps/dashboard/app/api/debug/test-migration/route.ts` (eliminar)
- `apps/dashboard/app/api/debug/real-clerk-migration/route.ts` (eliminar)
- `apps/dashboard/app/api/debug/auth-flow/route.ts` (eliminar)
- `apps/dashboard/app/api/whatsapp/[...path]/route.ts` (proteger con auth)
- `apps/dashboard/app/api/whatsapp/stats/route.ts` (proteger con auth)
- `apps/dashboard/app/api/logs/whitelist/route.ts` (proteger con auth)
- `apps/dashboard/app/api/stats/whitelist/route.ts` (proteger con auth)
- `apps/dashboard/middleware.ts` (normalizar matcher, verificar cobertura)

**Criterio de aceptación:**
- No existen rutas debug en producción.
- El proxy WhatsApp y proxies auxiliares requieren autenticación Clerk.
- Test: request sin token al proxy → 401 Unauthorized.

---

#### T0.4-bis — Proteger `WhatsAppController` de la API NestJS  ✅ CERRADA (commit `50cde96`, 2026-04-17)

**Problema:** El controller Nest `WhatsAppController` **no tiene `@UseGuards(ClerkAuthGuard)`** aplicado. Expone:
- `POST /whatsapp/webhook` (`apps/api/src/whatsapp/whatsapp.controller.ts:42`) — valida solo header estático `x-whatsapp-service` (`:52`).
- `POST /whatsapp/send` (`:102`) — sin autenticación.
- `GET /whatsapp/whitelist/stats` (`:126`) — sin autenticación.
- `POST /whatsapp/whitelist/authorize` (`:143`) — sin autenticación.

En producción, si el puerto 3003 queda expuesto (ver T0.2) o si la URL `api.cromgod.space/whatsapp/*` es accesible sin token, cualquiera puede enviar mensajes y manipular whitelist.

**Estado actual (verificado):**
- `apps/api/src/whatsapp/whatsapp.controller.ts:33` → `@Controller('whatsapp')` sin decorador de guard.
- `apps/api/src/whatsapp/whatsapp.module.ts:10` → `WhatsAppModule` no importa `ClerkAuthGuard` ni lo aplica a nivel de módulo.

**Cambios requeridos:**
1. Aplicar `@UseGuards(ClerkAuthGuard)` al controller, o a nivel de método para todos salvo `webhook`.
2. Para `POST /whatsapp/webhook`, reemplazar el header estático por **HMAC firmado** con un secreto compartido `WHATSAPP_SERVICE_SECRET` verificado por el guard; actualizar el whatsapp-service para firmar el payload.
3. Añadir `WhatsAppService`, `WhitelistService` o guard con dependencia de `ClerkAuthGuard` según necesite el módulo.
4. Añadir tests de integración: request sin token → 401; request con token → 200.

**Criterio de aceptación:**
- `/whatsapp/send`, `/whatsapp/whitelist/*` devuelven 401 sin token Clerk.
- `/whatsapp/webhook` solo acepta payloads firmados por el whatsapp-service.

---

#### T0.4-ter — Añadir capa de auth al whatsapp-service Express (NUEVO v4)

**Problema:** El whatsapp-service **no tiene ningún middleware de autenticación**. El bootstrap (`apps/whatsapp-service/src/index.ts:83-98`) monta:
- CORS (restrictivo en prod si `CORS_ORIGIN` configurado, bloqueante si no)
- `express.json`
- `logRequest`
- `rateLimit` (global por IP, 300/min, deshabilitado en `NODE_ENV=development` en `middleware/validation.ts:227`)
- Rutas en **dos puntos de montaje**: `app.use('/api', routes.default)` y `app.use('/', routes.default)` (`:97-98`).

Cualquier cliente con acceso de red al puerto 3002 puede invocar:
- `POST /sessions`, `DELETE /sessions/:id`, `POST /sessions/:id/send`
- `POST /proactive-messages`, `POST /proactive-messages/bulk`
- `GET/POST/PUT/DELETE /templates` (+ variantes AI)
- `GET /ai/status`, `POST /ai/switch`, `POST /ai/test`
- `GET/PUT /system/variables/*`

**Cambios requeridos:**
1. Añadir middleware de autenticación en `apps/whatsapp-service/src/index.ts` antes de montar `routes`:
   - Opción A: validar Clerk JWT (usando `@clerk/express` o verificación manual) para requests que vengan del dashboard.
   - Opción B: validar shared secret HMAC para requests internos de la API NestJS.
   - Combinar ambas: el middleware acepta uno u otro.
2. Eliminar el doble montaje (`/` y `/api`) y dejar solo `/api` o ajustar al que realmente use el dashboard.
3. Eliminar el bypass de rate limit en desarrollo (`validation.ts:227`) o al menos registrarlo con warning y mantenerlo solo en `NODE_ENV=test`.

**Criterio de aceptación:**
- Todo endpoint del whatsapp-service responde 401 sin credencial válida.
- El router sólo responde en un punto de montaje único.
- Tests de humo: request sin credencial → 401.

---

#### T0.5 — Configurar webhook de Clerk para sincronizar usuarios  ✅ CERRADA (2026-04-17: endpoint creado en Clerk Development instance, `CLERK_WEBHOOK_SECRET` inyectado en Vercel, redeploy lanzado)

**Problema:** Tabla `users` tiene 0 filas. Webhook handler existe en código pero el secret es un placeholder.

**Estado actual:**
- `apps/dashboard/app/api/webhooks/clerk/route.ts` — handler correcto con Svix.
- `.env` tiene `CLERK_WEBHOOK_SECRET="whsec_dev_placeholder_change_in_production"` (infra — no verificable desde repo).

**Cambios requeridos:**
1. En Clerk Dashboard → Webhooks: crear endpoint `https://cromgod.space/api/webhooks/clerk`.
2. Actualizar `CLERK_WEBHOOK_SECRET` en Vercel con el secret real.
3. Script de backfill para usuarios existentes.

**Criterio de aceptación:**
- Nuevo registro en Clerk genera fila en `users`.
- Usuarios existentes sincronizados.

---

#### T0.6 — Evaluar visibilidad del repositorio GitHub  ✅ DECISIÓN TOMADA (2026-04-17): el repo permanece público

**Decisión del PO:** mantener `Exceptia-co/LeadsAgent` público. Justificación operativa: el equipo considera que esta es la opción más cómoda para el pipeline de despliegue en Vercel free plan (ver matices en la nota técnica).

**Nota técnica:** Vercel Hobby plan también permite deploys desde repos privados — no hay restricción de visibilidad desde hace años. La única restricción real del plan Hobby es "no uso comercial". Si en el futuro el PO quiere privar el repo, el deploy seguirá funcionando y sólo se requiere re-conectar la integración GitHub ↔ Vercel si se rompió el auth.

**Consecuencias aceptadas (riesgos residuales):**
- Código fuente visible públicamente incluyendo patrones de auth, schema Prisma, URLs de producción (`cromgod.space`).
- Las credenciales reales siguen fuera del repo (`.env` en `.gitignore`), por lo que el riesgo es de inteligencia para ataques, no exposición directa.
- Los IDs de proveedores (`prj_3JGVC3KT0dnixeuZZwpcHTT0u3F6`, `yxjzsargboxnuwnbuzax`, firewall `10443894`, team Vercel `team_mP2bYgdUeXS5ArWzTHfw3RY5`) quedan públicos pero por sí solos no permiten acceso.

**Mitigaciones ya aplicadas (no dependen de visibilidad):**
- Rutas debug eliminadas (T0.4).
- Proxies gated con Clerk (T0.4).
- `WhatsAppController` con guard (T0.4-bis).
- Firewall Hetzner restringido (T0.2).
- Postgres actualizado (T0.8).

**Revisión futura:** reevaluar esta decisión si (a) se expone información sensible en el codebase, (b) el plan de Vercel cambia, (c) el scope del producto crece comercialmente.

---

#### T0.7 — Eliminar superficie `/public/leads` y `/leads` sin auth del whatsapp-service (NUEVO v4)

**Problema:** Además de `PublicLeadsController` en la API (atacado por T0.3), el whatsapp-service define un CRUD paralelo de leads **también sin autenticación**:

| Método | Path | Línea |
|--------|------|-------|
| GET | `/public/leads` | `apps/whatsapp-service/src/routes/index.ts:286` |
| POST | `/public/leads` | `:317` |
| GET | `/leads` (comentado como "auth required" pero sin middleware) | `:394` |
| POST | `/leads` | `:426` |
| PATCH | `/leads/:leadId/whatsapp` | `:505` |

Como el router se monta en `/` y `/api` (`src/index.ts:97-98`), cada endpoint responde en ambos prefijos, duplicando la superficie.

**Cambios requeridos:**
1. Evaluar si el dashboard u otros clientes consumen estos endpoints del whatsapp-service. Si no: eliminarlos.
2. Si algún flujo interno lo necesita, mover la lógica a la API NestJS (fuente canónica) y dejar que el whatsapp-service consulte por ID vía Prisma.
3. Después de la limpieza, añadir test de contrato: GET `/public/leads` en whatsapp-service → 404.

**Criterio de aceptación:**
- No existen endpoints CRUD de leads en el whatsapp-service.
- La API NestJS es la única fuente de `/leads`.

---

#### T0.9 — Estabilizar pipeline CI y añadir gate de auditoría (NUEVO v5)

**Problema (verificado con `gh run list` el 2026-04-17):** los últimos **9 runs consecutivos de `CI/CD - LeadsCRM`** terminan en `failure`. Causa raíz: el step `Format Check` de `pnpm format:check` (prettier) encontraba 279 archivos sin formatear. Como los jobs posteriores declaran `needs: quality`, todos se cancelan en cascada (`build`, `test`, `security`, `performance` quedan `skipped`). El equipo aprende a ignorar el CI rojo, lo cual también invalida cualquier check futuro (incluido el de auditoría de esta PRD).

**Estado actual (cambios de v5):**
- Se creó `.prettierrc` (singleQuote en backend, doubleQuote en tsx/dashboard, printWidth 100, trailingComma all).
- Se creó `.prettierignore` (excluye `docs/**`, `*.md` raíz, `node_modules`, `.next`, `.turbo`, lock files, sesiones WhatsApp).
- Se ejecutó `pnpm format` → 243 archivos reformateados.
- `pnpm format:check` → "All matched files use Prettier code style!".
- `pnpm lint` → 5/5 éxitos (solo warnings pre-existentes, no errores).
- Nuevo script `scripts/audit-infra.ts` + entry `audit:infra` en `package.json`.
- Nuevo workflow `.github/workflows/audit-infra.yml` (`continue-on-error: true`, push/PR/cron semanal).

**Cambios requeridos para cerrar la tarea:**
1. Comitear el formateo masivo como un único commit `chore(format): apply prettier to code tree` (git blame queda limpio al tener un solo commit dedicado).
2. Configurar en GitHub Actions → Repository secrets:
   - `DATABASE_URL` — connection string de Supabase (Section A del audit).
   - `SUPABASE_PAT` — Personal Access Token (Section B).
   - `HCLOUD_TOKEN` — Hetzner Cloud API token (Section C).
   - `VERCEL_TOKEN` — Vercel REST API token (Section D).
3. Validar que el primer run post-push de `CI/CD - LeadsCRM` queda en verde end-to-end (quality → build → test → security → success).
4. Tras cerrar Fase 0 (T0.1–T0.8), editar `.github/workflows/audit-infra.yml` → `continue-on-error: false` para convertirlo en required check en main/develop.
5. Opcional: actualizar `ci.yml` para migrar Node 18 → 20/22 (Node 18 entra EOL en 2026-04-30) y añadir caché de Turborepo remote si el equipo tiene `TURBO_TOKEN`.

**Criterio de aceptación:**
- `CI/CD - LeadsCRM` en verde sobre el último commit de `develop` y `main`.
- `Infra Audit` workflow ejecutándose en cada PR y devolviendo SKIP/PASS/WARN/FAIL según secrets configurados.
- Artifact `audit-infra-report-${run_id}.txt` descargable desde cada run.

---

#### T0.8 — Aplicar patches de seguridad a Postgres (NUEVO v5)  ✅ CERRADA (Supabase upgrade 17.4.1.069 → 17.6.1.104 vía dashboard, 2026-04-17)

**Problema (verificado live 2026-04-17):** Supabase advisor de seguridad flagea `vulnerable_postgres_version` en `supabase-postgres-17.4.1.069`. Detalle del advisor:

> We have detected that the current version of postgres, supabase-postgres-17.4.1.069, has outstanding security patches available. Upgrade your database to receive the latest security patches.

Categoría `SECURITY`, nivel `WARN`, `facing: EXTERNAL`. Remediation: https://supabase.com/docs/guides/platform/upgrading

**Cambios requeridos:**
1. Programar ventana de mantenimiento (idealmente coordinado con T0.1 para evitar múltiples restarts).
2. En Supabase Dashboard → Settings → Infrastructure → Upgrade Postgres.
3. Verificar que Prisma client sigue funcionando tras upgrade (schema Prisma compatible con `17.x`).
4. Re-ejecutar `get_advisors({ type: "security" })` y confirmar que `vulnerable_postgres_version` desaparece.

**Criterio de aceptación:**
- Advisor `vulnerable_postgres_version` ya no aparece.
- API + WhatsApp Service operacionales tras upgrade.

---

### FASE 1 — Integridad de datos (Crítica)

> Dual-write confirmado con datos reales (17 en `messages` vs 38 en `whatsapp_conversations` — cifras infra).

#### T1.1 — Unificar la persistencia de conversaciones WhatsApp

**Problema:** Dual-write sin coordinación entre dos tablas con esquemas diferentes.

**Decisión aplicada (D1):** Mantener `whatsapp_conversations` como read model de enriquecimiento IA (no como fuente canónica paralela), vinculada a `messages` con FK.

**Estado actual (verificado):**
- WhatsApp Service escribe en `whatsapp_conversations` (`DatabaseService.ts:345-439`).
- API escribe en `messages` (`whatsapp.service.ts:105`).
- Tabla `ai_training_interactions` (19 filas — cifra infra) no está en Prisma schema.
- Tabla `migrations` legacy separada de `_prisma_migrations` (cifra infra).

**Cambios requeridos:**
1. Agregar `messageId` (FK) en `WhatsAppConversation` → `Message`.
2. Eliminar `messageText`/`responseText` duplicados de `whatsapp_conversations`.
3. Migrar escritura del WhatsApp Service: primero `Message` vía Prisma, luego `WhatsAppConversation` con referencia.
4. Actualizar `ContextEnricher` y `ConversationRepository` para JOIN con `messages`.
5. Agregar modelo `AiTrainingInteraction` al schema Prisma.
6. Limpiar tabla `migrations` legacy.

**Criterio de aceptación:**
- Mensaje entrante → 1 registro `messages` + 1 registro `whatsapp_conversations` con FK.
- Sin duplicación de texto entre tablas.
- Pipeline IA lee vía JOIN.

---

#### T1.2 — Corregir el seed de la base de datos

**Problema:** Schema drift — campos inexistentes, nombres incorrectos (verificado).

**Estado actual:** `packages/db/prisma/seed.ts`:
- `:17, 28` → `name` (no existe en `User`; debería usar `first_name`/`last_name`).
- `:19, 31` → `clerkId` (el schema usa `clerk_id` sin `@map`).
- `:52, 60, 83, 107, 122` → `type: "TEXT"` (el campo es `messageType`).
- `:54, 55, 56` → `sentiment`, `confidence`, `aiAnalyzed` — ninguno existe en el modelo `Message`.

**Cambios requeridos:**
1. Actualizar seed con campos reales del schema.
2. Incluir datos para `ai_knowledge_base` y `message_templates` (ambas vacías — cifra infra).
3. Verificar `pnpm db:reset` sin errores de compilación TypeScript ni runtime.

---

#### T1.3 — Corregir inconsistencias en el schema Prisma  ✅ CERRADA (commits `59628bd` + migración `t1_3_drop_duplicate_indexes_proactive_messages`, 2026-04-17)

**Problema (verificado):**
- **3 pares de índices duplicados** en `ProactiveMessage` (`schema.prisma:184-190`):
  - `createdAt`: `idx_proactive_created` vs `idx_proactive_messages_created_at`
  - `leadId`: `idx_proactive_lead` vs `idx_proactive_messages_lead_id`
  - `status`: `idx_proactive_messages_status` vs `idx_proactive_status`
- `WhatsAppWhitelistLog.leadId` tipo incorrecto (`schema.prisma:253` — `VarChar(255)` en vez de UUID).

**Cambios requeridos:**
1. Eliminar los 3 pares duplicados (mantener sólo el nombre consistente).
2. Cambiar `leadId` a `@db.Uuid`.
3. Migración sin pérdida (27 filas existentes — verificado live 2026-04-17 en `whatsapp_whitelist_logs`).

---

#### T1.4 — Limpiar migraciones Supabase huérfanas (NUEVO v5)  ✅ CERRADA (commit `59628bd` + migración `t1_4_drop_legacy_campaigns_tables`, 2026-04-17)

**Problema (verificado live 2026-04-17):** `supabase_migrations` contiene dos migraciones aplicadas cuyas tablas objeto no existen hoy:

- `20250821100704_create_campaigns_table` (2025-08-21)
- `20250821100720_create_campaign_leads_table` (2025-08-21)

Estas migraciones ejecutaron `CREATE TABLE campaigns` y `CREATE TABLE campaign_leads`, pero las tablas fueron `DROP`eadas sin migración reversa registrada. La búsqueda de "campaign" en el código devuelve 0 resultados, lo que confirma que el feature fue removido por completo en código pero el historial quedó desalineado con el schema real.

**Riesgo:**
- Confusión: futuras migraciones podrían asumir que `campaigns` existe.
- Drift de schema: si se ejecuta `supabase db reset` o similar, el estado puede ser inconsistente con Prisma.

**Cambios requeridos:**
1. Investigar los commits que removieron las tablas `campaigns` y `campaign_leads`.
2. Crear una migración explícita `20260417_drop_campaigns_legacy` que ejecute `DROP TABLE IF EXISTS campaigns` y `DROP TABLE IF EXISTS campaign_leads` (idempotente) y registre la intención.
3. O bien, marcar las dos migraciones huérfanas como revertidas en `supabase_migrations`.
4. Decidir la política del equipo: ¿`campaigns` es un feature aplazado que volverá? Si sí, documentar; si no, añadir `.gitignore`/comentario explicativo.

**Criterio de aceptación:**
- `supabase_migrations` refleja el estado real del schema.
- No hay ambigüedad sobre si `campaigns` volverá o no.

---

### FASE 2 — Código muerto y cableado (Alta prioridad)

#### T2.1 — Mover automatización al WhatsApp Service e integrar en pipeline IA

**Decisión aplicada (D2):** Ejecución en WhatsApp Service, gestión en API.

**Problema (verificado):** `AutomationService` en la API es código muerto.
- `apps/api/src/whatsapp/automation.service.ts:44` → clase con `@Injectable()`.
- `apps/api/src/whatsapp/whatsapp.module.ts:10` → `providers: [WhatsAppService, WhitelistService]` — **no incluye `AutomationService`**.
- `automation.service.ts:113-234` → 5 reglas hardcodeadas nunca se ejecutan.
- `automation.service.ts:450-465` → `assignToUser()` solo loguea, con TODO.

**Nota crítica (GPT-5.4):** La política de negocio CRM (whitelist, lead status, side effects) debe mantenerse centralizada. No solo mover código — definir claramente quién decide whitelist, lead status y efectos CRM.

**Cambios requeridos:**
1. Crear `AutomationEngine` en WhatsApp Service, integrado en `AIOrchestratorService`.
2. Reglas de automatización en DB (tabla `automation_rules` o `ai_configuration`).
3. Endpoints CRUD en API para gestionar reglas desde dashboard.
4. Eliminar `automation.service.ts` de la API.
5. Completar o eliminar `assignToUser()`.

**Criterio de aceptación:**
- Keyword match → respuesta automática desde WhatsApp Service.
- Reglas configurables desde DB.

---

#### T2.2 — Proteger, normalizar y testear endpoints de Templates

**Problema (verificado — los endpoints existen):** Los endpoints de templates existen inline en `apps/whatsapp-service/src/routes/index.ts`:
- `:806` → `GET /templates` — lista templates vía `DatabaseService.getMessageTemplates()`.
- `:830` → `POST /templates` — **tiene validación** de name/category/content en `:834`.
- `:872` → `PUT /templates/:id` — **sin validación**.
- `:908` → `DELETE /templates/:id` — sin validación.
- `:936` → `POST /templates/:id/preview` — sin validación.

El dashboard los consume vía proxy catch-all (`/api/whatsapp/templates`). Tabla `message_templates` con 0 filas (cifra infra).

**Endpoints AI de templates (nuevos a considerar):**
- `:1396` → `POST /templates/ai-suggest`
- `:1507` → `POST /templates/ai-improve`

Los AI endpoints consumen tokens de OpenRouter/Gemini; sin auth permiten exfiltración de cuota.

**Cambios requeridos:**
1. Uniformar validación en PUT y DELETE (name, category, content requeridos en PUT).
2. Proteger con middleware de auth (depende de T0.4-ter).
3. Integrar templates como opción en `AIOrchestratorService` (respuesta de template cuando intent coincide).
4. Agregar tests para CRUD.

**Criterio de aceptación:**
- Endpoints validados y protegidos.
- Test: crear template → listar → verificar que aparece.

---

#### T2.3 — Completar notificaciones de sesión + fix bug Socket.IO

**Problema (verificado):** Handlers de sesión en API solo hacen `console.log`. Bug de estados Socket.IO.

**Estado actual:**
- `apps/api/src/whatsapp/whatsapp.service.ts:140-158` — 3 handlers (`handleSessionAuthenticated`, `handleSessionDisconnected`, `handleStatusChange`) con TODOs.
- `apps/whatsapp-service/src/services/SocketService.ts:149` → `case 'auth_failure': return 'CONNECTING';`.
- La UI define `AUTH_INVALID` en `apps/dashboard/types/index.ts:145` y lo renderiza en `apps/dashboard/app/dashboard/whatsapp/page.tsx:59, 68, 1243, 1248, 1253, 1263`.
- `apps/dashboard/src/hooks/useSocket.ts:8` define un tipo local que NO incluye `AUTH_INVALID` (lista solo `CONNECTED`, `CONNECTING`, `DISCONNECTED`, `QR_PENDING`).

> **Nota v4:** la versión v3 citaba `useSocket.ts:8` como "el dashboard espera AUTH_INVALID" — era incorrecto. El estado `AUTH_INVALID` vive en `types/index.ts:145`; `useSocket.ts:8` tiene un tipo distinto y más restringido.

**Cambios requeridos:**
1. Implementar actualización de `WhatsAppSession.status` en DB en los 3 handlers.
2. Corregir mapeo de estados en `SocketService.ts:149`: `auth_failure` → `AUTH_INVALID`.
3. Unificar el tipo `WhatsAppSession.status` entre `src/hooks/useSocket.ts:8` y `types/index.ts:145`: ambos deben incluir `AUTH_INVALID`.
4. Verificar que el dashboard recibe el estado correcto.

**Criterio de aceptación:**
- Cambio de estado → DB actualizada.
- `auth_failure` se propaga como `AUTH_INVALID` al dashboard.
- El tipo en `useSocket.ts` es coherente con `types/index.ts`.

---

#### T2.4 — Proteger y añadir rate limiting por sesión a Bulk/Proactive Messaging

**Problema (verificado):** Los endpoints de bulk messaging existen en `routes/index.ts:976-1344` pero sin auth y con un rate limiting genérico insuficiente contra ban de WhatsApp.

**Estado actual (verificado):**
- `routes/index.ts:976` → `POST /proactive-messages` — validación de `leadId` y `content` en `:980`.
- `routes/index.ts:1148` → `POST /proactive-messages/bulk`.
- `routes/index.ts:1229-1232` → delay de 2000ms entre mensajes bulk.
- `apps/whatsapp-service/src/middleware/validation.ts:220-284` → rate limit global por IP: 300/min, **deshabilitado en `NODE_ENV=development`** (`:227`).
- `routes/index.ts:1308` → `GET /proactive-messages/stats`.

> **Nota v4:** v3 decía "sin rate limiting" — matizado: existe rate limit global por IP y delay 2s entre bulk; lo que **no existe** es cuota por sesión WhatsApp ni cuota horaria anti-ban.

**Cambios requeridos:**
1. Agregar middleware de auth (depende de T0.4-ter).
2. Implementar rate limiting **por sesión WhatsApp**: máximo configurable (default 200 msgs/hora para cuentas nuevas).
3. Configurar throttling adaptativo: delay creciente si la sesión tiene historial reciente de envíos.
4. Mejorar tracking de estado: PENDING → QUEUED → SENT → DELIVERED → FAILED.
5. Eliminar el bypass de rate limit global en dev o dejarlo solo en `NODE_ENV=test`.

**Criterio de aceptación:**
- Endpoints protegidos con auth.
- Rate limiting por sesión activo.
- Envío masivo no excede la cuota configurada por hora por sesión.

---

### FASE 3 — Consolidación y limpieza (Media prioridad)

#### T3.1 — Eliminar WhatsAppServiceRefactored y simplificar

**Decisión aplicada (D4):** Quedarse con Simple.

**Cambios requeridos:**
1. Eliminar `WhatsAppServiceRefactored` y componentes exclusivos.
2. Simplificar fachada `WhatsAppService`.
3. Eliminar toggles `USE_WHATSAPP_REFACTORED` y `USE_DATABASE_REPOSITORIES`.
4. **Corregir drift camelCase vs snake_case** en:
   - `apps/whatsapp-service/src/services/db/ConversationRepository.ts:27-39` — crea columnas `"sessionId"`, `"phoneNumber"`, `"messageText"`, `"responseText"`, `"messageType"`, `"isFromUser"`, `"createdAt"`, `"updatedAt"` en camelCase; el schema Prisma usa snake_case.
   - `apps/whatsapp-service/src/services/db/LeadRepository.ts:28` — define `"moodScore" INTEGER`; el schema Prisma usa `mood_score Decimal(3,2)`.

**Criterio de aceptación:**
- Una sola implementación activa.
- Sin feature toggles de selección.
- Nombres y tipos de columnas consistentes con schema Prisma.

---

#### T3.2 — Reducir `@leadcrm/ui` a lo necesario

**Decisión aplicada (D5):** Reducir o absorber en el dashboard.

**Estado actual (verificado):**
- 8 componentes exportados: `alert.tsx`, `badge.tsx`, `button.tsx`, `card.tsx`, `checkbox.tsx`, `code.tsx`, `input.tsx`, `toggle.tsx`.
- 2 archivos consumidores reales:
  - `apps/dashboard/app/dashboard/settings/page.tsx:6-7` → `Toggle`, `Alert`, `AlertTitle`, `AlertDescription`.
  - `apps/docs/app/page.tsx:1` → `Button`.
- Declarado como dependencia en `apps/dashboard/package.json:15` y `apps/docs/package.json:14`.

**Cambios requeridos:**
1. Absorber los 5 componentes realmente usados (`Alert`, `AlertTitle`, `AlertDescription`, `Toggle`, `Button`) en `apps/dashboard/components/ui/` y `apps/docs/components/` según corresponda.
2. Eliminar el package `@leadcrm/ui` del monorepo.
3. Remover la dependencia `workspace:*` de ambos `package.json`.

**Criterio de aceptación:**
- El monorepo no tiene `packages/ui`.
- `pnpm build` funciona sin referencias a `@leadcrm/ui`.

---

### FASE 4 — Escalabilidad y retención (Media prioridad)

#### T4.1 — Implementar soft delete y estrategia de retención

**Problema:** Cascade DELETE destruye historial (`schema.prisma:109` — `onDelete: Cascade`).

**Cambios requeridos:**
1. Añadir `deletedAt` (soft delete) a `Lead` y `Message`.
2. Actualizar queries para filtrar `WHERE deletedAt IS NULL`.
3. Cambiar cascade delete a SET NULL.

---

#### T4.2 — Implementar paginación real en conversaciones del dashboard

**Problema:** Carga todo sin paginar.

**Cambios requeridos:**
1. Scroll infinito o paginación con `limit`/`offset` que el backend ya soporta (`DatabaseService.getConversations(limit, offset)`).

---

#### T4.3 — Eliminar patrón N+1 en listado de conversaciones

**Problema:** `getAllLeads()` en cada request.

**Cambios requeridos:**
1. JOIN o `WHERE lead.id IN (...)`.

---

### FASE 5 — Testing y calidad (Prioridad continua)

#### T5.1 — Tests para el flujo core de leads

**Estado actual:** `apps/api/` tiene sólo `src/app.controller.spec.ts` (boilerplate).

**Cambios:** Tests de integración para `LeadsService` (mínimo 7 tests, uno por cada endpoint de `LeadsController`).

#### T5.2 — Tests para el flujo de WhatsApp webhook

**Estado actual:** `apps/whatsapp-service/src/tests/phase4-integration.test.ts` + 8 tests en `services/ai-thinking/__tests__/` — nada para el controller ni el webhook Nest.

**Cambios:** Tests para `handleIncomingMessage`, `isNumberAuthorized`, `sendMessage`, y el mecanismo de verificación del webhook (HMAC tras T0.4-bis).

---

## Resumen de priorización

| Fase | Tareas | Prioridad | Justificación |
|------|--------|-----------|---------------|
| **0 — Seguridad** | T0.1, T0.2, T0.3, T0.4, T0.4-bis, T0.4-ter, T0.5, T0.6, T0.7, T0.8, T0.9 | **Urgente** | Rutas debug con service role key, proxy abierto, RLS off con 0 policies, firewall abierto (22/80/443/3002/3003), webhook roto, `WhatsAppController` Nest sin guard, whatsapp-service Express sin auth, duplicación `/public/leads` en dos apps, Postgres con patches de seguridad pendientes, CI caído desde hace meses |
| **1 — Integridad de datos** | T1.1, T1.2, T1.3, T1.4 | **Crítica** | Dual-write confirmado (17 vs 38 filas divergentes, verificado live), migraciones huérfanas `campaigns`/`campaign_leads` |
| **2 — Cableado** | T2.1, T2.2, T2.3, T2.4 | **Alta** | Automatización muerta, templates/bulk sin auth, bug Socket.IO, rate limit insuficiente anti-ban |
| **3 — Consolidación** | T3.1, T3.2 | **Media** | Reducir 3 implementaciones a 1, fix naming drift repos, eliminar `@leadcrm/ui` |
| **4 — Escalabilidad** | T4.1, T4.2, T4.3 | **Media** | Preparar para crecimiento |
| **5 — Testing** | T5.1, T5.2 | **Continua** | Cada tarea anterior debe incluir tests |

---

## Orden de ejecución sugerido

```
Semana 1 (Seguridad — no rompe nada):
  T0.4 (eliminar debug + proteger proxies) → T0.4-bis (guard en WhatsAppController) →
  T0.4-ter (auth en whatsapp-service) → T0.1 (diseñar policies + habilitar RLS) →
  T0.8 (upgrade Postgres — ventana de mantenimiento) → T0.2 (firewall + reverse proxy)

Semana 2 (Seguridad — migración cuidadosa):
  T0.3 (migrar dashboard /public → /leads AUTH, luego eliminar public) →
  T0.7 (eliminar /public/leads del whatsapp-service) → T0.5 (webhook Clerk)

Semana 3 (Datos + Limpieza):
  T1.3 (fix schema índices + tipos) → T1.4 (limpiar migraciones huérfanas campaigns) →
  T1.2 (fix seed) → T3.1 (eliminar Refactored + fix naming repos)

Semana 4 (Unificación):
  T1.1 (unificar dual-write) → T2.3 (notificaciones sesión + fix Socket.IO)

Semana 5 (Protección de features existentes):
  T2.2 (normalizar templates) → T2.4 (rate limiting bulk por sesión) → T2.1 (automatización)

Semana 6+ (Escalabilidad + Tests):
  T4.1 → T4.2 → T4.3 → T3.2 (eliminar @leadcrm/ui) → T5.1 → T5.2
```

---

## Decisiones pendientes del Product Owner

| # | Decisión | Contexto |
|---|----------|----------|
| **T0.6** | ¿Hacer el repositorio privado en GitHub? | Código fuente, URLs de producción, y patrones de seguridad públicamente visibles |
| **T0.4-ter** | ¿Qué esquema de auth aplica al whatsapp-service?<br>(a) Clerk JWT desde el dashboard<br>(b) Shared secret HMAC desde la API<br>(c) Ambos | El servicio recibe tráfico de la UI (humano) y de la API (servicio) — decidir si ambos flujos pasan por la misma capa |

---

## Changelog del PRD

| Versión | Fecha | Cambios |
|---------|-------|---------|
| v1 | 2026-04-09 | Versión inicial basada en análisis de código |
| v2 | 2026-04-09 | Incorpora hallazgos de Supabase, Hetzner, Vercel, Clerk MCP. Agrega Fase 0 seguridad. Resuelve 5 decisiones arquitectónicas |
| v3 | 2026-04-09 | **Revisión cruzada GPT-5.4.** Correcciones: templates y bulk messaging ya existen (no faltantes). Nueva T0.4 (rutas debug + proxy abierto). T0.3 requiere migración previa del dashboard. Fix bug Socket.IO en T2.3. Fix naming drift en T3.1. T2.2 y T2.4 reformuladas de "crear" a "proteger y normalizar" |
| v4 | 2026-04-17 | **Auditoría claim-by-claim.** Tareas nuevas: T0.4-bis (guard en `WhatsAppController` Nest), T0.4-ter (auth en whatsapp-service Express), T0.7 (eliminar duplicación `/public/leads` del whatsapp-service). Correcciones: "14 ubicaciones" → 12 en 7 archivos; "6 tests ai-thinking" → 8; "1 consumer `@leadcrm/ui`" → 2 archivos (5 símbolos). Cita Socket.IO: `useSocket.ts:8` era incorrecto; el estado `AUTH_INVALID` vive en `types/index.ts:145`. Matices: POST `/templates` sí valida (PUT/DELETE no); rate limit global por IP existe + delay 2s bulk (falta cuota por sesión). Añadidos: proxies Next auxiliares sin auth (`api/whatsapp/stats`, `api/logs/whitelist`, `api/stats/whitelist`), matcher roto `/api/webhook` (singular), doble montaje router whatsapp-service (`/` y `/api`), rate limit deshabilitado en dev |
| v5 | 2026-04-17 | **Verificación live vía MCPs (Supabase, Hetzner, Vercel).** Tareas nuevas: **T0.8** (upgrade Postgres — advisor `vulnerable_postgres_version` activo), **T0.9** (CI caído desde hace meses por `Format Check` — fixed con `.prettierrc`/`.prettierignore`/`pnpm format` + workflow nuevo `audit-infra.yml`), **T1.4** (limpiar migraciones Supabase huérfanas `create_campaigns_table` y `create_campaign_leads_table` del 2025-08-21 sin tablas correspondientes). Ejecutable nuevo `scripts/audit-infra.ts` + entry `pnpm run audit:infra` convierte cada criterio de aceptación en check automatizable. |
| v5.1 | 2026-04-17 | **Fase 0 primera ola (commit `50cde96`).** Cerradas: **T0.4** (borradas las 3 rutas debug, 4 proxies ahora pasan por `requireClerkToken()`, matcher `/api/webhook` corregido a `/api/webhooks/(.*)`) y **T0.4-bis** (`@UseGuards(ClerkAuthGuard)` aplicado a `/whatsapp/send`, `/whatsapp/whitelist/stats`, `/whatsapp/whitelist/authorize`; webhook mantiene header check pendiente de HMAC en T0.4-ter). Audit fixes: endpoint de advisors Supabase corregido a `/v1/projects/{ref}/advisors/security` (antes `?type=security` devolvía 404) y check D1 de Vercel sustituido por "READY production deployment" (el campo `project.live` es poco fiable en plan Hobby). Resultado `Infra Audit` en CI: **6 pass / 1 warn / 9 fail / 0 skip** (antes: 1 pass / 2 warn / 11 fail / 1 skip). |
| v5.2 | 2026-04-17 | **Fase 0 segunda ola (commits `c668828` + `ce5b7bf`).** Cerradas: **T0.3** (dashboard migrado de `/public/leads` a `/leads` con Clerk JWT; nuevo helper `lib/auth/proxy-auth.ts`; proxies Next actualizados; hooks `useLeads`/`useLeadStats` usan fetcher autenticado; bulk-update movido a `/api/leads/bulk-update-whatsapp`), **T0.7** (eliminados GET/POST `/public/leads` y GET/POST/PATCH `/leads` del whatsapp-service; lead CRUD solo vive en la API Nest), **T2.1** (borrado `automation.service.ts` muerto). Añadido endpoint `@Patch(':id/whatsapp')` a `LeadsController` autenticado. Fix post-migración: removido filtro `assignedTo = userId` en `LeadsController.findAll`/`getStats` hasta que Clerk webhook pueble `users` (antes filtraba y devolvía lista vacía). Resultado `Infra Audit`: **9 pass / 1 warn / 6 fail / 0 skip**. |
| v5.3 | 2026-04-17 | **Fase 0 tercera ola (commit `59628bd` + migraciones Supabase).** Cerradas: **T1.3** (3 migraciones: `t1_3_whitelist_logs_lead_id_to_uuid` cambia `whatsapp_whitelist_logs.lead_id` de `varchar(255)` a `uuid` tras validar 113/113 UUID-shaped; `t1_3_drop_duplicate_indexes_proactive_messages` elimina `idx_proactive_messages_{created_at,lead_id,status}` dejando sólo los 4 índices canónicos; schema Prisma sincronizado) y **T1.4** (migración `t1_4_drop_legacy_campaigns_tables` hace `DROP TABLE IF EXISTS` explícito; audit A5 actualizado para aceptar cleanup migrations). Resultado `Infra Audit` local: **10 pass / 1 warn / 0 fail / 3 skip**. |
| v5.4 | 2026-04-17 | **Fase 0 cuarta ola (firewall Hetzner).** Cerrada **T0.2** completa vía `hetzner_set_firewall_rules` sobre `whatsapp-firewall` (id 10443894). Reglas finales: **SSH (22) → `83.46.152.0/24`** (opción B del PRD, ISP del operador); **HTTP (80) → `0.0.0.0/0`** (redirect a HTTPS); **HTTPS (443) → `0.0.0.0/0`** (reverse proxy); puertos 3002 y 3003 eliminados. Plan de recuperación documentado: si la IP del operador cae fuera del /24, usar Hetzner Cloud Console Web (acceso out-of-band al VPS) para editar el firewall. Validación post-cambio: `https://api.cromgod.space/ → 200`, `https://cromgod.space/ → 200`. Resultado `Infra Audit` esperado en CI: **C1 + C2 PASS**, total 13 pass / 1 warn / 1 fail (solo B1 Postgres vulnerable pendiente → T0.8). |
| v5.5 | 2026-04-17 | **Fase 0 quinta ola (Postgres upgrade).** Cerrada **T0.8** vía Supabase Dashboard: upgrade in-place de `supabase-postgres-17.4.1.069` → `17.6.1.104`. El proyecto pasó de `ACTIVE_HEALTHY` → `UPGRADING` → `ACTIVE_HEALTHY` con ~8 min de downtime real (dentro del máximo documentado "up to 1 hour"). Disk resized con el upgrade. **Irreversible** (no se puede volver a 17.4.x). Verificación post-upgrade: `get_advisors({type: "security"}).lints → []` (el advisor `vulnerable_postgres_version` desapareció); `https://api.cromgod.space/ → 200`; `https://cromgod.space/ → 200`; audit local 10 pass / 1 warn / 0 fail / 3 skip. Resultado `Infra Audit` esperado en CI: **15 pass / 1 warn / 0 fail / 0 skip**. El único item informativo restante es A2 (RLS off en 13 tablas, tracked bajo T0.1). |
| v5.6 | 2026-04-17 | **Fase 0 sexta ola (decisiones + Clerk webhook).** Cerrada **T0.6**: el PO decidió mantener el repo público (justificación: comodidad con Vercel Hobby; Vercel soporta repos privados, pero se respeta la decisión). Cerrada **T0.5**: endpoint de webhook creado en Clerk Development instance (`ins_31WLEulvioak3keE58HPWDIQ2Gu`) apuntando a `https://cromgod.space/api/webhooks/clerk` con eventos `user.created`/`user.updated`/`user.deleted`; signing secret inyectado en Vercel env vars del project `prj_3JGVC3KT0dnixeuZZwpcHTT0u3F6` como `CLERK_WEBHOOK_SECRET` con target `production,preview,development` (encrypted); redeploy del commit actual de main lanzado (`dpl_GSYsAQ6MBMnSTHYZjqw2g1zUeGde`). Fase 0 efectiva completada salvo T0.1 (RLS + policies) y T0.4-ter (HMAC webhook follow-up). | Hechos promovidos de "no verificable" a verificado: **13 tablas** en `public` (no 12); `rls_enabled: false` + `0 policies` confirmado en las 13; firewall `whatsapp-firewall` (id 10443894) con SSH/HTTP/HTTPS/3002/3003 todos `0.0.0.0/0` y `::/0`; IP pública `46.225.26.89`; server `whatsapp-service` corre **ambos servicios en la misma máquina**; Vercel project `dashboard` (`prj_3JGVC3KT0dnixeuZZwpcHTT0u3F6`), Node 24.x, producción = commit `467e83c` (2026-04-02) con commits posteriores no promovidos; `githubRepoVisibility: "public"` confirmado; Postgres `17.4.1.069` con patches pendientes. T0.1 refinado: habilitar RLS con 0 policies rompería Prisma — diseñar policies primero. T0.2 refinado con las reglas exactas del firewall y path de reverse proxy. Contexto de infraestructura reescrito con IDs reales |
