import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger';

// Interfaz común para respuestas de IA
export interface AIResponse {
  success: boolean;
  content?: string;
  error?: string;
  provider: 'openrouter' | 'gemini';
  tokensUsed?: number;
}

// Interfaz para contexto del mensaje
export interface MessageContext {
  from: string;
  sessionId: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  phoneNumber?: string;
}

// Interfaz para análisis de intención
export interface IntentAnalysis {
  intent: string;
  confidence: number;
  entities: Record<string, any>;
  sentiment: 'positive' | 'negative' | 'neutral';
}

class AIService {
  private openrouter: OpenAI | null = null;
  private gemini: GoogleGenerativeAI | null = null;
  private currentProvider: 'openrouter' | 'gemini';
  
  // Templates predefinidos para respuestas rápidas y consistentes
  private static templates = {
    greeting: [
      '¡Hola! 👋 Soy tu asistente de EscortsHub.net. ¿En qué puedo ayudarte?',
      'Hola 😊 Bienvenido/a a EscortsHub.net. ¿Cómo te puedo ayudar?',
      '¡Hola! Soy el asistente virtual de EscortsHub.net. ¿Qué necesitas?'
    ],
    pricing: [
      'El paquete Plus (500 HUB por 300€) es el más popular y rentable. ¿Te interesa?',
      'Paquete Basic (100 HUB/80€) o Plus (500 HUB/300€). ¿Cuál prefieres?',
      'Tenemos paquetes desde 80€. Plus (500 HUB/300€) es el mejor valor. ¿Te conviene?'
    ],
    products: [
      'Ofrecemos publicidad premium y destacados para escorts. ¿Qué necesitas?',
      'Tenemos anuncios VIP, destacados y premium. ¿Te interesa alguno específico?',
      'Servicios de publicidad para escorts: VIP, destacados y más. ¿Cuál te conviene?'
    ],
    registration: [
      'Registro gratis en https://www.escortshub.net/es/sign-up. Solo pagas lo que uses. ¿Te ayudo?',
      'Gratis registrarse en https://www.escortshub.net/es/sign-up. ¿Necesitas ayuda con algo específico?',
      'Crear cuenta es gratis: https://www.escortshub.net/es/sign-up. ¿Tienes dudas sobre el proceso?'
    ],
    technical: [
      'Para soporte técnico detallado, mejor contacta a nuestro equipo. ¿Es urgente?',
      'Problemas técnicos los resolvemos rápido. ¿Puedes describirme qué pasa?',
      'Te ayudo con lo técnico. ¿Qué error o problema tienes exactamente?'
    ],
    fallback: [
      'Disculpa, no entendí bien tu consulta. ¿Puedes ser más específico?',
      'No estoy seguro de entender. ¿Podrías reformular tu pregunta?',
      'Perdón, ¿puedes explicarme mejor qué necesitas? Te ayudo enseguida.'
    ]
  };

  constructor() {
    this.currentProvider = (process.env.AI_PROVIDER as 'openrouter' | 'gemini') || 'openrouter';
    logger.info(`🔍 Environment Variables Check:`);
    logger.info(`  - AI_PROVIDER: ${process.env.AI_PROVIDER}`);
    logger.info(`  - OPENROUTER_MODEL: ${process.env.OPENROUTER_MODEL}`);
    logger.info(`  - OPENROUTER_API_KEY: ${process.env.OPENROUTER_API_KEY ? 'Set (hidden)' : 'Not set'}`);
    this.initializeProviders();
  }

  private initializeProviders(): void {
    try {
      // Inicializar OpenRouter con nueva configuración
      const openrouterApiKey = process.env.OPENROUTER_API_KEY || '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';
      
      if (openrouterApiKey) {
        this.openrouter = new OpenAI({
          baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
          apiKey: openrouterApiKey,
          defaultHeaders: {
            'HTTP-Referer': 'http://localhost:3002',
            'X-Title': 'LeadsCRM WhatsApp Service'
          }
        });
        const modelToUse = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-120b';
        logger.info(`🚀 OpenRouter inicializado correctamente con modelo: ${modelToUse}`);
      }

      // Inicializar Google Gemini
      if (process.env.GEMINI_API_KEY) {
        this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        logger.info('Google Gemini inicializado correctamente');
      }

      logger.info(`Proveedor de IA activo: ${this.currentProvider}`);
    } catch (error) {
      logger.error('Error inicializando servicios de IA:', error);
    }
  }

