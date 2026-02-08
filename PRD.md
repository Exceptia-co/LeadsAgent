# PRD — LeadsCRM Dashboard Improvement Plan

> **Versión:** 1.0  
> **Fecha:** 8 de Febrero de 2026  
> **Proyecto:** LeadsCRM — AI-Powered CRM with WhatsApp Automation  
> **Versión actual del producto:** v2.2.0  
> **Autor:** Análisis cruzado Gemini 2.0-flash + OpenAI Codex + auditoría manual del codebase  
> **Equipo:** 1 desarrollador

---

## 1. Resumen Ejecutivo

LeadsCRM es un CRM con integración de WhatsApp e IA construido sobre un monorepo Turborepo (Next.js 14 + NestJS + Prisma/PostgreSQL). El producto está en fase MVP funcional con 9 páginas de dashboard, autenticación Clerk, mensajería WhatsApp en tiempo real y asistente IA multi-proveedor.

Este PRD documenta **17 tareas de mejora** organizadas en **5 fases**, identificadas a través de un análisis cruzado entre Gemini, Codex y una auditoría manual del código fuente. El objetivo es evolucionar el MVP a un producto robusto, mantenible y escalable sin perder velocidad de desarrollo.

### Objetivos principales

1. **Eliminar deuda técnica crítica** — 7 de 9 archivos de página superan 600 líneas (total: 7,048 líneas)
2. **Completar el backend** — 3 modelos de Prisma sin endpoints API (knowledge base, AI config, user settings)
3. **Mejorar la experiencia de usuario** — Dark mode, breadcrumbs, estados consistentes, accesibilidad
4. **Preparar para escala** — Code-splitting, virtualización, estrategia de caché, notificaciones real-time

---

## 2. Contexto y Estado Actual

### 2.1 Stack Tecnológico

| Capa      | Tecnología                                                                              |
| --------- | --------------------------------------------------------------------------------------- |
| Frontend  | Next.js 14.2.15 (App Router), React 18, Tailwind CSS, Radix UI, CVA, Framer Motion, SWR |
| Backend   | NestJS, Prisma ORM, PostgreSQL (Supabase), Swagger                                      |
| Auth      | Clerk (`@clerk/nextjs` v6.36.10, `@clerk/backend`)                                      |
| Real-time | Socket.IO (client + server)                                                             |
| IA        | OpenAI SDK, multi-proveedor (OpenRouter, Google Gemini)                                 |
| Monorepo  | Turborepo, pnpm 9.0.0                                                                   |
| UI Kit    | Componentes custom siguiendo patrón shadcn/ui + `@leadcrm/ui` compartido                |

### 2.2 Estructura del Monorepo

```
apps/
  dashboard/          → Next.js frontend (puerto 3000)
  api/                → NestJS backend (puerto 3003)
  whatsapp-service/   → Servicio WhatsApp (puerto 3002)
  docs/               → Sitio de documentación
packages/
  db/                 → Prisma schema + client
  ui/                 → Componentes React compartidos
  config-eslint/      → Configuración ESLint compartida
  config-ts/          → Configuración TypeScript compartida
```

### 2.3 Rutas del Dashboard (Estado Actual)

| Ruta                        | Líneas    | Sidebar    | Estado    | Descripción                                                            |
| --------------------------- | --------- | ---------- | --------- | ---------------------------------------------------------------------- |
| `/dashboard`                | 358       | Sí         | Funcional | KPIs básicos de leads, stats con SWR                                   |
| `/dashboard/leads`          | 850       | Sí         | Funcional | CRUD completo, tabla ordenable, búsqueda, paginación, bulk actions     |
| `/dashboard/whatsapp`       | 1,335     | Sí         | Funcional | 6 tabs: sesiones, QR, mensajería, conversaciones, templates, proactivo |
| `/dashboard/messaging`      | 1,116     | No         | Funcional | Mensajería directa (acceso desde /whatsapp)                            |
| `/dashboard/ai`             | 931       | Sí         | Funcional | 6 tabs: proveedores, config, knowledge base, testing, analytics        |
| `/dashboard/templates`      | 738       | No         | Funcional | Gestión CRUD de templates de mensajes                                  |
| `/dashboard/proactive`      | 676       | No         | Funcional | Envío masivo de mensajes proactivos                                    |
| `/dashboard/settings`       | 662       | Sí         | Funcional | Configuración, perfil, preferencias, diagnóstico                       |
| `/dashboard/whatsapp-stats` | 382       | Sí         | Funcional | Logs de decisiones IA (whitelist ALLOWED/BLOCKED)                      |
| **Total**                   | **7,048** | **6 de 9** |           | **7 de 9 archivos superan 600 líneas**                                 |

### 2.4 Endpoints API Existentes

| Controlador           | Prefijo         | Endpoints                                                                                 | Auth      |
| --------------------- | --------------- | ----------------------------------------------------------------------------------------- | --------- |
| AppController         | `/`             | `GET /`, `GET /health`                                                                    | No        |
| LeadsController       | `/leads`        | `POST`, `GET`, `GET /stats`, `GET /:id`, `PATCH /:id`, `PATCH /:id/status`, `DELETE /:id` | Clerk JWT |
| PublicLeadsController | `/public/leads` | `GET /stats`, `GET`, `POST`, `PATCH /:id/whatsapp`                                        | No        |
| WhatsAppController    | `/whatsapp`     | `POST /webhook`, `POST /send`, `GET /whitelist/stats`, `POST /whitelist/authorize`        | Parcial   |

