# OpenCode Agents for LeadsCRM

Este directorio contiene los agentes especializados para OpenCode, convertidos al formato Markdown requerido.

## Agentes Disponibles

### Backend & Database

- **[lead-manager.md](./lead-manager.md)** - Gestión de leads con clasificación IA
- **[api-tester.md](./api-tester.md)** - Testing de APIs NestJS con Jest/Supertest
- **[database.md](./database.md)** - Gestión Prisma y migraciones PostgreSQL

### Frontend & Integration

- **[ui-component.md](./ui-component.md)** - Componentes React con shadcn/ui y Tailwind
- **[whatsapp.md](./whatsapp.md)** - Integración WhatsApp y manejo de sesiones

### DevOps & Quality

- **[code-quality.md](./code-quality.md)** - Linting, TypeScript y formateo
- **[security-audit.md](./security-audit.md)** - Auditoría de seguridad y auth Clerk

### AI & Enhancement

- **[ai-enhancement.md](./ai-enhancement.md)** - Integración OpenAI y clasificación automática

### Agentes Generalistas

- **[general-purpose.md](./general-purpose.md)** - Agente versátil para tareas generales de desarrollo.
- **[code-refactor.md](./code-refactor.md)** - Especializado en mejorar la calidad y estructura del código.
- **[docs-writer.md](./docs-writer.md)** - Dedicado a la creación y mantenimiento de documentación.

## Uso con OpenCode

### Invocación Manual

Puedes invocar agentes específicos usando `@` mention:

```bash
@lead-manager "Crear lead desde WhatsApp +34123456789"
@ui-component "Crear tabla de leads con filtros avanzados"
@code-refactor "Refactoriza el servicio de leads para mejorar su legibilidad"
```

### Invocación Automática

Los agentes primarios pueden invocar subagentes automáticamente basado en el contexto de la tarea.

### Navegación entre Sesiones

- **Ctrl+Right**: Navegar entre sesión padre e hijas
- **Ctrl+Left**: Navegación inversa
- **Tab**: Cambiar entre agentes primarios

## Formato OpenCode

Cada agente sigue la estructura requerida:

```markdown
---
description: Descripción clara del propósito del agente
mode: subagent | primary | all
model: sonnet 4
temperature: 0.1-0.7
tools:
  write: true|false
  edit: true|false
  bash: true|false
  read: true|false
  grep: true|false
  glob: true|false
---

# Contenido del agente en Markdown
```

## Configuración del Proyecto

Los agentes están optimizados para el stack LeadsCRM:

### Tecnologías

- **Frontend**: Next.js 15, React 18, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: NestJS, Prisma, PostgreSQL (Supabase), Clerk Auth
- **WhatsApp**: whatsapp-web.js, Express, Multer
- **AI**: OpenAI GPT-4, clasificación automática
- **DevOps**: Turborepo, ESLint, Prettier, Jest, Supertest

### Comandos Principales

```bash
# Desarrollo
pnpm dev:dashboard    # Next.js frontend (puerto 3000)
pnpm dev:api         # NestJS backend (puerto 3003)
pnpm dev:whatsapp    # WhatsApp service (puerto 3002)

# Testing
pnpm test            # Todos los tests
pnpm test:e2e        # Tests E2E
pnpm test:cov        # Coverage

# Quality
pnpm lint           # ESLint
pnpm typecheck      # TypeScript
pnpm format         # Prettier

# Database
pnpm db:generate    # Generar cliente Prisma
pnpm db:migrate:dev # Aplicar migraciones
pnpm db:studio      # Abrir Prisma Studio
```

### Variables de Entorno

```bash
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
CLERK_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
OPENAI_API_KEY="sk-..."
```

## Migración desde YAML

Los agentes fueron migrados desde `.opencode/agents/` (formato YAML) a `.opencode/agent/` (formato Markdown) para compatibilidad con OpenCode.

### Cambios Principales

- **Formato**: YAML → Markdown con frontmatter
- **Ubicación**: `agents/` → `agent/`
- **Estructura**: Frontmatter + contenido Markdown
- **Tools**: Booleanos específicos vs lista genérica
- **Mode**: Especificación explícita de primary/subagent

## Personalización

Cada agente puede ser personalizado:

1. **Modificar frontmatter** para cambiar configuración
2. **Actualizar contenido** para agregar nuevos ejemplos
3. **Ajustar tools** según necesidades específicas
4. **Cambiar temperature** para diferentes niveles de creatividad

## Troubleshooting

### Agent no reconocido

- Verificar que está en `.opencode/agent/` (sin 's')
- Comprobar sintaxis del frontmatter YAML
- Validar que el campo `description` esté presente

### Tools no disponibles

- Revisar configuración `tools` en frontmatter
- Verificar permisos en configuración global
- Comprobar que OpenCode tiene acceso a las herramientas

### Performance lento

- Ajustar `temperature` para respuestas más deterministas
- Usar modelo más rápido (claude-haiku) para tareas simples
- Optimizar prompts para ser más específicos
