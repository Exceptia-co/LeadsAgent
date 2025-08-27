# Guía de Uso de Agentes OpenCode para LeadsCRM

## ✅ Instalación Completada

Se han creado **10 agentes especializados** para el proyecto LeadsCRM en `.opencode/agents/`:

### 🚀 Agentes Creados

1. **lead-manager** - Gestión de leads con clasificación IA
2. **api-tester** - Testing de APIs NestJS con Jest/Supertest
3. **database** - Migraciones Prisma y gestión PostgreSQL
4. **whatsapp** - Integración WhatsApp y manejo de sesiones
5. **ui-component** - Componentes React con shadcn/ui y Tailwind
6. **code-quality** - Linting, TypeScript y formateo
7. **build-deployment** - Builds Turbo y deployment
8. **ai-enhancement** - Integración OpenAI y clasificación
9. **security-audit** - Auditoría de seguridad y auth Clerk
10. **monitoring** - Monitoreo de performance y optimización

## 📖 Ejemplos de Uso

### Desarrollo de Features

```bash
# Crear lead desde WhatsApp
opencode --agent lead-manager "Crear lead desde WhatsApp +34123456789 interesado en escorts Madrid"

# Crear componente UI
opencode --agent ui-component "Crear DataTable para mostrar leads con filtros y paginación"

# Testing completo
opencode --agent api-tester "Ejecutar todos los tests del módulo de leads y generar coverage"
```

### DevOps y Quality

```bash
# Revisar calidad de código
opencode --agent code-quality "Revisar y corregir todos los errores de ESLint y TypeScript"

# Preparar deployment
opencode --agent build-deployment "Preparar build de producción y validar variables de entorno"

# Auditoría de seguridad
opencode --agent security-audit "Auditar implementación de autenticación Clerk"
```

### Integración y IA

```bash
# Configurar WhatsApp
opencode --agent whatsapp "Configurar nueva sesión WhatsApp y generar QR"

# Mejorar IA
opencode --agent ai-enhancement "Implementar clasificación automática de leads usando GPT-4"

# Optimización
opencode --agent monitoring "Analizar performance de queries de leads más lentas"
```

### Workflows Combinados

```bash
# Desarrollo completo de feature
opencode --agents "lead-manager,ui-component,api-tester,code-quality" "Implementar nueva funcionalidad de leads"

# Preparar para deployment
opencode --agents "code-quality,api-tester,build-deployment,security-audit" "Preparar release para producción"
```

## 🛠️ Comandos del Proyecto

Los agentes están configurados para usar estos comandos del monorepo:

```bash
# Desarrollo
pnpm dev:dashboard  # Frontend (puerto 3000)
pnpm dev:api        # Backend (puerto 3003)
pnpm dev:whatsapp   # WhatsApp service (puerto 3002)

# Testing
pnpm test           # Todos los tests
pnpm test:e2e       # Tests E2E
pnpm test:cov       # Coverage

# Quality
pnpm lint           # ESLint
pnpm typecheck      # TypeScript
pnpm format         # Prettier

# Database
pnpm db:generate    # Generar cliente Prisma
pnpm db:migrate:dev # Aplicar migraciones
pnpm db:studio      # Abrir Prisma Studio

# Build
pnpm build          # Build completo
pnpm build:fast     # Build paralelo
pnpm clean:cache    # Limpiar cache
```

## 🔧 Configuración

Cada agente incluye:

- **Contexto específico** del stack LeadsCRM
- **Comandos optimizados** para el monorepo
- **Variables de entorno** necesarias
- **Patrones de archivos** relevantes
- **Ejemplos prácticos** de uso
- **Tareas comunes** del dominio

## 🎯 Stack Tecnológico Cubierto

- **Frontend**: Next.js 15, React 18, TypeScript, Tailwind, shadcn/ui
- **Backend**: NestJS, Prisma, PostgreSQL (Supabase), Clerk Auth
- **WhatsApp**: whatsapp-web.js, Express, Multer
- **AI**: OpenAI GPT-4, clasificación automática
- **DevOps**: Turborepo, ESLint, Prettier, Jest, Supertest
- **Deployment**: Vercel (frontend), Railway (backend)

## 📂 Estructura de Archivos

```
.opencode/
└── agents/
    ├── index.yml              # Índice principal
    ├── README.md              # Documentación
    ├── lead-manager.yml       # Gestión de leads
    ├── api-tester.yml         # Testing APIs
    ├── database.yml           # Prisma/PostgreSQL
    ├── whatsapp.yml           # WhatsApp integration
    ├── ui-component.yml       # React components
    ├── code-quality.yml       # Linting/formateo
    ├── build-deployment.yml   # Builds/deployment
    ├── ai-enhancement.yml     # OpenAI integration
    ├── security-audit.yml     # Seguridad/auth
    └── monitoring.yml         # Performance/analytics
```

## 🚦 Estado Actual

- ✅ **10 agentes creados** y configurados
- ✅ **Comandos validados** con el proyecto
- ✅ **TypeScript compilation** exitosa
- ⚠️ **ESLint config** necesita configuración en dashboard/docs
- ✅ **Prisma generation** funcionando
- ✅ **Documentación** completa

Los agentes están listos para usar con opencode! 🎉
