# Documentacion LeadsCRM

_Indice maestro de documentacion - Ultima actualizacion: Febrero 2026_

---

## Documentacion por Categorias

### [Getting Started](./getting-started/)

_Configuracion inicial y setup del proyecto_

| Documento                                                                              | Descripcion                       |
| -------------------------------------------------------------------------------------- | --------------------------------- |
| [`getting-started/README.md`](./getting-started/README.md)                             | **Guia de setup completa**        |
| [`getting-started/database-setup.md`](./getting-started/database-setup.md)             | Configuracion PostgreSQL/Supabase |
| [`getting-started/authentication-setup.md`](./getting-started/authentication-setup.md) | Setup completo de Clerk           |
| [`getting-started/quick-setup.md`](./getting-started/quick-setup.md)                   | Setup rapido                      |

### [Architecture](./architecture/)

_Diseno y arquitectura del sistema_

| Documento                                                              | Descripcion                       |
| ---------------------------------------------------------------------- | --------------------------------- |
| [`architecture/README.md`](./architecture/README.md)                   | **Guia completa de arquitectura** |
| [`architecture/system-overview.md`](./architecture/system-overview.md) | Vision general del sistema        |
| [`architecture/system-diagrams.md`](./architecture/system-diagrams.md) | Diagramas visuales del sistema    |

### [Features](./features/)

_Funcionalidades del sistema_

| Documento                                                                | Descripcion                               |
| ------------------------------------------------------------------------ | ----------------------------------------- |
| [`features/README.md`](./features/README.md)                             | **Indice de todas las funcionalidades**   |
| [`features/whatsapp-integration.md`](./features/whatsapp-integration.md) | **Sistema WhatsApp completo + whitelist** |
| [`features/ai-configuration.md`](./features/ai-configuration.md)         | IA multi-proveedor y templates            |
| [`features/authentication.md`](./features/authentication.md)             | Sistema de autenticacion Clerk            |
| [`features/complete-feature-guide.md`](./features/complete-feature-guide.md) | Guia completa de features             |

### [Development](./development/)

_Guias para desarrolladores_

| Documento                                                                                | Descripcion                            |
| ---------------------------------------------------------------------------------------- | -------------------------------------- |
| [`development/coding-guidelines.md`](./development/coding-guidelines.md)                 | **Standards y convenciones de codigo** |
| [`development/build-optimizations.md`](./development/build-optimizations.md)             | Optimizaciones de build                |
| [`development/ai-development-guidelines.md`](./development/ai-development-guidelines.md) | Desarrollo con IA                      |
| [`development/TROUBLESHOOTING.md`](./development/TROUBLESHOOTING.md)                     | FAQ y solucion de problemas            |
| [`development/DEBUG_SOLUTIONS.md`](./development/DEBUG_SOLUTIONS.md)                     | Soluciones especificas de debugging    |
| [`development/PRACTICAL_EXAMPLES.md`](./development/PRACTICAL_EXAMPLES.md)               | Ejemplos practicos de uso              |

### [Deployment](./deployment/)

_Deploy y operaciones en produccion_

| Documento                                                                    | Descripcion                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------- |
| [`deployment/INFRASTRUCTURE.md`](./deployment/INFRASTRUCTURE.md)             | **Arquitectura completa (Vercel+Hetzner+Supabase)** |
| [`deployment/monitoring.md`](./deployment/monitoring.md)                     | Monitoreo y alertas                               |
| [`deployment/backup-recovery.md`](./deployment/backup-recovery.md)           | Backup y recovery                                 |
| [`deployment/security-guide.md`](./deployment/security-guide.md)             | Seguridad y RLS                                   |

### [Reference](./reference/)

_Referencias rapidas y consulta_

| Documento                                                          | Descripcion                    |
| ------------------------------------------------------------------ | ------------------------------ |
| [`reference/README.md`](./reference/README.md)                     | **Quick reference y comandos** |
| [`reference/all-commands.md`](./reference/all-commands.md)         | Todos los comandos             |
| [`reference/environment-vars.md`](./reference/environment-vars.md) | Variables de entorno           |
| [`reference/project-status.md`](./reference/project-status.md)     | Estado del proyecto            |

---

## Navegacion Rapida por Casos de Uso

### Nuevo en el Proyecto

1. [`getting-started/README.md`](./getting-started/README.md) - Setup completo
2. [`features/README.md`](./features/README.md) - Conoce las funcionalidades
3. [`architecture/README.md`](./architecture/README.md) - Entender la arquitectura

### Desarrollador

1. [`development/coding-guidelines.md`](./development/coding-guidelines.md) - Standards de codigo
2. [`development/build-optimizations.md`](./development/build-optimizations.md) - Performance
3. [`development/TROUBLESHOOTING.md`](./development/TROUBLESHOOTING.md) - Solucion de problemas

### Deploy y Produccion

1. [`deployment/INFRASTRUCTURE.md`](./deployment/INFRASTRUCTURE.md) - Arquitectura de produccion
2. [`deployment/monitoring.md`](./deployment/monitoring.md) - Monitoreo
3. [`deployment/security-guide.md`](./deployment/security-guide.md) - Seguridad

---

## Estructura

```
docs/
├── getting-started/     Setup y configuracion inicial (3 archivos)
├── architecture/        Sistema y diagramas (2 archivos)
├── features/            Funcionalidades principales (4 archivos)
├── development/         Guias para desarrolladores (6 archivos)
├── deployment/          Deploy y produccion (4 archivos)
└── reference/           Referencias rapidas (3 archivos)
```

---

_Ultima actualizacion: Febrero 2026_