  // Cambiar proveedor de IA dinámicamente
  public switchProvider(provider: 'openrouter' | 'gemini'): boolean {
    if (provider === 'openrouter' && this.openrouter) {
      this.currentProvider = 'openrouter';
      logger.info('Cambiado a proveedor: OpenRouter');
      return true;
    } else if (provider === 'gemini' && this.gemini) {
      this.currentProvider = 'gemini';
      logger.info('Cambiado a proveedor: Google Gemini');
      return true;
    } else {
      logger.error(`No se puede cambiar al proveedor ${provider}. Verificar configuración.`);
      return false;
    }
  }

  // Obtener proveedor actual
  public getCurrentProvider(): string {
    return this.currentProvider;
  }

  // Generar respuesta usando el proveedor activo
  public async generateResponse(
    message: string, 
    context?: MessageContext
  ): Promise<AIResponse> {
    try {
      if (this.currentProvider === 'openrouter') {
        return await this.generateResponseOpenRouter(message, context);
      } else if (this.currentProvider === 'gemini') {
        return await this.generateResponseGemini(message, context);
      } else {
        throw new Error(`Proveedor no soportado: ${this.currentProvider}`);
      }
    } catch (error) {
      logger.error('Error generando respuesta con IA:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
        provider: this.currentProvider
      };
    }
  }

