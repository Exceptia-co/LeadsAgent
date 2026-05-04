import { logger } from '../../../utils/logger';
import type { IKnowledgeRetriever } from '../interfaces/IAnalyzer';
import type { IntentAnalysis } from '../interfaces/types';
import { KnowledgeRetrievalError } from '../errors/ThinkingServiceErrors';
import DatabaseService from '../../DatabaseService';

export class KnowledgeRetriever implements IKnowledgeRetriever {
  private static instance: KnowledgeRetriever;

  private constructor() {}

  public static getInstance(): KnowledgeRetriever {
    if (!KnowledgeRetriever.instance) {
      KnowledgeRetriever.instance = new KnowledgeRetriever();
    }
    return KnowledgeRetriever.instance;
  }

  public async retrieve(
    message: string,
    intentAnalysis: IntentAnalysis,
    opts?: { tenantId?: string; aiAgentId?: string },
  ): Promise<any[]> {
    try {
      let relevantKnowledge: any[] = [];
      const scopeOpts = opts?.tenantId || opts?.aiAgentId
        ? { tenantId: opts.tenantId, agentId: opts.aiAgentId }
        : undefined;

      const messageBasedKnowledge = await this.searchKnowledgeBase(message, scopeOpts);
      const intentBasedKnowledge = await this.getKnowledgeByCategory(intentAnalysis.category, scopeOpts);

      // 3. Combinar y filtrar conocimiento
      relevantKnowledge = [...messageBasedKnowledge, ...intentBasedKnowledge]
        .filter((item, index, self) => index === self.findIndex(t => t.id === item.id))
        .slice(0, 5); // Limitar a 5 elementos más relevantes

      // 4. Ordenar por relevancia si es posible
      relevantKnowledge = this.sortByRelevance(relevantKnowledge, message, intentAnalysis);

      logger.debug('Knowledge retrieval completed:', {
        message: message.substring(0, 50),
        intent: intentAnalysis.intent,
        category: intentAnalysis.category,
        foundItems: relevantKnowledge.length,
      });

      return relevantKnowledge;
    } catch (error) {
      logger.error('Error in knowledge retrieval:', error);

      throw new KnowledgeRetrievalError('Failed to retrieve knowledge', {
        message: message.substring(0, 100),
        intent: intentAnalysis.intent,
        category: intentAnalysis.category,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  public async searchKnowledgeBase(query: string, opts?: { tenantId?: string; agentId?: string }): Promise<any[]> {
    try {
      return await DatabaseService.searchKnowledgeBase(query, opts);
    } catch (error) {
      logger.warn('Failed to search knowledge base:', error);
      return [];
    }
  }

  public async getKnowledgeByCategory(category: string, opts?: { tenantId?: string; agentId?: string }): Promise<any[]> {
    try {
      return await DatabaseService.getKnowledgeBase(category, opts);
    } catch (error) {
      logger.warn('Failed to get knowledge by category:', error);
      return [];
    }
  }

  // Método para búsqueda avanzada con múltiples criterios
  public async advancedSearch(criteria: {
    message?: string;
    intent?: string;
    category?: string;
    subcategory?: string;
    urgency?: string;
    sentiment?: string;
    limit?: number;
  }): Promise<any[]> {
    try {
      let results: any[] = [];

      // Búsqueda por mensaje si se proporciona
      if (criteria.message) {
        const messageResults = await this.searchKnowledgeBase(criteria.message);
        results.push(...messageResults);
      }

      // Búsqueda por categoría si se proporciona
      if (criteria.category) {
        const categoryResults = await this.getKnowledgeByCategory(criteria.category);
        results.push(...categoryResults);
      }

      // Eliminar duplicados
      results = results.filter(
        (item, index, self) => index === self.findIndex(t => t.id === item.id)
      );

      // Filtrar por criterios adicionales
      results = this.filterByCriteria(results, criteria);

      // Limitar resultados
      const limit = criteria.limit || 10;
      return results.slice(0, limit);
    } catch (error) {
      logger.error('Error in advanced knowledge search:', error);
      return [];
    }
  }

  private sortByRelevance(
    knowledge: any[],
    message: string,
    intentAnalysis: IntentAnalysis
  ): any[] {
    try {
      const messageWords = message.toLowerCase().split(/\s+/);
      const intentKeywords = [
        intentAnalysis.intent,
        intentAnalysis.category,
        intentAnalysis.subcategory,
      ]
        .filter(Boolean)
        .map(s => s?.toLowerCase());

      return knowledge.sort((a, b) => {
        const scoreA = this.calculateRelevanceScore(a, messageWords, intentKeywords);
        const scoreB = this.calculateRelevanceScore(b, messageWords, intentKeywords);
        return scoreB - scoreA; // Orden descendente
      });
    } catch (error) {
      logger.warn('Error sorting by relevance, returning original order:', error);
      return knowledge;
    }
  }

  private calculateRelevanceScore(
    item: any,
    messageWords: string[],
    intentKeywords: string[]
  ): number {
    let score = 0;

    try {
      const itemText = (item.title + ' ' + item.content + ' ' + item.category).toLowerCase();

      // Puntos por palabras del mensaje
      messageWords.forEach(word => {
        if (itemText.includes(word)) {
          score += 2;
        }
      });

      // Puntos por keywords de intención
      intentKeywords.forEach(keyword => {
        if (keyword && itemText.includes(keyword)) {
          score += 3;
        }
      });

      // Puntos por categoría exacta
      if (item.category && intentKeywords.some(k => k === item.category.toLowerCase())) {
        score += 5;
      }

      // Puntos por match_quality si existe
      if (item.match_quality) {
        const quality =
          typeof item.match_quality === 'string'
            ? parseFloat(item.match_quality)
            : item.match_quality;

        if (!isNaN(quality)) {
          score += quality * 10;
        }
      }
    } catch (error) {
      logger.debug('Error calculating relevance score for item:', error);
    }

    return score;
  }

  private filterByCriteria(results: any[], criteria: any): any[] {
    return results.filter(item => {
      // Filtrar por subcategoría si se especifica
      if (criteria.subcategory && item.subcategory !== criteria.subcategory) {
        return false;
      }

      // Filtrar por urgencia si se especifica
      if (criteria.urgency && item.urgency && item.urgency !== criteria.urgency) {
        return false;
      }

      // Filtrar por sentimiento si se especifica
      if (criteria.sentiment && item.sentiment && item.sentiment !== criteria.sentiment) {
        return false;
      }

      return true;
    });
  }

  // Método para obtener estadísticas de la base de conocimiento
  public async getKnowledgeStats(): Promise<Record<string, any>> {
    try {
      // Esto dependería de la implementación de DatabaseService
      // Por ahora, retornar stats básicas
      return {
        available: true,
        lastUpdated: new Date().toISOString(),
        note: 'Stats depend on DatabaseService implementation',
      };
    } catch (error) {
      logger.error('Error getting knowledge stats:', error);
      return {
        available: false,
        error: 'Failed to retrieve stats',
      };
    }
  }

  // Método para validar la calidad del conocimiento recuperado
  public validateKnowledgeQuality(knowledge: any[], minQuality: number = 0.5): any[] {
    return knowledge.filter(item => {
      try {
        // Verificar que el item tenga los campos básicos
        if (!item.title && !item.content) {
          return false;
        }

        // Verificar calidad si está disponible
        if (item.match_quality) {
          const quality =
            typeof item.match_quality === 'string'
              ? parseFloat(item.match_quality)
              : item.match_quality;

          return !isNaN(quality) && quality >= minQuality;
        }

        // Si no hay información de calidad, aceptar por defecto
        return true;
      } catch (error) {
        logger.debug('Error validating knowledge quality:', error);
        return false;
      }
    });
  }
}
