# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

*Version: 3.0 | Last Updated: August 21, 2025*

# LeadsCRM - Dashboard de Gestión de Leads con WhatsApp e IA

LeadsCRM es un sistema integral de gestión de leads que automatiza la recepción y procesamiento de mensajes de WhatsApp mediante inteligencia artificial, proporcionando un dashboard moderno para la gestión eficiente de leads y conversaciones.

## 📊 Estado del Proyecto

**Actual:** ✅ **Funcional con MVP Dashboard + API + DB**  
**En desarrollo:** 🔄 **Integración WhatsApp + Servicios IA**

### 🎯 Objetivo Principal
Validar el flujo: **recepción de leads por WhatsApp → persistencia y visualización → sugerencias de respuesta con IA → envío manual por agentes**.

### 📚 Documentación Clave
- [`README.md`](./README.md) - Estado actual del proyecto y características
- [`docs/PROJECT_STATUS.md`](./docs/PROJECT_STATUS.md) - Estado detallado de implementación
- [`docs/coding-guidelines.md`](./docs/coding-guidelines.md) - Standards y patrones de código
- [`apps/docs/`](./apps/docs/) - Aplicación de documentación completa

## Stack Tecnológico

### ✅ Implementado Actualmente
| Componente | Tecnología | Estado | Propósito |
|------------|------------|--------|-----------|
| **Frontend** | Next.js 15.4.2 + TypeScript | ✅ Funcional | Dashboard web con App Router y SSR |
| **Backend** | NestJS + TypeScript | ✅ Base configurada | API REST modular y escalable |
| **Base de Datos** | PostgreSQL + Prisma | ✅ Funcional | Almacenamiento persistente con Supabase |
| **ORM** | Prisma | ✅ Funcional | Capa de abstracción typesafe para DB |
| **Autenticación** | Clerk | ✅ Configurado | Gestión de usuarios y sesiones |
| **UI/Estilos** | TailwindCSS + Shadcn/ui | ✅ Funcional | Componentes modernos y accesibles |
| **Monorepo** | Turborepo + pnpm | ✅ Funcional | Gestión eficiente de workspace |

### 🔄 En Desarrollo
| Componente | Tecnología | Estado | Propósito |
|------------|------------|--------|-----------|
| **Mensajería** | whatsapp-web.js | 🔄 En integración | Integración con WhatsApp Web |
| **IA** | OpenAI API | 🔄 En integración | Clasificación y generación de respuestas |

### 📋 Planificado
| Componente | Tecnología | Estado | Propósito |
|------------|------------|--------|-----------|
| **Cache/Colas** | Redis + BullMQ | 📋 Pendiente | Tareas asíncronas y cache |
| **Deploy** | Vercel + Railway/Fly.io | 📋 Configuración pendiente | Frontend y backend en la nube |

## Estructura del Proyecto

El proyecto utiliza un **monorepositorio con Turborepo** para centralizar el código y facilitar la compartición de tipos y configuraciones:

```
/
├── apps/
│   ├── dashboard/           # ✅ Next.js 15.4.2 app (frontend)
│   │   ├── app/            # App Router pages
│   │   ├── components/     # React components
│   │   └── lib/           # Utilidades cliente
│   ├── api/                # ✅ NestJS app (backend)
│   │   ├── src/
│   │   │   ├── modules/   # Módulos de negocio (en desarrollo)
│   │   │   ├── guards/    # Auth guards
│   │   │   └── services/  # Servicios globales
│   │   └── test/          # Tests E2E
│   ├── docs/               # ✅ Aplicación de documentación (Next.js)
│   └── whatsapp-service/   # 🔄 Servicio WhatsApp (en desarrollo)
│       ├── src/
│       └── sessions/      # Persistencia de sesiones WA
├── packages/
│   ├── db/                 # ✅ Prisma schema + client (SQLite)
│   │   ├── prisma/        # Schema y migraciones
│   │   └── src/          # Cliente Prisma
│   ├── ui/                # ✅ Componentes React compartidos (shadcn/ui)
│   ├── config-eslint/     # ✅ Configuración ESLint compartida
│   └── config-ts/         # ✅ Configuración TypeScript compartida
├── .github/
│   └── workflows/         # CI/CD pipelines
├── docs/                   # ✅ Documentación del proyecto
│   ├── PROJECT_STATUS.md   # Estado actual detallado
│   ├── OPTIMIZATIONS.md   # Optimizaciones aplicadas
│   └── coding-guidelines.md # Standards de desarrollo
├── turbo.json             # ✅ Configuración Turborepo
├── pnpm-workspace.yaml   # ✅ Workspace configuration
└── package.json           # ✅ Scripts y dependencias raíz
```

