import { IntentAnalysis, ResponseStrategy, EnrichedContext, ThinkingStep } from './types';

export interface IResponseStrategyEngine {
  determine(
    intentAnalysis: IntentAnalysis,
    context: EnrichedContext,
    knowledgeData: any[]
  ): Promise<ResponseStrategy>;
}

export interface IDecisionEngine {
  decide(
    steps: ThinkingStep[],
    context: EnrichedContext
  ): Promise<{
    shouldRespond: boolean;
    decision: string;
    confidence: number;
    reasons: string[];
  }>;
}

export interface IThinkingProcessOrchestrator {
  process(message: string, context: any): Promise<any>;
  calculateOverallConfidence(steps: ThinkingStep[]): number;
  generateReasoningExplanation(steps: ThinkingStep[]): string;
  estimateComplexity(steps: ThinkingStep[]): 'simple' | 'medium' | 'complex';
}
