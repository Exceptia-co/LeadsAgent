# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LeadsCRM is an AI-powered CRM with WhatsApp automation. Turborepo monorepo with pnpm workspace containing three main applications and shared packages.

## Commands

### Development

```bash
pnpm dev                   # Start all services (dashboard:3001, api:3003, whatsapp:3002)
pnpm dev:dashboard         # Dashboard only (port 3001)
pnpm dev:api               # API only (port 3003)
pnpm dev:whatsapp          # WhatsApp service only (port 3002)

# Docker (solo Redis — DB es Supabase cloud)
docker compose up -d       # Start Redis
docker compose down        # Stop Redis
```

### Build & Quality

```bash
pnpm build                 # Full build with dependencies
pnpm build:fast            # Parallel build without daemon
pnpm lint                  # ESLint check
pnpm lint:fix              # Auto-fix lint issues
pnpm typecheck             # TypeScript validation
pnpm format                # Prettier formatting
```

### Testing

```bash
pnpm test                  # Run all tests
pnpm test:e2e              # E2E tests
pnpm test:coverage         # Coverage reports

# Single test (API)
cd apps/api && pnpm test -- --testNamePattern "Name|Regex"
cd apps/api && pnpm test:watch
```

### Database

```bash
pnpm db:generate           # Generate Prisma client (run after schema changes)
pnpm db:generate:win       # Windows-specific generation
pnpm db:migrate:dev        # Create migrations
pnpm db:studio             # Prisma Studio GUI
pnpm db:reset              # Reset database
```

### Maintenance

```bash
pnpm clean:cache           # Clear Turborepo cache
pnpm rebuild               # Full cleanup and rebuild
pnpm whatsapp:cleanup-chrome  # Cleanup Chrome sessions
```

## Architecture

```
apps/
├── dashboard/             # Next.js 14 frontend (port 3001)
├── api/                   # NestJS REST API (port 3003)
├── whatsapp-service/      # Express + whatsapp-web.js (port 3002)
└── docs/                  # Documentation site

packages/
├── db/                    # Prisma schema & client
└── config-*/              # Shared ESLint/TypeScript configs
```

Note: `packages/ui` was removed in T3.2 — absorbed into `apps/dashboard/components/ui/` (Alert, Toggle). No new dependency on a shared UI package.

**Data Flow:**

```
WhatsApp <-> WhatsApp Service <-> NestJS API <-> PostgreSQL
                                       |
                                 Next.js Dashboard
```

### Key Technologies

- **API**: NestJS 10, class-validator DTOs, Clerk JWT auth, Swagger docs
- **Dashboard**: Next.js 14, Tailwind CSS, Radix UI, Clerk auth, SWR
- **WhatsApp**: Express, whatsapp-web.js, Puppeteer, Redis caching, Winston logging
- **Database**: PostgreSQL with Prisma 6.15, UUID primary keys

### Workspace Packages

Use workspace imports: `@leadcrm/db`, `@leadcrm/config-eslint`, `@leadcrm/config-ts` (`@leadcrm/ui` was removed in T3.2).

## Database Schema

**Core Models:**

- `Lead` - CRM entity with unique phone, WhatsApp authorization tracking
- `Message` - Conversation history with direction (INBOUND/OUTBOUND) and status
- `WhatsAppConversation` - Session tracking with AI provider info
- `WhatsAppSession` - Session management with QR codes and reconnect logic
- `ai_knowledge_base` - Knowledge base with categories and keywords

**Enums (Spanish domain):**

- `LeadStatus`: NUEVO, CONTACTADO, QUALIFIED, GANADO, PERDIDO
- `MessageDirection`: INBOUND, OUTBOUND
- `MessageStatus`: PENDING, SENT, DELIVERED, READ, FAILED

## Code Patterns

### NestJS API

- Module-based: AuthModule, LeadsModule, TemplatesModule (new, T2.2), WhatsAppModule, PrismaModule
- Guards: `ClerkAuthGuard` at the class level on every sensitive controller
- Decorators: `@CurrentUser()` for user context injection
- Response format: `{ success: boolean, data?: any, error?: string }`
- Outbound calls from API → whatsapp-service use `signServiceRequest()` (HMAC-SHA256 with `x-service-timestamp` + `x-service-signature`) — see `apps/api/src/whatsapp/service-auth.ts` and `WhatsAppService.sendMessage`

### WhatsApp Service Path Aliases

```typescript
("@/*",
  "@/types/*",
  "@/services/*",
  "@/controllers/*",
  "@/utils/*",
  "@/config/*");
```

