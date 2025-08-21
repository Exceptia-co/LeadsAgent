# LeadsCRM API

Backend API para el sistema de gestión de leads construido con NestJS.

## 🚀 Stack Tecnológico

- **Framework**: NestJS
- **Base de Datos**: Prisma ORM
- **Validación**: class-validator
- **Documentación**: Swagger/OpenAPI
- **Testing**: Jest

## 📦 Instalación

```bash
# Desde el directorio raíz del monorepo
pnpm install

# Generar cliente Prisma
pnpm db:generate

# Ejecutar migraciones
pnpm db:push
```

## 🔥 Desarrollo

```bash
# Desarrollo
pnpm dev

# Build
pnpm build

# Testing
pnpm test

# Linting
pnpm lint
```

## 🌐 Endpoints

- **Health**: `GET /health`
- **Leads**: `GET|POST|PUT|DELETE /leads`
- **Users**: `GET|POST|PUT|DELETE /users`
- **Auth**: `POST /auth/login`

## 📚 Documentación API

Una vez ejecutándose en desarrollo, visita:
`http://localhost:3001/api` para ver la documentación Swagger.

## 🔧 Variables de Entorno

Crea un archivo `.env` basado en `.env.example`:

```bash
DATABASE_URL="postgresql://..."
JWT_SECRET="your-jwt-secret"
PORT=3001
```