### 2.5 Modelos Prisma (10 modelos, 4 enums)

| Modelo               | Tiene API | Estado                               |
| -------------------- | --------- | ------------------------------------ |
| User                 | No        | Campo `settings Json?` sin endpoint  |
| Lead                 | Sí        | CRUD completo                        |
| Message              | Parcial   | Solo via WhatsApp controller         |
| MessageTemplate      | No        | Sin CRUD API                         |
| ProactiveMessage     | No        | Sin CRUD API                         |
| WhatsAppConversation | No        | Sin CRUD API                         |
| WhatsAppSession      | Parcial   | Via WhatsApp service                 |
| WhatsAppWhitelistLog | Sí        | GET stats + POST authorize           |
| ai_configuration     | No        | Sin CRUD API — tabla sin controlador |
| ai_knowledge_base    | No        | Sin CRUD API — tabla sin controlador |

### 2.6 Diseño Visual Actual

- **Color primario:** Verde `hsl(142, 76%, 36%)` (light) / `hsl(142, 76%, 46%)` (dark)
- **Tema:** Claro con `bg-gray-50`, cards blancos `rounded-2xl`, sombras sutiles
- **Botones:** Pill-shaped (`rounded-full`), verde primario
- **Landing page:** Tema oscuro/negro con acentos verdes, spotlight effects, grid backgrounds
- **Dark mode:** Variables CSS definidas pero sin toggle implementado
- **Idioma UI:** Español completo

---

## 3. Análisis de Problemas

### 3.1 Problemas de Arquitectura (Severidad: Alta)

| ID     | Problema                                                                                                             | Impacto                                           | Archivos afectados                                                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| ARQ-01 | **Archivos monolíticos** — 7 de 9 páginas superan 600 líneas. El mayor tiene 1,335 líneas                            | Mantenibilidad, rendimiento, testing, code review | `whatsapp/page.tsx`, `messaging/page.tsx`, `ai/page.tsx`, `leads/page.tsx`, `templates/page.tsx`, `proactive/page.tsx`, `settings/page.tsx` |
| ARQ-02 | **Sin `loading.tsx` ni `error.tsx`** — 0 archivos de error handling del App Router                                   | UX en estados de carga/error, no hay fallbacks    | Todos los segmentos de ruta                                                                                                                 |
| ARQ-03 | **Sin regla ESLint de max-lines** — No hay prevención de futuros archivos monolíticos                                | Regresión continua de la deuda técnica            | Configuración ESLint                                                                                                                        |
| ARQ-04 | **3 páginas fuera del sidebar** — `/messaging`, `/proactive`, `/templates` existen pero no tienen navegación directa | Discoverability, posible código muerto            | `dashboard/layout.tsx`                                                                                                                      |

### 3.2 Problemas de Backend (Severidad: Alta)

| ID     | Problema                                                                                             | Impacto                                                                    | Recurso                      |
| ------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------- |
| API-01 | **Sin endpoint de dashboard overview** — Solo existe `/leads/stats`. No hay agregación cross-domain  | La página overview solo muestra stats de leads, no mensajes, sesiones o IA | Necesita nuevo endpoint      |
| API-02 | **Sin CRUD de AI Knowledge Base** — Modelo `ai_knowledge_base` existe en Prisma pero sin controlador | Frontend muestra datos mock/hardcodeados                                   | Necesita nuevo módulo NestJS |
| API-03 | **Sin CRUD de AI Configuration** — Modelo `ai_configuration` existe sin API                          | Configuración IA no persiste correctamente                                 | Necesita nuevo módulo NestJS |
| API-04 | **Sin endpoint de User Settings** — Campo `settings Json?` en modelo User sin API                    | Settings page no puede persistir preferencias al backend                   | Necesita nuevo endpoint      |
| API-05 | **Sin CRUD de Message Templates** — Modelo existe sin controlador dedicado                           | Templates se gestionan sin persistencia backend adecuada                   | Necesita nuevo módulo NestJS |

### 3.3 Problemas de UX (Severidad: Media)

| ID    | Problema                                                                                               | Impacto                                                    |
| ----- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| UX-01 | **Dark mode sin toggle** — CSS variables definidas en `globals.css` pero sin mecanismo de activación   | Usuarios no pueden cambiar tema, variables desperdiciadas  |
| UX-02 | **Sin breadcrumbs** — Navegación solo por sidebar, sin indicador de ubicación en rutas profundas       | Desorientación en páginas con muchos tabs                  |
| UX-03 | **Estados inconsistentes** — Cada página implementa loading/error/empty states de forma diferente      | Experiencia fragmentada, código duplicado                  |
| UX-04 | **Sin notificaciones real-time** — WebSocket existe para estado de sesión pero no para nuevos mensajes | Usuarios no se enteran de mensajes entrantes sin refrescar |

### 3.4 Problemas de Rendimiento (Severidad: Baja)