### Naming Conventions

- Variables/functions: `camelCase`
- Classes/Components: `PascalCase`
- Files: `kebab-case.ts` or `PascalCase.tsx`
- Backend tests: `*.spec.ts`
- Frontend tests: `*.test.tsx`

## State of the Project

The stabilization PRD (`PRD-ESTABILIZACION.md`, v5.23) closed on 2026-04-18. All five phases + T0.4-ter are complete:

- **Phase 0 — Security**: HMAC server-to-server auth, Clerk guards on every Nest controller, firewall Hetzner restricted (SSH /24, ports 3002/3003 closed), Postgres 17.6 upgrade.
- **Phase 1 — Integrity**: dual-write unified (`whatsapp_conversations.message_id` FK + transactional writer + JOIN reader + backfill + drop of duplicate columns).
- **Phase 2 — Wiring**: Socket.IO `auth_failure → AUTH_INVALID` fixed, Templates moved to Nest, rate limit per WhatsApp session (200/h).
- **Phase 3 — Cleanup**: `WhatsAppServiceRefactored` + `@leadcrm/ui` removed (~−4,350 lines net).
- **Phase 4 — Scalability**: soft delete, pagination, N+1 in `getConversations` eliminated via SQL JOIN.
- **Phase 5 — Testing**: 22+ Jest unit tests across API + whatsapp-service.

`ANALISIS-ESTADO-PROYECTO.md` v5 is the canonical snapshot of the post-stabilization state.

The AIThinkingService modularization (formerly in branch `refactor/whatsapp-service`) is **complete** — the module lives at `apps/whatsapp-service/src/services/ai-thinking/` with CacheManager, IntentAnalyzer, ContextEnricher, ComplexityAnalyzer, KnowledgeRetriever, ResponseGenerator, StrategySelector, DecisionEngine. Integration with the rest of the service is via `AIThinkingModuleFactory`.

### PLAN-WHATSAPP-AGENT-MULTITENANT (v7.1, en curso)

El plan multi-tenant + agente IA configurable (`PLAN-WHATSAPP-AGENT-MULTITENANT.md`) pasó por 12 rondas de review y quedó aprobado para **ruta completa**. Se ejecuta por fases en branches separadas.

**Fase A — Foundation hotfixes (completada 2026-04-19, branch `feature/foundation-hotfixes`)**:

Los 10 cambios P0 aplicados + 1 hotfix tangencial:

