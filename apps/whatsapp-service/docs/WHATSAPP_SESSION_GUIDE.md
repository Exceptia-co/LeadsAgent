# Guía de Sesiones WhatsApp - Solución de Errores EBUSY

## Problema Común: Error EBUSY: resource busy or locked

### ¿Qué significa este error?

El error `EBUSY: resource busy or locked, unlink 'lockfile'` ocurre cuando WhatsApp Web.js intenta eliminar archivos de sesión que están siendo utilizados por otro proceso o están bloqueados por el sistema operativo Windows.

### Causas principales:

1. **Procesos Node.js zombies**: Procesos que no se cerraron correctamente
2. **Archivos LOCK de Chromium**: Chrome/Chromium mantiene archivos bloqueados
3. **Múltiples instancias**: Varias instancias intentando usar la misma sesión
4. **Cierre abrupto**: La aplicación se cerró sin limpiar las sesiones

## ✅ Solución Implementada

Hemos implementado una solución robusta que incluye:

### 1. Utilidad de Limpieza Segura (`SessionCleanupUtil`)

- **Reintentos automáticos**: 3 intentos con delays incrementales
- **Limpieza específica**: Elimina archivos problemáticos primero
- **Manejo de errores**: Continúa funcionando aunque algunos archivos fallen

### 2. Mejora del método `destroySession`

```typescript
// Antes (problemático)
await client.destroy()
this.clients.delete(sessionId)

// Ahora (robusto)
try {
  await client.destroy()
} catch (clientError) {
  logger.warn('Error destroying client:', clientError)
  // Continúa con limpieza
}
await SessionCleanupUtil.cleanupSession(sessionId, './sessions')
```

### 3. Script CLI de Mantenimiento

```bash
# Ver estado de sesiones
npm run cleanup-sessions status

# Limpiar sesión específica
npm run cleanup-sessions cleanup test

# Limpiar todas las sesiones huérfanas
npm run cleanup-sessions cleanup-all

# Forzar limpieza (detiene procesos Node.js)
npm run cleanup-sessions force-cleanup test
```

## 🔧 Uso de las Herramientas

### Verificar Estado de Sesiones

```bash
cd apps/whatsapp-service
npm run cleanup-sessions status
```

**Output esperado:**
```
🔍 Estado de las sesiones de WhatsApp:

📱 test:
   Estado: 🔒 CON LOCKS (15 locks)
   Tamaño: 12.3 MB
   Modificado: 25/8/2025 14:21:20

📱 real-session:
   Estado: ✅ LIMPIO (0 locks)
   Tamaño: 8.7 MB
   Modificado: 23/8/2025 19:01:15
```

### Limpiar Sesiones Problemáticas

```bash
# Limpiar sesión específica
npm run cleanup-sessions cleanup test

# Limpiar todas las huérfanas automáticamente
npm run cleanup-sessions cleanup-all

# Si el error persiste, forzar limpieza
npm run cleanup-sessions force-cleanup test
```

### En Código (Para Desarrolladores)

```typescript
import { SessionCleanupUtil } from './utils/sessionCleanup';

// Limpiar sesión programáticamente
await SessionCleanupUtil.cleanupSession('test', './sessions');

// Verificar sesiones huérfanas
const sessions = await SessionCleanupUtil.getSessionsStatus('./sessions');
const problematicSessions = sessions.filter(s => s.hasLockFiles);
```

## 🚨 Prevención de Errores

### 1. Manejo Correcto del Ciclo de Vida

```typescript
// ✅ Correcto: Usar el método mejorado
await whatsappService.destroySession(sessionId);

// ❌ Incorrecto: Solo eliminar el cliente
client.destroy();
```

### 2. Manejo de Señales del Sistema

```typescript
// Limpiar sesiones al cerrar la aplicación
process.on('SIGINT', async () => {
  await whatsappService.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await whatsappService.shutdown();
  process.exit(0);
});
```

### 3. Verificación Regular

```typescript
// Ejecutar limpieza periódica (ej: cada hora)
setInterval(async () => {
  await SessionCleanupUtil.cleanupOrphanedSessions('./sessions');
}, 60 * 60 * 1000);
```

## 🔍 Diagnóstico de Problemas

### Síntomas Comunes

1. **Error EBUSY durante logout**
   - ✅ Usar `force-cleanup` para sesión específica

2. **Múltiples archivos LOCK antiguos**
   - ✅ Ejecutar `cleanup-all`

3. **Sesiones no se pueden crear**
   - ✅ Verificar con `status` y limpiar si necesario

4. **Alto uso de disco**
   - ✅ Las sesiones con muchos locks suelen ocupar más espacio

### Comandos de Diagnóstico

```powershell
# Ver procesos Node.js activos
Get-Process | Where-Object {$_.ProcessName -like "*node*"}

# Ver archivos bloqueados en sesiones
Get-ChildItem "apps/whatsapp-service/sessions" -Recurse -Force | Where-Object {$_.Name -like "*lock*"}

# Terminar todos los procesos Node.js (último recurso)
Stop-Process -Name "node" -Force
```

## 📝 Mejores Prácticas

### Para Desarrollo

1. **Siempre usar el método `destroySession` mejorado**
2. **No cerrar la aplicación abruptamente durante desarrollo**
3. **Ejecutar `cleanup-sessions status` regularmente**
4. **Usar el comando `force-cleanup` si el error persiste**

### Para Producción

1. **Implementar manejo de señales del sistema**
2. **Monitorear el tamaño de las carpetas de sesiones**
3. **Configurar limpieza automática periódica**
4. **Logs detallados para debugging**

### Variables de Entorno Recomendadas

```env
# Configuración de limpieza
WHATSAPP_SESSION_CLEANUP_ENABLED=true
WHATSAPP_SESSION_CLEANUP_INTERVAL_HOURS=24
WHATSAPP_SESSION_MAX_AGE_HOURS=168  # 7 days
WHATSAPP_SESSION_MAX_LOCK_AGE_HOURS=1

# Manejo de errores
WHATSAPP_SESSION_RETRY_ATTEMPTS=3
WHATSAPP_SESSION_RETRY_DELAY_MS=2000
```

## 🆘 Solución de Emergencia

Si todas las soluciones fallan:

```bash
# 1. Detener todos los procesos Node.js
Stop-Process -Name "node" -Force

# 2. Esperar 30 segundos
Start-Sleep -Seconds 30

# 3. Eliminar manualmente la carpeta de sesiones
Remove-Item "apps/whatsapp-service/sessions" -Recurse -Force

# 4. Reiniciar la aplicación
```

## 📞 Contacto y Soporte

Si encuentras problemas no cubiertos por esta guía:

1. Revisa los logs del servicio WhatsApp
2. Ejecuta `npm run cleanup-sessions status` para diagnosticar
3. Intenta `npm run cleanup-sessions force-cleanup <sessionId>`
4. Como último recurso, elimina manualmente la carpeta de sesiones

---

**Nota**: Esta guía se basa en la implementación mejorada que maneja automáticamente los errores EBUSY. La utilidad de limpieza está diseñada para ser segura y no afectar sesiones activas.