| ID      | Problema                                                                                 | Impacto                               |
| ------- | ---------------------------------------------------------------------------------------- | ------------------------------------- |
| PERF-01 | **Sin code-splitting** — Charts, modales y componentes pesados se cargan todos al inicio | First Load JS innecesariamente grande |
| PERF-02 | **Sin virtualización de listas** — Tablas renderizan todos los rows en DOM               | Degradación con datasets grandes      |
| PERF-03 | **Sin bundle analysis** — No hay visibilidad del tamaño del bundle                       | Imposible optimizar sin medir         |

---

## 4. Fases de Implementación

### Phase 1: Arquitectura y Deuda Técnica

> **Objetivo:** Eliminar la deuda técnica que frena el desarrollo y prevenir regresión.  
> **Duración estimada:** 2-3 semanas  
> **Prioridad:** Alta  
> **Dependencias:** Ninguna

#### Tarea 1.1 — Refactorizar páginas monolíticas

**Problema:** ARQ-01  
**Archivos afectados:** 7 páginas con más de 600 líneas

**Plan de extracción por página:**

```
dashboard/whatsapp/page.tsx (1,335 líneas) →
  ├── components/whatsapp/WhatsAppSessions.tsx
  ├── components/whatsapp/WhatsAppQRScanner.tsx
  ├── components/whatsapp/WhatsAppMessaging.tsx
  ├── components/whatsapp/WhatsAppConversationList.tsx
  ├── components/whatsapp/WhatsAppTemplates.tsx
  ├── components/whatsapp/WhatsAppProactive.tsx
  └── whatsapp/page.tsx (~100 líneas: imports, tabs, layout)

dashboard/messaging/page.tsx (1,116 líneas) →
  ├── components/messaging/ConversationSidebar.tsx
  ├── components/messaging/MessageThread.tsx
  ├── components/messaging/MessageComposer.tsx
  ├── components/messaging/ContactInfo.tsx
  └── messaging/page.tsx (~80 líneas)

dashboard/ai/page.tsx (931 líneas) →
  ├── components/ai/AIProviders.tsx
  ├── components/ai/AIConfiguration.tsx
  ├── components/ai/AIKnowledgeBase.tsx
  ├── components/ai/AITestingPlayground.tsx
  ├── components/ai/AIAnalytics.tsx
  └── ai/page.tsx (~80 líneas)

dashboard/leads/page.tsx (850 líneas) →
  ├── components/leads/LeadsTable.tsx
  ├── components/leads/LeadsFilters.tsx
  ├── components/leads/LeadsBulkActions.tsx
  ├── components/leads/LeadsStatsCards.tsx
  └── leads/page.tsx (~80 líneas)

dashboard/templates/page.tsx (738 líneas) →
  ├── components/templates/TemplateList.tsx
  ├── components/templates/TemplateEditor.tsx
  ├── components/templates/TemplatePreview.tsx
  └── templates/page.tsx (~60 líneas)

dashboard/proactive/page.tsx (676 líneas) →
  ├── components/proactive/ProactiveLeadSelector.tsx
  ├── components/proactive/ProactiveMessageComposer.tsx
  ├── components/proactive/ProactiveHistory.tsx
  └── proactive/page.tsx (~60 líneas)

dashboard/settings/page.tsx (662 líneas) →
  ├── components/settings/SettingsProfile.tsx
  ├── components/settings/SettingsPreferences.tsx
  ├── components/settings/SettingsIntegrations.tsx
  ├── components/settings/SettingsDiagnostics.tsx
  └── settings/page.tsx (~60 líneas)
```

**Criterios de aceptación:**

- [ ] Ningún archivo `page.tsx` supera 150 líneas
- [ ] Ningún componente extraído supera 300 líneas
- [ ] Toda la funcionalidad existente se preserva sin regresiones
- [ ] Los imports son limpios y sin dependencias circulares
- [ ] Tests existentes siguen pasando

---

#### Tarea 1.2 — Agregar App Router error handling

**Problema:** ARQ-02  
**Archivos a crear:**

```
dashboard/
  ├── loading.tsx          → Skeleton del layout principal
  ├── error.tsx            → Error boundary con botón de reintento
  ├── not-found.tsx        → Página 404 con link a dashboard
  ├── leads/
  │   ├── loading.tsx      → Skeleton de tabla de leads
  │   └── error.tsx
  ├── whatsapp/
  │   ├── loading.tsx      → Skeleton de tabs WhatsApp
  │   └── error.tsx
  ├── ai/
  │   ├── loading.tsx      → Skeleton de tabs IA
  │   └── error.tsx
  ├── settings/
  │   ├── loading.tsx
  │   └── error.tsx
  └── [resto de rutas]/
      ├── loading.tsx
      └── error.tsx
```

**Criterios de aceptación:**

- [ ] Cada segmento de ruta tiene `loading.tsx` con skeletons que coinciden con la estructura real de la página
- [ ] Cada segmento tiene `error.tsx` con error boundary, mensaje descriptivo y botón de reintento
- [ ] Existe `not-found.tsx` global bajo `/dashboard` con navegación de vuelta
- [ ] Los skeletons usan los componentes `Skeleton*` existentes en `components/ui/skeleton.tsx`

---

#### Tarea 1.3 — Regla ESLint max-lines

**Problema:** ARQ-03

**Implementación:**

- Agregar regla `max-lines` a la configuración ESLint compartida (`packages/config-eslint/`)
- Límite: 300 líneas por archivo para componentes, 150 para páginas
- Warning (no error) para permitir migración gradual

