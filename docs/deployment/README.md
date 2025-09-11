# 🚀 Deployment - LeadsCRM

_Guías completas para deploy y operaciones en producción_

---

## 📋 **Guías de Deploy**

### 🎯 **Documentos Principales**

| Documento                                      | Descripción                      | Audiencia |
| ---------------------------------------------- | -------------------------------- | --------- |
| [`production-setup.md`](./production-setup.md) | **Setup completo de producción** | DevOps    |
| [`security-guide.md`](./security-guide.md)     | **Medidas de seguridad**         | Todos     |
| [`monitoring.md`](./monitoring.md)             | **Monitoreo y alertas**          | DevOps    |
| [`backup-recovery.md`](./backup-recovery.md)   | **Backup y recovery**            | DevOps    |

---

## 🌐 **Deploy Targets**

### **🔸 Frontend (Vercel)**

```bash
# Deploy automático desde GitHub
git push origin main

# Deploy manual
vercel --prod

# Variables de entorno en Vercel
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
```

### **🔸 Backend API (Railway/Fly.io)**

```bash
# Railway deploy
railway login
railway link
railway deploy

# Fly.io deploy
flyctl auth login
flyctl deploy
```

### **🔸 Database (Supabase)**

```bash
# Aplicar migraciones en producción
pnpm db:migrate:deploy

# Seed data inicial
pnpm db:seed

# Backup automático configurado
```

### **🔸 WhatsApp Service (VPS/Dedicated)**

```bash
# Deploy con PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

---

## ⚙️ **Variables de Entorno - Producción**

### **🔐 Requeridas para Producción**

```bash
# Base de datos
DATABASE_URL="postgresql://user:pass@host:5432/dbname?pgbouncer=true"
DIRECT_URL="postgresql://user:pass@host:5432/dbname"

# Autenticación
CLERK_SECRET_KEY="sk_live_..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_..."
CLERK_WEBHOOK_SECRET="whsec_..."

# IA Providers
AI_PROVIDER="openrouter"  # Recomendado para producción
OPENROUTER_API_KEY="sk-or-v1-..."
OPENROUTER_MODEL="openai/gpt-oss-120b"

# WhatsApp
WHATSAPP_SESSION_DIR="/app/sessions"
WHATSAPP_WEBHOOK_SECRET="ultra-secure-webhook-secret"

# Security
NODE_ENV="production"
JWT_SECRET="ultra-secure-jwt-secret-256-bits"
ENCRYPTION_KEY="32-character-encryption-key!"

# Monitoring
SENTRY_DSN="https://..."  # Opcional
DATADOG_API_KEY="..."     # Opcional
```

---

## 🛡️ **Checklist de Seguridad**

### ✅ **Pre-Deploy Security**

- [ ] Todas las claves están en variables de entorno
- [ ] No hay secrets hardcodeados en el código
- [ ] .env está en .gitignore
- [ ] Dependencias actualizadas (npm audit)
- [ ] Configuración HTTPS en todos los servicios

### ✅ **Database Security**

- [ ] Row Level Security (RLS) activado en Supabase
- [ ] Conexiones SSL enforced
- [ ] Backup automático configurado
- [ ] Acceso limitado por IP (opcional)
- [ ] Passwords seguros generados

### ✅ **API Security**

- [ ] Rate limiting activado
- [ ] CORS configurado correctamente
- [ ] Input validation en todos los endpoints
- [ ] Logs seguros (sin secrets)
- [ ] Health checks configurados

### ✅ **Frontend Security**

- [ ] CSP headers configurados
- [ ] XSS protection activado
- [ ] CSRF protection implementado
- [ ] Session management seguro
- [ ] Clerk production keys configuradas

---

## 📊 **Monitoreo y Alertas**

### **🔸 Health Checks**

```bash
# API Health
curl https://api.leadcrm.com/health

# WhatsApp Service Health
curl https://whatsapp.leadcrm.com/health

