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

#### T0.1 — Habilitar RLS en Supabase (con policies)  🟡 DECISIÓN PO: aceptar WARN permanente (opción C, 2026-04-17)

**Decisión tomada:** el WARN del audit (A2 — "13 tablas con RLS off en `public`") se acepta como informativo permanente. La tarea NO se ejecuta en este ciclo de estabilización. Revisitar cuando el producto escale a multi-tenant real.

**Justificación (por qué es aceptable ahora):**
- El producto opera hoy con **1 usuario administrador** (el PO). No hay múltiples tenants, no hay aislamiento per-user que proteger.
- Todos los clientes que acceden a la DB usan rol con bypass RLS:
  - Prisma (API Nest + whatsapp-service) → connection string `postgres` / `service_role`
  - Supabase JS SDK en rutas Next (`webhooks/clerk`, `admin/migrate-users`, `bulk-update-whatsapp`) → `SUPABASE_SERVICE_ROLE_KEY`
  - Ningún cliente usa `anon` key ni Clerk JWT contra Supabase REST
- La autorización de negocio vive hoy en la **capa de aplicación** (Clerk guards en NestJS, `requireClerkToken` en Next proxies).
- Habilitar RLS sin policies no añadiría seguridad real hoy: los clientes existentes seguirían funcionando igual porque bypass, y nadie limitado intenta leer.

**Riesgo residual aceptado:**
- Si en el futuro se añaden clientes que usan rol limitado (anon Supabase client, Clerk JWT directo contra PostgREST) sin configurar policies, podrían acceder a datos que no deberían.
- Mitigación: la revisión previa a añadir cualquiera de esos flujos debe incluir diseño de policies. El audit A2 sirve de recordatorio.

**Cuándo reabrir la tarea (triggers):**
1. Se suma segundo usuario al equipo → multi-tenant isolation empieza a tener sentido.
2. Se decide exponer PostgREST (`supabase.from('table').select()`) desde el cliente.
3. Se integra un JWT template Clerk → Supabase para queries cliente-side.
4. Una auditoría externa marca RLS off como blocker.

**Alternativa de implementación, para futuro (opción A del planning):** habilitar RLS en las 13 tablas con una policy uniforme `service_role_all` por tabla. Es idempotente, no rompe nada y deja preparada la ruta para multi-tenant. SQL pattern:

