import { logger } from '../../../utils/logger';
import type { IContextEnricher } from '../interfaces/IAnalyzer';
import type { EnrichedContext, TimeContext } from '../interfaces/types';
import type { MessageContext } from '../../AIService';
import { ContextEnrichmentError } from '../errors/ThinkingServiceErrors';
import DatabaseService from '../../DatabaseService';

export class ContextEnricher implements IContextEnricher {
  private static instance: ContextEnricher;

  private constructor() {}

  public static getInstance(): ContextEnricher {
    if (!ContextEnricher.instance) {
      ContextEnricher.instance = new ContextEnricher();
    }
    return ContextEnricher.instance;
  }

  public async enrich(context: MessageContext, currentMessage: string): Promise<EnrichedContext> {
    try {
      const enriched: EnrichedContext = {
        ...context,
        messageText: currentMessage,
        previousIntents: [],
        messageHistory: [],
        userEngagementLevel: 'medium',
        timeOfDay: 'morning',
        dayOfWeek: 'weekday',
      };

      // Obtener historial de conversación si hay número de teléfono.
      // PR5a-bis: pass sessionId so the reader can derive tenantId and
      // scope the query — prevents cross-tenant context leak into the AI.
      if (context.phoneNumber) {
        await this.enrichWithConversationHistory(enriched, context.phoneNumber, context.sessionId);
        await this.enrichWithLeadProfile(enriched, context.phoneNumber);
      }

      // Añadir contexto temporal
      const timeContext = this.analyzeTimeContext();
      enriched.timeOfDay = timeContext.timeOfDay;
      enriched.dayOfWeek = timeContext.dayOfWeek;

      // Calcular nivel de engagement
      enriched.userEngagementLevel = this.calculateEngagementLevel(enriched);

      return enriched;
    } catch (error) {
      logger.error('Error enriching context:', error);

      throw new ContextEnrichmentError('Failed to enrich context', {
        phoneNumber: context.phoneNumber,
        sessionId: context.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  public calculateEngagementLevel(context: EnrichedContext): 'low' | 'medium' | 'high' {
    const messageCount = context.messageHistory?.length || 0;

    if (messageCount === 0) return 'low';
    if (messageCount < 5) return 'medium';
    return 'high';
  }

  public analyzeTimeContext(): TimeContext {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

    let timeOfDay: EnrichedContext['timeOfDay'];
    if (hour >= 6 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 18) timeOfDay = 'afternoon';
    else if (hour >= 18 && hour < 22) timeOfDay = 'evening';
    else timeOfDay = 'night';

    const dayType: EnrichedContext['dayOfWeek'] =
      dayOfWeek === 0 || dayOfWeek === 6 ? 'weekend' : 'weekday';

    return { timeOfDay, dayOfWeek: dayType };
  }

  private async enrichWithConversationHistory(
    enriched: EnrichedContext,
    phoneNumber: string,
    sessionId?: string
  ): Promise<void> {
    try {
      const history = await DatabaseService.getConversationHistory(
        phoneNumber,
        10, // Últimos 10 mensajes
        sessionId ? { sessionId } : undefined
      );

      enriched.messageHistory = history.map(h => ({
        message: h.messageText || h.responseText || '',
        intent: h.intent,
        timestamp: h.createdAt,
        isFromUser: h.isFromUser,
      }));

      logger.debug('Conversation history enriched:', {
        phoneNumber,
        messageCount: enriched.messageHistory.length,
      });
    } catch (error) {
      logger.warn('Failed to enrich with conversation history:', error);
      // Non-critical error, continue with empty history
      enriched.messageHistory = [];
    }
  }

  private async enrichWithLeadProfile(
    enriched: EnrichedContext,
    phoneNumber: string
  ): Promise<void> {
    try {
      const leads = await DatabaseService.getAllLeads();
      const normalizedPhone = phoneNumber.replace(/\D/g, '');

      enriched.leadProfile = leads.find(lead => lead.phone && lead.phone.includes(normalizedPhone));

      if (enriched.leadProfile) {
        logger.debug('Lead profile found and attached:', {
          phoneNumber,
          leadId: enriched.leadProfile.id,
          leadName: enriched.leadProfile.name,
        });
      }
    } catch (error) {
      logger.warn('Failed to enrich with lead profile:', error);
      // Non-critical error, continue without lead profile
      enriched.leadProfile = undefined;
    }
  }

  // Método público para crear contexto básico en caso de error completo
  public createBasicContext(context: MessageContext, currentMessage: string): EnrichedContext {
    const timeContext = this.analyzeTimeContext();

    return {
      ...context,
      messageText: currentMessage,
      previousIntents: [],
      messageHistory: [],
      userEngagementLevel: 'medium',
      timeOfDay: timeContext.timeOfDay,
      dayOfWeek: timeContext.dayOfWeek,
    };
  }

  // Método para obtener summary del contexto para logging
  public getContextSummary(context: EnrichedContext): Record<string, any> {
    return {
      hasPhone: !!context.phoneNumber,
      messageHistoryCount: context.messageHistory?.length || 0,
      hasLeadProfile: !!context.leadProfile,
      engagementLevel: context.userEngagementLevel,
      timeOfDay: context.timeOfDay,
      dayOfWeek: context.dayOfWeek,
      previousIntentsCount: context.previousIntents?.length || 0,
    };
  }
}
