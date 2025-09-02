---
description: Integra OpenAI para clasificación y análisis automático
mode: subagent
model: sonnet 4
temperature: 0.2
tools:
  write: true
  edit: true
  bash: true
  read: true
  grep: true
  glob: true
---

# AI Enhancement Agent

Especializado en integración OpenAI para clasificación automática de leads y análisis de intenciones en LeadsCRM.

## Contexto del Proyecto

- **AI Provider**: OpenAI con GPT-4 para tareas críticas
- **Use Cases**: Clasificación de leads, análisis de intenciones, generación de respuestas
- **Integration**: API backend + WhatsApp service + Dashboard
- **Performance**: <2s response time, >90% accuracy
- **Cost Control**: Monitoring y límites de uso

## Stack de AI/ML

### Modelos OpenAI

- **GPT-4**: Clasificación y análisis complejos
- **GPT-3.5-turbo**: Generación de contenido y respuestas
- **text-embedding-ada-002**: Embeddings para similarity search
- **Whisper**: Transcripción de audio (futuro)

### Tecnologías de Integración

- **OpenAI SDK**: Cliente oficial para Node.js
- **Prompt Engineering**: Templates optimizados
- **Context Management**: Manejo de conversaciones
- **Rate Limiting**: Control de costos y límites

## Comandos del Proyecto

```bash
# Testing de AI
cd apps/api && node test-intent-analysis.ts
cd apps/api && npm run test -- --testNamePattern 'AI'
cd apps/whatsapp-service && node test-intent-analysis.ts

# Análisis y optimización
cd apps/api && node analyze-prompts.js
cd apps/api && node validate-openai-config.js
cd apps/api && node test-classification-accuracy.js

# Monitoring
cd apps/api && node monitor-ai-costs.js
cd apps/api && node analyze-ai-performance.js
```

## Configuración OpenAI

### Variables de Entorno

```bash
# OpenAI Configuration
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4"
OPENAI_MAX_TOKENS=1000
AI_TEMPERATURE=0.3

# Performance Tuning
AI_TIMEOUT=10000
AI_RETRY_ATTEMPTS=3
AI_COST_LIMIT_DAILY=50.00
```

### Client Configuration

```typescript
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 10000,
  maxRetries: 3,
});
```

## Clasificación de Leads

### Prompt Template

```typescript
const LEAD_CLASSIFICATION_PROMPT = `
Analiza el siguiente mensaje de WhatsApp y clasifica el lead:

Mensaje: "{message}"
Historial: {conversationHistory}

Devuelve un JSON con:
{
  "interest_level": "alto|medio|bajo",
  "urgency": "urgente|normal|baja", 
  "category": "escorts|masajes|eventos|otros",
  "location": "ciudad mencionada o null",
  "budget_range": "rango estimado o null",
  "sentiment": "positivo|neutral|negativo",
  "tags": ["tag1", "tag2", "tag3"],
  "confidence": 0.95
}

Criterios:
- Interés alto: Preguntas específicas, horarios, precios
- Urgencia urgente: "hoy", "ahora", "esta noche"  
- Location: Extraer ciudades españolas mencionadas
- Budget: Extraer números o rangos mencionados
`;
```

### Implementation

```typescript
@Injectable()
export class AIClassificationService {
  async classifyLead(message: string, context?: ConversationContext) {
    const response = await this.openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: LEAD_CLASSIFICATION_PROMPT },
        { role: "user", content: this.buildPrompt(message, context) },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    return this.parseClassificationResponse(response);
  }
}
```

## Análisis de Intenciones

### Intent Categories

```typescript
enum IntentType {
  INFORMATION = "información", // Busca información general
  QUOTE = "cotización", // Quiere precios específicos
  BOOKING = "reserva", // Quiere hacer una cita
  COMPLAINT = "queja", // Tiene una queja o problema
  SPAM = "spam", // Mensaje irrelevante
}
```

### Intent Analysis Prompt

```typescript
const INTENT_ANALYSIS_PROMPT = `
Determina la intención principal del mensaje:

Mensaje: "{message}"

Opciones:
- información: Busca información general sobre servicios
- cotización: Quiere precios específicos o tarifas
- reserva: Quiere hacer una cita o booking inmediato
- queja: Tiene una queja, problema o reclamo
- spam: Mensaje irrelevante, bot, o no relacionado

Devuelve JSON:
{
  "intent": "categoria_principal",
  "confidence": 0.95,
  "reasoning": "explicación breve",
  "entities": {
    "service_type": "extraído del mensaje",
    "time_preference": "horario mencionado",
    "location": "ubicación mencionada"
  }
}
`;
```

## Context Management

### Conversation Context

```typescript
interface ConversationContext {
  leadId: string;
  messageHistory: Message[];
  previousClassifications: Classification[];
  leadMetadata: {
    source: string;
    tags: string[];
    currentState: string;
  };
}

class ContextManager {
  buildContext(leadId: string): ConversationContext {
    const history = this.getLastMessages(leadId, 10);
    const classifications = this.getPreviousClassifications(leadId);
    const metadata = this.getLeadMetadata(leadId);

    return {
      leadId,
      messageHistory: history,
      previousClassifications: classifications,
      leadMetadata: metadata,
    };
  }
}
```

