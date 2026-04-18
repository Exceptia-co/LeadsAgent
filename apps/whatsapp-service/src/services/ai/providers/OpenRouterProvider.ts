/**
 * OpenRouter AI Provider
 *
 * Implements the IAIProvider interface for OpenRouter API integration.
 * Model is configurable via OPENROUTER_MODEL env var (default: openai/gpt-oss-120b).
 */

import OpenAI from 'openai';
import { logger } from '../../../utils/logger';
import type {
  IAIProvider,
  ProviderConfig,
  AIResponse,
  MessageContext,
  ProviderStatus,
} from '../interfaces/IAIProvider';

/** Status codes that are safe to retry (transient errors) */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/** Default max retries if not configured */
const DEFAULT_MAX_RETRIES = 2;

/** Base delay in ms for exponential backoff */
const BASE_RETRY_DELAY_MS = 1000;

/**
 * OpenRouter provider implementation
 */
export class OpenRouterProvider implements IAIProvider {
  public readonly name = 'openrouter';

  private client: OpenAI | null = null;
  private config: ProviderConfig | null = null;
  private maxRetries: number = DEFAULT_MAX_RETRIES;
  private status: ProviderStatus = {
    ready: false,
    lastHealthCheck: new Date(),
  };

  /**
   * Initialize the OpenRouter provider
   */
  public async initialize(config: ProviderConfig): Promise<void> {
    try {
      // Validate required configuration
      if (!config.apiKey) {
        throw new Error('OPENROUTER_API_KEY is required');
      }

      // Check for placeholder API keys — skip initialization gracefully
      if (this.isPlaceholderApiKey(config.apiKey)) {
        logger.warn(
          `⚠️  OpenRouter API key appears to be a placeholder. Provider will not be available.`
        );
        this.status.ready = false;
        this.status.lastError = 'API key is a placeholder — set a real key to enable this provider';
        this.status.lastHealthCheck = new Date();
        return;
      }

      // Validate model is configured
      if (!config.model) {
        config.model = 'openai/gpt-oss-120b';
        logger.warn('⚠️  No OpenRouter model specified, using default: openai/gpt-oss-120b');
      }

      // Initialize OpenAI client with OpenRouter configuration
      this.client = new OpenAI({
        baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
        apiKey: config.apiKey,
        defaultHeaders: {
          'HTTP-Referer': config.headers?.['HTTP-Referer'] || 'http://localhost:3002',
          'X-Title': config.headers?.['X-Title'] || 'LeadsCRM WhatsApp Service',
          ...config.headers,
        },
      });

      this.config = config;
      this.maxRetries = parseInt(process.env['AI_MAX_RETRIES'] || String(DEFAULT_MAX_RETRIES));

      // Test connection
      await this.healthCheck();

      this.status.ready = true;
      this.status.model = config.model;
      this.status.lastHealthCheck = new Date();

      logger.info(`✅ OpenRouter provider initialized successfully`);
      logger.info(`   - Model: ${config.model}`);
      logger.info(`   - Base URL: ${config.baseURL}`);
      logger.info(`   - Max Tokens: ${config.maxTokens}`);
      logger.info(`   - Temperature: ${config.temperature}`);
    } catch (error) {
      this.status.ready = false;
      this.status.lastError =
        error instanceof Error ? error.message : 'Unknown initialization error';
      logger.error(`❌ Failed to initialize OpenRouter provider:`, error);
      throw error;
    }
  }

  /**
   * Check if provider is ready
   */
  public isReady(): boolean {
    return this.status.ready && !!this.client && !!this.config;
  }