# Database Health
pnpm db:status
```

### **🔸 Métricas Críticas**

- **Uptime**: > 99.5%
- **Response Time**: < 2s promedio
- **Error Rate**: < 1%
- **Database Connections**: < 80% pool
- **Memory Usage**: < 85%

### **🔸 Alertas Configuradas**

- API down > 5 minutos
- Error rate > 5% por 10 minutos
- Database connections > 90%
- WhatsApp session disconnected
- Disk space < 15%

---

## 🔄 **Proceso de Deploy**

### **🎯 Deploy Flow Recomendado**

1. **Pre-Deploy**

   ```bash
   # Tests locales
   pnpm test
   pnpm test:e2e

   # Build verificación
   pnpm build:production

   # Security audit
   pnpm audit --audit-level moderate
   ```

2. **Staging Deploy**

   ```bash
   # Deploy a staging
   git push origin staging

   # Smoke tests en staging
   curl https://staging-api.leadcrm.com/health
   ```

3. **Production Deploy**

   ```bash
   # Deploy a producción
   git push origin main

   # Verificar servicios
   ./scripts/health-check-all.sh

   # Rollback si es necesario
   vercel rollback
   ```

### **🔸 Rollback Strategy**

```bash
# Frontend rollback (Vercel)
vercel rollback [deployment-url]

# Backend rollback (Railway)
railway rollback [deployment-id]

# Database rollback
# Solo con migraciones - ¡CUIDADO!
pnpm db:migrate:rollback
```

---

## 🏗️ **Infraestructura Recomendada**

### **🔸 Arquitectura de Producción**

```
Internet → Cloudflare → Load Balancer → Services
                           ↓
                    ┌─────────────┐
                    │   Vercel    │ ← Frontend (Next.js)
                    │  (Frontend) │
                    └─────────────┘
                           ↓
                    ┌─────────────┐
                    │   Railway   │ ← API (NestJS)
                    │  (Backend)  │
                    └─────────────┘
                           ↓
                    ┌─────────────┐
                    │   Supabase  │ ← Database (PostgreSQL)
                    │ (Database)  │
                    └─────────────┘

                    ┌─────────────┐
                    │     VPS     │ ← WhatsApp Service
                    │ (WhatsApp)  │
                    └─────────────┘
```

### **🔸 Recursos Mínimos**

- **Frontend**: Vercel Pro ($20/mes)
- **Backend**: Railway Pro ($5/mes)
- **Database**: Supabase Pro ($25/mes)
- **WhatsApp Service**: VPS 2GB RAM ($10/mes)
- **Total**: ~$60/mes

---

## 📈 **Scaling Strategy**

### **🔸 Horizontal Scaling**

```bash
# Multiple WhatsApp Service instances
PM2_INSTANCES=4 pm2 start whatsapp-service.js

# Database read replicas
DATABASE_READ_URL="postgresql://read-replica..."

# CDN para assets estáticos
NEXT_PUBLIC_CDN_URL="https://cdn.leadcrm.com"
```

### **🔸 Performance Optimizations**

- **Redis caching** para respuestas IA frecuentes
- **Connection pooling** para database
- **Image optimization** con Next.js
- **Bundle splitting** para menor tiempo de carga

---

## 🆘 **Troubleshooting de Producción**

### **🔴 Problemas Comunes**

#### **API No Responde**

```bash
# Verificar logs
railway logs --tail

# Verificar variables
railway variables

# Restart service
railway restart
```

#### **WhatsApp Sessions Perdidas**

```bash
# Verificar espacio en disco
df -h

# Backup sesiones
tar -czf sessions-backup.tar.gz /app/sessions/

# Restart con sesiones limpias
pm2 restart whatsapp-service
```

#### **Database Performance Issues**

```bash
# Verificar conexiones activas
SELECT count(*) FROM pg_stat_activity;

# Verificar queries lentas
SELECT * FROM pg_stat_statements ORDER BY mean_time DESC;

# Optimizar queries
EXPLAIN ANALYZE SELECT ...;
```

---

## 📚 **Documentación Relacionada**

### **Pre-Deploy**

- [`../getting-started/`](../getting-started/) - Setup inicial
- [`../development/`](../development/) - Testing y build
- [`../features/`](../features/) - Funcionalidades a verificar

### **Post-Deploy**

- [`../reference/`](../reference/) - Variables y comandos
- [`../TROUBLESHOOTING.md`](../TROUBLESHOOTING.md) - Debugging
- [`../technical/`](../technical/) - Documentación avanzada

### **Monitoreo**

- [`monitoring.md`](./monitoring.md) - Setup de monitoreo completo
- [`backup-recovery.md`](./backup-recovery.md) - Estrategias de backup

---

_Guías verificadas para producción - LeadsCRM v2.2.0_ ✅
