import { logger } from '../../utils/logger';
import type { TrainingInteraction, FrequentPattern } from '../../types';
import { InteractionTracker } from './InteractionTracker';

/**
 * AI Learning - Pattern Analyzer Module
 *
 * Responsible for:
 * - Pattern discovery and frequency analysis
 * - Message similarity grouping and clustering
 * - Pattern caching and optimization
 * - NLP-based pattern extraction from user messages
 */
export class PatternAnalyzer {
  private static instance: PatternAnalyzer;

  // Cache para optimizar análisis de patrones
  private patternCache: Map<string, FrequentPattern> = new Map();
  private lastCacheUpdate: number = 0;
  private readonly CACHE_DURATION = 300000; // 5 minutos

  private constructor() {}

  public static getInstance(): PatternAnalyzer {
    if (!PatternAnalyzer.instance) {
      PatternAnalyzer.instance = new PatternAnalyzer();
    }
    return PatternAnalyzer.instance;
  }

  /**
   * Analiza patrones frecuentes y sugiere mejoras
   */
  public async analyzeFrequentPatterns(limit: number = 50): Promise<FrequentPattern[]> {
    try {
      logger.info('🔍 Analyzing frequent patterns for learning insights');

      // Check cache first
      if (this.shouldUseCache()) {
        const cachedPatterns = Array.from(this.patternCache.values());
        if (cachedPatterns.length > 0) {
          logger.debug('Using cached pattern analysis');
          return cachedPatterns.slice(0, limit);
        }
      }

      const interactionTracker = InteractionTracker.getInstance();
      const interactions = await interactionTracker.getTrainingInteractions(500); // Analizar últimas 500 interacciones

      if (interactions.length === 0) {
        logger.warn('No training interactions found for pattern analysis');
        return [];
      }

      // Agrupar mensajes similares
      const patternGroups = this.groupSimilarMessages(interactions);

      // Calcular métricas para cada patrón
      const patterns: FrequentPattern[] = [];

      for (const [pattern, interactionGroup] of patternGroups.entries()) {
        const frequency = interactionGroup.length;
        const avgSuccessScore =
          interactionGroup.reduce((sum, i) => sum + i.successScore, 0) / frequency;
        const lastSeen = new Date(Math.max(...interactionGroup.map(i => i.timestamp.getTime())));

        const frequentPattern: FrequentPattern = {
          pattern,
          frequency,
          averageSuccessScore: avgSuccessScore,
          lastSeen,
          suggestedKnowledgeEntry: undefined, // Will be set by KnowledgeGenerator
        };

        patterns.push(frequentPattern);
      }

      // Ordenar por frecuencia y score de éxito
      const sortedPatterns = patterns
        .sort((a, b) => b.frequency * b.averageSuccessScore - a.frequency * a.averageSuccessScore)
        .slice(0, limit);

      // Update cache
      this.updatePatternCache(sortedPatterns);

      logger.info(`📈 Found ${sortedPatterns.length} frequent patterns`);
      return sortedPatterns;
    } catch (error) {
      logger.error('Error analyzing frequent patterns:', error);
      return [];
    }
  }

  /**
   * Async pattern analysis for real-time learning
   */
  public async analyzePatternAsync(userMessage: string, successScore: number): Promise<void> {
    try {
      // Extraer patrones clave del mensaje
      const patterns = this.extractMessagePatterns(userMessage);

      for (const pattern of patterns) {
        const existingPattern = this.patternCache.get(pattern);

        if (existingPattern) {
          // Actualizar patrón existente
          existingPattern.frequency += 1;
          existingPattern.averageSuccessScore =
            (existingPattern.averageSuccessScore * (existingPattern.frequency - 1) + successScore) /
            existingPattern.frequency;
          existingPattern.lastSeen = new Date();
        } else {
          // Nuevo patrón
          this.patternCache.set(pattern, {
            pattern,
            frequency: 1,
            averageSuccessScore: successScore,
            lastSeen: new Date(),
          });
        }
      }

      logger.debug(`📝 Updated ${patterns.length} patterns in cache`);
    } catch (error) {
      logger.error('Error in async pattern analysis:', error);
    }
  }