**Criterios de aceptación:**

- [ ] Regla `max-lines` configurada con `warn` a 300 líneas
- [ ] Regla aplicada a archivos `.tsx` y `.ts` en `apps/dashboard/`
- [ ] `pnpm lint` ejecuta sin errores (solo warnings en archivos pendientes de refactor)

---

#### Tarea 1.4 — Resolver páginas huérfanas del sidebar

**Problema:** ARQ-04

**Decisión a tomar:** Las rutas `/messaging`, `/proactive` y `/templates` existen como páginas independientes pero no aparecen en el sidebar. Opciones:

- **Opción A:** Agregarlas al sidebar como sub-items bajo "WhatsApp"
- **Opción B:** Eliminar las rutas independientes y mantenerlas como tabs dentro de `/whatsapp`
- **Opción C:** Mantener como están (acceso indirecto desde `/whatsapp`)

**Recomendación:** Opción A — sidebar con sub-navegación colapsable bajo "WhatsApp".

**Criterios de aceptación:**

- [ ] Todas las páginas funcionales son accesibles desde el sidebar
- [ ] Sub-navegación es clara y no sobrecarga la barra lateral
- [ ] URLs directas siguen funcionando (deep linking)

---

### Phase 2: Backend — Endpoints Faltantes

> **Objetivo:** Crear la superficie API necesaria para soportar funcionalidad frontend completa.  
> **Duración estimada:** 2-3 semanas  
> **Prioridad:** Alta  
> **Dependencias:** Ninguna (puede ejecutarse en paralelo con Phase 1)

#### Tarea 2.1 — Endpoint de Dashboard Overview

**Problema:** API-01

**Endpoint:** `GET /api/dashboard/overview`  
**Auth:** Clerk JWT requerido  
**Response:**

```json
{
  "success": true,
  "data": {
    "leads": {
      "total": 150,
      "byStatus": {
        "NUEVO": 45,
        "CONTACTADO": 30,
        "QUALIFIED": 25,
        "GANADO": 35,
        "PERDIDO": 15
      },
      "averageScore": 72,
      "createdToday": 5,
      "createdThisWeek": 23
    },
    "messages": {
      "totalSent": 1200,
      "totalReceived": 980,
      "sentToday": 45,
      "sentThisWeek": 210
    },
    "whatsapp": {
      "activeSessions": 2,
      "totalConversations": 340,
      "conversationsToday": 12
    },
    "ai": {
      "totalTokensUsed": 125000,
      "requestsToday": 34,
      "successRate": 0.94
    },
    "recentActivity": [
      {
        "type": "lead_created",
        "description": "Nuevo lead: Juan Pérez",
        "timestamp": "2026-02-08T10:30:00Z"
      },
      {
        "type": "message_sent",
        "description": "Mensaje enviado a +34...",
        "timestamp": "2026-02-08T10:25:00Z"
      }
    ]
  }
}
```

**Implementación NestJS:**

- Crear `DashboardModule` con `DashboardController` y `DashboardService`
- El service agrega datos de `LeadsService`, `PrismaService` (queries directas para mensajes, sesiones, IA)
- Cachear response por 30 segundos para evitar queries pesados

**Criterios de aceptación:**

- [ ] Endpoint devuelve datos agregados de leads, mensajes, WhatsApp e IA
- [ ] Datos filtrados por `assignedUserId` del JWT (multi-tenant ready)
- [ ] Response time < 500ms
- [ ] Incluye actividad reciente (últimos 10 eventos)
- [ ] Tests unitarios del service con mocks de Prisma
- [ ] Documentado en Swagger

---

#### Tarea 2.2 — CRUD de AI Knowledge Base

**Problema:** API-02

**Endpoints:**

| Método   | Ruta                         | Descripción                                                    |
| -------- | ---------------------------- | -------------------------------------------------------------- |
| `GET`    | `/api/ai/knowledge-base`     | Listar entradas (con paginación, filtro por categoría/keyword) |
| `GET`    | `/api/ai/knowledge-base/:id` | Obtener entrada por ID                                         |
| `POST`   | `/api/ai/knowledge-base`     | Crear nueva entrada                                            |
| `PATCH`  | `/api/ai/knowledge-base/:id` | Actualizar entrada                                             |
| `DELETE` | `/api/ai/knowledge-base/:id` | Eliminar entrada                                               |

**DTOs (class-validator):**

```typescript
class CreateKnowledgeBaseDto {
  @IsString() @IsNotEmpty() title: string;
  @IsString() @IsNotEmpty() content: string;
  @IsString() @IsNotEmpty() category: string;
  @IsArray() @IsString({ each: true }) @IsOptional() keywords?: string[];
  @IsInt() @Min(1) @Max(10) @IsOptional() priority?: number;
  @IsBoolean() @IsOptional() is_active?: boolean;
}
```

**Criterios de aceptación:**

- [ ] CRUD completo funcional con validación de DTOs
- [ ] Paginación con `skip/take` y total count
- [ ] Filtro por `category`, `is_active`, búsqueda por `keywords`
- [ ] Auth Clerk JWT requerido en todos los endpoints
- [ ] Tests unitarios del service
- [ ] Documentado en Swagger

---

#### Tarea 2.3 — CRUD de AI Configuration

