# 📱 WhatsApp Integration - LeadsCRM

_Sistema completo de integración WhatsApp con multi-sesión, whitelist inteligente y automatización_

---

## 🚀 **Características Principales**

### ✅ **Sistema Multi-Sesión**

- 📱 **Múltiples números**: Soporte para varios números de WhatsApp simultáneamente
- 🔄 **Persistencia de sesiones**: Las sesiones se mantienen entre reinicios
- 📷 **QR Codes dinámicos**: Generación automática para nuevas sesiones
- 🔌 **Reconexión automática**: Sistema robusto de reconexión ante desconexiones

### 🛡️ **Sistema de Whitelist Inteligente**

- 🚫 **Filtrado automático**: Bloquea newsletters, bots y números sospechosos
- ✅ **Autorización granular**: Control por número de teléfono
- 📊 **Logging completo**: Auditoría de todas las decisiones
- 🔍 **Detección de patrones**: Identifica automáticamente números problemáticos

### 🤖 **Integración IA**

- 💬 **Respuestas automáticas**: IA genera respuestas contextuales
- 📋 **Templates dinámicos**: Variables personalizables en mensajes
- 📈 **Analytics**: Métricas de conversación y engagement
- 🎯 **Clasificación automática**: Categoriza mensajes por tipo e intención

---

## 🏗️ **Arquitectura del Sistema**

### **Flujo Principal**

```
WhatsApp ← → WhatsApp Service ← → NestJS API ← → PostgreSQL
    ↓            ↓                    ↓           ↓
 Usuarios    Multi-sesión         Webhook      14 tablas
             QR Codes            Processing    + datos
             Persistencia        Whitelist     + analytics
```

### **Componentes Clave**

#### **1. WhatsApp Service (Puerto 3002)**

- **Framework**: Express.js + whatsapp-web.js
- **Responsabilidades**:
  - Gestión de sesiones múltiples
  - Generación y stream de QR codes
  - Envío y recepción de mensajes
  - Integración con IA para respuestas automáticas

#### **2. API Backend (Puerto 3003)**

- **Framework**: NestJS + TypeScript
- **Módulos**:
  - `WhatsAppModule`: Webhook processing
  - `WhitelistService`: Filtrado inteligente
  - `MessagingModule`: Gestión de conversaciones
  - `AIModule`: Procesamiento con IA

#### **3. Base de Datos**

- **whatsapp_sessions**: Gestión de sesiones activas
- **whatsapp_conversations**: Historial consolidado
- **whatsapp_whitelist_logs**: Auditoría de decisiones
- **leads**: Leads autorizados únicamente
- **messages**: Mensajes individuales con metadata

---

## 🛡️ **Sistema de Whitelist**

### **Problema Original Resuelto**

**❌ ANTES (Problemático):**

```
WhatsApp Message → API Webhook → CREATE LEAD IMMEDIATELY → Check whitelist → Too late!
```

**✅ DESPUÉS (Arreglado):**

```
WhatsApp Message → API Webhook → CHECK WHITELIST FIRST → Create lead only if authorized
```

### **Filtros Implementados**

#### **🚫 Patrones Bloqueados Automáticamente**

- **Números cortos**: < 8 dígitos (códigos de servicio)
- **Newsletters**: Patrones como "noreply", "info", etc.
- **Bots comerciales**: Detectados por contenido automático
- **Números sin autorización**: No incluidos en whitelist

#### **✅ Criterios de Autorización**

- **Lead existente autorizado**: `whatsapp_authorized = true`
- **Whitelist manual**: Números pre-autorizados por administrador
- **Patrones confiables**: Números con historial de conversaciones legítimas

### **Configuración de Filtros**

```typescript
// apps/whatsapp-service/src/services/WhitelistService.ts
const BLOCKED_PATTERNS = [
  /^info@/i,
  /^noreply/i,
  /^no-reply/i,
  /^\d{1,7}$/, // Números cortos
  /^[0-9]{15,}$/, // Números excesivamente largos
];

const SUSPICIOUS_CONTENT = [
  "unsubscribe",
  "newsletter",
  "marketing",
  "promocion",
];
```