  /**
   * Extract meaningful patterns from user messages using NLP techniques
   */
  public extractMessagePatterns(message: string): string[] {
    const patterns: string[] = [];
    const normalizedMessage = message.toLowerCase().trim();

    // Extraer patrones de palabras clave
    const keywords = normalizedMessage.split(/\s+/).filter(word => word.length > 3);

    // Patrones de 1 palabra (sustantivos importantes)
    const importantWords = keywords.filter(word =>
      [
        'precio',
        'servicio',
        'información',
        'horario',
        'ubicación',
        'contacto',
        'ayuda',
        'soporte',
      ].includes(word)
    );
    patterns.push(...importantWords);

    // Patrones de 2 palabras
    for (let i = 0; i < keywords.length - 1; i++) {
      const bigram = `${keywords[i]} ${keywords[i + 1]}`;
      patterns.push(bigram);
    }

    // Patrones de preguntas
    if (
      normalizedMessage.includes('?') ||
      normalizedMessage.includes('cuánto') ||
      normalizedMessage.includes('cómo')
    ) {
      patterns.push('pregunta_directa');
    }

    // Patrones de saludo
    if (['hola', 'buenos', 'buenas'].some(greeting => normalizedMessage.includes(greeting))) {
      patterns.push('saludo');
    }

    // Patrones de urgencia
    if (['urgente', 'ya', 'ahora', 'rápido'].some(urgent => normalizedMessage.includes(urgent))) {
      patterns.push('urgente');
    }

    return [...new Set(patterns)]; // Remove duplicates
  }

  /**
   * Group similar messages by their patterns
   */
  public groupSimilarMessages(
    interactions: TrainingInteraction[]
  ): Map<string, TrainingInteraction[]> {
    const groups = new Map<string, TrainingInteraction[]>();

    for (const interaction of interactions) {
      const patterns = this.extractMessagePatterns(interaction.userMessage);

      for (const pattern of patterns) {
        if (!groups.has(pattern)) {
          groups.set(pattern, []);
        }
        groups.get(pattern).push(interaction);
      }
    }

    return groups;
  }

  /**
   * Extract common intents from training interactions
   */
  public extractCommonIntents(interactions: TrainingInteraction[]): string[] {
    const intents = interactions
      .map(i => i.contextData.intent)
      .filter(intent => intent && intent !== 'unknown');

    const intentCounts = new Map<string, number>();
    intents.forEach(intent => {
      intentCounts.set(intent, (intentCounts.get(intent) || 0) + 1);
    });

    return Array.from(intentCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([intent]) => intent)
      .slice(0, 3);
  }

  /**
   * Extract common keywords from training interactions
   */
  public extractCommonKeywords(interactions: TrainingInteraction[]): string[] {
    const allMessages = interactions.map(i => i.userMessage).join(' ');
    const words = allMessages.toLowerCase().split(/\s+/);

    const wordCounts = new Map<string, number>();
    words.forEach(word => {
      if (word.length > 3 && !['para', 'esto', 'esta', 'desde', 'hasta', 'como'].includes(word)) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    });

    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  /**
   * Extract common phrases from successful responses
   */
  public extractCommonPhrases(responses: string[]): string[] {
    // Simplificado: extraer frases comunes de las respuestas exitosas
    const allText = responses.join(' ').toLowerCase();
    const sentences = allText.split(/[.!?]+/).filter(s => s.trim().length > 10);

    const sentenceCounts = new Map<string, number>();
    sentences.forEach(sentence => {
      const normalized = sentence.trim();
      sentenceCounts.set(normalized, (sentenceCounts.get(normalized) || 0) + 1);
    });

    return Array.from(sentenceCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([sentence]) => sentence);
  }

  /**
   * Categorize patterns based on content and intents
   */
  public categorizePattern(pattern: string, intents: string[]): string {
    // Categorizar basado en el patrón y las intenciones comunes
    if (pattern.includes('precio') || pattern.includes('costo') || pattern.includes('cuánto')) {
      return 'pricing';
    }

    if (pattern.includes('servicio') || pattern.includes('producto')) {
      return 'services';
    }

    if (pattern.includes('horario') || pattern.includes('tiempo')) {
      return 'schedule';
    }

    if (
      pattern.includes('ubicación') ||
      pattern.includes('dirección') ||
      pattern.includes('dónde')
    ) {
      return 'location';
    }

    if (pattern.includes('contacto') || pattern.includes('teléfono')) {
      return 'contact';
    }

    if (intents.includes('greeting') || intents.includes('saludo')) {
      return 'greetings';
    }

    if (intents.includes('complaint') || intents.includes('queja')) {
      return 'support';
    }

    return 'general';
  }

  /**
   * Get patterns from cache
   */
  public getCachedPatterns(): FrequentPattern[] {
    return Array.from(this.patternCache.values());
  }

  /**
   * Clear pattern cache
   */
  public clearCache(): void {
    this.patternCache.clear();
    this.lastCacheUpdate = 0;
    logger.debug('Pattern cache cleared');
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  private shouldUseCache(): boolean {
    return Date.now() - this.lastCacheUpdate < this.CACHE_DURATION;
  }

  private updatePatternCache(patterns: FrequentPattern[]): void {
    this.patternCache.clear();
    patterns.forEach(pattern => {
      this.patternCache.set(pattern.pattern, pattern);
    });
    this.lastCacheUpdate = Date.now();
  }
}

export default PatternAnalyzer.getInstance();
