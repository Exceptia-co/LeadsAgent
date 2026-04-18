# Informe de Estado Real — LeadsCRM

**Fecha:** 2026-04-17 (v4 — auditoría claim-by-claim + verificación live contra Supabase / Hetzner / Vercel MCPs)
**Branch analizado:** `develop`
**Método:** Análisis estático del código fuente (v2) + revisión cruzada GPT-5.4 (v3) + auditoría claim-by-claim con citas `path:line` verificables (v3) + verificación live de Supabase, Hetzner y Vercel vía MCPs el 2026-04-17 (v4).

> En esta revisión se combinan hechos **verificables desde el repositorio** con **hechos live de infra**. Lo que sigue siendo no verificable (`.env` no commiteado, estado de webhook Clerk) permanece marcado. Las cifras de filas en DB son un snapshot del 2026-04-17.

---

## 1. Resumen Ejecutivo

LeadsCRM es un CRM con automatización de WhatsApp en estado de **MVP funcional pero con gaps significativos de seguridad e integración**. El monorepo tiene 4 apps y 4 packages compartidos. El flujo más sólido es el de gestión de leads (CRUD completo, frontend conectado a la API con autenticación Clerk). El servicio de WhatsApp tiene una arquitectura ambiciosa con pipeline de IA (OpenRouter/Gemini), gestión de sesiones QR, persistencia Redis y reconexión automática, pero su integración con la API NestJS es parcial — el `AutomationService` está definido pero **nunca inyectado ni invocado**. No existen campañas hoy, pero la DB conserva huella histórica (migraciones `create_campaigns_table` y `create_campaign_leads_table` aplicadas en 2025-08-21 sin tablas reales). El dashboard presenta UI para funcionalidades que sólo parcialmente tienen backend. La base de datos tiene 10 modelos Prisma funcionales más 3 tablas operacionales extra (`_prisma_migrations`, `migrations` legacy vacía, `ai_training_interactions`), con deuda técnica verificada live: 3 pares de índices duplicados en `proactive_messages`, tipo incorrecto en `whatsapp_whitelist_logs.lead_id`, **RLS deshabilitado con 0 policies en las 13 tablas** y **Postgres con patches de seguridad pendientes** (advisor Supabase). Infraestructura: un único servidor Hetzner CX23 en Nuremberg con el firewall abierto 0.0.0.0/0 en 22/80/443/3002/3003 e IP pública `46.225.26.89`; Vercel despliega `dashboard` a `cromgod.space` pero la producción actual está detrás de commits recientes que nunca se promovieron. El proyecto tiene código muerto, rutas duplicadas (public vs autenticadas), una migración modular en progreso con feature toggles, y **varias superficies de ataque críticas** no mencionadas en el análisis v2: `WhatsAppController` Nest sin guard, whatsapp-service sin ninguna capa de auth, y duplicación de endpoints `/public/leads` en dos apps distintas.

---

## 2. Arquitectura Actual

### Apps y Servicios

| App | Tecnología | Puerto | Responsabilidad |
|-----|-----------|--------|-----------------|
| `apps/dashboard` | Next.js 14.2, Tailwind, Clerk, SWR | 3001 | UI del CRM: leads, WhatsApp, IA, settings |
| `apps/api` | NestJS 10, Prisma, Clerk guards | 3003 | REST API: CRUD leads, webhook WhatsApp, whitelist |
| `apps/whatsapp-service` | Express, whatsapp-web.js, Redis, Socket.IO | 3002 | Sesiones WhatsApp, pipeline IA, mensajería |
| `apps/docs` | Next.js 14 | — | Página de enlaces a otros servicios (mínima) |

### Packages Compartidos

| Package | Función | Estado de uso |
|---------|---------|---------------|
| `@leadcrm/db` | Prisma schema + client | Usado por API y WhatsApp service |
| `@leadcrm/ui` | 8 componentes React (alert, badge, button, card, checkbox, code, input, toggle) | 2 archivos consumidores (`dashboard/settings/page.tsx`, `docs/app/page.tsx`); solo 5 símbolos realmente importados |
| `@leadcrm/config-eslint` | Config ESLint compartida | Activo |
| `@leadcrm/config-ts` | Configs TypeScript base | Activo |

### Integraciones Externas

Código + verificación live MCP (2026-04-17):

