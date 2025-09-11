# 💬 WhatsApp Service - Servicio de Automatización WhatsApp

Servicio completo de automatización de WhatsApp Web construido con Node.js, TypeScript y whatsapp-web.js. Proporciona APIs REST para gestión de sesiones múltiples, mensajería, IA conversacional y analytics avanzados.

**Estado Actual:** ✅ **100% Operativo - Multi-sesión + IA integrada**

## 🚀 Características Principales

- 📱 **Multi-Sesión**: Gestión de múltiples números WhatsApp simultáneamente
- 🔄 **QR Management**: Generación y renovación automática de códigos QR
- 🤖 **IA Conversacional**: OpenRouter + Google Gemini para respuestas automáticas
- 🎨 **Templates**: Sistema de plantillas de mensajes personalizables
- 🛡️ **Whitelist Inteligente**: Filtrado automático con autorización por lead
- 📈 **Analytics**: Métricas en tiempo real y estadísticas detalladas
- 🖼️ **Multimedia**: Soporte para texto, imágenes, audio, video y documentos
- 🔗 **Webhooks**: Integración completa con API backend (puerto 3003)
- 💾 **Persistencia**: Almacenamiento local de sesiones y conversaciones

## 🔥 Inicio Rápido

### 1. Desarrollo Local

```bash
# Desde la raíz del monorepo
pnpm dev:whatsapp

# O desde este directorio
cd apps/whatsapp-service
pnpm dev

# Servicio disponible en http://localhost:3002
```

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

## 💾 Base de Datos SQLite

El servicio utiliza SQLite para almacenamiento local:

- `sessions.db`: Almacena datos de sesiones WhatsApp
- `conversations.db`: Historial de conversaciones
- `messages.db`: Cache y estado de mensajes

Rutas de acceso:
```bash
# En desarrollo
./apps/whatsapp-service/data/*.db

# En producción
./data/*.db
```

## 🤖 Integración con IA

El servicio utiliza dos modelos de IA para conversación automática:

### OpenRouter (Claude/GPT)
```typescript
// Endpoint para solicitudes conversacionales complejas
POST /api/v1/sessions/:id/ai/chat
```

### Google Gemini
```typescript
// Endpoint para solicitudes rápidas de clasificación
POST /api/v1/sessions/:id/ai/classify
```

## 🛡️ Whitelist Inteligente

La whitelist controla qué números pueden interactuar con el sistema:

```typescript
// Agregar número a whitelist
POST /api/v1/whitelist
  -d '{"phoneNumber": "5491123456789", "leadId": "lead_xyz"}'

// Verificar si número está en whitelist
GET /api/v1/whitelist/check/5491123456789
```

## 🎨 Sistema de Templates

Plantillas para mensajes predefinidos:

```typescript
// Enviar mensaje usando template
POST /api/v1/sessions/:id/send-template
  -d '{
    "to": "5491123456789", 
    "templateId": "welcome",
    "params": {"name": "Juan", "company": "ABC Corp"}
  }'
```

## 📛 Estados de Sesión

| Estado | Descripción |
|--------|-------------|
| `disconnected` | Sesión desconectada |
| `connecting` | Iniciando conexión |
| `connected` | Conectado a WhatsApp Web |
| `authenticated` | Autenticado con éxito |
| `ready` | ✅ Listo para enviar mensajes |
| `auth_failure` | ❌ Error de autenticación |

## 💾 Formatos de Número de Teléfono

El servicio acepta varios formatos y los normaliza automáticamente:

- `1234567890` → Se convierte a `1234567890@c.us`
- `+541123456789` → Se convierte a `541123456789@c.us`
- `911234567` → Se convierte a `54911234567@c.us` (Argentina)

