# Checklist de Variables de Entorno - LeadsCRM

## Resumen de Servicios

| Servicio | Plataforma | Puerto | Variables Requeridas |
|----------|------------|--------|---------------------|
| Dashboard | Vercel | 3000 | 12 |
| API | Railway/Fly.io | 3001 | 14 |
| WhatsApp Service | VPS | 3002 | 22 |
| Database | Supabase | 5432/6543 | 2 |

---

## Opciones de Pricing: Free Tier vs Producción

### Costo para Empezar (Free Tiers)

| Servicio | Free Tier | Límites | Costo Producción |
|----------|-----------|---------|------------------|
| **Vercel** | Hobby (Gratis) | 100GB bandwidth, dominio `.vercel.app` | $20/mes Pro |
| **Supabase** | Free | 500MB DB, 1GB storage, pausa si inactivo 7 días | $25/mes Pro |
| **Railway** | $5 crédito inicial | Se agota, luego $5/mes mínimo | $5/mes |
| **Upstash Redis** | Free | 10K commands/día, 256MB | $0.2/100K cmds |
| **Clerk** | Free | 10,000 MAU (usuarios activos mensuales) | $0.02/MAU extra |
| **OpenRouter** | Pay-as-you-go | Sin mínimo, ~$0.001/request | Variable |
| **VPS (WhatsApp)** | No hay free tier | Mínimo ~$4/mes | $10/mes (2GB RAM) |

### Escenarios de Costo

```
DESARROLLO/PRUEBAS (sin WhatsApp):     $0/mes
DESARROLLO/PRUEBAS (con WhatsApp):     ~$5/mes (solo VPS básico)
PRODUCCIÓN PEQUEÑA:                    ~$35/mes
PRODUCCIÓN COMPLETA:                   ~$60-65/mes
```

### Limitaciones Importantes de Free Tiers

| Servicio | Limitación | Impacto |
|----------|------------|---------|
| **Vercel Hobby** | Sin password protection, sin analytics | Bajo |
| **Vercel Hobby** | Dominio `.vercel.app` solamente | Medio - sin dominio custom |
| **Supabase Free** | **Pausa después de 7 días inactivo** | Alto - BD se desconecta |
| **Supabase Free** | Solo 2 proyectos simultáneos | Bajo |
| **Railway Free** | Sin custom domains | Medio |
| **Railway Free** | $5 crédito se agota en ~1 mes | Alto - requiere upgrade |
| **Clerk Free** | Branding "Secured by Clerk" en login | Bajo |
| **Upstash Free** | 10K commands/día máximo | Medio - suficiente para dev |

### Recomendación por Etapa

```
ETAPA 1 - Validación (1-2 semanas):
├── Vercel Hobby ─────── $0
├── Supabase Free ────── $0 (mantener activo para evitar pausa)
├── Railway Trial ────── $0 (usar créditos)
├── Upstash Free ─────── $0
├── Clerk Free ───────── $0
└── SIN WhatsApp ─────── $0
    TOTAL: $0/mes

ETAPA 2 - MVP con WhatsApp (1-3 meses):
├── Vercel Hobby ─────── $0
├── Supabase Free ────── $0
├── Railway ──────────── $5/mes
├── Upstash Free ─────── $0
├── Clerk Free ───────── $0
└── VPS básico ───────── $4-6/mes (Hetzner/DigitalOcean)
    TOTAL: ~$10/mes

ETAPA 3 - Producción:
├── Vercel Pro ───────── $20/mes
├── Supabase Pro ─────── $25/mes
├── Railway ──────────── $5/mes
├── Upstash ──────────── $0-5/mes
├── Clerk ────────────── $0-20/mes
└── VPS 2GB RAM ──────── $10/mes
    TOTAL: ~$60-65/mes
```

---

## 1. Base de Datos (Supabase)

### Free Tier vs Pro

| Característica | Free | Pro ($25/mes) |
|----------------|------|---------------|
| Almacenamiento DB | 500MB | 8GB |
| Bandwidth | 2GB | 250GB |
| Proyectos | 2 | Ilimitados |
| **Pausa por inactividad** | **Sí (7 días)** | No |
| Backups | No | Diarios |

> **Tip Free Tier**: Para evitar que la BD se pause, puedes hacer un cron job que haga un SELECT simple cada 5 días.