## Comandos de Desarrollo

### Configuración Inicial
```bash
# Instalar dependencias
pnpm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus claves de Supabase, Clerk, OpenAI, etc.

# Inicializar base de datos
pnpm db:migrate:dev
pnpm db:generate
```

### Desarrollo
```bash
# Iniciar todos los servicios
pnpm dev

# Servicios individuales
pnpm dev:dashboard    # Frontend en http://localhost:3000
pnpm dev:api         # Backend en http://localhost:3003  
pnpm dev:whatsapp    # Servicio WhatsApp en http://localhost:3002

# Base de datos
pnpm db:studio       # Prisma Studio
pnpm db:migrate:dev  # Nueva migración
pnpm db:generate     # Regenerar cliente Prisma
pnpm db:reset        # Reset completo (cuidado!)
```

### Testing
```bash
# Tests unitarios
pnpm test            # Todos los tests (Jest)
# Nota: Los comandos específicos por app se ejecutan en cada workspace

# Para API específicamente (desde root o desde apps/api/):
# pnpm --filter=@leadcrm/api test:watch   # Jest en modo watch
# pnpm --filter=@leadcrm/api test:debug   # Jest con debugging

# Tests de integración
pnpm test:e2e        # Tests end-to-end

# Coverage
pnpm test:cov        # Cobertura de código (no test:coverage)
```

### Construcción y Linting
```bash
# Build de producción
pnpm build
pnpm build:api
pnpm build:dashboard

# Build optimizado (paralelo + sin daemon)
pnpm build:fast      # Builds más rápidos en desarrollo
pnpm build:production # Build de producción con NODE_ENV=production

# Verificación de tipos
pnpm typecheck
pnpm typecheck:fast  # TypeCheck paralelo sin daemon

# Linting y formateo
pnpm lint
pnpm lint:fix
pnpm format

# Utilidades de limpieza
pnpm clean           # Limpia builds de todos los paquetes
pnpm clean:cache     # Limpia Turbo cache y archivos .next/dist
pnpm rebuild         # Limpia todo, reinstala y regenera
```

### Configuración Rápida
```bash
# Setup completo (install + db:generate)
pnpm setup

# Reconstrucción completa del proyecto
pnpm rebuild         # clean:cache + install + db:generate + build:fast
```

### Despliegue
```bash
# Deploy frontend (Vercel)
vercel --prod

# Deploy backend (Railway/Fly.io)
railway deploy
# o
flyctl deploy
```

## Arquitectura del Sistema

### Flujo de Datos Principal

```
WhatsApp → whatsapp-service → Redis Pub/Sub → NestJS API → PostgreSQL/Supabase
                                                    ↓
Frontend (Next.js) ← REST API ← BullMQ Workers ← AI Processing
```

### Arquitectura Monorepo con Turborepo

**Gestión de Dependencias y Caching:**
- **Turborepo** maneja automáticamente las dependencias entre tareas
- **Cache inteligente**: Las builds solo se ejecutan si hay cambios relevantes
- **Ejecución paralela**: Tareas independientes se ejecutan simultáneamente
- **Task dependencies**: `build` depende de `db:generate`, `typecheck` depende de `^typecheck`

