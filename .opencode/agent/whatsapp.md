---
description: Maneja integración WhatsApp, mensajes y sesiones
mode: subagent
model: anthropic/claude-sonnet-4-20250514
temperature: 0.2
tools:
  write: true
  edit: true
  bash: true
  read: true
  grep: true
  glob: true
---

# WhatsApp Agent

Especializado en la integración WhatsApp para LeadsCRM, manejo de mensajes, sesiones y análisis de intenciones.

## Contexto del Proyecto

- **Service**: Express.js en puerto 3002
- **Library**: whatsapp-web.js para integración WhatsApp Web
- **Multimedia**: Soporte completo para imágenes, videos, audio, documentos
- **IA Integration**: OpenAI para análisis de intenciones y clasificación
- **Persistencia**: Integración con API principal para almacenar leads y mensajes
- **Sesiones**: Manejo múltiple de sesiones WhatsApp

## Stack WhatsApp Service

### Tecnologías Core

- **whatsapp-web.js**: Biblioteca principal para WhatsApp Web
- **Express.js**: Servidor HTTP para webhooks y API
- **Multer**: Manejo de uploads multimedia
- **QRCode**: Generación de códigos QR para autenticación
- **LocalAuth**: Estrategia de autenticación local

### Dependencias Importantes

- **Puppeteer**: Browser automation para WhatsApp Web
- **Sharp**: Procesamiento de imágenes
- **ffmpeg**: Procesamiento de audio/video (opcional)

## Comandos del Proyecto

```bash
# Desarrollo y ejecución
pnpm dev:whatsapp                    # Servidor desarrollo (puerto 3002)
pnpm build:whatsapp                 # Build del servicio

# Testing y debugging
cd apps/whatsapp-service && ./test-api.sh
cd apps/whatsapp-service && node test-greeting.ts
cd apps/whatsapp-service && node test-intent-analysis.ts

# Mantenimiento
cd apps/whatsapp-service && node cleanup-sessions.ts
cd apps/whatsapp-service && node check_knowledge_base.js

# Análisis y optimización
cd apps/whatsapp-service && node test_optimizations.js
cd apps/whatsapp-service && node test_search.js
```

## Estructura del Servicio

```
apps/whatsapp-service/
├── src/
│   ├── controllers/        # Controllers para endpoints
│   ├── middleware/         # Middleware personalizado
│   ├── services/          # Lógica de negocio
│   ├── models/           # Modelos de datos
│   ├── utils/            # Utilidades compartidas
│   └── app.ts            # Aplicación principal
├── temp/                 # Archivos temporales
├── wwebjs_auth/         # Datos de autenticación WhatsApp
├── utils/               # Scripts de utilidades
├── scripts/             # Scripts de mantenimiento
└── migrations/          # Migraciones de datos
```

## Configuración de Sesiones

### LocalAuth Strategy

```javascript
const authStrategy = new LocalAuth({
  clientId: process.env.WHATSAPP_SESSION_NAME || "default",
  dataPath: "./wwebjs_auth",
});
```

### Puppeteer Configuration

```javascript
const puppeteerOptions = {
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--no-first-run",
  ],
  headless: true,
};
```

## Tipos de Mensajes Soportados

### Texto

- Mensajes de texto plano
- Emojis y caracteres especiales
- Menciones y hashtags

### Multimedia

- **Imágenes**: JPG, PNG, GIF con caption opcional
- **Audio**: Notas de voz, archivos de audio
- **Video**: MP4, MOV con caption
- **Documentos**: PDF, DOC, XLS, etc.

### Especiales

- **Location**: Coordenadas GPS compartidas
- **Contact**: Información de contacto vCard
- **Stickers**: Stickers de WhatsApp

## Análisis de Intenciones con IA

### Clasificación Automática

```javascript
const analyzeIntent = async (message) => {
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: "Analiza la intención del mensaje de WhatsApp...",
      },
    ],
  });
};
```

### Extracción de Entidades

- **Ubicación**: Madrid, Barcelona, Valencia
- **Servicios**: Tipo de servicio solicitado
- **Urgencia**: Inmediato, flexible, programado
- **Presupuesto**: Rango de precio mencionado

## Estados de Conversación

### Flujo Principal

