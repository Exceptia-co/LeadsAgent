/**
 * Template Service
 * 
 * Manages predefined response templates for common intents.
 * Provides fast, consistent responses for simple queries without AI processing.
 */

import { logger } from '../../utils/logger';
import { aiConfig } from '../../config/enhanced-ai.config';
import { 
  ITemplateService, 
  TemplateConfig, 
  ResponseTemplate, 
  TemplateResult 
} from './interfaces/ITemplateService';
import { IntentCategory, MessageContext } from './interfaces/IIntentAnalysis';

/**
 * Template service implementation
 */
export class TemplateService implements ITemplateService {
  private templates: Map<IntentCategory, ResponseTemplate[]> = new Map();
  private config: TemplateConfig;

  constructor(config?: Partial<TemplateConfig>) {
    const responseConfig = aiConfig.getResponseConfig();
    
    this.config = {
      maxWords: config?.maxWords ?? responseConfig.maxWords,
      enableFallback: config?.enableFallback ?? responseConfig.enableFallbacks,
      priority: config?.priority ?? responseConfig.templatePriority,
      useRandomSelection: config?.useRandomSelection ?? true
    };

    this.initializeTemplates();
    logger.info('✅ Template Service initialized');
  }

  /**
   * Initialize predefined templates
   */
  private initializeTemplates(): void {
    // Greeting templates
    this.addTemplate({
      id: 'greeting-basic',
      category: 'saludo',
      priority: 1,
      templates: [
        '¡Hola! 👋 Soy tu asistente de EscortsHub.net. ¿En qué puedo ayudarte?',
        'Hola 😊 Bienvenido/a a EscortsHub.net. ¿Cómo te puedo ayudar?',
        '¡Hola! Soy el asistente virtual de EscortsHub.net. ¿Qué necesitas?'
      ]
    });

    // Pricing templates
    this.addTemplate({
      id: 'pricing-basic',
      category: 'precio',
      priority: 1,
      templates: [
        'El paquete Plus (500 HUB por 300€) es el más popular y rentable. ¿Te interesa?',
        'Paquete Basic (100 HUB/80€) o Plus (500 HUB/300€). ¿Cuál prefieres?',
        'Tenemos paquetes desde 80€. Plus (500 HUB/300€) es el mejor valor. ¿Te conviene?'
      ]
    });

    // Product inquiry templates
    this.addTemplate({
      id: 'products-basic',
      category: 'producto',
      priority: 1,
      templates: [
        'Ofrecemos publicidad premium y destacados para escorts. ¿Qué necesitas?',
        'Tenemos anuncios VIP, destacados y premium. ¿Te interesa alguno específico?',
        'Servicios de publicidad para escorts: VIP, destacados y más. ¿Cuál te conviene?'
      ]
    });

    // Registration templates
    this.addTemplate({
      id: 'registration-basic',
      category: 'registro',
      priority: 1,
      templates: [
        'Registro gratis en https://www.escortshub.net/es/sign-up. Solo pagas lo que uses. ¿Te ayudo?',
        'Gratis registrarse en https://www.escortshub.net/es/sign-up. ¿Necesitas ayuda con algo específico?',
        'Crear cuenta es gratis: https://www.escortshub.net/es/sign-up. ¿Tienes dudas sobre el proceso?'
      ]
    });

    // Technical support templates
    this.addTemplate({
      id: 'technical-basic',
      category: 'soporte_tecnico',
      priority: 1,
      templates: [
        'Para soporte técnico detallado, mejor contacta a nuestro equipo. ¿Es urgente?',
        'Problemas técnicos los resolvemos rápido. ¿Puedes describirme qué pasa?',
        'Te ayudo con lo técnico. ¿Qué error o problema tienes exactamente?'
      ]
    });

    // Goodbye templates
    this.addTemplate({
      id: 'goodbye-basic',
      category: 'despedida',
      priority: 1,
      templates: [
        'Gracias por contactar con EscortsHub.net. ¡Que tengas un buen día! 👋',
        'Perfecto, aquí estaré si necesitas algo más. ¡Hasta pronto! 😊',
        'De nada, un placer ayudarte. ¡Vuelve cuando quieras!'
      ]
    });

    // Fallback templates for unknown intents
    this.addTemplate({
      id: 'fallback-basic',
      category: 'consulta_general',
      priority: 1,
      templates: [
        'Disculpa, no entendí bien tu consulta. ¿Puedes ser más específico?',
        'No estoy seguro de entender. ¿Podrías reformular tu pregunta?',
        'Perdón, ¿puedes explicarme mejor qué necesitas? Te ayudo enseguida.'
      ]
    });

    logger.debug(`Templates initialized for ${this.templates.size} categories`);
  }

