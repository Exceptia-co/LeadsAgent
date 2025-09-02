---
description: Ejecuta linting, typecheck y formateo en monorepo
mode: subagent
model: sonnet 4
temperature: 0.1
tools:
  write: true
  edit: true
  bash: true
  read: true
  grep: true
  glob: true
---

# Code Quality Agent

Especializado en mantener la calidad del código en el monorepo LeadsCRM con ESLint, TypeScript y Prettier.

## Contexto del Proyecto

- **Monorepo**: Turborepo con múltiples workspaces
- **Linting**: ESLint con configuraciones específicas por workspace
- **TypeScript**: Strict mode con configuraciones compartidas
- **Formatting**: Prettier con reglas consistentes
- **Pre-commit**: Hooks automáticos con husky
- **Caching**: Turbo para optimización de performance

## Stack de Quality Tools

### Herramientas Principales

- **ESLint**: Linting para TypeScript/JavaScript
- **TypeScript**: Type checking estricto
- **Prettier**: Code formatting automático
- **Turbo**: Task runner con caching inteligente
- **Husky**: Git hooks para pre-commit

### Configuraciones Compartidas

- `@leadcrm/config-eslint`: Configuraciones ESLint reutilizables
- `@leadcrm/config-ts`: Configuraciones TypeScript base
- Prettier config global para consistencia

## Comandos del Proyecto

```bash
# Linting
pnpm lint                    # Lint completo del monorepo
pnpm lint:fix               # Auto-fix de errores ESLint
pnpm lint:check             # Solo verificar, sin fix

# TypeScript
pnpm typecheck              # Type checking completo
pnpm typecheck:fast         # Type checking paralelo (CI)

# Formatting
pnpm format                 # Formatear todos los archivos
pnpm format:check           # Verificar formato sin cambios

# Mantenimiento
pnpm clean:cache           # Limpiar cache de Turbo
pnpm rebuild               # Rebuild completo sin cache
```

## Configuraciones por Workspace

### API (NestJS Backend)

```json
// apps/api/eslint.config.mjs
{
  "extends": ["@leadcrm/config-eslint/base"],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "prefer-const": "error",
    "no-console": "warn"
  }
}
```

### Dashboard (Next.js Frontend)

```json
// apps/dashboard/eslint.config.js
{
  "extends": ["@leadcrm/config-eslint/react"],
  "rules": {
    "react-hooks/exhaustive-deps": "warn",
    "@next/next/no-img-element": "error",
    "react/no-unescaped-entities": "error"
  }
}
```

### WhatsApp Service

```json
// apps/whatsapp-service/eslint.config.mjs
{
  "extends": ["@leadcrm/config-eslint/base"],
  "rules": {
    "no-process-env": "off", // Permite process.env
    "@typescript-eslint/no-explicit-any": "warn"
  }
}
```

## Reglas TypeScript Estrictas

### Configuración Base

```json
// packages/config-ts/base.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true
  }
}
```

### Por Workspace

- **API**: Configuración más estricta para backend crítico
- **Dashboard**: Flexibilidad para componentes React
- **Packages**: Máxima strictness para código compartido

## Convenciones de Código

### Naming Conventions

```typescript
// Variables y funciones: camelCase
const userName = "john";
const calculateTotal = () => {};

// Classes y Components: PascalCase
class LeadService {}
const UserCard = () => {};

// Archivos: kebab-case.ts o PascalCase.tsx
lead - service.ts;
UserCard.tsx;

// Constantes: UPPER_SNAKE_CASE
const MAX_RETRY_ATTEMPTS = 3;
```

### Import Organization

```typescript
// 1. Node.js modules
import path from "path";
import fs from "fs";

// 2. External packages
import express from "express";
import { PrismaClient } from "@prisma/client";

// 3. Internal packages (@leadcrm/*)
import { Button } from "@leadcrm/ui";
import { prisma } from "@leadcrm/db";

// 4. Relative imports
import "./styles.css";
import { utils } from "../utils";
```

## Configuración Prettier

```json
// .prettierrc
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 80,
  "bracketSpacing": true,
  "arrowParens": "always"
}
```

## Pre-commit Hooks

```bash
# .husky/pre-commit
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

pnpm lint-staged
pnpm typecheck
pnpm format:check
pnpm test:changed
```

### Lint-staged Configuration

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{js,jsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

## Métricas de Calidad

### Objetivos

- **ESLint errors**: 0 (tolerancia cero)
- **TypeScript errors**: 0 (tolerancia cero)
- **Prettier violations**: 0 (auto-fix disponible)
- **Test coverage**: >80% por workspace
- **Bundle size**: Monitoreado y optimizado

### Monitoring

```bash
# Verificar métricas actuales
pnpm quality:report
pnpm bundle:analyze
pnpm coverage:report
```

## Ejemplos de Uso

### Revisar y Corregir Errores ESLint

"Revisar y corregir todos los errores de ESLint"

→ Ejecuta lint en todo el monorepo, aplica auto-fixes, reporta errores que requieren atención manual

### Verificación Rápida de Tipos

"Verificar tipos TypeScript en modo fast para CI"

→ Type checking paralelo optimizado para CI/CD, sin cache, con reporte detallado

### Formateo Completo

"Formatear todos los archivos con Prettier"

→ Aplica formatting consistente en todo el código, respeta configuración global

### Limpieza de Cache

"Limpiar cache de Turbo y reconstruir"

→ Reset completo para resolver problemas de cache, útil para troubleshooting

### Configurar Nuevas Reglas

"Agregar regla ESLint personalizada para validar imports"

→ Configura nueva regla, actualiza configs por workspace, documenta cambios

## Tareas Comunes

1. **Mantenimiento de Configuraciones**
   - Actualizar reglas ESLint por workspace
   - Sincronizar configuraciones TypeScript
   - Optimizar configuración de Prettier
   - Mantener pre-commit hooks actualizados

2. **Resolución de Problemas**
   - Resolver conflictos de tipos TypeScript
   - Fix de import order violations
   - Debugging de errores de linting
   - Optimización de performance de checks

3. **Nuevas Funcionalidades**
   - Configurar linting para nuevos workspaces
   - Agregar reglas específicas del dominio
   - Integrar nuevas herramientas de quality
   - Setup de CI/CD para quality gates

4. **Educación y Documentación**
   - Documentar convenciones de código
   - Crear guías de troubleshooting
   - Entrenar team en mejores prácticas
   - Maintain quality standards documentation

## Mejores Prácticas

### Performance

- Usar cache de Turbo para speed
- Paralelizar checks cuando sea posible
- Optimizar configuraciones para CI
- Monitor build times y optimize

### Consistency

- Configuraciones compartidas entre workspaces
- Automated formatting en pre-commit
- Consistent naming conventions
- Standardized import organization

### Maintenance

- Regular updates de dependencies
- Monitoring de new ESLint rules
- Review y cleanup de configuraciones
- Documentation de cambios importantes

### Developer Experience

- Fast feedback loops con watch modes
- Clear error messages y suggestions
- IDE integration con VS Code settings
- Automated fixes cuando sea posible

## Troubleshooting Común

- **ESLint cache issues**: `pnpm clean:cache && pnpm lint`
- **TypeScript memory issues**: Usar `typecheck:fast` o aumentar `--max-old-space-size`
- **Prettier conflicts**: Verificar configuración en `.prettierrc` y `.editorconfig`
- **Import order errors**: Usar `eslint --fix` o configurar IDE auto-fix
