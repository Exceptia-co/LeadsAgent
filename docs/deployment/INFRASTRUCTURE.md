# LeadsCRM - Infraestructura de Producción

Este documento describe la configuración completa de infraestructura para desplegar LeadsCRM en producción.

## 📋 Resumen de Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────────┐
            │  Vercel   │   │  Railway  │   │    Hetzner    │
            │ Dashboard │   │    API    │   │   WhatsApp    │
            │ (Next.js) │   │ (NestJS)  │   │   Service     │
            └───────────┘   └───────────┘   └───────────────┘
                    │               │               │
                    │               │               │
                    │               ▼               │
                    │       ┌───────────┐           │
                    │       │ Supabase  │           │
                    │       │ PostgreSQL│◄──────────┘
                    │       └───────────┘
                    │               │
                    └───────┬───────┘
                            ▼
                    ┌───────────────┐
                    │    Clerk      │
                    │ (Auth/Users)  │
                    └───────────────┘
```

## 🌐 Dominios y DNS

### Proveedor: Namecheap

| Subdominio          | Tipo  | Destino              | Propósito           |
| ------------------- | ----- | -------------------- | ------------------- |
| `cromgod.space`     | A     | 76.76.21.21          | Dashboard (Vercel)  |
| `www.cromgod.space` | CNAME | cname.vercel-dns.com | Dashboard alias     |
| `ws.cromgod.space`  | A     | 46.225.26.89         | WebSocket (Hetzner) |

### Configuración DNS en Namecheap

1. Ir a Domain List → Manage → Advanced DNS
2. Añadir registros según la tabla anterior
3. TTL recomendado: Automatic o 1800 segundos

---

## 🖥️ Vercel - Dashboard (Frontend)

### Proyecto

- **URL Producción**: https://cromgod.space
- **URL Preview**: https://dashboard-ten-phi-38.vercel.app
- **Framework**: Next.js 14.2.15
- **Root Directory**: `apps/dashboard`

### Variables de Entorno (Production)

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsuY3JvbWdvZC5zcGFjZSQ
CLERK_SECRET_KEY=sk_live_xxxxxxxxxxxxx

# Clerk URLs (usar fallbackRedirectUrl en código, no estas variables legacy)
# DEPRECATED - remover cuando sea posible:
# NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
# NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# API Backend (Railway)
NEXT_PUBLIC_API_URL=https://leadsagent-production.up.railway.app

# WebSocket (Hetzner con SSL)
NEXT_PUBLIC_WEBSOCKET_URL=wss://ws.cromgod.space
```

### vercel.json

```json
{
  "rewrites": [
    {
      "source": "/api/leads/:path*",
      "destination": "https://leadsagent-production.up.railway.app/api/leads/:path*"
    },
    {
      "source": "/api/public/:path*",
      "destination": "https://leadsagent-production.up.railway.app/api/public/:path*"
    },
    {
      "source": "/api/backend-whatsapp/:path*",
      "destination": "https://leadsagent-production.up.railway.app/api/whatsapp/:path*"
    }
  ]
}
```

### Dominios Personalizados

1. Settings → Domains → Add Domain
2. Añadir `cromgod.space` y `www.cromgod.space`
3. Verificar configuración DNS

---

## 🚂 Railway - API Backend

### Proyecto

- **URL Producción**: https://leadsagent-production.up.railway.app
- **Framework**: NestJS 10
- **Root Directory**: `apps/api`

### Variables de Entorno

```bash
# Database (Supabase PostgreSQL)
DATABASE_URL=postgresql://postgres.xxxx:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.xxxx:password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres

# Clerk Authentication
CLERK_SECRET_KEY=sk_live_xxxxxxxxxxxxx
CLERK_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxx

# CORS - Dominios permitidos
CORS_ORIGINS=https://cromgod.space,https://www.cromgod.space,https://dashboard-ten-phi-38.vercel.app

# WhatsApp Service
WHATSAPP_SERVICE_URL=http://46.225.26.89:3002

# OpenAI/AI Provider
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-xxxxxxxxxxxxx
# O alternativamente:
# AI_PROVIDER=openai
# OPENAI_API_KEY=sk-xxxxxxxxxxxxx

# Environment
NODE_ENV=production
PORT=3003
```

### Configuración de Build

```bash
# Build Command
cd apps/api && pnpm install && pnpm build

# Start Command
cd apps/api && node dist/main.js

# Watch Paths (para redeploys automáticos)
apps/api/**
packages/db/**
```

