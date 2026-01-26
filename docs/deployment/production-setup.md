# Setup de Produccion - LeadsCRM

Guia completa para configurar el entorno de produccion.

---

## Requisitos Previos

### Cuentas Necesarias

| Servicio                             | Proposito        | Costo                |
| ------------------------------------ | ---------------- | -------------------- |
| [Vercel](https://vercel.com)         | Frontend hosting | Gratis / $20/mes Pro |
| [Railway](https://railway.app)       | API backend      | $5 credito gratis    |
| [Hetzner](https://hetzner.com)       | VPS WhatsApp     | ~$5/mes              |
| [Supabase](https://supabase.com)     | Base de datos    | Gratis / $25/mes Pro |
| [Clerk](https://clerk.com)           | Autenticacion    | Gratis / $25/mes Pro |
| [Cloudflare](https://cloudflare.com) | DNS + CDN        | Gratis               |

### Herramientas Locales

```bash
# Node.js 20+
node --version  # v20.x.x

# pnpm 9+
pnpm --version  # 9.x.x

# Git
git --version

# SSH client (para VPS)
ssh -V
```

---

## 1. Configuracion de Base de Datos (Supabase)

### 1.1 Crear Proyecto

1. Ve a [app.supabase.com](https://app.supabase.com)
2. Click "New Project"
3. Selecciona region cercana a tus usuarios
4. Guarda la password del proyecto

### 1.2 Obtener URLs de Conexion

En Settings > Database > Connection string:

```bash
# URL con Pooler (para la aplicacion)
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"

# URL Directa (para migraciones)
DIRECT_URL="postgresql://postgres.[ref]:[password]@db.[ref].supabase.co:5432/postgres"
```

### 1.3 Aplicar Migraciones

```bash
# Desde la raiz del proyecto
pnpm db:generate
pnpm db:migrate:deploy
```

### 1.4 Configurar RLS (Row Level Security)

Ver [`security-guide.md`](./security-guide.md) para configuracion detallada de RLS.

---

## 2. Configuracion de Autenticacion (Clerk)

### 2.1 Crear Aplicacion

1. Ve a [dashboard.clerk.com](https://dashboard.clerk.com)
2. Crea nueva aplicacion
3. Selecciona metodos de autenticacion (Email, Google, etc.)

### 2.2 Obtener API Keys

En API Keys, copia:

```bash
CLERK_SECRET_KEY="sk_live_xxxx"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_xxxx"
```

### 2.3 Configurar Webhook

1. Ve a Webhooks > Add Endpoint
2. URL: `https://api.tudominio.com/webhooks/clerk`
3. Eventos: `user.created`, `user.updated`, `user.deleted`
4. Copia el `Signing Secret`:

```bash
CLERK_WEBHOOK_SECRET="whsec_xxxx"
```

### 2.4 Configurar Dominios

En Domains, agrega tus dominios de produccion:

- `tudominio.com`
- `www.tudominio.com`

---

## 3. Deploy del Frontend (Vercel)

### 3.1 Conectar Repositorio

1. Ve a [vercel.com/new](https://vercel.com/new)
2. Importa `Exceptia-co/LeadsAgent`
3. Configura:
   - **Framework**: Next.js
   - **Root Directory**: `apps/dashboard`
   - **Build Command**: `cd ../.. && pnpm install && pnpm db:generate && pnpm build --filter=@leadcrm/dashboard`

### 3.2 Variables de Entorno

```bash
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxxx
CLERK_SECRET_KEY=sk_live_xxxx

# API
NEXT_PUBLIC_API_URL=https://api.tudominio.com

# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Supabase (si se usa cliente directo)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
```

### 3.3 Dominio Personalizado

1. Settings > Domains
2. Agrega `tudominio.com`
3. Configura DNS en Cloudflare (ver DEPLOY_GUIDE.md)

---

## 4. Deploy del API (Railway)

### 4.1 Crear Proyecto

1. Ve a [railway.app/new](https://railway.app/new)
2. Selecciona "Deploy from GitHub"
3. Conecta el repositorio

### 4.2 Configurar Servicio

En Settings:

- **Root Directory**: `apps/api`
- **Start Command**: `node dist/main.js`

### 4.3 Variables de Entorno

```bash
NODE_ENV=production
PORT=3003

# Database
DATABASE_URL=postgresql://...pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://...supabase.co:5432/postgres

# Auth
CLERK_SECRET_KEY=sk_live_xxxx
CLERK_WEBHOOK_SECRET=whsec_xxxx

# WhatsApp
WHATSAPP_SERVICE_URL=https://whatsapp.tudominio.com
WHATSAPP_WEBHOOK_SECRET=tu-webhook-secret

# AI
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-xxxx

# Security
JWT_SECRET=tu-jwt-secret-256-bits
CORS_ORIGIN=https://tudominio.com,https://www.tudominio.com
```

### 4.4 Dominio

1. Settings > Networking > Public Networking
2. Genera dominio o agrega `api.tudominio.com`
3. Actualiza DNS en Cloudflare

---

## 5. Deploy de WhatsApp Service (VPS)

### 5.1 Crear VPS en Hetzner

1. Ve a [console.hetzner.cloud](https://console.hetzner.cloud)
2. Nuevo proyecto: "LeadsCRM"
3. Crear servidor:
   - **OS**: Ubuntu 22.04
   - **Type**: CX22 (2 vCPU, 4GB RAM)
   - **SSH Key**: Tu clave publica

### 5.2 Setup Inicial

```bash
# Conectar
ssh root@TU_IP

# Ejecutar script de setup
curl -fsSL https://raw.githubusercontent.com/Exceptia-co/LeadsAgent/main/scripts/setup-vps.sh | bash

# Clonar repositorio
git clone https://github.com/Exceptia-co/LeadsAgent.git /opt/leadcrm
cd /opt/leadcrm

# Configurar variables
cp .env.production.example .env
nano .env  # Editar con valores reales

# Instalar y build
pnpm install
pnpm db:generate
cd apps/whatsapp-service
pnpm build

# Iniciar con PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

### 5.3 Configurar SSL

```bash
# Configurar Nginx
nano /etc/nginx/sites-available/whatsapp-service
# Reemplaza whatsapp.TUDOMINIO.com

# Activar sitio
ln -s /etc/nginx/sites-available/whatsapp-service /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# SSL con Certbot
certbot --nginx -d whatsapp.tudominio.com
```

---

## 6. Verificacion Final

### 6.1 Health Checks

```bash
# Dashboard
curl -I https://tudominio.com
# Esperado: HTTP/2 200

# API
curl https://api.tudominio.com/health
# Esperado: {"status":"ok"}

# WhatsApp
curl https://whatsapp.tudominio.com/health
# Esperado: {"status":"ok"}
```

### 6.2 Test E2E

1. Visita `https://tudominio.com`
2. Registrate/Inicia sesion con Clerk
3. Navega al dashboard
4. Conecta WhatsApp escaneando QR
5. Envia mensaje de prueba

---

## Checklist de Produccion

- [ ] Database configurada y migraciones aplicadas
- [ ] Clerk configurado con webhook activo
- [ ] Frontend desplegado en Vercel con dominio
- [ ] API desplegada en Railway con dominio
- [ ] WhatsApp Service en VPS con SSL
- [ ] DNS configurado en Cloudflare
- [ ] Health checks pasando
- [ ] RLS activado en Supabase
- [ ] Backups automaticos configurados (ver [`backup-recovery.md`](./backup-recovery.md))
- [ ] Monitoreo activo (ver [`monitoring.md`](./monitoring.md))

---

## Siguiente Paso

Una vez completado el setup, configura:

- [Monitoreo y Alertas](./monitoring.md)
- [Backup y Recovery](./backup-recovery.md)
- [Seguridad Avanzada](./security-guide.md)

---

_Ultima actualizacion: 2026-01-26_
