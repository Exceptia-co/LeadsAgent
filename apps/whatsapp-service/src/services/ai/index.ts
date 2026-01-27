/**
 * AI Services Module Index
 *
 * Centralized exports for the refactored AI service architecture.
 * Provides access to all AI services and utilities.
 */

// Core Interfaces
export * from './interfaces/IAIProvider';
export type {
  IntentAnalysis,
  IntentCategory,
  MessageContext as IntentMessageContext,
} from './interfaces/IIntentAnalysis';
export * from './interfaces/ITemplateService';

// Core Services
export { AIProviderFactory, aiProviderFactory } from './AIProviderFactory';
export { TemplateService } from './TemplateService';
export { IntentAnalysisService } from './IntentAnalysisService';
export { SystemPromptService } from './SystemPromptService';
export { AIOrchestratorService } from './AIOrchestratorService';

// Provider Implementations
export { OpenRouterProvider } from './providers/OpenRouterProvider';
export { GeminiProvider } from './providers/GeminiProvider';

// Configuration
export {
  aiConfig,
  getModelName,
  validateAIConfig,
  type EnhancedAIConfig,
  type ResponseConfig,
  type IntentConfig,
  type PromptConfig,
  type ConfigValidationResult,
} from '../../config/enhanced-ai.config';

// Utility Types
export type { PromptType } from './SystemPromptService';
export type { OrchestratorConfig, ResponseOptions } from './AIOrchestratorService';