  /**
   * Generate response using OpenRouter with retry on transient failures
   */
  public async generateResponse(
    message: string,
    systemPrompt: string,
    context?: MessageContext
  ): Promise<AIResponse> {
    const startTime = Date.now();

    if (!this.isReady() || !this.client || !this.config) {
      throw new Error('OpenRouter provider not initialized or not ready');
    }

    // Build message array once (reused across retries)
    const messages: any[] = [{ role: 'system', content: systemPrompt }];

    if (context?.conversationHistory) {
      context.conversationHistory.forEach(msg => {
        messages.push({ role: msg.role, content: msg.content });
      });
    }

    messages.push({ role: 'user', content: message });

    logger.debug(`🤖 OpenRouter API Request:`, {
      model: this.config.model,
      messagesCount: messages.length,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });

    let lastError: any = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Wait before retry (exponential backoff)
        if (attempt > 0) {
          const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          logger.warn(`🔄 OpenRouter retry ${attempt}/${this.maxRetries} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const completion = await this.client!.chat.completions.create({
          model: this.config.model,
          messages,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          stream: false,
        });

        const responseContent = completion.choices[0]?.message?.content;
        if (!responseContent) {
          throw new Error('Empty response received from OpenRouter');
        }

        const processingTime = Date.now() - startTime;

        this.status.responseTime = processingTime;
        this.status.lastHealthCheck = new Date();

        if (attempt > 0) {
          logger.info(
            `✅ OpenRouter response succeeded on retry ${attempt} in ${processingTime}ms`
          );
        } else {
          logger.debug(`✅ OpenRouter response generated in ${processingTime}ms`);
        }

        return {
          success: true,
          content: responseContent,
          provider: this.name,
          tokensUsed: completion.usage?.total_tokens,
          processingTime,
        };
      } catch (error: any) {
        lastError = error;

        // Only retry on transient errors
        if (!this.isRetryableError(error) || attempt >= this.maxRetries) {
          break;
        }
      }
    }

    // All attempts failed — return error response
    const processingTime = Date.now() - startTime;
    this.status.lastError = lastError.message;
    this.status.responseTime = processingTime;

    logger.error(`❌ OpenRouter API Error (after ${this.maxRetries + 1} attempts):`, {
      error: lastError.message,
      status: lastError.status,
      model: this.config?.model,
      code: lastError.code,
      processingTime: `${processingTime}ms`,
    });

    const errorMessage = this.formatErrorMessage(lastError);

    return {
      success: false,
      error: errorMessage,
      provider: this.name,
      processingTime,
    };
  }

  /**
   * Check if an error is transient and safe to retry
   */
  private isRetryableError(error: any): boolean {
    // Network/timeout errors are retryable
    if (
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNABORTED'
    ) {
      return true;
    }
    // HTTP status-based retryable errors (429, 5xx)
    return typeof error.status === 'number' && RETRYABLE_STATUS_CODES.has(error.status);
  }

  /**
   * Format error message based on error type
   */
  private formatErrorMessage(error: any): string {
    if (error.status === 404 || error.message?.includes('model not found')) {
      return `Model '${this.config?.model}' not found in OpenRouter. Please check configuration.`;
    }
    if (error.status === 401) {
      this.status.ready = false;
      return 'OpenRouter API key is invalid or expired';
    }
    if (error.status === 429) {
      return 'OpenRouter rate limit exceeded after retries. Please try again later.';
    }
    return error.message;
  }

  /**
   * Get provider status
   */
  public getStatus(): ProviderStatus {
    return {
      ...this.status,
      model: this.config?.model,
    };
  }

  /**
   * Test provider connectivity using models.list() (no token cost)
   */
  public async healthCheck(): Promise<boolean> {
    if (!this.client || !this.config) {
      return false;
    }

    try {
      // Use models.list() — validates API key without consuming tokens
      await this.client.models.list();

      this.status.lastHealthCheck = new Date();
      this.status.ready = true;
      this.status.lastError = undefined;

      return true;
    } catch (error) {
      this.status.lastError = error instanceof Error ? error.message : 'Health check failed';
      this.status.lastHealthCheck = new Date();
      logger.warn(`OpenRouter health check failed:`, error);
      return false;
    }
  }

  /**
   * Detect placeholder API keys that aren't real credentials
   */
  private isPlaceholderApiKey(apiKey: string): boolean {
    const lower = apiKey.toLowerCase();
    const placeholderPatterns = [
      'replace',
      'your_',
      'your-',
      'example',
      'placeholder',
      'xxx',
      'changeme',
      'insert',
      'put_your',
      'put-your',
      'sk-or-placeholder',
    ];
    return placeholderPatterns.some(pattern => lower.includes(pattern));
  }

  /**
   * Cleanup provider resources
   */
  public async cleanup(): Promise<void> {
    this.client = null;
    this.config = null;
    this.status.ready = false;
    logger.info('OpenRouter provider cleaned up');
  }
}
