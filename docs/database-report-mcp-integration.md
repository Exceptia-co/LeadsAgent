# 📊 Reporte de Base de Datos LeadsAgent - Integración MCP

## ✅ Estado de Conexión Supabase MCP
- **Estado**: ✅ **CONECTADO Y FUNCIONANDO**
- **Servidor MCP**: Activo y respondiendo correctamente
- **Tablas detectadas**: 8 tablas principales
- **Fecha de análisis**: 22 de Agosto, 2025

---

## 🗃️ Esquema de Base de Datos

### 1. **users** - Sistema de Usuarios
**Propósito**: Gestión de usuarios con integración Clerk

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | UUID | PK, NOT NULL | Identificador único del usuario |
| `clerkId` | TEXT | NOT NULL | ID de usuario en Clerk |
| `email` | TEXT | NOT NULL | Correo electrónico |
| `name` | TEXT | NOT NULL | Nombre del usuario |
| `role` | UserRole | NOT NULL, DEFAULT 'AGENT' | Rol (ADMIN, AGENT) |
| `createdAt` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updatedAt` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Fecha de actualización |

**Estadísticas**: ~0 registros estimados

---

### 2. **leads** - Gestión de Leads
**Propósito**: Sistema central de gestión de leads y prospectos

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | UUID | PK, NOT NULL | Identificador único del lead |
| `phone` | TEXT | NOT NULL | Número de teléfono |
| `name` | TEXT | NULLABLE | Nombre del lead |
| `email` | TEXT | NULLABLE | Correo electrónico |
| `tags` | TEXT[] | DEFAULT [] | Etiquetas del lead |
| `status` | LeadStatus | NOT NULL, DEFAULT 'NUEVO' | Estado (NUEVO, CONTACTADO, QUALIFIED, GANADO, PERDIDO) |
| `moodScore` | FLOAT8 | NULLABLE | Puntuación de estado de ánimo |
| `lastContact` | TIMESTAMP | NULLABLE | Último contacto |
| `assignedTo` | TEXT | NULLABLE | Asignado a |
| `source` | TEXT | NOT NULL, DEFAULT 'whatsapp' | Fuente del lead |
| `whatsappAuthorized` | BOOLEAN | NOT NULL, DEFAULT false | Autorización WhatsApp |
| `createdAt` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updatedAt` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Fecha de actualización |

**Estadísticas**: ~2 registros estimados
**Relaciones**: 
- → `messages.leadId` (1:N)
- → `campaign_leads.leadId` (1:N)

---

### 3. **messages** - Sistema de Mensajería
**Propósito**: Almacenamiento y gestión de mensajes

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | UUID | PK, NOT NULL | Identificador único del mensaje |
| `leadId` | UUID | FK, NOT NULL | Referencia al lead |
| `content` | TEXT | NOT NULL | Contenido del mensaje |
| `type` | MessageType | NOT NULL, DEFAULT 'TEXT' | Tipo (TEXT, IMAGE, AUDIO, VIDEO, DOCUMENT) |
| `direction` | MessageDirection | NOT NULL | Dirección (INBOUND, OUTBOUND) |
| `status` | MessageStatus | NOT NULL, DEFAULT 'SENT' | Estado (SENT, DELIVERED, READ, FAILED) |
| `timestamp` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Marca de tiempo |
| `aiAnalyzed` | BOOLEAN | NOT NULL, DEFAULT false | Analizado por IA |
| `sentiment` | TEXT | NULLABLE | Análisis de sentimiento |
| `confidence` | FLOAT8 | NULLABLE | Confianza del análisis |
| `autoResponse` | BOOLEAN | NOT NULL, DEFAULT false | Respuesta automática |
| `externalId` | TEXT | NULLABLE | ID externo |
| `vendor` | TEXT | NOT NULL, DEFAULT 'whatsapp' | Proveedor |

**Estadísticas**: ~0 registros estimados
**Relaciones**: 
- ← `leads.id` (N:1)

---

