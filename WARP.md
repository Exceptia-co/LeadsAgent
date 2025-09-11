# WARP.md - LeadsAgent Quick Reference

_Guía optimizada para desarrollo con WARP Terminal_

## 📊 Estado del Proyecto

**✅ Sistema Completamente Operativo**
- **Versión:** 2.2.0 (Agosto 2025)
- **Estado:** Production Ready con 14 tablas activas, 6 leads, múltiples conversaciones
- **Última actualización:** Sistema de IA multi-proveedor y templates implementado

## 🚀 Stack Tecnológico

**Core:**
- **Frontend:** Next.js 14.2.15 + TypeScript + TailwindCSS + Shadcn/ui
- **Backend:** NestJS + TypeScript (API completa implementada)
- **Database:** PostgreSQL + Prisma (Supabase) - 14 tablas operativas
- **Auth:** Clerk (JWT + guards implementados)
- **Monorepo:** Turborepo + pnpm

**WhatsApp & IA:**
- **WhatsApp:** whatsapp-web.js multi-sesión (QR, persistencia, métricas)
- **IA:** OpenRouter, Google Gemini, OpenAI (intercambiables dinámicamente)
- **Templates:** Sistema de mensajes proactivos con variables
- **Analytics:** Métricas completas de tokens, conversaciones, whitelist

## 📁 Estructura del Proyecto (Monorepo Turborepo)

```
LeadsAgent/
├── apps/
│   ├── dashboard/           # ✅ Frontend Next.js 14.2.15
│   ├── api/                 # ✅ Backend NestJS (API completa)
│   ├── whatsapp-service/    # ✅ Servicio WhatsApp (multi-sesión)
│   └── docs/                # ✅ Documentación Next.js
├── packages/
│   ├── db/                  # ✅ Prisma schema + client
│   ├── ui/                  # ✅ Componentes React (shadcn/ui)
│   └── config-*/            # ✅ Configs compartidas (ESLint, TS)
└── docs/                    # 📚 Documentación técnica
```


## ⚡ Comandos Esenciales

### 🚀 Quick Start (5 minutos)
```bash
# Setup completo
git clone <repo> && cd LeadsAgent
pnpm install && cp .env.example .env
# ⚠️ Editar .env con tus credenciales
pnpm db:generate && pnpm db:migrate:dev
pnpm dev  # Todos los servicios
```

### 🔧 Desarrollo Diario
```bash
# Desarrollo
pnpm dev              # 🌐 Todos los servicios
pnpm dev:dashboard    # Frontend: localhost:3000
pnpm dev:api         # Backend: localhost:3003  
pnpm dev:whatsapp    # WhatsApp: localhost:3002

# Base de datos
pnpm db:studio       # 💾 Prisma Studio
pnpm db:generate     # 🔄 Regenerar cliente
pnpm db:migrate:dev  # 📊 Nueva migración

# Build & Testing
pnpm build           # 🏗️ Build producción
pnpm test            # 🧪 Tests unitarios
pnpm lint:fix        # ✨ Fix linting
pnpm typecheck       # 📝 Verificar tipos
```

### 🔧 Utilidades
```bash
pnpm clean:cache     # 🧹 Limpiar cache Turbo
pnpm rebuild         # 🔄 Reconstrucción completa
```

## 🏗️ Arquitectura del Sistema

### Flujo Principal
```
WhatsApp ↔ whatsapp-service ↔ NestJS API ↔ PostgreSQL/Supabase
                                    ↕
               Next.js Dashboard ← → IA Multi-proveedor
```

### Paquetes Compartidos
- **`@leadcrm/db`** → Prisma schema + types compartidos  
- **`@leadcrm/ui`** → Componentes React (shadcn/ui)
- **`@leadcrm/config-*`** → Configuraciones ESLint/TypeScript

### Puertos de Desarrollo
- **Dashboard:** `localhost:3000` (Next.js)
- **API:** `localhost:3003` (NestJS) 
- **WhatsApp Service:** `localhost:3002`
- **Prisma Studio:** `pnpm db:studio`



## 💾 Base de Datos (PostgreSQL + Prisma)

