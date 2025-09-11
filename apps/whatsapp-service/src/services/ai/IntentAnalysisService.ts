/**
 * Intent Analysis Service
 * 
 * Handles message intent detection and analysis using both rule-based
 * and AI-powered approaches for optimal accuracy and performance.
 */

import { logger } from '../../utils/logger';
import { aiConfig } from '../../config/enhanced-ai.config';
import { aiProviderFactory } from './AIProviderFactory';
import { 
  IIntentAnalysisService,
  IntentAnalysis, 
  IntentCategory, 
  IntentMapping,
  IntentAnalysisConfig,
  MessageContext 
} from './interfaces/IIntentAnalysis';

/**
 * Intent analysis service implementation
 */
export class IntentAnalysisService implements IIntentAnalysisService {
  private config: IntentAnalysisConfig;
  private intentMappings: Map<IntentCategory, IntentMapping> = new Map();
  private cache: Map<string, { analysis: IntentAnalysis; timestamp: number }> = new Map();

  constructor(config?: Partial<IntentAnalysisConfig>) {
    const intentConfig = aiConfig.getIntentConfig();
    
    this.config = {
      confidenceThreshold: config?.confidenceThreshold ?? intentConfig.confidenceThreshold,
      enableCaching: config?.enableCaching ?? intentConfig.enableCache,
      cacheTimeout: config?.cacheTimeout ?? intentConfig.cacheTimeout,
      fallbackIntent: config?.fallbackIntent ?? intentConfig.fallbackIntent,
      mappings: config?.mappings ?? this.createDefaultMappings()
    };

    this.initializeMappings();
    logger.info('✅ Intent Analysis Service initialized');
  }

  /**
   * Create default intent mappings
   */
  private createDefaultMappings(): Record<IntentCategory, IntentMapping> {
    return {
      saludo: {
        keywords: ['hola', 'hi', 'buenas', 'buenos días', 'buenas tardes', 'buenas noches', 'hey', 'hello', 'saludos'],
        patterns: ['^(hola|hi|buenas|hey)', 'buenos (días|tardes)', 'buenas (tardes|noches)'],
        confidence: 0.9,
        category: 'saludo',
        responseTemplates: ['greeting-basic']
      },
      despedida: {
        keywords: ['adiós', 'bye', 'hasta luego', 'hasta pronto', 'nos vemos', 'chao', 'gracias', 'vale'],
        patterns: ['(adiós|bye|hasta)', 'gracias.*no.*interesa', 'no.*necesito.*más'],
        confidence: 0.8,
        category: 'despedida',
        responseTemplates: ['goodbye-basic']
      },
      precio: {
        keywords: ['precio', 'cuánto', 'cuesta', 'coste', 'dinero', 'euros', 'pago', 'tarifa', 'hub'],
        patterns: ['cuánto.*cuesta', '(precio|coste).*de', 'cuánto.*vale', 'cuánto.*dinero'],
        confidence: 0.85,
        category: 'precio',
        responseTemplates: ['pricing-basic']
      },
      producto: {
        keywords: ['producto', 'servicio', 'anuncio', 'publicidad', 'vip', 'destacado', 'premium', 'top'],
        patterns: ['qué.*servicios', 'qué.*productos', '(anuncio|publicidad).*tipo'],
        confidence: 0.8,
        category: 'producto',
        responseTemplates: ['products-basic']
      },
      registro: {
        keywords: ['registro', 'registrar', 'cuenta', 'sign up', 'crear cuenta', 'alta', 'unir'],
        patterns: ['(crear|hacer).*cuenta', 'quiero.*registr', 'cómo.*registro'],
        confidence: 0.85,
        category: 'registro',
        responseTemplates: ['registration-basic']
      },
      soporte_tecnico: {
        keywords: ['problema', 'error', 'ayuda', 'soporte', 'técnico', 'fallo', 'no funciona'],
        patterns: ['tengo.*problema', 'no.*funciona', 'error.*con', 'ayuda.*técnica'],
        confidence: 0.8,
        category: 'soporte_tecnico',
        responseTemplates: ['technical-basic']
      },
      queja: {
        keywords: ['queja', 'malo', 'horrible', 'terrible', 'descontento', 'enfadado', 'molesto'],
        patterns: ['estoy.*enfadado', 'muy.*malo', 'horrible.*servicio'],
        confidence: 0.7,
        category: 'queja'
      },
      consulta_general: {
        keywords: ['información', 'info', 'detalles', 'explicar', 'entender', 'saber'],
        patterns: ['quiero.*saber', 'necesito.*información', 'puedes.*explicar'],
        confidence: 0.6,
        category: 'consulta_general',
        responseTemplates: ['fallback-basic']
      },
      unknown: {
        keywords: [],
        patterns: [],
        confidence: 0.3,
        category: 'unknown'
      }
    };
  }

