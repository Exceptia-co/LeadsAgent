# 🚀 Guía de Despliegue Paso a Paso - LeadsCRM

Esta guía te llevará desde cero hasta tener LeadsCRM funcionando en producción.

## Prerequisitos

- Cuenta en [Vercel](https://vercel.com) (gratis)
- Cuenta en [Railway](https://railway.app) (gratis, $5 crédito)
- Cuenta en [Hetzner](https://hetzner.com) o VPS similar (~$5/mes)
- Cuenta en [Supabase](https://supabase.com) (ya configurada)
- Cuenta en [Clerk](https://clerk.com) (ya configurada)
- Dominio en [Namecheap](https://namecheap.com)

---

## Paso 1: Configurar Dominio (Namecheap + Cloudflare)

### 1.1 Comprar dominio en Namecheap

1. Ve a [namecheap.com](https://namecheap.com)
2. Busca tu dominio deseado (ej: `leadcrm.com`, `tuleads.app`)
3. Compra el dominio (~$10-15/año para `.com`)

### 1.2 Configurar Cloudflare (SSL + CDN gratuito)

1. Crea cuenta en [cloudflare.com](https://cloudflare.com)
2. Añade tu dominio
3. Cloudflare te dará 2 nameservers:
   ```
   aria.ns.cloudflare.com
   bob.ns.cloudflare.com
   ```
4. En Namecheap, ve a Domain > Nameservers > Custom DNS
5. Ingresa los nameservers de Cloudflare
6. Espera 24-48h para propagación

### 1.3 Configurar registros DNS en Cloudflare

| Tipo | Nombre | Contenido | Proxy |
|------|--------|-----------|-------|
| CNAME | @ | cname.vercel-dns.com | ❌ OFF |
| CNAME | www | cname.vercel-dns.com | ❌ OFF |
| A | api | [IP Railway] | ✅ ON |
| A | whatsapp | [IP VPS Hetzner] | ✅ ON |

> ⚠️ Los registros de Vercel deben tener proxy OFF para que funcione el SSL de Vercel

---

## Paso 2: Desplegar Frontend en Vercel

### 2.1 Conectar repositorio

1. Ve a [vercel.com/new](https://vercel.com/new)
2. Importa el repositorio `Exceptia-co/LeadsAgent`
3. Configura:
   - **Framework Preset**: Next.js
   - **Root Directory**: `apps/dashboard`
   - **Build Command**: `cd ../.. && pnpm install && pnpm db:generate && pnpm build --filter=@leadcrm/dashboard`
   - **Install Command**: `pnpm install`

### 2.2 Variables de entorno en Vercel

Ve a Settings > Environment Variables y añade:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = pk_live_xxxx
CLERK_SECRET_KEY = sk_live_xxxx
NEXT_PUBLIC_API_URL = https://api.tudominio.com
NEXT_PUBLIC_SUPABASE_URL = https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbG...
DATABASE_URL = postgresql://...
DIRECT_URL = postgresql://...
```

### 2.3 Configurar dominio personalizado

1. Ve a Settings > Domains
2. Añade `tudominio.com` y `www.tudominio.com`
3. Vercel te mostrará los registros DNS necesarios
4. Verifica que los registros CNAME estén en Cloudflare

---

## Paso 3: Desplegar API en Railway

### 3.1 Crear proyecto

1. Ve a [railway.app/new](https://railway.app/new)
2. Selecciona "Deploy from GitHub repo"
3. Conecta `Exceptia-co/LeadsAgent`

### 3.2 Configurar servicio

1. Click en el servicio creado
2. Ve a Settings:
   - **Root Directory**: `apps/api`
   - **Start Command**: `node dist/main.js`

### 3.3 Variables de entorno en Railway

Ve a Variables y añade:

```
NODE_ENV = production
PORT = 3003
DATABASE_URL = postgresql://...pooler.supabase.com:6543/postgres
DIRECT_URL = postgresql://...supabase.co:5432/postgres
CLERK_SECRET_KEY = sk_live_xxxx
CLERK_WEBHOOK_SECRET = whsec_xxxx
WHATSAPP_SERVICE_URL = https://whatsapp.tudominio.com
WHATSAPP_WEBHOOK_SECRET = tu-webhook-secret
AI_PROVIDER = openrouter
OPENROUTER_API_KEY = sk-or-v1-xxxx
JWT_SECRET = tu-jwt-secret-super-largo
CORS_ORIGIN = https://tudominio.com,https://www.tudominio.com
```

### 3.4 Configurar dominio

1. Ve a Settings > Networking > Public Networking
2. Genera un dominio o añade `api.tudominio.com`
3. Railway te mostrará un registro CNAME o IP
4. Actualiza Cloudflare con el registro A o CNAME proporcionado

---

## Paso 4: Desplegar WhatsApp Service en VPS

### 4.1 Crear servidor en Hetzner

1. Ve a [hetzner.com/cloud](https://www.hetzner.com/cloud)
2. Crea cuenta y añade método de pago
3. Crea nuevo proyecto: "LeadsCRM"
4. Añade servidor:
   - **Location**: Ashburn o tu región más cercana
   - **OS**: Ubuntu 22.04
   - **Type**: CX22 (2 vCPU, 4GB RAM) - €4.15/mes
   - **SSH Key**: Añade tu clave SSH pública

### 4.2 Configurar VPS

```bash
# 1. Conectar al servidor
ssh root@TU_IP_VPS

# 2. Ejecutar script de setup
curl -fsSL https://raw.githubusercontent.com/Exceptia-co/LeadsAgent/main/scripts/setup-vps.sh | bash

# 3. Clonar repositorio
git clone https://github.com/Exceptia-co/LeadsAgent.git /opt/leadcrm

# 4. Configurar variables de entorno
cd /opt/leadcrm
cp .env.production.example .env
nano .env   # Edita con tus valores reales

# 5. Instalar dependencias
pnpm install
pnpm db:generate

# 6. Build del servicio
cd apps/whatsapp-service
pnpm build

# 7. Iniciar con PM2
pm2 start ecosystem.config.js --env production
pm2 save
```

### 4.3 Configurar Nginx y SSL

```bash
# 1. Editar configuración de Nginx
nano /etc/nginx/sites-available/whatsapp-service
# Reemplaza whatsapp.TUDOMINIO.com con tu dominio real

# 2. Activar sitio
ln -s /etc/nginx/sites-available/whatsapp-service /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

# 3. Obtener certificado SSL
certbot --nginx -d whatsapp.tudominio.com
```

### 4.4 Verificar servicio

```bash
# Ver logs
pm2 logs whatsapp-service

# Ver estado
pm2 status

# Verificar endpoint
curl http://localhost:3002/health
```

---

## Paso 5: Configurar Webhooks

### 5.1 Clerk Webhook

1. Ve a [Clerk Dashboard](https://dashboard.clerk.com) > Webhooks
2. Añade endpoint: `https://api.tudominio.com/webhooks/clerk`
3. Selecciona eventos: `user.created`, `user.updated`, `user.deleted`
4. Copia el `Signing Secret` y ponlo en `CLERK_WEBHOOK_SECRET`

### 5.2 WhatsApp Webhook (interno)

Ya está configurado en las variables de entorno:
- API escucha en: `https://api.tudominio.com/whatsapp/webhook`
- WhatsApp Service envía a esta URL

---

## Paso 6: Verificación Final

### Checklist de verificación

```bash
# Dashboard
curl -I https://tudominio.com
# Esperado: HTTP/2 200

# API Health
curl https://api.tudominio.com/health
# Esperado: {"status":"ok"}

# WhatsApp Health
curl https://whatsapp.tudominio.com/health
# Esperado: {"status":"ok"}
```

### Test completo

1. Visita `https://tudominio.com`
2. Inicia sesión con Clerk
3. Ve al dashboard de WhatsApp
4. Escanea el QR con tu teléfono
5. Envía un mensaje de prueba

---

## Solución de Problemas

### Dashboard no carga

```bash
# Verificar logs en Vercel
# Vercel Dashboard > Deployments > View Logs
```

### API no responde

```bash
# En Railway
railway logs --tail

# Verificar variables
railway variables
```

### WhatsApp no conecta

```bash
# En el VPS
pm2 logs whatsapp-service --lines 100

# Verificar que Chrome está instalado
chromium --version

# Reiniciar servicio
pm2 restart whatsapp-service
```

### Sesión de WhatsApp perdida

```bash
# Las sesiones se guardan en /opt/leadcrm/sessions
# Para backup
tar -czf sessions-backup.tar.gz /opt/leadcrm/sessions

# Para restaurar
tar -xzf sessions-backup.tar.gz -C /
pm2 restart whatsapp-service
```

---

## Mantenimiento

### Actualizar código

```bash
# En VPS
cd /opt/leadcrm
git pull origin main
pnpm install
cd apps/whatsapp-service && pnpm build
pm2 restart whatsapp-service
```

### Backup de sesiones (cron)

```bash
# Añadir a crontab
crontab -e

# Backup diario a las 3am
0 3 * * * tar -czf /root/backups/sessions-$(date +\%Y\%m\%d).tar.gz /opt/leadcrm/sessions
```

### Monitoreo

```bash
# Ver uso de recursos
pm2 monit

# Ver estado de todos los servicios
pm2 status
```

---

*Última actualización: 2026-01-20*
