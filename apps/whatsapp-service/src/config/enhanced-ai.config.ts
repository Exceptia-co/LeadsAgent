/**
 * Enhanced AI Configuration Service
 *
 * Centralized configuration management for the refactored AI service.
 * Maintains backward compatibility with existing ai.config.ts while adding
 * enhanced features for the new modular architecture.
 */

import { logger } from '../utils/logger';
import type { AIProviderType } from '../services/ai/interfaces/IAIProvider';
import type { IntentCategory } from '../services/ai/interfaces/IIntentAnalysis';

/**
 * Provider-specific configuration
 */
export interface ProviderConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
  headers?: Record<string, string>;
}

/**
 * Response configuration
 */
export interface ResponseConfig {
  maxWords: number;
  enableTemplates: boolean;
  templatePriority: 'low' | 'medium' | 'high';
  enableFallbacks: boolean;
  maxRetries: number;
}

/**
 * Intent analysis configuration
 */
export interface IntentConfig {
  confidenceThreshold: number;
  enableCache: boolean;
  cacheTimeout: number;
  fallbackIntent: IntentCategory;
}

/**
 * System prompt configuration
 */
export interface PromptConfig {
  platform: string;
  language: 'es' | 'en';
  includeContext: boolean;
  includeProductInfo: boolean;
  maxPromptLength: number;
}

/**
 * Enhanced AI configuration structure
 */
export interface EnhancedAIConfig {
  // Provider settings
  providers: Record<AIProviderType, ProviderConfig>;
  defaultProvider: AIProviderType;

  // Response settings
  response: ResponseConfig;

  // Intent analysis settings
  intent: IntentConfig;

  // System prompt settings
  prompt: PromptConfig;

  // Feature flags
  features: {
    enableProviderFallback: boolean;
    enableResponseOptimization: boolean;
    enableMetrics: boolean;
    enableDebugMode: boolean;
  };
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Enhanced AI Configuration Service
 */
class EnhancedAIConfigService {
  private config: EnhancedAIConfig;
  private initialized = false;

  constructor() {
    this.config = this.createDefaultConfig();
    this.initialize();
  }