**Problema:** API-03

**Endpoints:**

| Método   | Ruta                         | Descripción                      |
| -------- | ---------------------------- | -------------------------------- |
| `GET`    | `/api/ai/configuration`      | Obtener toda la configuración    |
| `GET`    | `/api/ai/configuration/:key` | Obtener valor por clave          |
| `PUT`    | `/api/ai/configuration/:key` | Crear/actualizar valor por clave |
| `DELETE` | `/api/ai/configuration/:key` | Eliminar configuración           |

**Criterios de aceptación:**

- [ ] CRUD por clave-valor funcional
- [ ] Validación de claves permitidas (whitelist de config keys)
- [ ] Auth Clerk JWT requerido
- [ ] Tests unitarios
- [ ] Documentado en Swagger

---

#### Tarea 2.4 — Endpoint de User Settings

**Problema:** API-04

**Endpoints:**

| Método  | Ruta                  | Descripción                              |
| ------- | --------------------- | ---------------------------------------- |
| `GET`   | `/api/users/settings` | Obtener settings del usuario autenticado |
| `PATCH` | `/api/users/settings` | Actualizar settings (merge parcial)      |

**Modelo de settings (JSON):**

```json
{
  "theme": "light|dark|system",
  "language": "es",
  "notifications": {
    "email": true,
    "whatsapp": true,
    "newLeads": true,
    "newMessages": true
  },
  "dashboard": {
    "defaultView": "overview",
    "refreshInterval": 30
  }
}
```

**Criterios de aceptación:**

- [ ] GET devuelve settings del usuario autenticado (usa campo `settings Json?` del modelo User)
- [ ] PATCH hace deep merge (no sobrescribe todo el JSON)
- [ ] Valores por defecto si el campo está vacío
- [ ] Auth Clerk JWT requerido
- [ ] Tests unitarios
- [ ] Documentado en Swagger

---

#### Tarea 2.5 — CRUD de Message Templates

**Problema:** API-05

**Endpoints:**

| Método   | Ruta                           | Descripción                             |
| -------- | ------------------------------ | --------------------------------------- |
| `GET`    | `/api/templates`               | Listar templates (filtro por categoría) |
| `GET`    | `/api/templates/:id`           | Obtener template por ID                 |
| `POST`   | `/api/templates`               | Crear template                          |
| `PATCH`  | `/api/templates/:id`           | Actualizar template                     |
| `DELETE` | `/api/templates/:id`           | Eliminar template                       |
| `POST`   | `/api/templates/:id/duplicate` | Duplicar template                       |

**Criterios de aceptación:**

- [ ] CRUD completo con validación de variables (`{{nombre}}`, `{{empresa}}`, etc.)
- [ ] Incremento automático de `usageCount` al usar un template
- [ ] Paginación y filtro por `category`
- [ ] Auth Clerk JWT requerido
- [ ] Tests unitarios
- [ ] Documentado en Swagger

---

### Phase 3: UX y Funcionalidad

> **Objetivo:** Mejorar la experiencia de usuario y completar features incompletas.  
> **Duración estimada:** 2-3 semanas  
> **Prioridad:** Media  
> **Dependencias:** Phase 2 (endpoints backend necesarios)

#### Tarea 3.1 — Implementar Dark Mode

**Problema:** UX-01

**Implementación:**

1. Crear `ThemeContext` con provider en el root layout
2. Toggle component en sidebar (icono sol/luna) y en settings
3. Soporte para 3 modos: `light`, `dark`, `system`
4. Persistir preferencia en `localStorage` (inmediato) + User settings API (sincronización)
5. Aplicar clase `dark` al `<html>` element según selección
6. Las CSS variables ya están definidas en `globals.css` — solo necesitan activación

**Archivos a modificar:**

- `app/layout.tsx` — Agregar ThemeProvider
- `app/globals.css` — Verificar completitud de variables dark
- `dashboard/layout.tsx` — Agregar toggle en sidebar
- `dashboard/settings/page.tsx` — Agregar sección de tema

**Archivos a crear:**

- `contexts/ThemeContext.tsx`
- `components/ui/theme-toggle.tsx`

**Criterios de aceptación:**

- [ ] Toggle funcional con 3 modos (light/dark/system)
- [ ] Preferencia persiste entre sesiones (localStorage)
- [ ] Sin flash de tema incorrecto al cargar (FOUC prevention)
- [ ] Todos los componentes UI se ven correctos en dark mode
- [ ] Landing page no se ve afectada (ya tiene tema oscuro propio)

---

#### Tarea 3.2 — Mejorar Dashboard Overview

**Problema:** La página `/dashboard` existe pero solo muestra stats básicas de leads.

**Mejoras:**

1. Agregar sección de **pipeline visual** (funnel de leads por status)
2. Agregar **stats de WhatsApp** (sesiones activas, mensajes hoy)
3. Agregar **stats de IA** (tokens usados, requests, success rate)
4. Agregar **actividad reciente** (timeline de últimos eventos)
5. Agregar **acciones rápidas** (CTAs: nuevo lead, enviar mensaje, ver conversaciones)
6. Conectar con el nuevo endpoint `GET /api/dashboard/overview` (Tarea 2.1)

**Criterios de aceptación:**

