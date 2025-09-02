/**
 * Core AI Provider Interface
 * 
 * Defines the contract that all AI providers must implement.
 * This enables the Strategy pattern for interchangeable AI providers.
 */

/**
 * Configuration for AI providers
 */
export interface ProviderConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  headers?: Record<string, string>;
}

/**
 * Response from AI providers
 */
export interface AIResponse {
  success: boolean;
  content?: string;
  error?: string;
  provider: string;
  tokensUsed?: number;
  processingTime?: number;
}

/**
 * Enhanced AI Response with additional metadata
 */
export interface EnhancedAIResponse extends AIResponse {
  intentAnalysis?: {
    intent: string;
    confidence: number;
    entities: Record<string, any>;
    sentiment: 'positive' | 'negative' | 'neutral';
  };
  usedTemplate?: boolean;
  templateCategory?: string;
  fallbackUsed?: boolean;
  modelUsed?: string;
}

/**
 * Message context for AI processing
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
 * Provider status information
 */
export interface ProviderStatus {
  ready: boolean;
  model?: string;
  lastError?: string;
  lastHealthCheck?: Date;
  responseTime?: number;
}

/**
 * AI Provider Types
 */
export type AIProviderType = 'openrouter' | 'gemini' | 'openai' | 'claude';

/**
 * Core AI Provider Interface
 * 
 * All AI providers must implement this interface to ensure consistent behavior
 * and enable the Strategy pattern for provider switching.
 */
export interface IAIProvider {
  /**
   * Provider identifier
   */
  readonly name: string;

  /**
   * Initialize the provider with configuration
   * @param config - Provider-specific configuration
   */
  initialize(config: ProviderConfig): Promise<void>;

  /**
   * Check if provider is ready to process requests
   */
  isReady(): boolean;

  /**
   * Generate response using this provider
   * @param message - User message
   * @param systemPrompt - System prompt for context
   * @param context - Additional message context
   */
  generateResponse(
    message: string,
    systemPrompt: string,
    context?: MessageContext
  ): Promise<AIResponse>;

  /**
   * Get current provider status
   */
  getStatus(): ProviderStatus;

  /**
   * Cleanup provider resources
   */
  cleanup?(): Promise<void>;

  /**
   * Test provider connectivity
   */
  healthCheck?(): Promise<boolean>;
}

/**
 * Provider factory interface
 */
export interface IAIProviderFactory {
  /**
   * Create provider instance by type
   */
  createProvider(type: AIProviderType): Promise<IAIProvider>;

  /**
   * Get recommended provider based on availability
   */
  getRecommendedProvider(): Promise<IAIProvider>;

  /**
   * Get status of all providers
   */
  getAllProvidersStatus(): Promise<Record<AIProviderType, ProviderStatus>>;
}