  /**
   * Create default configuration with environment variable mapping
   */
  private createDefaultConfig(): EnhancedAIConfig {
    return {
      providers: {
        openrouter: {
          apiKey: process.env['OPENROUTER_API_KEY'] || '',
          baseURL: process.env['OPENROUTER_BASE_URL'] || 'https://openrouter.ai/api/v1',
          model: 'openai/gpt-oss-120b', // FIXED - must always be this model
          maxTokens: parseInt(process.env['AI_MAX_TOKENS'] || '2048'),
          temperature: parseFloat(process.env['AI_TEMPERATURE'] || '0.7'),
          timeout: parseInt(process.env['AI_TIMEOUT'] || '30000'),
          headers: {
            'HTTP-Referer': process.env['AI_HTTP_REFERER'] || 'http://localhost:3002',
            'X-Title': process.env['AI_X_TITLE'] || 'LeadsCRM WhatsApp Service',
          },
        },
        gemini: {
          apiKey: process.env['GEMINI_API_KEY'] || '',
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          model: process.env['GEMINI_MODEL'] || 'gemini-1.5-pro',
          maxTokens: parseInt(process.env['GEMINI_MAX_TOKENS'] || '2048'),
          temperature: parseFloat(process.env['GEMINI_TEMPERATURE'] || '0.7'),
          timeout: parseInt(process.env['GEMINI_TIMEOUT'] || '30000'),
        },
        openai: {
          apiKey: process.env['OPENAI_API_KEY'] || '',
          baseURL: process.env['OPENAI_BASE_URL'] || 'https://api.openai.com/v1',
          model: process.env['OPENAI_MODEL'] || 'gpt-3.5-turbo',
          maxTokens: parseInt(process.env['OPENAI_MAX_TOKENS'] || '2048'),
          temperature: parseFloat(process.env['OPENAI_TEMPERATURE'] || '0.7'),
          timeout: parseInt(process.env['OPENAI_TIMEOUT'] || '30000'),
        },
        claude: {
          apiKey: process.env['CLAUDE_API_KEY'] || '',
          baseURL: process.env['CLAUDE_BASE_URL'] || 'https://api.anthropic.com',
          model: process.env['CLAUDE_MODEL'] || 'claude-3-haiku-20240307',
          maxTokens: parseInt(process.env['CLAUDE_MAX_TOKENS'] || '2048'),
          temperature: parseFloat(process.env['CLAUDE_TEMPERATURE'] || '0.7'),
          timeout: parseInt(process.env['CLAUDE_TIMEOUT'] || '30000'),
        },
      },

      defaultProvider: (process.env['AI_PROVIDER'] as AIProviderType) || 'openrouter',

      response: {
        maxWords: parseInt(process.env['AI_MAX_WORDS'] || '80'),
        enableTemplates: process.env['AI_USE_TEMPLATES'] !== 'false',
        templatePriority: (process.env['AI_TEMPLATE_PRIORITY'] as any) || 'high',
        enableFallbacks: process.env['AI_ENABLE_FALLBACKS'] !== 'false',
        maxRetries: parseInt(process.env['AI_MAX_RETRIES'] || '2'),
      },

      intent: {
        confidenceThreshold: parseFloat(process.env['AI_CONFIDENCE_THRESHOLD'] || '0.7'),
        enableCache: process.env['AI_ENABLE_INTENT_CACHE'] !== 'false',
        cacheTimeout: parseInt(process.env['AI_INTENT_CACHE_TIMEOUT'] || '60'),
        fallbackIntent: 'consulta_general',
      },

      prompt: {
        platform: process.env['AI_PLATFORM'] || 'EscortsHub.net',
        language: (process.env['AI_LANGUAGE'] as 'es' | 'en') || 'es',
        includeContext: process.env['AI_INCLUDE_CONTEXT'] !== 'false',
        includeProductInfo: process.env['AI_INCLUDE_PRODUCT_INFO'] !== 'false',
        maxPromptLength: parseInt(process.env['AI_MAX_PROMPT_LENGTH'] || '4000'),
      },

      features: {
        enableProviderFallback: process.env['AI_ENABLE_PROVIDER_FALLBACK'] !== 'false',
        enableResponseOptimization: process.env['AI_ENABLE_RESPONSE_OPTIMIZATION'] !== 'false',
        enableMetrics: process.env['AI_ENABLE_METRICS'] !== 'false',
        enableDebugMode: process.env['AI_DEBUG_MODE'] === 'true',
      },
    };
  }

  /**
   * Initialize configuration service
   */
  private initialize(): void {
    if (this.initialized) return;

    // Validate configuration
    const validation = this.validateConfig();

    if (!validation.isValid) {
      logger.error('❌ AI Configuration validation failed:', validation.errors);
    }

    if (validation.warnings.length > 0) {
      logger.warn('⚠️  AI Configuration warnings:', validation.warnings);
    }

    // Log configuration summary
    this.logConfigurationSummary();

    this.initialized = true;
  }

  /**
   * Get complete configuration
   */
  public getConfig(): EnhancedAIConfig {
    return { ...this.config }; // Return copy to prevent mutations
  }

  /**
   * Get provider-specific configuration
   */
  public getProviderConfig(provider: AIProviderType): ProviderConfig {
    const config = this.config.providers[provider];
    if (!config) {
      throw new Error(`Provider '${provider}' not configured`);
    }
    return { ...config };
  }

  /**
   * Get response configuration
   */
  public getResponseConfig(): ResponseConfig {
    return { ...this.config.response };
  }

  /**
   * Get intent configuration
   */
  public getIntentConfig(): IntentConfig {
    return { ...this.config.intent };
  }

  /**
   * Get prompt configuration
   */
  public getPromptConfig(): PromptConfig {
    return { ...this.config.prompt };
  }

  /**
   * Get default provider
   */
  public getDefaultProvider(): AIProviderType {
    return this.config.defaultProvider;
  }

  /**
   * Update configuration at runtime
   */
  public updateConfig(updates: Partial<EnhancedAIConfig>): ConfigValidationResult {
    const newConfig = { ...this.config, ...updates };

    // Validate new configuration
    const validation = this.validateConfigObject(newConfig);

    if (validation.isValid) {
      this.config = newConfig;
      logger.info('✅ AI Configuration updated successfully');
    } else {
      logger.error('❌ Failed to update AI configuration:', validation.errors);
    }

    return validation;
  }

