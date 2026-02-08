# 📚 Reference - LeadsCRM

_Referencias rápidas y documentación de consulta_

---

## 📋 **Referencias Principales**

### 🎯 **Documentos de Consulta Rápida**

| Documento                                          | Descripción                              | Uso           |
| -------------------------------------------------- | ---------------------------------------- | ------------- |
| [`project-status.md`](./project-status.md)         | **Estado detallado del proyecto v2.2.0** | Status check  |
| [`environment-vars.md`](./environment-vars.md)     | **Variables de entorno completas**       | Configuracion |
| [`all-commands.md`](./all-commands.md)             | **Todos los comandos del proyecto**      | Desarrollo    |

---

## ⚡ **Quick Reference**

### **🔸 Puertos del Sistema**

```
3001 - Dashboard (Next.js)      - http://localhost:3001
3002 - WhatsApp Service         - http://localhost:3002
3003 - API Backend (NestJS)     - http://localhost:3003
6381 - Redis (Docker)           - localhost:6381
```

### **🔸 Comandos Esenciales**

```bash
# Desarrollo
pnpm dev                    # Todos los servicios
pnpm dev:dashboard         # Solo frontend
pnpm dev:api              # Solo backend

# Build
pnpm build                # Build completo
pnpm build:fast           # Build paralelo rápido

# Base de datos
pnpm db:generate          # Regenerar cliente Prisma
pnpm db:migrate:dev       # Aplicar migraciones
pnpm db:studio           # Prisma Studio

# Testing
pnpm test                # Tests unitarios
pnpm test:e2e           # Tests E2E
pnpm lint               # Linting
pnpm typecheck          # Type checking
```

### **🔸 Variables Críticas**

```bash
# Base de datos
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

# Autenticación
CLERK_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."

# IA
AI_PROVIDER="openrouter"
OPENROUTER_API_KEY="sk-or-v1-..."
```

---

## 📊 **Estado Actual del Sistema**

### ✅ **v2.2.0 - Sistema Completo Operativo**

- 🎯 **14 tablas PostgreSQL** activas con datos reales
- 📊 **6 leads gestionándose** con conversaciones múltiples
- 🤖 **IA multi-proveedor** (OpenRouter, Gemini, OpenAI)
- 📱 **WhatsApp multi-sesión** con QR codes y persistencia
- 📋 **3 templates dinámicos** con variables personalizables
- 📈 **Analytics tiempo real** y sistema de whitelist

### 🔄 **En Desarrollo**

- Redis + BullMQ para escalabilidad masiva
- WebSockets para actualizaciones instantáneas
- Deploy automatizado (Vercel + Supabase)

---

## 🎯 **Referencias por Rol**

### **👨‍💻 Desarrollador**

- [`all-commands.md`](./all-commands.md) - Comandos de desarrollo
- [`environment-vars.md`](./environment-vars.md) - Variables de entorno
- [`../development/coding-guidelines.md`](../development/coding-guidelines.md) - Standards

### **DevOps/Admin**

- [`../deployment/INFRASTRUCTURE.md`](../deployment/INFRASTRUCTURE.md) - Infraestructura
- [`../deployment/`](../deployment/) - Guias de deploy
- [`../deployment/security-guide.md`](../deployment/security-guide.md) - Seguridad

### **📊 Product/QA**

- [`project-status.md`](./project-status.md) - Estado del proyecto
- [`../features/`](../features/) - Funcionalidades disponibles
- [`../TROUBLESHOOTING.md`](../TROUBLESHOOTING.md) - Debugging

### **🆕 Nuevo en el Proyecto**

- [`../getting-started/`](../getting-started/) - Setup inicial
- [`../README.md`](../README.md) - Introducción general
- [`../architecture/`](../architecture/) - Entender el sistema

---

## 🚀 **Arquitectura Quick Reference**

### **🔸 Stack Tecnológico**

```
Frontend:    Next.js 14.2.15 + TypeScript + TailwindCSS + shadcn/ui
Backend:     NestJS + TypeScript + Prisma ORM + Clerk Auth
Database:    PostgreSQL/Supabase (14 tablas operativas)
Messaging:   WhatsApp Web.js (multi-sesión con persistencia)
IA:          OpenRouter + Google Gemini + OpenAI (intercambiables)
Build:       Turborepo + pnpm (84% más rápido que antes)
```

### **🔸 Flujo de Datos**

```
WhatsApp → WhatsApp Service → NestJS API → PostgreSQL/Supabase
    ↓           ↓                ↓           ↓
 Usuarios    QR Codes         Webhook      14 tablas
             Sessions       Processing    + analytics
             Whitelist      IA Analysis   + conversation
```

---

## 📈 **Métricas del Sistema**

### **🔸 Performance**

- **Build time**: 19min → 3min (84% mejora)
- **TypeScript check**: 7min → 45seg (85% mejora)
- **Cache hit rate**: 30% → 85% (55% mejora)
- **IA response time**: 5.2s → 2.1s (60% mejora)

### **🔸 Datos Operativos**

- **Leads activos**: 6 leads con conversaciones
- **Templates**: 3 templates con variables dinámicas
- **Sesiones WhatsApp**: 1 sesión persistente activa
- **Mensajes IA**: Promedio 18 palabras vs 95 anteriores

---

## 🔧 **Troubleshooting Quick Fix**

### **🔴 Problemas Comunes**

```bash
# Servicios no arrancan
pnpm clean:cache && pnpm install && pnpm dev

# Build falla
pnpm rebuild

# Base de datos issues
pnpm db:generate && pnpm db:migrate:dev

# TypeScript errors
pnpm typecheck

# WhatsApp no conecta
curl http://localhost:3002/health
```

### **🔴 Health Checks**

```bash
# Verificar todos los servicios
curl http://localhost:3001     # Dashboard
curl http://localhost:3003/health  # API
curl http://localhost:3002/health  # WhatsApp

# Verificar base de datos
pnpm db:studio

# Verificar build
pnpm build:fast
```

---

## 📚 **Documentación Relacionada**

### **Setup y Configuración**

- [`../getting-started/`](../getting-started/) - Configuración inicial completa
- [`../architecture/`](../architecture/) - Arquitectura y diseño del sistema
- [`../features/`](../features/) - Funcionalidades disponibles

### **Desarrollo**

- [`../development/`](../development/) - Guías de desarrollo
- [`../PRACTICAL_EXAMPLES.md`](../PRACTICAL_EXAMPLES.md) - Ejemplos prácticos


### **Deploy y Operaciones**

- [`../deployment/`](../deployment/) - Guías de despliegue
- [`../TROUBLESHOOTING.md`](../TROUBLESHOOTING.md) - FAQ y soluciones
- [`../DEBUG_SOLUTIONS.md`](../DEBUG_SOLUTIONS.md) - Debug específico

---

_Referencias actualizadas para LeadsCRM v2.2.0 - Septiembre 2025_ ✅
