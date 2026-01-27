# Scripts Directory 🧹 **CLEANED & ORGANIZED**

Este directorio contiene scripts utilitarios esenciales para el proyecto LeadsAgent.

## 🎯 Script Principal

### 📊 `whitelist-admin.js` - Herramienta de Administración de Whitelist

**🆕 SCRIPT TODO-EN-UNO** - Herramienta consolidada para gestionar y monitorear el sistema de whitelist

```bash
# 📊 Dashboard completo (LO MÁS USADO)
node scripts/whitelist-admin.js dashboard

# 📊 Estadísticas personalizadas
node scripts/whitelist-admin.js stats [days]     # Por defecto 7 días
node scripts/whitelist-admin.js activity [limit]  # Por defecto 10 entradas

# 👥 Gestión de leads
node scripts/whitelist-admin.js leads

# 🔓 Autorizar/Bloquear números
node scripts/whitelist-admin.js authorize +1234567890 "Cliente VIP"
node scripts/whitelist-admin.js block +1234567890 "Spam/Newsletter"

# 🧪 Testing
node scripts/whitelist-admin.js test +1234567890 "Test message"
```

## 🔧 Scripts de Soporte

### ✅ `verify-whitelist-fix.js` - Verificación del Sistema

**Para debugging y validación del esquema de base de datos**

```bash
node scripts/verify-whitelist-fix.js
```

### 🗄️ `fix-database-schema.js` - Migración Histórica

**Migración de referencia (ya aplicada) - NO ejecutar en producción**

### 🤖 `mcp-monitor.ps1` - Monitor MCP

**Script independiente para monitoreo MCP (no relacionado con whitelist)**

## 🚀 Comandos Más Usados

### 📈 Monitoreo diario:

```bash
node scripts/whitelist-admin.js dashboard
```

### 🔓 Autorizar cliente nuevo:

```bash
node scripts/whitelist-admin.js authorize +34600123456 "María García"
```

### 🔍 Investigar problema:

```bash
node scripts/whitelist-admin.js activity 20
node scripts/verify-whitelist-fix.js
```

### 🧪 Testing rápido:

```bash
node scripts/whitelist-admin.js test +34suspected123
```

## ✨ Beneficios de la Limpieza

- 🧹 **Código limpio**: Eliminados 4 scripts redundantes
- 🎯 **Funcionalidad consolidada**: Todo en `whitelist-admin.js`
- 📊 **Mejor organización**: Scripts esenciales claramente identificados
- 🚀 **Más fácil mantenimiento**: Menos archivos que gestionar

## 🛡️ Seguridad y Mantenimiento

- ✅ **Operaciones seguras**: Logging automático de todas las acciones
- 📊 **Monitoreo integrado**: Dashboard en tiempo real
- 🧪 **Testing robusto**: Validación antes de operaciones críticas
- 📝 **Documentación actualizada**: Guías siempre sincronizadas

---

📝 **Para documentación completa del sistema**: Ver `../docs/WHATSAPP_WHITELIST.md`
📊 **Para resumen ejecutivo**: Ver `../IMPLEMENTATION_SUMMARY.md`
