# Backup y Recovery - LeadsCRM

Estrategias de backup y procedimientos de recuperacion para produccion.

---

## Resumen de Datos Criticos

| Componente        | Ubicacion                   | Frecuencia Backup | Retencion  |
| ----------------- | --------------------------- | ----------------- | ---------- |
| Base de datos     | Supabase                    | Diario (auto)     | 7 dias     |
| Sesiones WhatsApp | VPS `/opt/leadcrm/sessions` | Diario            | 30 dias    |
| Configuracion     | `.env` files                | En cada cambio    | Indefinido |
| Codigo            | GitHub                      | En cada push      | Indefinido |

---

## 1. Backup de Base de Datos

### 1.1 Backup Automatico (Supabase)

Supabase incluye backups automaticos:

- **Free tier**: 0 dias de retencion (sin backups)
- **Pro tier**: 7 dias de retencion
- **Enterprise**: Hasta 30 dias

Para verificar:

1. Ve a [app.supabase.com](https://app.supabase.com)
2. Tu proyecto > Settings > Database > Backups

### 1.2 Backup Manual

```bash
# Desde maquina local con acceso a DB
pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d_%H%M%S).sql

# Comprimido
pg_dump "$DATABASE_URL" | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### 1.3 Backup Programado (VPS)

```bash
# Crear script
cat > /opt/leadcrm/scripts/backup-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/root/backups/db"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Cargar variables
source /opt/leadcrm/.env

# Backup
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/db_$DATE.sql.gz"

# Limpiar backups > 30 dias
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup completado: db_$DATE.sql.gz"
EOF

chmod +x /opt/leadcrm/scripts/backup-db.sh

# Agregar a crontab (diario a las 2am)
crontab -e
# Agregar linea:
# 0 2 * * * /opt/leadcrm/scripts/backup-db.sh >> /var/log/backup-db.log 2>&1
```

---

## 2. Backup de Sesiones WhatsApp

### 2.1 Importancia

Las sesiones de WhatsApp son **criticas**:

- Contienen la autenticacion de cada numero conectado
- Si se pierden, usuarios deben re-escanear QR
- No se pueden regenerar desde la API

### 2.2 Backup Manual

```bash
# Crear backup
tar -czf /root/backups/sessions-$(date +%Y%m%d).tar.gz /opt/leadcrm/sessions/

# Verificar contenido
tar -tzf /root/backups/sessions-$(date +%Y%m%d).tar.gz
```

### 2.3 Backup Automatico

```bash
# Crear script
cat > /opt/leadcrm/scripts/backup-sessions.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/root/backups/sessions"
DATE=$(date +%Y%m%d)
mkdir -p $BACKUP_DIR

# Backup
tar -czf "$BACKUP_DIR/sessions_$DATE.tar.gz" /opt/leadcrm/sessions/

# Limpiar backups > 30 dias
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup de sesiones completado: sessions_$DATE.tar.gz"
EOF

chmod +x /opt/leadcrm/scripts/backup-sessions.sh

# Agregar a crontab (diario a las 3am)
crontab -e
# Agregar linea:
# 0 3 * * * /opt/leadcrm/scripts/backup-sessions.sh >> /var/log/backup-sessions.log 2>&1
```

### 2.4 Backup Remoto (Recomendado)

```bash
# Enviar a servidor remoto via rsync
rsync -avz /root/backups/ usuario@servidor-backup:/backups/leadcrm/

# O usar rclone para S3/B2/etc
rclone sync /root/backups/ remote:leadcrm-backups/
```

---

## 3. Backup de Configuracion

### 3.1 Variables de Entorno

```bash
# NUNCA commitear .env a git
# Guardar copia segura en password manager

# Backup encriptado
gpg -c /opt/leadcrm/.env
# Crea: .env.gpg (protegido con password)

# Restaurar
gpg -d .env.gpg > .env
```

### 3.2 Configuracion de Servicios

```bash
# Backup de configs de sistema
tar -czf /root/backups/config-$(date +%Y%m%d).tar.gz \
  /etc/nginx/sites-available/ \
  /opt/leadcrm/.env \
  /opt/leadcrm/apps/whatsapp-service/ecosystem.config.js
```

---

## 4. Procedimientos de Recovery

### 4.1 Recovery de Base de Datos

```bash
# 1. Desde backup de Supabase (Dashboard)
# Ve a Settings > Database > Backups > Restore

# 2. Desde backup manual
# CUIDADO: Esto sobrescribe todos los datos
psql "$DATABASE_URL" < backup_20260126.sql

# 3. Desde backup comprimido
gunzip -c backup_20260126.sql.gz | psql "$DATABASE_URL"
```

### 4.2 Recovery de Sesiones WhatsApp

```bash
# 1. Detener servicio
pm2 stop whatsapp-service

# 2. Restaurar sesiones
cd /opt/leadcrm
rm -rf sessions/  # Eliminar sesiones corruptas
tar -xzf /root/backups/sessions/sessions_20260126.tar.gz -C /

# 3. Verificar permisos
chown -R root:root /opt/leadcrm/sessions/

# 4. Reiniciar servicio
pm2 start whatsapp-service
pm2 logs whatsapp-service --lines 50
```

### 4.3 Recovery Completo del VPS

Si el VPS se pierde completamente:

```bash
# 1. Crear nuevo VPS (ver setup-vps.sh)
curl -fsSL https://raw.githubusercontent.com/Exceptia-co/LeadsAgent/main/scripts/setup-vps.sh | bash

# 2. Clonar repositorio
git clone https://github.com/Exceptia-co/LeadsAgent.git /opt/leadcrm

# 3. Restaurar configuracion
gpg -d backup/.env.gpg > /opt/leadcrm/.env

# 4. Instalar dependencias
cd /opt/leadcrm
pnpm install
pnpm db:generate

# 5. Restaurar sesiones
tar -xzf sessions_backup.tar.gz -C /

# 6. Build y start
cd apps/whatsapp-service
pnpm build
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup

# 7. Configurar SSL
certbot --nginx -d whatsapp.tudominio.com
```

### 4.4 Rollback de Codigo

```bash
# Frontend (Vercel)
vercel rollback [deployment-url]

# Backend (Hetzner VPS)
cd /opt/leadcrm
git log --oneline -10  # Ver commits recientes
git checkout [commit-hash]
cd apps/api && pnpm build
cd ../whatsapp-service && pnpm build
pm2 restart all
```

---

## 5. Plan de Disaster Recovery

### 5.1 RTO y RPO

| Servicio          | RPO (max data loss) | RTO (max downtime)   |
| ----------------- | ------------------- | -------------------- |
| Dashboard         | 0 (Git)             | 5 min (Vercel auto)  |
| API               | 0 (Git)             | 10 min (Hetzner VPS) |
| Database          | 24h (backup diario) | 30 min               |
| WhatsApp Sessions | 24h (backup diario) | 1h                   |

### 5.2 Escenarios y Respuesta

| Escenario         | Impacto                | Respuesta                    |
| ----------------- | ---------------------- | ---------------------------- |
| Vercel caido      | Dashboard no accesible | Esperar (SLA 99.99%)         |
| Hetzner VPS caido | API no responde        | Crear nuevo VPS + restore    |
| VPS caido         | WhatsApp offline       | Crear nuevo VPS + restore    |
| DB corrupta       | Perdida de datos       | Restore desde backup         |
| Sesiones perdidas | Re-escanear QRs        | Restore o notificar usuarios |

---

## 6. Verificacion de Backups

### 6.1 Test Mensual

```bash
# 1. Descargar backup reciente
scp root@vps:/root/backups/db/db_$(date +%Y%m%d).sql.gz ./

# 2. Restaurar en DB de test
createdb test_restore
gunzip -c db_*.sql.gz | psql test_restore

# 3. Verificar datos
psql test_restore -c "SELECT count(*) FROM leads;"
psql test_restore -c "SELECT count(*) FROM users;"

# 4. Limpiar
dropdb test_restore
```

### 6.2 Checklist de Verificacion

- [ ] Backups de DB ejecutandose diariamente
- [ ] Backups de sesiones ejecutandose diariamente
- [ ] Logs de backup sin errores
- [ ] Espacio en disco > 20% libre
- [ ] Backup remoto configurado
- [ ] Test de restore exitoso (ultimo mes)
- [ ] Documentacion de recovery actualizada

---

## 7. Comandos Rapidos

```bash
# Ver ultimos backups
ls -lah /root/backups/db/
ls -lah /root/backups/sessions/

# Ver logs de backup
tail -50 /var/log/backup-db.log
tail -50 /var/log/backup-sessions.log

# Backup inmediato
/opt/leadcrm/scripts/backup-db.sh
/opt/leadcrm/scripts/backup-sessions.sh

# Espacio usado por backups
du -sh /root/backups/
```

---

## Recursos

- [Supabase Backups](https://supabase.com/docs/guides/platform/backups)
- [PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html)
- [Rclone para backup remoto](https://rclone.org/)

---

_Ultima actualizacion: 2026-01-26_