---

## 🟢 Hetzner - WhatsApp Service

### Servidor

- **IP**: 46.225.26.89
- **OS**: Ubuntu 24.04.3 LTS
- **Nombre**: whatsapp-service
- **Framework**: Express + whatsapp-web.js

### Acceso SSH

```bash
# Conexión (si está habilitado)
ssh root@46.225.26.89

# O usar Hetzner Cloud Console:
# https://console.hetzner.com → Projects → whatsapp-service → Console
```

### Variables de Entorno

Crear archivo `/root/whatsapp-service/.env`:

```bash
# Server
PORT=3002
NODE_ENV=production

# Database (Supabase)
DATABASE_URL=postgresql://postgres.xxxx:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.xxxx:password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres

# API Backend
API_URL=https://leadsagent-production.up.railway.app

# AI Provider
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-xxxxxxxxxxxxx

# Redis (opcional, para caché)
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info
```

### Nginx - Proxy Inverso con SSL

#### Instalación

```bash
apt update && apt install -y nginx certbot python3-certbot-nginx
```

#### Configuración `/etc/nginx/sites-available/whatsapp-ws`

```nginx
server {
    listen 80;
    server_name ws.cromgod.space;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

#### Habilitar sitio y SSL

```bash
# Crear symlink
ln -sf /etc/nginx/sites-available/whatsapp-ws /etc/nginx/sites-enabled/

# Verificar configuración
nginx -t

# Recargar nginx
systemctl reload nginx

# Obtener certificado SSL (Let's Encrypt)
certbot --nginx -d ws.cromgod.space
```

El certificado SSL se renueva automáticamente. Certbot modifica el archivo para añadir:

- `listen 443 ssl;`
- `ssl_certificate /etc/letsencrypt/live/ws.cromgod.space/fullchain.pem;`
- `ssl_certificate_key /etc/letsencrypt/live/ws.cromgod.space/privkey.pem;`
- Redirect HTTP → HTTPS

### PM2 - Process Manager

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Iniciar servicio
cd /root/whatsapp-service
pm2 start dist/main.js --name whatsapp-service

# Configurar inicio automático
pm2 startup
pm2 save

# Comandos útiles
pm2 status              # Ver estado
pm2 logs whatsapp-service  # Ver logs
pm2 restart whatsapp-service  # Reiniciar
```

### Firewall (UFW)

```bash
# Habilitar puertos necesarios
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (para certbot)
ufw allow 443/tcp   # HTTPS/WSS
ufw allow 3002/tcp  # WhatsApp service (interno, opcional)

# Habilitar firewall
ufw enable
ufw status
```

---

## 🔐 Clerk - Autenticación

### Configuración de Producción

1. **Dashboard**: https://dashboard.clerk.com
2. **Instancia**: Production (no Development)

### Dominios Autorizados

En Clerk Dashboard → Settings → Domains:

```
cromgod.space
www.cromgod.space
dashboard-ten-phi-38.vercel.app
```

### Clerk Frontend API

```
https://clerk.cromgod.space
```

Requiere registro CNAME en DNS:

```
clerk.cromgod.space → frontend-api.clerk.services
```

### Webhooks (Opcional)

Si necesitas sincronizar usuarios con tu base de datos:

1. Clerk Dashboard → Webhooks → Add Endpoint
2. URL: `https://leadsagent-production.up.railway.app/api/webhooks/clerk`
3. Events: `user.created`, `user.updated`, `user.deleted`

---

## 🗄️ Supabase - Base de Datos

### Proyecto

- **Dashboard**: https://supabase.com/dashboard
- **Región**: eu-central-1 (Frankfurt)

### Connection Strings

```bash
# Pooler (para aplicaciones - puerto 6543)
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# Direct (para migraciones - puerto 5432)
DIRECT_URL=postgresql://postgres.[project-ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```

### Prisma Configuration

```prisma
// packages/db/prisma/schema.prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

### Migraciones

```bash
# Generar cliente Prisma
pnpm db:generate

# Crear migración
pnpm db:migrate:dev --name descripcion_cambio

