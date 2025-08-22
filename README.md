# LeadsCRM – CRM con Automatización de WhatsApp e IA

## 🚀 Descripción

LeadsCRM es una plataforma CRM moderna (monorepo Turborepo) que centraliza la gestión de leads, conversaciones de WhatsApp y futura asistencia por IA. Incluye Dashboard web (Next.js), API backend (NestJS), servicio de integración WhatsApp y paquete de base de datos (Prisma + PostgreSQL/Supabase).

## ✨ Características

- 📊 Dashboard CRM (leads, conversaciones, métricas iniciales)
- 💬 Chat en tiempo real (estado de envío básico)
- 📱 Servicio WhatsApp (whatsapp-web.js) con múltiples sesiones
- 🔐 Autenticación (Clerk) integrada en Dashboard y API
- 🗄️ Prisma + PostgreSQL (Supabase-ready)
- 🧱 Arquitectura modular (NestJS modules / packages compartidos)
- ⚡ Turborepo (cache + tasks paralelos)
- 🎨 UI consistente (shadcn/ui + Tailwind + paquete `@leadcrm/ui`)
- 🧪 Testing (Jest, Supertest e2e API)
- 🛡️ Validación (class-validator) y patrones de respuesta `{ success, data?, error? }`
- 🧠 (En progreso) Integraciones IA para clasificación/respuestas sugeridas

## 🏗️ Arquitectura

### Monorepo

```
LeadsCRM/
├─ apps/
│  ├─ dashboard/          # Next.js 15 (App Router)
│  ├─ api/                # NestJS (REST API)
│  └─ whatsapp-service/   # Servicio Node (whatsapp-web.js)
├─ packages/
│  ├─ db/                 # Prisma schema + client (@leadcrm/db)
│  ├─ ui/                 # Componentes compartidos (@leadcrm/ui)
│  ├─ config-eslint/      # ESLint configs
│  └─ config-ts/          # TS configs
├─ docs/                  # Documentación adicional
├─ .github/               # CI workflows
└─ turbo.json / pnpm-workspace.yaml
```

### Flujo de Datos (simplificado)

Usuario → Dashboard (Next.js) → API (NestJS) → DB (Prisma/PostgreSQL)  
 ↘ whatsapp-service (webhook/eventos) → Actualiza DB → Reflejo en UI

## 🔑 Paquetes Importantes

| Paquete                  | Propósito                    |
| ------------------------ | ---------------------------- |
| `@leadcrm/db`            | Prisma Client + schema       |
| `@leadcrm/ui`            | Componentes UI reutilizables |
| `@leadcrm/config-ts`     | Bases tsconfig               |
| `@leadcrm/config-eslint` | Reglas ESLint compartidas    |

## ⚙️ Variables de Entorno (mínimas)

Crear `.env` en la raíz (ver `.env.example` y archivos específicos en cada app si aplica):

```bash
# DB
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

# Clerk
CLERK_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."

# (Opcional) IA
OPENAI_API_KEY="sk-..."

# WhatsApp (si se usan sesiones nombradas)
WHATSAPP_SESSION_DIR="./.wwebjs_sessions"
```

Asegurar no commitear secretos: `.env` está en `.gitignore`.

## 🚀 Inicio Rápido

### 1. Clonar & Dependencias

```bash
git clone https://github.com/Exceptia-co/LeadsAgent.git
cd LeadsAgent
pnpm install
```

### 2. Configurar Entornos

```bash
cp .env.example .env
# Editar credenciales reales
```

### 3. Generar Prisma Client (si se modificó el schema)

```bash
pnpm db:generate
```

### 4. Desarrollo

```bash
pnpm dev           # Arranca todos los servicios
# Puertos:
# dashboard:      3000
# docs (si se usa): 3001
# whatsapp-service: 3002
# api (NestJS):   3003
```

### 5. Build

```bash
pnpm build            # Build completo (respeta dependencias turbo)
pnpm build:fast       # Variante paralela
pnpm build:production # Producción (optimizada)
```

### 6. Testing & Calidad

```bash
pnpm test          # Todos
pnpm test:e2e      # E2E API
pnpm lint
pnpm typecheck
pnpm format
```