**Comunicación entre Apps:**
```
┌─────────────┐    HTTP REST     ┌──────────────┐    Prisma ORM    ┌────────────────┐
│  Dashboard  │ ────────────────→ │   NestJS API │ ───────────────→ │  PostgreSQL/   │
│  (Next.js)  │                  │   (Port 3003)│                 │   Supabase     │
└─────────────┘                  └──────────────┘                 └────────────────┘
       ↑                                ↑                                    ↑
       │                                │                                    │
   @leadcrm/ui              @leadcrm/db (shared types)            @leadcrm/db (Prisma)
```

**Shared Packages:**
- **`@leadcrm/db`**: Prisma schema, cliente de base de datos, types TypeScript compartidos
- **`@leadcrm/ui`**: Componentes React reutilizables basados en shadcn/ui
- **`@leadcrm/config-eslint`**: Configuración ESLint compartida
- **`@leadcrm/config-ts`**: Configuración TypeScript base

**Workspace Configuration (pnpm):**
```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

**Type Sharing Across Applications:**
- Los tipos de Prisma se generan automáticamente en `@leadcrm/db`
- Apps importan tipos: `import { Lead, Message } from '@leadcrm/db'`
- Turborepo garantiza que `db:generate` se ejecute antes de `build`
- IntelliSense y type checking funcionan across apps

### Flujo de Procesamiento de Mensajes

**📋 Planificado (Arquitectura futura):**
1. **WhatsApp** envía mensaje → `whatsapp-service` (whatsapp-web.js)
2. `whatsapp-service` publica mensaje en Redis (`whatsapp:messages:inbound`)
3. **NestJS API** consume mensaje y lo persiste en base de datos
4. **BullMQ Worker** procesa mensaje con IA (clasificación + puntuación)
5. **Frontend** muestra lead actualizado via polling/SWR
6. **Agente** puede solicitar sugerencia IA y enviar respuesta
7. Respuesta se envía via Redis (`whatsapp:messages:outbound`) → `whatsapp-service` → WhatsApp

**✅ Actual (MVP Implementado):**
- Dashboard funcional con gestión de leads
- API base con autenticación Clerk configurada
- Base de datos PostgreSQL con Prisma
- Componentes UI con shadcn/ui
- Corrección completa de errores TypeScript (Agosto 21, 2025)

### Módulos del Backend (NestJS)

**✅ Implementado:**
- **AuthModule**: Autenticación con Clerk, guards JWT
- **Base API**: Estructura básica de NestJS configurada

**🔄 En desarrollo:**
- **LeadsModule**: Gestión CRUD de leads y estados
- **MessagingModule**: Procesamiento de mensajes entrantes/salientes
- **AIModule**: Servicios de clasificación y generación con OpenAI

**📋 Planificado:**
- **ContactsModule**: Gestión de contactos y teléfonos
- **WebhooksModule**: Endpoints para whatsapp-service

## Modelo de Datos (Prisma)

### Entidades Principales (PostgreSQL - Actual)

```prisma
// Configuración actual: PostgreSQL con Supabase
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model User {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  clerkId   String   @unique
  email     String   @unique
  name      String
  role      UserRole @default(AGENT)
  createdAt DateTime @default(now())
  updatedAt DateTime @default(now()) @updatedAt

  @@map("users")
}

model Lead {
  id            String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  phone         String         @unique
  name          String?
  email         String?
  tags          String[]       @default([])
  status        LeadStatus     @default(NUEVO)
  moodScore     Float?
  lastContact   DateTime?
  assignedTo    String?
  source        String         @default("whatsapp")
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @default(now()) @updatedAt
  campaignLeads CampaignLead[]
  messages      Message[]

  @@map("leads")
}

