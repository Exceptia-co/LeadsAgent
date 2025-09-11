# AI Development Guidelines para LeadsCRM

## 📋 Guías de Desarrollo IA

Esta documentación proporciona las mejores prácticas para trabajar con los servicios de IA en LeadsCRM.

## 🤖 Prompt Engineering para CRM

### Contexto de Negocio
El sistema está diseñado específicamente para **gestión de leads** vía WhatsApp con los siguientes objetivos:
- Calificar leads potenciales automáticamente
- Recopilar información de contacto
- Entender necesidades específicas del cliente
- Programar citas o derivar a especialistas

### Patrones de Prompts

#### 1. Clasificación de Leads
```typescript
const leadClassificationPrompt = `
Analiza este mensaje de WhatsApp y clasifica al lead:

MENSAJE: "${message}"

Clasifica según:
- INTENCIÓN: [consulta_producto, solicitar_info, queja, saludo, despedida, spam]
- URGENCIA: [alta, media, baja]
- CALIDAD: [caliente, templado, frío]
- CONFIANZA: 0.0-1.0

Responde en JSON:
{
  "intent": "categoria",
  "urgency": "nivel",
  "quality": "temperatura",
  "confidence": 0.95,
  "reasoning": "breve explicación"
}
`;
```

#### 2. Extracción de Datos
```typescript
const dataExtractionPrompt = `
Extrae información de contacto del mensaje:

MENSAJE: "${message}"

Busca:
- Nombre de persona o empresa
- Email
- Teléfono adicional
- Productos/servicios de interés
- Presupuesto aproximado

JSON:
{
  "name": "string",
  "email": "string",
  "phone": "string", 
  "interests": ["producto1", "producto2"],
  "budget": "string",
  "confidence": 0.95
}
`;
```

## 📊 Clasificación y Scoring

### Sistema de Puntuación (moodScore)
- **0.8-1.0**: Lead caliente (alta intención de compra)
- **0.6-0.8**: Lead templado (interés moderado)
- **0.3-0.6**: Lead frío (información inicial)
- **0.0-0.3**: Lead muy frío o spam

### Factores de Scoring
```typescript
interface ScoringFactors {
  urgencyKeywords: string[];    // "urgente", "necesito", "ya"
  purchaseIntent: string[];     // "comprar", "contratar", "precio"
  contactProvision: boolean;    // Proporciona email/teléfono
  businessContext: boolean;     // Menciona empresa/negocio
  followUpQuestions: number;    // Número de preguntas específicas
}
```

## 🔄 Análisis de Sentimiento

### Implementación
```typescript
// En AIService.ts
public async analyzeSentiment(message: string): Promise<SentimentAnalysis> {
  const prompt = `
  Analiza el sentimiento del mensaje:
  "${message}"
  
  Considera:
  - Tono emocional (positivo/negativo/neutral)
  - Nivel de satisfacción
  - Urgencia o frustración
  - Disposición a continuar conversación
  
  JSON:
  {
    "sentiment": "positive|negative|neutral",
    "confidence": 0.95,
    "emotional_indicators": ["enthusiasm", "urgency"],
    "satisfaction_level": 0.8
  }
  `;
  
  return await this.generateResponse(prompt);
}
```

## ➕ Agregar Nuevos Proveedores IA

### 1. Definir Interface
```typescript
// En AIService.ts
interface AIProvider {
  name: string;
  initialize(): Promise<boolean>;
  generateResponse(prompt: string, context?: MessageContext): Promise<AIResponse>;
  getStatus(): { available: boolean; model: string };
}
```

### 2. Implementar Proveedor
```typescript
// Ejemplo: AnthropicProvider
class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  
  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }
  
  async generateResponse(prompt: string): Promise<AIResponse> {
    const completion = await this.client.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }]
    });
    
    return {
      success: true,
      content: completion.content[0].text,
      provider: 'anthropic',
      tokensUsed: completion.usage.output_tokens
    };
  }
}
```

### 3. Registrar en AIService
```typescript
// En constructor de AIService
if (process.env.ANTHROPIC_API_KEY) {
  this.providers.set('anthropic', new AnthropicProvider(process.env.ANTHROPIC_API_KEY));
}
```

## ⚙️ Configuración de Respuestas Automáticas

### Estructura de Reglas
```typescript
interface AutoResponseRule {
  id: string;
  name: string;
  trigger: 'keyword' | 'sentiment' | 'intent' | 'time_based';
  conditions: {
    keywords?: string[];
    sentiment?: 'positive' | 'negative' | 'neutral';
    intent?: string;
    confidence_threshold?: number;
    priority?: number;
  };
  response: {
    message: string;
    type: 'text' | 'template';
    delay?: number;
  };
  isActive: boolean;
}
```

### Ejemplo de Regla Avanzada
```typescript
const highIntentRule: AutoResponseRule = {
  id: 'high_intent_purchase',
  name: 'Alta Intención de Compra',
  trigger: 'intent',
  conditions: {
    intent: 'purchase_intent',
    confidence_threshold: 0.8,
    priority: 1
  },
  response: {
    message: '🎉 ¡Perfecto! Veo que estás muy interesado. Un especialista te contactará en los próximos 15 minutos para ayudarte con tu compra.',
    type: 'text',
    delay: 2
  },
  isActive: true
};
```