  /**
   * Get template for specific intent
   */
  public getTemplate(intent: IntentCategory, context?: MessageContext): string | null {
    try {
      const templates = this.templates.get(intent);
      if (!templates || templates.length === 0) {
        return null;
      }

      // Find best template based on conditions
      const suitableTemplates = templates.filter(template => 
        this.checkTemplateConditions(template, context)
      );

      if (suitableTemplates.length === 0) {
        return null;
      }

      // Select template (random or first)
      let selectedTemplate: ResponseTemplate;
      if (this.config.useRandomSelection) {
        const randomIndex = Math.floor(Math.random() * suitableTemplates.length);
        selectedTemplate = suitableTemplates[randomIndex];
      } else {
        selectedTemplate = suitableTemplates[0];
      }

      // Get random template string from selected template
      const templateString = this.config.useRandomSelection
        ? selectedTemplate.templates[Math.floor(Math.random() * selectedTemplate.templates.length)]
        : selectedTemplate.templates[0];

      // Process variables if any
      return this.processVariables(templateString, context);

    } catch (error) {
      logger.error('Error getting template:', error);
      return null;
    }
  }

  /**
   * Check if template should be used instead of AI generation
   */
  public shouldUseTemplate(
    intent: IntentCategory,
    confidence: number,
    messageLength: number
  ): boolean {
    try {
      const intentConfig = aiConfig.getIntentConfig();
      
      // Check if templates are enabled
      if (!this.config.enableFallback) {
        return false;
      }

      // Use template for high-confidence, simple intents
      const highConfidenceThreshold = intentConfig.confidenceThreshold + 0.1;
      
      // Simple greetings should always use templates
      if (intent === 'saludo' && messageLength <= 20) {
        return true;
      }

      // High confidence intents with templates available
      if (confidence >= highConfidenceThreshold && this.templates.has(intent)) {
        return true;
      }

      // Priority-based decision
      if (this.config.priority === 'high' && confidence >= intentConfig.confidenceThreshold) {
        return this.templates.has(intent);
      }

      return false;

    } catch (error) {
      logger.error('Error in shouldUseTemplate:', error);
      return false;
    }
  }

  /**
   * Apply template fallback for long AI responses
   */
  public applyFallback(
    originalResponse: string,
    intent: IntentCategory,
    maxWords?: number
  ): string {
    try {
      const wordLimit = maxWords ?? this.config.maxWords;
      const words = originalResponse.split(/\s+/);

      // If response is within limit, return as-is
      if (words.length <= wordLimit) {
        return originalResponse;
      }

      logger.info('Applying template fallback for long response:', {
        originalWords: words.length,
        maxWords: wordLimit,
        intent
      });

      // Try to get template for this intent
      const templateResponse = this.getTemplate(intent);
      if (templateResponse) {
        return templateResponse;
      }

      // Fallback to intelligent truncation
      return this.intelligentTruncate(originalResponse, wordLimit, intent);

    } catch (error) {
      logger.error('Error applying template fallback:', error);
      return this.intelligentTruncate(originalResponse, maxWords ?? this.config.maxWords, intent);
    }
  }

  /**
   * Add or update template
   */
  public addTemplate(template: ResponseTemplate): void {
    try {
      if (!this.templates.has(template.category)) {
        this.templates.set(template.category, []);
      }

      const categoryTemplates = this.templates.get(template.category)!;
      
      // Remove existing template with same ID
      const existingIndex = categoryTemplates.findIndex(t => t.id === template.id);
      if (existingIndex !== -1) {
        categoryTemplates.splice(existingIndex, 1);
      }

      // Add new template
      categoryTemplates.push(template);
      
      // Sort by priority (higher priority first)
      categoryTemplates.sort((a, b) => b.priority - a.priority);

      logger.debug(`Template added: ${template.id} for category ${template.category}`);

    } catch (error) {
      logger.error('Error adding template:', error);
    }
  }