### Variables Globales de BD
```bash
# URL con connection pooler (para aplicación)
# Usar puerto 6543 con pgbouncer=true
DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true"

# URL directa SIN pooler (para migraciones Prisma)
# Usar puerto 5432 sin pgbouncer
DIRECT_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
```

### Checklist BD
- [ ] Crear proyecto en Supabase (elegir región cercana)
- [ ] Copiar DATABASE_URL desde Settings > Database > Connection string (Session mode)
- [ ] Copiar DIRECT_URL desde Settings > Database > Connection string (Transaction mode)
- [ ] Activar Row Level Security (RLS) en todas las tablas
- [ ] (Pro) Configurar backup automático
- [ ] (Free) Configurar cron para evitar pausa por inactividad
- [ ] Ejecutar `pnpm db:migrate:deploy`
- [ ] Ejecutar `pnpm db:seed` (opcional, datos iniciales)

---

## 2. Dashboard (Vercel) - Frontend

### Free Tier (Hobby) vs Pro

| Característica | Hobby (Gratis) | Pro ($20/mes) |
|----------------|----------------|---------------|
| Bandwidth | 100GB | 1TB |
| Builds | 6000 min/mes | 24000 min/mes |
| Serverless Functions | 100GB-hrs | 1000GB-hrs |
| Custom Domains | ❌ Solo `.vercel.app` | ✅ Ilimitados |
| Password Protection | ❌ | ✅ |
| Analytics | ❌ | ✅ |
| Team Members | 1 | Ilimitados |

> **Tip Free Tier**: Para pruebas, el dominio `tuapp.vercel.app` funciona perfectamente. Configura custom domain cuando vayas a producción.

### Variables Requeridas
```bash
# ===== CLERK AUTHENTICATION =====
CLERK_SECRET_KEY="sk_live_xxxxxxxxxxxx"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_xxxxxxxxxxxx"
CLERK_WEBHOOK_SECRET="whsec_xxxxxxxxxxxx"

# URLs de Clerk (ajustar a dominio producción)
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL="/dashboard"
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL="/dashboard"

# ===== API CONNECTION =====
NEXT_PUBLIC_API_URL="https://api.tudominio.com"

# ===== NEXTAUTH =====
NEXTAUTH_URL="https://tudominio.com"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"

# ===== SUPABASE (opcional, si usas cliente directo) =====
NEXT_PUBLIC_SUPABASE_URL="https://[PROJECT_REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJxxxxxxxxxxxx"
```

### Checklist Dashboard
- [ ] Conectar repo GitHub a Vercel
- [ ] Configurar dominio personalizado
- [ ] Agregar todas las variables en Vercel Dashboard > Settings > Environment Variables
- [ ] Crear claves Clerk de PRODUCCION (no development)
- [ ] Configurar webhook de Clerk apuntando a API
- [ ] Verificar SSL/HTTPS activo
- [ ] Probar login en producción

---

## 3. API (Railway/Fly.io) - Backend

### Free Tier vs Paid

**Railway:**
| Característica | Trial | Developer ($5/mes) |
|----------------|-------|-------------------|
| Crédito inicial | $5 gratis | - |
| Recursos | $5 worth | $5 incluido + uso |
| Custom Domains | ❌ | ✅ |
| Persistencia | ✅ | ✅ |

**Fly.io (alternativa):**
| Característica | Free | Pay-as-you-go |
|----------------|------|---------------|
| VMs | 3 shared-cpu | Ilimitadas |
| RAM | 256MB | Configurable |
| Storage | 3GB | Configurable |

> **Tip Free Tier**: Railway da $5 de crédito que dura ~1 mes con uso ligero. Después necesitas agregar tarjeta. Fly.io tiene free tier más generoso pero setup más complejo.

### Variables Requeridas
```bash
# ===== DATABASE =====
DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true"

# ===== SERVER =====
NODE_ENV="production"
API_PORT=3001
API_HOST="0.0.0.0"

# ===== CLERK AUTHENTICATION =====
CLERK_SECRET_KEY="sk_live_xxxxxxxxxxxx"
CLERK_WEBHOOK_SECRET="whsec_xxxxxxxxxxxx"

# ===== WHATSAPP SERVICE CONNECTION =====
WHATSAPP_SERVICE_URL="https://whatsapp.tudominio.com"
WHATSAPP_WEBHOOK_SECRET="tu-webhook-secret-seguro"

# ===== WHATSAPP LEAD CONTROL =====
WHATSAPP_ALLOW_NEW_LEADS=true
WHATSAPP_REQUIRE_WHITELIST=true
WHATSAPP_BLOCK_NEWSLETTERS=true

# ===== SECURITY =====
JWT_SECRET="generate-with-openssl-rand-base64-64"
ENCRYPTION_KEY="exactly-32-characters-key-here!"

# ===== CORS =====
CORS_ORIGIN="https://tudominio.com"

# ===== LOGGING =====
LOG_LEVEL="info"
LOG_FORMAT="combined"
```