```sql
ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.{table}
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

**Contexto del audit:** el script `scripts/audit-infra.ts` reporta esto como WARN (no FAIL), por lo que no bloquea el gate CI. El scorecard permanece **15 pass / 1 warn / 0 fail / 0 skip** que es el estado limpio esperado.

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

#### T1.1 — Unificar la persistencia de conversaciones WhatsApp ✅ cerrada end-to-end (v5.18, Phases A+B)

**Problema:** Dual-write sin coordinación entre dos tablas con esquemas diferentes.

**Decisión aplicada (D1):** Mantener `whatsapp_conversations` como read model de enriquecimiento IA (no como fuente canónica paralela), vinculada a `messages` con FK.

**Divergencia verificada live (2026-04-17):**
- `messages`: 23 filas
- `whatsapp_conversations`: 58 filas (antes v4 decía 17 vs 38 — la divergencia crece en cada mensaje no pareado)
- Huérfanos: 35 filas en `whatsapp_conversations` sin equivalente en `messages`, resultado del cross-service dual-write (whatsapp-service escribe en `wc`, API Nest escribe en `messages` via webhook; cuando el webhook falla o el whitelist rechaza, `wc` queda poblado y `messages` no).

**Scope real auditado:**
- Writers a `whatsapp_conversations`: `DatabaseService.saveConversation()` (escritor principal, SQL directo) con call-sites en `WhatsAppService.ts:414`, `whatsapp-core/MessageHandler.ts:208,222,269,295`. Cada call es **una fila individual** con `messageText` XOR `responseText` según `isFromUser` — no una interacción pareada como decía el PRD v4.
- Readers: `DatabaseService.getConversationHistory()` consumido por `ai-thinking/ContextEnricher.ts:90` y `ai-thinking/analysis/ContextEnricher.ts:88`.
- `ai_training_interactions`: 9 columnas verificadas live (`user_message`, `ai_response`, `knowledge_base_ids_used text[]`, `success_score numeric`, `context_data jsonb`, `feedback_metrics jsonb`, timestamps).
- `migrations` legacy: 2 filas de hotfixes de septiembre 2025 (`001_fix_whitelist_table_structure`, `002_fix_whitelist_logs_schema_final`), seguras para drop.

**Phase A — No destructiva (v5.15) ✅:**
1. **Migration Supabase `t1_1_phase_a_add_message_id_fk`**: `ALTER TABLE whatsapp_conversations ADD COLUMN message_id uuid NULL REFERENCES messages(id) ON DELETE SET NULL` + index `idx_whatsapp_conversations_message_id`. FK verificada post-apply (`whatsapp_conversations_message_id_fkey`).
2. **Schema Prisma actualizado**:
   - `WhatsAppConversation`: añadido `messageId String? @map("message_id") @db.Uuid` + relation `message Message?` + index.
   - `Message`: añadida back-relation `whatsappConversations WhatsAppConversation[]`.
   - **Nuevo modelo `AiTrainingInteraction`** con los 9 campos reflejados desde la tabla existente.
3. `pnpm db:generate:win` aplicado (retry 3x por bloqueo `EPERM` de query-engine mientras NestJS dev estaba corriendo).
4. Typecheck OK en `@leadcrm/api` y `@leadcrm/whatsapp-service`.

**Phase B — T1.1-bis:**
1. **Paso 1 — Writer unificado ✅ (v5.16):** `DatabaseService.saveConversation` reescrito usando `PrismaClient` + `$transaction` atómica. Crea `Message` primero (content canónico según `isFromUser`, direction INBOUND/OUTBOUND, leadId resuelto por phone si existe) y luego `WhatsAppConversation` con `messageId` apuntando al message recién creado. Si el teléfono no matchea lead, ambas filas quedan con `leadId = NULL`. Validado con script `apps/whatsapp-service/scripts/test-unified-write.ts` contra DB live: insert → 1 message + 1 wc con FK válida → cleanup. No destructivo: los 5 call-sites (`WhatsAppService.ts:414`, `whatsapp-core/MessageHandler.ts:208/222/269/295`) no cambian su firma; el refactor vive dentro de `saveConversation`. Los campos duplicados `messageText`/`responseText` **siguen poblándose** hasta que los readers migren (paso 3).
2. **Paso 2 — Backfill de huérfanos históricos ✅ (v5.17):** intento de matching contra `messages` dio 0 matches (las 23 filas en `messages` eran todas del seed T1.2, las 58 en `wc` eran de una conversación real previa con el lead Eduard `cf6a5a7e`/`34604906249`). El plan pivoteó a **copy-forward**: el script `apps/whatsapp-service/scripts/backfill-orphan-conversations.ts` crea una fila nueva en `messages` por cada huérfano, copiando `message_text → content`, `is_from_user → direction`, y preservando `created_at`/`updated_at`. Luego actualiza `wc.message_id` con el id del message recién creado, dentro de una transacción Prisma. Idempotente (sólo procesa filas donde `message_id IS NULL`). Ejecución live: 58/58 migrados, 0 skipped, 0 huérfanos, 81 messages totales (23 seed + 58 backfill), 58 `wc` con FK válida. Verificado vía Supabase MCP.
3. **Paso 3 — Reader migrado ✅ (v5.17):** `DatabaseService.getConversationHistory` reescrito con Prisma (`findMany + include: { message: { select: { content: true, direction: true } } }`). Prefiere `message_text`/`response_text` legacy si están poblados; cae al `message.content` via el FK si no. Esto hace que el reader funcione antes y después del paso 4 destructivo. Los callers en `ai-thinking/ContextEnricher.ts` y `ai-thinking/analysis/ContextEnricher.ts` no necesitan cambios — el shape `ConversationHistory` se preserva. Validado con `scripts/test-reader-join.ts`: trae las 5 últimas interacciones con Eduard (34604906249) con content no vacío en todas las filas.
4. **Paso 4 — DROP columnas duplicadas ✅ (v5.18, autorizado por PO 2026-04-18):** Migration `t1_1_bis_step_4_5_drop_legacy_columns_and_migrations_table` eliminó `message_text` y `response_text` de `whatsapp_conversations`. Schema Prisma actualizado. 6 sites de SQL raw en `DatabaseService.ts` migrados a Prisma (`findMany + include`) o a JOIN `LEFT JOIN messages m ON m.id = wc.message_id`: `saveConversation.create`, `getConversationHistory`, `getRecentContext`, `searchConversations`, `getRecentConversations`, `getConversations` (CTE), `getConversationMessages`, y el CREATE TABLE defensivo. Verificación post-migration: `message_text_exists: false`, `response_text_exists: false`, ambos smoke tests (writer + reader) vuelven a PASS.
5. **Paso 5 — DROP tabla legacy `migrations` ✅ (v5.18, autorizado por PO 2026-04-18):** El primer intento de DROP falló: aunque la tabla se eliminó, `MigrationService` (legacy, ~260 líneas, invocado desde `DatabaseService.initializeTable`) la recreaba automáticamente al arrancar el whatsapp-service con `CREATE TABLE IF NOT EXISTS migrations`. Solución: eliminar `apps/whatsapp-service/src/services/MigrationService.ts` + el método `runMigrations()` en `DatabaseService` + su llamada en `initializeTable()`. Prisma (`_prisma_migrations`) queda como única fuente de migraciones. Aplicada una segunda migration `t1_1_bis_step_5_drop_legacy_migrations_table` tras eliminar el servicio. Verificación: `legacy_migrations_exists: false`.

**Criterio de aceptación de T1.1 completo — todos cumplidos (v5.18):**
- Mensaje entrante → 1 registro `messages` + 1 registro `whatsapp_conversations` con FK no-null ✅ (writer unificado desde v5.16).
- Sin duplicación de texto entre tablas ✅ (`message_text` y `response_text` dropped en v5.18).
- Pipeline IA lee vía JOIN ✅ (reader y 5 queries SQL migrados a Prisma `include`/SQL `LEFT JOIN messages`).
- Legacy `migrations` table + `MigrationService` eliminados ✅.
- Verificación live post-DROPs: 82 messages, 59 wc, 59/59 linked (100%), columnas eliminadas, tabla legacy eliminada, smoke tests writer+reader PASS.

---

#### T1.2 — Corregir el seed de la base de datos ✅ cerrada (v5.13)

**Problema original:** Schema drift en `packages/db/prisma/seed.ts` — `name` (no existe en User), `clerkId` (schema usa `clerk_id` sin @map), `type` (campo real es `messageType`), y `sentiment`/`confidence`/`aiAnalyzed` inexistentes en Message.

**Hallazgo extra (audit v5.13):** el seed usaba `prisma.user.upsert({ where: { email: ... } })` pero **el schema User sólo tiene `clerk_id` como @unique**, no `email`. El upsert por email nunca habría funcionado aunque los nombres de campos fueran correctos.

**Fix aplicado:**
1. Campos renombrados a los reales: `first_name`/`last_name`, `clerk_id`, `messageType`; eliminados `sentiment`/`confidence`/`aiAnalyzed`.
2. Uso de enums Prisma en lugar de strings: `LeadStatus.NUEVO`, `MessageType.TEXT`, `MessageDirection.INBOUND`, `MessageStatus.SENT` — el typechecker ahora detecta regresiones futuras.
3. Upsert por `clerk_id` (la única constraint unique disponible) en vez de `email`.
4. Leads upsert por `phone` (unique) en vez de `create` — permite re-ejecución sin violar el constraint.
5. `ai_knowledge_base` y `message_templates`: patrón `count() + createMany({ skipDuplicates: true })` para que el seed sea idempotente sin unique natural disponible (sólo `id` es unique).
6. `assignedTo: agentUser.clerk_id` (antes `agentUser.clerkId` devolvía undefined en runtime).

**Criterio de aceptación:** ✅
- Campos del schema correctos — typecheck con `@prisma/client` generado pasa.
- Idempotente: segunda ejecución no crea duplicados (verificado live, ver validación).
- Incluye seeds para knowledge y templates.

**Validación end-to-end (Supabase MCP + ejecución real):**
- 1ª corrida: 2 users, 12 leads (5 nuevos sobre 7 previos), 23 messages (6 nuevos sobre 17 previos), 3 knowledge (antes 0), 1 template (ya existía, skip).
- 2ª corrida (idempotencia): mismas cuentas, logs `already has 3 rows — skipping seed` y `already has 1 rows — skipping seed`.
- SQL de verificación confirma categorías `products`/`pricing`/`support` con los títulos esperados.

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

#### T2.2 — Proteger, normalizar y testear endpoints de Templates ✅ cerrada (v5.11)

**Problema original:** endpoints CRUD de templates inline en `apps/whatsapp-service/src/routes/index.ts` sin autenticación; sólo POST validaba, PUT/DELETE/preview quedaban sin validación. El dashboard llamaba directo a `${getWhatsAppUrl()}/templates` sin Bearer token.

**Líneas reales (audit v5.11, antes del fix):**
- `:534` → `GET /templates`
- `:558` → `POST /templates` (validaba name/category/content)
- `:600` → `PUT /templates/:id`
- `:636` → `DELETE /templates/:id`
- `:664` → `POST /templates/:id/preview`
- `:1079` → `GET /templates/variables` (listado de placeholders; mantenido en whatsapp-service por depender de `DatabaseService.getAvailableTemplateVariables`)
- `:1124` → `POST /templates/ai-suggest`
- `:1235` → `POST /templates/ai-improve`

> Nota: las líneas `:806`/`:830`/`:872`/`:908`/`:936` citadas en v3/v4 estaban desplazadas por inserciones intermedias; la auditoría v5.11 las actualizó al estado real al momento del fix.

**Fix aplicado (patrón T0.3/T0.7 — mover a Nest Api autenticado):**
1. Nuevo `TemplatesModule` en `apps/api/src/templates/*`:
   - `TemplatesController` con `@UseGuards(ClerkAuthGuard)` + `@ApiBearerAuth()` expone `GET /templates`, `GET /templates/:id`, `POST /templates`, `PATCH /templates/:id`, `DELETE /templates/:id`, `POST /templates/:id/preview`.
   - DTOs con `class-validator`: `CreateTemplateDto` (name/category/content requeridos, maxLength en name/category/subject), `UpdateTemplateDto` (PartialType + isActive), `PreviewTemplateDto`, `TemplatesQueryDto` con transform boolean para `activeOnly`.
   - `TemplatesService` encima de Prisma (`messageTemplate`) con preview que sustituye `{{variable}}` y retorna `missingVariables[]`.
2. Dashboard migrado (7 archivos en total):
   - `contexts/TemplateContext.tsx`: CRUD ahora pasa por `process.env.NEXT_PUBLIC_API_URL/templates` con `Authorization: Bearer ${clerkToken}`. `updateTemplate` usa `PATCH` (Nest) en vez de `PUT`.
   - `app/dashboard/templates/page.tsx`: 4 fetch directos (list/create/update/delete) migrados al mismo patrón con `useAuth().getToken()` + `authHeaders` callback.
   - `app/dashboard/messaging/page.tsx`: 4 fetch directos (list/leads/template CRUD) migrados; `/leads` también apunta ahora al Nest.
   - `app/dashboard/whatsapp/page.tsx`: listado de templates migrado.
   - `components/proactive/BulkSendMessageModal.tsx`: refresh de templates migrado.
   - `components/templates/AdvancedPreview.tsx`: preview via `POST /templates/:id/preview` migrado; también `fetchLeads` ahora llama al Nest. El campo del response cambió de `previewContent` a `rendered` (alineado con la semántica del `TemplatesService.preview`).
   - `components/templates/AIAssistant.tsx` y `components/templates/VariablePicker.tsx`: llamadas directas a `${getWhatsAppUrl()}` reemplazadas por proxy `/api/whatsapp/...` que ya pasa por `requireClerkToken()`.
3. `apps/whatsapp-service/src/routes/index.ts`: eliminadas las 5 rutas CRUD/preview (`-171` líneas). Quedan sólo `/templates/variables` (lookup) y los AI endpoints, ahora expuestos únicamente vía proxy autenticado del Next.

**AI endpoints (`ai-suggest`, `ai-improve`):** siguen en whatsapp-service porque dependen de `AIThinkingService` local. El acceso desde internet pasa siempre por el proxy autenticado del dashboard (`/api/whatsapp/*`), que aplica `requireClerkToken()`. Un refuerzo HMAC directo entre Nest↔whatsapp-service queda tracked bajo **T0.4-ter** (follow-up no crítico).

**Criterio de aceptación (todos cumplidos):**
- CRUD templates protegido con Clerk JWT (Nest ClerkAuthGuard).
- Validación uniforme en create/update (class-validator, fallo 400 con mensaje descriptivo).
- Dashboard funcionando con Bearer token; AI/preview via proxy autenticado.

**Validación:** typecheck OK en `@leadcrm/api`, `@leadcrm/dashboard`, `@leadcrm/whatsapp-service`; Prettier limpio. Browser test end-to-end en `http://localhost:3001/dashboard/templates`: 4 GETs a `localhost:3003/templates?activeOnly=false → 200` + OPTIONS preflight `204`, **cero** hits residuales a `localhost:3002/templates`; render de la UI con templates cargados (botones Editar/Eliminar/Crear Template visibles).

**Nota de shape:** para evitar breaking changes en los consumers existentes, el `TemplatesController` envuelve las responses en `{ success: true, data }` (compat con el shape anterior del whatsapp-service). Se conserva además un alias `PUT /templates/:id` que delega en el handler PATCH para clientes que aún no migren.

---

#### T2.3 — Completar notificaciones de sesión + fix bug Socket.IO ✅ cerrada (v5.10)

**Problema (verificado):** Handlers de sesión en API solo hacen `console.log`. Bug de estados Socket.IO.

**Estado final (post-fix):**
- `apps/api/src/whatsapp/whatsapp.service.ts:140-206` — los 3 handlers (`handleSessionAuthenticated`, `handleSessionDisconnected`, `handleStatusChange`) ahora actualizan `WhatsAppSession` vía `prisma.whatsAppSession.update({ where: { sessionId }, data: { status, lastSeen, lastError, ... } })` con try/catch para no romper el webhook si la fila no existe.
- `apps/whatsapp-service/src/services/SocketService.ts:144-159` — `mapStatusToFrontend` separa los casos: `connecting → CONNECTING`, `auth_failure → AUTH_INVALID`. Coherente con el mapa ya existente en `SessionController.mapStatusToDashboard` (:95-109).
- `apps/dashboard/src/hooks/useSocket.ts:8` — tipo local extendido a `CONNECTED | CONNECTING | DISCONNECTED | AUTH_INVALID | QR_PENDING | QR_READY`, ahora superconjunto de lo que emite el backend y alineado con `types/index.ts:138`.

> **Nota auditoría v4:** `useSocket.ts:8` sí tiene tipo local; el canónico de la UI está en `types/index.ts:138` e incluye `AUTH_INVALID` y `QR_READY`. El fix v5.10 unifica ambos para evitar drift futuro.
> **Hallazgo v5.10:** el bug de mapeo **solo** vivía en `SocketService` (servicio Express→dashboard vía Socket.IO). El otro mapa, `SessionController.mapStatusToDashboard`, ya era correcto. Eran dos copias divergentes del mismo switch.

**Criterio de aceptación:** ✅ todos cumplidos
- Cambio de estado → DB actualizada (Prisma update idempotente con fallback log si la sesión no existe).
- `auth_failure` se propaga como `AUTH_INVALID` al dashboard.
- El tipo en `useSocket.ts` es coherente con `types/index.ts` (ambos listan los mismos 6 estados).

**Validación:** `pnpm --filter @leadcrm/{api,whatsapp-service,dashboard} typecheck` pasa limpio; Prettier sin warnings en los 3 archivos tocados.

---

#### T2.4 — Proteger y añadir rate limiting por sesión a Bulk/Proactive Messaging ✅ cerrada parcial (v5.12)

**Problema original:** endpoints de proactive/bulk messaging sin cuota por sesión WhatsApp; el rate limit existente era por IP y se bypaseaba completo en `NODE_ENV=development`.

**Estado real al momento del fix (líneas actualizadas tras T2.2):**
- `routes/index.ts:543` → `POST /proactive-messages`.
- `routes/index.ts:715` → `POST /proactive-messages/bulk`.
- `routes/index.ts:795-799` → delay fijo de 2000ms entre mensajes bulk.
- `middleware/validation.ts:220-284` → rate limit global por IP (300/min, bypass dev).

**Fix aplicado (v5.12):**
1. **Nuevo middleware `rateLimitBySession`** en `middleware/validation.ts:288-386`. In-memory `Map<sessionId, number[]>` con ventana rodante de 1h; cuota configurable via `WHATSAPP_MAX_MSGS_PER_HOUR_PER_SESSION` (default `200`, conservador para cuenta nueva). Cuenta **optimista**: reserva `leadIds.length` slots al aceptar el request, no al confirmar envío (un retry fallido también puede gatillar el ban). Para bulk hace fail-closed: si `current + batchSize > quota`, rechaza el batch completo con 429, `retryAfter` (segundos hasta que libere el slot más viejo) y metadata (`sessionId`, `quotaPerHour`, `usage`, `attemptedBatch`).
2. **Throttle adaptativo**: el middleware escribe `req.sessionThrottle = { throttleFactor: 1|2|4 }` según uso (>80% → 2x, >90% → 4x). El handler de `/proactive-messages/bulk` lo usa para multiplicar el delay base de 2s entre mensajes.
3. **Aplicado a**: `POST /proactive-messages` (batchSize=1) y `POST /proactive-messages/bulk`.
4. **Bypass `rateLimit` global IP**: cambiado de `NODE_ENV === 'development'` a `NODE_ENV === 'test'` en `middleware/validation.ts:227`. Desarrollo local ahora respeta los 300/min (suficientemente permisivo; solo tests automatizados conservan el bypass).

**Cambios NO aplicados (fuera de scope — tracked en follow-ups):**
- Auth middleware (punto 1 original) → depende de T0.4-ter (HMAC Nest↔whatsapp-service). De momento el acceso desde internet ya pasa por el proxy autenticado `/api/whatsapp/*` de Next (T0.4), que aplica `requireClerkToken()`.
- Tracking de estado (PENDING → QUEUED → SENT → DELIVERED → FAILED) (punto 4 original): tracked separadamente; no es bloqueador anti-ban.

**Validación end-to-end (browser + curl directo contra :3002):**
- Happy path: `POST /proactive-messages/bulk` con 5 leadIds inexistentes → 200 OK, body `{successful:0, failed:5}` (middleware pasó, 5 slots reservados para `t24-happy`).
- Stress: segundo burst con 196 leadIds en la misma sesión → **429** con `"Cuota de 200 mensajes/hora alcanzada para la sesión 't24-happy'. Usadas 5, intento de 196."`, `retryAfter: 3597`. Persistencia del contador confirmada.
- Stress sin warm-up: 201 leadIds en sesión fresca → **429** inmediato con `usage: 0, attemptedBatch: 201`.
- `POST /proactive-messages` con lead inexistente → 404 "Lead not found" (middleware pasó; happy path no roto).

**Criterio de aceptación:**
- Rate limiting por sesión activo ✅.
- Envío masivo no excede la cuota configurada por hora por sesión ✅ (verificado con stress test).
- Endpoints protegidos con auth: parcial — auth en internet via proxy Next, HMAC directo bajo T0.4-ter.

---

### FASE 3 — Consolidación y limpieza (Media prioridad)

#### T3.1 — Eliminar WhatsAppServiceRefactored y simplificar ✅ cerrada (v5.14)

**Decisión aplicada (D4):** Quedarse con Simple.

**Auditoría live al momento del fix:** exploración exhaustiva de `apps/whatsapp-service/src/services/` reveló que:
- `WhatsAppServiceRefactored.ts` nunca se instanciaba (toggle `USE_WHATSAPP_REFACTORED` default `false`, `.env` sin el key).
- Directorio `src/services/whatsapp/` tenía **7 archivos muertos** (`SessionManager`, `ConnectionManager`, `ContactManager`, `EventHandler`, `MediaHandler`, `MessageProcessor`, `index.ts`) paralelos a `whatsapp-core/`, pero **2 archivos vivos** (`WhatsAppStatsService`, `RedisMonitoringService`) importados por la fachada. Falsa dicotomía del PRD v3 — hay que borrar los 7 y preservar los 2.
- `whatsapp-core/` (5 módulos: `AuthenticationManager`, `ConnectionManager`, `EventDispatcher`, `MessageHandler`, `SessionManager`) está **vivo** — es el stack del `WhatsAppServiceSimple`. `EventDispatcher.ts:192-219` es el emisor de `auth_failure` que consume `SocketService` tras el fix de T2.3; **NO tocado**.
- Toggle `USE_DATABASE_REPOSITORIES` se conserva (out of scope en este paso) — los repositories en `services/db/*` siguen existiendo pero inactivos por default.

**Fix aplicado:**
1. Borrados 8 archivos muertos: `WhatsAppServiceRefactored.ts` + 7 de `services/whatsapp/`.
2. Fachada `WhatsAppService.ts` simplificada: eliminado el toggle `useRefactoredService`, el campo `refactoredService`, el import de `WhatsAppServiceRefactored`, y las 7 ramas `if (this.useRefactoredService && ...) { ... } else { ... }` (cada una colapsa en la rama `simpleService.*` que ya era la activa).
3. `.env.example`: `USE_WHATSAPP_REFACTORED` eliminado del bloque de feature flags, con nota `T3.1` explicativa.
4. **Fix drift DDL en repositories** (scope que pide el PRD explícitamente):
   - `ConversationRepository.ts:23-48` → columnas en snake_case (`session_id`, `phone_number`, `contact_name`, `message_text`, `response_text`, `message_type`, `ai_provider`, `tokens_used`, `is_from_user`, `created_at`, `updated_at`) + indices actualizados.
   - `LeadRepository.ts:19-46` → `mood_score DECIMAL(3,2)` (antes `"moodScore" INTEGER CHECK [0..100]`), `last_contact`, `assigned_to`, `whatsapp_authorized`, `created_at`/`updated_at` en `TIMESTAMPTZ`; `tags JSONB`; enum de status en lowercase (`new|contacted|...`) alineado con los `@map` del schema Prisma.
   - Nota: los `CREATE TABLE IF NOT EXISTS` son defensivos — las tablas reales las crea Prisma; el fix alinea el fallback por si el toggle `USE_DATABASE_REPOSITORIES` algún día se activa.

**Validación end-to-end:**
- `pnpm --filter @leadcrm/{api,dashboard,whatsapp-service} typecheck` pasa limpio tras borrar 8 archivos y reescribir la fachada.
- `curl http://localhost:3002/health → 200` — el servicio sigue arrancando con la fachada simplificada.
- Re-ejecución del stress test T2.4: 201 leadIds → **429** `SESSION_RATE_LIMIT_EXCEEDED` intacto (confirma que la eliminación no rompió el rate limit por sesión).
- Fix de T2.3 preservado: los handlers de `auth_failure` en `whatsapp-core/EventDispatcher.ts` quedan intactos y el `SocketService.ts:144-159` sigue mapeando a `AUTH_INVALID`.

**Criterio de aceptación:** ✅
- Una sola implementación activa (`WhatsAppServiceSimple`) — sí.
- Sin feature toggle de selección de implementación WhatsApp — sí (eliminado `USE_WHATSAPP_REFACTORED`).
- Nombres y tipos de columnas consistentes con schema Prisma — sí, en los DDLs citados por el PRD.

**Follow-ups fuera de scope (seguirán tracked):**
- Migrar los `INSERT`/`SELECT` de los repositories a snake_case (hoy sólo el DDL + indices están alineados). Se activará junto con T1.1 si el toggle se enciende.
- Eliminación completa de `USE_DATABASE_REPOSITORIES` + directorio `services/db/*` — depende de la dirección que tome T1.1 (dual-write).

---

#### T3.2 — Reducir `@leadcrm/ui` a lo necesario ✅ cerrada (v5.19)

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

#### T4.1 — Implementar soft delete y estrategia de retención ✅ cerrada (v5.20)

**Problema original:** Cascade DELETE destruye historial (`schema.prisma` — `onDelete: Cascade` en 3 FKs que apuntan a `leads`).

**Fix aplicado:**
1. Migration `t4_1_soft_delete_and_relax_cascade_fks`: `ADD COLUMN deleted_at TIMESTAMPTZ` en `leads` y `messages` (+ índices); las 3 FKs que referencian `leads` (`messages.lead_id`, `proactive_messages.lead_id`, `whatsapp_conversations.lead_id`) bajadas de `ON DELETE CASCADE` a `ON DELETE SET NULL` — red de seguridad si algún día se hace hard delete, no destruye historial.
2. Schema Prisma: `Lead.deletedAt` + `Message.deletedAt` + índices `idx_leads_deleted_at` / `idx_messages_deleted_at`; 3 relations con `onDelete: SetNull` (antes `Cascade`).
3. `LeadsService`:
   - `remove`: ahora hace `update({ data: { deletedAt: new Date() } })` en vez de `delete`.
   - `findAll` / `findOne` / `getStats`: filtros `deletedAt: null` añadidos.
4. Validación live con `apps/api/scripts/test-soft-delete.ts`: crea lead temporal → soft delete → findMany con `deletedAt: null` devuelve 0 ✓ → raw count en DB = 1 con `deleted_at` poblado ✓ → cleanup (hard delete del test) → PASS.

**Criterio de aceptación:** ✅
- Lead soft-deleted no aparece en listados.
- Historial (messages/conversaciones) sobrevive al soft delete.
- FKs relajadas permiten hard delete defensivo sin destruir historial.

---

#### T4.2 — Implementar paginación real en conversaciones del dashboard ✅ cerrada (v5.21)

**Problema original:** `WhatsAppConversations.tsx` traía todo en una llamada sin pasar `limit`/`offset`.

**Fix aplicado:** `apps/dashboard/components/WhatsAppConversations.tsx` ahora mantiene `offset` + `hasMore` + `isLoadingMore` state. `fetchConversations(nextOffset, reset)` usa `limit=PAGE_SIZE=25` + `offset=nextOffset`, y append vs replace según `reset`. Heurística: `hasMore = batch.length === PAGE_SIZE`. Botón "Cargar más" al final de la lista con spinner cuando `isLoadingMore`. `refreshData` resetea a `offset=0`.

---

#### T4.3 — Eliminar patrón N+1 en listado de conversaciones ✅ cerrada (v5.21)

**Problema original:** `DatabaseService.getConversations` hacía `const leads = await this.getAllLeads()` y luego `leads.find(...)` por cada fila — escaneo O(N × M) con M = todos los leads del tenant.

**Fix aplicado:** el CTE ahora contiene un `LEFT JOIN leads l ON l.deleted_at IS NULL AND RIGHT(REGEXP_REPLACE(l.phone, '[^0-9]', '', 'g'), 10) = RIGHT(REGEXP_REPLACE(lm.phone_number, '[^0-9]', '', 'g'), 10)`, devolviendo `lead_id`/`lead_name`/`lead_phone`/`lead_status` en cada fila. El mapper en JS se simplificó a `row.lead_id ? {...} : fallback`. La llamada a `getAllLeads()` + `find()` fue eliminada. Incluye filtro `deleted_at IS NULL` (T4.1).

**Validación live:** `curl :3002/api/conversations?limit=5` devuelve 3 conversaciones; la del phone `34604906249` se vincula a Eduard (`lead_id = cf6a5a7e...`, status `contacted`); phones sin lead reciben el fallback `{id: 'unknown'}`.

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
| v5.6 | 2026-04-17 | **Fase 0 sexta ola (decisiones + Clerk webhook).** Cerrada **T0.6**: el PO decidió mantener el repo público (justificación: comodidad con Vercel Hobby; Vercel soporta repos privados, pero se respeta la decisión). Cerrada **T0.5**: endpoint de webhook creado en Clerk Development instance (`ins_31WLEulvioak3keE58HPWDIQ2Gu`) apuntando a `https://cromgod.space/api/webhooks/clerk` con eventos `user.created`/`user.updated`/`user.deleted`; signing secret inyectado en Vercel env vars del project `prj_3JGVC3KT0dnixeuZZwpcHTT0u3F6` como `CLERK_WEBHOOK_SECRET` con target `production,preview,development` (encrypted); redeploy del commit actual de main lanzado (`dpl_GSYsAQ6MBMnSTHYZjqw2g1zUeGde`). Fase 0 efectiva completada salvo T0.1 (RLS + policies) y T0.4-ter (HMAC webhook follow-up). |
| v5.7 | 2026-04-17 | **Fase 0 cierre (decisión T0.1).** El PO eligió la **opción C** para T0.1: aceptar el WARN de audit A2 como informativo permanente y no ejecutar la habilitación de RLS en este ciclo. Justificación: operación con 1 usuario administrador, todos los clientes de DB bypass RLS por diseño, la autorización de negocio vive en la capa de aplicación (Clerk guards + `requireClerkToken`). Triggers documentados para reabrir: segundo usuario, exposición de PostgREST, JWT Clerk→Supabase, auditoría externa. **Fase 0 efectivamente cerrada** — el único pendiente técnico es **T0.4-ter** (HMAC entre Nest y whatsapp-service, follow-up de endurecimiento, no crítico). Scorecard estable `Infra Audit`: **15 pass / 1 warn (A2 aceptado) / 0 fail / 0 skip**. |
| v5.8 | 2026-04-17 | **Fix post-T0.5 (GRANT service_role).** Al probar el webhook de Clerk end-to-end con Send Example, el handler `api/webhooks/clerk` devolvía 200 pero no insertaba en `public.users`. Diagnóstico: PostgREST con `SUPABASE_SERVICE_ROLE_KEY` (JWT con `role: service_role`) devolvía `HTTP 403 "permission denied for schema public"`. La causa: en proyectos Supabase nuevos, el rol `service_role` **no tiene por defecto** `GRANT` sobre el schema `public`; solo `postgres` tiene privileges en las tablas. Mientras Prisma (que se conecta con rol `postgres` via `DATABASE_URL`) funcionaba sin problema, el SDK Supabase JS usado en rutas Next se quedaba fuera. Fix aplicado con migration `grant_service_role_access_public_schema`: `GRANT USAGE ON SCHEMA public`, `GRANT SELECT/INSERT/UPDATE/DELETE/REFERENCES/TRIGGER/TRUNCATE ON ALL TABLES`, `GRANT USAGE/SELECT/UPDATE ON ALL SEQUENCES`, `GRANT EXECUTE ON ALL FUNCTIONS`, más `ALTER DEFAULT PRIVILEGES` para que nuevas tablas hereden los grants automáticamente. Post-fix, curl de prueba contra `/rest/v1/users` devuelve `HTTP 201` con la fila creada. |
| v5.21 | 2026-04-18 | **T4.2 + T4.3 cerradas (paginación + N+1 fix).** T4.2: `WhatsAppConversations.tsx` con state `offset`/`hasMore`/`isLoadingMore`, `fetchConversations(offset, reset)` con `limit=25`, botón "Cargar más" al final, heurística `hasMore = batch.length === PAGE_SIZE`. T4.3: `DatabaseService.getConversations` elimina la llamada `getAllLeads()` + `find()` O(N*M); el CTE ahora hace `LEFT JOIN leads l ON l.deleted_at IS NULL AND RIGHT(REGEXP_REPLACE(l.phone, '[^0-9]', '', 'g'), 10) = RIGHT(...)` devolviendo lead_id/name/phone/status en la misma row. Validación live: `curl :3002/api/conversations?limit=5` → Eduard aparece vinculado a lead `cf6a5a7e` (status `contacted`), phones sin lead reciben fallback `{id: 'unknown'}`. |
| v5.20 | 2026-04-18 | **T4.1 cerrada (soft delete + FKs relajadas).** Migration `t4_1_soft_delete_and_relax_cascade_fks`: `deleted_at TIMESTAMPTZ` añadida a `leads` y `messages` + índices; las 3 FKs `lead_id` en `messages`, `proactive_messages`, `whatsapp_conversations` rebajadas de `ON DELETE CASCADE` a `ON DELETE SET NULL`. Schema Prisma sincronizado (Lead.deletedAt, Message.deletedAt, `onDelete: SetNull` x3). LeadsService.remove ahora marca `deletedAt` en vez de borrar; findAll/findOne/getStats filtran `deletedAt: null`. Validación live con `scripts/test-soft-delete.ts`: soft delete → listado devuelve 0, raw count en DB = 1 con deleted_at poblado → PASS. |
| v5.19 | 2026-04-18 | **T3.2 cerrada (eliminar `@leadcrm/ui`).** Verificación: sólo 2 consumers reales — `apps/dashboard/app/dashboard/settings/page.tsx:6-7` (Toggle, Alert, AlertTitle, AlertDescription) y `apps/docs/app/page.tsx:1` (Button); el Button en docs era **import huérfano** (nunca se usaba en el JSX). Solución: copiar `alert.tsx` y `toggle.tsx` a `apps/dashboard/components/ui/` apuntando el import de `cn` al `apps/dashboard/lib/utils.ts` existente (versión con `twMerge`, mejor que la del package); actualizar el import de settings/page.tsx a los paths locales; eliminar el import huérfano de docs/page.tsx; quitar `"@leadcrm/ui": "workspace:*"` de `apps/dashboard/package.json` y `apps/docs/package.json`; `git rm -rf packages/ui` (14 archivos); `pnpm install`. Validación: typecheck OK en dashboard + docs; render de `/dashboard/settings` en browser muestra los 2 Toggle components (role=switch) funcionando, 0 console errors. |
| v5.18 | 2026-04-18 | **T1.1-bis pasos 4+5 cerrados (DROPs destructivos, dual-write cerrado end-to-end).** Autorizados por el PO. Paso 4: migration `t1_1_bis_step_4_5_drop_legacy_columns_and_migrations_table` elimina `message_text` y `response_text` de `whatsapp_conversations`; schema Prisma sincronizado; 6 sites de SQL raw en `DatabaseService.ts` migrados a Prisma `findMany + include` o a JOIN `LEFT JOIN messages m ON m.id = wc.message_id` (saveConversation, getConversationHistory, getRecentContext, searchConversations, getRecentConversations, getConversations CTE, getConversationMessages) + DDL defensivo. Paso 5: primer DROP de `public.migrations` no persistió porque `MigrationService.ts` (legacy, 260 líneas) la recreaba al arrancar vía `CREATE TABLE IF NOT EXISTS migrations`; solución: eliminar el archivo + `runMigrations()` del `initializeTable()`; segunda migration `t1_1_bis_step_5_drop_legacy_migrations_table` aplicada tras la limpieza. Verificación live: `message_text_exists: false`, `response_text_exists: false`, `legacy_migrations_exists: false`, 82 messages, 59 wc (100% linked), writer+reader smoke tests PASS. Prisma (`_prisma_migrations`) queda como única fuente de migraciones. |
| v5.17 | 2026-04-18 | **T1.1-bis pasos 2+3 cerrados (backfill + reader JOIN).** El matching contra `messages` existentes dio 0 matches (data disjunta: las 23 filas eran del seed T1.2, las 58 huérfanas venían de una conversación real previa con el lead Eduard `cf6a5a7e`/34604906249). Pivot a **copy-forward**: nuevo `scripts/backfill-orphan-conversations.ts` crea una fila canónica en `messages` por cada huérfano preservando timestamps, y actualiza `wc.message_id`. Live: 58/58 migrados, 0 huérfanos restantes, 81 messages totales, 58 wc con FK válida. **Reader migrado**: `getConversationHistory` reescrito con Prisma `findMany + include: { message }`. Prefiere `message_text`/`response_text` legacy si existen; cae a `message.content` via el FK si no. Callers (ContextEnricher x2) no cambian — shape `ConversationHistory` preservado. Validado con `scripts/test-reader-join.ts`: 5 interacciones con Eduard, content no vacío en todas. Quedan pasos 4 (DROP COLUMN message_text/response_text) y 5 (DROP TABLE public.migrations), ambos destructivos, pendientes de autorización explícita del PO. |
| v5.16 | 2026-04-18 | **T1.1-bis paso 1 cerrado (writer unificado).** `apps/whatsapp-service/src/services/DatabaseService.ts`: `saveConversation` reescrito con `PrismaClient` + `$transaction` atómica. Determina `content` canónico según `isFromUser` (XOR messageText/responseText), resuelve `leadId` por `phone` (sin crear leads nuevos), crea `Message` con direction INBOUND/OUTBOUND, y acto seguido crea `WhatsAppConversation` con `messageId` apuntando al message recién creado. Nueva función `toPrismaMessageType` mapea el string libre del shape legacy a la enum Prisma (`TEXT`/`IMAGE`/`AUDIO`/`VIDEO`/`DOCUMENT`). Ningún call-site cambia (los 5 pueden seguir enviando el mismo `ConversationData`). Validación end-to-end con `apps/whatsapp-service/scripts/test-unified-write.ts`: 1 message (INBOUND) + 1 wc con `messageId` vinculado al message → PASS → cleanup. Detiene la divergencia para escrituras nuevas; los 58 huérfanos históricos quedan pendientes de backfill (paso 2). Typecheck OK. Columnas `message_text`/`response_text` siguen poblándose hasta migrar readers (paso 3). |
| v5.15 | 2026-04-17 | **T1.1 Phase A cerrada (FK + modelo AiTrainingInteraction).** Migration Supabase `t1_1_phase_a_add_message_id_fk` añade `whatsapp_conversations.message_id uuid NULL` + FK `ON DELETE SET NULL` + index. Schema Prisma: `WhatsAppConversation.messageId` con relation a `Message`; back-relation `whatsappConversations[]` en `Message`; nuevo modelo `AiTrainingInteraction` (9 campos reflejados de la tabla existente). `pnpm db:generate:win` con retry 3x por bloqueo EPERM mientras el server NestJS estaba arriba. Typecheck OK en api + whatsapp-service. Phase B (refactor writers/readers + backfill + DROP columnas legacy + DROP tabla `migrations`) tracked como T1.1-bis — el DROP de `public.migrations` fue bloqueado por safety policy y requiere autorización explícita. Divergencia al momento del fix: `messages=23` vs `whatsapp_conversations=58` (35 huérfanos). Hallazgo contra PRD v4: cada fila de `wc` es un mensaje individual (no una interacción pareada), porque los 5 call-sites de `saveConversation` siempre pasan `messageText` XOR `responseText` según `isFromUser`. |
| v5.14 | 2026-04-17 | **T3.1 cerrada (eliminar Refactored + drift DDL).** Borrados 8 archivos muertos: `WhatsAppServiceRefactored.ts` + 7 módulos paralelos de `services/whatsapp/` (`SessionManager`, `ConnectionManager`, `ContactManager`, `EventHandler`, `MediaHandler`, `MessageProcessor`, `index.ts`). `WhatsAppStatsService.ts` y `RedisMonitoringService.ts` preservados (importados por la fachada). `WhatsAppService.ts` reescrito: colapsadas las 7 ramas `if (useRefactoredService) { ... } else { ... }` a la rama SimpleService que ya era la activa; toggle + campo `refactoredService` eliminados. `.env.example`: `USE_WHATSAPP_REFACTORED` eliminado con nota T3.1. DDL fix en `ConversationRepository.ts:23-48` (11 columnas camelCase → snake_case + indices) y `LeadRepository.ts:19-46` (`mood_score DECIMAL(3,2)`, `last_contact`, `assigned_to`, `whatsapp_authorized`, `TIMESTAMPTZ`, `tags JSONB`, enum status lowercase). Validación live: typecheck OK en los 3 paquetes; `/health → 200`; stress test T2.4 replay (201 leadIds → 429) sigue pasando tras el refactor — prueba que ni `whatsapp-core/` ni el path del Socket.IO T2.3 se rompieron. Follow-up: `USE_DATABASE_REPOSITORIES` y migración INSERT/SELECT de repositories queda bundled con T1.1. |
| v5.13 | 2026-04-17 | **T1.2 cerrada (seed idempotente).** `packages/db/prisma/seed.ts` reescrito: campos reales del schema (`first_name`/`last_name`/`clerk_id`/`messageType`; eliminados `sentiment`/`confidence`/`aiAnalyzed`); enums Prisma en vez de strings; `user.upsert` por `clerk_id` (antes usaba `email` que no es @unique); `lead.upsert` por `phone`; `ai_knowledge_base` y `message_templates` con `createMany({ skipDuplicates: true })` condicional a `count() === 0`. Hallazgo extra auditado: el seed anterior hubiera fallado en runtime incluso corrigiendo los nombres, porque el `where: { email }` del upsert de users no hubiera encontrado el constraint unique. Validación live vía Supabase MCP: 1ª corrida crea 2 users + 3 knowledge; 2ª corrida idempotente (skip explícito). Totales tras seed: 2 users, 12 leads, 23 messages, 3 knowledge, 1 template. |
| v5.12 | 2026-04-17 | **T2.4 cerrada parcial (rate limit por sesión WhatsApp).** Nuevo middleware `rateLimitBySession` en `apps/whatsapp-service/src/middleware/validation.ts` con in-memory `Map<sessionId, timestamps[]>`, ventana rodante 1h, cuota default 200 msgs/h configurable via `WHATSAPP_MAX_MSGS_PER_HOUR_PER_SESSION`. Fail-closed para bulk: batch se rechaza completo si no cabe. Conteo optimista: reserva slots al aceptar, no al confirmar envío (anti-ban). Throttle adaptativo vía `req.sessionThrottle.throttleFactor` (1/2/4 según uso >80% / >90%) multiplica el delay base de 2s en el loop de `/proactive-messages/bulk`. Aplicado a `POST /proactive-messages` y `POST /proactive-messages/bulk`. Bypass del `rateLimit` global IP cambiado de `NODE_ENV === 'development'` → `NODE_ENV === 'test'`. Validación con curl: batch de 201 leadIds devuelve 429 inmediato; burst de 5 pasa y burst siguiente de 196 en misma sesión devuelve 429 con `usage: 5` (persistencia del contador confirmada). Typecheck OK 3 paquetes. Pendiente follow-up: auth directo Nest↔whatsapp-service tracked bajo T0.4-ter. |
| v5.11-bis | 2026-04-17 | **T2.2 post-audit browser.** Tras levantar front local y abrir `/dashboard/templates`, el `Network` tab reveló 5 consumers adicionales llamando a `:3002/templates` (`templates/page.tsx` CRUD x4, `messaging/page.tsx` CRUD x4, `whatsapp/page.tsx` list, `BulkSendMessageModal.tsx` list, `AdvancedPreview.tsx` preview+leads). Migrados al mismo patrón Bearer/Nest. El `TemplatesController` envuelve responses en `{ success, data }` para compat de shape; se añade alias `PUT /templates/:id` que delega en PATCH. `AdvancedPreview.tsx`: campo `previewContent` renombrado a `rendered` para alinearse con el servicio. Browser retest: 4 × `GET /templates?activeOnly=false → 200`, cero 404s contra `:3002`. |
| v5.11 | 2026-04-17 | **T2.2 cerrada (Templates auth + Nest CRUD).** Nuevo `TemplatesModule` en `apps/api/src/templates/*` con `ClerkAuthGuard` + DTOs validados (`class-validator`) + preview con `missingVariables[]`. Dashboard `TemplateContext.tsx` reescrito para consumir `NEXT_PUBLIC_API_URL/templates` con Bearer Clerk (patrón de `use-leads.ts`). `AIAssistant.tsx` + `VariablePicker.tsx`: llamadas directas a `${getWhatsAppUrl()}` migradas al proxy `/api/whatsapp/*` que aplica `requireClerkToken()`. `apps/whatsapp-service/src/routes/index.ts`: eliminadas las 5 rutas CRUD/preview (`-171` líneas en bruto; conservadas `/templates/variables`, `/templates/ai-suggest`, `/templates/ai-improve` que dependen de servicios locales). Auditoría inline: las líneas del PRD v3/v4 estaban desplazadas (`:534` en vez de `:806`); reemplazadas con las cifras reales al momento del fix. Follow-up tracked: refuerzo HMAC Nest↔whatsapp-service bajo T0.4-ter. Validación: typecheck OK en los 3 paquetes, Prettier limpio. |
| v5.10 | 2026-04-17 | **T2.3 cerrada (Socket.IO + handlers DB).** `apps/whatsapp-service/src/services/SocketService.ts:144-159`: separado el `case 'auth_failure'` del `'connecting'`; ahora retorna `AUTH_INVALID` coherente con la UI. `apps/dashboard/src/hooks/useSocket.ts:8`: tipo local extendido con `AUTH_INVALID` y `QR_READY` para ser superconjunto de `types/index.ts:138`. `apps/api/src/whatsapp/whatsapp.service.ts:140-206`: los 3 handlers (`handleSessionAuthenticated`, `handleSessionDisconnected`, `handleStatusChange`) persisten el status via `prisma.whatsAppSession.update({ where: { sessionId }, data: { status, lastSeen, lastError, connectedNumber? } })` con try/catch para no romper el webhook si la sesión no existe. Validación: typecheck OK en `@leadcrm/api`, `@leadcrm/dashboard`, `@leadcrm/whatsapp-service`; Prettier limpio. Hallazgo de auditoría: el bug de mapeo sólo vivía en `SocketService.mapStatusToFrontend`; `SessionController.mapStatusToDashboard:95-109` ya era correcto — dos copias divergentes del mismo switch reconciliadas. |
| v5.9 | 2026-04-17 | **Validación end-to-end T0.5.** Tras el GRANT, el webhook respondía 200 pero `public.users` seguía vacía. Se añadió un patch temporal de debug al handler (`debug(webhook): include execution path in response body`) y se hizo un POST firmado con svix/openssl a `https://cromgod.space/api/webhooks/clerk` usando payload válido: devolvió `{"ok":true,"debug":{"step":"inserted","id":"<uuid>"}}` con fila real en DB — **handler funciona perfecto**. Diagnóstico del Send Example: el payload sintético de Clerk viene con `email_addresses: []` (array vacío) + `primary_email_address_id` como string sin objeto real asociado; el handler tiene un early-return `no_primary_email` que dispara 200 pero no inserta — **comportamiento correcto**. El Send Example no es representativo de un `user.created` real (en producción Clerk siempre incluye al menos 1 email). Verificación end-to-end real: registrar un usuario en `https://cromgod.space/sign-up`, ver su fila aparecer automáticamente en `public.users`. Se revirtió el patch de debug (`Revert "debug(webhook)..."`) para no exponer estructura interna en el response body en producción. Fila de test eliminada. | Hechos promovidos de "no verificable" a verificado: **13 tablas** en `public` (no 12); `rls_enabled: false` + `0 policies` confirmado en las 13; firewall `whatsapp-firewall` (id 10443894) con SSH/HTTP/HTTPS/3002/3003 todos `0.0.0.0/0` y `::/0`; IP pública `46.225.26.89`; server `whatsapp-service` corre **ambos servicios en la misma máquina**; Vercel project `dashboard` (`prj_3JGVC3KT0dnixeuZZwpcHTT0u3F6`), Node 24.x, producción = commit `467e83c` (2026-04-02) con commits posteriores no promovidos; `githubRepoVisibility: "public"` confirmado; Postgres `17.4.1.069` con patches pendientes. T0.1 refinado: habilitar RLS con 0 policies rompería Prisma — diseñar policies primero. T0.2 refinado con las reglas exactas del firewall y path de reverse proxy. Contexto de infraestructura reescrito con IDs reales |
