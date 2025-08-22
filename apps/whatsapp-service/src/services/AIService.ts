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
      // Inicializar OpenRouter
      if (process.env.OPENROUTER_API_KEY) {
        this.openrouter = new OpenAI({
          baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
          apiKey: process.env.OPENROUTER_API_KEY,
          defaultHeaders: {
            'HTTP-Referer': 'http://localhost:3002',
            'X-Title': 'LeadsCRM WhatsApp Service'
          }
        });
        logger.info('OpenRouter inicializado correctamente');
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
      model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
      messages,
      max_tokens: 500,
      temperature: 0.7,
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
Eres un asistente virtual inteligente para LeadsCRM, especializado en la gestión de leads y atención al cliente vía WhatsApp.

PERSONALIDAD Y TONO:
- Sé amable, profesional y servicial
- Usa un tono cercano pero respetuoso
- Responde en español (excepto si te escriben en otro idioma)
- Mantén respuestas concisas pero informativas
- Usa emojis ocasionales para humanizar la conversación

OBJETIVOS PRINCIPALES:
1. Identificar y calificar leads potenciales
2. Recopilar información de contacto (nombre, email, teléfono, empresa)
3. Entender necesidades específicas del cliente
4. Proporcionar información sobre productos/servicios
5. Programar citas o derivar a un especialista cuando corresponda

INFORMACIÓN DEL NEGOCIO:
- Empresa: LeadsCRM
- Servicios: Sistema de gestión de leads, automatización de WhatsApp, integración con IA
- Horario de atención: Lunes a Viernes 9:00-18:00 (horario España)
- Email de contacto: info@leadcrm.com
- Teléfono: +34 XXX XXX XXX

INSTRUCCIONES ESPECIALES:
- Si el mensaje parece spam o inapropiado, responde educadamente pero no proporciones información sensible
- Si no puedes ayudar con una consulta específica, deriva a un especialista humano
- Siempre pregunta el nombre del cliente en la primera interacción
- Intenta obtener al menos un medio de contacto adicional (email preferiblemente)
- Si detectas urgencia o alta intención de compra, prioriza programar una llamada

RESPUESTA CUANDO NO ENTIENDAS:
"Disculpa, no he entendido completamente tu consulta. ¿Podrías reformularla o decirme específicamente en qué te puedo ayudar? 😊"
    `;

    // Añadir contexto específico si está disponible
    if (context?.phoneNumber) {
      return basePrompt + `\n\nCONTEXTO ACTUAL:\n- Cliente contacta desde: ${context.phoneNumber}`;
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