model Campaign {
  id            String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name          String
  description   String?
  status        CampaignStatus @default(ACTIVE)
  template      String?
  createdBy     String
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @default(now()) @updatedAt
  campaignLeads CampaignLead[]

  @@map("campaigns")
}

model Message {
  id           String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  leadId       String           @db.Uuid
  content      String
  type         MessageType      @default(TEXT)
  direction    MessageDirection
  status       MessageStatus    @default(SENT)
  timestamp    DateTime         @default(now())
  aiAnalyzed   Boolean          @default(false)
  sentiment    String?
  confidence   Float?
  autoResponse Boolean          @default(false)
  externalId   String?          @unique
  vendor       String           @default("whatsapp")
  lead         Lead             @relation(fields: [leadId], references: [id])

  @@index([leadId])
  @@index([direction])
  @@index([timestamp])
  @@map("messages")
}

model CampaignLead {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  leadId      String    @db.Uuid
  campaignId  String    @db.Uuid
  status      String    @default("PENDING")
  sentAt      DateTime?
  deliveredAt DateTime?
  campaign    Campaign  @relation(fields: [campaignId], references: [id])
  lead        Lead      @relation(fields: [leadId], references: [id])

  @@index([leadId])
  @@index([campaignId])
  @@map("campaign_leads")
}

// Enums
enum UserRole {
  ADMIN
  AGENT

  @@map("UserRole")
}

enum LeadStatus {
  NUEVO
  CONTACTADO
  QUALIFIED
  GANADO
  PERDIDO

  @@map("LeadStatus")
}

enum CampaignStatus {
  ACTIVE
  PAUSED
  COMPLETED

  @@map("CampaignStatus")
}

enum MessageType {
  TEXT
  IMAGE
  AUDIO
  VIDEO
  DOCUMENT

  @@map("MessageType")
}

enum MessageDirection {
  INBOUND
  OUTBOUND

  @@map("MessageDirection")
}

enum MessageStatus {
  SENT
  DELIVERED
  READ      @map("READ")
  FAILED