# Aplicar en producción (Railway lo hace automáticamente)
npx prisma migrate deploy
```

---

## 🔄 CI/CD - Flujo de Despliegue

### Vercel (Dashboard)

```
git push main → Vercel detecta cambios → Build automático → Deploy
```

- Build Command: `cd ../.. && pnpm turbo build --filter=@leadcrm/dashboard`
- Output Directory: `.next`

### Railway (API)

```
git push main → Railway detecta cambios → Build automático → Deploy
```

- Configura Watch Paths para evitar rebuilds innecesarios

### Hetzner (WhatsApp)

Despliegue manual:

```bash
ssh root@46.225.26.89
cd /root/whatsapp-service
git pull origin main
pnpm install
pnpm build
pm2 restart whatsapp-service
```

---

## 🔍 Verificación Post-Despliegue

### 1. Dashboard (Vercel)

```bash
# Verificar que carga
curl -I https://cromgod.space

# Esperado: HTTP/2 200
```

### 2. API (Railway)

```bash
# Health check
curl https://leadsagent-production.up.railway.app/api/health

# Esperado: {"status":"ok"}
```

### 3. WhatsApp Service (Hetzner)

```bash
# Verificar SSL
curl -I https://ws.cromgod.space

# Esperado: HTTP/1.1 404 (o 200 si hay health endpoint)
# Importante: Debe mostrar "Server: nginx" y respuesta de Express
```

### 4. WebSocket

Abrir https://cromgod.space/dashboard/whatsapp y verificar:

- Estado: "En vivo" (no "Conectando")
- Console del navegador: `🔌 Socket connected with ID: ...`

---

## 🚨 Troubleshooting

### WebSocket no conecta

1. Verificar DNS propagado: `nslookup ws.cromgod.space`
2. Verificar SSL: `curl -I https://ws.cromgod.space`
3. Verificar nginx: `nginx -t && systemctl status nginx`
4. Verificar servicio: `pm2 status`
5. Verificar variable en Vercel: `NEXT_PUBLIC_WEBSOCKET_URL=wss://ws.cromgod.space`
6. **Importante**: Después de añadir/cambiar variables `NEXT_PUBLIC_*`, hacer nuevo build (no redeploy)

### API retorna CORS error

1. Verificar `CORS_ORIGINS` en Railway incluye el dominio del frontend
2. Verificar rewrites en `vercel.json`

### Clerk "Invalid Request"

1. Verificar dominio está en Clerk Dashboard → Settings → Domains
2. Verificar keys son de Production (no Development)
3. Verificar `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` empieza con `pk_live_`

### Database connection failed

1. Verificar IP permitida en Supabase (Settings → Database → Connection Pooling)
2. Usar `?pgbouncer=true` en `DATABASE_URL`
3. Usar puerto 6543 para pooler, 5432 para direct

---

## 📊 Monitoreo

### Logs

| Servicio | Ubicación                      |
| -------- | ------------------------------ |
| Vercel   | Dashboard → Logs               |
| Railway  | Dashboard → Deployments → Logs |
| Hetzner  | `pm2 logs whatsapp-service`    |

### Uptime Monitoring (Recomendado)

Configurar en servicio como UptimeRobot o Better Uptime:

- https://cromgod.space (Dashboard)
- https://leadsagent-production.up.railway.app/api/health (API)
- https://ws.cromgod.space (WebSocket)

---

## 🔑 Credenciales y Accesos

> ⚠️ **NUNCA commitear credenciales a Git**

Mantener en gestor de contraseñas seguro:

- [ ] Supabase database password
- [ ] Clerk secret keys
- [ ] OpenRouter/OpenAI API keys
- [ ] Hetzner Cloud credentials
- [ ] Railway API token
- [ ] Vercel API token

---

## 📝 Checklist de Nuevo Despliegue

- [ ] DNS configurado (cromgod.space, ws.cromgod.space)
- [ ] Clerk instancia de producción creada
- [ ] Clerk dominios autorizados
- [ ] Supabase proyecto creado
- [ ] Supabase migraciones aplicadas
- [ ] Railway proyecto creado con variables
- [ ] Vercel proyecto conectado a GitHub
- [ ] Vercel variables de entorno configuradas
- [ ] Vercel dominios personalizados añadidos
- [ ] Hetzner servidor aprovisionado
- [ ] Hetzner nginx + SSL configurado
- [ ] Hetzner PM2 configurado
- [ ] WebSocket funcionando (verificar en browser)
- [ ] Clerk login funciona
- [ ] API endpoints responden
- [ ] Base de datos accesible

---

_Última actualización: Enero 2026_
