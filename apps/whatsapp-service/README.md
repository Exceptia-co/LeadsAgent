# 📱 WhatsApp Service Testing Guide

Este servicio permite automatizar WhatsApp Web a través de APIs REST. Aquí te explico cómo probarlo con tu móvil.

## 🚀 Inicio Rápido

### 1. Iniciar el Servicio

```bash
cd apps/whatsapp-service
pnpm dev
```

El servicio estará disponible en: `http://localhost:3002`

### 2. Probar la API

Puedes usar el script de prueba automatizado:

```bash
# Hacer ejecutable el script (solo la primera vez)
chmod +x test-api.sh

# Ejecutar el test completo
./test-api.sh
```

### 3. Test Manual con cURL

Si prefieres probar manualmente:

#### Health Check
```bash
curl http://localhost:3002/api/v1/health
```

#### Crear Sesión
```bash
curl -X POST http://localhost:3002/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "mi-sesion-test"}'
```

#### Obtener QR Code
```bash
curl http://localhost:3002/api/v1/sessions/mi-sesion-test/qr
```

#### Verificar Estado de Sesión
```bash
curl http://localhost:3002/api/v1/sessions/mi-sesion-test
```

#### Enviar Mensaje (una vez conectado)
```bash
curl -X POST http://localhost:3002/api/v1/sessions/mi-sesion-test/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5491123456789",
    "message": "¡Hola! Este es un mensaje de prueba desde LeadsCRM 🚀"
  }'
```

#### Listar Todas las Sesiones
```bash
curl http://localhost:3002/api/v1/sessions
```

#### Eliminar Sesión
```bash
curl -X DELETE http://localhost:3002/api/v1/sessions/mi-sesion-test
```

## 📱 Conectar tu WhatsApp

### Paso 1: Crear la Sesión
Ejecuta la creación de sesión con la API. Esto iniciará el proceso de Puppeteer y WhatsApp Web.

### Paso 2: Obtener el QR Code
La API te devolverá un QR code en formato string. Este código se actualiza cada cierto tiempo si no es escaneado.

### Paso 3: Escanear con tu Móvil
1. Abre WhatsApp en tu teléfono
2. Ve a **Configuración** > **Dispositivos Vinculados**
3. Toca **Vincular un dispositivo**
4. Escanea el QR code que obtuviste de la API

### Paso 4: Verificar Conexión
Una vez escaneado, el estado de la sesión debería cambiar:
- `connecting` → `authenticated` → `ready`

### Paso 5: Enviar Mensajes
¡Ya puedes enviar mensajes usando la API!

## 📋 Estados de Sesión

| Estado | Descripción |
|--------|-------------|
| `disconnected` | Sesión desconectada |
| `connecting` | Iniciando conexión |
| `connected` | Conectado a WhatsApp Web |
| `authenticated` | Autenticado con éxito |
| `ready` | ✅ Listo para enviar mensajes |
| `auth_failure` | ❌ Error de autenticación |

## 🔧 Formatos de Número de Teléfono

El servicio acepta varios formatos y los normaliza automáticamente:

- `1234567890` → Se convierte a `1234567890@c.us`
- `+541123456789` → Se convierte a `541123456789@c.us`
- `911234567` → Se convierte a `54911234567@c.us` (Argentina)

## 🚨 Resolución de Problemas

### Error: "Could not find expected browser (chrome)"
```bash
# Instalar Puppeteer con Chrome
cd apps/whatsapp-service
pnpm add puppeteer
```

### Error: "Session not ready"
- Verifica que el estado sea `ready`
- Asegúrate de haber escaneado el QR code
- Revisa que WhatsApp Web esté activo en tu móvil

### Error: "Rate limit exceeded"
- Espera 1 minuto entre requests intensivos
- El límite por defecto es 60 requests por minuto

### QR Code no aparece
- Espera 5-10 segundos después de crear la sesión
- Verifica que Puppeteer se haya instalado correctamente
- Revisa los logs del servidor para errores

## 📝 Logs y Debugging

Los logs se guardan en:
- `logs/combined.log` - Todos los logs
- `logs/error.log` - Solo errores
- Consola - En modo desarrollo

Para más debug, configura:
```bash
export LOG_LEVEL=debug
export DEBUG_WHATSAPP=true
```

## 🔐 Seguridad

- Nunca expongas este servicio directamente a Internet sin autenticación
- Usa HTTPS en producción
- Configura CORS apropiadamente
- Implementa rate limiting más estricto si es necesario

## 📊 API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/v1/health` | Health check del servicio |
| `POST` | `/api/v1/sessions` | Crear nueva sesión WhatsApp |
| `GET` | `/api/v1/sessions` | Listar todas las sesiones |
| `GET` | `/api/v1/sessions/:id` | Obtener estado de sesión |
| `GET` | `/api/v1/sessions/:id/qr` | Obtener QR code de sesión |
| `POST` | `/api/v1/sessions/:id/send` | Enviar mensaje |
| `DELETE` | `/api/v1/sessions/:id` | Eliminar sesión |

## 🎯 Próximos Pasos

Una vez que el servicio funcione correctamente:

1. **Integrar con la API principal** - Conectar con apps/api
2. **Crear webhooks** - Para recibir mensajes entrantes
3. **Implementar IA** - Respuestas automáticas con OpenAI
4. **Agregar multimedia** - Envío de imágenes, audios, documentos
5. **Dashboard UI** - Interfaz gráfica para gestionar sesiones

¡Disfruta automatizando WhatsApp! 🚀
