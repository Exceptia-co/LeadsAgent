# 🔧 Configuración y Troubleshooting MCP para Warp Terminal

**Versión**: 1.0  
**Fecha**: 28 de Agosto, 2025  
**Proyecto**: LeadsCRM  
**Usuario**: admin

## 📋 Resumen Ejecutivo

Este documento contiene la configuración completa y guía de troubleshooting para los servidores MCP (Model Context Protocol) en Warp Terminal para el proyecto LeadsCRM.

### **✅ ESTADO ACTUAL (2025-08-28):**

- **4 servidores MCP activos y estables**
- **Serena funcionando perfectamente** (2+ días de uptime)
- **Problemas de comunicación intermitentes** en algunos servidores
- **Script de monitoreo implementado y funcionando**

---

## 🎯 Servidores MCP Configurados

### **✅ SERVIDORES FUNCIONANDO:**

| Servidor              | Estado          | Uptime    | Función                      | Notas                           |
| --------------------- | --------------- | --------- | ---------------------------- | ------------------------------- |
| **serena**            | 🟢 ESTABLE      | 2d 5h 11m | Análisis semántico de código | ✅ Funciona perfectamente       |
| **mcp-server-fetch**  | 🟢 ESTABLE      | 9h 8m     | Búsquedas web y fetch        | ✅ 2 instancias activas         |
| **mcp-server-sentry** | 🟢 ESTABLE      | 6h 57m    | Monitoreo y errores          | ✅ Funcionando                  |
| **Browser MCP**       | 🟡 INTERMITENTE | Variable  | Automatización del navegador | ⚠️ Se desconecta ocasionalmente |
| **Perplexity-Ask**    | 🟡 INTERMITENTE | Variable  | Búsquedas inteligentes       | ⚠️ Problemas de canal cerrado   |

### **❌ SERVIDORES FALTANTES:**

| Servidor                | Prioridad  | Función Requerida                                             | Estado            |
| ----------------------- | ---------- | ------------------------------------------------------------- | ----------------- |
| **Supabase MCP**        | 🔴 CRÍTICA | Acceso directo a base de datos PostgreSQL de LeadsCRM         | ❌ No configurado |
| **Context7**            | 🟡 ALTA    | Documentación actualizada de librerías (Next.js, React, etc.) | ❌ No configurado |
| **Sequential Thinking** | 🟡 MEDIA   | Resolución de problemas complejos paso a paso                 | ❌ No configurado |

---

## 🔍 Diagnóstico del Problema

### **PROBLEMA PRINCIPAL IDENTIFICADO:**

Los servidores MCP están **configurados correctamente** pero experimentan **problemas de comunicación intermitentes**:

- ✅ **Procesos ejecutándose** - Los servidores están activos
- ❌ **Canal de comunicación** - Error "sending into a closed channel"
- ❌ **Timeouts** - Algunos servidores se desconectan tras inactividad
- ❌ **Reinicio requerido** - Warp necesita reinicio para reconectar

### **CAUSAS IDENTIFICADAS:**

1. **Timeout de inactividad** - Los servidores se desconectan tras períodos sin uso
2. **Problemas de stdio** - Canal de comunicación entre Warp y los servidores MCP
3. **Falta de keep-alive** - No hay mecanismo para mantener conexiones activas
4. **Configuración de Warp** - No encontramos archivo de configuración específico de Warp

---

## 📁 Estructura de Archivos y Logs

### **Ubicaciones Importantes:**

```
# Logs MCP de Warp
C:\Users\admin\AppData\Local\warp\Warp\data\logs\mcp\*.log

# Configuraciones MCP encontradas
C:\Users\admin\AppData\Roaming\Code\User\mcp.json           # VS Code
C:\Users\admin\AppData\Roaming\Trae\User\mcp.json          # Trae
C:\Users\admin\.codegpt\mcp_config.json                    # CodeGPT (vacío)
C:\Users\admin\.codeium\windsurf\mcp_config.json          # Windsurf (vacío)

# Scripts de monitoreo (CREADOS)
C:\Users\admin\Desktop\LeadsAgent\scripts\mcp-monitor.ps1
C:\Users\admin\Desktop\LeadsAgent\logs\mcp-monitor.log

# Documentación
C:\Users\admin\Desktop\LeadsAgent\MCP_WARP_CONFIG.md       # Este archivo
C:\Users\admin\Desktop\LeadsAgent\WARP.md                  # Configuración general
```

### **Logs MCP más Recientes:**

- `BhYbABxCuHKGAw3dOWOwyI.log` - Browser MCP (Puppeteer)
- `IHATEPo9JiWIrrd7hnqkEs.log` - Browser MCP v0.1.3
- `LjkJWK5avY3awjQdjKvHyO.log` - Perplexity-Ask MCP