  /**
   * Get all templates for a category
   */
  public getTemplatesForCategory(category: IntentCategory): ResponseTemplate[] {
    return this.templates.get(category) || [];
  }

  /**
   * Process template variables
   */
  public processVariables(template: string, context?: MessageContext): string {
    try {
      let processedTemplate = template;

      // Process common variables
      if (context) {
        // Replace {{phoneNumber}} if available
        if (context.phoneNumber) {
          processedTemplate = processedTemplate.replace(/\{\{phoneNumber\}\}/g, context.phoneNumber);
        }

        // Replace {{sessionId}} if available
        if (context.sessionId) {
          processedTemplate = processedTemplate.replace(/\{\{sessionId\}\}/g, context.sessionId);
        }

        // Replace time-based variables
        const now = new Date();
        const timeOfDay = this.getTimeOfDay(now);
        processedTemplate = processedTemplate.replace(/\{\{timeOfDay\}\}/g, timeOfDay);

        // Replace date variables
        processedTemplate = processedTemplate.replace(/\{\{date\}\}/g, now.toLocaleDateString('es-ES'));
        processedTemplate = processedTemplate.replace(/\{\{time\}\}/g, now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }));
      }

      return processedTemplate;

    } catch (error) {
      logger.error('Error processing template variables:', error);
      return template; // Return original template if processing fails
    }
  }

  /**
   * Check template conditions
   */
  private checkTemplateConditions(template: ResponseTemplate, context?: MessageContext): boolean {
    if (!template.conditions) {
      return true;
    }

    // Check time of day condition
    if (template.conditions.timeOfDay) {
      const currentTimeOfDay = this.getTimeOfDay(new Date());
      if (currentTimeOfDay !== template.conditions.timeOfDay) {
        return false;
      }
    }

    // Check language condition
    if (template.conditions.language && context?.userLanguage) {
      if (context.userLanguage !== template.conditions.language) {
        return false;
      }
    }

    // Add more condition checks as needed

    return true;
  }

  /**
   * Get time of day category
   */
  private getTimeOfDay(date: Date): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = date.getHours();
    
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 22) return 'evening';
    return 'night';
  }

  /**
   * Intelligent truncation of responses
   */
  private intelligentTruncate(text: string, maxWords: number, intent: IntentCategory): string {
    const words = text.split(/\s+/);
    
    if (words.length <= maxWords) {
      return text;
    }

    // Reserve space for closing question
    const questionWords = 5;
    const availableWords = maxWords - questionWords;
    
    let truncated = words.slice(0, availableWords).join(' ');
    
    // Add appropriate closing question based on intent
    const questions = {
      'saludo': ' ¿En qué puedo ayudarte?',
      'precio': ' ¿Te interesa algún paquete?',
      'producto': ' ¿Necesitas más información?',
      'registro': ' ¿Te ayudo con el registro?',
      'soporte_tecnico': ' ¿Es urgente el problema?',
      'consulta_general': ' ¿Puedo ayudarte en algo más?'
    };
    
    const question = questions[intent] || ' ¿Te ayudo en algo más?';
    
    // Clean punctuation before adding question
    truncated = truncated.replace(/[.,!]*$/, '');
    
    return truncated + question;
  }

  /**
   * Get template statistics
   */
  public getTemplateStats(): { 
    totalCategories: number; 
    totalTemplates: number; 
    categoriesWithTemplates: IntentCategory[] 
  } {
    const totalCategories = this.templates.size;
    let totalTemplates = 0;
    
    for (const templates of this.templates.values()) {
      totalTemplates += templates.length;
    }

    return {
      totalCategories,
      totalTemplates,
      categoriesWithTemplates: Array.from(this.templates.keys())
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<TemplateConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Template service configuration updated');
  }
}