  @@map("MessageStatus")
}
```

### Características Clave del Schema

- **UUIDs como PKs**: Uso de `gen_random_uuid()` para generar IDs únicos
- **Relaciones directas**: Messages se relacionan directamente con Leads (no hay tabla Conversation)
- **Enums tipados**: Estados y tipos en español con mapeo a PostgreSQL
- **Arrays nativos**: Campo `tags[]` usa arrays nativos de PostgreSQL
- **Timestamps automáticos**: `@default(now())` y `@updatedAt` para auditoría
- **Índices optimizados**: Para consultas frecuentes en `leadId`, `direction`, `timestamp`

## API Endpoints

### Autenticación
Todos los endpoints excepto `/api/webhooks/*` requieren token JWT de Clerk.

### Endpoints Principales

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/webhooks/whatsapp` | Recepción de mensajes WhatsApp | ❌ |
| `GET` | `/api/leads` | Lista leads con filtros | ✅ |
| `GET` | `/api/leads/:id` | Detalle de lead y conversación | ✅ |
| `PATCH` | `/api/leads/:id/status` | Actualizar estado de lead | ✅ |
| `POST` | `/api/leads/:id/messages` | Enviar mensaje a lead | ✅ |
| `POST` | `/api/ai/suggest` | Sugerencia de respuesta IA | ✅ |
| `POST` | `/api/ai/classify` | Clasificación de mensaje IA | ✅ |
| `GET` | `/api/health` | Health check | ❌ |

### Formato de Respuesta Estándar
```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

## Desarrollo y Mejores Prácticas

### Convenciones de Código TypeScript

- **Variables/Funciones**: `camelCase`
- **Clases/Componentes**: `PascalCase`
- **Archivos**: `kebab-case.ts` o `PascalCase.tsx` (componentes)
- **Constantes**: `UPPER_SNAKE_CASE`

### Git Workflow

- **Branches**: `feature/descripcion`, `fix/issue-number`, `hotfix/critical-fix`
- **Commits**: Seguir [Conventional Commits](https://conventionalcommits.org/)
  - `feat: add lead classification with AI`
  - `fix: resolve WhatsApp session timeout`
  - `docs: update API endpoint documentation`

### Seguridad

- **Variables de Entorno**: Nunca hardcodear secrets, usar `.env` y `process.env`
- **Validación**: Usar `class-validator` en DTOs para validar inputs
- **Autenticación**: Verificar JWT en todos los endpoints protegidos
- **HTTPS**: Obligatorio en producción
- **RLS**: Activar Row Level Security en Supabase

### Testing

**Configuración Jest (API):**
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "src",
  "testRegex": ".*\\.spec\\.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "collectCoverageFrom": ["**/*.(t|j)s"],
  "coverageDirectory": "../coverage",
  "testEnvironment": "node"
}
```

**Comandos y Patrones:**
- **Unitarios**: Jest para servicios y utilidades (archivos `*.spec.ts`)
- **Integración**: Supertest para endpoints API (directorio `test/` en apps/api)
- **Pattern**: Tests unitarios usan extensión `.spec.ts`, tests E2E en `/test/`
- **Coverage**: Directorio `coverage/` en cada app, mínimo 80% para código crítico
- **Ambiente**: Node.js para backend, jsdom para frontend components

### Desarrollo con AI Assistants

**ByteRover MCP Tools Integration:**
Este proyecto está configurado para trabajar con asistentes de IA que utilizan herramientas MCP (Model Context Protocol) para mantener el contexto del proyecto.

**Importante para Desarrolladores:**

```bash
# Antes de iniciar cualquier tarea:
# 1. Usar byterover-retrieve-knowledge para obtener contexto
# 2. Realizar la tarea o desarrollo
# 3. Usar byterover-store-knowledge para almacenar información crítica
```

**Beneficios:**
- **Contexto Persistente**: Los asistentes mantienen información sobre el estado del proyecto
- **Mejor Colaboración**: Conocimiento compartido entre sesiones de desarrollo
- **Reducción de Errores**: Acceso a decisiones arquitectónicas previas
- **Aceleración del Desarrollo**: Menos tiempo explicando el contexto del proyecto

**Configuración Actual:**
- Archivos de configuración: `CLAUDE.md`, `.github/copilot-instructions.md`
- Herramientas habilitadas: byterover-retrieve-knowledge, byterover-store-knowledge
- Scope: Arquitectura, decisiones técnicas, patterns, troubleshooting

## Configuración de WhatsApp

### Primera Configuración

1. Iniciar `whatsapp-service` localmente
2. Escanear QR code que aparece en logs
3. Sesión se guarda en `/apps/whatsapp-service/sessions`
4. Verificar conexión enviando mensaje de prueba

### Manejo de Sesiones

- **Persistencia**: LocalAuth guarda sesión en volumen Docker
- **Expiración**: Monitorear logs por errores `auth`
- **Recuperación**: Re-escanear QR si sesión expira
- **Backup**: Respaldar directorio `/sessions` regularmente

## Troubleshooting

### Problemas Comunes

**Database Connection Issues (PostgreSQL)**
```bash
# Verificar conexión
pnpm db:studio

# Regenerar cliente
pnpm db:generate

# Ver estado de migraciones
pnpm db:migrate:status

# Reset de base de datos (development only)
pnpm db:reset
```

**Build Errors**
```bash
# Limpiar y reinstalar
pnpm clean:cache
rm -rf node_modules
pnpm install

# Verificar tipos
pnpm typecheck

# Reconstrucción completa
pnpm rebuild
```

**Turborepo Cache Issues**
```bash
# Limpiar cache de Turborepo
turbo daemon stop
rm -rf .turbo