  /**
   * Initialize intent mappings from configuration
   */
  private initializeMappings(): void {
    Object.entries(this.config.mappings).forEach(([category, mapping]) => {
      this.intentMappings.set(category as IntentCategory, mapping);
    });

    logger.debug(`Intent mappings initialized for ${this.intentMappings.size} categories`);
  }

  /**
   * Analyze message intent using hybrid approach
   */
  public async analyzeIntent(message: string, context?: MessageContext): Promise<IntentAnalysis> {
    try {
      const cacheKey = this.createCacheKey(message, context);
      
      // Check cache first
      if (this.config.enableCaching) {
        const cached = this.getCachedAnalysis(cacheKey);
        if (cached) {
          logger.debug('Intent analysis cache hit');
          return cached;
        }
      }

      // 1. Quick rule-based analysis first
      const ruleBasedAnalysis = this.analyzeWithRules(message);
      
      // 2. For high-confidence rule-based results, return immediately
      if (ruleBasedAnalysis.confidence >= 0.8) {
        logger.debug('Using rule-based intent analysis', {
          intent: ruleBasedAnalysis.intent,
          confidence: ruleBasedAnalysis.confidence
        });
        
        this.cacheAnalysis(cacheKey, ruleBasedAnalysis);
        return ruleBasedAnalysis;
      }

      // 3. For lower confidence, use AI analysis
      const aiAnalysis = await this.analyzeWithAI(message, context);
      
      // 4. Combine results (prefer AI if available, fallback to rules)
      const finalAnalysis = aiAnalysis.success ? aiAnalysis : ruleBasedAnalysis;
      
      this.cacheAnalysis(cacheKey, finalAnalysis);
      return finalAnalysis;

    } catch (error) {
      logger.error('Error in intent analysis:', error);
      
      // Return safe fallback
      return {
        intent: this.config.fallbackIntent,
        confidence: 0.3,
        entities: {},
        sentiment: 'neutral'
      };
    }
  }

  /**
   * Rule-based intent analysis
   */
  private analyzeWithRules(message: string): IntentAnalysis {
    const normalizedMessage = message.toLowerCase().trim();
    let bestMatch: { category: IntentCategory; confidence: number } | null = null;

    // Check each intent mapping
    for (const [category, mapping] of this.intentMappings.entries()) {
      let confidence = 0;

      // Check keywords
      const keywordMatches = mapping.keywords.filter(keyword => 
        normalizedMessage.includes(keyword.toLowerCase())
      ).length;

      if (keywordMatches > 0) {
        confidence += (keywordMatches / mapping.keywords.length) * 0.6;
      }

      // Check patterns
      const patternMatches = mapping.patterns.filter(pattern => {
        try {
          const regex = new RegExp(pattern, 'i');
          return regex.test(normalizedMessage);
        } catch {
          return false;
        }
      }).length;

      if (patternMatches > 0) {
        confidence += (patternMatches / mapping.patterns.length) * 0.4;
      }

      // Apply category base confidence
      confidence = Math.min(confidence, mapping.confidence);

      // Update best match
      if (confidence > (bestMatch?.confidence ?? 0)) {
        bestMatch = { category, confidence };
      }
    }

    // Determine sentiment based on keywords
    const sentiment = this.analyzeSentiment(normalizedMessage);

    return {
      intent: bestMatch?.category ?? this.config.fallbackIntent,
      confidence: bestMatch?.confidence ?? 0.3,
      entities: this.extractEntities(message),
      sentiment,
      keywords: this.extractKeywords(message)
    };
  }

