# 🔧 Troubleshooting Guide - LeadsCRM

Esta guía consolida las soluciones para problemas comunes del proyecto LeadsCRM, incluyendo problemas de red, optimizaciones de build y configuración.

---

## 🌐 Problemas de Conectividad

### Problemas de Conexión a Supabase

#### **Síntomas Comunes**

- Error: `connect ECONNREFUSED 127.0.0.1:54322`
- Timeout en conexiones a la base de datos
- Prisma Client initialization failed

#### **Causas Posibles**

1. **Supabase CLI no está corriendo**

   ```bash
   # Verificar si Supabase está corriendo
   supabase status

   # Si no está activo, iniciar
   supabase start
   ```

2. **Puerto 54322 ocupado**

   ```bash
   # Verificar qué proceso usa el puerto
   netstat -ano | findstr :54322

   # Terminar proceso si es necesario
   taskkill /PID <PID_NUMBER> /F
   ```

3. **Docker no está corriendo**

   ```bash
   # Verificar estado de Docker
   docker ps

   # Si no está corriendo, iniciar Docker Desktop
   ```

#### **Soluciones**

**⭐ Para problemas específicos de PostgreSQL y prepared statements, ver [DEBUG_SOLUTIONS.md](./DEBUG_SOLUTIONS.md)**

**1. Reinicio Completo del Stack**

```bash
# Detener todos los servicios
supabase stop
docker stop $(docker ps -q)

# Limpiar y reiniciar
supabase start
pnpm dev
```

**2. Reset de Base de Datos Local**

```bash
# Reset completo de Supabase local
supabase db reset
pnpm db:generate
pnpm db:seed
```

**3. Verificación de Configuración**

```bash
# Verificar variables de entorno
cat .env | grep DATABASE_URL

# Verificar conexión directa
psql $DATABASE_URL -c "SELECT 1"
```

#### **Problemas Específicos de Red**

**Error: `getaddrinfo ENOTFOUND`**

- Verificar conectividad a internet
- Comprobar DNS (usar 8.8.8.8 o 1.1.1.1)
- Verificar firewall/antivirus

**Error: `SSL connection required`**

- Agregar `?sslmode=require` al DATABASE_URL
- Verificar certificados SSL

---

## ⚡ Optimización de Builds

### Builds Lentos (>10 minutos)

#### **Diagnóstico Rápido**

```bash
# Verificar tamaño del cache
du -sh .turbo

# Si es > 1GB, limpiar cache
pnpm clean:cache
```

#### **Soluciones Inmediatas**

**1. Limpiar Cache Completo**

```bash
pnpm clean:cache && pnpm rebuild
```

**2. Verificar Versiones de React**

```bash
pnpm list react react-dom
# Debe ser 18.x.x en todos los workspaces
```

**3. Validar TypeScript Config**

```bash
# Verificar que skipLibCheck esté en true
grep -r "skipLibCheck" apps/*/tsconfig.json packages/*/tsconfig.json
```

#### **Reset Completo del Workspace**

```bash
# Si los problemas persisten
rm -rf node_modules pnpm-lock.yaml
rm -rf apps/*/node_modules packages/*/node_modules
rm -rf .turbo apps/*/.next apps/*/dist packages/*/dist
pnpm install
pnpm db:generate
pnpm build:fast
```

---

## 🐛 Problemas de Desarrollo Comunes

### Errores de TypeScript

#### **Error: Cannot find module '@repo/ui'**

```bash
# Regenerar dependencias del workspace
pnpm install --workspace-root
pnpm build:packages
```

#### **Error: Prisma Client not generated**

```bash
pnpm db:generate
# Si falla, verificar DATABASE_URL en .env
```

#### **Error: Type 'unknown' is not assignable**

- Verificar imports de tipos Prisma
- Regenerar cliente: `pnpm db:generate`
- Verificar que los enums estén alineados

### Problemas de API

#### **Error: Port already in use**

```bash
# Verificar puertos usados
netstat -ano | findstr :3003
netstat -ano | findstr :3002
netstat -ano | findstr :3001

# Terminar procesos si es necesario
taskkill /PID <PID> /F
```

#### **Error: CORS issues**

- Verificar configuración CORS en cada servicio
- Asegurar que los puertos están correctamente configurados
- Dashboard: 3000, Docs: 3001, WhatsApp: 3002, API: 3003

