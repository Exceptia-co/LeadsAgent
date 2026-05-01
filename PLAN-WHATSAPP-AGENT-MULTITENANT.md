# Plan: WhatsApp Agent Multi-Tenant + IA Configurable

- **Fecha inicio:** 2026-04-19
- **Última revisión:** 2026-05-01 (v7.5 — B1 PR1 foundation schema additive-only implementado en `feature/b1-foundation-schema`)
- **Estado del documento:** cerrado para ejecución. §§1–11 son la única fuente de verdad. Validado por Codex en 12 rondas de review + auto-crítica anti-overkill. Ruta de ejecución: **completa**
- **Estado:** **Fase A desplegada + fix double-init mergeado + B1 PR1 foundation schema commiteado**. PR1 B1 schema está en `feature/b1-foundation-schema` (commit `364979a`) y es estrictamente additive-only a nivel SQL. Importante: el runtime con Prisma Client generado **sí requiere** que la DB tenga esa migration aplicada; no arrancar API/dashboard de esta rama contra una DB vieja.
- **Ruta seleccionada:** Completa (§§1–11)
- **Owner:** Eduard S.
- **Precede a:** `PRD-ESTABILIZACION.md` (cerrado 2026-04-18)
- **Rama sugerida:** `feature/whatsapp-agent-multitenant`
- **Cliente WhatsApp:** `whatsapp-web.js` (decisión explícita — **no** se migrará a WhatsApp Business API en este plan)

---

## 1. Objetivo

Convertir `apps/whatsapp-service` en una plataforma SaaS multi-tenant donde:

1. Cada **cliente final** (organización en Clerk) gestiona sus propias sesiones WhatsApp, leads y base de conocimiento de forma aislada.
2. Cada sesión puede tener un **"Agente IA"** configurable — nombre del negocio, sitio web, servicios, tono, instrucciones custom — que compone dinámicamente el system prompt (estilo Interviewman / Claude Projects / OpenAI Assistants). Los agentes son reusables: un cliente puede tener varios agentes y asignarlos a distintas sesiones.
3. Los hotfixes de seguridad/robustez P0 detectados en la auditoría quedan aplicados: deduplicación, filtro de grupos/status, typing indicator, unificación de `saveConversation`, validación de envs, gestión sana de errores no capturados.
4. La arquitectura mantiene `whatsapp-web.js` y se prepara para **escalar a 50–200 clientes** con clustering + monitor de memoria; con un roadmap explícito hacia WhatsApp Business API cuando el volumen lo justifique.

---

## 2. Hallazgos que motivan el plan

Investigación del 2026-04-19 sobre `apps/whatsapp-service/`, `packages/db/prisma/schema.prisma`, Hetzner Cloud, Supabase y Clerk + análisis comparativo de mercado (Wati, Respond.io, OpenAI Assistants, Claude Managed Agents, patrones Clerk+Supabase RLS).

### 2.1 Infraestructura actual

| Recurso           | Valor                                                              | Fuente                       |
| ----------------- | ------------------------------------------------------------------ | ---------------------------- |
| VPS Hetzner       | 1× `CX23` — 2 vCPU, **4 GB RAM**, 40 GB disk, Nuremberg `nbg1-dc3` | MCP Hetzner `list_servers`   |
| Nombre/IP         | `whatsapp-service` / `46.225.26.89`                                | Ídem                         |
| Sistema           | Ubuntu 24.04                                                       | Ídem                         |
| Techo práctico    | **~5–8 sesiones concurrentes** (Chromium ≈ 300–400 MB/sesión)      | Estimación empírica          |
| Supabase Postgres | 17.6.1.104, región eu-west-3, `ACTIVE_HEALTHY`                     | MCP Supabase `list_projects` |

### 2.2 Estado de datos en Supabase (snapshot 2026-04-19)

```
sessions_total:      24
sessions_active:      1
leads_total:         12
messages_total:      88
conversations_total: 62
kb_active:            3
users_total:          2
ai_config_rows:       0   ← tabla existe y está vacía
```

Lectura: proyecto en **fase piloto**. Ventana ideal para cambios arquitectónicos sin migración dolorosa.

### 2.3 Bloqueadores identificados

| #   | Bloqueador                                        | Evidencia                                                                                                | Impacto                                               |
| --- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| B1  | No existe multi-tenancy                           | `schema.prisma` sin `Tenant`/`Organization`/`ownerId` en `leads`/`whatsapp_sessions`/`ai_knowledge_base` | Dos clientes verían los mismos leads                  |
| B2  | System prompt hardcoded para **EscortsHub.net**   | `SystemPromptService.ts:82-134` (paquetes HUB, precios EUR, URL concreta)                                | SaaS no vendible a otros sectores                     |
| B3  | Clerk Organizations no integrado                  | `grep` vacío para `clerkClient.organizations`, `useOrganization`, `orgId`                                | No hay camino a multi-tenancy                         |
| B4  | `ai_knowledge_base` global sin FK a sesión/tenant | `schema.prisma:134-148`                                                                                  | Clientes compartirían conocimiento                    |
| B5  | Sin deduplicación de mensajes entrantes           | `EventDispatcher.ts:313-362` no chequea `message.id`                                                     | Riesgo de responder dos veces                         |
| B6  | Sin filtro de grupos / status@broadcast           | `EventDispatcher.ts:334` sólo mira `fromMe + body.trim()`                                                | IA respondería en grupos                              |
| B7  | Doble `saveConversation` sin unificar             | `MessageHandler.ts:208,222`                                                                              | No usa el FK del PRD Fase 1                           |
| B8  | Envs sin validación en bootstrap                  | `bootstrap` arranca aunque falte `WHATSAPP_SERVICE_HMAC_SECRET`                                          | Fallos tardíos en prod                                |
| B9  | `process.exit(1)` en `unhandledRejection`         | `index.ts:12-22`                                                                                         | Una excepción tira TODAS las sesiones                 |
| B10 | KB única compartida, `ai_configuration` vacía     | `DatabaseService` consulta pero nadie escribe                                                            | Espacio disponible para mover el prompt sin migración |

### 2.4 Hallazgos del análisis de mercado

