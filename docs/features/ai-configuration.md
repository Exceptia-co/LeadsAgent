# Configuración de Servicios de IA

Este documento describe la configuración de los servicios de IA disponibles en LeadsCRM.

## 🤖 Servicios Configurados

### OpenRouter
OpenRouter proporciona acceso a múltiples modelos de IA a través de una sola API:

```env
OPENROUTER_API_KEY="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"
OPENROUTER_BASE_URL="https://openrouter.ai/api/v1"
OPENROUTER_MODEL="openai/gpt-oss-120b"
```

**Modelo FIJO en LeadsCRM:**
- `openai/gpt-oss-120b` - **MODELO OBLIGATORIO** - GPT Open Source 120B, hardcodeado en la configuración
- ⚠️ **IMPORTANTE**: El modelo está fijo en el código y NO puede cambiarse via variables de entorno
- ✅ **Configuración centralizada**: Se usa `ai.config.ts` para prevenir uso de Claude 3.5 Sonnet

**Otros modelos disponibles en OpenRouter (NO UTILIZADOS):**
- `anthropic/claude-3.5-sonnet` - BLOQUEADO por configuración
- `openai/gpt-4o` - No usado
- `google/gemini-pro-1.5` - No usado
- `meta-llama/llama-3.1-405b` - No usado

### Google Gemini
Servicio de IA nativo de Google:

```env
GEMINI_API_KEY="AIzaSyA6tU2zY67ZZ3uEK0tBhzZZQbMpTI0-7pA"
GEMINI_MODEL="gemini-2.5-flash"
```

**Características de Gemini:**
- Excelente para análisis de contenido multimodal
- Ventana de contexto muy amplia
- Optimizado para tareas de comprensión y análisis

### OpenAI (Compatibilidad)
Mantenemos la configuración de OpenAI para compatibilidad:

```env
OPENAI_API_KEY="your_openai_api_key"
OPENAI_MODEL="gpt-3.5-turbo"
```

## 🔧 Uso en el Código

### Ejemplo con OpenRouter
```typescript
import OpenAI from 'openai';

const openrouter = new OpenAI({
  baseURL: process.env.OPENROUTER_BASE_URL,
  apiKey: process.env.OPENROUTER_API_KEY,
});

const completion = await openrouter.chat.completions.create({
  model: process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b",
  messages: [
    { role: "user", content: "Analiza este mensaje de WhatsApp..." }
  ],
  max_tokens: 2048,
  temperature: 0.7
});
```

### Ejemplo con Google Gemini
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-1.5-pro" });

const result = await model.generateContent("Analiza este mensaje de WhatsApp...");
```

## 💡 Configuración de Uso

1. **Modelo único**: Siempre se usa `openai/gpt-oss-120b` vía OpenRouter
2. **Sin configuración**: El modelo está hardcodeado y no puede cambiarse
3. **Para tareas multimodales**: Cambiar manualmente a Gemini si es necesario
4. **Claude 3.5 Sonnet**: BLOQUEADO para evitar uso accidental

## 🔒 Seguridad

- Las claves de API están configuradas en el archivo `.env`
- El archivo `.env` está incluido en `.gitignore` para prevenir commits accidentales
- Nunca compartas las claves de API en público

## 📊 Costos Estimados

- **OpenRouter**: Variable según el modelo (~$0.001-$0.030 por 1K tokens)
- **Google Gemini**: Gratuito hasta 15 requests/minuto, luego de pago
- **OpenAI**: Requiere configuración adicional si se usa

## 🚀 Configuración en Producción

Para producción, asegúrate de:
1. Configurar OPENROUTER_API_KEY en variables de entorno
2. ✅ El modelo `openai/gpt-oss-120b` ya está hardcodeado
3. Implementar rate limiting apropiado
4. Monitorear el uso y costos
5. Verificar logs de inicio para confirmar modelo FIXED