  /**
   * AI-powered intent analysis
   */
  private async analyzeWithAI(message: string, context?: MessageContext): Promise<IntentAnalysis & { success: boolean }> {
    try {
      const provider = await aiProviderFactory.getRecommendedProvider();
      
      if (!provider || !provider.isReady()) {
        return { success: false } as any;
      }

      const prompt = this.createIntentAnalysisPrompt(message);
      
      const response = await provider.generateResponse(message, prompt, context);
      
      if (!response.success || !response.content) {
        return { success: false } as any;
      }

      // Parse AI response
      const analysis = this.parseAIResponse(response.content);
      
      return {
        success: true,
        ...analysis
      };

    } catch (error) {
      logger.warn('AI intent analysis failed:', error);
      return { success: false } as any;
    }
  }

  /**
   * Create prompt for AI intent analysis
   */
  private createIntentAnalysisPrompt(message: string): string {
    const availableIntents = Array.from(this.intentMappings.keys()).join(', ');
    
    return `
Analiza el siguiente mensaje de WhatsApp y clasifica la intención del usuario.

Mensaje: "${message}"

INSTRUCCIONES:
- Responde ÚNICAMENTE con un objeto JSON válido
- No incluyas texto adicional antes o después del JSON
- Usa solo estas intenciones: ${availableIntents}
- El sentiment debe ser: positive, negative, o neutral
- La confidence debe ser un número entre 0.0 y 1.0

Formato de respuesta JSON:
{
  "intent": "categoria_aqui",
  "confidence": 0.90,
  "entities": {},
  "sentiment": "neutral"
}`;
  }

