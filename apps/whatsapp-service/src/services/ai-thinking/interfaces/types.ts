import type { AIResponse, MessageContext } from '../../AIService';

export interface IntentAnalysis {
  intent: string;
  confidence: number;
  entities: Record<string, any>;
  sentiment: 'positive' | 'negative' | 'neutral';
  urgency: 'low' | 'medium' | 'high';
  category: string;
  subcategory?: string;
}

export interface ThinkingStep {
  step: number;
  type: 'analysis' | 'reasoning' | 'knowledge_retrieval' | 'decision' | 'validation';
  title: string;
  content: string;
  confidence: number;
  data?: any;
}

export interface ThoughtProcess {
  steps: ThinkingStep[];
  finalDecision: string;
  confidence: number;
  reasoning: string;
  shouldRespond: boolean;
  responseStrategy: ResponseStrategy;
  estimatedComplexity: 'simple' | 'medium' | 'complex';
  processingTimeMs: number;
}

export interface ResponseStrategy {
  type: 'direct' | 'contextual' | 'escalate' | 'defer' | 'clarify';
  tone: 'professional' | 'friendly' | 'technical' | 'sales' | 'supportive';
  length: 'brief' | 'medium' | 'detailed';
  shouldQuote: boolean;
  shouldUseEmojis: boolean;
  priority: 'low' | 'medium' | 'high';
  templateCategory?: string;
}

export interface EnrichedContext extends MessageContext {
  messageText?: string;
  leadProfile?: any;
  conversationSummary?: string;
  previousIntents: IntentAnalysis[];
  messageHistory: Array<{
    message: string;
    intent?: string;
    timestamp: Date;
    isFromUser: boolean;
  }>;
  currentConversationFlow?: string;
  userEngagementLevel: 'low' | 'medium' | 'high';
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: 'weekday' | 'weekend';
}

export interface AIThinkingResponse extends AIResponse {
  thinkingProcess: ThoughtProcess;
}

export interface ComplexityAnalysis {
  complexity: 'simple_greeting' | 'specific_query' | 'general_inquiry';
  confidence: number;
  reasoning: string;
}

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
}

export interface TimeContext {
  timeOfDay: EnrichedContext['timeOfDay'];
  dayOfWeek: EnrichedContext['dayOfWeek'];
}