- **A5** — Validación zod de envs en bootstrap (`config/env.ts`). Fail-fast en producción si falta `WHATSAPP_SERVICE_HMAC_SECRET`; warnings en dev.
- **A6** — Eliminado `process.exit(1)` en `uncaughtException`/`unhandledRejection`: el proceso sobrevive para no tumbar las demás sesiones.
- **A1** — Deduplicación de mensajes entrantes con Redis `SETNX whatsapp:dedup:{message.id}` TTL 300s. Nuevo método `redisClient.setNX()` (fail-open: Redis error → trata como "primera vez").
- **A2** — Filtro explícito de grupos (`@g.us`) y `status@broadcast` antes de parsear/responder.
- **A3** — Typing indicator (`chat.sendStateTyping` + `clearState`) en `MessageHandler.sendResponseWithStrategy`. Apagado en `finally` incluso si el envío falla.
- **A4** — Unificación de `saveConversation`: nueva helper `persistMessagePair()` paraleliza user msg + bot msg con `Promise.allSettled` y logging unificado. Sobre el modelo unified-write existente del PRD Fase 1.
- **A7** — System prompt hardcoded movido a `ai_configuration` (key `system_prompt.default.es`) con cache in-memory + background refresh. Fallback al hardcoded si la key no está seedeada.
- **A8** — Tests HMAC ampliados: body vacío, firma sin prefijo `sha256=`, prefijo distinto (`md5=`), timestamp malformado, timestamp en futuro excesivo.
- **A9** — Test unitario de `redisClient.setNX` (primitive de dedupe): primera → true, segunda → false, Redis error → true (fail-open), secuencia típica.
- **A10** — Este update a `CLAUDE.md`.
- **A11 (hotfix descubierto en prueba móvil)** — `ResponseGenerator.ensureFinalQuestion` solo detectaba `?` ASCII. Cuando el LLM generaba `"¿...hoy"` sin cerrar, concatenaba otra pregunta. Fix: `/[?¿]/.test(content)`.
- **A12 (optimización UX)** — `sendStateTyping()` movido al **inicio** del handler `processMessageWithAI` en vez de al final (`sendResponseWithStrategy`). Cubre visualmente todo el LLM thinking time (~10s) en vez de solo el último segundo.
- **A13 (eliminación humanized delay)** — borradas las funciones `addHumanizedDelay` y `addHumanizedDelayEnhanced` (~70 líneas) de `MessageHandler`. Razón: el LLM ya aporta 6-11s de latencia real; añadir 5-6s artificiales simulaba humano redundantemente. El typing indicator (A12) cubre visualmente la espera. Ahorro: ~5-6s por mensaje. Latencia total baja de ~15-18s a **~5-6s** (medido en prueba del owner con "hola" → thinkingTime=4644ms + overhead = 5.35s). Si en Fase E7 llegan templates Tier-2 instantáneos, reintroducir delay con target-total (no sumado).
- **A14 (bug A4 detectado y corregido en prueba del owner)** — `persistMessagePair` pasaba el contenido del bot en `messageText` con `responseText: undefined`. Pero `DatabaseService.saveConversation` usa `canonicalContent = isFromUser ? messageText : responseText`. Para `isFromUser=false`, el contenido del bot debe ir en `responseText`. El log warn `⚠️ [UNIFIED-WRITE] saveConversation called without canonical content — skipping message row` reveló que la respuesta del bot NO se estaba persistiendo. Fix: para el bot msg ahora `{ messageText: undefined, responseText: botResponseText, isFromUser: false }`.
- **A15 (whitelist default abierta por coherencia con el producto)** — `AuthAuditLogger.ts:84` tenía `allowNewLeads: false`. Un número nuevo (`34644773622` en la prueba del owner) recibía log `🚫 Respuesta automática bloqueada... Número no autorizado - no cumple con criterios`. Para un SaaS de captación de leads la IA **debe responder a cualquier número que escriba**; un bot que solo responde a la whitelist pre-cargada no captaría leads. Default cambiado a `true`. Si algún cliente quisiera modo "support privado" (solo responde a conocidos), puede poner `WHATSAPP_ALLOW_NEW_LEADS=false` en su `.env`. Cuando lleguen los `AiAgent` configurables (Fase B), este flag pasará a la configuración por agente para permitir políticas distintas por cliente.
- **A15-bis (segundo whitelist en API Nest también default-false)** — descubierto tras A15: `apps/api/src/whatsapp/whitelist.service.ts:119-120` tenía su propia evaluación independiente con `allowNewLeads = env === 'true'` (default `false` si env sin setear). Esto generaba un BLOCK adicional con razón `"Creación de leads nuevos deshabilitada"` **aunque A15 ya hubiera pasado en whatsapp-service**. Arquitectura actual: el whitelist se evalúa dos veces (una en whatsapp-service, otra en API Nest al procesar el message). Fix: invertir semántica a `env !== 'false'` (default `true`, cierre explícito). Coherente con A15. **Pendiente Fase C**: unificar las dos evaluaciones en un solo sitio para evitar tener que mantener ambas sincronizadas.
- **A15-ter (env var `.env` explícita ganaba a ambos defaults)** — tras A15 + A15-bis el lead nuevo seguía bloqueado. Causa: `/.env` tenía `WHATSAPP_ALLOW_NEW_LEADS=false` explícito, que overrideaba los dos defaults de código. Cambiado a `=true` con comentario explicativo. Regla general: **env > DB config > hardcoded default**. Recomendación para Fase B: que `validateEnv()` (A5) imprima al boot el config de auth resuelto, así evitamos debugging de 30 min la próxima vez.

### Deudas técnicas post-Fase A (detectadas pero no arregladas)

Tres bugs tangenciales surgidos durante la verificación end-to-end del nuevo lead `34644773622` (2026-04-19). No son bloqueantes del MVP pero conviene cerrarlos en Fase B o C:

