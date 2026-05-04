/**
 * System Prompt Service
 *
 * Handles generation of contextual system prompts for AI providers.
 * Provides specialized prompts for different scenarios and use cases.
 */

import { logger } from '../../utils/logger';
import { aiConfig } from '../../config/enhanced-ai.config';
import type { MessageContext } from './interfaces/IIntentAnalysis';
import type { AiAgentData, AiProductData } from '../DatabaseService';

/**
 * Prompt types for different scenarios
 */
export type PromptType = 'standard' | 'intent_analysis' | 'customer_service' | 'technical_support';

/**
 * System prompt service implementation
 */
export class SystemPromptService {
  private promptConfig: ReturnType<typeof aiConfig.getPromptConfig>;

  /**
   * Fase A7 (2026-04-19): cache in-memory del prompt base.
   * Se carga en background desde `ai_configuration` key `system_prompt.default.es`
   * al iniciar el servicio. Si la key no existe o falla la carga, `getBasePrompt()`
   * usa el hardcoded como fallback (backwards compat).
   *
   * `getBasePrompt()` debe permanecer síncrono porque tiene muchos callers en
   * toda la cadena AI — hacerlo async requeriría propagar awaits profundamente.
   */
  private cachedBasePrompt: string | null = null;
  private basePromptKey = 'system_prompt.default.es';

  constructor() {
    this.promptConfig = aiConfig.getPromptConfig();
    // Fire-and-forget: cargar en background, sin bloquear el constructor.
    void this.refreshBasePrompt();
    logger.info('✅ System Prompt Service initialized');
  }

  /**
   * Recarga el prompt base desde `ai_configuration`. No bloquea el boot;
   * si falla, el servicio sigue usando el hardcoded fallback.
   * Puede llamarse manualmente desde un admin endpoint para propagar cambios
   * sin restart.
   */
  public async refreshBasePrompt(): Promise<void> {
    try {
      const { default: DatabaseService } = await import('../DatabaseService');
      const loaded = await DatabaseService.getAIConfiguration(this.basePromptKey);
      if (loaded && loaded.trim().length > 0) {
        this.cachedBasePrompt = loaded;
        logger.info(
          `✅ [PROMPT] Base prompt loaded from DB (${loaded.length} chars, key=${this.basePromptKey})`
        );
      } else {
        this.cachedBasePrompt = null;
        logger.info(
          `ℹ️ [PROMPT] No DB override for ${this.basePromptKey} — using hardcoded fallback`
        );
      }
    } catch (err) {
      logger.warn(
        `⚠️ [PROMPT] Failed to load ${this.basePromptKey} from DB — using hardcoded fallback:`,
        err
      );
      this.cachedBasePrompt = null;
    }
  }

  /**
   * Generate standard system prompt with optional context
   */
  public generateSystemPrompt(context?: MessageContext): string {
    const basePrompt = this.getBasePrompt();

    // Add contextual information
    let contextualPrompt = basePrompt;

    if (this.promptConfig.includeContext && context) {
      contextualPrompt += this.buildContextSection(context);
    }

    if (this.promptConfig.includeProductInfo) {
      contextualPrompt += this.getProductInfoSection();
    }

    // Ensure prompt doesn't exceed maximum length
    return this.truncatePrompt(contextualPrompt);
  }

  /**
   * Generate specialized prompts for different scenarios
   */
  public generateSpecializedPrompt(type: PromptType, context?: MessageContext): string {
    switch (type) {
      case 'intent_analysis':
        return this.getIntentAnalysisPrompt();

      case 'customer_service':
        return this.getCustomerServicePrompt(context);

      case 'technical_support':
        return this.getTechnicalSupportPrompt(context);

      default:
        return this.generateSystemPrompt(context);
    }
  }

  /**
   * Generate localized prompts
   */
  public generateLocalizedPrompt(language: 'es' | 'en', context?: MessageContext): string {
    if (language === 'en') {
      return this.getEnglishPrompt(context);
    }

    return this.generateSystemPrompt(context);
  }

