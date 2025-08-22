# 🚀 Configuración de Puertos - LeadsAgent

## 📋 **Esquema de Puertos**

| Aplicación | Puerto | URL | Descripción |
|------------|--------|-----|-------------|
| **Dashboard** | `3000` | http://localhost:3000 | Aplicación web principal (Next.js) |
| **API** | `3001` | http://localhost:3001 | Servidor backend (NestJS) |
| **WhatsApp Service** | `3002` | http://localhost:3002 | Servicio de mensajería WhatsApp |
| **Docs** | `3003` | http://localhost:3003 | Documentación del proyecto |

## 🔧 **Configuración por Aplicación**

### Dashboard (Puerto 3000)
- **Framework**: Next.js
- **Script de desarrollo**: `next dev --port 3000`
- **Variables de entorno**:
  - `NEXT_PUBLIC_API_URL=http://localhost:3001`
  - `NEXTAUTH_URL=http://localhost:3000`

### API (Puerto 3001)
- **Framework**: NestJS
- **Script de desarrollo**: `nest start --watch`
- **Variables de entorno**:
  - `API_PORT=3001`
  - `API_HOST=0.0.0.0`
- **Puerto configurado en**: `src/main.ts` → `process.env.API_PORT || 3003`

### WhatsApp Service (Puerto 3002)
- **Framework**: Express + TypeScript
- **Script de desarrollo**: `tsx watch src/index.ts`
- **Variables de entorno**:
  - `WHATSAPP_SERVICE_PORT=3002`
  - `PORT=3002`
- **Puerto configurado en**: `src/index.ts` → `process.env.WHATSAPP_SERVICE_PORT || process.env.PORT || 3002`

### Docs (Puerto 3003)
- **Framework**: Next.js
- **Script de desarrollo**: `next dev --port 3003`
- **Puerto hardcodeado en**: `package.json`

## 🌐 **Configuración CORS**

Las aplicaciones están configuradas para permitir comunicación entre sí:

```env
CORS_ORIGIN="http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003"
```

## 🚀 **Comandos para Ejecutar**

### Ejecutar todo el proyecto
```bash
pnpm dev
```

### Ejecutar aplicaciones individualmente
```bash
# Dashboard
cd apps/dashboard && pnpm dev

# API
cd apps/api && pnpm dev

# WhatsApp Service
cd apps/whatsapp-service && pnpm dev

# Docs
cd apps/docs && pnpm dev
```

## 🔍 **Verificación de Puertos**

### Windows (PowerShell/CMD)
```bash
# Ver procesos usando puertos específicos
netstat -ano | findstr ":3000 :3001 :3002 :3003"

# Ver solo procesos en LISTENING
netstat -ano | findstr ":3000 :3001 :3002 :3003" | findstr "LISTENING"

# Matar proceso por PID
taskkill /F /PID <PID>

# Matar todos los procesos de Node.js (¡Cuidado!)
taskkill /f /im node.exe
```

### Linux/Mac
```bash
# Ver procesos usando puertos específicos
lsof -i :3000 -i :3001 -i :3002 -i :3003

# Matar proceso por PID
kill -9 <PID>

# Matar todos los procesos de Node.js (¡Cuidado!)
pkill -f node
```

## 🔧 **Troubleshooting**

### Error: Puerto en uso
Si recibes errores como "port already in use":

1. **Verificar procesos activos**:
   ```bash
   netstat -ano | findstr ":<PUERTO>" | findstr "LISTENING"
   ```

2. **Matar proceso específico**:
   ```bash
   taskkill /F /PID <PID>
   ```

3. **Limpiar todos los procesos Node.js**:
   ```bash
   taskkill /f /im node.exe
   ```

### Error: CORS
Si hay problemas de CORS entre aplicaciones:

1. Verificar que `CORS_ORIGIN` incluya todos los puertos:
   ```env
   CORS_ORIGIN="http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003"
   ```

2. Reiniciar todas las aplicaciones después de cambios en variables de entorno.

### Error: Variables de entorno no encontradas
1. Verificar que existe `.env` en la raíz del proyecto
2. Verificar que existe `.env.local` en `apps/dashboard/` para las variables de Clerk
3. Reiniciar las aplicaciones después de cambios en `.env`

## 📝 **Notas de Desarrollo**

- **Dashboard**: Necesita `.env.local` para las credenciales de Clerk
- **API**: Lee el puerto desde `API_PORT` en `.env`, con fallback a `3003`
- **WhatsApp Service**: Lee variables de entorno desde el directorio raíz (`../../.env`)
- **Docs**: Puerto hardcodeado en `package.json`

## 🔄 **Historial de Cambios**

- **2024-01-22**: Esquema inicial de puertos definido
- **2024-01-22**: Corregido conflicto entre API y Docs (ambos usaban 3001)
- **2024-01-22**: Actualizado puerto de Docs de 3004 a 3003 para mantener secuencia ordenada
- **2024-01-22**: Actualizada configuración CORS para incluir puerto 3003