## 💬 Diseño de IA Conversacional

### Principios de Diseño
1. **Personalidad Consistente**: Amable, profesional, orientado a resultados
2. **Contextual**: Recordar conversaciones previas
3. **Progresivo**: Recopilar información gradualmente
4. **Humano cuando Necesario**: Escalate complex issues

### Flujo de Conversación
```
Saludo → Identificación de Necesidad → Cualificación → Recolección de Datos → Acción
    ↓         ↓                     ↓              ↓                    ↓
   IA        IA                    IA             IA                Humano
```

## 🧪 Estrategias de Testing

### 1. Tests Unitarios
```typescript
// Ejemplo de test para clasificación
describe('Lead Classification', () => {
  it('should classify high-intent messages correctly', async () => {
    const message = "Necesito comprar urgentemente su producto";
    const result = await aiService.analyzeIntent(message);
    
    expect(result.intent).toBe('purchase_intent');
    expect(result.confidence).toBeGreaterThan(0.8);
  });
});
```

### 2. Tests de Integration
```typescript
describe('AI Provider Integration', () => {
  it('should fallback to secondary provider on failure', async () => {
    // Mock primary provider failure
    jest.spyOn(aiService, 'generateResponseOpenRouter').mockRejectedValue(new Error('API Error'));
    
    const response = await aiService.generateResponse("test message");
    
    expect(response.success).toBe(true);
    expect(response.provider).toBe('gemini'); // Fallback provider
  });
});
```

### 3. A/B Testing
```typescript
// Configurar variantes de prompts
const promptVariants = {
  A: "Eres un asistente amigable...",
  B: "Eres un consultor especializado..."
};

// Medir performance
interface PromptMetrics {
  variant: string;
  conversion_rate: number;
  user_satisfaction: number;
  response_time: number;
}
```

## 🔧 Fallbacks y Error Handling

### 1. Cascada de Proveedores
```typescript
const providerFallbackChain = [
  'openrouter',  // Primary
  'gemini',      // Secondary  
  'default'      // Hardcoded responses
];
```

### 2. Degraded Mode
```typescript
public async generateResponseWithFallback(message: string): Promise<AIResponse> {
  for (const provider of this.fallbackChain) {
    try {
      if (provider === 'default') {
        return this.getHardcodedResponse(message);
      }
      
      if (this.switchProvider(provider)) {
        return await this.generateResponse(message);
      }
    } catch (error) {
      logger.warn(`Provider ${provider} failed:`, error);
      continue;
    }
  }
  
  throw new Error('All AI providers failed');
}
```

### 3. Rate Limiting
```typescript
import rateLimit from 'express-rate-limit';

const aiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  message: 'Too many AI requests, please try again later'
});

// Apply to AI routes
router.use('/ai', aiRateLimit);
```

## 📈 Monitoring y Métricas

### Métricas Clave
```typescript
interface AIMetrics {
  provider: string;
  requests_per_minute: number;
  average_response_time: number;
  error_rate: number;
  cost_per_request: number;
  tokens_used: number;
  user_satisfaction_score: number;
}
```

### Logging Estructurado
```typescript
logger.info('AI Request', {
  provider: 'openrouter',
  model: 'claude-3.5-sonnet',
  input_tokens: 150,
  output_tokens: 75,
  response_time: 1200,
  cost: 0.003,
  user_feedback: 'positive'
});
```

## 🔒 Seguridad y Privacidad

### 1. Sanitización de Datos
```typescript
function sanitizeForAI(message: string): string {
  // Remove potential PII
  return message
    .replace(/\b\d{4}-\d{4}-\d{4}-\d{4}\b/g, '[CARD_NUMBER]') // Credit cards
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]') // Emails
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]'); // SSN patterns
}
```

### 2. Rate Limiting por Usuario
```typescript
const userRateLimit = new Map<string, number>();

function checkUserRateLimit(userId: string): boolean {
  const requests = userRateLimit.get(userId) || 0;
  if (requests >= 100) { // 100 requests per hour
    return false;
  }
  userRateLimit.set(userId, requests + 1);
  return true;
}
```

## 🚀 Optimización de Performance

### 1. Caching
```typescript
import NodeCache from 'node-cache';

const responseCache = new NodeCache({ 
  stdTTL: 300, // 5 minutes
  checkperiod: 60 
});

public async generateResponseCached(message: string): Promise<AIResponse> {
  const cacheKey = `ai_${hash(message)}`;
  const cached = responseCache.get<AIResponse>(cacheKey);
  
  if (cached) {
    return { ...cached, fromCache: true };
  }
  
  const response = await this.generateResponse(message);
  responseCache.set(cacheKey, response);
  
  return response;
}
```

### 2. Streaming para Respuestas Largas
```typescript
public async streamResponse(message: string): Promise<ReadableStream> {
  const stream = new ReadableStream({
    async start(controller) {
      const response = await this.openrouter.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: message }],
        stream: true
      });
      
      for await (const chunk of response) {
        controller.enqueue(chunk.choices[0]?.delta?.content || '');
      }
      
      controller.close();
    }
  });
  
  return stream;
}
```

Esta guía proporciona las bases para desarrollar y mantener los servicios de IA en LeadsCRM de manera eficiente y escalable.