---

## 📱 **Gestión de Sesiones**

### **Estados de Sesión**

- **`ready`**: Conectado y operativo
- **`qr`**: Esperando escaneo de QR code
- **`loading`**: Iniciando conexión
- **`disconnected`**: Desconectado (reintentos automáticos)

### **API de Sesiones**

#### **Endpoints Principales**

```bash
# Listar sesiones activas
GET /sessions

# Crear nueva sesión
POST /sessions
Body: { "sessionId": "session1", "name": "WhatsApp Principal" }

# Obtener QR code
GET /sessions/:sessionId/qr

# Estado de sesión
GET /sessions/:sessionId/status

# Eliminar sesión
DELETE /sessions/:sessionId
```

#### **Persistencia**

- **Directorio**: `./sessions/`
- **Formato**: Archivos binarios de whatsapp-web.js
- **Backup**: Recomendado backup regular del directorio

---

## 🤖 **Integración con IA**

### **Proveedores Soportados**

- **OpenRouter**: Modelo principal (`openai/gpt-oss-120b`)
- **Google Gemini**: Alternativa (`gemini-1.5-pro`)
- **OpenAI**: Fallback (`gpt-3.5-turbo`)

### **Funcionalidades IA**

#### **1. Respuestas Automáticas**

```typescript
// Análisis de mensaje entrante
const analysis = await AIService.analyzeMessage(message);

// Generación de respuesta contextual
const response = await AIService.generateResponse(analysis, context);

// Envío automático (opcional)
if (config.autoResponse && analysis.confidence > 0.8) {
  await WhatsAppService.sendMessage(phoneNumber, response);
}
```

#### **2. Templates Dinámicos**

```typescript
// Template con variables
const template =
  "¡Hola {{name}}! Gracias por contactar {{company}}. ¿En qué puedo ayudarte?";

// Sustitución automática
const message = TemplateService.render(template, {
  name: lead.name,
  company: "LeadsCRM",
});
```

#### **3. Clasificación de Mensajes**

- **Saludos**: Respuestas rápidas y amigables
- **Consultas**: Información detallada sobre servicios
- **Precios**: Templates con información comercial
- **Soporte**: Escalado a agentes humanos

---

## 📊 **Analytics y Monitoreo**

### **Métricas Disponibles**

#### **Dashboard Principal (`/analytics/messages`)**

```json
{
  "totalMessages": 150,
  "authorizedMessages": 142,
  "blockedMessages": 8,
  "whitelistHitRate": "94.7%",
  "topBlockedPatterns": [
    "Short numbers": 4,
    "Newsletter patterns": 3,
    "Suspicious content": 1
  ]
}
```

#### **Estadísticas de Whitelist (`/stats/whitelist`)**

```json
{
  "totalDecisions": 158,
  "authorized": 142,
  "blocked": 8,
  "pending": 8,
  "blockedReasons": {
    "SHORT_NUMBER": 4,
    "NEWSLETTER_PATTERN": 3,
    "SUSPICIOUS_CONTENT": 1
  }
}
```

### **Logs de Auditoría**

```bash
# Ver logs de whitelist
GET /logs/whitelist?limit=50

# Filtrar por decisión
GET /logs/whitelist?decision=BLOCKED

# Filtrar por fecha
GET /logs/whitelist?since=2025-09-01
```

---

## 🔧 **Configuración y Setup**

### **Variables de Entorno**

```bash
# Directorio de sesiones
WHATSAPP_SESSION_DIR="./.wwebjs_sessions"

# Auto-respuesta IA (true/false)
WHATSAPP_AUTO_RESPONSE=false

# Nivel de logging
WHATSAPP_LOG_LEVEL="info"

# Whitelist estricta (true/false)
WHATSAPP_STRICT_WHITELIST=true
```

### **Configuración de Whitelist**