### 4. **campaigns** - Gestión de Campañas
**Propósito**: Sistema de campañas de marketing

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | UUID | PK, NOT NULL | Identificador único de campaña |
| `name` | TEXT | NOT NULL | Nombre de la campaña |
| `description` | TEXT | NULLABLE | Descripción |
| `status` | CampaignStatus | NOT NULL, DEFAULT 'ACTIVE' | Estado (ACTIVE, PAUSED, COMPLETED) |
| `template` | TEXT | NULLABLE | Plantilla de mensaje |
| `createdBy` | TEXT | NOT NULL | Creado por |
| `createdAt` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updatedAt` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Fecha de actualización |

**Estadísticas**: ~0 registros estimados
**Relaciones**: 
- → `campaign_leads.campaignId` (1:N)

---

### 5. **campaign_leads** - Relación Campañas-Leads
**Propósito**: Tabla de unión entre campañas y leads

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | UUID | PK, NOT NULL | Identificador único |
| `leadId` | UUID | FK, NOT NULL | Referencia al lead |
| `campaignId` | UUID | FK, NOT NULL | Referencia a la campaña |
| `status` | TEXT | NOT NULL, DEFAULT 'PENDING' | Estado del envío |
| `sentAt` | TIMESTAMP | NULLABLE | Fecha de envío |
| `deliveredAt` | TIMESTAMP | NULLABLE | Fecha de entrega |

**Estadísticas**: ~0 registros estimados
**Relaciones**: 
- ← `leads.id` (N:1)
- ← `campaigns.id` (N:1)

---

### 6. **whatsapp_conversations** - Conversaciones WhatsApp
**Propósito**: Registro de conversaciones de WhatsApp

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | UUID | PK, NOT NULL | Identificador único |
| `session_id` | VARCHAR | NOT NULL | ID de sesión |
| `phone_number` | VARCHAR | NOT NULL | Número de teléfono |
| `contact_name` | VARCHAR | NULLABLE | Nombre del contacto |
| `message_text` | TEXT | NULLABLE | Texto del mensaje |
| `response_text` | TEXT | NULLABLE | Texto de respuesta |
| `message_type` | VARCHAR | DEFAULT 'text' | Tipo de mensaje |
| `intent` | VARCHAR | NULLABLE | Intención detectada |
| `sentiment` | VARCHAR | NULLABLE | Sentimiento |
| `ai_provider` | VARCHAR | NULLABLE | Proveedor de IA |
| `tokens_used` | INTEGER | DEFAULT 0 | Tokens utilizados |
| `is_from_user` | BOOLEAN | DEFAULT true | Del usuario |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Fecha de creación |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Fecha de actualización |

**Estadísticas**: ~0 registros estimados

---

### 7. **whatsapp_whitelist_logs** - Logs de Autorización WhatsApp
**Propósito**: Registro de decisiones de whitelist para WhatsApp

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | UUID | PK, NOT NULL | Identificador único |
| `phone_number` | VARCHAR | NOT NULL | Número de teléfono |
| `session_id` | VARCHAR | NULLABLE | ID de sesión |
| `decision` | VARCHAR | NOT NULL, CHECK ('ALLOWED', 'BLOCKED') | Decisión tomada |
| `reason` | TEXT | NULLABLE | Razón de la decisión |
| `lead_id` | VARCHAR | NULLABLE | ID del lead |
| `lead_name` | VARCHAR | NULLABLE | Nombre del lead |
| `message_preview` | TEXT | NULLABLE | Vista previa del mensaje |
| `ai_provider` | VARCHAR | NULLABLE | Proveedor de IA |
| `ip_address` | VARCHAR | NULLABLE | Dirección IP |
| `user_agent` | TEXT | NULLABLE | User Agent |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Fecha de creación |

**Estadísticas**: ~0 registros estimados

---

### 8. **_prisma_migrations** - Control de Migraciones
**Propósito**: Sistema interno de Prisma para control de migraciones

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | VARCHAR | PK, NOT NULL | ID de migración |
| `checksum` | VARCHAR | NOT NULL | Checksum de migración |
| `finished_at` | TIMESTAMPTZ | NULLABLE | Fecha de finalización |
| `migration_name` | VARCHAR | NOT NULL | Nombre de migración |
| `logs` | TEXT | NULLABLE | Logs de migración |
| `rolled_back_at` | TIMESTAMPTZ | NULLABLE | Fecha de rollback |
| `started_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Fecha de inicio |
| `applied_steps_count` | INTEGER | NOT NULL, DEFAULT 0 | Pasos aplicados |

**Estadísticas**: ~2 registros estimados

---

## 🔗 Diagrama de Relaciones