  // Generar respuesta usando OpenRouter
  private async generateResponseOpenRouter(
    message: string, 
    context?: MessageContext
  ): Promise<AIResponse> {
    if (!this.openrouter) {
      throw new Error('OpenRouter no está configurado');
    }

    const systemPrompt = this.getSystemPrompt(context);
    const conversationHistory = context?.conversationHistory || [];

    // Construir mensajes para el contexto
    const messages: any[] = [
      { role: 'system', content: systemPrompt }
    ];

    // Añadir historial de conversación si existe
    conversationHistory.forEach(msg => {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    });

    // Añadir mensaje actual del usuario
    messages.push({
      role: 'user',
      content: message
    });

    // Get the model name and log it for debugging
    const modelName = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-120b';
    logger.info(`🤖 Using OpenRouter model: ${modelName}`);

    try {
      const completion = await this.openrouter.chat.completions.create({
        model: modelName,
        messages,
        max_tokens: 2048,
        temperature: 0.7,
        stream: false
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        logger.error(`❌ Empty response from model ${modelName}`, {
          choices: completion.choices,
          model: modelName
        });
        throw new Error(`No se recibió respuesta del modelo ${modelName}`);
      }

      return {
        success: true,
        content: responseContent,
        provider: 'openrouter',
        tokensUsed: completion.usage?.total_tokens
      };
    } catch (apiError: any) {
      // Log detailed API error information
      logger.error('❌ OpenRouter API Error:', {
        error: apiError.message,
        status: apiError.status,
        model: modelName,
        code: apiError.code
      });
      
      // Check for specific error types
      if (apiError.status === 404 || apiError.message?.includes('model not found')) {
        throw new Error(`Model '${modelName}' not found in OpenRouter. Please check your OPENROUTER_MODEL configuration.`);
      }
      
      throw apiError;
    }

    // This section is now handled in the try block above
  }

  // Generar respuesta usando Google Gemini
  private async generateResponseGemini(
    message: string, 
    context?: MessageContext
  ): Promise<AIResponse> {
    if (!this.gemini) {
      throw new Error('Google Gemini no está configurado');
    }

    const model = this.gemini.getGenerativeModel({ 
      model: process.env.GEMINI_MODEL || 'gemini-1.5-pro' 
    });

    const systemPrompt = this.getSystemPrompt(context);
    const fullPrompt = `${systemPrompt}\n\nMensaje del usuario: ${message}`;

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const responseContent = response.text();

    if (!responseContent) {
      throw new Error('No se recibió respuesta del modelo');
    }

    return {
      success: true,
      content: responseContent,
      provider: 'gemini'
    };
  }

  // Analizar intención del mensaje
  public async analyzeIntent(message: string): Promise<IntentAnalysis> {
    try {
      const prompt = `
Analiza el siguiente mensaje de WhatsApp y clasifica la intención del usuario.

Mensaje: "${message}"

INSTRUCCIONES:
- Responde ÚNICAMENTE con un objeto JSON válido
- No incluyas texto adicional antes o después del JSON
- Usa solo estas intenciones: saludo, consulta_producto, solicitar_info, queja, despedida, precio, registro, general
- El sentiment debe ser: positive, negative, o neutral
- La confidence debe ser un número entre 0.0 y 1.0

Ejemplos:
- "hola" -> intent: "saludo"
- "cuánto cuesta" -> intent: "precio"
- "no me interesa" -> intent: "despedida"
- "gracias, no me interesa" -> intent: "despedida"
- "quiero registrarme" -> intent: "registro"

Respuesta JSON:
{
  "intent": "categoria_aqui",
  "confidence": 0.90,
  "entities": {},
  "sentiment": "neutral"
}`;

      const response = await this.generateResponse(prompt);
      
      if (response.success && response.content) {
        try {
          // Intentar extraer JSON de la respuesta
          let jsonContent = response.content.trim();
          
          // Buscar el primer { y el último } para extraer solo el JSON
          const firstBrace = jsonContent.indexOf('{');
          const lastBrace = jsonContent.lastIndexOf('}');
          
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            jsonContent = jsonContent.substring(firstBrace, lastBrace + 1);
          }
          
          const parsed = JSON.parse(jsonContent);
          
          // Validar que tiene los campos requeridos
          if (parsed.intent && typeof parsed.confidence === 'number' && parsed.sentiment) {
            return {
              intent: parsed.intent,
              confidence: Math.max(0, Math.min(1, parsed.confidence)), // Asegurar rango 0-1
              entities: parsed.entities || {},
              sentiment: ['positive', 'negative', 'neutral'].includes(parsed.sentiment) 
                         ? parsed.sentiment : 'neutral'
            };
          } else {
            logger.warn('Respuesta de análisis de intención incompleta, usando valores por defecto');
          }
        } catch (parseError) {
          logger.warn('Error parseando análisis de intención:', {
            error: parseError instanceof Error ? parseError.message : 'Unknown error',
            responseContent: response.content?.substring(0, 200) + '...' // Solo mostrar primeros 200 chars
          });
        }
      }

      // Valores por defecto si el análisis falla
      return {
        intent: 'general',
        confidence: 0.5,
        entities: {},
        sentiment: 'neutral'
      };
    } catch (error) {
      logger.error('Error analizando intención:', error);
      return {
        intent: 'general',
        confidence: 0.0,
        entities: {},
        sentiment: 'neutral'
      };
    }
  }