- **Wati** (industry leader WhatsApp SaaS) escaló con **GKE + WhatsApp Business API oficial**, no con whatsapp-web.js. Business API es industry-standard para SaaS serio.
- **whatsapp-web.js** tiene memory leaks documentados en 2026 (issues #3957, #5817, #5728). ~70 clientes = ~20 GB RAM. Detached frame errors cada 1–2h en producción.
- **Clerk publica guía oficial** de integración multi-tenant con Supabase B2B: JWT claim `org_id` + RLS policies. Es patrón bendecido, no invento nuestro.
- **OpenAI Assistants SDK v2** y **Claude Managed Agents (beta abr 2026)** coinciden en el patrón: un "Agent" tiene `instructions` + `tools` + `model` configurables y reusables.
- **Indexar columnas de RLS policies** es requisito de performance (docs Supabase).

---

## 3. Fuera de alcance (de este plan)

- Rediseño completo del dashboard.
- RAG con embeddings vectoriales (se puede añadir después sin romper el plan).
- Streaming de respuestas a WhatsApp (el canal no lo soporta bien).
- Migración del `AIService` a Vercel AI SDK v6 (posible después; no bloquea).
- Internacionalización (i18n) completa del dashboard (ver §11 roadmap).
- **Políticas de retención + GDPR + archiving de mensajes**: necesarias pero no bloqueantes del MVP. Se tratan en Fase D (tasks D5–D6).
- **Migración a WhatsApp Business API oficial** — se documenta en §11 como siguiente frontera, pero **no** se implementa en este plan.

---

## 4. Arquitectura propuesta

### 4.1 Modelo de datos (diff sobre `schema.prisma`)

**Decisión arquitectónica clave (v5):** introducimos tabla interna `Tenant` con UUID PK propio. Desacoplamos del `org_id` de Clerk (que es string `org_xxxxx`, no UUID) y ganamos flexibilidad futura (billing, plan, migrar de Clerk si hace falta).

```
 Clerk Organization (externa)  ← sistema de auth
    │  (org_id string tipo "org_2abc123")
    │
    ▼
 Tenant (NUEVA, interna)                      ← fuente de verdad multi-tenancy
    ├─ id UUID PK
    ├─ clerk_org_id VARCHAR(40) UNIQUE        (mapeo 1:1 con Clerk; string, no UUID)
    ├─ name VARCHAR                           (copia del nombre de la org Clerk)
    ├─ plan enum(free|pro|enterprise)
    ├─ settings jsonb
    ├─ created_at, updated_at
    │
    │  Todas las tablas tenant-scoped apuntan aquí vía tenant_id:
    ├── WhatsAppSession        +tenant_id  +ai_agent_id (FK opcional)
    ├── Lead                   +tenant_id   ← @@unique([tenant_id, phone])  (NO global)
    ├── Message                +tenant_id
    ├── WhatsAppConversation   +tenant_id  +whatsapp_session_id UUID FK real (relation a WhatsAppSession)
    ├── ProactiveMessage       +tenant_id
    ├── MessageTemplate        +tenant_id                    (v6: tenant-scoped — era global)
    ├── WhatsAppWhitelistLog   +tenant_id
    ├── AiTrainingInteraction  +tenant_id
    ├── ai_configuration       +tenant_id (nullable — permite configs globales; policy RLS especial §4.4)
    │
    └── AiAgent (NUEVA)  N-por-tenant
         │
         │  ── IDENTIDAD ──
         ├─ tenant_id (FK Tenant)
         ├─ name                          (ej: "Sales EscortsHub", "Support InmobiliariaX")
         ├─ business_name, industry, website_url
         ├─ logo_url varchar               (opcional, para dashboard)
         ├─ business_hours jsonb           (ej: {mon:["09:00-18:00"], sat:[], sun:["closed"]})
         │
         │  ── PERSONALIDAD ──
         ├─ persona_name
         ├─ tone enum(formal|casual|friendly|sales|support)
         ├─ language enum(es|en|pt|fr)
         ├─ allow_emojis boolean (default true)
         ├─ response_max_words int (default 80)
         │
         │  ── INSTRUCCIONES Y ESCALACIÓN ──
         ├─ custom_instructions text
         ├─ escalation_rules text
         │
         │  ── GOAL / CONVERSIÓN ──
         ├─ primary_goal enum(register|purchase|meeting|contact|custom)
         ├─ goal_cta_url varchar           (ej: https://escortshub.net/sign-up)
         ├─ goal_description text          (ej: "Convierte al lead invitándolo a registrarse…")
         │
         │  ── LLM ──
         ├─ llm_provider enum(openrouter|gemini|null→default)
         ├─ llm_model varchar(100)         (ej: "openai/gpt-oss-120b"; null → default del provider)
         ├─ enable_structured_extraction boolean (default false, feature flag Fase E Capa [10])
         │
         ├─ is_active boolean
         │
         ├── AiProduct (NUEVA — catálogo estructurado de productos/servicios)
         │    ├─ ai_agent_id (FK)
         │    ├─ name varchar
         │    ├─ description text
         │    ├─ price_min numeric(10,2), price_max numeric(10,2)  (rango; price_max=price_min si es fijo)
         │    ├─ currency varchar(3)        (ej: "EUR", "USD", "HUB")
         │    ├─ url varchar                (landing del producto)
         │    ├─ image_url varchar          (opcional)
         │    ├─ sort_order int             (orden en catálogo)
         │    ├─ tags text[]                (ej: ["premium","promo","destacado"])
         │    └─ is_active boolean
         │
         ├── AiKnowledgeItem (rename de ai_knowledge_base)
         │    ├─ ai_agent_id (FK)
         │    ├─ type enum(service|faq|pricing|policy|website)
         │    ├─ title, content, keywords, priority
         │    └─ is_active
         │
         └── WebsiteSource (opcional, Fase D)
              ├─ url, last_scraped_at
              └─ scraped_chunks[]
```

**Cardinalidad clave:** `AiAgent` es **N-por-tenant**; cada `WhatsAppSession` puede elegir qué agente usa mediante `ai_agent_id`. Un cliente puede tener varios agentes (ej: Sales, Support, Recovery) y asignar sesiones distintas a cada uno, o compartir un agente entre varias sesiones.

**Nota sobre `AiKnowledgeItem` y `AiProduct`:** además de la FK a `ai_agent`, llevan también `tenant_id` **denormalizado** para que los helpers de scope de tenant (§4.4) puedan filtrar sin necesitar JOIN con `ai_agents`.

### 4.2 Composición dinámica del system prompt

Nuevo `SystemPromptService.buildSystemPrompt(aiAgentId, context)` que concatena capas ordenadas:

```
[1] Guidelines universales del canal WhatsApp (brevedad, conversacional, no listas largas)
[2] Persona:     "Eres {persona_name}, asistente de {business_name}..."
[3] Negocio:     industry, website_url, descripción
[4] Tono:        derivado de agent.tone enum
[5] Instrucciones custom del cliente (markdown, sanitizado)
[6] Knowledge items filtrados por ai_agent_id (top-N por intent/keywords)
[7] Reglas de escalación a humano
[8]  Contexto:    lead profile + últimos N mensajes + timeOfDay
[9]  Output format para la IA
[10] Structured output request (activado por Fase E): "Además del texto de respuesta,
     devuelve JSON con { leadName, intent, objections, budgetHint, timelineHint, confidence }
     para que el backend actualice la tabla Lead automáticamente."
```

Cada capa es un método privado. Tests unitarios por capa. El prompt final se cachea con clave `(aiAgentId, language, context-hash)` — invalidación al editar el agente.

La Capa [10] solo se activa cuando el agente tiene `enableStructuredExtraction=true` (feature flag por agente, introducida en Fase E). Hasta entonces, el prompt usa solo las capas [1]–[9] y la respuesta es texto plano.

### 4.3 UI de configuración

Ruta nueva en el dashboard Next.js:

```
apps/dashboard/app/dashboard/whatsapp/[sessionId]/agent/page.tsx
  ├── Tab Identidad       → business_name, industry, website_url, logo_url, business_hours, persona_name
  ├── Tab Personalidad    → tone, language, allow_emojis, response_max_words
  ├── Tab Instrucciones   → textarea markdown (custom_instructions) con ejemplos inline
  ├── Tab Productos       → CRUD de AiProduct (cards con price, url, image, tags)
  ├── Tab Conocimiento    → CRUD de AiKnowledgeItem (FAQs, políticas, info general)
  ├── Tab Conversión      → primary_goal, goal_cta_url, goal_description (con preview del CTA)
  ├── Tab Modelo IA       → llm_provider + llm_model (dropdown con whitelist) + toggle structured extraction
  ├── Tab Escalación      → escalation_rules
  └── Botón "Preview"     → prueba con 3 mensajes en sandbox, sin enviar a WhatsApp
```

Adicionalmente, una vista `/dashboard/agents` que lista todos los agentes de la org y permite reasignarlos a distintas sesiones.

**Decisión de UX:** el tab **Productos** es tabla dedicada (no texto libre) porque permite a la IA filtrar por precio/tags al responder. Ejemplo: si el lead dice "busco algo barato", `KnowledgeRetriever` ordena `AiProduct` por `price_min ASC` y solo inyecta los 3 más baratos al prompt, ahorrando tokens y mejorando relevancia.

### 4.4 Multi-tenancy: enforcement en capa aplicación + RLS como defensa secundaria

**Contexto real del repo** (verificado 2026-04-19):

- Nest API usa `PrismaClient` con `DATABASE_URL` directa (`apps/api/src/prisma/prisma.service.ts:9-15`) — no pasa claims JWT a Postgres.
- whatsapp-service usa `pg.Pool` + `PrismaClient` directos (`apps/whatsapp-service/src/services/DatabaseService.ts:78-98`).
- Dashboard server-side usa `SUPABASE_SERVICE_ROLE_KEY` (`apps/dashboard/lib/auth/unified-auth.ts:7-18`, `bulk-update-whatsapp/route.ts:12-23`) — **bypasa RLS explícitamente**.

**Conclusión**: los 3 caminos de acceso a datos bypasan RLS. Por tanto RLS no puede ser la línea principal de aislamiento; debe ser **enforcement en capa aplicación**, con RLS como defensa secundaria/auditoría.

**Arquitectura decidida**:

1. **Activar Clerk Organizations** (toggle en Clerk Dashboard).
2. **Configurar Clerk en dos lugares distintos (v6.3 — antes confundía estos conceptos)**:
   - **(a) Customize session token** (`Dashboard Clerk → Sessions → Customize session token`): añadir al JSON el claim `"tenant_id": "{{org.public_metadata.tenant_id}}"`. Esto es lo que leen `auth()` en Next.js middleware y el `TenantContextGuard` en NestJS. **Sin esto, el flujo interno NO verá `tenant_id`.**
   - **(b) JWT Template "supabase"** (`Dashboard Clerk → JWT Templates → + New template`): solo si usaremos clientes Supabase `anon` con autenticación vía Clerk (para que RLS funcione con el claim). Este token se obtiene explícitamente con `const token = await getToken({ template: 'supabase' })` y se pasa al cliente Supabase. No lo consume `auth()`.
   - **Importante**: los dos lugares son diferentes en el dashboard de Clerk y cumplen funciones distintas. La confusión entre ambos fue un hallazgo del review 4ª ronda (v6.3).
3. **Webhooks Clerk — separación de responsabilidades (v6.1)**:
   - Existente: `apps/dashboard/app/api/webhooks/clerk/route.ts` (Next.js) maneja **solo eventos `user.*`** (creación/update/delete de usuarios). Secreto: `CLERK_WEBHOOK_SECRET`.
   - **Nuevo**: `apps/api/src/webhooks/clerk-organizations.controller.ts` (NestJS) maneja **solo eventos `organization.*`**. Secreto dedicado: `CLERK_ORG_WEBHOOK_SECRET` (separado del de usuarios para rotación y aislamiento de permisos).
   - Ambos endpoints verifican la firma Svix, son rutas públicas excluidas del `TenantContextGuard`/`ClerkAuthGuard`, y los secretos se documentan en `.env.example`.
   - Cuando Clerk crea/actualiza/elimina una organización → webhook NestJS crea/actualiza/softdeletea `Tenant` local con `clerk_org_id = org_xxx` + escribe `tenant_id` en `organization.publicMetadata`.
4. **Middleware Next.js** (`apps/dashboard/middleware.ts`): lee `orgId` del JWT. Resuelve `tenantId` local. Si falta → redirige a `/select-org`.
5. **Guard NestJS `TenantContextGuard`**: extrae `orgId` del JWT, busca `Tenant.clerkOrgId = orgId`, inyecta `tenantId` en el request.
6. **Prisma extension global** (`$extends`) — **scope dividido por tipo de modelo (v6.2)**:
   - **11 modelos normales** (tabla con `tenant_id NOT NULL`, policy RLS estándar): `whatsapp_sessions`, `leads`, `messages`, `whatsapp_conversations`, `proactive_messages`, `message_templates`, `whatsapp_whitelist_logs`, `ai_training_interactions`, `ai_knowledge_items`, `ai_agents`, `ai_products`. La extension auto-inyecta `where: { tenantId: ctx.tenantId }` en operaciones seguras y `data.tenantId = ctx.tenantId` en `create`/`createMany`.
   - **`ai_configuration`** (modelo mixto, `tenant_id NULL | UUID`): **NO se aplica scope automático genérico**. Se expone un helper explícito `aiConfig.getTenantScoped(key)` (busca primero `tenant_id = ctx.tenantId`, fallback a `tenant_id IS NULL`) y `aiConfig.getGlobal(key)` (lee solo `tenant_id IS NULL`). Escritura: `aiConfig.setTenantValue(key, value)` fija `tenant_id = ctx.tenantId`; `aiConfig.setGlobal(...)` requiere llamada desde `packages/db/src/admin-helpers.ts` (archivo whitelisted) y fuerza `tenant_id = NULL`.
   - **`tenants`** (tabla raíz, **no tiene columna `tenant_id`**): queda **fuera de la extension general**. Las queries se hacen por `id` o por `clerk_org_id` directamente, desde helpers dedicados: `tenantsService.findByClerkOrgId(clerkOrgId)` en el webhook de org, `tenantsService.findById(tenantId)` en el `TenantContextGuard`. Nunca queries libres desde servicios de dominio.
   - Las operaciones `findUnique`/`update`/`delete`/`upsert` aceptan solo lookups por unique key y **no se pueden interceptar con seguridad** con una extensión genérica. Para esas, la v6 requiere **refactor explícito del código cliente** (ver B2.0): cada `findUnique({where:{id}})` → `findFirst({where:{id, tenantId}})`; cada `update({where:{id}})` → `updateMany({where:{id, tenantId}})` con patrón transaccional (§4.4 más abajo).

   **Cobertura Prisma real (tabla resumen):**

   | Operación                                                | Auto-scoped por extension | Requiere refactor manual                                                 |
   | -------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------ |
   | `findMany`, `findFirst`, `count`, `aggregate`, `groupBy` | ✅                        | —                                                                        |
   | `updateMany`, `deleteMany`                               | ✅                        | —                                                                        |
   | `findUnique`, `findUniqueOrThrow`                        | ❌                        | → `findFirst({where:{uniqueField, tenantId}})`                           |
   | `update`, `delete`, `upsert`                             | ❌                        | → `updateMany`/`deleteMany` con `{id, tenantId}` + verificar `count===1` |
   | `create`, `createMany`                                   | ✅ (set `data.tenantId`)  | —                                                                        |
   | Raw SQL `$queryRaw`/`$executeRaw`                        | ❌                        | Cada query literal debe incluir `WHERE tenant_id = $n`                   |

   Archivos del repo afectados por el refactor manual (detectados en review 2026-04-19):
   - `apps/api/src/leads/leads.service.ts` — líneas 18-20, 108-109, 129-131, 146-148, 205-206, 218-219
   - `apps/api/src/whatsapp/whatsapp.service.ts` — líneas 75-77, 120-121, 129-130
   - `apps/api/src/templates/templates.service.ts` — líneas 25-27, 49-50, 64
   - `apps/whatsapp-service/src/services/DatabaseService.ts` — todas las queries raw con `this.pool.query(...)` (líneas 1494-1637 entre otras)

7. **whatsapp-service**: `DatabaseService.getKnowledgeBase(tenantId, aiAgentId, category?)` y `searchKnowledgeBase(tenantId, aiAgentId, query)` reciben tenant+agent explícitos; `KnowledgeRetriever.retrieve(msg, intent, aiAgentId)` los propaga. `EventDispatcher.onMessage` resuelve `sessionId → (tenantId, aiAgentId)` al entrar.
8. **Dashboard (Supabase client)**: endpoints que usan `SUPABASE_SERVICE_ROLE_KEY` se convierten progresivamente — los CRUD de leads/conversations pasan por NestJS (que aplica el middleware Prisma) en vez de query directa a Supabase. Lo que siga usando service_role queda documentado y audita.
9. **Row Level Security (RLS) como defensa secundaria** — **policies completas con USING + WITH CHECK (v6.2)**:

   En Postgres, `USING` aplica a `SELECT`/`UPDATE (filter)`/`DELETE` (qué filas ve/modifica); `WITH CHECK` aplica a `INSERT`/`UPDATE (nuevos valores)` (qué filas puede escribir). **Sin `WITH CHECK`, un `UPDATE` podría cambiar `tenant_id` a otro tenant** — violación grave de aislamiento. Las policies correctas por tipo de tabla:
   - **Tabla raíz `tenants`**:

     ```sql
     CREATE POLICY tenants_select ON tenants
       FOR SELECT USING (id = (auth.jwt() ->> 'tenant_id')::uuid);
     -- INSERT/UPDATE/DELETE restringido a service_role (writes vienen del webhook Clerk)
     ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
     ```

   - **11 tablas normales**:

     ```sql
     CREATE POLICY <tabla>_all ON <tabla>
       FOR ALL
       USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
       WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
     ```

     `USING` bloquea lecturas/updates/deletes de otros tenants; `WITH CHECK` impide que INSERT o UPDATE escriban `tenant_id` de otro tenant.

   - **`ai_configuration` (mixta, `tenant_id NULL | UUID`)** — policies separadas por operación:

     ```sql
     CREATE POLICY ai_config_select ON ai_configuration
       FOR SELECT
       USING (tenant_id IS NULL OR tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

     CREATE POLICY ai_config_write_tenant ON ai_configuration
       FOR INSERT WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

     CREATE POLICY ai_config_update_tenant ON ai_configuration
       FOR UPDATE
       USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
       WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

     CREATE POLICY ai_config_delete_tenant ON ai_configuration
       FOR DELETE USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

     -- Writes de filas globales (tenant_id IS NULL) se hacen con service_role desde migrations/admin;
     -- el service_role bypasea RLS por diseño.
     ```

   - **Índice B-tree obligatorio** en cada columna `tenant_id` (performance RLS y queries generales).
   - **Mecanismo concreto para `tenant_id` en JWT** (antes estaba subespecificado):
     - Cuando el webhook `organization.created` sincroniza un `Tenant` local, el backend hace **`PATCH https://api.clerk.com/v1/organizations/{org_id}/metadata`** con body `{ "public_metadata": { "tenant_id": "<uuid>" } }` usando la Clerk Secret Key. **(v6.3: era POST erróneamente; la API de Clerk usa PATCH para update de metadata.)**
     - **Customize session token** en Clerk Dashboard añade el claim: `"tenant_id": "{{org.public_metadata.tenant_id}}"`. Esto hace que `auth()` en middleware/NestJS reciba `tenant_id` directamente.
     - **JWT Template "supabase"** (opcional, solo si se usa Supabase client con JWT): mismo claim `tenant_id`. Así RLS puede leer `auth.jwt() ->> 'tenant_id'` cuando el dashboard haga queries `anon` firmadas con Clerk.
     - **Manejo de race condition token-emitido-antes-de-sync** (v6.1): en lugar de `auth.session.touch()` (que no existe como método para refrescar claims en Clerk), el mecanismo real es:
       - El middleware Nest detecta `tenant_id` ausente del JWT → hace **lookup server-side por `clerk_org_id`** contra la tabla local `tenants` y resuelve para esa request. La request sigue funcionando sin esperar refresh.
       - Tras completar bootstrap del tenant (webhook + metadata update), el frontend fuerza refresh del token con **`await getToken({ skipCache: true })`** (Clerk Next.js SDK) o **`await user.reload()`**. A partir de ese refresh, el JWT lleva `tenant_id` y el lookup server-side ya no es necesario.
   - RLS captura: (a) bugs futuros donde el Prisma extension falle, (b) acceso desde clientes Supabase `anon`/user si se añaden, (c) shell SQL administrativo sin el service_role.

**Precondición operativa (v6.1)**: todo usuario del dashboard debe pertenecer a una Clerk Organization activa antes de que el sistema pueda resolver `tenantId`. Si el JWT no trae `org_id` (usuario sin org o sin seleccionar), el dashboard **redirige a `/select-org`**, donde el usuario elige una organización existente o crea una nueva mediante `<OrganizationList />` / `<OrganizationSwitcher />` (componentes oficiales de Clerk). Sin org seleccionada → no hay `tenant_id` → no hay acceso a recursos tenant-scoped.

**Patrón transaccional para servicios que devolvían la entidad actualizada (v6.1)**: al cambiar `update({where:{id}})` por `updateMany({where:{id, tenantId}})`, perdemos el retorno de la fila (updateMany solo devuelve `count`). Para preservar los contratos existentes (ej: `leads.service.ts.update()` devuelve el lead modificado):

```
1) row = findFirst({ where: { id, tenantId } })
2) si !row → lanzar NotFoundException (404)
3) updateMany({ where: { id, tenantId }, data })
4) updated = findFirst({ where: { id, tenantId } })  ← re-read
5) return updated
```

Para `delete` que también devolvía la entidad: leer antes dentro de `$transaction`, luego `deleteMany` con verificación `count===1`. Sin este patrón, los endpoints que devuelven cuerpo romperían contratos con el frontend.

**Honestidad del plan**: el aislamiento fuerte en v1 viene del middleware Prisma + Guards, no de RLS. RLS es una red de seguridad añadida, no la red principal.

### 4.5 Camino de escala (manteniendo whatsapp-web.js)

| Clientes activos | Infraestructura                                  | Medidas técnicas                              | Costo aprox/mes |
| ---------------- | ------------------------------------------------ | --------------------------------------------- | --------------- |
| 1–10             | CX23 actual (4 GB)                               | Monitor de memoria, restart automático diario | €4              |
| 10–30            | Upgrade a CX42 (8 GB) o CX52 (16 GB)             | PM2 cluster mode + BullMQ                     | €9 / €18        |
| 30–100           | 3–5× CX42 + Load Balancer Hetzner                | Session router por hash, workers dedicados    | €45–90          |
| 100–200          | Escalado horizontal con Hetzner Fleet            | Cola distribuida + observabilidad Prometheus  | €150–200        |
| >200             | **Considerar migración a WhatsApp Business API** | Fuera de este plan — ver §11 roadmap          | Variable        |

**Nota:** los memory leaks conocidos de `whatsapp-web.js` hacen que la Fase C (clustering + monitoreo) sea **obligatoria**, no opcional, al superar ~10 sesiones concurrentes.

---

## 5. Plan de ejecución

### Fase A — Foundation ✅ EJECUTADA 2026-04-19 (branch `feature/foundation-hotfixes`)

Hotfixes P0 + movimiento del prompt a DB. Completada con verificación end-to-end en 2 números reales (Eduard `34604906249` + nuevo `34644773622`). Tests 15/15 verdes, typecheck limpio. **Latencia total mejorada de 15-18s → 5-7s (-65%)**.

#### Tareas del plan original (10)

- [x] **A1.** Deduplicación de mensajes: `SETNX whatsapp:dedup:{message.id}` con TTL 300s en Redis antes de procesar — `EventDispatcher.ts:313`
- [x] **A2.** Filtro explícito de grupos y `status@broadcast` — `EventDispatcher.ts:334`
- [x] **A3.** Typing indicator: `chat.sendStateTyping()` antes de enviar; `clearState()` después — `MessageHandler.ts:sendResponseWithStrategy`
- [x] **A4.** Unificar `saveConversation` — una sola escritura con `direction` y FK a `Message` (post-Fase 1 PRD) — `MessageHandler.ts:208-233`
- [x] **A5.** Validación de envs con `zod` en bootstrap — fail-fast si falta `WHATSAPP_SERVICE_HMAC_SECRET` u otras críticas
- [x] **A6.** Reemplazar `process.exit(1)` por logging en `unhandledRejection`/`uncaughtException` — `index.ts:12-22`
- [x] **A7.** Mover `SystemPromptService.getBasePrompt()` hardcoded a `ai_configuration` con key `system_prompt.default.es`
- [x] **A8.** Revisar y **ampliar** tests HMAC existentes en `apps/whatsapp-service/src/middleware/auth.spec.ts` (ya cubren firma/tamper/timestamp). Añadir casos de edge: body vacío, raw body vs parsed, header con prefijo inesperado. **No crear desde cero — ya existe cobertura base**
- [x] **A9.** Test unitario: deduplicación (mismo `message.id` dos veces → una sola respuesta)
- [x] **A10.** Update `CLAUDE.md` con estado post-Fase A

#### Hotfixes adicionales descubiertos durante ejecución (5, no en el plan original)

Surgieron cuando el owner probó con móvil real. Cada uno se detectó por logs + DB + prueba manual. Detalle técnico completo en `CLAUDE.md`.

- [x] **A11.** `ResponseGenerator.ensureFinalQuestion` detectaba solo `?` ASCII → duplicaba preguntas cuando el LLM devolvía `¿...hoy` sin cerrar. Fix: `/[?¿]/.test(content)`
- [x] **A12.** `sendStateTyping()` movido al **inicio** del handler (antes del LLM) en vez de al final → cubre los ~10s de thinking visualmente en vez de solo el último segundo
- [x] **A13.** Eliminadas funciones `addHumanizedDelay` + `addHumanizedDelayEnhanced` (~70 líneas) — añadían 5-6s artificiales redundantes al LLM que ya aporta latencia real. Latencia total cayó de 15-18s a 5-7s
- [x] **A14.** Bug introducido en A4: `persistMessagePair` pasaba el contenido del bot en `messageText` pero `saveConversation` esperaba `responseText` para `isFromUser=false`. Log warn `⚠️ called without canonical content` reveló que el bot msg no se persistía. Fix: swap de campos
- [x] **A15 / A15-bis / A15-ter.** Whitelist cerrada en 3 capas independientes bloqueaba leads nuevos. Fix en: (a) default de `AuthAuditLogger.ts`, (b) default de `whitelist.service.ts` en API Nest, (c) env var `.env`. Coherente con producto SaaS de captación

#### Tests post-Fase A

- **15/15 verdes**: 11 en `auth.spec.ts` (6 originales + 5 edge cases A8) + 4 nuevos en `redis.spec.ts` (A9)
- Borradas 9 suites `ai-thinking/__tests__/*` y `phase4-integration.test.ts` (22 tests pre-existentes rotos, considerados deuda muerta — aprobado por owner)

#### Deudas técnicas detectadas (documentadas en `CLAUDE.md`, no bloqueantes)

- **T1**: `messages` con `lead_id=null` desde whatsapp-service (saveConversation no resuelve el Lead antes)
- **T2**: Duplicación de `Message` entre whatsapp-service y API Nest (3 rows para 2 mensajes reales)
- **T3**: Timestamp 1970 en messages de API Nest (`new Date(epoch_seconds)` sin ×1000)
- **T5 (nueva, 2026-05-01)**: el cascading fallback colapsa cuando la `Page` de Puppeteer muere. `MessageHandler.sendResponseWithStrategy` (`apps/whatsapp-service/src/services/whatsapp-core/MessageHandler.ts:418`) y los 2 niveles de fallback de `processMessageWithAI` (líneas 290, 315, 340, 345) operan todos contra la misma `Page` y la misma `Message` reference. Cuando un error de transporte (`Execution context destroyed`, `Target closed`, `Protocol error`) marca la page como muerta, los 3 caminos fallan en cascada y el user no recibe nada — observado en owner smoke 2026-05-01 con `headless=false + devtools=true`. Phase C: **diseñar un mecanismo de retry/outbox idempotente** ante errores de Page muerta. La solución exacta queda abierta — un retry naïve puede duplicar respuestas si WhatsApp llegó a enviar pero Puppeteer devolvió error antes de reportar success. Posibles vías a evaluar: (a) detectar el error específico, marcar sesión `needs-reconnect` y descartar el mensaje (loseable), (b) outbox con clave idempotente derivada del `msgId` entrante para que un duplicado en el reintento sea no-op, (c) confirmar entrega vía algún side channel antes de retry. **No** prescribir aún la solución; lo importante es separar el problema como tema propio.
- Dedupe secundario multi-device `@lid` (mismo contenido, IDs distintos por sync linked devices)

Los 3 T apuntan al mismo patrón: **dos writers del mismo dato sin coordinación**. Fase B ya contempla unificar.

#### Verificación end-to-end

| Prueba                     | Resultado                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Número existente (Eduard)  | ✅ 1 respuesta, sin duplicados, typing visible, DB consistente                                                                                                |
| Número nuevo (34644773622) | ✅ Auto-crea `Lead {phone, whatsapp_authorized=true, source='whatsapp-inbound'}`, responde, aparece en `/dashboard/leads` como "Autorizado", 13 leads totales |

**Criterio de salida cumplido:** los 4 hotfixes P0 verificados + tests verdes + prompt leyéndose de DB + EscortsHub funcionando idéntico + número nuevo captado automáticamente.

### Fase B — Multi-tenant + Agente Configurable (dividida en 3 subfases, ~2 días cada una)

La fase se dividió tras revisión técnica (v5): era demasiado scope para una sola iteración y mezclaba trabajo de datos/auth, runtime IA y UI/tests. Las tres subfases tienen dependencia lineal estricta.

#### Fase B.1 — Datos + Auth (1–2 días)

- [ ] **B1.1.** Activar Clerk Organizations (toggle en dashboard Clerk; verificar plan — free tier limita 5 orgs activas)
- [ ] **B1.1a.** **Crear organización real "EscortsHub"** en Clerk Dashboard. Añadir al admin actual como `owner`. Guardar el `org_xxx` resultante para el backfill B1.9 (evita el seed temporal)
- [ ] **B1.1b.** **UI de selección de organización**: implementar `apps/dashboard/app/select-org/page.tsx` usando `<OrganizationList />` de Clerk + integrar `<OrganizationSwitcher />` en el navbar del dashboard. Usuarios sin org activa redirigen aquí automáticamente desde el middleware (B1.11)
- [ ] **B1.2(a).** **Customize session token en Clerk** (Dashboard → Sessions → Customize session token): añadir claim `"tenant_id": "{{org.public_metadata.tenant_id}}"`. Necesario para que `auth()` en middleware Next.js y `TenantContextGuard` en NestJS reciban el claim. Verificación: inspeccionar con `jwt.io` un token real de sesión y confirmar que aparece `tenant_id`
- [ ] **B1.2(b).** **JWT Template "supabase" en Clerk** (Dashboard → JWT Templates → + New template): mismo claim `tenant_id`. Se consume con `getToken({ template: 'supabase' })`, no con `auth()`. Prerequisito de cualquier uso de cliente Supabase `anon` (RLS directa en B3.4 o migración de endpoints en B3.6). Verificación: ejecutar `getToken({template:'supabase'})` desde el dashboard y validar que el token contiene `tenant_id`
- [x] **B1.3.** Migración Prisma: crear tabla `tenants` (id UUID PK, clerk_org_id VARCHAR UNIQUE, name, plan, settings). Hecho en `feature/b1-foundation-schema` commit `364979a`.
- [x] **B1.4.** Migración Prisma additive-only: añadir `tenant_id UUID FK NULL` a las tablas scopeadas sin activar enforcement runtime. En PR1 se añaden columnas a 9 tablas existentes (`whatsapp_sessions`, `leads`, `messages`, `whatsapp_conversations`, `proactive_messages`, `message_templates`, `whatsapp_whitelist_logs`, `ai_training_interactions`, `ai_knowledge_base`), a la tabla mixta `ai_configuration`, y nacen `ai_agents`/`ai_products` con `tenant_id`. No se aplica a Supabase producción hasta PR1+PR2+PR3.
- [ ] **B1.5.** Migración Prisma: cambiar `Lead.phone` de `@unique` global → `@@unique([tenantId, phone])`. **Aplazado a PR4/post-backfill**: quitar el unique global antes de poblar `tenant_id` permitiría duplicados porque Postgres permite múltiples `NULL` en unique compuesto.
- [x] **B1.6(a).** PR1 additive-only: añadir `WhatsAppConversation.whatsappSessionId UUID NULL` + FK opcional a `WhatsAppSession`, manteniendo intacto `sessionId String @map("session_id")`. Hecho en commit `364979a`.
- [ ] **B1.6(b).** PR3/PR4 runtime-aware: backfill `whatsapp_session_id` con JOIN contra `whatsapp_sessions.session_id`, actualizar consumers, y solo después retirar/deprecar `session_id` string.
- [x] **B1.7(a).** PR1 additive-only: crear `ai_agents`, `ai_products` y añadir `tenant_id` + `agent_id NULL` a `ai_knowledge_base` sin renombrar la tabla. Hecho en commit `364979a`.
- [ ] **B1.7(b).** PR4 runtime-aware: renombrar `ai_knowledge_base` → `ai_knowledge_items` en la misma iteración que actualice SQL raw en `DatabaseService.ts` y `packages/db/prisma/seed.ts`.
- [x] **B1.8.** Índices B-tree en cada nueva columna `tenant_id` y FKs aditivas relevantes (`agent_id`, `whatsapp_session_id`). Hecho en commit `364979a`.
- [x] **B1.8-bis.** Crear entorno local/staging migrable para smoke de PR1. Hecho en `feature/b1-foundation-schema`: Postgres local Docker, runbook `docs/development/b1-local-db-smoke.md`, seed smoke y verificación runtime con sesión WhatsApp `tester`. Smoke verde: dashboard/API arrancan contra DB migrada, `READY`, dedupe `Checking=1`/`Skipping=0`, respuesta AI enviada, filas `incoming`/`outgoing` creadas con `tenant_id=NULL` esperado hasta B1.9.
- [ ] **B1.9.** **Backfill script** (`packages/db/scripts/backfill-tenant.ts`): (a) **precondición**: crear manualmente la organization "EscortsHub" en Clerk Dashboard y obtener su `org_xxx` real; (b) crear 1 `Tenant` local con `clerk_org_id = <org_xxx real>` (no seed temporal — evita convergencia posterior); (c) asignar `tenant_id` de ese tenant a TODAS las filas existentes (24 sesiones, 12 leads, 88 messages, 62 conversaciones, 3 KB items, N templates); (d) crear 1 `AiAgent` default "EscortsHub Default" + asociar a la sesión activa; (e) **`PATCH https://api.clerk.com/v1/organizations/{org_id}/metadata`** con body `{ "public_metadata": { "tenant_id": "<uuid>" } }` a Clerk API para escribir el claim en metadata (v6.5: ruta + método corregidos al endpoint dedicado `/metadata`). Dry-run en branch Supabase primero; verificar que el unique compuesto `@@unique([tenantId, phone])` no genere colisiones antes de aplicar
- [x] **B1.10.** Webhook `POST /api/webhooks/clerk/organizations` (NestJS, ruta en plural) sincroniza eventos `organization.created|updated|deleted` → CRUD local de `Tenant`. **Tras crear `Tenant`, hace `PATCH https://api.clerk.com/v1/organizations/{org_id}/metadata` con body `{ "public_metadata": { "tenant_id": "<uuid>" } }`** usando `CLERK_SECRET_KEY` (v6.5: ruta corregida al endpoint dedicado `/metadata`). Esto garantiza que el claim `tenant_id` estará disponible en session tokens posteriores. Verificación Svix con `CLERK_ORG_WEBHOOK_SECRET` dedicado. **Importante (v6.5)**: la verificación Svix debe usar `req.rawBody` capturado en `apps/api/src/main.ts:9-23`, **no el body parseado por Nest/Express**. Implementación PR2 en `feature/b1-clerk-organizations` (commits `d7be454`, `5a6d171`): módulo Nest + tests unitarios verdes; smoke local firmado Svix verde; **smoke real verde 2026-05-01**: org "EscortsHub" creada en Clerk Development (`org_3D8ZN8vTbv1rUvD22QWRVkzjO2J`), webhook firmado→201 `action=synced`, `Tenant` local creado (`fc732fd0-095b-4be7-b1ee-eb9b0b37580c`), Clerk API confirma `publicMetadata.tenant_id=fc732fd0-...` post-PATCH, firma inválida rechazada con 400 sin mutar DB. **Nota operativa**: el `tenant_id` actualmente en Clerk publicMetadata apunta a la fila en DB **local** Docker; cuando B1.9 ejecute backfill contra Supabase prod creará un nuevo Tenant con UUID distinto y este PATCH se sobreescribirá automáticamente vía el mismo webhook al re-emitir `organization.updated` (idempotente).
- [ ] **B1.11.** Middleware Next.js (`apps/dashboard/middleware.ts`) — **cambios concretos sobre el estado actual (v6.2)**. Hoy el middleware (líneas 36-38) solo valida `userId` con `auth()`. Cambios a aplicar:
  - Extraer también `orgId` de `auth()`: `const { userId, orgId } = await auth();`
  - Añadir matcher de ruta pública nueva `/select-org(.*)` al `isPublicRoute` (línea 5-12) para evitar loops de redirección
  - En rutas protegidas (`isProtectedRoute`), si `userId && !orgId` → `NextResponse.redirect('/select-org')`. Si `!userId` → sigue redirigiendo a `/sign-in` (comportamiento actual)
  - Excluir `/select-org` y `/api/webhooks/(.*)` del chequeo de `orgId` (las páginas/endpoints de onboarding no lo requieren)
  - **Lógica exacta anti-loop (v6.6 — aclaración tras confusión detectada en review)**:
    - El **middleware** nunca debe redirigir `/select-org` a sí misma.
    - Si `request.path === '/select-org'` y `!userId` → **la propia página `/select-org`** (no el middleware) redirige a `/sign-in`.
    - Si `request.path !== '/select-org'` y `userId && !orgId` → **el middleware** redirige a `/select-org`.
    - Si `request.path !== '/select-org'` y `!userId` → el middleware sigue con el comportamiento actual (redirect a `/sign-in`).
    - Esta división de responsabilidades (middleware vs página) evita ambigüedad de implementación y loops
- [ ] **B1.12.** Guard NestJS `TenantContextGuard`: extrae `orgId`, carga `Tenant`, inyecta `tenantId` en request. Decorator `@CurrentTenant()`
- [ ] **B1.13.** **Prisma extension global** (`packages/db/src/tenant-scope.ts`) — **scope dividido por tipo de modelo (v6.2)**:
  - **11 modelos normales**: auto-inyecta `where: { tenantId }` en `findMany`/`findFirst`/`count`/`aggregate`/`groupBy`/`updateMany`/`deleteMany`; `data.tenantId = ctx.tenantId` en `create`/`createMany`
  - **`ai_configuration`**: NO aplica scope automático; se usan helpers dedicados `aiConfig.getTenantScoped()`, `aiConfig.setTenantValue()` que leen `ctx.tenantId` explícitamente
  - **`tenants`**: fuera de la extension. Acceso solo vía `tenantsService.findByClerkOrgId()` y `tenantsService.findById()`
  - Bypass explícito via función con nombre claro: `withTenantBypass(async (tx) => { ... })` — **no** decorador mágico. Usado solo por webhooks y backfill
- [ ] **B1.14.** **ESLint rule custom** (`packages/config-eslint/rules/no-unscoped-prisma.js`) — **whitelist por archivo exacto + helper único (v6.2)**:
  - Prohíbe `findUnique`, `findUniqueOrThrow`, `update`, `delete`, `upsert` sobre modelos tenant-scoped
  - **Whitelist estricta de 3 archivos exactos** (no globs de carpeta):
    - `packages/db/scripts/backfill-tenant.ts` (migración inicial)
    - `apps/api/src/webhooks/clerk-organizations.controller.ts` (webhook Clerk)
    - `packages/db/src/tenant-scope.ts` (la propia implementación del helper `withTenantBypass`)
  - Fuera de esa lista: para hacer bypass legítimo en otro archivo, **debe llamarse dentro del callback** `withTenantBypass(async (tx) => { await tx.lead.update(...) })`. La regla detecta esa envoltura como excepción válida
  - Lista de modelos tenant-scoped hardcoded en la regla
  - Para código normal solo se permiten `findFirst`, `findMany`, `count`, `aggregate`, `create`, `createMany`, `updateMany`, `deleteMany`
- [x] **B1.15.** **NestJS api lee `.env` via `ConfigModule`**. Implementado en `apps/api/src/app.module.ts` con `ConfigModule.forRoot({ isGlobal: true, envFilePath: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] })`. Desbloquea B1.2(a)/B1.10 en código; queda verificar el comportamiento en prod tras deploy.

**Criterio de salida B.1:** `Tenant` existe con `clerk_org_id` real de EscortsHub, Clerk Orgs sincroniza vía webhook, `publicMetadata.tenant_id` escrito en Clerk, JWT emite el claim `tenant_id`, Prisma extension filtra las operaciones no-únicas, ESLint previene regresiones, todos los datos existentes quedan scopeados, tests de aislamiento básicos verdes.

#### Fase B.2 — Backend / runtime IA (2–3 días — aumentado por B2.0)

- [ ] **B2.0.** **Refactor operaciones Prisma no cubiertas por extension** (ver §4.4 tabla de cobertura + §4.4 patrón transaccional). Archivos y cambios concretos:
  - **Patrón obligatorio para services que HOY devuelven la entidad actualizada** (preserva contratos):
    ```
    1) row = findFirst({ where: { id, tenantId } })
    2) si !row → throw new NotFoundException(404)
    3) await updateMany({ where: { id, tenantId }, data })
    4) updated = findFirst({ where: { id, tenantId } })   ← re-read
    5) return updated   ← mismo contrato que update() antes
    ```
    Para `delete` que devolvía cuerpo: leer antes dentro de `$transaction`, luego `deleteMany` con `count===1`.
  - `apps/api/src/leads/leads.service.ts`:
    - Línea 18-20: `findUnique({where:{phone}})` → `findFirst({where:{phone, tenantId}})`
    - Línea 129-131, 146-148, 205-206, 218-219: aplicar **patrón transaccional** (findFirst → updateMany → re-read) para no romper el contrato actual que devuelve el lead modificado
  - `apps/api/src/whatsapp/whatsapp.service.ts`:
    - Línea 75-77: `findUnique({where:{phone}})` → `findFirst({where:{phone, tenantId}})`
    - Línea 120-121, 129-130: `update({where:{id:lead.id}})` → `updateMany({where:{id:lead.id, tenantId}})`
  - `apps/api/src/templates/templates.service.ts`:
    - Línea 25-27, 49-50, 64: `findUnique`/`update`/`delete` por `id` → `findFirst`/`updateMany`/`deleteMany` con `tenantId`
  - `apps/whatsapp-service/src/services/DatabaseService.ts`: todas las queries raw con `this.pool.query(...)` añaden cláusula `AND tenant_id = $n` (B2.2 lo cubre para KB; aquí para las demás)
  - Activar ESLint rule B1.14 en CI
- [ ] **B2.1.** Refactor `SystemPromptService.buildSystemPrompt(aiAgentId, ctx)` con composición dinámica (capas 1–9 de §4.2)
- [ ] **B2.2.** `DatabaseService.getKnowledgeBase(tenantId, aiAgentId, category?)` y `searchKnowledgeBase(tenantId, aiAgentId, query)`: **añadir parámetros obligatorios**; inyectar `WHERE tenant_id = $X AND ai_agent_id = $Y` en las queries SQL (líneas 1494-1637)
- [ ] **B2.3.** `KnowledgeRetriever.retrieve(msg, intent, aiAgentId)`: propagar `aiAgentId` hasta `DatabaseService`
- [ ] **B2.4.** `AIThinkingService.processWithThinking(msg, ctx)`: `ctx` lleva `aiAgentId` obligatorio; enriquece con `KnowledgeRetriever` scoped
- [ ] **B2.5.** `EventDispatcher.onMessage`: al entrar un mensaje, lookup `sessionId → WhatsAppSession.tenant_id, ai_agent_id`. Pasar ambos a `MessageHandler.processMessageWithAI`
- [ ] **B2.6.** `KnowledgeRetriever` extendido para filtrar también `AiProduct` por keywords/tags/rango de precio detectados → inyecta top-N al prompt (capa [6])
- [ ] **B2.7.** Endpoints NestJS `GET/PUT /api/ai-agents/:agentId` + `GET /api/ai-agents` (protegidos por Clerk + TenantContextGuard)
- [ ] **B2.8.** Endpoints NestJS CRUD `/api/ai-agents/:agentId/knowledge-items` y `/api/ai-agents/:agentId/products`
- [ ] **B2.9.** Endpoint Preview: `POST /api/ai-agents/:agentId/preview` — recibe mensaje test y devuelve respuesta sin enviar a WhatsApp

**Criterio de salida B.2:** el prompt se construye dinámicamente por agente, el retrieval filtra por tenant+agente, el preview funciona end-to-end sin enviar a WhatsApp.

#### Fase B.3 — UI + E2E + RLS secundaria (1–2 días)

- [ ] **B3.1.** UI dashboard: `/dashboard/whatsapp/[sessionId]/agent` con 8 tabs (Identidad, Personalidad, Instrucciones, Productos, Conocimiento, Conversión, Modelo IA, Escalación)
- [ ] **B3.2.** UI dashboard: `/dashboard/agents` listado global de agentes con asignación a sesiones
- [ ] **B3.3.** Tests e2e: 2 tenants (Clerk orgs distintas) → 2 sesiones → 2 agentes → mensajes aislados. **Prueba de aislamiento**: usuario de tenant A intenta leer/escribir recursos de tenant B → debe recibir 403/404
- [ ] **B3.4.** Activar RLS en Supabase como defensa secundaria: `ENABLE ROW LEVEL SECURITY` + policies **completas con `USING` + `WITH CHECK` (v6.2)** en las 13 tablas (1 raíz + 11 normales + 1 mixta). El SQL exacto por tipo está en §4.4. Resumen:
  - **`tenants`**: SELECT `USING (id = claim)`. Writes restringidos a service_role.
  - **11 tablas normales**: `FOR ALL` con `USING (tenant_id = claim) WITH CHECK (tenant_id = claim)`. **`WITH CHECK` es crítico**: sin él, un UPDATE podría cambiar `tenant_id` a otro tenant.
  - **`ai_configuration`**: 4 policies separadas por operación (SELECT permite `NULL OR claim`; writes de fila tenant con `WITH CHECK (tenant_id = claim)`; writes de filas globales solo con service_role).
  - Precondición: JWT de Clerk ya emite el claim `tenant_id` desde B1.2 + B1.10
  - **Test e2e correcto para `WITH CHECK` (v6.3)**: el test anterior (auth B intentando escribir en fila de A) fallaba por `USING`, no por `WITH CHECK`. El test que realmente ejercita `WITH CHECK` es:
    1. Autenticar como tenant A (JWT lleva `tenant_id = A`)
    2. `SELECT` un lead propio → USING permite (fila es de A)
    3. `UPDATE leads SET tenant_id = '<B>' WHERE id = <lead.id>` → **USING pasa** (sigue siendo fila de A al filtrar), **WITH CHECK falla** (nuevo valor `tenant_id = B` ≠ claim)
    4. La fila sigue siendo del tenant A; no se "movió". Esto es lo que previene un atacante legítimo que intenta robar datos reasignándolos a otro tenant que controla
- [ ] **B3.5.** Auditoría: listar los endpoints del dashboard que usan `SUPABASE_SERVICE_ROLE_KEY` (`unified-auth.ts`, `bulk-update-whatsapp/route.ts`, y otros). Plan de migración progresiva a través de la API NestJS. Documentar cada caso no migrado con `// RLS-BYPASS: justificación`
- [ ] **B3.6.** Migrar al menos 1 endpoint del dashboard de service_role → NestJS API + TenantContextGuard como prueba de concepto

**Criterio de salida B.3:** dos tenants coexisten con aislamiento verificado en capa app (principal) y capa DB (RLS secundaria). Tests e2e verdes. Auditoría de service_role documentada.

### Fase C — Escala (**obligatoria tras 10 sesiones concurrentes**, no opcional)

Justificación: memory leaks documentados de `whatsapp-web.js` en producción hacen que la operación estable exige clustering + monitoreo a partir de ~10 sesiones.

- [ ] **C1.** Monitor de RAM por proceso (Winston alerta + webhook) cuando uso >80% del VPS — crítico por memory leaks de wwebjs
- [ ] **C2.** Cola BullMQ para procesamiento de mensajes entrantes (desacopla `EventDispatcher` del LLM)
- [ ] **C3.** Worker pool por grupos de sesiones (hash sharding `sessionId % N`)
- [ ] **C4.** Upgrade VPS Hetzner de CX23 → CX42 (downtime <5 min)
- [ ] **C5.** Load Balancer Hetzner + 2–3 workers replicados
- [ ] **C6.** Métricas Prometheus + Grafana (tiempos IA, tokens, cache hit, queue depth, RAM por worker)
- [ ] **C7.** **Restart automático programado** de cada worker cada 24–48h (workaround estándar de memory leaks wwebjs) con drenado graceful de mensajes en cola
- [ ] **C8.** Healthcheck específico: detectar "detached frame" errors y reiniciar sesión afectada sin tirar todo el worker

### Fase D — Compliance + futuras mejoras

- [ ] **D1.** Web scraping + RAG: `WebsiteSource` se alimenta con chunks del sitio del cliente, indexados vectorialmente
- [ ] **D2.** Migración a Vercel AI SDK v6 con AI Gateway unificado
- [ ] **D3.** Streaming parcial vía typing indicator extendido (experimental)
- [ ] **D4.** i18n completa del dashboard (en/pt/fr además de es-ES)
- [ ] **D5.** GDPR: endpoint `DELETE /api/leads/:id/gdpr` (borra lead + mensajes + conversaciones) + endpoint `GET /api/leads/:id/export` (export completo en JSON). Cron mensual archiva mensajes >6 meses a cold storage (S3/Supabase Storage) y los elimina de tablas calientes
- [ ] **D6.** Redactar body de mensajes en logger Winston: solo primeros 30 chars + hash SHA256 del resto. Evita PII en archivos `.log` de disco (`apps/whatsapp-service/src/middleware/validation.ts:488`)

### Fase E — Lead Optimization Module (post-Fase B, en paralelo o antes de C según volumen)

Objetivo: convertir el "chatbot de soporte" actual en un **"closer automático"** que no solo responde, sino que **extrae datos estructurados, puntúa leads, hace seguimiento y deriva a humano** cuando conviene. Es la capa que transforma LeadsCRM de "tool de atención" a "tool de conversión".

- [ ] **E1. Structured extraction**: la Capa [10] del prompt se activa por agente. Cada respuesta de la IA devuelve JSON con `{ leadName, intent, objections, budgetHint, timelineHint, confidence }` además del texto. Un servicio `LeadExtractionService` actualiza la tabla `Lead` automáticamente (nombre, tags, moodScore, notas)
- [ ] **E2. Lead scoring**: algoritmo `score = intent_strength × engagement × objection_flags × recency` (rango 0–100). Se calcula tras cada mensaje entrante. Dashboard muestra lista ordenada por score con filtros por rango
- [ ] **E3. Follow-up jobs con BullMQ**: cuando un lead con `intent ∈ { precio, registro, contratar }` no escribe en 24h, se encola un mensaje personalizado de reenganche. Una sola vez por lead (flag `followUpSent`) para no spamear. Respeta rate limit 200/h/sesión
- [ ] **E4. Handoff webhook**: cuando `strategy.type === 'escalate'` o `score > 80` → POST a webhook configurable (Slack, Discord, email via Resend) con contexto completo de la conversación. Evita que leads calientes se enfríen esperando a la IA
- [ ] **E5. Conversion tracking**: cada agente define un "goal event" (ej: URL de registro del cliente clickeada). Snippet JS en la web del cliente dispara webhook `POST /api/leads/:id/convert` → marca `lead.converted=true` y `convertedAt`. Permite medir conversion rate por agente
- [ ] **E6. A/B testing de prompts**: dos variantes de `customInstructions` por agente (A y B), split 50/50 determinístico por `leadId hash`. Tras N conversaciones (configurable), elige automáticamente la variante con mayor conversion rate y archiva la perdedora
- [ ] **E7. Tier 2 — templates determinísticos por agente**: sistema de plantillas para intents 100% obvios ("hola", "gracias", "ok") configurables en dashboard. Responden en ~100 ms sin tocar el LLM → ahorra 30–40% de tokens/mes. Solo cuando no hay variables personalizadas (texto fijo idéntico para todos)

**Criterio de salida de Fase E:** el dashboard muestra leads puntuados y ordenados por `score`. Al menos un follow-up automático se dispara y se registra en logs. Un handoff `score>80` genera una notificación real en el canal configurado. Se puede medir la conversion rate de cada agente y compararla entre variantes A/B.

---

## 6. Criterios de aceptación globales

- [ ] Cualquier `message.id` duplicado produce **una sola** respuesta IA (A1+A9 verificado).
- [ ] Grupos WhatsApp y `status@broadcast` **nunca** reciben respuesta automática.
- [ ] El agente EscortsHub sigue funcionando idénticamente tras mover el prompt a DB (regresión 0%).
- [ ] Un segundo cliente (ej. agencia inmobiliaria) puede coexistir con su propio agente IA sin ver datos de EscortsHub. **Aislamiento verificado en capa aplicación** (Prisma extension + `TenantContextGuard`) como línea principal; **RLS como defensa secundaria** contra accesos directos.
- [ ] Tests e2e de aislamiento: usuario de tenant A intentando acceder a recursos de tenant B recibe 403/404 en API, y si consulta directo a Supabase con un token obtenido vía `getToken({ template: 'supabase' })` del tenant A, RLS bloquea las filas de B **(solo aplicable en la ruta completa, una vez activado `B3.4`)**.
- [ ] Tests de dedupe, HMAC y aislamiento multi-tenant verdes en CI.
- [ ] VPS opera estable con 5 sesiones concurrentes en pruebas de carga.
- [ ] Typing indicator visible en WhatsApp real antes de cada respuesta.
- [ ] Dashboard permite editar todos los campos del agente y probar con **Preview** sin enviar a WhatsApp.
- [ ] Ningún `process.exit` por `unhandledRejection` en logs de producción por 72h continuas.
- [ ] **Session token** de Clerk contiene los claims `org_id` y `tenant_id` (verificable con `jwt.io` en un token real de un usuario perteneciente a una org); adicionalmente, si se activa `B3.4`, el **JWT Template `supabase`** también contiene `tenant_id` (v6.5: distinción explícita entre session token y JWT template para clientes externos).
- [ ] **Usuario autenticado sin org activa es redirigido a `/select-org`** y, tras seleccionar org, el JWT contiene `org_id` (criterio v6.1 para UX de onboarding multi-tenant).
- [ ] Test e2e race condition: JWT emitido antes del sync de metadata → request sigue funcionando por lookup server-side en `tenants` → tras `getToken({skipCache:true})` el JWT ya contiene `tenant_id`.
- [ ] CI bloquea PRs que usen métodos Prisma no permitidos (`findUnique`/`update`/`delete`/`upsert`) sobre modelos tenant-scoped, fuera de helpers aprobados de bypass/admin (v6.1 — regla `no-unscoped-prisma` endurecida).

---

## 7. Riesgos y mitigaciones

| Riesgo                                                                                                 | Probabilidad     | Impacto     | Mitigación                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------ | ---------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Migración Prisma rompe datos existentes                                                                | Media            | Alto        | Backfill script con dry-run en branch de Supabase                                                                                                                              |
| whatsapp-web.js banea número por actividad comercial                                                   | Alta             | Alto        | Rate limits por agente (200/h ya existe). Plan B: Business API si Meta banea                                                                                                   |
| Memory leak de whatsapp-web.js en runtime largo                                                        | **Alta**         | Alto        | C7 restart programado + C1 monitor + C8 healthcheck detached frames                                                                                                            |
| Clerk Organizations tiene coste extra en el plan actual                                                | Baja             | Medio       | **Validar antes de B1**: free tier = 5 orgs activas; Pro $25/mes si se supera                                                                                                  |
| Cambiar `sessionId` rompe LocalAuth/snapshots                                                          | Baja             | Alto        | **No cambiar `sessionId` existentes**; nuevos agentes usan nuevos `sessionId`                                                                                                  |
| `custom_instructions` del cliente contiene jailbreak/prompt injection                                  | Media            | Medio       | Sanitizar + preamble universal no-bypasseable + tests con prompts adversariales                                                                                                |
| Bug de query expone datos entre tenants                                                                | Media            | **Crítico** | **Enforcement principal**: Prisma extension (auto-inyecta `tenantId`) + `TenantContextGuard`. **Defensa secundaria**: RLS Supabase. Tests e2e de aislamiento explícitos (B3.3) |
| Service_role bypasea RLS y expone datos                                                                | Media            | Alto        | Auditoría en B3.5; migración progresiva de endpoints dashboard → NestJS API. Documentar bypasses remanentes con `// RLS-BYPASS:`                                               |
| Backfill de `tenant_id` asigna filas al tenant incorrecto                                              | Baja             | Alto        | Dry-run en branch Supabase; verificación manual de las sesiones existentes antes de aplicar en prod. PR1 solo añade columnas nullable y no se aplica solo a prod               |
| Lead con mismo `phone` en dos tenants colisiona por unicidad global vieja                              | Alta (al migrar) | Alto        | PR1 conserva `Lead.phone @unique`; B1.5 se ejecuta post-backfill/PR4 para evitar la ventana donde `tenant_id=NULL` permitiría duplicados en unique compuesto                    |
| Scraping del sitio web del cliente es lento o falla                                                    | Media            | Bajo        | Diferir a Fase D. Inicialmente todo manual en `AiKnowledgeItem`                                                                                                                |
| Caché de prompt se queda con versión vieja tras edición                                                | Media            | Medio       | Invalidación explícita al `PUT /ai-agents/:id`; TTL corto (5 min)                                                                                                              |
| Cliente elige modelo LLM caro → coste no controlado                                                    | Media            | Medio       | Whitelist de modelos por plan + cap de tokens/mes por agente en AIService                                                                                                      |
| JWT de Clerk no incluye `tenant_id` por template mal configurado o webhook de sync falló               | Media            | Alto        | B1.2 + B1.10 + test e2e que valida el claim en un JWT real antes de activar RLS en B3.4. Fallback: middleware resuelve `tenant_id` por lookup `clerk_org_id` si el claim falta |
| `findUnique`/`update`/`delete` sin `tenantId` expone datos cross-tenant aunque exista Prisma extension | Alta             | **Crítico** | B2.0 refactor explícito del código existente + B1.14 ESLint rule bloquea regresiones en CI                                                                                     |
| Policy RLS genérica bloquea filas globales de `ai_configuration`                                       | Media            | Medio       | Policy especial en B3.4 con `tenant_id IS NULL OR ...`. Writes globales solo con service_role                                                                                  |
| Prisma Client nuevo contra DB sin B1 migration                                                         | Alta             | Alto        | Smoke 2026-05-01: `/leads` y `/templates` devuelven 500 porque Prisma selecciona columnas nuevas. Mitigación: migrar local/staging antes de arrancar API, o no desplegar app code B1 hasta aplicar DB migration |

---

## 8. Decisiones (resueltas tras análisis comparativo de mercado + revisión técnica v5)

### 8.1 Decisiones de producto (v2-v4)

| #   | Decisión                               | Resolución                                        | Justificación                                                                                                                |
| --- | -------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | Clerk Organizations vs `Tenant` propio | **Clerk Orgs + Tabla `Tenant` interna** (híbrido) | Clerk gestiona auth; tabla interna desacopla datos propios (billing, plan) y da UUIDs estables en vez del string `org_xxxxx` |
| 2   | `AiAgent` 1:1 sesión vs N:1 tenant     | **N:1 con tenant**, FK opcional en sesión         | Refleja patrón OpenAI Assistants / Claude Managed Agents. Permite reuso                                                      |
| 3   | Website scraping en B o D              | **Diferir a Fase D**                              | No bloquea MVP                                                                                                               |
| 4   | Idioma dashboard                       | **es-ES únicamente** en MVP                       | i18n en Fase D                                                                                                               |
| 5   | RLS en Supabase                        | **Defensa secundaria** (ver §8.2)                 | Enforcement principal en capa app                                                                                            |
| 6   | Modelo LLM por agente                  | **Configurable por agente** + default global      | Habilita tiering de precios                                                                                                  |

### 8.2 Decisiones técnicas (v5, tras revisión)

| #   | Pregunta                                                     | Resolución                                                                                                                  |
| --- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 7   | ¿`organization_id` con `org_xxxxx` de Clerk o tabla interna? | **Tabla `Tenant` interna con UUID PK + `clerk_org_id VARCHAR UNIQUE`**. Desacopla del vendor de auth, permite datos propios |
| 8   | ¿RLS como enforcement principal o secundario?                | **Secundario**. Principal = Prisma extension + `TenantContextGuard`. RLS solo como "trip wire" en accesos directos          |
| 9   | ¿`WhatsAppConversation.sessionId` string o FK?               | **FK real** (`whatsappSessionId UUID`). PR1 añade columna nullable en paralelo; backfill/drop del string va en PR3/PR4       |
| 10  | ¿`Lead.phone` unicidad?                                      | **Objetivo final `@@unique([tenantId, phone])`**. PR1 mantiene `@unique` global hasta backfill para no abrir duplicados       |

### 8.3 Matriz de tablas del ámbito multi-tenant (v6.1 — 13 tablas con RLS)

**Conteo oficial (v6.1):** 1 tabla raíz (`tenants`) + 11 tablas con policy normal por `tenant_id` + 1 tabla mixta (`ai_configuration`) = **13 tablas con RLS activa**. De éstas, **12 llevan columna `tenant_id` FK** (todas menos `tenants`, que es la raíz).

| Tabla                      | `tenant_id`                                  | Tipo RLS                                                                       | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenants`                  | — (es raíz)                                  | Raíz: `USING (id = claim)`                                                     | PK propia; un usuario solo ve su propio tenant                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `users`                    | no directo (v6.3 decidido: **queda global**) | Sin RLS tenant                                                                 | Membership gestionada por Clerk Organizations. `users` **no debe exponerse nunca en vistas/listados tenant-scoped**; cualquier listado de miembros de un tenant se resuelve vía Clerk API (`clerkClient.organizations.getOrganizationMembershipList({organizationId})`), NO vía query directa a `users`. Si en futuro se necesita JOIN SQL entre `users` y datos tenant (ej: "leads del usuario X en este tenant"), **reevaluar** e introducir tabla `tenant_memberships(user_id, tenant_id, role)` local. No para MVP |
| `whatsapp_sessions`        | ✅                                           |                                                                                |
| `whatsapp_conversations`   | ✅                                           | PR1: `whatsapp_session_id` nullable en paralelo; PR3/PR4: backfill + cleanup   |
| `messages`                 | ✅                                           |                                                                                |
| `leads`                    | ✅                                           | PR1: conserva `phone @unique`; PR4: `@@unique([tenantId, phone])` post-backfill |
| `proactive_messages`       | ✅                                           |                                                                                |
| `message_templates`        | ✅ (**v6**)                                  | Antes global; ahora tenant-scoped porque `proactive_messages.templateId` es FK |
| `whatsapp_whitelist_logs`  | ✅                                           |                                                                                |
| `ai_training_interactions` | ✅                                           |                                                                                |
| `ai_agents`                | ✅                                           |                                                                                |
| `ai_knowledge_base` / `ai_knowledge_items` | ✅                              | PR1: tabla legacy `ai_knowledge_base` con `tenant_id` + `agent_id NULL`; PR4: rename runtime-aware a `ai_knowledge_items` |
| `ai_products`              | ✅                                           | + FK a `ai_agent`                                                              |
| `ai_configuration`         | nullable                                     | Permite configs globales (`tenant_id IS NULL`); policy RLS especial §4.4       |

---

## 9. Referencias

### Archivos clave en el código

- `apps/whatsapp-service/src/services/whatsapp-core/EventDispatcher.ts:313-362` — handler de mensajes entrantes
- `apps/whatsapp-service/src/services/whatsapp-core/MessageHandler.ts:130-351` — procesamiento con IA
- `apps/whatsapp-service/src/services/AIThinkingService.ts:110-323` — orquestación de "thinking"
- `apps/whatsapp-service/src/services/ai/SystemPromptService.ts:82-134` — prompt hardcoded actual (a extraer)
- `apps/whatsapp-service/src/middleware/auth.ts` — HMAC server-to-server (mantener intacto)
- `apps/whatsapp-service/src/index.ts:12-22` — `process.exit` agresivo (a suavizar en A6)
- `packages/db/prisma/schema.prisma` — B1 PR1 schema foundation ya añade `Tenant`, `AiAgent`, `AiProduct`, `tenant_id` nullable, `ai_agent_id`, `agent_id` y `whatsapp_session_id` sin cambios destructivos
- `packages/db/prisma/migrations/20260501120000_b1_foundation_schema/migration.sql` — migration additive-only generada offline e inspeccionada sin `DROP`/`RENAME`/`NOT NULL`
- `packages/db/prisma/schema.prisma:ai_knowledge_base` — PR1 extendido; rename a `ai_knowledge_items` queda para PR4 runtime-aware
- `packages/db/prisma/schema.prisma:WhatsAppSession` — PR1 extendido con `tenant_id` + `ai_agent_id`; backfill/uso runtime queda para PR3/B2

### Documentos relacionados

- `PRD-ESTABILIZACION.md` — PRD anterior, cerrado 2026-04-18
- `ANALISIS-ESTADO-PROYECTO.md` — snapshot v5 post-estabilización
- `CLAUDE.md` — instrucciones generales del proyecto

### Recursos externos

- [Clerk Organizations](https://clerk.com/docs/organizations)
- [Clerk + Supabase B2B multi-tenancy guide](https://clerk.com/blog/multitenancy-clerk-supabase-b2b)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [whatsapp-web.js](https://wwebjs.dev)
- Issues wwebjs relevantes: [#2024 scaling](https://github.com/pedroslopez/whatsapp-web.js/issues/2024), [#3957 memory](https://github.com/pedroslopez/whatsapp-web.js/issues/3957), [#5817 memory leak 2026](https://github.com/pedroslopez/whatsapp-web.js/issues/5817)
- Meta WhatsApp Business API (futuro, §11) — https://developers.facebook.com/docs/whatsapp

---

## 10. Changelog

| Fecha      | Versión | Autor                                                    | Cambio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | ------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-19 | v1      | Eduard S. + Claude                                       | Documento inicial tras auditoría del whatsapp-service                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-04-19 | v2      | Eduard S. + Claude                                       | Decisiones §8 resueltas tras análisis comparativo de mercado. `AiAgent` cambia a N-por-org. Añadidas tareas B15 (JWT template Clerk) y B16 (RLS Supabase). Fase C reetiquetada como obligatoria tras 10 sesiones por memory leaks wwebjs. Confirmado: whatsapp-web.js se mantiene como cliente WhatsApp; Business API queda en §11 roadmap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-04-19 | v3      | Eduard S. + Claude                                       | Añadida **Fase E — Lead Optimization Module** (E1–E7: structured extraction, lead scoring, follow-up jobs, handoff webhook, conversion tracking, A/B prompts, templates determinísticos). Añadidas tareas **D5 (GDPR)** y **D6 (redacción PII en logs)** a Fase D. §4.2 añade **Capa [10]** al prompt para structured output. §3 aclara que retención/GDPR está en Fase D, no es bloqueador del MVP                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-04-19 | v4      | Eduard S. + Claude                                       | **Opción B — Personalización ampliada.** `AiAgent` agrupado en 5 secciones (Identidad, Personalidad, Instrucciones, Goal, LLM) con nuevos campos: `logo_url`, `business_hours`, `primary_goal`, `goal_cta_url`, `goal_description`, `enable_structured_extraction`. **Nueva tabla `AiProduct`** (catálogo estructurado con precio/URL/imagen/tags). UI expandida a **8 tabs** (+Productos +Conversión). B12b nuevo: `KnowledgeRetriever` filtra productos por keywords/precio/tags. Inspirado en patrones de OpenAI Custom GPTs, Claude Projects, Intercom Fin, Wati                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-04-19 | v5      | Eduard S. + Claude + Codex review                        | **Correcciones técnicas tras review de Codex** (7/7 hallazgos válidos). (1) Introducida tabla interna `Tenant` UUID + `clerk_org_id` string — ya no se castea `org_id` de Clerk a UUID. (2) §4.4 reescrito: enforcement principal en capa aplicación (Prisma extension + `TenantContextGuard`), RLS como defensa **secundaria** — realista con los 3 clientes de BD actuales (Prisma directo, pg.Pool, service_role). (3) Matriz §8.3: 12 tablas tenant-scoped (antes 4). (4) `WhatsAppConversation.sessionId` pasa a FK real `whatsapp_session_id`. (5) `Lead.phone` cambia a `@@unique([tenantId, phone])`. (6) Fase B dividida en **B.1 (Datos+Auth), B.2 (Runtime IA), B.3 (UI+E2E+RLS)** — 3 subfases de ~2 días. (7) A8 corregida: test HMAC ya existe en `auth.spec.ts`, tarea pasa a "ampliar" en vez de "crear". (8) B2.2/B2.3 propagan `tenantId + aiAgentId` hasta `DatabaseService.searchKnowledgeBase`. (9) Backfill detallado en B1.9. (10) Nuevos riesgos en §7: service_role bypass, backfill incorrecto, colisión de phone global                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-04-19 | v6      | Eduard S. + Claude + Codex review (2ª ronda)             | **Correcciones técnicas tras 2ª review de Codex** (6/6 hallazgos válidos). (1) §4.4 añade **tabla de cobertura Prisma**: la extension solo intercepta operaciones no-únicas (`findMany`/`updateMany`/...); `findUnique`/`update`/`delete` requieren refactor manual. Nuevo **B2.0** con archivos y líneas concretos del repo (`leads.service.ts`, `whatsapp.service.ts`, `templates.service.ts`). Nueva **B1.14** ESLint rule `no-unscoped-prisma` para prevenir regresiones. (2) **`message_templates` entra en matriz** tenant-scoped (antes global pero referenciada por `proactive_messages`). Matriz pasa a 13 tablas. (3) §4.4 define **mecanismo concreto** para `tenant_id` en JWT: webhook escribe `publicMetadata` en Clerk + JWT template lo lee. B1.2 y B1.10 actualizadas con el flujo. (4) `ai_configuration` recibe **policy RLS especial** (`tenant_id IS NULL OR ...` para SELECT; writes globales solo via service_role) documentada en §4.4 y B3.4. (5) B1.9 usa **`clerk_org_id` real** de EscortsHub desde el inicio, elimina seed temporal `org_seed` y evita convergencia posterior. (6) Consistencias internas corregidas: "10 tablas"→"13 tablas" en B1.4, criterios §6 actualizados con "enforcement principal" y `tenant_id`, referencia a B15 inexistente eliminada (reemplazada por B1.2+B1.10)                                                                                                                                                                                                                                                                                                                                                          |
| 2026-04-19 | v6.1    | Eduard S. + Claude + Codex review (3ª ronda)             | **Refinamientos operativos tras 3ª review** (6/6 hallazgos válidos). (1) §4.4 añade **precondición operativa**: usuario debe pertenecer a Clerk Org activa; sin `org_id` en JWT → redirect a `/select-org`. Nuevas tareas **B1.1a** (crear org real EscortsHub en Clerk Dashboard) y **B1.1b** (UI con `<OrganizationList />` / `<OrganizationSwitcher />`). (2) Eliminada la referencia inexistente `auth.session.touch()`; sustituida por **`getToken({skipCache:true})` o `user.reload()`** (métodos reales de Clerk Next.js SDK). Lookup server-side por `clerk_org_id` como fallback para race conditions. Test e2e añadido en §6. (3) §4.4 cierra **separación de webhooks Clerk**: `/api/webhooks/clerk` (Next.js, `CLERK_WEBHOOK_SECRET`) para user events sigue como está; nuevo `/api/webhooks/clerk/organizations` (NestJS, **`CLERK_ORG_WEBHOOK_SECRET` dedicado**) para org events. Ambos verifican Svix. (4) **B1.14 ESLint rule endurecida**: prohíbe directamente `findUnique`/`findUniqueOrThrow`/`update`/`delete`/`upsert` sobre modelos tenant-scoped fuera de helpers de bypass, en lugar de "heurística de detección de tenantId". (5) **Normalizado conteo de tablas**: 13 tablas del ámbito = 1 raíz (`tenants`) + 11 normales + 1 mixta (`ai_configuration`); 12 tablas llevan columna `tenant_id`. B1.4, B3.4, §8.3 armonizadas. (6) Nuevo **patrón transaccional en §4.4 y B2.0**: `findFirst → NotFoundException → updateMany → re-read → return` para preservar contratos que devolvían la entidad modificada (leads.service.ts, templates.service.ts). Sin este patrón, cambiar a `updateMany` rompería el frontend                                     |
| 2026-04-19 | v6.2    | Eduard S. + Claude + Codex review (4ª ronda)             | **Precisión operacional final tras 4ª review** (5/5 hallazgos válidos). (1) **§4.4 y B1.13 — Prisma extension dividida explícitamente por tipo de modelo**: 11 normales (scope automático), `ai_configuration` (helpers dedicados `aiConfig.getTenantScoped/setTenantValue/setGlobal`, no scope genérico), `tenants` (fuera de extension, acceso solo por `tenantsService.findByClerkOrgId/findById`). Antes mezclaba "los 13 modelos" sin distinguir. Bypass renombrado a `withTenantBypass()` (función con nombre, no decorador mágico). (2) **§4.4 y B3.4 — policies RLS con `USING` + `WITH CHECK` explícitos**. Sin `WITH CHECK`, un UPDATE podría cambiar `tenant_id` a otro tenant; gap de seguridad real. SQL completo documentado por tipo de tabla. Test e2e explícito en B3.4. (3) **Ruta webhook unificada** a `/api/webhooks/clerk/organizations` (plural) en todo el documento: §4.4, B1.10, changelog — antes B1.10 decía singular. (4) **B1.14 — whitelist ESLint reducida a 3 archivos exactos** (no globs de carpeta): `scripts/backfill-tenant.ts`, `webhooks/clerk-organizations.controller.ts`, `tenant-scope.ts`. Cualquier otro bypass legítimo debe envolverse en `withTenantBypass(async (tx) => ...)` que la regla reconoce. Cierra el hueco de "cualquier archivo en `*/admin/*` puede saltarse la regla". (5) **B1.11 — cambios concretos contra el middleware actual** (`apps/dashboard/middleware.ts` líneas 5-12 y 36-38): añadir `orgId` a la desestructuración de `auth()`, añadir `/select-org(.*)` como ruta pública, redirigir a `/select-org` si `userId && !orgId`, evitar loop no redirigiendo desde `/select-org` a sí misma cuando `!userId` |
| 2026-04-19 | v6.3    | Eduard S. + Claude + Codex review (5ª ronda)             | **Ajustes finos de implementación Clerk tras 5ª review** (3/3 hallazgos válidos + 1 pregunta abierta resuelta). (1) **§4.4 y B1.2 — distinción explícita entre "Customize session token" y "JWT Templates"** en Clerk. El plan anterior usaba "JWT template" genérico; en Clerk son dos mecanismos distintos: `auth()` lee el **session token** (Sessions → Customize session token), mientras que `getToken({template:'supabase'})` usa **JWT Templates** para clientes externos. Sin esta distinción, implementar solo un JWT template dejaba al middleware/NestJS sin el claim `tenant_id`. B1.2 ahora lista los dos lugares del dashboard Clerk por separado. (2) **§4.4, B1.9, B1.10 — método HTTP corregido de `POST` a `PATCH`** para actualizar `organization.publicMetadata` en la API de Clerk. Con POST la llamada falla y el claim `tenant_id` nunca llega al token. (3) **B3.4 — test e2e de `WITH CHECK` reescrito**. El test anterior (autenticar como B, intentar update en fila de A) fallaba por `USING`, no por `WITH CHECK`. El correcto: autenticar como A, tomar fila propia, intentar `UPDATE` cambiando `tenant_id` a B → USING pasa, WITH CHECK falla. Esto valida realmente la protección anti-"mover filas". (4) **Pregunta abierta resuelta — `users` queda global**: §8.3 documenta explícitamente que `users` NO se expone en vistas/listados tenant-scoped. Listados de miembros se resuelven vía Clerk API (`clerkClient.organizations.getOrganizationMembershipList`), no vía query directa. Si en futuro se necesita JOIN SQL con `users`, reevaluar e introducir `tenant_memberships` local                                                        |
| 2026-04-19 | v6.4    | Eduard S. + Claude (auto-crítica anti-overkill)          | **Añadido §12 MVP Lean Path** para evitar sobre-ingeniería en el arranque. Tras 5 rondas de review el plan acumula ~50 tareas; muchas son "defensa en profundidad" buenas pero no bloqueantes para 1–3 clientes piloto. §12 documenta qué subconjunto ejecutar en MVP (todas las fases A, B.1, B.2 + **B.3 reducida con 4 tabs UI + `B1.14-lite` (script CI grep) como sustituto temporal de `B1.14-full`** en vez de la ESLint AST completa) y qué diferir (RLS con WITH CHECK, JWT Template "supabase", B3.6 POC migración, Fases C/D/E). El plan completo queda como roadmap; el MVP lean es la ruta acelerada. Ahorra ~1–2 días y reduce superficie de bugs iniciales **sin perder ninguna garantía de seguridad esencial** — el aislamiento multi-tenant sigue vía Prisma extension + Guards. Incluye criterios claros de "cuándo activar cada pieza diferida" (§12.7) para evitar que el lean se convierta en deuda técnica olvidada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-04-19 | v6.5    | Eduard S. + Claude + Codex review (6ª ronda)             | **Correcciones técnicas finas tras 6ª review** (4/4 hallazgos válidos). (1) **Bug real corregido — ruta Clerk de metadata**: era `PATCH /v1/organizations/{org_id}`, debe ser `PATCH /v1/organizations/{org_id}/metadata` (endpoint dedicado que hace merge). Actualizado en §4.4, B1.9, B1.10. Sin esto la llamada falla y el claim `tenant_id` nunca llega al token. (2) **Nota explícita sobre `req.rawBody`** en B1.10: la verificación Svix del webhook de organizaciones debe usar el raw buffer capturado en `apps/api/src/main.ts:9-23`, no el body parseado; si no, la firma falla. (3) **Separación de criterios de aceptación ruta completa vs lean**: nueva nota al inicio de §6 y **§12.7 Criterios de aceptación MVP lean** (checklist propio de la ruta lean sin exigir B3.4/B3.6/JWT Template supabase). (4) **Decisión de producto explícita sobre self-service**: §12.3 aclara que "Conocimiento via SQL" solo es aceptable si el equipo fundador onboardea manualmente a los 1–3 pilotos; si se quiere self-service real desde el primer piloto, el tab `Conocimiento` se mantiene en versión mínima (lista simple Q&A). (5) **Ajuste de 2 criterios §6**: "JWT de Clerk contiene tenant_id" → "Session token" (vs JWT Template); y el criterio de "consulta directo a Supabase con JWT de A" → "con token `getToken({template:'supabase'})` del tenant A, solo en ruta completa"                                                                                                                                                                                                                                                                                  |
| 2026-04-19 | v6.6    | Eduard S. + Claude + Codex review (7ª ronda)             | **Ajustes de consistencia textual tras 7ª review** (4/4 hallazgos válidos). (1) **Nomenclatura `B1.14-lite` vs `B1.14-full`** introducida en §12.1, §12.2, §12.4, §12.6 y changelog v6.4 para eliminar ambigüedad entre "B.1 completa" y "B1.14 diferida". Ahora el lean ejecuta **`B1.14-lite`** (script CI bash) y difiere **`B1.14-full`** (regla ESLint AST). (2) **Lógica exacta `/select-org` reescrita en B1.11** con división explícita de responsabilidades middleware vs página: el middleware nunca redirige `/select-org` a sí misma; la propia página detecta `!userId` y redirige a `/sign-in`; el middleware solo redirige rutas protegidas con `userId && !orgId` hacia `/select-org`. Evita ambigüedad que podría causar loop. (3) **Regla de mapeo `price` → `price_min = price_max`** añadida en §12.3. Schema no cambia; solo la UI lean usa input único que se duplica al persistir. (4) **Reordenadas §12.6 y §12.7** para orden numérico natural: 12.6 Criterios de aceptación MVP lean; 12.7 Cuándo saltar a ruta completa. (5) **Fila B1.2 (b) JWT Template "supabase" en §12.2** aclara: obligatoria en ruta completa cuando se valide RLS directa o migren endpoints a `anon` — alineado con §6                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-04-19 | v6.7    | Eduard S. + Claude + Codex review (8ª ronda)             | **Resolución final de inconsistencia B1.2(b) + orden físico §11/§12** (3/3 hallazgos válidos + pregunta abierta resuelta). (1) **B1.2 dividida formalmente en B1.2(a) y B1.2(b)** como tareas independientes en Fase B.1. `B1.2(a)` Customize session token es obligatoria en MVP lean y ruta completa. `B1.2(b)` JWT Template "supabase" se difiere en lean. (2) **§12.1 y §12.6 actualizados** con "Fase B.1 completa salvo B1.2(b) y B1.14-full" — elimina la contradicción entre "B.1 completa" y "B1.2(b) diferida" que se venía arrastrando. (3) **§12.7 triggers de salto actualizados** con **tripleta B1.2(b) + B3.4 + B1.14-full** como activación simultánea. Sin B1.2(b), activar B3.4 bloquea todas las queries `anon` legítimas; por eso son acopladas, no independientes. (4) **§12.2 reescrita la fila B1.2(b)** como "condicional, no opcional": se activa SI y SOLO SI hay RLS directa o cliente `anon`. Resuelve la pregunta abierta: no es siempre obligatoria en ruta completa — es prerequisito de B3.4/B3.6 (si no se activan esas, B1.2(b) tampoco aporta). (5) **Orden físico §11/§12 corregido**: §11 Roadmap post-Fase C ahora aparece **antes** de §12 MVP Lean Path en el archivo, siguiendo numeración natural                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-04-19 | v6.8    | Eduard S. + Claude + Codex review (9ª ronda)             | **Ajuste de precisión terminológica sobre B1.2(b)** (1/1 hallazgo válido). §12.2 decía "tripleta acoplada con B3.4 y B3.6" pero §12.7 agrupa "tripleta B1.2(b) + B3.4 + B1.14-full" dejando B3.6 para después. La verdad técnica es que **B1.2(b) es prerequisito de _cualquier uso de cliente `anon`_ o validación RLS directa**, no de una tripleta fija con B3.4+B3.6. Reescrita la frase: "se activa junto con la primera pieza de su cadena que se implemente, sea B3.4, B3.6 u otro uso futuro de `anon` client". Sin cambios en §12.7. Codex valida en esta ronda que el MVP Lean Path (§12) está "bien justificado" como apéndice operativo para 1–3 pilotos con onboarding fundador-led, mientras que la ruta completa sigue siendo el camino principal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-04-19 | v6.9    | Eduard S. + Claude + Codex review (10ª ronda)            | **Última inconsistencia textual eliminada** (1/1 hallazgo válido). §12.6 decía "se activan siguiendo la tripleta `B1.2(b) + B3.4 + B3.6`" pero esa tripleta ya no refleja la lógica actual del documento: §12.2 (v6.8) define `B1.2(b)` como prerequisito de cadena variable y §12.7 agrupa `B1.2(b) + B3.4 + B1.14-full` al salir a ruta completa, dejando `B3.6` para la fase siguiente. Reescrita la frase final de §12.6 con la cadena real: `B1.2(b)` se activa con el primer uso de cliente `anon`/RLS directa; `B3.4` y `B1.14-full` al salir a ruta completa; `B3.6` queda para la fase siguiente cuando empiece la migración de endpoints. Codex valida en esta ronda que la v6.9 está "prácticamente cerrada" y no ve problemas serios de arquitectura ni enfoque                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-04-19 | v7.0    | Eduard S. (owner decision)                               | **Decisión de ruta tomada: ruta completa**. Tras 11ª ronda de Codex sin hallazgos nuevos + validación final que posiciona al documento como "prácticamente cerrado", el owner elige la ruta completa (§§1–11) como camino de ejecución. §12 MVP Lean Path queda como referencia histórica y fallback operativo, no como camino activo. La decisión implica: **B1.2(b)**, **B3.4** (RLS con WITH CHECK), **B1.14-full** (ESLint AST rule) y **UI de 8 tabs** se ejecutan desde Fase B.1/B.3; **B3.6** (migración POC endpoint a `anon`) queda para la fase siguiente (no bloqueante del MVP). Cambia el estado del documento de "pendiente go del owner" a "listo para ejecutar Fase A". No más ediciones estructurales previstas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-04-19 | v7.1    | Eduard S. + Claude                                       | **§12 MVP Lean Path eliminado del documento** tras 12ª validación de Codex sin hallazgos nuevos. Motivo: con la ruta completa seleccionada como camino activo (v7.0), el lean path ya no aporta valor operativo y sí introduce ruido documental para el equipo de ejecución. Limpiezas aplicadas: (a) §12 completo borrado; (b) header "Ruta seleccionada" simplificado a "Completa (§§1–11)"; (c) §6 nota que redirigía a §12.7 eliminada; (d) B1.2(a) ya no menciona "MVP lean y ruta completa" — solo "Obligatoria"; (e) B1.2(b) ya no menciona "Obligatoria solo en ruta completa" / "Diferida en MVP lean" — ahora simplemente describe el prerequisito funcional. Se conservan en el changelog las entradas v6.4 → v6.9 que documentan la evolución del lean (historial completo). El documento queda con §§1–11 como única fuente de verdad del plan de ejecución. `B1.14-lite` desaparece como concepto; la única versión de B1.14 activa es la AST rule. Las decisiones tomadas durante las rondas lean (como la cardinalidad de tablas, separación B1.2(a/b), patrón transaccional Prisma) permanecen — solo se borra el camino alternativo, no las conclusiones técnicas que de él se derivaron                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-04-19 | v7.2    | Eduard S. + Claude (ejecución Fase A)                    | **Fase A ejecutada y verificada end-to-end.** §5 Fase A actualizada: las 10 tareas del plan original marcadas como completadas [x] + **5 hotfixes adicionales** descubiertos durante la ejecución (A11 duplicate question, A12 typing temprano, A13 humanized delay eliminado, A14 canonical content fix, A15/A15-bis/A15-ter whitelist en 3 capas). Latencia total mejorada de 15-18s → 5-7s (-65%). Tests 15/15 verdes. Verificación end-to-end con 2 números reales (Eduard existente + 34644773622 nuevo). Detectadas 3 deudas técnicas (T1-T3) pre-existentes que apuntan al patrón "dos writers sin coordinación" — ya previsto para Fase B. Detalle técnico completo de los 15 cambios en `CLAUDE.md` para no duplicar información entre documentos. Header del plan ahora dice "Fase A ejecutada y verificada end-to-end". Próximo paso: commit de branch `feature/foundation-hotfixes` + arranque de Fase B.1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-04-20 | v7.3    | Eduard S. + Claude (deploy Fase A + deuda T4)            | **Deploy de Fase A a prod Hetzner completado.** PR #10 mergeado (commit `1fd9e95`) a `develop`. `.env` editado en `/opt/leadcrm/apps/{whatsapp-service,api}/.env` con `WHATSAPP_ALLOW_NEW_LEADS=true`. PM2 restart aplicado con `--update-env`. Verificación via `/proc/$PID/environ`: whatsapp-service OK, api inicialmente NOT_LOADED. **Deuda T4 descubierta**: NestJS api no usa `dotenv`/`ConfigModule`, por tanto ignora `apps/api/.env`. Workaround temporal aplicado en prod: `export WHATSAPP_ALLOW_NEW_LEADS=true && pm2 restart leadcrm-api --update-env` (frágil ante reboot VPS). **Nueva tarea B1.15** añadida a Fase B.1 para instalar `ConfigModule.forRoot({ envFilePath: [...] })` en `apps/api/src/app.module.ts`. **B1.15 bloquea B1.2(a)** porque la configuración de session token + JWT template + webhook secrets Clerk todos leerán envs. CLAUDE.md documenta T4 con contexto completo. Vercel verificado: no tenía la env var (correcto — dashboard Next.js no la usa). Estado pre-Fase B: PR cerrado, develop up-to-date, prod funcional con captación de leads activa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-05-01 | v7.4    | Eduard S. + Claude + Codex review (post-fix double-init) | **Cleanup post-fix double-init y nueva deuda T5.** (1) Eliminada la entrada vieja "Doble init del whatsapp-service" en la lista de deudas técnicas — resuelta en branch `fix/whatsapp-double-init` (commit `e20e39a`) con el patrón lazy idempotent init (`initialized + initializePromise` en `WhatsAppService` y `WhatsAppServiceSimple`). El log "Initializing WhatsApp service implementation" pasa de 2× a 1× por boot; legacy `SessionRecoveryService.scheduleHealthChecks` borrado junto con sus métodos zombie en `HealthMetrics` (verificado seguro: cero consumers de `metadata.lastHealthCheck` en el repo). Smoke runtime verde con 2 mensajes reales (un saludo template + una respuesta LLM dinámica). (2) Añadida **T5 — cascading fallback colapsa cuando la `Page` de Puppeteer muere**. `MessageHandler.sendResponseWithStrategy` y los 2 niveles de fallback de `processMessageWithAI` operan todos contra la misma `Page`/`Message` reference; cuando un error de transporte (`Execution context destroyed`, `Target closed`, `Protocol error`) marca la page muerta, los 3 caminos fallan en cascada. Observado en owner smoke 2026-05-01 con `headless=false + devtools=true`. Phase C: diseñar retry/outbox idempotente — solución abierta entre descartar/outbox-idempotente/side-channel-confirm. (3) **`turbo.json` actualizado**: añadidos `PUPPETEER_*` y `CHROME_EXECUTABLE_PATH` al `globalEnv` whitelist para permitir override desde shell en dev local sin tocar `.env`. (4) CLAUDE.md documenta el caveat operacional de DevTools + page death con `headless=false` y la necesidad de `PUPPETEER_HEADLESS=true` para smoke fiable                   |
| 2026-05-01 | v7.5    | Eduard S. + Codex (B1 PR1 execution)                    | **B1 PR1 foundation schema additive-only implementado** en `feature/b1-foundation-schema` (commit `364979a`). (1) `develop` actualizado con fast-forward a `730599e`; rama nueva creada desde remoto actualizado. (2) `packages/db/prisma/schema.prisma` añade `Tenant`, `AiAgent`, `AiProduct`, `tenant_id` nullable en tablas scopeadas, `ai_agent_id` en `whatsapp_sessions`, `agent_id` en `ai_knowledge_base` y `whatsapp_session_id` nullable en `whatsapp_conversations`. (3) Se corrigió `.gitignore` para versionar Prisma migrations y se añadieron las migrations históricas + `20260501120000_b1_foundation_schema`. (4) PR1 evita explícitamente cambios destructivos: mantiene `Lead.phone @unique`, mantiene `whatsapp_conversations.session_id`, mantiene la tabla `ai_knowledge_base` sin rename, y no aplica migration a Supabase producción. (5) Verificación verde: `prisma validate`, `pnpm db:generate`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm lint`; SQL inspeccionado sin `DROP`, `RENAME`, `SET NOT NULL` ni `DROP CONSTRAINT`. Próximo paso: PR2 Clerk Organizations/webhook + PR3 backfill antes de aplicar en prod |

---

## 11. Roadmap post-Fase C (fuera de alcance de este plan)

Cuando las métricas justifiquen el salto:

- **R1 — WhatsApp Business API oficial (Meta Cloud API)**: migración del cliente WhatsApp cuando se superen ~200 clientes o haya un ban de número. Impacto: adiós Chromium, escala infinita, ~$0.005–0.08/mensaje. Requiere número dedicado + aprobación Meta + plantillas aprobadas.
- **R2 — Kubernetes o Hetzner Fleet**: autoescalado real de workers cuando >500 sesiones concurrentes.
- **R3 — AI Gateway (Vercel) o gateway propio**: unificar proveedores LLM con observabilidad y fallbacks.
- **R4 — Embeddings + RAG** para knowledge base (pgvector en Supabase o Pinecone).
- **R5 — Human handoff inbox**: UI de inbox compartido estilo Wati/Respond.io donde agentes humanos toman control con contexto completo.
- **R6 — i18n dashboard completo** (en/pt/fr).