- [ ] Dashboard muestra KPIs cross-domain (leads + mensajes + WhatsApp + IA)
- [ ] Pipeline visual muestra distribución de leads por status
- [ ] Actividad reciente muestra últimos 10 eventos con timestamps
- [ ] Acciones rápidas permiten navegación directa a funciones frecuentes
- [ ] Datos se refrescan automáticamente cada 2 minutos (SWR)
- [ ] Skeleton loading mientras carga

---

#### Tarea 3.3 — Conectar Knowledge Base con API real

**Problema:** UI de knowledge base muestra datos mock.

**Implementación:**

1. Crear hooks SWR: `useKnowledgeBase()`, `useKnowledgeBaseEntry(id)`
2. Reemplazar datos hardcodeados en `ai/page.tsx` (o componente extraído `AIKnowledgeBase.tsx`)
3. Conectar formularios de CRUD con endpoints de Tarea 2.2
4. Agregar búsqueda y filtro por categoría

**Criterios de aceptación:**

- [ ] CRUD completo funciona contra la API real
- [ ] Sin datos mock/hardcodeados en el frontend
- [ ] Búsqueda y filtro funcionales
- [ ] Toast notifications en operaciones CRUD
- [ ] Empty state cuando no hay entradas

---

#### Tarea 3.4 — Conectar AI Configuration con API real

**Problema:** Configuración IA no persiste correctamente.

**Implementación:**

1. Crear hook SWR: `useAIConfiguration()`
2. Conectar formularios de configuración con endpoints de Tarea 2.3
3. Validación client-side antes de enviar

**Criterios de aceptación:**

- [ ] Configuración persiste al recargar la página
- [ ] Cambios se guardan con feedback visual (toast)
- [ ] Validación de campos (temperatura 0-2, max tokens > 0, etc.)

---

#### Tarea 3.5 — Breadcrumbs Navigation

**Problema:** UX-02

**Implementación:**

1. Crear componente `Breadcrumbs` que parse `usePathname()`
2. Mapear rutas a nombres legibles en español
3. Integrar en el layout del dashboard (entre header y content)

**Mapa de rutas:**

```typescript
const routeNames: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/leads": "Leads",
  "/dashboard/whatsapp": "WhatsApp",
  "/dashboard/whatsapp-stats": "Estadísticas IA",
  "/dashboard/ai": "Asistente IA",
  "/dashboard/settings": "Configuración",
  "/dashboard/messaging": "Mensajería",
  "/dashboard/templates": "Templates",
  "/dashboard/proactive": "Mensajes Proactivos",
};
```

**Criterios de aceptación:**

- [ ] Breadcrumbs visibles en todas las páginas del dashboard
- [ ] Cada segmento es clickeable y navega correctamente
- [ ] Se adapta a mobile (trunca si es necesario)
- [ ] Accesible con `aria-label="breadcrumb"` y `nav` semántico

---

### Phase 4: Polish y Accesibilidad

> **Objetivo:** Pulir la experiencia y garantizar accesibilidad.  
> **Duración estimada:** 1-2 semanas  
> **Prioridad:** Media  
> **Dependencias:** Phase 1 (componentes refactorizados) y Phase 3 (dark mode)

#### Tarea 4.1 — Estados UX consistentes

**Problema:** UX-03

**Implementación:**

1. Crear componentes reutilizables:
   - `components/ui/empty-state.tsx` — Icono + título + descripción + CTA
   - `components/ui/error-state.tsx` — Icono error + mensaje + botón reintentar
   - `components/ui/loading-state.tsx` — Wrapper de skeleton patterns
2. Reemplazar implementaciones ad-hoc en cada página por estos componentes
3. Definir patrones de retry con SWR (`onErrorRetry`)

**Criterios de aceptación:**

- [ ] Todas las páginas usan los mismos componentes para empty/error/loading
- [ ] Mensajes de error son descriptivos y en español
- [ ] Botones de retry funcionan correctamente
- [ ] Consistencia visual en todos los estados

---

#### Tarea 4.2 — Optimistic UI en mutaciones

**Problema:** Operaciones CRUD no dan feedback inmediato.

**Implementación:**

1. Usar `mutate()` de SWR para actualizar caché local antes de confirmar con el servidor
2. Revertir en caso de error con toast de notificación
3. Aplicar en: crear/editar/eliminar leads, templates, knowledge base

**Criterios de aceptación:**

- [ ] Crear/editar/eliminar leads se refleja inmediatamente en la UI
- [ ] En caso de error del servidor, los datos se revierten al estado anterior
- [ ] Toast de error explica qué salió mal
- [ ] La experiencia se siente instantánea (<100ms de feedback visual)

---

#### Tarea 4.3 — Auditoría de accesibilidad

**Problema:** No hay garantía de accesibilidad en componentes interactivos.

**Checklist:**

1. **Navegación por teclado** — Todos los elementos interactivos alcanzables con Tab
2. **Focus visible** — Anillos de focus claros en todos los botones, links, inputs
3. **ARIA labels** — Modales, tooltips, dropdowns, tabs con roles y labels correctos
4. **Contraste de color** — Ratio mínimo 4.5:1 en texto, 3:1 en elementos grandes (verificar en dark mode)
5. **Screen reader** — Textos alternativos en iconos, estados anunciados
6. **Skip navigation** — Link "Saltar al contenido" en el layout principal

