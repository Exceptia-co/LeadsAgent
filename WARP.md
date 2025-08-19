# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

# LeadsCRM - Dashboard de Gestión de Leads con WhatsApp e IA

LeadsCRM es un sistema integral de gestión de leads que automatiza la recepción y procesamiento de mensajes de WhatsApp mediante inteligencia artificial, proporcionando un dashboard moderno para la gestión eficiente de leads y conversaciones.

## Resumen Ejecutivo

El objetivo principal es validar el flujo: **recepción de leads por WhatsApp → persistencia y visualización → sugerencias de respuesta con IA → envío manual por agentes**. El sistema utiliza `whatsapp-web.js` para la integración con WhatsApp, OpenAI para análisis de mensajes y sugerencias de respuesta, y un dashboard web moderno para la gestión.

### Documentación Clave
- [`MVP-REDUCED.md`](./MVP-REDUCED.md) - Especificación técnica detallada del MVP
- [`quiero que compares los diferentes documentos adj....md`](./quiero%20que%20compares%20los%20diferentes%20documentos%20adj....md) - Plan de desarrollo consolidado

## Stack Tecnológico

| Componente | Tecnología | Propósito |
|------------|-----------|-----------|
| **Frontend** | Next.js 14 + TypeScript | Dashboard web con App Router y SSR |
| **Backend** | NestJS + TypeScript | API REST modular y escalable |
| **Base de Datos** | Supabase (PostgreSQL) | Almacenamiento persistente con RLS |
| **ORM** | Prisma | Capa de abstracción typesafe para DB |
| **Autenticación** | Clerk | Gestión de usuarios y sesiones |
| **UI/Estilos** | TailwindCSS + Shadcn/ui | Componentes modernos y accesibles |
| **Mensajería** | whatsapp-web.js | Integración con WhatsApp Web |
| **IA** | OpenAI API | Clasificación y generación de respuestas |
| **Cache/Colas** | Redis + BullMQ | Tareas asíncronas y cache |
| **Deploy** | Vercel + Railway/Fly.io | Frontend y backend en la nube |

## Estructura del Proyecto

El proyecto utiliza un **monorepositorio con Turborepo** para centralizar el código y facilitar la compartición de tipos y configuraciones:

```
/
├── apps/
│   ├── dashboard/           # Next.js app (frontend)
│   │   ├── app/            # App Router pages
│   │   ├── components/     # React components
│   │   └── lib/           # Utilidades cliente
│   ├── api/                # NestJS app (backend)
│   │   ├── src/
│   │   │   ├── modules/   # Módulos de negocio
│   │   │   ├── guards/    # Auth guards
│   │   │   └── services/  # Servicios globales
│   │   └── test/          # Tests E2E
│   └── whatsapp-service/   # Servicio WhatsApp independiente
│       ├── src/
│       └── sessions/      # Persistencia de sesiones WA
├── packages/
│   ├── db/                 # Prisma schema + client
│   │   ├── prisma/        # Schema y migraciones
│   │   └── src/          # Cliente Prisma
│   ├── ui/                # Componentes React compartidos
│   ├── config-eslint/     # Configuración ESLint
│   └── config-ts/         # Configuración TypeScript
├── .github/
│   └── workflows/         # CI/CD pipelines
└── docs/
    └── coding-guidelines.md
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
pnpm dev:api         # Backend en http://localhost:3001
pnpm dev:whatsapp    # Servicio WhatsApp

# Base de datos
pnpm db:studio       # Prisma Studio
pnpm db:migrate:dev  # Nueva migración
pnpm db:generate     # Regenerar cliente Prisma
pnpm db:reset        # Reset completo (cuidado!)
```

### Testing
```bash
# Tests unitarios
pnpm test            # Todos los tests
pnpm test:api        # Solo backend
pnpm test:dashboard  # Solo frontend

# Tests de integración
pnpm test:e2e

# Coverage
pnpm test:coverage
```