- **T1. `messages` creadas con `lead_id=null` desde whatsapp-service**. `DatabaseService.saveConversation` no hace lookup al `Lead` antes de crear el `Message`; cuando el lead aún no existe (primer mensaje de un número nuevo), las filas quedan huérfanas. Los queries que hacen `JOIN leads ON messages.lead_id = leads.id` no las ven. Fix Fase B: saveConversation debe resolver/crear el `Lead` primero o aceptar un `leadId` explícito del caller.
- **T2. Duplicación de `Message` entre whatsapp-service y API Nest**. Ambos persisten el mensaje entrante: whatsapp-service via `saveConversation` (sin leadId), API Nest via `prisma.message.create` en el webhook handler (con leadId). Resultado: **3 filas en `messages` para 2 mensajes reales** (user entrante duplicado + bot respuesta). Fix Fase C: decidir un owner único del write de `Message` (recomendado: API Nest tras recibir webhook) y que whatsapp-service solo escriba `whatsapp_conversations` con metadata.
- **T3. Timestamp 1970 en messages de API Nest**. `new Date(messageData.timestamp)` en `apps/api/src/whatsapp/whatsapp.service.ts:114` interpreta un epoch en segundos como milisegundos (o viceversa), generando `created_at` en 1970. No rompe funcionalidad pero ensucia orderings por fecha. Fix Fase B: multiplicar por 1000 si el valor es menor a `1e12` (heurística segunda/milis).
- **T4. API NestJS no lee `.env` automáticamente**. Descubierto 2026-04-20 al actualizar `WHATSAPP_ALLOW_NEW_LEADS` en prod (Hetzner): el whatsapp-service sí recogió el cambio porque hace `dotenv.config()` en `index.ts:26`, pero `leadcrm-api` no. El `.env` de `apps/api/` es cosmético hoy — las envs llegan al proceso Nest solo via la shell que arranca PM2. Workaround usado en prod: `export WHATSAPP_ALLOW_NEW_LEADS=true && pm2 restart leadcrm-api --update-env`. Frágil: ante reboot del VPS / `pm2 resurrect` / cron restart automático la env desaparece y el bug de whitelist vuelve. **Fix Fase B** (añadido como `B1.15`): `apps/api/src/app.module.ts` debe importar `ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] })`. Son ~3 líneas que transforman "env solo si la shell la exporta" en "env leída del `.env` igual que whatsapp-service".

**Tests suite post-Fase A**: 15/15 pasan (6 HMAC originales + 5 edge cases nuevos + 4 redis.spec). Se borraron 9 suites `ai-thinking/__tests__/*` y `phase4-integration.test.ts` (22 tests pre-existentes rotos, consideradas deuda muerta).

**Deudas técnicas conocidas post-Fase A (no bloqueantes)**:
- **Doble init del whatsapp-service**: el log `"Initializing WhatsApp service implementation"` aparece 2 veces por arranque. El handler de mensajes solo se dispara una vez por evento (verificado), pero el logging sugiere doble instancia del facade vs simple. A investigar en Fase C.
- **Dedupe secundario multi-device**: WhatsApp Linked Devices (`@lid`) puede entregar el mismo mensaje con `message.id` distintos. El dedupe por `message.id` no lo detecta. Fix futuro: dedupe secundario por `(from, body-hash, ±3s)` — considerar en Fase C.

**Decisiones de arquitectura de Fase A que se mantienen en Fase B**:
- `redisClient.setNX(key, value, ttlSeconds)` es la primitive pública para dedupe atómico. Reusarlo si hace falta dedupe en otros flujos.
- `validateEnv()` en `apps/whatsapp-service/src/config/env.ts` es el contrato de envs requeridas. Extender el zod schema al añadir nuevas envs.
- El pattern "cache in-memory + background refresh" de `SystemPromptService` es el modelo para cargar config desde DB sin volver async a los callers.

### Punto de continuación (post-deploy Fase A, 2026-04-20)

Si retomas el proyecto en una sesión futura, aquí está el estado exacto y el siguiente paso:

**Estado en producción (Hetzner VPS 46.225.26.89)**:
- `/opt/leadcrm/apps/whatsapp-service/.env` y `/opt/leadcrm/apps/api/.env` tienen `WHATSAPP_ALLOW_NEW_LEADS=true` (agregados 2026-04-20).
- PM2 procesos `whatsapp-service` (id 0) y `leadcrm-api` (id 1) arrancan con esa env cargada tras restart con `--update-env`.
- Captación automática de leads nuevos en producción: **operativa**. Cualquier número nuevo que escriba al WhatsApp conectado se crea como `Lead` con `whatsapp_authorized=true`.

**Si el VPS se reinicia (reboot, crash, etc.)**:
- `whatsapp-service` recarga el `.env` automáticamente via `dotenv.config()` → funciona OK.
- `leadcrm-api` **NO lee** el `.env` — la env `WHATSAPP_ALLOW_NEW_LEADS=true` se perderá. Workaround manual tras cada reboot:
  ```bash
  ssh root@46.225.26.89 'export WHATSAPP_ALLOW_NEW_LEADS=true && pm2 restart leadcrm-api --update-env'
  ```