```
users
├── clerkId (unique identifier)
└── role (UserRole: ADMIN, AGENT)

leads
├── id → messages.leadId (1:N)
├── id → campaign_leads.leadId (1:N)
├── status (LeadStatus: NUEVO, CONTACTADO, QUALIFIED, GANADO, PERDIDO)
└── whatsappAuthorized (boolean)

messages
├── leadId → leads.id (N:1)
├── type (MessageType: TEXT, IMAGE, AUDIO, VIDEO, DOCUMENT)
├── direction (MessageDirection: INBOUND, OUTBOUND)
└── status (MessageStatus: SENT, DELIVERED, READ, FAILED)

campaigns
├── id → campaign_leads.campaignId (1:N)
└── status (CampaignStatus: ACTIVE, PAUSED, COMPLETED)

campaign_leads
├── leadId → leads.id (N:1)
└── campaignId → campaigns.id (N:1)

whatsapp_conversations
├── session_id
└── ai_provider

whatsapp_whitelist_logs
├── decision (ALLOWED/BLOCKED)
└── phone_number
```

---

## 🔧 Configuración Clerk MCP

### Pasos para Integrar Clerk MCP

#### 1. **Obtener Credenciales de Clerk**
- Ve a [Clerk Dashboard](https://dashboard.clerk.com/)
- Navega a tu proyecto
- Copia el **Secret Key** y **Publishable Key**

#### 2. **Configurar Claude Desktop**
Agregar al archivo `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    // ... tus configuraciones existentes ...
    "Clerk MCP": {
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "-y",
        "@clerk/mcp-server"
      ],
      "env": {
        "CLERK_SECRET_KEY": "tu_clerk_secret_key_aqui",
        "CLERK_PUBLISHABLE_KEY": "tu_clerk_publishable_key_aqui"
      }
    }
  }
}
```

#### 3. **Verificar Instalación**
```bash
# Probar la instalación de Clerk MCP
npx @clerk/mcp-server --help
```

#### 4. **Reiniciar Claude Desktop**
- Cierra completamente Claude Desktop
- Vuelve a abrir para aplicar cambios

---

## 🧪 Comandos de Prueba

### Para Supabase MCP (ya funcionando):
```bash
# Listar tablas
list_tables

# Ejecutar consulta SQL
execute_sql: "SELECT COUNT(*) FROM leads;"

# Ver migraciones
list_migrations

# Obtener logs
get_logs: {"service": "api"}
```

### Para Clerk MCP (después de configurar):
- Gestión de usuarios
- Verificación de tokens
- Creación de sesiones
- Gestión de organizaciones

---

## ⚠️ Notas de Seguridad

### Supabase MCP
- ✅ **Conectado y seguro**
- Acceso controlado a través de MCP
- Row Level Security (RLS) no habilitado en tablas actuales

### Clerk MCP
- 🔐 **Secret Key**: Mantener privado, nunca exponer
- 🌐 **Publishable Key**: Seguro para frontend
- 🔄 **Renovación**: Rotar keys periódicamente

---

## 🚨 Troubleshooting

### Problemas Comunes Supabase MCP
1. **Sin respuesta del servidor**: Verificar configuración MCP
2. **Permisos SQL**: Comprobar roles de usuario
3. **Conexión lenta**: Revisar red y región

### Problemas Comunes Clerk MCP
1. **Keys inválidos**: Verificar credenciales en dashboard
2. **Servidor no encontrado**: `npm install -g @clerk/mcp-server`
3. **Variables de entorno**: Verificar formato en config

### Diagnóstico General
```bash
# Verificar estado de servicios MCP
npx @modelcontextprotocol/inspector

# Logs de Claude Desktop
# Windows: %APPDATA%\Claude\logs
# macOS: ~/Library/Logs/Claude
```

---

## 📈 Estadísticas de Uso

| Tabla | Registros | Tamaño | Estado |
|-------|-----------|---------|--------|
| users | 0 | 32 kB | Activa |
| leads | 2 | 48 kB | Activa |
| messages | 0 | 48 kB | Activa |
| campaigns | 0 | 16 kB | Activa |
| campaign_leads | 0 | 32 kB | Activa |
| whatsapp_conversations | 0 | 40 kB | Activa |
| whatsapp_whitelist_logs | 0 | 48 kB | Activa |
| _prisma_migrations | 2 | 32 kB | Sistema |

**Total estimado**: 8 tablas, ~4 registros de datos, ~296 kB

---

## 🎯 Próximos Pasos Recomendados

1. **Configurar RLS en Supabase** para mayor seguridad
2. **Implementar Clerk MCP** siguiendo esta guía
3. **Crear índices** en campos frecuentemente consultados
4. **Establecer políticas de backup** para datos críticos
5. **Monitoreo** de performance y uso de tokens

---

*Reporte generado el 22 de Agosto, 2025 - LeadsAgent Database Analysis*
