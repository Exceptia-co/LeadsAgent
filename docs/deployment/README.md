# Deployment - LeadsCRM

Guias de deploy y operaciones en produccion.

## Documentos

| Documento | Descripcion |
| --- | --- |
| [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) | Arquitectura completa (Vercel + Hetzner + Supabase) |
| [monitoring.md](./monitoring.md) | Monitoreo y alertas |
| [backup-recovery.md](./backup-recovery.md) | Backup y recovery |
| [security-guide.md](./security-guide.md) | Seguridad y RLS |

## Infraestructura Actual

- **Dashboard**: Vercel (cromgod.space)
- **API + WhatsApp**: Hetzner VPS (api.cromgod.space / ws.cromgod.space)
- **Base de datos**: Supabase (cloud)
- **Redis**: Docker local (puerto 6381)

Para detalles completos ver [INFRASTRUCTURE.md](./INFRASTRUCTURE.md).
