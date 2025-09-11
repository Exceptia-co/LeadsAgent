import { IntentAnalysis, ResponseStrategy, EnrichedContext } from './types';
import { AIResponse } from '../../AIService';

export interface IResponseBuilder {
  build(
    message: string,
    context: EnrichedContext,
    intentAnalysis: IntentAnalysis,
    strategy: ResponseStrategy,
    knowledgeData: any[]
  ): Promise<AIResponse>;

  buildContextualPrompt(
    basePrompt: string,
    intentAnalysis: IntentAnalysis,
    strategy: ResponseStrategy,
    knowledgeData: any[],
    context: EnrichedContext
  ): Promise<string>;
}

export interface IResponseFormatter {
  format(response: string, strategy: ResponseStrategy, intentAnalysis: IntentAnalysis): string;

  intelligentTruncate(text: string, maxWords: number, intent: string): string;
  removeExcessivePromotions(text: string): string;
  removeTablesAndLists(text: string): string;
  ensureFinalQuestion(text: string, intent: string): string;
  validateFinalLength(text: string, maxWords: number): string;
}

export interface IQuickResponseEngine {
  tryQuick(message: string, context: any): Promise<AIResponse | null>;
  generateQuickContextualResponse(
    message: string,
    context: any,
    complexity: any
  ): Promise<string | null>;
  generateCacheKey(message: string, context: any): string;
}
