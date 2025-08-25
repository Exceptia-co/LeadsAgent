# 📝 ESLint Config - Configuración Compartida

Paquete de configuración ESLint compartida para el monorepo LeadsAgent. Proporciona reglas de linting consistentes para todos los proyectos TypeScript y JavaScript.

## 🎯 Propósito

Este paquete centraliza la configuración de ESLint para mantener estándares de código consistentes en:

- ✅ **Dashboard** (Next.js + TypeScript)
- ✅ **API Backend** (NestJS + TypeScript) 
- ✅ **WhatsApp Service** (Node.js + TypeScript)
- ✅ **Docs App** (Next.js + TypeScript)

## 📦 Configuraciones Incluidas

### Base Configuration
```json
"@leadsagent/eslint-config/library"
```
- Reglas básicas para librerías TypeScript
- Configuración para Node.js
- Reglas de importación y exportación

### Next.js Configuration  
```json
"@leadsagent/eslint-config/next"
```
- Reglas específicas para Next.js
- Optimizaciones para React 18
- Configuración para TypeScript estricto

### NestJS Configuration
```json
"@leadsagent/eslint-config/nestjs"
```
- Reglas para decoradores de NestJS
- Configuración para inyección de dependencias
- Validación de DTOs y controladores

## 🔧 Uso

### Instalación

```bash
# Ya está incluido en el workspace
# Se instala automáticamente con pnpm install
```

### Configuración en .eslintrc.json

#### Para Apps Next.js (Dashboard, Docs)
```json
{
  "extends": ["@leadsagent/eslint-config/next"]
}
```

#### Para Backend NestJS
```json
{
  "extends": ["@leadsagent/eslint-config/nestjs"]
}
```

#### Para Servicios Node.js
```json
{
  "extends": ["@leadsagent/eslint-config/library"]
}
```

## 📋 Reglas Principales

### TypeScript
- ✅ Tipado estricto obligatorio
- ✅ No uso de `any` sin justificación
- ✅ Imports organizados alfabéticamente
- ✅ Interfaces con prefijo `I` opcional

### Code Style
- ✅ Indentación: 2 espacios
- ✅ Comillas simples para strings
- ✅ Punto y coma obligatorio
- ✅ Trailing commas permitidos

### React/Next.js Específico
- ✅ Hooks rules enforcement
- ✅ JSX props naming (camelCase)
- ✅ Component naming (PascalCase)
- ✅ Optimización de imágenes Next.js

### NestJS Específico
- ✅ Decoradores obligatorios en controladores
- ✅ Inyección de dependencias validada
- ✅ DTOs con validation decorators
- ✅ Naming convention para servicios

## 🚨 Comandos de Linting

```bash
# Ejecutar linting en todo el monorepo
pnpm lint

# Ejecutar linting con fix automático
pnpm lint:fix

# Linting por app específica
pnpm lint:dashboard
pnpm lint:api
pnpm lint:whatsapp
pnpm lint:docs
```

## ⚙️ Personalización

### Agregar Reglas Personalizadas

Para agregar reglas específicas a un proyecto:

```json
{
  "extends": ["@leadsagent/eslint-config/next"],
  "rules": {
    "custom-rule": "error"
  }
}
```

### Ignorar Archivos

Crear `.eslintignore` en la raíz del proyecto:

```bash
node_modules/
dist/
build/
.next/
coverage/
*.config.js
```

## 🧪 Integración con Herramientas

### VS Code

Extensión recomendada: **ESLint** by Microsoft

Configuración en `.vscode/settings.json`:
```json
{
  "eslint.workingDirectories": [
    "apps/dashboard",
    "apps/api",
    "apps/whatsapp-service",
    "apps/docs"
  ],
  "eslint.validate": [
    "typescript",
    "typescriptreact",
    "javascript",
    "javascriptreact"
  ]
}
```

### Pre-commit Hooks

Configuración con Husky:
```bash
# .husky/pre-commit
npx lint-staged
```

```json
// package.json
"lint-staged": {
  "*.{ts,tsx,js,jsx}": [
    "eslint --fix",
    "prettier --write"
  ]
}
```

## 📊 Estados de Linting

| Aplicación | Estado | Errores | Warnings |
|------------|--------|---------|----------|
| Dashboard | ✅ | 0 | 0 |
| API Backend | ✅ | 0 | 0 |
| WhatsApp Service | ✅ | 0 | 0 |
| Docs App | ✅ | 0 | 0 |

## 🔄 Actualizaciones

### Diciembre 2024
- ✅ Actualizada configuración para Next.js 14.2.15
- ✅ Agregadas reglas específicas para NestJS
- ✅ Soporte completo para TypeScript 5.x
- ✅ Configuración optimizada para Turborepo

## 📝 Contribuir

Para modificar las reglas de ESLint:

1. Editar archivos en `packages/config-eslint/`
2. Probar cambios localmente: `pnpm lint`
3. Verificar que todas las apps pasen el linting
4. Crear PR con justificación de los cambios

---

**Mantenido por**: Equipo LeadsAgent  
**Última actualización**: Diciembre 2024