### Problemas de WhatsApp

#### **QR Code no se genera**

```bash
# Verificar logs del servicio WhatsApp
curl http://localhost:3002/api/whatsapp/sessions

# Reiniciar sesión
curl -X DELETE http://localhost:3002/api/whatsapp/sessions/default
```

#### **Mensajes no se envían**

- Verificar que la sesión esté conectada
- Comprobar formato del número de teléfono
- Revisar logs de la API para errores específicos

---

## 🔑 Problemas de Autenticación

### Clerk Authentication Issues

#### **Error: ClerkProvider not found**

- Verificar que `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` esté configurado
- Comprobar que ClerkProvider esté en el layout raíz

#### **Error: User not authenticated**

```javascript
// Verificar en el componente
const { isSignedIn, user } = useUser();
console.log({ isSignedIn, user });
```

### Problemas de Base de Datos

#### **Error: RLS policy violation**

- Verificar que el usuario tenga los permisos correctos
- Comprobar las políticas RLS en Supabase
- Usar el service role para operaciones de backend

---

## 📱 Problemas de UI/UX

### Componentes no se renderizan

#### **ShadCN/ui components not found**

```bash
# Reinstalar componentes
pnpm dlx shadcn-ui@latest add button
pnpm dlx shadcn-ui@latest add card
```

#### **Estilos no se aplican**

- Verificar que Tailwind CSS esté configurado
- Comprobar imports de CSS en `globals.css`
- Limpiar cache del navegador

---

## 🛠️ Herramientas de Diagnóstico

### Scripts de Diagnóstico

**Verificar Estado del Sistema**

```bash
# Crear script de diagnóstico
cat > diagnose.sh << 'EOF'
#!/bin/bash
echo "=== LeadsCRM System Diagnosis ==="
echo "1. Node.js version: $(node --version)"
echo "2. PNPM version: $(pnpm --version)"
echo "3. Docker status: $(docker --version 2>/dev/null || echo 'Not installed')"
echo "4. Supabase status:"
supabase status 2>/dev/null || echo "Supabase CLI not available"
echo "5. Port status:"
netstat -ano | findstr :3000 || echo "Port 3000: Available"
netstat -ano | findstr :3001 || echo "Port 3001: Available"
netstat -ano | findstr :3002 || echo "Port 3002: Available"
netstat -ano | findstr :3003 || echo "Port 3003: Available"
echo "6. Cache sizes:"
du -sh .turbo 2>/dev/null || echo ".turbo cache: Not found"
du -sh node_modules 2>/dev/null || echo "node_modules: Not found"
EOF

chmod +x diagnose.sh
./diagnose.sh
```

### Logs y Monitoring

**Verificar Logs de Aplicaciones**

```bash
# Dashboard logs
pnpm --filter dashboard dev

# API logs
pnpm --filter api dev

# WhatsApp service logs
pnpm --filter whatsapp-service dev
```

---

## 📋 Checklist de Solución Rápida

### Antes de reportar un problema:

- [ ] **Cache limpio**: `pnpm clean:cache`
- [ ] **Dependencies actualizadas**: `pnpm install`
- [ ] **Prisma generado**: `pnpm db:generate`
- [ ] **Variables de entorno**: Verificar `.env`
- [ ] **Puertos libres**: Verificar conflictos de puerto
- [ ] **Logs revisados**: Comprobar errores específicos

### Para problemas persistentes:

- [ ] **Reset completo**: Ejecutar script de reset
- [ ] **Verificar versiones**: Node, PNPM, dependencias
- [ ] **Comprobar configuración**: TypeScript, ESLint, Prettier
- [ ] **Revisar documentación**: WARP.md y guías específicas

---

## 🆘 Escalación

### Cuándo escalar el problema:

1. **Después de intentar todas las soluciones básicas**
2. **Cuando el problema afecta múltiples desarrolladores**
3. **Si hay pérdida de datos o corrupción**
4. **Para errores de producción**

### Información a incluir al reportar:

- Sistema operativo y versión
- Versión de Node.js y PNPM
- Logs completos del error
- Pasos para reproducir el problema
- Configuración de variables de entorno (sin credenciales)

---

_Última actualización: Agosto 2024_  
_Próxima revisión: Mensual o cuando surjan nuevos problemas comunes_