### Construcción y Linting
```bash
# Build de producción
pnpm build
pnpm build:api
pnpm build:dashboard

# Verificación de tipos
pnpm typecheck

# Linting y formateo
pnpm lint
pnpm lint:fix
pnpm format
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
WhatsApp → whatsapp-service → Redis Pub/Sub → NestJS API → Supabase
                                                    ↓
Frontend (Next.js) ← REST API ← BullMQ Workers ← AI Processing
```

### Flujo de Procesamiento de Mensajes

1. **WhatsApp** envía mensaje → `whatsapp-service` (whatsapp-web.js)
2. `whatsapp-service` publica mensaje en Redis (`whatsapp:messages:inbound`)
3. **NestJS API** consume mensaje y lo persiste en Supabase
4. **BullMQ Worker** procesa mensaje con IA (clasificación + puntuación)
5. **Frontend** muestra lead actualizado via polling/SWR
6. **Agente** puede solicitar sugerencia IA y enviar respuesta
7. Respuesta se envía via Redis (`whatsapp:messages:outbound`) → `whatsapp-service` → WhatsApp

### Módulos del Backend (NestJS)

- **AuthModule**: Autenticación con Clerk, guards JWT
- **LeadsModule**: Gestión CRUD de leads y estados
- **ContactsModule**: Gestión de contactos y teléfonos
- **MessagingModule**: Procesamiento de mensajes entrantes/salientes
- **AIModule**: Servicios de clasificación y generación con OpenAI
- **WebhooksModule**: Endpoints para whatsapp-service

## Modelo de Datos (Prisma)

### Entidades Principales

```prisma
model User {
  id       String  @id @default(cuid())
  clerkId  String  @unique
  email    String  @unique
  role     String  // "admin" | "agent"
  createdAt DateTime @default(now())
}

model Lead {
  id           String      @id @default(uuid())
  name         String?
  phone        String      @unique
  status       String      @default("NEW") // NEW, CONTACTED, HOT, WARM, COLD, DISCARDED
  score        Float?      // Puntuación IA (0.0-1.0)
  createdAt    DateTime    @default(now())
  conversation Conversation?
}

model Conversation {
  id       String    @id @default(uuid())
  lead     Lead      @relation(fields: [leadId], references: [id])
  leadId   String    @unique
  messages Message[]
}

model Message {
  id             String    @id @default(uuid())
  content        String    @db.Text
  direction      String    // INBOUND | OUTBOUND | SUGGESTION
  createdAt      DateTime  @default(now())
  aiMetadata     Json?     // { model, prompt, result, score }
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  conversationId String
}
```

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

- **Unitarios**: Jest para servicios y utilidades
- **Integración**: Supertest para endpoints API
- **E2E**: Playwright para flujos completos de usuario
- **Coverage**: Mínimo 80% para código crítico

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

**WhatsApp Session Expired**
```bash
# Ver logs del servicio
docker logs whatsapp-service

# Reiniciar servicio y escanear QR
pnpm dev:whatsapp
# Escanear QR que aparece en terminal
```

**Database Connection Issues**
```bash
# Verificar conexión
pnpm db:studio

# Regenerar cliente
pnpm db:generate

# Ver logs de conexión
DATABASE_URL=your_url pnpm db:migrate:status
```

**OpenAI Rate Limits**
- Verificar límites en dashboard OpenAI
- Implementar exponential backoff
- Usar cache Redis para respuestas frecuentes

**Build Errors**
```bash
# Limpiar y reinstalar
pnpm clean
rm -rf node_modules
pnpm install

# Verificar tipos
pnpm typecheck
```

## Despliegue

### Variables de Entorno Requeridas

```bash
# Base de datos
DATABASE_URL="postgresql://..."

# Autenticación
CLERK_SECRET_KEY="..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="..."

# IA
OPENAI_API_KEY="..."

# Redis
REDIS_URL="redis://..."

# WhatsApp Service
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
- [MVP-REDUCED.md](./MVP-REDUCED.md) - Especificación completa del MVP
- [docs/coding-guidelines.md](./docs/coding-guidelines.md) - Guías detalladas de código
- API Documentation: `/api/docs` (Swagger)
