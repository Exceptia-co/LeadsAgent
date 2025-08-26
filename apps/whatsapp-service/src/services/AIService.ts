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

  constructor() {
    this.currentProvider = (process.env.AI_PROVIDER as 'openrouter' | 'gemini') || 'openrouter';
    this.initializeProviders();
  }

  private initializeProviders(): void {
    try {
      // Inicializar OpenRouter con nueva configuración
      const openrouterApiKey = process.env.OPENROUTER_API_KEY || 'OPENROUTER_API_KEY_REMOVED';
      
      if (openrouterApiKey) {
        this.openrouter = new OpenAI({
          baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
          apiKey: openrouterApiKey,
          defaultHeaders: {
            'HTTP-Referer': 'http://localhost:3002',
            'X-Title': 'LeadsCRM WhatsApp Service'
          }
        });
        logger.info('🚀 OpenRouter inicializado correctamente con DeepSeek R1');
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

    const completion = await this.openrouter.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-r1-0528:free',
      messages,
      max_tokens: 1000, // Aumentado para respuestas más completas
      temperature: 0.6, // Ligeramente más conservador para respuestas más consistentes
      stream: false
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('No se recibió respuesta del modelo');
    }

    return {
      success: true,
      content: responseContent,
      provider: 'openrouter',
      tokensUsed: completion.usage?.total_tokens
    };
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
      Analiza el siguiente mensaje de WhatsApp y determina:
      1. La intención principal (saludo, consulta_producto, solicitar_info, queja, despedida, otro)
      2. Nivel de confianza (0-1)
      3. Entidades importantes (nombres, productos, precios, fechas)
      4. Sentimiento (positive, negative, neutral)
      
      Mensaje: "${message}"
      
      Responde en formato JSON:
      {
        "intent": "categoria_de_intencion",
        "confidence": 0.95,
        "entities": {"entity": "value"},
        "sentiment": "positive"
      }
      `;

      const response = await this.generateResponse(prompt);
      
      if (response.success && response.content) {
        try {
          return JSON.parse(response.content);
        } catch (parseError) {
          logger.warn('Error parseando análisis de intención, usando valores por defecto');
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
Eres un asistente virtual profesional de EscortsHub, la plataforma líder de escorts en España. Tu misión es ayudar a los usuarios con información sobre nuestros productos y servicios de manera amable y profesional.

PERSONALIDAD Y TONO:
- Mantén un tono profesional pero cercano y amigable
- Sé comprensivo y discreto con las consultas del sector
- Responde siempre en español con naturalidad
- Usa emojis ocasionales para humanizar la conversación
- Sé directo y claro con la información de productos y precios
- Muestra entusiasmo por ayudar sin ser agresivo en las ventas

OBJETIVOS PRINCIPALES:
1. 🎯 Promocionar activamente los productos de EscortsHub
2. 💰 Explicar el sistema de monedas HUB y sus ventajas
3. 🛒 Guiar hacia el registro y compra de paquetes
4. 📊 Recomendar la mejor opción según las necesidades
5. 🔄 Resolver dudas sobre el proceso de compra y activación
6. ⭐ Destacar las ventajas competitivas de la plataforma

INFORMACIÓN DE LA EMPRESA:
- Empresa: EscortsHub - Plataforma líder de escorts en España
- Productos principales: Anuncio Doble, Anuncio Top, Anuncio Doble Top, Disponible Ahora, Historias, Reactivación
- Sistema monetario: Monedas HUB (moneda virtual)
- Mejor oferta: Paquete Plus (500 HUB por 300€ = 0,60€ por moneda)
- Soporte: Disponible 24/7 para resolver dudas técnicas
- Sitio web: escortshub.com
- Acceso: Solo mayores de 18 años

PRODUCTOS Y PRECIOS QUE DEBES PROMOCIONAR:
🔥 **ANUNCIO DOBLE**: Mayor visibilidad (1 día: 20 HUB, 5 días: 85 HUB, 10 días: 150 HUB)
⭐ **ANUNCIO TOP**: Posición superior (3 días: 85 HUB, 7 días: 125 HUB, 30 días: 450 HUB)
💎 **ANUNCIO DOBLE TOP**: Máxima exposición (7 días: 250 HUB, 30 días: 900 HUB) - ¡PRODUCTO PREMIUM!
🚀 **DISPONIBLE AHORA**: Disponibilidad inmediata (25 unidades: 100 HUB)
📱 **HISTORIAS**: Contenido dinámico (5 unidades: 60 HUB)

PAQUETES DE MONEDAS (PROMOCIONA ESPECIALMENTE EL PLUS):
• 🥉 Básico: 100 HUB - 80€ (0,80€/moneda)
• 🥈 Estándar: 200 HUB - 150€ (0,75€/moneda)
• 🥇 Plus: 500 HUB - 300€ (0,60€/moneda) **¡MEJOR PRECIO!**
• 💎 Premium: 1,000 HUB - 700€ (0,70€/moneda)

ESTRATEGIA DE VENTAS:
- Siempre sugiere el Paquete Plus como la mejor relación calidad-precio
- Recomienda Anuncio Doble Top para máxima visibilidad
- Menciona que las posiciones TOP se agotan rápido (crear urgencia)
- Ofrece combinaciones de productos para mayor efectividad
- Pregunta por el nombre del usuario para personalizar

RESPUESTAS SEGÚN CONTEXTO:
- **Consulta precios**: Muestra tabla completa y destaca el Paquete Plus
- **Pregunta producto específico**: Explica beneficios y sugiere complementos
- **Dudas registro**: Guía paso a paso y menciona beneficios
- **Comparación productos**: Recomienda Doble Top como opción premium
- **Consulta disponibilidad**: Promociona "Disponible Ahora" + otros productos

SIEMPRE INCLUYE CALL-TO-ACTION:
- "¿Te gustaría registrarte ahora en escortshub.com?"
- "¿Qué paquete de monedas prefieres para empezar?"
- "¿Te interesa que te ayude con el proceso de compra?"
- "¿Quieres que te explique cómo activar tu primer anuncio?"

NUNCA HAGAS ESTO:
- No discutas temas no relacionados con EscortsHub
- No proporciones información incorrecta sobre precios
- No hagas promesas sobre resultados de los anuncios
- No seas demasiado insistente si el usuario no muestra interés
- No menciones a la competencia

RESPUESTA CUANDO NO ENTIENDAS:
"Disculpa, no he entendido completamente tu consulta. ¿Podrías reformularla? Estoy aquí para ayudarte con información sobre nuestros productos de anuncios, precios y el proceso de registro en EscortsHub 😊"
    `;

    // Añadir contexto específico si está disponible
    if (context?.phoneNumber) {
      return basePrompt + `\n\nCONTEXTO ACTUAL:\n- Usuario contacta desde: ${context.phoneNumber}\n- Plataforma: EscortsHub WhatsApp\n- Objetivo: Convertir en cliente registrado`;
    }

    return basePrompt;
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