```bash
# Administración de whitelist
node scripts/whitelist-admin.js dashboard

# Autorizar número específico
node scripts/whitelist-admin.js authorize +34600123456 "Cliente VIP"

# Bloquear número
node scripts/whitelist-admin.js block +34600999999 "Spam detected"

# Ver actividad reciente
node scripts/whitelist-admin.js activity 20
```

---

## 🚀 **Casos de Uso Avanzados**

### **1. Setup Multi-Empresa**

```javascript
// Crear sesiones por empresa
await createSession("empresa-a", "Empresa A - Ventas");
await createSession("empresa-b", "Empresa B - Soporte");

// Configurar templates específicos
await setTemplates("empresa-a", ventasTemplates);
await setTemplates("empresa-b", soporteTemplates);
```

### **2. Escalado a Agentes Humanos**

```javascript
// Detectar necesidad de escalado
if (analysis.complexity > 0.7 || analysis.sentiment < 0.3) {
  await notifyAgent(message, lead);
  await setConversationStatus(conversationId, "PENDING_AGENT");
}
```

### **3. Integración con CRM**

```javascript
// Sincronizar con lead existente
const lead = await findLeadByPhone(phoneNumber);
if (lead) {
  await updateLeadActivity(lead.id, message);
  await triggerWorkflow(lead.id, "MESSAGE_RECEIVED");
}
```

---

## 🎯 **Best Practices**

### **Seguridad**

- ✅ **Validar inputs**: Sanitizar todos los mensajes entrantes
- ✅ **Rate limiting**: Limitar mensajes por número/tiempo
- ✅ **Logs seguros**: No logear información personal sensible
- ✅ **Backup sesiones**: Backup regular del directorio de sesiones

### **Performance**

- ✅ **Cache responses**: Cachear respuestas IA frecuentes
- ✅ **Async processing**: Procesar mensajes de forma asíncrona
- ✅ **Cleanup sessions**: Limpiar sesiones inactivas regularmemnte
- ✅ **Monitor memory**: Monitorear uso de memoria de sesiones

### **Escalabilidad**

- ✅ **Redis pub/sub**: Usar Redis para coordinación entre servicios
- ✅ **Queue system**: BullMQ para procesamiento de mensajes
- ✅ **Load balancing**: Distribuir sesiones entre múltiples instancias
- ✅ **Database optimization**: Índices optimizados para queries frecuentes

---

## 🆘 **Troubleshooting**

### **Problemas Comunes**

#### **🔴 Sesión no conecta**

```bash
# Verificar estado
curl http://localhost:3002/sessions/session1/status

# Regenerar QR
curl -X DELETE http://localhost:3002/sessions/session1
curl -X POST http://localhost:3002/sessions -d '{"sessionId":"session1"}'

# Ver logs
tail -f logs/whatsapp-service.log
```

#### **🔴 Whitelist no funciona**

```bash
# Verificar configuración
node scripts/whitelist-admin.js dashboard

# Test específico
node scripts/whitelist-admin.js test +34600123456

# Ver logs de decisiones
curl http://localhost:3002/logs/whitelist?limit=10
```

#### **🔴 IA no responde**

```bash
# Verificar proveedor IA
curl http://localhost:3002/ai/status

# Cambiar proveedor
curl -X POST http://localhost:3002/ai/switch -d '{"provider":"gemini"}'

# Test respuesta
curl -X POST http://localhost:3002/ai/test -d '{"message":"hola"}'
```

---

## 📚 **Documentación Relacionada**

- [`../getting-started/`](../getting-started/) - Setup inicial de WhatsApp
- [`ai-configuration.md`](./ai-configuration.md) - Configuración IA multi-proveedor
- [`../architecture/`](../architecture/) - Arquitectura completa del sistema
- [`../development/`](../development/) - Desarrollo y debugging
- [`../reference/`](../reference/) - Referencias y comandos

---

_Sistema WhatsApp completamente operativo desde v2.2.0 - Septiembre 2025_ ✅