**Herramientas:**

- Lighthouse accessibility audit
- axe-core devtools
- Pruebas manuales con keyboard-only navigation

**Criterios de aceptación:**

- [ ] Lighthouse accessibility score ≥ 90
- [ ] 0 errores críticos en axe-core
- [ ] Navegación completa posible solo con teclado
- [ ] Contraste cumple WCAG 2.1 AA en ambos temas

---

### Phase 5: Performance y Escalabilidad

> **Objetivo:** Optimizar rendimiento y preparar para escala.  
> **Duración estimada:** 1-2 semanas  
> **Prioridad:** Baja  
> **Dependencias:** Phase 1-4 completadas

#### Tarea 5.1 — Code-splitting con dynamic imports

**Problema:** PERF-01

**Componentes candidatos para lazy loading:**

- Modales: `AddLeadModal`, `EditLeadModal`, `DeleteConfirmDialog`
- Charts/visualizaciones (si se agregan en Phase 3)
- Componentes de landing page (ya no se cargan en dashboard)
- `BulkProactiveMessageSender`
- QR code renderer (`react-qr-code`)

**Implementación:**

```typescript
const AddLeadModal = dynamic(() => import("@/components/AddLeadModal"), {
  loading: () => <Skeleton className="h-96 w-full" />,
});
```

**Criterios de aceptación:**

- [ ] Modales se cargan bajo demanda (solo cuando se abren)
- [ ] First Load JS reducido al menos un 15%
- [ ] No hay impacto visual en la experiencia (loading states en lazy components)
- [ ] Medido con `next/bundle-analyzer`

---

#### Tarea 5.2 — Virtualización de listas

**Problema:** PERF-02

**Implementación:**

- Usar `@tanstack/react-virtual` para virtualizar tablas de leads cuando hay >100 filas
- Aplicar solo si la paginación server-side no es suficiente

**Criterios de aceptación:**

- [ ] Tablas con >500 filas renderizan sin lag
- [ ] Scroll suave y consistente
- [ ] Selection/bulk actions funcionan con filas virtualizadas

---

#### Tarea 5.3 — Notificaciones real-time

**Problema:** UX-04

**Implementación:**

1. Extender el WebSocket existente (Socket.IO) para emitir eventos de:
   - Nuevo mensaje recibido
   - Nuevo lead creado
   - Cambio de estado de sesión WhatsApp
2. Crear componente `NotificationBell` en el header del dashboard
3. Mostrar badge con contador de notificaciones no leídas
4. Dropdown con lista de notificaciones recientes
5. Sonido opcional (configurable en settings)

**Cambios backend:**

- Emitir eventos Socket.IO desde `WhatsAppController` y `LeadsController`
- Definir tipos de eventos compartidos entre client/server

**Criterios de aceptación:**

- [ ] Notificaciones aparecen en <2 segundos después del evento
- [ ] Badge muestra contador correcto
- [ ] Notificaciones son clickeables y navegan al recurso
- [ ] Sonido configurable (on/off en settings)
- [ ] No se pierden notificaciones al navegar entre páginas

---

#### Tarea 5.4 — Bundle analysis y optimización

**Problema:** PERF-03

**Implementación:**

1. Instalar `@next/bundle-analyzer`
2. Agregar script `pnpm analyze` al `package.json` del dashboard
3. Identificar dependencias pesadas y optimizar imports
4. Documentar tamaño baseline y mejoras

**Criterios de aceptación:**

- [ ] Script `pnpm analyze` funcional
- [ ] Baseline de bundle size documentado
- [ ] Sin dependencias duplicadas en el bundle
- [ ] Tree-shaking correcto en lucide-react y Radix UI

---

## 5. Estimaciones de Tiempo (1 Developer)

| Fase                       | Tareas                                                                                                                        | Estimación         | Acumulado                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------ |
| **Phase 1** — Arquitectura | 1.1 Refactor (5d) + 1.2 Error handling (2d) + 1.3 ESLint (0.5d) + 1.4 Sidebar (1d)                                            | **8.5 días**       | 8.5 días                 |
| **Phase 2** — Backend      | 2.1 Dashboard overview (2d) + 2.2 KB CRUD (2d) + 2.3 AI Config (1d) + 2.4 Settings (1.5d) + 2.5 Templates (2d)                | **8.5 días**       | 17 días                  |
| **Phase 3** — UX           | 3.1 Dark mode (2d) + 3.2 Overview mejorado (2d) + 3.3 KB connect (1d) + 3.4 AI config connect (0.5d) + 3.5 Breadcrumbs (0.5d) | **6 días**         | 23 días                  |
| **Phase 4** — Polish       | 4.1 Estados UX (2d) + 4.2 Optimistic UI (2d) + 4.3 Accesibilidad (2d)                                                         | **6 días**         | 29 días                  |
| **Phase 5** — Performance  | 5.1 Code-splitting (1d) + 5.2 Virtualización (1.5d) + 5.3 Notificaciones (3d) + 5.4 Bundle analysis (0.5d)                    | **6 días**         | 35 días                  |
|                            |                                                                                                                               | **Total estimado** | **~7 semanas laborales** |

> **Nota:** Las Phases 1 y 2 pueden ejecutarse en paralelo si el developer alterna entre frontend y backend, reduciendo el timeline total a **~5-6 semanas**.