## 📊 API Endpoints Completos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/v1/health` | Health check del servicio |
| `POST` | `/api/v1/sessions` | Crear nueva sesión WhatsApp |
| `GET` | `/api/v1/sessions` | Listar todas las sesiones |
| `GET` | `/api/v1/sessions/:id` | Obtener estado de sesión |
| `GET` | `/api/v1/sessions/:id/qr` | Obtener QR code de sesión |
| `POST` | `/api/v1/sessions/:id/send` | Enviar mensaje de texto |
| `POST` | `/api/v1/sessions/:id/send-media` | Enviar multimedia |
| `POST` | `/api/v1/sessions/:id/send-template` | Enviar mensaje con plantilla |
| `GET` | `/api/v1/sessions/:id/chats` | Listar chats activos |
| `GET` | `/api/v1/sessions/:id/messages/:chatId` | Obtener mensajes de un chat |
| `POST` | `/api/v1/sessions/:id/ai/chat` | Generar respuesta IA (OpenRouter) |
| `POST` | `/api/v1/sessions/:id/ai/classify` | Clasificar mensaje con IA (Gemini) |
| `POST` | `/api/v1/webhook/configure` | Configurar webhook para eventos |
| `GET` | `/api/v1/analytics/messages` | Estadísticas de mensajes |
| `GET` | `/api/v1/analytics/sessions` | Estadísticas de sesiones |
| `DELETE` | `/api/v1/sessions/:id` | Eliminar sesión |

## 📋 Logs y Debugging

Los logs se guardan en:
- `logs/combined.log` - Todos los logs
- `logs/error.log` - Solo errores
- Consola - En modo desarrollo

Para más debug, configura:
```bash
export LOG_LEVEL=debug
export DEBUG_WHATSAPP=true
```

## 🔧 Configuración

Principales variables de entorno:

```bash
# Puerto del servicio
PORT=3002

# Base de datos
DB_PATH=./data

# Integración con API backend
API_URL=http://localhost:3003
API_KEY=your-secret-key

# Configuración de IA
OPENROUTER_API_KEY=your-openrouter-key
GEMINI_API_KEY=your-gemini-key

# Seguridad
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT=60
```

## 🚀 Despliegue en Producción

```bash
# Construir la aplicación
pnpm build

# Iniciar en producción
NODE_ENV=production pnpm start

# Con PM2
pm2 start ecosystem.config.js --env production
```

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

## 🎯 Troubleshooting - Verificar Modelo de IA

### ✅ Cómo verificar que se está usando openai/gpt-oss-120b

**1. Revisar logs de inicio del servicio:**
```bash
pnpm dev
# Buscar en los logs:
# "🚀 OpenRouter inicializado con modelo FIJO: openai/gpt-oss-120b"
# "⚠️  Modelo no puede ser cambiado desde variables de entorno"
```

**2. Verificar configuración:**
```bash
node test-ai-config.js
# Debe mostrar: "Model Match: 🟼 CORRECT"
```

**3. Probar endpoint de estado:**
```bash
curl http://localhost:3002/ai/status
# Verificar que currentProvider sea "openrouter"
```

**4. Enviar mensaje de prueba:**
```bash
curl -X POST http://localhost:3002/ai/test \
  -H "Content-Type: application/json" \
  -d '{"message": "Hola, ¿cómo estás?"}'
# Los logs deberían mostrar: "🤖 Using FIXED OpenRouter model: openai/gpt-oss-120b"
```

**5. Revisar actividad de OpenRouter:**
- Ir a https://openrouter.ai/activity
- Verificar que las llamadas usen "openai/gpt-oss-120b"
- NO deberían aparecer llamadas a "anthropic/claude-3.5-sonnet"

### ❌ Problemas comunes

- **Error "Model not found"**: Verificar OPENROUTER_API_KEY en .env
- **Usando Claude 3.5**: Reiniciar el servicio después de cambiar .env
- **Variables ignoradas**: El modelo está hardcodeado en `src/config/ai.config.ts`

## 🔐 Seguridad

- Nunca expongas este servicio directamente a Internet sin autenticación
- Usa HTTPS en producción
- Configura CORS apropiadamente
- Implementa rate limiting más estricto si es necesario

## 📝 Documentación Adicional

- [Guía de Desarrollo](/docs/whatsapp-development.md)
- [Integración con IA](/docs/whatsapp-ai.md)
- [Métricas y Analytics](/docs/whatsapp-analytics.md)

¡Disfruta automatizando WhatsApp! 🚀
