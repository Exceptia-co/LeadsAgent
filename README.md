# LeadsCRM Agent

> **⚡ Ultra-Fast Builds**: Optimized from 19+ minutes to ~3 minutes with advanced Turborepo configuration

Sistema integral de gestión de leads con automatización de WhatsApp e integración de IA. Monorepo optimizado construido con Turborepo, diseñado para equipos de alto rendimiento.

## 🚀 Características Principales

- **Dashboard de Gestión**: Interfaz moderna de administración de leads con Next.js 14
- **API REST**: Backend robusto con NestJS y autenticación JWT
- **Automatización WhatsApp**: Servicio de mensajería automatizada con IA
- **Base de Datos**: PostgreSQL con Prisma ORM y migraciones automáticas
- **Arquitectura Monorepo**: Código compartido y builds ultrarrápidas
- **TypeScript**: 100% tipado estático para mayor confiabilidad

## 🏗️ Arquitectura del Monorepo

### Apps (Aplicaciones)

- **`apps/dashboard`** - Panel de administración con Next.js 14 + React 18
- **`apps/api`** - API REST con NestJS + PostgreSQL
- **`apps/whatsapp-service`** - Servicio de automatización WhatsApp

### Packages (Librerías Compartidas)

- **`packages/db`** - Esquemas Prisma, migraciones y cliente de DB
- **`packages/ui`** - Componentes React reutilizables y design system
- **`packages/config-eslint`** - Configuración ESLint compartida
- **`packages/config-ts`** - Configuraciones TypeScript optimizadas

## 🛠️ Stack Tecnológico

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend**: NestJS, TypeScript, JWT Authentication
- **Base de Datos**: PostgreSQL, Prisma ORM
- **Mensajería**: WhatsApp Web API, WebSockets
- **Build System**: Turborepo (configuración ultra-optimizada)
- **Linting**: ESLint, Prettier
- **Package Manager**: PNPM (workspaces)

## ⚡ Instalación Rápida

### Prerrequisitos

- **Node.js**: >= 18.0.0
- **PNPM**: >= 9.0.0
- **PostgreSQL**: >= 14
- **Redis**: >= 6.0 (para WhatsApp sessions)

### Setup del Proyecto

```bash
# Clonar el repositorio
git clone https://github.com/Exceptia-co/LeadsAgent.git
cd LeadsAgent

# Instalación completa (incluye DB setup)
pnpm setup

# O instalación paso a paso
pnpm install
pnpm db:generate
pnpm db:migrate:dev
```

### Variables de Entorno

Crea los archivos `.env` necesarios:

```bash
# Archivo raíz: .env
DATABASE_URL="postgresql://usuario:password@localhost:5432/leadcrm"
JWT_SECRET="tu-jwt-secret-seguro"
REDIS_URL="redis://localhost:6379"

# Para WhatsApp service: apps/whatsapp-service/.env
WHATSAPP_SESSION_PATH="./sessions"
WHATSAPP_WEBHOOK_URL="https://tu-dominio.com/webhook"
OPENAI_API_KEY="tu-openai-key"  # Para funciones IA
```

## 🚀 Scripts de Desarrollo

### Desarrollo

```bash
# Iniciar todo el ecosistema
pnpm dev

# Desarrollar aplicaciones específicas
pnpm dev:dashboard    # Solo dashboard (puerto 3000)
pnpm dev:api         # Solo API (puerto 3001)
pnpm dev:whatsapp    # Solo WhatsApp service (puerto 3002)
```

### Build (Ultra-Optimizado)

```bash
# Build completo optimizado (~3 min)
pnpm build:fast

# Build de producción
pnpm build:production

# Build por aplicación
pnpm build:dashboard
pnpm build:api
pnpm build:whatsapp
```

### Base de Datos

```bash
pnpm db:generate     # Generar cliente Prisma
pnpm db:migrate:dev  # Ejecutar migraciones
pnpm db:studio       # Abrir Prisma Studio
pnpm db:reset        # Reset completo de DB
```

### Utilidades

```bash
pnpm typecheck       # Verificar TypeScript
pnpm lint            # Linting completo
pnpm format          # Formatear código
pnpm test            # Ejecutar tests
pnpm clean:cache     # Limpiar caché de build
pnpm rebuild         # Rebuild completo desde cero
```

## 📊 Optimizaciones de Build

**Antes**: ~19 minutos | **Después**: ~3 minutos ⚡

### Mejoras Aplicadas

- **React 18**: Downgrade desde React 19 para estabilidad
- **TypeScript Optimizado**: `skipLibCheck`, `incremental`, cache mejorado
- **Turborepo Paralelo**: Builds simultáneos con `--parallel --no-daemon`
- **Cache Inteligente**: Estrategia de caché optimizada por dependencias
- **Scripts Fast**: Comandos `build:fast` y `typecheck:fast`

> 📖 **Documentación Completa**: Ver `docs/OPTIMIZATIONS.md` para detalles técnicos

## 🔧 Configuración de Desarrollo

### IDEs Recomendados

- **VSCode**: Con extensiones TypeScript, Prisma, ESLint
- **Configuración TypeScript**: Strict mode habilitado
- **Prettier**: Formateo automático configurado

### Estructura de Puertos

- **Dashboard**: http://localhost:3000
- **API**: http://localhost:3001
- **WhatsApp Service**: http://localhost:3002
- **Prisma Studio**: http://localhost:5555

### Flujo de Trabajo

1. **Desarrollo**: Usar `pnpm dev` para todo el ecosistema
2. **Testing**: `pnpm test` antes de cada commit
3. **Build**: Verificar con `pnpm build:fast`
4. **Deploy**: `pnpm build:production`

## 📁 Estructura del Proyecto

```
LeadsAgent/
├── apps/
│   ├── dashboard/          # Panel de administración
│   ├── api/               # Backend API
│   └── whatsapp-service/  # Servicio WhatsApp
├── packages/
│   ├── db/                # Prisma schemas
│   ├── ui/                # Componentes compartidos
│   ├── config-eslint/     # Config ESLint
│   └── config-ts/         # Config TypeScript
├── docs/                  # Documentación
├── turbo.json            # Configuración Turborepo
└── package.json          # Scripts raíz
```

## 🔐 Seguridad

- **JWT Authentication**: Tokens seguros para API
- **Variables de Entorno**: Nunca hardcodear secrets
- **Validación de Input**: Sanitización completa
- **CORS**: Configurado para dominios específicos
- **Rate Limiting**: Protección contra spam

## 🤝 Contribución

1. Fork del repositorio
2. Crear feature branch: `git checkout -b feature/nueva-funcionalidad`
3. Commit cambios: `git commit -m 'feat: agregar nueva funcionalidad'`
4. Push branch: `git push origin feature/nueva-funcionalidad`
5. Crear Pull Request

### Convenciones de Commit

- `feat:` - Nueva funcionalidad
- `fix:` - Bug fix
- `docs:` - Documentación
- `style:` - Formato de código
- `refactor:` - Refactorización
- `test:` - Tests
- `chore:` - Tareas de mantenimiento

## 📜 Licencia

Este proyecto es privado y pertenece a Exceptia Co. Todos los derechos reservados.

## 🆘 Soporte

- **Issues**: [GitHub Issues](https://github.com/Exceptia-co/LeadsAgent/issues)
- **Documentación**: `docs/` folder
- **Status del Proyecto**: `docs/PROJECT_STATUS.md`

---

**Hecho con ❤️ por el equipo de Exceptia** | **Powered by Turborepo ⚡**
