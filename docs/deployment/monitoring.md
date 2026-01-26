# Monitoreo y Alertas - LeadsCRM

Guia para configurar monitoreo de todos los servicios en produccion.

---

## Resumen de Servicios

| Servicio  | URL Health                              | Puerto    |
| --------- | --------------------------------------- | --------- |
| Dashboard | `https://tudominio.com`                 | 443       |
| API       | `https://api.tudominio.com/health`      | 443       |
| WhatsApp  | `https://whatsapp.tudominio.com/health` | 443       |
| Database  | Via Supabase Dashboard                  | 5432/6543 |

---

## 1. Health Checks Manuales

### Script de Verificacion Rapida

```bash
# Ejecutar desde cualquier maquina
./scripts/health-check-all.sh

# O manualmente:
echo "Dashboard:" && curl -sf https://tudominio.com -o /dev/null && echo "OK" || echo "FAIL"
echo "API:" && curl -sf https://api.tudominio.com/health && echo ""
echo "WhatsApp:" && curl -sf https://whatsapp.tudominio.com/health && echo ""
```

### Verificar desde VPS

```bash
# Estado de PM2
pm2 status

# Logs en tiempo real
pm2 logs whatsapp-service --lines 50

# Monitoreo de recursos
pm2 monit
```

---

## 2. Monitoreo con Uptime Kuma (Recomendado)

### 2.1 Instalar en VPS

```bash
# Crear directorio
mkdir -p /opt/uptime-kuma
cd /opt/uptime-kuma

# Docker (recomendado)
docker run -d --restart=always -p 3001:3001 \
  -v uptime-kuma:/app/data \
  --name uptime-kuma \
  louislam/uptime-kuma:1

# Acceder en http://TU_IP:3001
```

### 2.2 Configurar Monitores

Agrega estos monitores HTTP(s):

| Nombre          | URL                                     | Intervalo |
| --------------- | --------------------------------------- | --------- |
| Dashboard       | `https://tudominio.com`                 | 60s       |
| API Health      | `https://api.tudominio.com/health`      | 30s       |
| WhatsApp Health | `https://whatsapp.tudominio.com/health` | 30s       |

### 2.3 Configurar Notificaciones

1. Ve a Settings > Notifications
2. Agrega Telegram/Discord/Email
3. Configura alertas para:
   - Servicio caido > 1 minuto
   - Respuesta > 5 segundos
   - Certificado SSL expira en < 14 dias

---

## 3. Monitoreo de Aplicacion

### 3.1 Logs Centralizados

#### Vercel (Dashboard)

- Ve a Deployments > Logs
- Filtra por `error` o `warn`

#### Railway (API)

```bash
# CLI
railway logs --tail

# Dashboard
# railway.app > Tu proyecto > Logs
```

#### VPS (WhatsApp)

```bash
# Logs de PM2
pm2 logs whatsapp-service

# Logs del sistema
journalctl -u nginx -f

# Logs de Certbot
cat /var/log/letsencrypt/letsencrypt.log
```

### 3.2 Metricas de Aplicacion

Metricas clave a monitorear:

| Metrica       | Umbral Normal | Alerta |
| ------------- | ------------- | ------ |
| Response Time | < 500ms       | > 2s   |
| Error Rate    | < 1%          | > 5%   |
| Memory Usage  | < 70%         | > 85%  |
| CPU Usage     | < 60%         | > 80%  |
| Disk Usage    | < 70%         | > 85%  |

---

## 4. Monitoreo de Base de Datos

### 4.1 Supabase Dashboard

1. Ve a [app.supabase.com](https://app.supabase.com)
2. Tu proyecto > Database > Performance

Metricas importantes:

- **Active Connections**: < 80% del pool
- **Query Performance**: < 100ms promedio
- **Disk Usage**: < 80% del plan

### 4.2 Queries Lentas

```sql
-- Ver queries mas lentas
SELECT query, mean_time, calls
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Conexiones activas
SELECT count(*) FROM pg_stat_activity;
```

---

## 5. Monitoreo de WhatsApp

### 5.1 Estado de Sesiones

```bash
# Verificar sesiones activas
ls -la /opt/leadcrm/sessions/

# Espacio usado por sesiones
du -sh /opt/leadcrm/sessions/
```

### 5.2 Eventos Criticos

Monitorear en logs:

- `Session disconnected` - Reconexion necesaria
- `QR Code generated` - Usuario necesita escanear
- `Authentication failure` - Revisar configuracion
- `Message send failed` - Verificar conexion

### 5.3 Alertas de WhatsApp

Configurar alertas para:

- Sesion desconectada > 5 minutos
- Cola de mensajes > 100
- Errores de envio > 10%

---

## 6. Alertas Automaticas

### 6.1 Alertas Recomendadas

| Evento                | Severidad | Accion                 |
| --------------------- | --------- | ---------------------- |
| Servicio caido        | Critica   | Notificacion inmediata |
| Error rate > 5%       | Alta      | Revisar logs           |
| Response > 5s         | Media     | Investigar             |
| Disk > 85%            | Media     | Limpiar/expandir       |
| SSL expira < 7d       | Alta      | Renovar certificado    |
| WhatsApp desconectado | Alta      | Reconectar sesion      |

### 6.2 Canales de Notificacion

Configurar al menos 2 canales:

1. **Telegram** (recomendado para movil)
2. **Email** (respaldo)
3. **Discord/Slack** (equipo)

---

## 7. Dashboard de Metricas

### 7.1 Metricas Clave (KPIs)

```
+------------------+------------------+------------------+
|     Uptime       |   Response Time  |   Error Rate     |
|     99.9%        |      245ms       |      0.12%       |
+------------------+------------------+------------------+
|   Messages/day   |  Active Sessions |   API Requests   |
|      1,234       |        12        |     45,678       |
+------------------+------------------+------------------+
```

### 7.2 Graficos Utiles

- Requests por hora (ultimas 24h)
- Tiempo de respuesta (percentil 95)
- Errores por tipo
- Uso de recursos (CPU/RAM/Disk)

---

## 8. Comandos Utiles

### Diagnostico Rapido

```bash
# Estado general del VPS
htop

# Uso de disco
df -h

# Memoria
free -m

# Procesos Node.js
ps aux | grep node

# Conexiones de red
netstat -tlnp
```

### Reinicio de Servicios

```bash
# WhatsApp Service
pm2 restart whatsapp-service

# Nginx
sudo systemctl restart nginx

# Todo PM2
pm2 restart all
```

---

## Checklist de Monitoreo

- [ ] Uptime Kuma instalado y configurado
- [ ] Monitores para Dashboard, API, WhatsApp
- [ ] Notificaciones configuradas (Telegram/Email)
- [ ] Alertas de SSL configuradas
- [ ] Logs accesibles en cada plataforma
- [ ] Metricas de DB en Supabase
- [ ] Script health-check-all.sh funcionando
- [ ] Documentado proceso de escalamiento

---

## Recursos Adicionales

- [Uptime Kuma Docs](https://github.com/louislam/uptime-kuma)
- [PM2 Monitoring](https://pm2.keymetrics.io/docs/usage/monitoring/)
- [Supabase Observability](https://supabase.com/docs/guides/platform/logs)
- [Vercel Analytics](https://vercel.com/docs/analytics)

---

_Ultima actualizacion: 2026-01-26_