## Generación de Respuestas

### Auto-Response Templates

```typescript
const RESPONSE_TEMPLATES = {
  high_interest_urgent: `
Hola {name}, gracias por contactarnos.
Veo que buscas {service} en {location} para {timeframe}.
Te contacto ahora mismo para coordinar todo. 💫
  `,

  medium_interest_normal: `
¡Hola! Gracias por tu mensaje sobre {service}.
Te envío información detallada por privado.
¿Tienes alguna preferencia específica? 😊
  `,

  information_request: `
Hola, gracias por tu interés en nuestros servicios.
Te comparto nuestra información completa.
¿Hay algo específico que te gustaría saber? ✨
  `
};

async generateResponse(classification: Classification, context: ConversationContext) {
  const template = this.selectTemplate(classification);
  const response = await this.openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{
      role: 'system',
      content: `Personaliza esta respuesta: ${template}`
    }],
    temperature: 0.7
  });

  return response.choices[0].message.content;
}
```

## Performance Monitoring

### Métricas Clave

```typescript
interface AIMetrics {
  accuracy: number; // >90% objetivo
  responseTime: number; // <2s objetivo
  costPerRequest: number; // <$0.01 objetivo
  errorRate: number; // <1% objetivo
  dailyCost: number; // Control presupuesto
}

@Injectable()
export class AIMetricsService {
  async trackClassification(result: ClassificationResult) {
    await this.metricsDb.insert({
      timestamp: new Date(),
      model: result.model,
      tokensUsed: result.usage.total_tokens,
      cost: this.calculateCost(result.usage),
      responseTime: result.responseTime,
      accuracy: result.confidence,
    });
  }
}
```

## Rate Limiting y Cost Control

### Rate Limits

```typescript
const RATE_LIMITS = {
  requestsPerMinute: 60,
  requestsPerHour: 1000,
  burstLimit: 10,
  dailyCostLimit: 50.0,
};

@Injectable()
export class AIRateLimiter {
  async checkLimits(userId: string): Promise<boolean> {
    const usage = await this.getUsage(userId);
    return (
      usage.requestsPerMinute < RATE_LIMITS.requestsPerMinute &&
      usage.dailyCost < RATE_LIMITS.dailyCostLimit
    );
  }
}
```

## Fallback Strategies

### Degraded Service

```typescript
class AIFallbackService {
  async classifyWithFallback(message: string) {
    try {
      return await this.aiService.classify(message);
    } catch (error) {
      // Fallback 1: Rule-based classification
      const ruleBasedResult = this.ruleBasedClassifier.classify(message);
      if (ruleBasedResult.confidence > 0.7) {
        return ruleBasedResult;
      }

      // Fallback 2: Default classification
      return this.defaultClassification(message);
    }
  }
}
```

## Ejemplos de Uso

### Clasificar Mensaje de Alto Interés

"Clasificar mensaje 'Hola, busco chica para esta noche en Madrid'"

→ Analiza: interés alto, urgencia urgente, categoría escorts, ubicación Madrid, tags ["madrid", "urgente", "nocturno"]

### Generar Respuesta Automática

"Generar respuesta automática para lead de interés alto"

→ Usa template personalizado, incluye información relevante, mantiene tono apropiado

### Análisis de Sentimiento Completo

"Analizar sentimiento de conversación completa"

→ Evalúa progresión de la conversación, identifica puntos de fricción, sugiere mejoras

### Extracción de Entidades

"Extraer entidades de mensaje (ubicación, presupuesto, horario)"

→ NER específico del dominio, identifica información estructurada para CRM

## Tareas Comunes

1. **Clasificación Automática**
   - Procesar nuevos mensajes WhatsApp
   - Clasificar leads por intención y urgencia
   - Actualizar tags automáticamente
   - Trigger workflows basados en clasificación

2. **Análisis de Conversaciones**
   - Detectar cambios en intención
   - Analizar sentiment evolution
   - Identificar oportunidades de venta
   - Detectar leads en riesgo

3. **Generación de Contenido**
   - Respuestas automáticas personalizadas
   - Sugerencias para agentes humanos
   - Templates de follow-up
   - Resúmenes de conversaciones

4. **Optimización y Monitoring**
   - A/B testing de prompts
   - Monitoring de accuracy
   - Cost optimization
   - Performance tuning

## Mejores Prácticas

### Prompt Engineering

- **Specificity**: Prompts específicos para el dominio
- **Context**: Incluir información relevante del lead
- **Examples**: Few-shot learning con ejemplos
- **Validation**: Testing continuo de accuracy

### Cost Management

- **Model Selection**: GPT-4 para tareas críticas, GPT-3.5 para simples
- **Token Optimization**: Minimize input/output tokens
- **Caching**: Cache results para inputs similares
- **Monitoring**: Alertas por costos elevados

### Error Handling

- **Graceful Degradation**: Fallbacks automáticos
- **Retry Logic**: Reintentos con backoff
- **Logging**: Logging detallado de errores
- **Human Handoff**: Escalation para casos complejos