---

## 6. Riesgos y Mitigaciones

| Riesgo                                                                                  | Probabilidad | Impacto | Mitigación                                                                                          |
| --------------------------------------------------------------------------------------- | ------------ | ------- | --------------------------------------------------------------------------------------------------- |
| **Regresiones al refactorizar** — Romper funcionalidad existente al extraer componentes | Alta         | Alto    | Verificar cada página después del refactor. Agregar tests de humo si no existen                     |
| **Dark mode inconsistente** — Componentes que no se ven bien con tema oscuro            | Media        | Medio   | Auditar cada componente visualmente. Crear checklist de componentes verificados                     |
| **Endpoints lentos** — Dashboard overview con queries pesados de agregación             | Media        | Alto    | Cachear response (30s TTL). Usar queries optimizadas con `select` en Prisma                         |
| **Scope creep** — Agregar features no planificadas durante la implementación            | Alta         | Medio   | Ceñirse estrictamente a este PRD. Nuevos features van a un PRD separado                             |
| **Conflictos de merge** — Refactor masivo genera conflictos con trabajo paralelo        | Baja         | Medio   | Hacer el refactor en una sola branch y merge rápido. No trabajar en paralelo en los mismos archivos |
| **WebSocket scaling** — Notificaciones real-time con muchas conexiones                  | Baja         | Medio   | Socket.IO soporta scaling con Redis adapter. Implementar si se necesita                             |

---

## 7. Métricas de Éxito

### Métricas técnicas

| Métrica                               | Baseline actual | Objetivo post-PRD    |
| ------------------------------------- | --------------- | -------------------- |
| Líneas máximas por archivo `page.tsx` | 1,335           | ≤ 150                |
| Líneas máximas por componente         | N/A             | ≤ 300                |
| Archivos `loading.tsx`                | 0               | 9 (uno por segmento) |
| Archivos `error.tsx`                  | 0               | 9 (uno por segmento) |
| Modelos Prisma sin API                | 5 de 10         | 0 de 10              |
| Lighthouse Accessibility              | No medido       | ≥ 90                 |
| First Load JS                         | No medido       | Reducción ≥ 15%      |

### Métricas de UX

| Métrica                          | Baseline                  | Objetivo                       |
| -------------------------------- | ------------------------- | ------------------------------ |
| Dark mode disponible             | No                        | Sí (3 modos)                   |
| Breadcrumbs                      | No                        | Sí en todas las rutas          |
| Feedback en mutaciones           | Delayed (espera response) | Inmediato (optimistic UI)      |
| Notificaciones real-time         | No                        | Sí (mensajes, leads, sesiones) |
| Páginas con 404                  | 0 (corregido)             | 0                              |
| Páginas accesibles desde sidebar | 6 de 9                    | 9 de 9                         |

### Métricas de desarrollo

| Métrica                           | Baseline                    | Objetivo                          |
| --------------------------------- | --------------------------- | --------------------------------- |
| Tiempo para agregar nueva feature | Alto (archivos monolíticos) | Bajo (componentes modulares)      |
| Cobertura de tests backend        | Parcial                     | ≥ 80% en nuevos endpoints         |
| Documentación Swagger             | Parcial                     | Completa para todos los endpoints |

---

## 8. Fuera de Alcance (Explícitamente Excluido)

Los siguientes items **no están incluidos** en este PRD y requieren documentos separados:

- Migración a Server Components (requiere cambios arquitecturales mayores)
- Internacionalización (i18n) más allá del español
- Testing E2E con Playwright/Cypress
- CI/CD improvements
- Migración de SWR a React Query / TanStack Query
- Mobile app (React Native)
- Multi-tenancy (organizaciones)
- Roles y permisos avanzados
- Integración con otros canales (Telegram, Instagram, Email)
- Analytics avanzados (dashboards con charts interactivos)

---

## Apéndice A: Fuentes del Análisis

Este PRD fue generado mediante un análisis cruzado de tres fuentes:

1. **Google Gemini 2.0-flash** — Análisis de UX y funcionalidad de negocio
2. **OpenAI Codex** — Análisis de arquitectura técnica y rendimiento
3. **Auditoría manual del codebase** — Exploración directa del código fuente, estructura de archivos, endpoints API, esquema Prisma y estado real de cada componente

Las recomendaciones fueron sintetizadas, priorizadas y corregidas donde los modelos IA proporcionaron información incorrecta (ambos reportaron que `/dashboard/page.tsx` y `/dashboard/settings/page.tsx` no existían, cuando sí existen).

---

## Apéndice B: Archivos Clave de Referencia

```
apps/dashboard/app/dashboard/layout.tsx          → Sidebar navigation, providers
apps/dashboard/app/dashboard/page.tsx             → Dashboard overview (a mejorar)
apps/dashboard/app/globals.css                    → CSS variables (incluye dark mode)
apps/dashboard/components/ui/                     → Componentes UI base
apps/dashboard/lib/api.ts                         → Hooks SWR para data fetching
apps/dashboard/types/index.ts                     → TypeScript interfaces
apps/api/src/leads/leads.controller.ts            → API de leads
apps/api/src/whatsapp/whatsapp.controller.ts      → API de WhatsApp
packages/db/prisma/schema.prisma                  → Schema de base de datos
```