---

## 🛠️ Soluciones Implementadas

### **1. Script de Monitoreo MCP**

**Archivo**: `scripts/mcp-monitor.ps1`  
**Función**: Monitorea el estado de los servidores MCP y proporciona herramientas de diagnóstico.

#### **Comandos Disponibles:**

```powershell
# Mostrar estado actual de servidores MCP
.\scripts\mcp-monitor.ps1 -Status

# Iniciar monitoreo continuo (cada 30 segundos)
.\scripts\mcp-monitor.ps1 -Monitor

# Instalar como tarea programada (arranque automático)
.\scripts\mcp-monitor.ps1 -Install

# Limpiar procesos MCP huérfanos
.\scripts\mcp-monitor.ps1 -Restart
```

#### **Características:**

- ✅ **Detección automática** de procesos MCP
- ✅ **Monitoreo en tiempo real** con intervalos configurables
- ✅ **Logging detallado** con timestamps
- ✅ **Instalación como tarea programada**
- ✅ **Limpieza de procesos zombie**
- ✅ **Alertas cuando fallan múltiples servidores**

### **2. Análisis de Estado de Salud**

**Salida Ejemplo del Script:**

```
[2025-08-28 17:40:24] [INFO] 🔍 Estado general: HEALTHY - Multiple MCP servers active
[2025-08-28 17:40:24] [INFO] 📊 Procesos MCP activos: 4
[2025-08-28 17:40:24] [INFO] 📋 Procesos detallados:
  • mcp-server-fetch (PID: 3604) - Uptime: 0d 9h 8m - RAM: 4.51MB
  • mcp-server-fetch (PID: 50276) - Uptime: 0d 9h 8m - RAM: 4.5MB
  • mcp-server-sentry (PID: 25276) - Uptime: 0d 6h 57m - RAM: 4.51MB
  • serena (PID: 19428) - Uptime: 2d 5h 11m - RAM: 4.49MB
```

---

## 🚀 Configuraciones MCP de Referencia

### **Configuración VS Code (Funcional):**

```json
{
  "servers": {
    "context7": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"],
      "gallery": true
    },
    "sequentialthinking": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking@latest"],
      "gallery": true
    },
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"],
      "type": "stdio"
    }
  }
}
```

### **Configuración Trae (Con GitHub y Context7):**

```json
{
  "mcpServers": {
    "GitHub": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "[REDACTED]"
      }
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"],
      "env": {
        "DEFAULT_MINIMUM_TOKENS": "10000"
      }
    }
  }
}
```

---

## 🔧 Soluciones de Problemas Comunes

### **Problema 1: "sending into a closed channel"**

**Síntomas:**

- Error al invocar herramientas MCP
- Servidores se desconectan inesperadamente

**Solución:**

```powershell
# 1. Reiniciar completamente Warp
# Cerrar Warp → Esperar 5 segundos → Reabrir

# 2. Limpiar procesos huérfanos
.\scripts\mcp-monitor.ps1 -Restart

# 3. Verificar estado después del reinicio
.\scripts\mcp-monitor.ps1 -Status
```

### **Problema 2: "server exited" en logs**

**Síntomas:**

- Logs muestran "MCP CLI: server exited"
- Herramientas MCP no responden

**Solución:**

```powershell
# Monitoreo continuo para detectar caídas
.\scripts\mcp-monitor.ps1 -Monitor

# Instalar monitoreo automático
.\scripts\mcp-monitor.ps1 -Install
```

### **Problema 3: Servidores MCP faltantes**

**Síntomas:**

- Herramientas específicas no disponibles
- Error "tool not found"

**Solución:**

1. **Configurar Supabase MCP** (pendiente)
2. **Configurar Context7** (pendiente)
3. **Configurar Sequential Thinking** (pendiente)

---

## ⚡ Comandos de Diagnóstico Rápido

### **Verificar Estado MCP:**

```powershell
# Estado actual de procesos MCP
Get-Process | Where-Object {$_.ProcessName -like "*mcp*" -or $_.ProcessName -like "*serena*"}

# Logs más recientes
Get-ChildItem "$env:USERPROFILE\AppData\Local\warp\Warp\data\logs\mcp" | Sort-Object LastWriteTime -Descending | Select-Object -First 5

# Estado con script personalizado
.\scripts\mcp-monitor.ps1 -Status
```

### **Limpiar Procesos MCP:**

```powershell
# Terminar todos los procesos MCP
Get-Process | Where-Object {$_.ProcessName -like "*mcp*"} | Stop-Process -Force

# Usar script personalizado (más seguro)
.\scripts\mcp-monitor.ps1 -Restart
```

### **Verificar Warp:**