### Checklist API
- [ ] Crear proyecto en Railway o Fly.io
- [ ] Conectar repo GitHub
- [ ] Agregar todas las variables de entorno
- [ ] Configurar dominio personalizado (api.tudominio.com)
- [ ] Verificar health check en `/health`
- [ ] Configurar CORS con dominio del Dashboard
- [ ] Probar endpoints principales

---

## 4. WhatsApp Service (VPS) - Microservicio

### Opciones de VPS Económicas

| Proveedor | Plan Mínimo | RAM | Precio |
|-----------|-------------|-----|--------|
| **Hetzner** | CX11 | 2GB | €3.29/mes (~$4) |
| **DigitalOcean** | Basic Droplet | 1GB | $6/mes |
| **Vultr** | Cloud Compute | 1GB | $5/mes |
| **Contabo** | VPS S | 4GB | €4.99/mes (~$5.50) |
| **Oracle Cloud** | Free tier | 1GB | **$0** (limitado) |

> **Recomendación**: Hetzner o Contabo ofrecen mejor relación precio/rendimiento. WhatsApp Web.js necesita mínimo 1GB RAM, recomendado 2GB.

> **Oracle Cloud Free Tier**: Ofrece 2 VMs Always Free con 1GB RAM cada una. Perfecto para pruebas pero el registro puede ser difícil.

### Variables Requeridas
```bash
# ===== SERVER =====
PORT=3002
NODE_ENV="production"

# ===== CORS =====
CORS_ORIGINS="https://tudominio.com,https://api.tudominio.com"

# ===== REDIS (REQUERIDO) =====
REDIS_URL="redis://default:[PASSWORD]@[HOST]:6379"
REDIS_PREFIX="whatsapp:"

# ===== WHATSAPP =====
WHATSAPP_SESSION_PATH="/app/sessions"
WHATSAPP_WEBHOOK_URL="https://api.tudominio.com/api/whatsapp/webhook"
WHATSAPP_WEBHOOK_SECRET="tu-webhook-secret-seguro"

# ===== AI PROVIDER (OpenRouter recomendado) =====
AI_PROVIDER="openrouter"
OPENROUTER_API_KEY="sk-or-v1-xxxxxxxxxxxx"
OPENROUTER_BASE_URL="https://openrouter.ai/api/v1"
OPENROUTER_MODEL="openai/gpt-oss-120b"

# ===== AI ALTERNATIVO: Gemini =====
# GEMINI_API_KEY="your-gemini-api-key"
# GEMINI_MODEL="gemini-1.5-flash"

# ===== AI ALTERNATIVO: OpenAI =====
# OPENAI_API_KEY="sk-xxxxxxxxxxxx"

# ===== DATABASE =====
DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true"

# ===== SECURITY =====
JWT_SECRET="mismo-jwt-secret-que-api"

# ===== PUPPETEER =====
PUPPETEER_HEADLESS=true
PUPPETEER_ARGS="--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage"

# ===== RATE LIMITING =====
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=60

# ===== SESSION MANAGEMENT =====
SESSION_CLEANUP_INTERVAL=300000
SESSION_MAX_IDLE_TIME=3600000

# ===== WEBHOOK RETRY =====
WEBHOOK_RETRY_ATTEMPTS=3
WEBHOOK_RETRY_DELAY=1000

# ===== API CONNECTION =====
API_BASE_URL="https://api.tudominio.com/api"

# ===== LOGGING =====
LOG_LEVEL="info"

# ===== DEBUG (solo desarrollo) =====
DEBUG_WHATSAPP=false
DEBUG_PUPPETEER=false

# ===== FILE LIMITS =====
MAX_FILE_SIZE=10485760
```