  // Obtener prompt del sistema contextual
  private getSystemPrompt(context?: MessageContext): string {
    const basePrompt = `
Eres un asistente virtual profesional de EscortsHub, la plataforma líder de escorts en España. Tu misión es ayudar a los usuarios con información sobre nuestros productos de manera BREVE, NATURAL y CONVERSACIONAL.

🎯 **REGLAS FUNDAMENTALES DE RESPUESTA:**
- **BREVEDAD OBLIGATORIA**: Respuestas máximo 60-80 palabras
- **SIN TABLAS NI LISTAS LARGAS**: Solo información esencial
- **CONVERSACIONAL**: Como mensaje de WhatsApp natural
- **UNA PREGUNTA FINAL**: Para mantener la conversación

📱 **TIPOS DE RESPUESTA:**

**SALUDOS ("hola", "buenas", etc.):**
MÁXIMO 2 LÍNEAS. Ejemplo:
"¡Hola! 👋 Soy tu asistente de EscortsHub.net. ¿En qué puedo ayudarte hoy?"

**CONSULTA PRECIOS:**
Menciona solo:
- Paquete Plus: 500 HUB por 300€ (0,60€/moneda) - MEJOR PRECIO
- 1-2 productos relevantes con precios
- Pregunta qué le interesa más

**CONSULTA PRODUCTOS:**
- Descripción en 1-2 líneas del producto
- Precio básico con Paquete Plus
- Pregunta si necesita más info

**REGISTRO:**
"Registrarse es GRATUITO en https://www.escortshub.net/es/sign-up. Solo pagas por los productos que actives. ¿Te ayudo con algún paso?"

🚫 **PROHIBIDO:**
- Tablas extensas
- Listas de todos los precios
- Más de 80 palabras
- Múltiples secciones
- Información no solicitada

✅ **INFORMACIÓN CLAVE:**
- EscortsHub.net - Plataforma líder
- Sistema de monedas HUB
- Paquete Plus: mejor precio (0,60€/moneda)
- Registro GRATUITO
- Soporte 24/7

💡 **EJEMPLO DE RESPUESTA IDEAL:**
"En EscortsHub usamos monedas HUB. El Paquete Plus (500 HUB por 300€) te da el mejor precio. Un Anuncio TOP de 30 días cuesta 450 HUB. ¿Te interesa registrarte?"

🎯 **SIEMPRE PREGUNTA AL FINAL:**
- ¿Qué te interesa más?
- ¿Te ayudo con el registro?
- ¿Necesitas más información?
- ¿Quieres que te explique algo específico?
    `;

    // Añadir contexto específico si está disponible
    if (context?.phoneNumber) {
      return basePrompt + `\n\nCONTEXTO ACTUAL:\n- Usuario contacta desde: ${context.phoneNumber}\n- Plataforma: EscortsHub WhatsApp\n- Objetivo: Convertir en cliente registrado`;
    }

    return basePrompt;
  }

  /**
   * Obtener template predefinido basado en intención
   */
  public getTemplateResponse(
    intent: string, 
    context?: MessageContext, 
    useRandom: boolean = true
  ): string | null {
    try {
      let templateCategory: string;
      
      // Mapear intenciones a categorías de templates
      switch (intent.toLowerCase()) {
        case 'saludo':
        case 'greeting':
          templateCategory = 'greeting';
          break;
        case 'precio':
        case 'pricing_inquiry':
        case 'consulta_precio':
          templateCategory = 'pricing';
          break;
        case 'producto':
        case 'product_inquiry':
        case 'consulta_producto':
          templateCategory = 'products';
          break;
        case 'registro':
        case 'registration':
          templateCategory = 'registration';
          break;
        case 'soporte_tecnico':
        case 'technical_support':
          templateCategory = 'technical';
          break;
        default:
          templateCategory = 'fallback';
      }
      
      const templates = AIService.templates[templateCategory as keyof typeof AIService.templates];
      if (!templates || templates.length === 0) {
        return null;
      }
      
      // Seleccionar template (aleatorio o primero)
      let selectedTemplate: string;
      if (useRandom) {
        const randomIndex = Math.floor(Math.random() * templates.length);
        selectedTemplate = templates[randomIndex];
      } else {
        selectedTemplate = templates[0];
      }
      
      // Personalizar template con contexto si es necesario
      if (context?.phoneNumber && templateCategory === 'greeting') {
        // Añadir personalización para saludos si hay nombre del contacto
        // Esto se puede extender en el futuro
      }
      
      logger.debug('Template predefinido usado:', {
        intent,
        templateCategory,
        template: selectedTemplate.substring(0, 50) + '...'
      });
      
      return selectedTemplate;
    } catch (error) {
      logger.error('Error obteniendo template predefinido:', error);
      return null;
    }
  }
  