### Estado Actual: 14 Tablas Operativas
```sql
-- Core del sistema
users, leads, messages, whatsapp_conversations

-- Templates y IA  
message_templates, proactive_messages
ai_configuration, ai_knowledge_base, ai_training_interactions

-- WhatsApp
whatsapp_sessions, whatsapp_whitelist_logs

-- Sistema
system_variables, migrations, _prisma_migrations
```

### Características Principales
- ✅ **6 leads activos** con múltiples conversaciones
- ✅ **JSONB nativo** para metadata flexible
- ✅ **UUIDs automáticos** (`gen_random_uuid()`)
- ✅ **Enums personalizados** (lead_status, message_direction, etc.)
- ✅ **Templates dinámicos** con variables `{{name}}`, `{{company}}`
- ✅ **IA multi-proveedor** intercambiable (OpenRouter/Gemini/OpenAI)
- ✅ **Analytics completos** con métricas de tokens y whitelist

> 📋 **Schema completo:** `packages/db/prisma/schema.prisma`

## 🔌 API Endpoints Principales

### NestJS API (Puerto 3003) - Auth: Clerk JWT
| Endpoint | Método | Descripción |
|----------|--------|--------------|
| `/api/health` | GET | Health check |
| `/api/leads` | GET | Lista leads + filtros |
| `/api/leads/:id` | GET | Lead + conversaciones |
| `/api/leads/:id/status` | PATCH | Actualizar estado |
| `/api/messages/templates` | GET | Templates disponibles |
| `/api/messages/proactive` | POST | Crear mensaje proactivo |

### WhatsApp Service (Puerto 3002) - No Auth
| Endpoint | Método | Descripción |
|----------|--------|--------------|
| `/health` | GET | Estado servicio |
| `/sessions` | GET/POST | Gestión sesiones |
| `/sessions/:id/qr` | GET | QR code |
| `/messages/send` | POST | Enviar mensaje |
| `/ai/switch` | POST | Cambiar proveedor IA |
| `/analytics/messages` | GET | Métricas |

**Formato respuesta:** `{ success: boolean, data: any, error: null }`

## 📋 Reglas de Desarrollo

### 🤖 Para Asistentes de IA (OBLIGATORIO)
**Servidores MCP requeridos:** `context7`, `perplexity-ask`, `serena`, `sequential-thinking`

**Reglas esenciales:**
- ✅ Usar TypeScript estricto en todos los proyectos
- ✅ ESLint + Prettier con configuración compartida
- ✅ Conventional Commits: `feat:`, `fix:`, `docs:`
- ❌ NUNCA hardcodear secretos → usar `.env` y `process.env`
- ✅ Validar inputs externos (APIs, formularios)
- ✅ Funciones pequeñas de una sola responsabilidad
- ✅ HTTPS obligatorio en producción

### 📝 Convenciones TypeScript
- **Variables/Funciones:** `camelCase`
- **Clases/Componentes:** `PascalCase`  
- **Archivos:** `kebab-case.ts` o `PascalCase.tsx`
- **Constantes:** `UPPER_SNAKE_CASE`

### 🔒 Seguridad
- ✅ JWT en endpoints protegidos (Clerk)
- ✅ `class-validator` en DTOs
- ✅ RLS activado en Supabase
- ✅ Variables de entorno para todos los secretos

## 🤖 Configuración de IA Multi-Proveedor

**Proveedores soportados:** OpenRouter, Google Gemini, OpenAI (intercambiables)

### Variables de Entorno
```bash
AI_PROVIDER=openrouter  # openrouter | gemini | openai
OPENROUTER_API_KEY="{{SECRET}}"
GEMINI_API_KEY="{{SECRET}}"
OPENAI_API_KEY="{{SECRET}}"
```

### Endpoints de Gestión IA
- `GET /ai/status` → Estado actual y proveedores
- `POST /ai/switch` → Cambiar proveedor: `{"provider": "gemini"}`
- `POST /ai/test` → Probar respuesta IA

## 📱 WhatsApp Service (Multi-sesión)

### Setup Inicial
1. `pnpm dev:whatsapp` → Iniciar servicio
2. Escanear QR del log → Autenticar WhatsApp  
3. Sesión persistente en `apps/whatsapp-service/sessions/`
4. Enviar mensaje de prueba para verificar