  /**
   * B2.1: compose system prompt dynamically from AiAgent config, products,
   * and knowledge items. Falls back to legacy hardcoded prompt when
   * aiAgentId is null or agent not found.
   */
  public async buildAgentSystemPrompt(
    aiAgentId: string | null | undefined,
    context?: MessageContext,
  ): Promise<string> {
    if (!aiAgentId || !context?.tenantId) {
      return this.generateSystemPrompt(context);
    }

    try {
      const { default: DatabaseService } = await import('../DatabaseService');
      const result = await DatabaseService.getAiAgentWithProducts(context.tenantId, aiAgentId);
      if (!result) {
        logger.warn(`[PROMPT] Agent ${aiAgentId} not found for tenant ${context.tenantId} — legacy fallback`);
        return this.generateSystemPrompt(context);
      }

      const { agent, products } = result;
      const knowledgeItems = await DatabaseService.getKnowledgeItemsByAgent(context.tenantId, aiAgentId, 10);
      const lang = agent.language || 'es';

      const layers = [
        this.buildChannelGuidelines(lang),
        this.buildPersonaLayer(agent),
        this.buildBusinessLayer(agent),
        this.buildToneLayer(agent),
        this.buildCustomInstructionsLayer(agent),
        this.buildKnowledgeLayer(knowledgeItems),
        this.buildProductsLayer(products),
        this.buildGoalLayer(agent),
        context ? this.buildDynamicContextLayer(context, agent) : '',
        this.buildOutputFormatLayer(agent),
      ].filter(Boolean);

      return this.truncatePrompt(layers.join('\n\n'));
    } catch (err) {
      logger.error(`[PROMPT] Error building agent prompt for ${aiAgentId}:`, err);
      return this.generateSystemPrompt(context);
    }
  }

  // ── Layer builders ────────────────────────────────────────────────

  private buildChannelGuidelines(lang: string): string {
    if (lang === 'en') {
      return [
        'CHANNEL RULES (WhatsApp):',
        '- Keep responses under 60-80 words',
        '- Conversational tone, no tables or long lists',
        '- Always end with ONE follow-up question',
        '- Answer ONLY what was asked',
      ].join('\n');
    }
    return [
      'REGLAS DEL CANAL (WhatsApp):',
      '- Respuestas máximo 60-80 palabras',
      '- Tono conversacional, sin tablas ni listas largas',
      '- Siempre termina con UNA pregunta de seguimiento',
      '- Responde SOLO lo que se preguntó',
    ].join('\n');
  }

  private buildPersonaLayer(agent: AiAgentData): string {
    const persona = agent.personaName || 'Asistente';
    return `Eres ${persona}, asistente virtual de ${agent.businessName}.`;
  }