  /**
   * Verificar si una respuesta generada es demasiado larga y usar template como fallback
   */
  public applyTemplateFallback(
    originalResponse: string,
    intent: string,
    maxWords: number = 60,
    context?: MessageContext
  ): string {
    try {
      const words = originalResponse.split(/\s+/);
      
      if (words.length <= maxWords) {
        return originalResponse;
      }
      
      logger.info('Respuesta demasiado larga, aplicando template fallback:', {
        originalWords: words.length,
        maxWords,
        intent
      });
      
      // Usar template predefinido como fallback
      const templateResponse = this.getTemplateResponse(intent, context, true);
      
      if (templateResponse) {
        return templateResponse;
      }
      
      // Fallback final: truncar respuesta original inteligentemente
      return this.intelligentTruncate(originalResponse, maxWords, intent);
    } catch (error) {
      logger.error('Error aplicando template fallback:', error);
      return originalResponse;
    }
  }
  
  /**
   * Truncamiento inteligente de respuestas largas
   */
  private intelligentTruncate(text: string, maxWords: number, intent: string): string {
    const words = text.split(/\s+/);
    
    if (words.length <= maxWords) {
      return text;
    }
    
    // Reservar espacio para pregunta final
    const questionWords = 5;
    const availableWords = maxWords - questionWords;
    
    let truncated = words.slice(0, availableWords).join(' ');
    
    // Añadir pregunta apropiada según intención
    const questions = {
      'saludo': ' ¿En qué puedo ayudarte?',
      'precio': ' ¿Te interesa algún paquete?',
      'producto': ' ¿Necesitas más información?',
      'registro': ' ¿Te ayudo con el registro?',
      'general': ' ¿Te ayudo con algo más?'
    };
    
    const question = questions[intent as keyof typeof questions] || ' ¿Puedo ayudarte en algo más?';
    
    // Limpiar puntuación final antes de añadir pregunta
    truncated = truncated.replace(/[.,!]*$/, '');
    
    return truncated + question;
  }
  
  /**
   * Detectar si un mensaje es un saludo simple
   */
  public isSimpleGreeting(message: string): boolean {
    const greetingKeywords = ['hola', 'hi', 'buenas', 'buenos días', 'buenas tardes', 'buenas noches', 'hey', 'hello', 'saludos'];
    const normalizedMessage = message.toLowerCase().trim();
    
    // Verificar si es exactamente un saludo
    if (greetingKeywords.some(keyword => normalizedMessage === keyword)) {
      return true;
    }
    
    // Verificar si empieza con saludo y es corto
    if (normalizedMessage.length <= 20) {
      return greetingKeywords.some(keyword => normalizedMessage.startsWith(keyword));
    }
    
    return false;
  }
  
  /**
   * Método principal mejorado que integra templates predefinidos
   */
  public async generateOptimizedResponse(
    message: string,
    context?: MessageContext
  ): Promise<AIResponse> {
    try {
      // 1. Analizar intención primero
      const intentAnalysis = await this.analyzeIntent(message);
      
      // 2. Para saludos simples, usar template directo (más eficiente)
      if (
        (intentAnalysis.intent === 'saludo' && intentAnalysis.confidence > 0.8) ||
        this.isSimpleGreeting(message)
      ) {
        const greetingTemplate = this.getTemplateResponse('saludo', context, true);
        if (greetingTemplate) {
          return {
            success: true,
            content: greetingTemplate,
            provider: this.currentProvider,
            tokensUsed: 0 // Template no usa tokens
          };
        }
      }
      
      // 3. Para otros casos, generar respuesta normal
      const aiResponse = await this.generateResponse(message, context);
      
      // 4. Aplicar fallback de template si es necesario
      if (aiResponse.success && aiResponse.content) {
        const optimizedContent = this.applyTemplateFallback(
          aiResponse.content,
          intentAnalysis.intent,
          60, // Límite de 60 palabras
          context
        );
        
        return {
          ...aiResponse,
          content: optimizedContent
        };
      }
      
      return aiResponse;
    } catch (error) {
      logger.error('Error en generateOptimizedResponse:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
        provider: this.currentProvider
      };
    }
  }

  // Verificar el estado de los proveedores
  public getStatus(): { openrouter: boolean; gemini: boolean; current: string } {
    return {
      openrouter: !!this.openrouter,
      gemini: !!this.gemini,
      current: this.currentProvider
    };
  }
}

// Exportar instancia singleton
export default new AIService();