## 🧪 Estrategia de Testing

- Unit (servicios Nest, hooks frontend)
- Integration (Supertest sobre endpoints API)
- E2E (flujo principal leads)
- Cobertura objetivo ≥ 80% en lógica crítica (`pnpm test:cov`)

## 📱 Integración WhatsApp (apps/whatsapp-service)

Características actuales:

- Sesiones múltiples con persistencia (archivos).
- Generación y stream de QR.
- Envío de texto y media (ejemplos en `send-video-example.sh`).
- Endpoints REST + eventos (plan: webhook → API → DB → UI).
- Reconexión automática.

Script rápido de prueba:

```bash
cd apps/whatsapp-service
pnpm dev
# Visitar logs para QR; escanear desde la app móvil.
```

## 👮 Seguridad

- Clerk JWT en API (excepto webhooks).
- Validación DTO con class-validator.
- Sanitización básica en inputs.
- Preparado para RLS en Supabase (activar en despliegue).
- No guardar tokens sensibles en front.

## 🧠 Integración IA (Roadmap)

| Estado | Feature                              |
| ------ | ------------------------------------ |
| ✅     | Infra básica para insertar prompts   |
| 🔄     | Clasificación automática de mensajes |
| 🔄     | Respuestas sugeridas contextuales    |
| ⏳     | Resumen conversacional por lead      |
| ⏳     | Análisis de sentimiento              |

## 🗃️ Base de Datos (resumen)

Modelos clave (ver `packages/db/prisma/schema.prisma`):

- User (Clerk external ID)
- Lead
- Message (relación directa Lead)
- Campaign / CampaignLead (M:N)
- Indices planificados en campos de búsqueda (teléfono, estado)

## 🧩 Convenciones

- Código TypeScript estricto.
- Respuestas API: `{ success: boolean, data?, error? }`.
- Nombres: camelCase (vars/funcs), PascalCase (clases/components), archivos TS `kebab-case`.
- Tests backend: `*.spec.ts`.

## 🔁 Comandos Útiles

```bash
pnpm clean:cache     # Limpia cachés turbo + node_modules parciales
pnpm rebuild         # Reconstrucción completa
pnpm db:migrate:dev  # Nueva migración desarrollo
pnpm db:studio       # Prisma Studio
```

## 📖 Documentación Adicional

| Archivo                               | Descripción                      |
| ------------------------------------- | -------------------------------- |
| `AGENTS.md`                           | Guía de agentes y flujo asistido |
| `docs/PROJECT_STATUS.md`              | Estado detallado                 |
| `docs/OPTIMIZATIONS.md`               | Optimizaciones aplicadas         |
| `docs/SECURITY.md`                    | Consideraciones de seguridad     |
| `docs/AUTHENTICATION.md`              | Integración Clerk                |
| `docs/supabase-setup-instructions.md` | Setup DB remoto                  |

## 🗺️ Roadmap (Resumen)

- [x] Monorepo + Infra básica
- [x] Dashboard MVP + Auth
- [x] Servicio WhatsApp inicial
- [x] API NestJS integrada
- [ ] Webhook bidireccional mensajes → DB → UI
- [ ] IA: clasificación y sugerencias
- [ ] Métricas avanzadas (conversiones, funnels)
- [ ] Multi-tenant / roles

## 🏆 Estado

MVP funcional:

- ✅ Dashboard + Auth + Gestión básica leads
- ✅ Servicio WhatsApp estable (sesiones + envío)
- ✅ API NestJS modular
- 🔄 En progreso: Sincronización completa mensajes & IA

Última actualización: Agosto 2025

## 🤝 Contribuir

1. Crear rama: `feature/<nombre>` o `fix/<issue>`
2. Añadir/actualizar tests
3. Ejecutar: `pnpm lint && pnpm typecheck && pnpm test`
4. Abrir PR con descripción clara (screenshots si UI)

Commit format (Conventional):

```
feat(leads): add automatic classification draft
fix(api): correct message status mapping
```

## 📜 Licencia

Pendiente de definición (añadir LICENSE antes de release público).

---

¿Falta algo específico? Abrir issue o actualizar `PROJECT_STATUS.md`.