  private buildBusinessLayer(agent: AiAgentData): string {
    const parts: string[] = [];
    if (agent.industry) parts.push(`Sector: ${agent.industry}.`);
    if (agent.websiteUrl) parts.push(`Web: ${agent.websiteUrl}`);
    if (agent.businessHours) {
      try {
        const hours = typeof agent.businessHours === 'string'
          ? JSON.parse(agent.businessHours)
          : agent.businessHours;
        const days = Object.entries(hours)
          .filter(([, v]) => v && (v as string[]).length > 0)
          .map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`)
          .join(' | ');
        if (days) parts.push(`Horario: ${days}`);
      } catch { /* ignore malformed hours */ }
    }
    return parts.length > 0 ? `INFORMACIÓN DEL NEGOCIO:\n${parts.join('\n')}` : '';
  }

  private buildToneLayer(agent: AiAgentData): string {
    const toneMap: Record<string, string> = {
      FORMAL: 'Usa registro formal (usted). Sin emojis. Lenguaje preciso y cortés.',
      CASUAL: 'Usa registro informal (tú). Emojis moderados. Lenguaje cercano.',
      FRIENDLY: 'Usa registro cercano y amigable (tú). Emojis bienvenidos. Tono cálido y empático.',
      TECHNICAL: 'Usa lenguaje técnico preciso. Sin emojis. Enfócate en datos y especificaciones.',
    };
    const instruction = toneMap[agent.tone] || toneMap['FRIENDLY'];
    return `TONO: ${instruction}`;
  }

  private buildCustomInstructionsLayer(agent: AiAgentData): string {
    if (!agent.customInstructions) return '';
    const sanitized = agent.customInstructions.substring(0, 2000).trim();
    if (!sanitized) return '';
    return `INSTRUCCIONES DEL NEGOCIO (seguir dentro de los límites éticos):\n${sanitized}`;
  }

  private buildKnowledgeLayer(
    items: Array<{ title: string; content: string; category: string }>,
  ): string {
    if (!items.length) return '';
    const lines = items.map((item, i) => `${i + 1}. [${item.category}] ${item.title}: ${item.content}`);
    return `INFORMACIÓN CLAVE:\n${lines.join('\n')}`;
  }

  private buildProductsLayer(products: AiProductData[]): string {
    if (!products.length) return '';
    const lines = products.map((p) => {
      let line = `- ${p.name}`;
      if (p.description) line += `: ${p.description}`;
      if (p.priceMin != null) {
        line += p.priceMax != null && p.priceMax !== p.priceMin
          ? ` (${p.priceMin}–${p.priceMax})`
          : ` (${p.priceMin})`;
      }
      if (p.url) line += ` → ${p.url}`;
      return line;
    });
    return `PRODUCTOS/SERVICIOS:\n${lines.join('\n')}`;
  }

  private buildGoalLayer(agent: AiAgentData): string {
    const goalMap: Record<string, string> = {
      REGISTER: 'Guiar al usuario hacia el registro.',
      PURCHASE: 'Guiar al usuario hacia la compra.',
      MEETING: 'Guiar al usuario a agendar una reunión.',
      CONTACT: 'Facilitar que el usuario contacte al equipo.',
      CUSTOM: agent.goalDescription || 'Asistir al usuario según las instrucciones del negocio.',
    };
    const goal = goalMap[agent.primaryGoal] || goalMap['CONTACT'];
    let layer = `OBJETIVO PRINCIPAL: ${goal}`;
    if (agent.goalCtaUrl) layer += `\nEnlace de acción: ${agent.goalCtaUrl}`;
    if (agent.goalDescription && agent.primaryGoal !== 'CUSTOM') {
      layer += `\n${agent.goalDescription}`;
    }
    layer += '\nSi el usuario necesita ayuda humana, sugiérele contactar al equipo directamente.';
    return layer;
  }

  private buildDynamicContextLayer(context: MessageContext, agent: AiAgentData): string {
    const parts: string[] = ['CONTEXTO ACTUAL:'];
    if (context.phoneNumber) parts.push(`- Usuario: ${context.phoneNumber}`);
    if (context.conversationHistory?.length) {
      parts.push(`- Mensajes previos: ${context.conversationHistory.length}`);
    }
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'mañana' : hour < 18 ? 'tarde' : 'noche';
    parts.push(`- Momento: ${timeOfDay}`);
    parts.push(`- Idioma: ${agent.language || 'es'}`);
    return parts.join('\n');
  }

  private buildOutputFormatLayer(agent: AiAgentData): string {
    const maxWords = agent.responseMaxWords || 80;
    const parts = [`FORMATO DE RESPUESTA:`, `- Máximo ${maxWords} palabras`];
    if (!agent.allowEmojis) parts.push('- NO usar emojis');
    parts.push('- Terminar siempre con una pregunta relevante');
    return parts.join('\n');
  }

  /**
   * Get base system prompt.
   *
   * Fase A7: prefiere la versión cacheada desde `ai_configuration.system_prompt.default.es`
   * si está disponible. Si no, fallback al hardcoded que mantiene compat con
   * el comportamiento pre-A7.
   */
  private getBasePrompt(): string {
    if (this.cachedBasePrompt) {
      return this.cachedBasePrompt;
    }
    return this.getHardcodedBasePrompt();
  }

  /**
   * Hardcoded fallback — también seedea la tabla `ai_configuration` cuando
   * se ejecute el script de setup post-deploy.
   */
  private getHardcodedBasePrompt(): string {
    return `
Eres un asistente virtual profesional de ${this.promptConfig.platform}, la plataforma líder de escorts en España. Tu misión es ayudar a los usuarios con información sobre nuestros productos de manera BREVE, NATURAL y CONVERSACIONAL.

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
  }

  /**
   * Build context section from message context
   */
  private buildContextSection(context: MessageContext): string {
    let contextSection = '\n\n🔍 **CONTEXTO ACTUAL:**\n';

    if (context.phoneNumber) {
      contextSection += `- Usuario contacta desde: ${context.phoneNumber}\n`;
    }

    if (context.sessionId) {
      contextSection += `- Sesión ID: ${context.sessionId}\n`;
    }

    if (context.conversationHistory && context.conversationHistory.length > 0) {
      contextSection += `- Historial disponible: ${context.conversationHistory.length} mensajes anteriores\n`;
    }

    if (context.userLanguage) {
      contextSection += `- Idioma preferido: ${context.userLanguage}\n`;
    }

    contextSection += '- Plataforma: EscortsHub WhatsApp\n';
    contextSection += '- Objetivo: Convertir en cliente registrado';

    return contextSection;
  }

  /**
   * Get product information section
   */
  private getProductInfoSection(): string {
    return `

📦 **PRODUCTOS PRINCIPALES:**

**PAQUETES HUB:**
- Basic: 100 HUB por 80€ (0,80€/moneda)
- Plus: 500 HUB por 300€ (0,60€/moneda) ⭐ RECOMENDADO
- Pro: 1000 HUB por 500€ (0,50€/moneda)

**ANUNCIOS DESTACADOS:**
- Anuncio TOP 30 días: 450 HUB
- Anuncio VIP 30 días: 300 HUB
- Destacado 7 días: 150 HUB
- Destacado 1 día: 25 HUB

**EXTRAS:**
- Foto de portada: 50 HUB
- Verificación: 100 HUB
- Subir posición: 20 HUB

**INFORMACIÓN IMPORTANTE:**
- Registro completamente GRATUITO
- Solo pagas por productos activados
- Sistema de monedas prepago
- Soporte 24/7 disponible`;
  }

  /**
   * Get intent analysis specific prompt
   */
  private getIntentAnalysisPrompt(): string {
    return `
Analiza el siguiente mensaje de WhatsApp y clasifica la intención del usuario.

INSTRUCCIONES ESPECÍFICAS:
- Responde ÚNICAMENTE con un objeto JSON válido
- No incluyas texto adicional antes o después del JSON
- Usa solo estas intenciones: saludo, despedida, precio, producto, registro, soporte_tecnico, queja, consulta_general, unknown
- El sentiment debe ser: positive, negative, o neutral
- La confidence debe ser un número entre 0.0 y 1.0

EJEMPLOS:
- "hola" → intent: "saludo", confidence: 0.95
- "cuánto cuesta" → intent: "precio", confidence: 0.90
- "no me interesa, gracias" → intent: "despedida", confidence: 0.85
- "quiero registrarme" → intent: "registro", confidence: 0.90

Formato de respuesta JSON:
{
  "intent": "categoria_aqui",
  "confidence": 0.90,
  "entities": {},
  "sentiment": "neutral"
}`;
  }

  /**
   * Get customer service specific prompt
   */
  private getCustomerServicePrompt(context?: MessageContext): string {
    let prompt = this.getBasePrompt();

    prompt += `

🎯 **ENFOQUE COMERCIAL MEJORADO:**
- Identifica oportunidades de venta
- Sugiere paquetes apropiados según necesidades
- Maneja objeciones con empatía
- Guía hacia registro/conversión

📞 **TÉCNICAS DE ATENCIÓN:**
- Escucha activa de necesidades
- Respuestas personalizadas
- Seguimiento de interés
- Cierre suave hacia acción`;

    if (context?.conversationHistory) {
      prompt += `\n\n📋 **HISTORIAL DE CONVERSACIÓN:**\n`;
      context.conversationHistory.slice(-3).forEach((msg, index) => {
        const role = msg.role === 'user' ? 'Cliente' : 'Asistente';
        prompt += `${role}: ${msg.content}\n`;
      });
    }

    return prompt;
  }

  /**
   * Get technical support specific prompt
   */
  private getTechnicalSupportPrompt(context?: MessageContext): string {
    return `
Eres el asistente técnico de EscortsHub.net. Tu especialidad es resolver problemas técnicos de manera rápida y efectiva.

🔧 **ENFOQUE TÉCNICO:**
- Identifica el problema específico
- Ofrece soluciones paso a paso
- Escalada a soporte humano si es complejo
- Seguimiento de resolución

⚡ **PROBLEMAS COMUNES:**
- Registro de cuenta
- Problemas de pago
- Activación de anuncios
- Acceso a cuenta
- Carga de fotos/contenido

📋 **PROTOCOLO DE SOPORTE:**
1. Identificar problema exacto
2. Recopilar información necesaria
3. Ofrecer solución directa
4. Escalar si es necesario
5. Confirmar resolución

💬 **TONO:** Profesional, empático, solucionador
**BREVEDAD:** Máximo 100 palabras por respuesta
**OBJETIVO:** Resolver o escalar eficientemente`;
  }

  /**
   * Get English version of the prompt
   */
  private getEnglishPrompt(context?: MessageContext): string {
    return `
You are a professional virtual assistant for ${this.promptConfig.platform}, Spain's leading escort platform. Your mission is to help users with product information in a BRIEF, NATURAL, and CONVERSATIONAL manner.

🎯 **FUNDAMENTAL RESPONSE RULES:**
- **MANDATORY BREVITY**: Maximum 60-80 words per response
- **NO LONG TABLES OR LISTS**: Essential information only
- **CONVERSATIONAL**: Like a natural WhatsApp message
- **ONE FINAL QUESTION**: To keep the conversation flowing

📱 **RESPONSE TYPES:**

**GREETINGS ("hello", "hi", etc.):**
MAXIMUM 2 LINES. Example:
"Hello! 👋 I'm your EscortsHub.net assistant. How can I help you today?"

**PRICE INQUIRIES:**
Mention only:
- Plus Package: 500 HUB for €300 (€0.60/coin) - BEST PRICE
- 1-2 relevant products with prices
- Ask what interests them most

**PRODUCT INQUIRIES:**
- 1-2 line product description
- Basic price with Plus Package
- Ask if they need more info

**REGISTRATION:**
"Registration is FREE at https://www.escortshub.net/es/sign-up. You only pay for activated products. Need help with any step?"

✅ **KEY INFORMATION:**
- EscortsHub.net - Leading platform
- HUB coin system
- Plus Package: best price (€0.60/coin)
- FREE registration
- 24/7 support`;
  }

  /**
   * Truncate prompt to maximum length
   */
  private truncatePrompt(prompt: string): string {
    const maxLength = this.promptConfig.maxPromptLength;

    if (prompt.length <= maxLength) {
      return prompt;
    }

    // Truncate and add ellipsis
    const truncated = prompt.substring(0, maxLength - 3) + '...';

    logger.warn('System prompt truncated', {
      originalLength: prompt.length,
      maxLength,
      truncatedLength: truncated.length,
    });

    return truncated;
  }

  /**
   * Get prompt for specific use case
   */
  public getPromptForUseCase(
    useCase: 'onboarding' | 'sales' | 'support' | 'retention',
    context?: MessageContext
  ): string {
    const basePrompt = this.getBasePrompt();

    switch (useCase) {
      case 'onboarding':
        return basePrompt + this.getOnboardingAddendum();

      case 'sales':
        return basePrompt + this.getSalesAddendum();

      case 'support':
        return this.getTechnicalSupportPrompt(context);

      case 'retention':
        return basePrompt + this.getRetentionAddendum();

      default:
        return basePrompt;
    }
  }

  /**
   * Get onboarding specific addendum
   */
  private getOnboardingAddendum(): string {
    return `

🚀 **ENFOQUE DE BIENVENIDA:**
- Explica beneficios principales claramente
- Guía paso a paso para registro
- Resuelve dudas iniciales
- Motiva hacia primera compra`;
  }

  /**
   * Get sales specific addendum
   */
  private getSalesAddendum(): string {
    return `

💰 **ENFOQUE COMERCIAL:**
- Identifica necesidades específicas
- Sugiere paquete más apropiado
- Crea urgencia sin presionar
- Facilita proceso de compra`;
  }

  /**
   * Get retention specific addendum
   */
  private getRetentionAddendum(): string {
    return `

🤝 **ENFOQUE DE FIDELIZACIÓN:**
- Valora al cliente existente
- Ofrece productos complementarios
- Resuelve problemas rápidamente
- Sugiere optimizaciones`;
  }

  /**
   * Update prompt configuration
   */
  public updateConfig(config: Partial<typeof this.promptConfig>): void {
    this.promptConfig = { ...this.promptConfig, ...config };
    logger.info('System prompt configuration updated');
  }

  /**
   * Get prompt statistics
   */
  public getPromptStats(): {
    maxLength: number;
    includeContext: boolean;
    includeProductInfo: boolean;
    language: string;
  } {
    return {
      maxLength: this.promptConfig.maxPromptLength,
      includeContext: this.promptConfig.includeContext,
      includeProductInfo: this.promptConfig.includeProductInfo,
      language: this.promptConfig.language,
    };
  }
}