### Checklist WhatsApp Service
- [ ] Provisionar VPS con mínimo 2GB RAM
- [ ] Instalar Node.js 18+, PM2, Redis
- [ ] Crear directorio para sesiones con permisos correctos
- [ ] Configurar todas las variables de entorno
- [ ] Instalar dependencias de Puppeteer (chromium, libs)
- [ ] Configurar PM2 con `ecosystem.config.js`
- [ ] Verificar conexión Redis
- [ ] Verificar conexión a API principal
- [ ] Probar health check en `/health`
- [ ] Configurar firewall (solo puertos necesarios)
- [ ] Configurar backup de sesiones

---

## 5. Redis (Upstash/Railway/VPS)

### Opciones de Hosting y Free Tiers

| Opción | Free Tier | Límites Free | Costo Paid |
|--------|-----------|--------------|------------|
| **Upstash** | ✅ Sí | 10K commands/día, 256MB | $0.2/100K cmds |
| **Railway** | ⚠️ Usa créditos | Parte del $5 inicial | Variable |
| **Redis Cloud** | ✅ Sí | 30MB, 30 conexiones | $5/mes+ |
| **VPS local** | ✅ Incluido | Sin límite (tu VPS) | $0 extra |

> **Recomendación Free Tier**:
> - Si tienes VPS para WhatsApp → instala Redis ahí (gratis)
> - Si no tienes VPS → usa Upstash Free (10K commands/día es suficiente para desarrollo)

### Variable
```bash
# Upstash (recomendado para empezar)
REDIS_URL="rediss://default:[PASSWORD]@[REGION].upstash.io:6379"

# Railway (si ya usas Railway)
REDIS_URL="redis://default:[PASSWORD]@[HOST].railway.internal:6379"

# VPS local (si Redis está en el mismo VPS que WhatsApp)
REDIS_URL="redis://localhost:6379"

# Redis Cloud
REDIS_URL="redis://default:[PASSWORD]@[HOST].redis.cloud:6379"
```

### Checklist Redis
- [ ] Elegir proveedor (Upstash recomendado para free tier)
- [ ] Crear cuenta y base de datos
- [ ] Copiar URL de conexión (incluye password)
- [ ] Verificar conexión desde WhatsApp Service
- [ ] (VPS) Instalar Redis: `apt install redis-server`
- [ ] (VPS) Configurar persistencia en `/etc/redis/redis.conf`

---

## 6. Generadores de Secrets

### Comandos para generar secrets seguros
```bash
# JWT_SECRET (64 caracteres)
openssl rand -base64 64

# NEXTAUTH_SECRET (32 caracteres)
openssl rand -base64 32

# ENCRYPTION_KEY (exactamente 32 caracteres)
openssl rand -hex 16

# WEBHOOK_SECRET
openssl rand -hex 32
```

---

## 7. Checklist Final Pre-Deploy

### Seguridad
- [ ] Todos los secrets generados con comandos seguros
- [ ] No hay secrets hardcodeados en código
- [ ] `.env` está en `.gitignore`
- [ ] Variables sensibles NO tienen prefijo `NEXT_PUBLIC_`
- [ ] JWT_SECRET es el mismo en API y WhatsApp Service
- [ ] WEBHOOK_SECRET es el mismo en API y WhatsApp Service

### Conectividad
- [ ] Dashboard puede conectar a API (NEXT_PUBLIC_API_URL)
- [ ] API puede conectar a Database (DATABASE_URL)
- [ ] API puede conectar a WhatsApp Service (WHATSAPP_SERVICE_URL)
- [ ] WhatsApp Service puede conectar a Redis (REDIS_URL)
- [ ] WhatsApp Service puede conectar a API (API_BASE_URL)

### Dominios
- [ ] tudominio.com → Dashboard (Vercel)
- [ ] api.tudominio.com → API (Railway/Fly.io)
- [ ] whatsapp.tudominio.com → WhatsApp Service (VPS) [opcional, puede ser IP]

### Clerk
- [ ] Usando claves de PRODUCCION (pk_live_, sk_live_)
- [ ] URLs de redirect apuntan a dominio producción
- [ ] Webhook configurado en Clerk Dashboard

---

## 8. Clerk (Autenticación)

### Free Tier vs Paid

| Característica | Free | Pro ($25/mes) |
|----------------|------|---------------|
| MAU (usuarios activos) | 10,000 | 10,000 incluidos |
| Usuarios extra | ❌ | $0.02/MAU |
| Custom Domains | ✅ | ✅ |
| Branding removido | ❌ "Secured by Clerk" | ✅ |
| MFA | ✅ | ✅ |
| Social OAuth | ✅ | ✅ |

