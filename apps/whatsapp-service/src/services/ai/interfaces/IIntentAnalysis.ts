/**
 * Intent Analysis Interfaces
 * 
 * Defines types and interfaces for message intent detection and analysis.
 */

/**
 * Intent analysis result
 */
export interface IntentAnalysis {
  intent: string;
  confidence: number;
  entities: Record<string, any>;
  sentiment: 'positive' | 'negative' | 'neutral';
  category?: string;
  suggestedResponse?: string;
  keywords?: string[];
}

/**
 * Intent categories supported by the system
 */
export type IntentCategory = 
  | 'saludo' 
  | 'despedida'
  | 'precio'
  | 'producto'
  | 'registro'
  | 'soporte_tecnico'
  | 'queja'
  | 'consulta_general'
  | 'unknown';

/**
 * Intent analysis service interface
 */
export interface IIntentAnalysisService {
  /**
   * Analyze message intent
   * @param message - User message to analyze
   * @param context - Optional message context
   */
  analyzeIntent(message: string, context?: MessageContext): Promise<IntentAnalysis>;

  /**
   * Check if message is a simple greeting
   * @param message - Message to check
   */
  isSimpleGreeting(message: string): boolean;

  /**
   * Analyze conversation flow from multiple messages
   * @param messages - Array of conversation messages
   */
  analyzeConversation?(messages: Array<{ content: string; timestamp: Date }>): Promise<IntentAnalysis[]>;

  /**
   * Get intent confidence threshold
   */
  getConfidenceThreshold(): number;
}

/**
 * Message context for intent analysis
 */
export interface MessageContext {
  from: string;
  sessionId: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  phoneNumber?: string;
  userLanguage?: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
}

/**
 * Intent mapping configuration
 */
export interface IntentMapping {
  keywords: string[];
  patterns: string[];
  confidence: number;
  category: IntentCategory;
  responseTemplates?: string[];
}

/**
 * Intent analysis configuration
 */
export interface IntentAnalysisConfig {
  confidenceThreshold: number;
  enableCaching: boolean;
  cacheTimeout: number;
  mappings: Record<IntentCategory, IntentMapping>;
  fallbackIntent: IntentCategory;
}