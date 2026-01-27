import type { IntentAnalysis, ComplexityAnalysis, EnrichedContext, TimeContext } from './types';
import type { MessageContext } from '../../AIService';

export interface IIntentAnalyzer {
  analyze(message: string, context: EnrichedContext): Promise<IntentAnalysis>;
  analyzeEnhanced(message: string, context: EnrichedContext): Promise<IntentAnalysis>;
}

export interface IContextEnricher {
  enrich(context: MessageContext, currentMessage: string): Promise<EnrichedContext>;
  calculateEngagementLevel(context: EnrichedContext): 'low' | 'medium' | 'high';
  analyzeTimeContext(): TimeContext;
}

export interface IComplexityAnalyzer {
  analyze(message: string, intentAnalysis?: IntentAnalysis): ComplexityAnalysis;
  isGreetingMessage(message: string): Promise<boolean>;
  checkGreetingKeywords(message: string, keywords: string[]): boolean;
}

export interface IKnowledgeRetriever {
  retrieve(message: string, intentAnalysis: IntentAnalysis): Promise<any[]>;
  searchKnowledgeBase(query: string): Promise<any[]>;
  getKnowledgeByCategory(category: string): Promise<any[]>;
}