> **Tip Free Tier**: 10,000 MAU es suficiente para la mayoría de proyectos pequeños/medianos. El branding de Clerk en el login es mínimo y no afecta funcionalidad.

### Checklist Clerk
- [ ] Crear cuenta en clerk.com
- [ ] Crear nueva aplicación
- [ ] Elegir métodos de autenticación (Email, Google, etc.)
- [ ] Copiar `CLERK_SECRET_KEY` (sk_live_...)
- [ ] Copiar `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (pk_live_...)
- [ ] Configurar webhook para sincronización con tu API
- [ ] Copiar `CLERK_WEBHOOK_SECRET` (whsec_...)
- [ ] Configurar URLs de redirect para producción

---

## 9. OpenRouter / AI Provider

### Opciones de Pricing

| Provider | Modelo | Costo aproximado |
|----------|--------|------------------|
| **OpenRouter** | gpt-oss-120b | ~$0.001/request |
| **OpenRouter** | claude-3-haiku | ~$0.00025/1K tokens |
| **OpenAI** | gpt-3.5-turbo | $0.002/1K tokens |
| **Google** | gemini-1.5-flash | $0.000125/1K tokens |

> **Recomendación**: OpenRouter es pay-as-you-go sin mínimo. Para desarrollo, el costo es prácticamente $0 (centavos por cientos de requests).

### Checklist AI Provider
- [ ] Crear cuenta en OpenRouter (openrouter.ai)
- [ ] Agregar créditos ($5-10 para empezar)
- [ ] Generar API key
- [ ] Configurar `OPENROUTER_API_KEY`

---

## 10. Orden de Configuración

### Para Free Tier / Desarrollo

```
1. Supabase Free    → Crear proyecto, obtener DATABASE_URL y DIRECT_URL
2. Clerk Free       → Crear app, obtener keys (usar development keys primero)
3. Vercel Hobby     → Conectar repo, deploy automático
4. Railway Trial    → Crear proyecto API, usar $5 créditos
5. OpenRouter       → Crear cuenta, agregar $5 créditos
6. Generar Secrets  → JWT_SECRET, NEXTAUTH_SECRET, etc.
7. Configurar Vars  → En cada plataforma
8. Probar           → Health checks, login básico
9. (Opcional) VPS   → Solo si necesitas WhatsApp
10. (Opcional) Redis → Upstash free o en VPS
```

### Para Producción

```
1. Supabase Pro     → Crear proyecto, configurar backups
2. Clerk            → Usar production keys (pk_live_, sk_live_)
3. Redis            → Provisionar Upstash o en VPS
4. OpenRouter       → Agregar créditos suficientes
5. Generar Secrets  → Todos los secrets de producción
6. Configurar Vars  → En cada plataforma
7. Deploy DB        → Ejecutar migraciones
8. Deploy API       → Railway o Fly.io
9. Deploy Dashboard → Vercel con custom domain
10. Deploy WhatsApp → VPS con PM2
11. Verificar       → Health checks, login, webhooks
```

---

## Resumen: Costo Mínimo para Empezar

```
┌─────────────────────────────────────────────────────────────┐
│  OPCIÓN 1: Solo Dashboard + API (sin WhatsApp)              │
│  ─────────────────────────────────────────────              │
│  Vercel Hobby     $0                                        │
│  Supabase Free    $0                                        │
│  Railway Trial    $0 (por ~1 mes)                           │
│  Clerk Free       $0                                        │
│  OpenRouter       ~$1-2 (pay as you go)                     │
│  ─────────────────────────────────────────────              │
│  TOTAL:           ~$0-2/mes                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  OPCIÓN 2: Stack Completo con WhatsApp                      │
│  ─────────────────────────────────────────────              │
│  Vercel Hobby     $0                                        │
│  Supabase Free    $0                                        │
│  Railway          $5/mes (después del trial)                │
│  Clerk Free       $0                                        │
│  OpenRouter       ~$1-2                                     │
│  VPS (Hetzner)    $4/mes                                    │
│  Redis (en VPS)   $0                                        │
│  ─────────────────────────────────────────────              │
│  TOTAL:           ~$10/mes                                  │
└─────────────────────────────────────────────────────────────┘
```

---

_Checklist generado para LeadsCRM v2.2.0_