# Limpiar cache completo
pnpm clean:cache
```

**Clerk Authentication Issues**
- Verificar que las variables `CLERK_SECRET_KEY` y `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` estén configuradas
- Comprobar que las URLs del proyecto coincidan con la configuración de Clerk
- Revisar que el middleware esté configurado correctamente en `middleware.ts`

**OpenAI Integration (Futuro)**
- Verificar límites en dashboard OpenAI
- Implementar exponential backoff
- Usar cache local/Redis para respuestas frecuentes

## Hoja de Ruta de Implementación

### ✅ Actualmente Implementado
- **Dashboard Web**: Next.js 15.4.2 con App Router completo
- **API Backend**: NestJS con estructura base y autenticación Clerk
- **Base de Datos**: PostgreSQL con Prisma y Supabase
- **UI Components**: shadcn/ui con TailwindCSS
- **Monorepo**: Turborepo optimizado con pnpm
- **Documentación**: Apps/docs y documentación completa
- **TypeScript API**: Corrección completa de errores (26 → 0 errores)

### 🔄 En Desarrollo Activo
- **Módulos NestJS**: LeadsModule, MessagingModule en progreso
- **Integración WhatsApp**: Servicio whatsapp-web.js
- **Servicios IA**: Integración con OpenAI API

### 📋 Roadmap Futuro

**Fase 2: Integración Completa**
- [ ] WhatsApp Service completamente funcional
- [ ] API endpoints para gestión de leads
- [ ] Procesamiento IA de mensajes
- [ ] Interface de chat en tiempo real

**Fase 3: Escalabilidad**
- [ ] Redis + BullMQ para colas asíncronas
- [ ] WebSocket para actualizaciones en tiempo real
- [ ] Sistema de notificaciones

**Fase 4: Producción**
- [ ] Despliegue automatizado (Vercel + Railway)
- [ ] Monitoreo y métricas
- [ ] Tests E2E completos
- [ ] Optimización de rendimiento

### Path de Migración

1. **SQLite → PostgreSQL**: Cambios en schema.prisma y variables de entorno
2. **Local → Supabase**: Configuración RLS y migración de datos
3. **Development → Production**: CI/CD y configuración de despliegue

## Despliegue

### Variables de Entorno Actuales

**Desarrollo (PostgreSQL):**
```bash
# Base de datos (PostgreSQL con Supabase)
DATABASE_URL="postgresql://user:pass@host:5432/dbname"
DIRECT_URL="postgresql://user:pass@host:5432/dbname"

# Autenticación
CLERK_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."

# Opcional para desarrollo futuro
OPENAI_API_KEY="sk-..."
```

**Producción:**
```bash
# Base de datos
DATABASE_URL="postgresql://user:pass@host:5432/dbname"
DIRECT_URL="postgresql://user:pass@host:5432/dbname"

# Autenticación
CLERK_SECRET_KEY="sk_live_..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_..."

# IA
OPENAI_API_KEY="sk-..."

# Cache y colas (cuando se implemente)
REDIS_URL="redis://..."

# WhatsApp Service (cuando esté listo)
WHATSAPP_WEBHOOK_SECRET="..."
```

### CI/CD Pipeline

GitHub Actions ejecuta automáticamente:
1. **Lint** → ESLint + Prettier
2. **Type Check** → TypeScript compilation
3. **Tests** → Jest + Playwright
4. **Build** → Production build
5. **Deploy** → Vercel (frontend) + Railway (backend)

### Monitorización

- **Health Checks**: `/api/health` endpoint
- **Logs**: Structured logging con Winston
- **Metrics**: Basic metrics con Redis
- **Alerts**: WhatsApp session failures, API errors

---

Para más detalles técnicos, consultar:
- [docs/PROJECT_STATUS.md](./docs/PROJECT_STATUS.md) - Estado detallado de implementación
- [docs/coding-guidelines.md](./docs/coding-guidelines.md) - Guías detalladas de código
- [apps/docs/](./apps/docs/) - Aplicación de documentación completa
- API Documentation: `/api/docs` (Swagger) - Cuando se implemente