```powershell
# Verificar si Warp está ejecutándose
Get-Process -Name "warp" -ErrorAction SilentlyContinue

# Ver procesos relacionados con Warp
Get-Process | Where-Object {$_.ProcessName -like "*warp*"}
```

---

## 📊 Herramientas MCP Disponibles

### **✅ SERENA (Análisis de Código):**

- `activate_project` - Activar proyecto para análisis
- `list_dir` - Listar directorios
- `find_symbol` - Buscar símbolos en código
- `read_file` - Leer archivos
- `create_text_file` - Crear archivos
- `get_symbols_overview` - Vista general de símbolos

### **✅ BROWSER MCP:**

- `browser_navigate` - Navegar a URL
- `browser_screenshot` - Capturar pantalla
- `browser_click` - Hacer click en elementos
- `browser_type` - Escribir texto
- `browser_wait` - Esperar tiempo específico

### **⚠️ PERPLEXITY-ASK (Intermitente):**

- `perplexity_ask` - Búsquedas inteligentes web

### **⚠️ MCP-SERVER-FETCH:**

- Herramientas de fetch web (detalles por confirmar)

---

## 🎯 Plan de Acción Futuro

### **Prioridad ALTA:**

1. **Configurar Supabase MCP** para acceso directo a base de datos LeadsCRM
2. **Resolver problemas de keep-alive** para conexiones estables
3. **Implementar health checks automáticos**

### **Prioridad MEDIA:**

1. **Configurar Context7** para documentación actualizada
2. **Configurar Sequential Thinking** para resolución de problemas
3. **Optimizar configuración de timeouts**

### **Prioridad BAJA:**

1. **Documentar configuraciones específicas de Warp**
2. **Crear scripts de backup y restauración**
3. **Implementar notificaciones automáticas**

---

## 🚨 Troubleshooting de Emergencia

### **Si TODOS los servidores MCP fallan:**

1. **Verificar Warp:**

   ```powershell
   Get-Process -Name "warp" -ErrorAction SilentlyContinue
   ```

2. **Reiniciar Warp completamente:**
   - Cerrar todas las ventanas de Warp
   - Esperar 10 segundos
   - Volver a abrir Warp

3. **Verificar con script:**

   ```powershell
   .\scripts\mcp-monitor.ps1 -Status
   ```

4. **Si persiste el problema:**
   ```powershell
   .\scripts\mcp-monitor.ps1 -Restart
   .\scripts\mcp-monitor.ps1 -Install  # Para monitoreo automático
   ```

### **Si solo Serena funciona:**

Serena es el servidor más estable. Úsalo como referencia:

```
# Probar Serena
list_dir con path="."
activate_project con project="C:\Users\admin\Desktop\LeadsAgent"
```

### **Logs de Error Comunes:**

| Error                           | Causa                         | Solución                            |
| ------------------------------- | ----------------------------- | ----------------------------------- |
| "server exited"                 | Timeout/Inactividad           | Reiniciar Warp                      |
| "sending into a closed channel" | Canal de comunicación cerrado | Restart MCP processes               |
| "Internal error occurred"       | Error del servidor MCP        | Verificar logs específicos          |
| Tool "cancelled"                | Timeout de herramienta        | Usar herramienta más simple primero |

---

## 📚 Referencias y Enlaces

- **Warp Terminal**: https://www.warp.dev/
- **MCP Documentation**: https://docs.warp.dev/knowledge-and-collaboration/mcp
- **Serena**: https://github.com/oraios/serena
- **Context7**: https://github.com/upstash/context7-mcp
- **Perplexity MCP**: https://github.com/modelcontextprotocol/servers

---

## 📝 Historial de Cambios

| Fecha      | Versión | Cambios                                                      |
| ---------- | ------- | ------------------------------------------------------------ |
| 2025-08-28 | 1.0     | Documento inicial, diagnóstico completo, script de monitoreo |

---

## ✅ Checklist de Verificación MCP

**Antes de usar MCP:**

- [ ] Warp Terminal está ejecutándose
- [ ] Al menos un servidor MCP está activo (`.\scripts\mcp-monitor.ps1 -Status`)
- [ ] Logs de MCP no muestran errores recientes
- [ ] Serena responde correctamente (`list_dir` test)

**Si hay problemas:**

- [ ] Reiniciar Warp Terminal
- [ ] Esperar 30 segundos para reconexión automática
- [ ] Verificar estado con script de monitoreo
- [ ] Limpiar procesos huérfanos si es necesario

---

**🎯 Este documento debe actualizarse cuando:**

- Se configuren nuevos servidores MCP
- Se resuelvan los problemas de keep-alive
- Se encuentre la configuración específica de Warp
- Se implementen mejoras en el script de monitoreo