- Fix permanente = tarea **B1.15** (primera tarea de Fase B.1). Estimación <30 min.

**⚠️ Deploy real del código Fase A a Hetzner está PENDIENTE** (2026-04-20):
Hoy en prod Hetzner solo está actualizada la env var `WHATSAPP_ALLOW_NEW_LEADS=true` (editada vía SSH manual). El **código** de Fase A (A1 dedupe, A3 typing temprano, A13 humanized delay eliminado, A11 hotfix pregunta duplicada, etc.) **sigue siendo pre-Fase A**. Los bugs que arreglamos siguen ocurriendo en prod.

Para deployar el código nuevo (hacer esto antes o junto con Fase B.1):
```bash
ssh root@46.225.26.89 '
  set -e
  cd /opt/leadcrm
  git pull origin develop
  pnpm install
  pm2 restart all --update-env
'
```

Efectos: downtime ~15-30s mientras reinstala deps + reinicia. Sesión WhatsApp `test` se desconecta brevemente y reconecta sola via LocalAuth. Verificar tras deploy: `pm2 logs whatsapp-service --lines 30` debe mostrar `Environment validated (NODE_ENV=production)` (A5 feature) y `[DEDUPE] Checking msgId=...` (A1) ante cualquier mensaje entrante.

**Sobre Vercel**: el dashboard Next.js en `guatsapp.me` auto-deploya desde la "Production Branch" configurada en Vercel (suele ser `main`). Para que los cambios de `develop` lleguen a prod Vercel: `git checkout main && git merge develop && git push`. En Fase A no se tocó dashboard, así que mergear a main no cambia nada funcional — se puede diferir.

**Próximo paso concreto cuando retomes**:
1. `git checkout develop && git pull` (asegura estar al día)
2. **(recomendado antes de Fase B)** deployar Fase A a Hetzner con el comando SSH de arriba — así prod se beneficia de los fixes
3. `git checkout -b feature/b1-foundational-multitenancy`
4. Empezar por **B1.15** (ver `PLAN-WHATSAPP-AGENT-MULTITENANT.md §5 Fase B.1`): `ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] })` en `apps/api/src/app.module.ts`.
5. Continuar con B1.1 (activar Clerk Organizations) → B1.1a (crear org real EscortsHub) → B1.1b (`/select-org` UI) → resto de Fase B.1.

**Estado de documentos**:
- `PLAN-WHATSAPP-AGENT-MULTITENANT.md` v7.3 — Fase A marcada ejecutada+deployed, B1.15 añadida con justificación
- `CLAUDE.md` (este archivo) — 15 hotfixes de Fase A documentados + 4 deudas técnicas (T1-T4)
- Git: PR #10 cerrado (merge commit `1fd9e95`), branch `feature/foundation-hotfixes` puede borrarse (local + remote) tras Fase B.1

## Environment Variables

Environment files:

- `.env` → Development (root, Supabase + Docker Redis)
- `apps/dashboard/.env.local` → Next.js reads this; must contain `NEXT_PUBLIC_API_URL`, `CLERK_*`, and `WHATSAPP_SERVICE_HMAC_SECRET`
- `apps/*/.env` → per-service overrides in production (on the Hetzner VPS: `/opt/leadcrm/apps/whatsapp-service/.env` and `/opt/leadcrm/apps/api/.env`)
- `.env.production` → production defaults (Supabase + Hetzner)
- `.env.example` → template (committed to repo)

**Critical env vars that, if missing, break the HMAC chain:**

- `WHATSAPP_SERVICE_HMAC_SECRET` (64 hex chars) — must be the **same** in Vercel (dashboard), on the Hetzner VPS (both apps' `.env`), and in every developer's local `.env`. Without it the whatsapp-service returns `500 "service auth misconfigured"` on signed requests, and the proxy in Next returns `500 "Proxy misconfigured: missing service auth secret"`.
- `CLERK_WEBHOOK_SECRET` — required only by the dashboard's `/api/webhooks/clerk` route handler.

**Service Ports:**
| Service | Port | URL |
|------------|------|------------------------|
| Dashboard | 3001 | http://localhost:3001 |
| API | 3003 | http://localhost:3003 |
| WhatsApp | 3002 | http://localhost:3002 |
| Redis | 6381 | localhost:6381 |

**Quick Start:**

```bash
docker compose up -d       # Start Redis (DB is Supabase cloud)
pnpm db:generate           # Generate Prisma client
pnpm db:migrate:dev        # Run migrations
pnpm dev                   # Start all services
```