  /**
   * Validate current configuration
   */
  public validateConfig(): ConfigValidationResult {
    return this.validateConfigObject(this.config);
  }

  /**
   * Validate configuration object
   */
  private validateConfigObject(config: EnhancedAIConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate providers
    Object.entries(config.providers).forEach(([provider, providerConfig]) => {
      if (!providerConfig.apiKey && provider !== 'claude') {
        warnings.push(`${provider.toUpperCase()}_API_KEY is not configured`);
      }

      if (provider === 'openrouter' && providerConfig.model !== 'openai/gpt-oss-120b') {
        errors.push(
          `OpenRouter model must be 'openai/gpt-oss-120b', got '${providerConfig.model}'`
        );
      }

      if (providerConfig.maxTokens < 100 || providerConfig.maxTokens > 8000) {
        warnings.push(
          `${provider} maxTokens (${providerConfig.maxTokens}) outside recommended range (100-8000)`
        );
      }

      if (providerConfig.temperature < 0 || providerConfig.temperature > 2) {
        warnings.push(
          `${provider} temperature (${providerConfig.temperature}) outside valid range (0-2)`
        );
      }
    });

    // Validate response config
    if (config.response.maxWords < 10 || config.response.maxWords > 500) {
      warnings.push(
        `Response maxWords (${config.response.maxWords}) outside recommended range (10-500)`
      );
    }

    // Validate intent config
    if (config.intent.confidenceThreshold < 0 || config.intent.confidenceThreshold > 1) {
      errors.push(
        `Intent confidence threshold (${config.intent.confidenceThreshold}) must be between 0 and 1`
      );
    }

    // Validate default provider exists and is configured
    const defaultProvider = config.providers[config.defaultProvider];
    if (!defaultProvider) {
      errors.push(`Default provider '${config.defaultProvider}' is not configured`);
    } else if (!defaultProvider.apiKey) {
      warnings.push(`Default provider '${config.defaultProvider}' has no API key configured`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Log configuration summary
   */
  private logConfigurationSummary(): void {
    logger.info('🔧 Enhanced AI Configuration Summary:');
    logger.info(`  - Default Provider: ${this.config.defaultProvider}`);
    logger.info(`  - OpenRouter Model: ${this.config.providers.openrouter.model} (FIXED)`);
    logger.info(`  - Max Response Words: ${this.config.response.maxWords}`);
    logger.info(`  - Templates Enabled: ${this.config.response.enableTemplates}`);
    logger.info(`  - Fallbacks Enabled: ${this.config.response.enableFallbacks}`);
    logger.info(`  - Intent Threshold: ${this.config.intent.confidenceThreshold}`);
    logger.info(`  - Platform: ${this.config.prompt.platform}`);
    logger.info(`  - Language: ${this.config.prompt.language}`);

    // Log provider status
    Object.entries(this.config.providers).forEach(([provider, config]) => {
      const hasKey = !!config.apiKey;
      logger.info(`  - ${provider}: ${hasKey ? '✓ Configured' : '✗ No API Key'}`);
    });
  }

  /**
   * Get configuration for backward compatibility with original AIService
   */
  public getBackwardCompatibleConfig() {
    return {
      OPENROUTER_MODEL: this.config.providers.openrouter.model,
      OPENROUTER_BASE_URL: this.config.providers.openrouter.baseURL,
      OPENROUTER_API_KEY: this.config.providers.openrouter.apiKey,
      DEFAULT_PROVIDER: this.config.defaultProvider,
      MODEL_SETTINGS: {
        maxTokens: this.config.providers.openrouter.maxTokens,
        temperature: this.config.providers.openrouter.temperature,
        stream: false,
      },
      DEFAULT_HEADERS: this.config.providers.openrouter.headers,
    };
  }

  /**
   * Get model name (maintains compatibility with ai.config.ts)
   */
  public getModelName(): string {
    return this.config.providers.openrouter.model; // Always 'openai/gpt-oss-120b'
  }
}

// Export singleton instance
export const aiConfig = new EnhancedAIConfigService();

// Backward compatibility exports
export const getModelName = () => aiConfig.getModelName();
export const validateAIConfig = () => aiConfig.validateConfig();