| Servicio | Propósito | Evidencia código + estado live |
|----------|-----------|-------------------------------|
| **Clerk** | Autenticación JWT (dashboard + `LeadsController` de la API) | `apps/dashboard/middleware.ts`, `apps/api/src/auth/clerk-auth.guard.ts`; estado del webhook Clerk sigue no verificable desde fuera (Clerk MCP local solo expone SDK snippets) |
| **Supabase PostgreSQL** | Base de datos principal | Proyecto `yxjzsargboxnuwnbuzax` (`CRMWhatsApp`), región `eu-west-3`, status `ACTIVE_HEALTHY`, versión `supabase-postgres-17.4.1.069` (advisor: `vulnerable_postgres_version` — patches pendientes) |
| **Redis** (Docker local) | Cache de sesiones, QR, IA, pub/sub | `ioredis` en whatsapp-service |
| **OpenRouter** | Proveedor IA primario | `apps/whatsapp-service/src/services/ai/providers/OpenRouterProvider.ts` |
| **Google Gemini** | Proveedor IA fallback | `@google/generative-ai` en `providers/GeminiProvider.ts` |
| **Socket.IO** | WebSocket dashboard ↔ WhatsApp | Namespace `/whatsapp-sessions` en `SocketService.ts` |
| **Vercel** | Deploy del dashboard | Team `team_mP2bYgdUeXS5ArWzTHfw3RY5` (udeope's projects); project `dashboard` (`prj_3JGVC3KT0dnixeuZZwpcHTT0u3F6`), Next.js, Node 24.x, dominio `cromgod.space`. Producción actual commit `467e83c` (2026-04-02). `project.live: false` en la última consulta — revisar pausado/alias |
| **Hetzner** | Backend (API + WhatsApp service) | Server `118344573` llamado `whatsapp-service`, CX23 (2 vCPU, 4 GB, 40 GB SSD), Nuremberg `nbg1-dc3`, IP pública `46.225.26.89`. **Ambos servicios (API :3003 y WhatsApp :3002) viven en la misma máquina** |
| **GitHub** | Repositorio | `Exceptia-co/LeadsAgent`, `githubRepoVisibility: "public"` (verificado desde metadata de deployment Vercel) |

---

## 3. Funcionalidades Implementadas

| Área | Funcionalidad | Estado | Evidencia de código | Observación |
|------|--------------|--------|---------------------|-------------|
| **Auth** | Login/Signup con Clerk | ✅ Implementada | `apps/dashboard/middleware.ts`, `apps/api/src/auth/clerk-auth.guard.ts` | Protege dashboard y `LeadsController` |
| **Auth** | `ClerkAuthGuard` en `LeadsController` | ✅ Implementada | `apps/api/src/leads/leads.controller.ts:32` — `@UseGuards(ClerkAuthGuard)` | Inyecta userId en request |
| **Auth** | `WhatsAppController` Nest protegido | ❌ **No implementada** | `apps/api/src/whatsapp/whatsapp.controller.ts:33` — sin `@UseGuards` | `/whatsapp/send`, `/whatsapp/whitelist/*` expuestos sin token |
| **Auth** | Webhook Nest API | ⚠️ Parcial | `apps/api/src/whatsapp/whatsapp.controller.ts:45-54` — solo valida header estático `x-whatsapp-service` | No es un secreto compartido firmado |
| **Auth** | Redirección rutas protegidas | ✅ Implementada | `apps/dashboard/middleware.ts:15` — `isProtectedRoute = /dashboard(.*)` | Redirige a `/sign-in` si no autenticado |
| **Auth** | Cobertura del middleware dashboard | ⚠️ Parcial | `apps/dashboard/middleware.ts:5-12` | `isProtectedRoute` solo cubre `/dashboard`; `/api/debug/*`, `/api/whatsapp/*`, `/api/admin/*`, `/api/logs/*`, `/api/stats/*` dependen del handler individual |
| **Auth** | Matcher `/api/webhook` singular | ⚠️ Bug menor | `apps/dashboard/middleware.ts:9` | El webhook real es `/api/webhooks/clerk`; el matcher está mal escrito |
| **Leads** | CRUD completo (autenticado) | ✅ Implementada | `leads.controller.ts` (7 endpoints), `leads.service.ts`, `apps/dashboard/app/dashboard/leads/page.tsx` | Frontend consume `/public/leads` — ver gap abajo |
| **Leads** | Estadísticas por estado | ✅ Implementada | `leads.service.ts:getStats()`, dashboard `useLeadStats()` | Totales + breakdown por enum |
| **Leads** | Búsqueda y filtrado | ✅ Implementada | `LeadsQueryDto` (q, status, page, limit), dashboard con debounce | Búsqueda por nombre/teléfono/email |
| **Leads** | Endpoints públicos (test) | ⚠️ Riesgo | `public-leads.controller.ts` (4 endpoints sin auth) + `apps/whatsapp-service/src/routes/index.ts:286, 317, 394, 426, 505` (CRUD duplicado sin auth) | Duplicación en dos apps |
| **WhatsApp** | Gestión de sesiones QR | ✅ Implementada | `services/whatsapp-core/SessionManager.ts`, endpoint `POST /sessions` | QR en Redis, display en dashboard |
| **WhatsApp** | Persistencia de sesiones | ✅ Implementada | `SessionPersistenceService.ts`, `SnapshotService.ts` | Upsert a DB + snapshots encriptados |
| **WhatsApp** | Reconexión automática | ✅ Implementada | `SessionRecoveryService.ts`, `ConnectionManager.ts` | Feature toggle `WHATSAPP_ENABLE_AUTO_RECOVERY` |
| **WhatsApp** | Recepción de mensajes entrantes | ✅ Implementada | `MessageHandler.ts`, webhook `POST /whatsapp/webhook` en API | Crea lead si no existe, guarda mensaje |
| **WhatsApp** | Envío de mensajes | ✅ Implementada | API `sendMessage()` → `POST /api/sessions/:id/send` → whatsapp-service | End-to-end verificable |
| **WhatsApp** | Whitelist / filtrado | ✅ Implementada | `whitelist.service.ts` — 4 etapas: DB, patrones sospechosos, env flag, default | Logging a `WhatsAppWhitelistLog` |
| **WhatsApp** | Socket.IO tiempo real | ✅ Implementada | `apps/whatsapp-service/src/services/SocketService.ts`, dashboard `src/hooks/useSocket.ts` | Namespace `/whatsapp-sessions` |
| **WhatsApp** | Auth en whatsapp-service (Express) | ❌ **No implementada** | `apps/whatsapp-service/src/index.ts:83-98` — sólo CORS + rateLimit | Sin ningún middleware de autenticación |
| **IA** | Pipeline de respuesta automática | ✅ Implementada | `AIOrchestratorService.ts` → `IntentAnalyzer` → `ResponseGenerator` | Intent → context → knowledge → response |
| **IA** | Fallback multi-proveedor | ✅ Implementada | `AIProviderFactory.ts` — OpenRouter primary, Gemini fallback | Retry con backoff exponencial |
| **IA** | Cache de respuestas IA | ✅ Implementada | `CacheManager.ts` en `ai-thinking/` | Redis con TTL y tags por intent |
| **IA** | Knowledge base retrieval | ✅ Implementada | `KnowledgeRetriever.ts`, modelo `ai_knowledge_base` | Busca por categoría/keywords activos |
| **DB** | Schema 10 modelos Prisma | ✅ Implementada | `packages/db/prisma/schema.prisma:51-268` | User, Lead, Message, `ai_configuration`, `ai_knowledge_base`, MessageTemplate, ProactiveMessage, WhatsAppConversation, WhatsAppSession, WhatsAppWhitelistLog |
| **DB** | Tablas en `public` a nivel Supabase | ⚠️ Riesgo | Live MCP: **13 tablas** — 10 Prisma + `_prisma_migrations` (2 filas) + `migrations` legacy (0 filas, vacía) + `ai_training_interactions` (19 filas, fuera de Prisma) | Algunas tablas están desalineadas entre Prisma y supabase_migrations |
| **DB** | Migraciones Supabase huérfanas | ⚠️ Bug | Live MCP historial (`supabase_migrations`): 12 migraciones, incluyendo `20250821100704_create_campaigns_table` y `20250821100720_create_campaign_leads_table` (2025-08-21) | Esas tablas **no existen hoy** — feature "Campañas" se creó y se removió sin migración reversa |
| **DB** | Postgres outdated | ⚠️ Riesgo | Live MCP security advisor: `vulnerable_postgres_version` en `supabase-postgres-17.4.1.069` | Patches de seguridad disponibles, upgrade pendiente |
| **Dashboard** | Panel principal con stats | ✅ Implementada | `app/dashboard/page.tsx` — `useLeadStats()` + `useLeads()` | Auto-refresh 2min/5min |
| **Dashboard** | Página de leads | ✅ Implementada | `app/dashboard/leads/page.tsx` — tabla, modales, bulk select | CRUD completo consumiendo `/public/leads` |
| **Dashboard** | Página WhatsApp | ✅ Implementada | `app/dashboard/whatsapp/page.tsx` — tabs: sessions, send, conversations | Conectado a whatsapp-service vía proxy catch-all |
| **Dashboard** | Landing page | ✅ Implementada | `app/page.tsx` + `components/landing/*` | Hero, features, CTA |
| **Dashboard** | Proxies Next sin auth | ⚠️ Riesgo | `app/api/whatsapp/[...path]/route.ts`, `app/api/whatsapp/stats/route.ts`, `app/api/logs/whitelist/route.ts`, `app/api/stats/whitelist/route.ts` | Forwardean a whatsapp-service sin verificar Clerk |
| **Dashboard** | Rutas `admin` | ✅ Implementada | `app/api/admin/migrate-users/route.ts:48` — `requireRole(['admin'])` | Correcta protección con rol |
| **Dashboard** | Rutas `debug` con service role | ❌ Riesgo crítico | `app/api/debug/test-migration/route.ts:23`, `real-clerk-migration/route.ts:13,73`, `auth-flow/route.ts:13` | Usan `SUPABASE_SERVICE_ROLE_KEY` y/o `CLERK_SECRET_KEY` sin auth efectiva |
| **WhatsApp** | Templates CRUD | ✅ Implementada | `apps/whatsapp-service/src/routes/index.ts:806, 830, 872, 908` — GET/POST/PUT/DELETE | POST valida name/category/content; PUT y DELETE sin validación. Sin auth. Tabla `message_templates` con 0 filas (cifra infra) |
| **WhatsApp** | Proactive/Bulk messaging | ✅ Implementada | `routes/index.ts:976, 1148` — POST individual y bulk | Rate limit global por IP (300/min, deshabilitado en dev) + delay 2s entre bulk (`:1231`). Sin auth, sin cuota por sesión WhatsApp |
| **WhatsApp** | AI template suggest/improve | ✅ Implementada | `routes/index.ts:1396, 1507, 1614` | Consumo de tokens IA sin auth — riesgo de abuso |
| **IA** | Auto-respuestas por keyword | ⚠️ Código muerto | `apps/api/src/whatsapp/automation.service.ts:113-234` — 5 reglas hardcodeadas | **No registrado como provider** en `whatsapp.module.ts:10` |
| **IA** | Workflows automáticos | ⚠️ Código muerto | `automation.service.ts:337-386` — 2 workflows hardcodeados | No inyectado. `assignToUser()` solo loguea (`:450-465`) |
| **IA** | Config UI en dashboard | ⚠️ Parcial | `app/dashboard/ai/page.tsx` — system prompt, temperature, tokens | UI funcional, persistencia a whatsapp-service |
| **Settings** | Panel de configuración | ⚠️ Parcial | `app/dashboard/settings/page.tsx` — 8 tabs | Algunas tabs conectadas, otras solo UI |
| **WhatsApp** | Notificación de sesión a dashboard | ⚠️ Parcial | `apps/api/src/whatsapp/whatsapp.service.ts:140-158` — 3 handlers con TODO | Solo `console.log`, no actualizan DB ni notifican |
| **DB** | Seed data | ❌ Roto | `packages/db/prisma/seed.ts:17-19, 52-56` referencia `name`, `clerkId`, `type`, `sentiment`, `confidence`, `aiAnalyzed` — inexistentes en schema | Schema drift — no compila con tipos Prisma |
| **Campañas** | Sistema de campañas | ❌ No existe | Búsqueda de "campaign" sin resultados | No hay modelo, servicio ni UI |

---

## 4. Estado por Dominio

### Autenticación y Autorización

**Estado: Parcial.** Clerk maneja login/signup en el dashboard con middleware que protege `/dashboard/*`. La API valida JWT via `ClerkAuthGuard` **solo en `LeadsController`**; `WhatsAppController` (`apps/api/src/whatsapp/whatsapp.controller.ts:33`) **no tiene guard**, por lo que `/whatsapp/send`, `/whatsapp/whitelist/stats` y `/whatsapp/whitelist/authorize` son accesibles sin token. El webhook Nest API usa solo un header estático `x-whatsapp-service` (`:52`), no un secreto firmado. El whatsapp-service Express **no tiene ninguna capa de autenticación** (`apps/whatsapp-service/src/index.ts:83-98` — CORS + rateLimit per-IP). Los endpoints públicos (`/public/*`) existen en paralelo sin auth en dos apps distintas — útiles para desarrollo pero riesgo en producción. No hay sistema de roles de aplicación más allá de `requireRole(['admin'])` puntual en `/api/admin/migrate-users/route.ts:48`.

### Leads / CRM

**Estado: Implementada.** CRUD completo con 7 endpoints autenticados + 4 públicos en la API + 3 duplicados sin auth en el whatsapp-service. El frontend tiene tabla con búsqueda, paginación, sorting, modales de creación/edición/eliminación. Stats por estado funcionan. Normalización de teléfono (+/sin +) implementada pero potencialmente frágil. Tags almacenados como JSON. `moodScore` se transforma a `score` en la respuesta — acoplamiento de nombres.

### Mensajería / WhatsApp

**Estado: Implementada con gaps de seguridad severos.** El flujo core funciona: crear sesión → escanear QR → recibir mensajes → procesar con IA → responder. La persistencia de sesiones, snapshots encriptados y reconexión automática están implementados. Los endpoints de templates (CRUD) y proactive/bulk messaging **sí existen** inline en `routes/index.ts:806-933` y `:976-1344`, pero carecen de autenticación; la validación existe solo en POST templates y POST proactive (falta en PUT/DELETE). El rate limiting global por IP (`middleware/validation.ts:220-284`) es 300/min y **se desactiva en `NODE_ENV=development`** (`:227`); el bulk añade un delay de 2s por mensaje (`routes/index.ts:1231`). No hay cuota por sesión WhatsApp ni cuota horaria para evitar ban del proveedor. **Gap principal de cableado:** el `AutomationService` (auto-respuestas por keyword y workflows) existe en `apps/api/src/whatsapp/automation.service.ts` pero nunca está registrado como provider en `WhatsAppModule` (`apps/api/src/whatsapp/whatsapp.module.ts:10`). **Bug Socket.IO:** `apps/whatsapp-service/src/services/SocketService.ts:149` mapea `auth_failure` → `CONNECTING`, pero la UI define `AUTH_INVALID` en `apps/dashboard/types/index.ts:145` y lo renderiza en `app/dashboard/whatsapp/page.tsx:59, 1243, 1248, 1253, 1263` — el estado nunca llega al dashboard (nota: el tipo local en `src/hooks/useSocket.ts:8` sólo lista 4 estados, sin `AUTH_INVALID`).

### Campañas

**Estado: No existe.** No hay modelo, endpoint, servicio ni componente con este nombre en todo el codebase.

### IA / Sugerencias / Automatización

**Estado: Parcial-Avanzada.** El pipeline de IA en `whatsapp-service` es la parte más elaborada del proyecto: análisis de intención, enriquecimiento de contexto, knowledge base, generación de respuesta, cache Redis, fallback multi-proveedor. Sin embargo, la modularización está en progreso (feature toggles `USE_WHATSAPP_REFACTORED`, `USE_DATABASE_REPOSITORIES`) con **tres implementaciones coexistiendo** (Simple, Refactored, legacy). El `AIThinkingService` sigue siendo ~800 líneas. Los tests del módulo ai-thinking son los más completos del proyecto: **8 archivos** bajo `apps/whatsapp-service/src/services/ai-thinking/__tests__/` (CacheManager, IntentAnalyzer, ContextEnricher, ComplexityAnalyzer, KnowledgeRetriever, StrategySelector, ResponseGenerator, AIThinkingService integration) más `src/tests/phase4-integration.test.ts` fuera del módulo.

### Base de Datos y Modelos Prisma

**Estado: Funcional con deuda técnica.** **10 modelos Prisma** (`schema.prisma:51-268`) + 1 tabla fantasma (`ai_training_interactions`, 19 filas, no en `schema.prisma`) + 1 tabla legacy vacía (`migrations`, 0 filas, separada de `_prisma_migrations` que tiene 2 filas) + historial de **12 migraciones Supabase** en `supabase_migrations`, incluidas 2 que crearon `campaigns` y `campaign_leads` (2025-08-21) — tablas que **no existen actualmente**. Advisor Supabase flagea `vulnerable_postgres_version` en `17.4.1.069`. Problemas confirmados:

- **Índices duplicados en `ProactiveMessage`** (`schema.prisma:184-190`, verificados en DB live vía `pg_indexes`): 3 pares duplicados en `createdAt` (`idx_proactive_created` + `idx_proactive_messages_created_at`), `leadId` (`idx_proactive_lead` + `idx_proactive_messages_lead_id`) y `status` (`idx_proactive_status` + `idx_proactive_messages_status`).
- **`WhatsAppWhitelistLog.leadId` es `character varying(255)`** (`schema.prisma:253` y confirmado en `information_schema.columns` live) mientras `Lead.id` es `uuid`.
- **Seed desactualizado** (`packages/db/prisma/seed.ts:17-19, 52-56`): usa campos `name`, `clerkId`, `type`, `sentiment`, `confidence`, `aiAnalyzed` que no existen en los modelos reales.
- **Drift de naming en repositories**: `apps/whatsapp-service/src/services/db/ConversationRepository.ts:27-39` crea columnas en camelCase (`"sessionId"`, `"phoneNumber"`, ...) y `apps/whatsapp-service/src/services/db/LeadRepository.ts:28` define `"moodScore" INTEGER` cuando el schema Prisma usa snake_case con `@map` y `Decimal(3,2)`.
- **Naming heterogéneo del schema**: 8 modelos PascalCase (`User`, `Lead`, `Message`, `MessageTemplate`, `ProactiveMessage`, `WhatsAppConversation`, `WhatsAppSession`, `WhatsAppWhitelistLog`) vs 2 modelos snake_case sin `@@map` (`ai_configuration`, `ai_knowledge_base`) — Prisma client expone ambos patrones.

### Dashboard / UI

**Estado: Implementada con componentes parcialmente huérfanos.** 6 páginas principales bajo `/dashboard`, todas con data fetching vía SWR + Clerk JWT. El paquete `@leadcrm/ui` exporta 8 componentes; de ellos **5 se importan realmente** (`Toggle`, `Alert`, `AlertTitle`, `AlertDescription` en `apps/dashboard/app/dashboard/settings/page.tsx:6-7` y `Button` en `apps/docs/app/page.tsx:1`) — en **2 archivos consumidores** en total. Los otros 3 componentes (`badge`, `card`, `checkbox`, `code`, `input`) no tienen consumidor directo. La landing page tiene componentes visuales elaborados (bento grid, spotlight, moving border) definidos localmente.

### API / Endpoints

**Estado: Implementada con cobertura de auth desigual.** 15+ endpoints distribuidos entre `LeadsController` (7, protegidos), `PublicLeadsController` (4, sin protección por diseño), y `WhatsAppController` (5: `webhook`, `send`, `whitelist/stats`, `whitelist/authorize`) **todos sin `@UseGuards(ClerkAuthGuard)`**. Swagger configurado solo en dev. Throttling global con 3 niveles (10/s, 100/min, 1000/h) en `apps/api/src/app.module.ts:25-41`. Helmet con headers de seguridad. `ValidationPipe` global con whitelist. **Tests en la API: solo 1** archivo (`apps/api/src/app.controller.spec.ts` — boilerplate).

### WhatsApp Service / Express

**Estado: Implementada sin auth.** `apps/whatsapp-service/src/index.ts:83-98` monta: CORS (restrictivo en prod si `CORS_ORIGIN` configurado, `false` si no), `express.json`, `logRequest`, `rateLimit` (global por IP), y las rutas en **dos puntos de montaje**: `app.use('/api', routes.default)` y `app.use('/', routes.default)` (líneas 97-98). Cada endpoint responde tanto en `/foo` como en `/api/foo`. No hay ningún middleware de autenticación. El rate limit está **deshabilitado en `NODE_ENV=development`** (`middleware/validation.ts:227`).

---

## 5. Flujo Real del Producto Hoy

### Lo que un usuario puede hacer end-to-end

1. **Registrarse/Iniciar sesión** → Clerk maneja el flujo completo → redirige a `/dashboard`
2. **Ver dashboard** → estadísticas reales de leads desde la API, auto-refresh
3. **Gestionar leads** → crear, buscar, filtrar, editar, eliminar leads con validación
4. **Conectar WhatsApp** → crear sesión, escanear QR en dashboard, ver estado en tiempo real vía Socket.IO
5. **Recibir mensajes** → un mensaje entrante de WhatsApp pasa por whitelist, crea/actualiza lead, se guarda en DB
6. **Respuesta IA automática** → el mensaje pasa por el pipeline de IA (intent → context → knowledge → response) y se envía de vuelta
7. **Enviar mensajes manuales** → desde el dashboard, a través de la API hacia el whatsapp-service
8. **Ver conversaciones** → el dashboard muestra historial de mensajes por lead

### Flujos incompletos o con riesgo

- **Auto-respuestas por keyword:** `AutomationService` tiene 5 reglas pero no está inyectado — nunca se ejecuta
- **Workflows automáticos:** Definidos pero código muerto (mismo problema de inyección); `assignToUser()` solo loguea
- **Templates y Bulk messaging:** Los endpoints existen en `routes/index.ts`, pero el whatsapp-service **no tiene auth**. Validación incompleta (solo POST valida). Rate limit genérico (IP, 300/min, deshabilitado en dev) + delay 2s bulk; no hay cuota por sesión WhatsApp
- **Notificaciones de sesión a dashboard:** los handlers `handleSessionAuthenticated/Disconnected/StatusChange` en `apps/api/src/whatsapp/whatsapp.service.ts:140-158` solo hacen `console.log` con TODOs
- **Asignación de usuarios:** `assignToUser()` en AutomationService solo loguea, no implementa la lógica (`automation.service.ts:450-465`)
- **AI Stats page:** Existe la ruta `/dashboard/whatsapp-stats` pero la conexión de datos necesita verificación
- **Settings avanzados:** Varias tabs del panel de configuración son solo UI sin backend confirmado
- **Bug Socket.IO:** `auth_failure` mapeado como `CONNECTING` en `SocketService.ts:149`, la UI renderiza `AUTH_INVALID` definido en `types/index.ts:145` — estado huérfano
- **Dashboard depende de endpoints públicos:** el frontend usa `/public/leads` en **12 ocurrencias en 7 archivos** de `apps/dashboard/` (ver §6); eliminar esos endpoints sin migrar primero rompe el dashboard
- **Duplicación `/public/leads` en whatsapp-service:** además de la API Nest, `apps/whatsapp-service/src/routes/index.ts:286, 317, 394, 426, 505` expone GET/POST `/public/leads` y GET/POST/PATCH `/leads` sin auth — riesgo paralelo
- **Proxy catch-all sin auth:** `apps/dashboard/app/api/whatsapp/[...path]/route.ts` reenvía CUALQUIER request al whatsapp-service sin verificar autenticación
- **Proxies adicionales sin auth:** `app/api/whatsapp/stats/route.ts`, `app/api/logs/whitelist/route.ts`, `app/api/stats/whitelist/route.ts` proxean al whatsapp-service sin token
- **Rutas debug con credenciales privilegiadas:** `app/api/debug/real-clerk-migration/route.ts:13,73` (SERVICE_ROLE_KEY + CLERK_SECRET_KEY), `test-migration/route.ts:23` (SERVICE_ROLE_KEY), `auth-flow/route.ts:13` (SERVICE_ROLE_KEY, `auth()` llamado pero sin imponer 401)
- **`WhatsAppController` Nest sin guard:** `apps/api/src/whatsapp/whatsapp.controller.ts:33` no tiene `@UseGuards`; `/whatsapp/send` y `/whatsapp/whitelist/*` responden sin token

---

## 6. Gaps y Riesgos Funcionales

| Gap | Impacto | Detalle / evidencia |
|-----|---------|---------------------|
| `WhatsAppController` Nest sin guard | **Crítico** | `apps/api/src/whatsapp/whatsapp.controller.ts:33` sin `@UseGuards`; `/whatsapp/send`, `/whatsapp/whitelist/stats`, `/whatsapp/whitelist/authorize` expuestos |
| Webhook Nest con header estático | **Crítico** | `whatsapp.controller.ts:45-54` valida solo `x-whatsapp-service` — no es secreto firmado |
| whatsapp-service Express sin auth alguna | **Crítico** | `apps/whatsapp-service/src/index.ts:83-98` — ningún middleware de autenticación en todo el servicio |
| Duplicación `/public/leads` + `/leads` en whatsapp-service | **Crítico** | `routes/index.ts:286, 317, 394, 426, 505` — CRUD sin auth paralelo al de la API |
| Router whatsapp-service montado en `/` y `/api` | **Alto** | `src/index.ts:97-98` — cada endpoint responde en dos rutas |
| Rutas debug con `SUPABASE_SERVICE_ROLE_KEY` sin auth | **Crítico** | `app/api/debug/real-clerk-migration/route.ts:13,73`, `test-migration/route.ts:23` |
| Proxy catch-all `/api/whatsapp/*` sin auth | **Crítico** | `app/api/whatsapp/[...path]/route.ts:14-77` — reenvía cualquier request al whatsapp-service |
| Proxies adicionales sin auth | **Alto** | `app/api/whatsapp/stats/route.ts`, `app/api/logs/whitelist/route.ts`, `app/api/stats/whitelist/route.ts` |
| RLS deshabilitado en Supabase | **Crítico** (verificado live MCP 2026-04-17) | `rls_enabled: false` en las **13 tablas** de `public`; **0 policies** en `pg_policies`. Habilitar RLS requiere crear policies, no basta `ALTER TABLE ENABLE RLS` |
| Firewall Hetzner abierto | **Crítico** (verificado live MCP 2026-04-17) | `whatsapp-firewall` (id 10443894): SSH 22, HTTP 80, HTTPS 443, WhatsApp 3002, NestJS 3003 — todos `0.0.0.0/0` + `::/0`. IP pública expuesta: `46.225.26.89` |
| Postgres con patches de seguridad pendientes | **Alto** (verificado live MCP 2026-04-17) | Advisor `vulnerable_postgres_version` en `supabase-postgres-17.4.1.069` |
| Migraciones huérfanas `campaigns`/`campaign_leads` | **Medio** (verificado live MCP 2026-04-17) | `supabase_migrations` contiene `20250821100704_create_campaigns_table` y `20250821100720_create_campaign_leads_table` pero las tablas no existen en `public` hoy |
| Dashboard depende de `/public/leads` | **Alto** | 12 ocurrencias en 7 archivos de `apps/dashboard/` (ver §7) — eliminarlos sin migrar rompe el frontend |
| `AutomationService` no inyectado | **Alto** | `apps/api/src/whatsapp/whatsapp.module.ts:10` — providers no incluye `AutomationService` |
| Templates/Bulk sin auth ni rate limit efectivo contra ban WhatsApp | **Alto** | Rate limit global 300/min por IP + delay 2s bulk; falta cuota horaria por sesión |
| Webhook Clerk con secret placeholder | **Alto** (infra — no verificable desde repo) | `.env` en `.gitignore`; handler correcto en `app/api/webhooks/clerk/route.ts` |
| Dual-write `messages` vs `whatsapp_conversations` | **Alto** | WhatsApp Service escribe en `whatsapp_conversations` (`DatabaseService.ts:345-439`), API escribe en `messages` (`whatsapp.service.ts:105`). Cifras 17 vs 38 son infra |
| Bug Socket.IO estados | **Medio** | `SocketService.ts:149` mapea `auth_failure` → `CONNECTING`; UI espera `AUTH_INVALID` (`types/index.ts:145`, `whatsapp/page.tsx:59`) |
| Seed desactualizado | **Medio** | `seed.ts:17-19, 52-56` — campos `name`, `clerkId`, `type`, `sentiment`, `confidence`, `aiAnalyzed` no existen en schema |
| Tres implementaciones de WhatsApp coexisten | **Medio** | `WhatsAppService.ts`, `WhatsAppServiceSimple.ts`, `WhatsAppServiceRefactored.ts` — toggles activos |
| Drift camelCase vs snake_case en repositories | **Medio** | `ConversationRepository.ts:27-39` y `LeadRepository.ts:28` crean tablas con naming incompatible con schema Prisma |
| Tabla `ai_training_interactions` fuera de Prisma | **Medio** | No en `schema.prisma`; referenciada en `AILearningService.ts` |
| Tests escasos en API | **Medio** | Solo `apps/api/src/app.controller.spec.ts` (boilerplate) |
| Endpoints públicos sin protección | **Medio** | `PublicLeadsController` + rewrite `vercel.json:44-46` `/api/public` → backend |
| Matcher middleware `/api/webhook` singular roto | **Bajo** | `middleware.ts:9` — el webhook real es `/api/webhooks/clerk` |
| Rate limit deshabilitado en dev | **Bajo** | `middleware/validation.ts:227` — ignora `rateLimit` si `NODE_ENV=development` |
| Dos configuraciones Vercel | **Bajo** | `vercel.json` (raíz) y `apps/dashboard/vercel.json:31-36` (rewrite genérico `/api/*` → backend) coexisten |
| Índices duplicados en ProactiveMessage | **Bajo** | `schema.prisma:184-190` — 3 pares duplicados |
| `WhatsAppWhitelistLog.leadId` tipo incorrecto | **Bajo** | `schema.prisma:253` — `VarChar(255)` vs UUID |
| `packages/ui` parcialmente huérfano | **Bajo** | 5 de 8 componentes importados; 2 archivos consumidores |

---

## 7. Conteo verificable de usos de `/public/leads` en el dashboard

Resultado de `grep "public/leads"` en `apps/` (total: 20 ocurrencias en 12 archivos). Filtrando backend y docs, la dependencia real del frontend es:

| Archivo | Líneas | Usos |
|---------|--------|------|
| `apps/dashboard/lib/swr-config.ts` | 129, 130 | 2 |
| `apps/dashboard/lib/api.ts` | 237, 257, 277, 297 | 4 |
| `apps/dashboard/components/AddLeadModal.tsx` | 131 | 1 |
| `apps/dashboard/app/dashboard/leads/page.tsx` | 231 | 1 |
| `apps/dashboard/app/api/public/leads/route.ts` | 43, 118 | 2 |
| `apps/dashboard/app/api/public/leads/stats/route.ts` | 8 | 1 |
| `apps/dashboard/app/api/leads/[id]/whatsapp/route.ts` | 14 | 1 |
| **Total dashboard** | — | **12 ocurrencias / 7 archivos** |

Además fuera del dashboard:

| Archivo | Líneas | Rol |
|---------|--------|-----|
| `apps/api/src/leads/public-leads.controller.ts` | 17 | Definición backend Nest |
| `apps/whatsapp-service/src/routes/index.ts` | 286, 317 | Duplicación backend Express |
| `vercel.json` | 44-46 | Rewrite `/api/public/*` → `api.cromgod.space/public/*` |
| `apps/dashboard/vercel.json` | 31-36 | Rewrite genérico `/api/*` → backend |

---

## 8. Conclusión Operativa

### Partes más sólidas

- **CRUD de Leads** — flujo completo frontend → API → DB, con validación, paginación, búsqueda
- **Autenticación Clerk en dashboard y `LeadsController`** — integración madura
- **Pipeline de IA en whatsapp-service** — arquitectura elaborada con intent analysis, knowledge base, cache, fallback multi-proveedor
- **Gestión de sesiones WhatsApp** — QR, persistencia, snapshots, reconexión, health checks
- **Dashboard principal** — páginas conectadas a datos reales con SWR y auto-refresh

### Partes más incompletas

- **Seguridad:**
  - `WhatsAppController` Nest sin guard
  - whatsapp-service Express sin ninguna capa de auth
  - Duplicación `/public/leads` y `/leads` sin auth en dos apps
  - Rutas debug con service role key sin auth
  - Proxy catch-all y proxies auxiliares sin auth
  - Webhook Nest API solo protegido por header estático
  - RLS deshabilitado en Supabase (infra)
  - Firewall abierto en Hetzner (infra)
- **Automatización en la API** — `AutomationService` es código muerto, nunca registrado como provider
- **Protección de endpoints existentes** — templates y bulk messaging existen pero sin auth; validación incompleta; rate limit genérico sin cuota por sesión WhatsApp
- **Sincronización de usuarios** — webhook Clerk con handler correcto pero secret placeholder (infra)
- **Testing** — 1 spec boilerplate en API; 8 tests en ai-thinking + 1 integration en whatsapp-service
- **Migración modular del WhatsApp service** — tres implementaciones coexistiendo con feature toggles

### Nivel de madurez del MVP

**MVP funcional para el flujo core** (auth → leads → WhatsApp → IA → respuesta), con **múltiples riesgos de seguridad activos** y deuda técnica significativa. El producto puede demostrar el ciclo completo de recepción de mensaje → procesamiento IA → respuesta automática. Templates y bulk messaging están más avanzados de lo que el análisis v1 detectó. Sin embargo, la superficie de ataque es amplia: dos apps con endpoints CRUD públicos paralelos, un servicio Express sin autenticación, rutas debug con credenciales privilegiadas, proxies sin auth al WhatsApp Service, un controller Nest WhatsApp sin guard, y un webhook Nest protegido sólo con un header estático. **La brecha más urgente no es funcional sino de seguridad, y es más ancha de lo que el PRD v3 reflejaba.**

---

## 9. Correcciones respecto al análisis v2/v3

| Error en v2 | Corrección en v3 | Fuente de verificación |
|-------------|-------------------|------------------------|
| "6 archivos de test" en ai-thinking | **8 archivos** (`__tests__/cache/CacheManager.test.ts`, `analysis/{IntentAnalyzer, ContextEnricher, ComplexityAnalyzer, KnowledgeRetriever, StrategySelector}.test.ts`, `integration/AIThinkingService.integration.test.ts`, `ResponseGenerator.test.ts`) | glob `apps/whatsapp-service/**/*.test.ts` |
| "9 modelos Prisma" (contradictorio dentro de v2) | **10 modelos** en `packages/db/prisma/schema.prisma:51-268` | Recuento de `^model`/`^enum` en `schema.prisma` |
| "14 ubicaciones" `/public/leads` en dashboard | **12 ocurrencias en 7 archivos** del dashboard (+ 2 rewrites Vercel + 2 ocurrencias en whatsapp-service) | `grep "public/leads" apps/` |
| "Solo 2 imports reales" de `@leadcrm/ui` (ambiguo) | **2 archivos consumidores**, 5 símbolos importados (`Toggle`, `Alert`, `AlertTitle`, `AlertDescription`, `Button`) de 8 exportados | `grep "@leadcrm/ui" apps/` |
| "useSocket.ts:8 espera AUTH_INVALID" | **Cita incorrecta.** `useSocket.ts:8` lista sólo 4 estados. El estado `AUTH_INVALID` vive en `types/index.ts:145` y se consume en `whatsapp/page.tsx:59, 1243, 1248, 1253, 1263` | Lectura de los dos archivos |
| Omitía `WhatsAppController` Nest sin guard | **Nuevo hallazgo crítico.** Sin `@UseGuards` en `whatsapp.controller.ts:33`; webhook solo con header estático | Lectura de `whatsapp.controller.ts` |
| Omitía whatsapp-service sin auth | **Nuevo hallazgo crítico.** `apps/whatsapp-service/src/index.ts:83-98` — solo CORS + rateLimit; sin middleware de auth | Lectura de `index.ts` |
| Omitía duplicación `/public/leads` en whatsapp-service | **Nuevo hallazgo crítico.** `apps/whatsapp-service/src/routes/index.ts:286, 317, 394, 426, 505` | Lectura de `routes/index.ts` |
| Omitía proxies Next auxiliares sin auth | **Añadido.** `app/api/whatsapp/stats/route.ts`, `app/api/logs/whitelist/route.ts`, `app/api/stats/whitelist/route.ts` | Lectura de los tres `route.ts` |
| Omitía router whatsapp-service montado dos veces | **Añadido.** `src/index.ts:97-98` — `/` y `/api` | Lectura de `index.ts` |
| Omitía rate limit deshabilitado en dev | **Añadido.** `middleware/validation.ts:227` | Lectura de `validation.ts` |
| Omitía matcher roto `/api/webhook` singular | **Añadido.** `middleware.ts:9` — el webhook real es `/api/webhooks/clerk` | Lectura de `middleware.ts` |
| "Templates sin validación" (absoluto) | **Matizado.** POST `/templates` valida name/category/content en `routes/index.ts:834`; PUT (`:872`) y DELETE (`:908`) sin validación | Lectura de `routes/index.ts` |
| "Bulk sin rate limiting" (absoluto) | **Matizado.** Rate limit global por IP (`validation.ts:220-284`, 300/min, deshabilitado en dev) + delay 2s entre mensajes bulk (`routes/index.ts:1231`). Falta cuota por sesión y cuota horaria anti-ban | Lectura de ambos archivos |
| "12 tablas en Supabase" | **Corregido v4.** Son **13 tablas** en `public`. La diferencia es `migrations` (legacy, vacía) + `_prisma_migrations` + `ai_training_interactions` | Supabase MCP `list_tables` |
| "RLS deshabilitado" (no verificado) | **Verificado v4.** `rls_enabled: false` en 13/13 tablas; **0 policies** en `pg_policies` de `public` | Supabase MCP `execute_sql` |
| Omitía Postgres outdated | **Nuevo v4.** Advisor `vulnerable_postgres_version` en `supabase-postgres-17.4.1.069` | Supabase MCP `get_advisors` |
| Omitía migraciones huérfanas campaigns | **Nuevo v4.** `supabase_migrations` tiene `create_campaigns_table` + `create_campaign_leads_table` (2025-08-21) pero sin tablas correspondientes hoy | Supabase MCP `list_migrations` |
| "Firewall abierto 3002/3003" (no verificado) | **Verificado v4.** `whatsapp-firewall` (id 10443894): 22/80/443/3002/3003 todos `0.0.0.0/0` y `::/0`. IP pública `46.225.26.89` | Hetzner MCP `get_firewall` |
| "Producción activa en cromgod.space" (no verificado) | **Verificado v4** con matiz: dominio apunta a `dashboard` project; el deployment marcado como `target: production` es el commit `467e83c` (2026-04-02). Commits posteriores son previews | Vercel MCP `get_project` + `list_deployments` |
| Repo público | **Verificado v4.** `githubRepoVisibility: "public"` en metadata de cada deployment | Vercel MCP `list_deployments` |

---

## 10. Snapshot de infraestructura (verificado live — 2026-04-17)

Hechos antes marcados como "no verificables desde código" ahora verificados vía MCPs de Supabase, Hetzner y Vercel:

### Supabase (`yxjzsargboxnuwnbuzax` / `CRMWhatsApp`, eu-west-3, ACTIVE_HEALTHY)

| Tabla | `rls_enabled` | Filas |
|-------|---------------|-------|
| `leads` | false | 1 |
| `messages` | false | 17 |
| `whatsapp_conversations` | false | 38 |
| `whatsapp_sessions` | false | 24 |
| `whatsapp_whitelist_logs` | false | 27 |
| `ai_training_interactions` (fuera de Prisma) | false | 19 |
| `_prisma_migrations` | false | 2 |
| `migrations` (legacy, vacía) | false | 0 |
| `users` | false | 0 |
| `ai_configuration` | false | 0 |
| `ai_knowledge_base` | false | 0 |
| `message_templates` | false | 0 |
| `proactive_messages` | false | 0 |

- **Total: 13 tablas en `public`** (no 12 como decía v3).
- **`pg_policies` en public: 0 policies.**
- Advisor security: `vulnerable_postgres_version` (categoría SECURITY, level WARN) en `supabase-postgres-17.4.1.069`.
- Migraciones Supabase ejecutadas: 12, incluyendo `20250814_init_crm_core`, `add_idempotency_to_messages`, `create_enums`, `create_users_table`, `create_leads_table`, `create_campaigns_table` (2025-08-21), `create_messages_table`, `create_campaign_leads_table` (2025-08-21), `add_test_column_example`/`remove_test_column_example`, `check_supabase_connection`, `create_whatsapp_explicit_whitelist`. **Campaigns y campaign_leads no existen hoy pese a tener migración aplicada.**

### Hetzner

- Server `118344573` ("whatsapp-service"), CX23 (2 vCPU, 4 GB, 40 GB SSD), `running`, Nuremberg `nbg1-dc3`, creado 2026-01-26.
- IP pública v4: `46.225.26.89`; IPv6: `2a01:4f8:1c19:c142::/64`.
- Ubuntu 24.04, primary disk 40 GB, sin floating IPs ni placement group.
- Firewall `whatsapp-firewall` (id 10443894) aplicado. Reglas `in`:

| Descripción | Puerto | Protocolo | Source |
|-------------|--------|-----------|--------|
| SSH | 22 | tcp | `0.0.0.0/0`, `::/0` |
| HTTP | 80 | tcp | `0.0.0.0/0`, `::/0` |
| HTTPS | 443 | tcp | `0.0.0.0/0`, `::/0` |
| WhatsApp Service | 3002 | tcp | `0.0.0.0/0`, `::/0` |
| NestJS API | 3003 | tcp | `0.0.0.0/0`, `::/0` |

- Sin reglas `out` configuradas en la respuesta.

### Vercel

- Team: `udeope's projects` (`team_mP2bYgdUeXS5ArWzTHfw3RY5`).
- Proyectos: `dashboard` (`prj_3JGVC3KT0dnixeuZZwpcHTT0u3F6`) + `final-project-qgxa` (legacy, creado 2021).
- Dashboard framework: `nextjs`, Node `24.x`.
- Dominios: `cromgod.space`, `dashboard-ten-phi-38.vercel.app`, `dashboard-udeopes-projects.vercel.app`, `dashboard-git-main-udeopes-projects.vercel.app`.
- Producción actual: `dpl_An6EDeba5umLybggqLgeuenxXzx9` → commit `467e83c` (2026-04-02, "chore: sync production env vars, enable snapshots, and increase PM2 timeout").
- Últimos commits en `develop` (`fe431e04`, `832c27d`, `33c7a35`) **no se han promovido a producción**; sus deployments son `target: null` (preview).
- `project.live: false` en última consulta — estado curioso que merece investigación (¿pausado? ¿sin alias activo?).
- Metadatos de deployments confirman `githubRepoVisibility: "public"`.

### Aún no verificables desde MCPs disponibles

- Valor real de `CLERK_WEBHOOK_SECRET` en Vercel env vars (el MCP Vercel local no expone env vars; el MCP Clerk local sólo ofrece SDK snippets).
- Estado del webhook de Clerk (configurado o no).
- Conectividad real dashboard ↔ whatsapp-service en producción (requiere tráfico).