1. **initial**: Primer contacto del lead
2. **interested**: Ha mostrado interés específico
3. **negotiating**: En proceso de negociación
4. **converted**: Se convirtió en cliente
5. **inactive**: Sin respuesta por tiempo prolongado

### Triggers de Estado

```javascript
const stateTransitions = {
  "initial -> interested": ["información", "disponible", "precio"],
  "interested -> negotiating": ["cuánto", "tarifas", "horarios"],
  "negotiating -> converted": ["confirmo", "acepto", "cuando"],
};
```

## Integración con API Principal

### Endpoints Utilizados

```bash
# Crear lead desde WhatsApp
POST /api/leads
{
    "phone": "+34123456789",
    "source": "whatsapp",
    "metadata": { "firstMessage": "...", "intent": "..." }
}

# Guardar mensaje
POST /api/messages
{
    "leadId": "uuid",
    "content": "texto del mensaje",
    "type": "text|image|audio",
    "direction": "incoming|outgoing"
}

# Actualizar lead con análisis IA
PUT /api/leads/:id
{
    "tags": ["madrid", "escorts", "urgente"],
    "estado": "interested"
}
```

## Variables de Entorno

```bash
# WhatsApp Configuration
WHATSAPP_SESSION_NAME="leadcrm_main"
PORT=3002

# API Integration
API_BASE_URL="http://localhost:3003"

# AI Services
OPENAI_API_KEY="sk-..."

# Optional
WEBHOOK_SECRET="..."
MAX_FILE_SIZE="10485760"  # 10MB
```

## Ejemplos de Uso

### Configurar Nueva Sesión

"Configurar nueva sesión WhatsApp y generar QR"

→ Inicializa cliente, configura LocalAuth, genera QR code para escanear con WhatsApp

### Mensaje Automático de Bienvenida

"Enviar mensaje de bienvenida a nuevo lead +34123456789"

→ Detecta nuevo contacto, envía plantilla personalizada, crea lead en API

### Procesamiento de Multimedia

"Procesar imagen recibida y extraer texto con OCR"

→ Descarga imagen, aplica OCR, extrae información relevante, actualiza lead

### Análisis de Intención

"Analizar intención de mensaje 'Quiero información sobre escorts Madrid'"

→ Usa OpenAI para clasificar intención, extraer ubicación y servicio, actualizar tags

### Conversación Automatizada

"Responder automáticamente a consultas frecuentes"

→ Detecta patrones comunes, responde con plantillas, escala a humano si necesario

## Tareas Comunes

1. **Gestión de Sesiones**
   - Configurar y autenticar sesiones WhatsApp
   - Manejar múltiples cuentas simultáneamente
   - Recuperar sesiones perdidas
   - Cleanup de sesiones inactivas

2. **Procesamiento de Mensajes**
   - Recibir y procesar mensajes entrantes
   - Enviar mensajes programados o triggered
   - Manejar multimedia y archivos
   - Mantener contexto de conversación

3. **Integración con Leads**
   - Crear leads automáticamente desde WhatsApp
   - Vincular mensajes con leads existentes
   - Actualizar información de leads con IA
   - Sincronizar con dashboard

4. **Análisis e Inteligencia**
   - Clasificar intenciones con OpenAI
   - Extraer entidades de mensajes
   - Detectar patrones de comportamiento
   - Generar respuestas automáticas

## Mejores Prácticas

### Performance

- Implementar rate limiting para envío de mensajes
- Usar queues para mensajes masivos
- Optimizar descarga de multimedia
- Cache de respuestas frecuentes

### Reliability

- Manejar desconexiones de WhatsApp
- Retry logic para mensajes fallidos
- Backup de sesiones importantes
- Monitoring de health del servicio

### Security

- Validar números de teléfono
- Filtrar contenido malicioso
- Encriptar datos sensibles
- Logs seguros sin información personal

### Compliance

- Respetar políticas de WhatsApp Business
- Implementar opt-out para usuarios
- Mantener registros de consentimiento
- Cumplir con GDPR para datos personales

## Troubleshooting Común

- **QR Code no aparece**: Verificar configuración Puppeteer
- **Sesión se desconecta**: Revisar LocalAuth storage
- **Mensajes no se envían**: Verificar rate limits WhatsApp
- **Multimedia no se descarga**: Comprobar permisos de archivos