  /**
   * Parse AI response to intent analysis
   */
  private parseAIResponse(content: string): IntentAnalysis {
    try {
      // Extract JSON from response
      let jsonContent = content.trim();
      
      const firstBrace = jsonContent.indexOf('{');
      const lastBrace = jsonContent.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonContent = jsonContent.substring(firstBrace, lastBrace + 1);
      }
      
      const parsed = JSON.parse(jsonContent);
      
      // Validate and sanitize
      return {
        intent: this.validateIntent(parsed.intent),
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        entities: parsed.entities || {},
        sentiment: this.validateSentiment(parsed.sentiment),
        keywords: parsed.keywords || []
      };

    } catch (error) {
      logger.warn('Failed to parse AI intent response:', error);
      return {
        intent: this.config.fallbackIntent,
        confidence: 0.5,
        entities: {},
        sentiment: 'neutral'
      };
    }
  }

  /**
   * Check if message is a simple greeting
   */
  public isSimpleGreeting(message: string): boolean {
    const greetingKeywords = ['hola', 'hi', 'buenas', 'buenos días', 'buenas tardes', 'buenas noches', 'hey', 'hello'];
    const normalizedMessage = message.toLowerCase().trim();
    
    // Exact greeting match
    if (greetingKeywords.some(keyword => normalizedMessage === keyword)) {
      return true;
    }
    
    // Short message that starts with greeting
    if (normalizedMessage.length <= 20) {
      return greetingKeywords.some(keyword => normalizedMessage.startsWith(keyword));
    }
    
    return false;
  }

  /**
   * Get confidence threshold
   */
  public getConfidenceThreshold(): number {
    return this.config.confidenceThreshold;
  }

  /**
   * Analyze conversation flow (optional implementation)
   */
  public async analyzeConversation?(messages: Array<{ content: string; timestamp: Date }>): Promise<IntentAnalysis[]> {
    const analyses: IntentAnalysis[] = [];
    
    for (const message of messages) {
      const analysis = await this.analyzeIntent(message.content);
      analyses.push(analysis);
    }
    
    return analyses;
  }

  // Helper methods

  private analyzeSentiment(message: string): 'positive' | 'negative' | 'neutral' {
    const positiveWords = ['gracias', 'bien', 'bueno', 'genial', 'perfecto', 'excelente'];
    const negativeWords = ['mal', 'malo', 'terrible', 'horrible', 'enfadado', 'problema'];
    
    const positiveScore = positiveWords.filter(word => message.includes(word)).length;
    const negativeScore = negativeWords.filter(word => message.includes(word)).length;
    
    if (positiveScore > negativeScore) return 'positive';
    if (negativeScore > positiveScore) return 'negative';
    return 'neutral';
  }

  private extractEntities(message: string): Record<string, any> {
    const entities: Record<string, any> = {};
    
    // Extract numbers (potential prices, quantities)
    const numbers = message.match(/\d+/g);
    if (numbers) {
      entities.numbers = numbers.map(n => parseInt(n));
    }
    
    // Extract emails
    const emails = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    if (emails) {
      entities.emails = emails;
    }
    
    return entities;
  }

  private extractKeywords(message: string): string[] {
    // Simple keyword extraction - split by space and filter common words
    const commonWords = ['el', 'la', 'de', 'que', 'y', 'en', 'un', 'es', 'se', 'no', 'te', 'lo', 'le', 'da', 'su', 'por', 'son', 'con', 'para', 'al', 'me', 'del', 'los', 'las'];
    
    return message
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !commonWords.includes(word))
      .slice(0, 5); // Limit to 5 keywords
  }

  private validateIntent(intent: string): IntentCategory {
    const validIntents = Array.from(this.intentMappings.keys());
    return validIntents.includes(intent as IntentCategory) 
      ? intent as IntentCategory 
      : this.config.fallbackIntent;
  }

  private validateSentiment(sentiment: string): 'positive' | 'negative' | 'neutral' {
    return ['positive', 'negative', 'neutral'].includes(sentiment) 
      ? sentiment as any
      : 'neutral';
  }

  private createCacheKey(message: string, context?: MessageContext): string {
    const contextKey = context?.sessionId || 'no-session';
    return `${message.toLowerCase().trim()}_${contextKey}`;
  }

  private getCachedAnalysis(cacheKey: string): IntentAnalysis | null {
    const cached = this.cache.get(cacheKey);
    if (!cached) return null;
    
    const now = Date.now();
    const isExpired = (now - cached.timestamp) > (this.config.cacheTimeout * 60 * 1000);
    
    if (isExpired) {
      this.cache.delete(cacheKey);
      return null;
    }
    
    return cached.analysis;
  }

  private cacheAnalysis(cacheKey: string, analysis: IntentAnalysis): void {
    if (!this.config.enableCaching) return;
    
    this.cache.set(cacheKey, {
      analysis,
      timestamp: Date.now()
    });
    
    // Cleanup old cache entries periodically
    if (this.cache.size > 1000) {
      this.cleanupCache();
    }
  }

  private cleanupCache(): void {
    const now = Date.now();
    const timeout = this.config.cacheTimeout * 60 * 1000;
    
    for (const [key, value] of this.cache.entries()) {
      if ((now - value.timestamp) > timeout) {
        this.cache.delete(key);
      }
    }
    
    logger.debug(`Intent cache cleanup: ${this.cache.size} entries remaining`);
  }

  /**
   * Get service statistics
   */
  public getStats(): {
    cacheSize: number;
    totalIntentCategories: number;
    confidenceThreshold: number;
  } {
    return {
      cacheSize: this.cache.size,
      totalIntentCategories: this.intentMappings.size,
      confidenceThreshold: this.config.confidenceThreshold
    };
  }
}