### Características
- ✅ **Multi-sesión:** Múltiples cuentas WhatsApp
- ✅ **QR automático:** Generación y renovación 
- ✅ **Persistencia:** LocalAuth + backup sessions
- ✅ **Métricas:** Analytics de mensajes y whitelist
- ✅ **Filtrado:** Whitelist automática para IA

## 🔧 Troubleshooting

### Problemas Frecuentes

**Base de Datos:**
```bash
pnpm db:studio          # Verificar conexión
pnpm db:generate        # Regenerar cliente
pnpm db:migrate:status  # Estado migraciones
pnpm db:reset          # Reset completo (dev only)
```

**Build/Cache:**
```bash
pnpm clean:cache       # Limpiar Turbo cache
pnpm rebuild           # Reconstrucción completa
turbo daemon stop      # Reset daemon Turbo
```

**Auth (Clerk):**
- ✅ Verificar `CLERK_SECRET_KEY` y `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- ✅ URLs coincidan con config Clerk
- ✅ Middleware configurado en `middleware.ts`

## 🚀 Estado y Roadmap

### ✅ COMPLETADO (Agosto 2025)
- **Sistema 100% operativo** con 14 tablas, 6 leads activos
- **Dashboard completo** Next.js + analytics en tiempo real
- **API NestJS completa** con todos los módulos 
- **WhatsApp multi-sesión** con QR, persistencia, métricas
- **IA multi-proveedor** OpenRouter/Gemini/OpenAI intercambiables
- **Sistema de templates** con variables dinámicas
- **Base de conocimiento** IA entrenable

### 🔄 EN PROGRESO
- **Performance:** Redis + BullMQ, query optimization
- **Deploy:** Producción Vercel + Supabase
- **UI/UX:** Refinamiento interfaces

### 📋 PRÓXIMO
- **WebSockets:** Actualizaciones tiempo real
- **Tests E2E:** Automatización completa
- **CI/CD:** Pipeline automatizado

## 🌐 Variables de Entorno

```bash
# Base de datos (PostgreSQL + Supabase)
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

# Autenticación (Clerk)
CLERK_SECRET_KEY="{{SECRET}}"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="{{PUBLIC_KEY}}"

# IA Multi-proveedor
AI_PROVIDER=openrouter  # openrouter | gemini | openai
OPENROUTER_API_KEY="{{SECRET}}"
GEMINI_API_KEY="{{SECRET}}"
OPENAI_API_KEY="{{SECRET}}"

# WhatsApp (futuro)
WHATSAPP_WEBHOOK_SECRET="{{SECRET}}"
REDIS_URL="redis://..."  # Para cache/colas
```

### Monitoreo
- **Health:** `/api/health`, `/health` endpoints
- **Logs:** Winston structured logging  
- **Métricas:** Analytics integradas
- **Alerts:** Fallos de sesión WhatsApp, errores API

## 📚 Documentación Adicional

### Documentación Técnica
- [`README.md`](./README.md) - Información completa del proyecto
- [`AGENTS.md`](./AGENTS.md) - Guía específica para agentes de IA
- [`docs/`](./docs/) - Documentación técnica detallada

### Guías Principales
- [AI Configuration](./docs/AI_CONFIGURATION.md) - Configuración proveedores IA
- [Authentication Guide](./docs/AUTHENTICATION.md) - Clerk + NestJS + Supabase
- [Security Guide](./docs/SECURITY.md) - RLS y políticas de seguridad
- [Coding Guidelines](./docs/coding-guidelines.md) - Estándares de código
- [Troubleshooting Guide](./docs/TROUBLESHOOTING.md) - Soluciones problemas comunes

### Estado y Referencias
- [Project Status](./docs/PROJECT_STATUS.md) - Estado actual y métricas
- [Build Optimizations](./docs/OPTIMIZATIONS.md) - Optimizaciones aplicadas
- [Architecture Diagrams](./docs/ARCHITECTURE_DIAGRAMS.md) - Diagramas del sistema

### Aplicaciones de Documentación
- **App Docs:** [`apps/docs/`](./apps/docs/) - Documentación integrada Turborepo
- **API Swagger:** `localhost:3003/api/docs` - Documentación interactiva API

---

**📝 Última actualización:** Agosto 2025 - Sistema completamente operativo  
**🎯 Para asistentes IA:** Activar MCP: `context7` + `perplexity-ask` + `serena` + `sequential-thinking`
