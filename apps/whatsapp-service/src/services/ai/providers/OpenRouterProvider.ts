/**
 * OpenRouter AI Provider
 * 
 * Implements the IAIProvider interface for OpenRouter API integration.
 * Maintains the fixed model requirement (openai/gpt-oss-120b).
 */

import OpenAI from 'openai';
import { logger } from '../../../utils/logger';
import { 
  IAIProvider, 
  ProviderConfig, 
  AIResponse, 
  MessageContext, 
  ProviderStatus 
} from '../interfaces/IAIProvider';

/**
 * OpenRouter provider implementation
 */
export class OpenRouterProvider implements IAIProvider {
  public readonly name = 'openrouter';
  
  private client: OpenAI | null = null;
  private config: ProviderConfig | null = null;
  private status: ProviderStatus = {
    ready: false,
    lastHealthCheck: new Date()
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

      // Enforce fixed model requirement
      if (config.model !== 'openai/gpt-oss-120b') {
        logger.warn(`⚠️  OpenRouter model should be 'openai/gpt-oss-120b', got '${config.model}'. Forcing correct model.`);
        config.model = 'openai/gpt-oss-120b';
      }

      // Initialize OpenAI client with OpenRouter configuration
      this.client = new OpenAI({
        baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
        apiKey: config.apiKey,
        defaultHeaders: {
          'HTTP-Referer': config.headers?.['HTTP-Referer'] || 'http://localhost:3002',
          'X-Title': config.headers?.['X-Title'] || 'LeadsCRM WhatsApp Service',
          ...config.headers
        }
      });

      this.config = config;
      
      // Test connection
      await this.healthCheck();
      
      this.status.ready = true;
      this.status.model = config.model;
      this.status.lastHealthCheck = new Date();
      
      logger.info(`✅ OpenRouter provider initialized successfully`);
      logger.info(`   - Model: ${config.model} (FIXED)`);
      logger.info(`   - Base URL: ${config.baseURL}`);
      logger.info(`   - Max Tokens: ${config.maxTokens}`);
      logger.info(`   - Temperature: ${config.temperature}`);
      
    } catch (error) {
      this.status.ready = false;
      this.status.lastError = error instanceof Error ? error.message : 'Unknown initialization error';
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
   * Generate response using OpenRouter
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

    try {
      // Build message array for conversation context
      const messages: any[] = [
        { role: 'system', content: systemPrompt }
      ];

      // Add conversation history if available
      if (context?.conversationHistory) {
        context.conversationHistory.forEach(msg => {
          messages.push({
            role: msg.role,
            content: msg.content
          });
        });
      }

      // Add current user message
      messages.push({
        role: 'user',
        content: message
      });

      logger.debug(`🤖 OpenRouter API Request:`, {
        model: this.config.model,
        messagesCount: messages.length,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature
      });

      // Make API call to OpenRouter
      const completion = await this.client.chat.completions.create({
        model: this.config.model, // Always 'openai/gpt-oss-120b'
        messages,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        stream: false
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('Empty response received from OpenRouter');
      }

      const processingTime = Date.now() - startTime;
      
      // Update status
      this.status.responseTime = processingTime;
      this.status.lastHealthCheck = new Date();

      logger.debug(`✅ OpenRouter response generated in ${processingTime}ms`);

      return {
        success: true,
        content: responseContent,
        provider: this.name,
        tokensUsed: completion.usage?.total_tokens,
        processingTime
      };

    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      
      // Update error status
      this.status.lastError = error.message;
      this.status.responseTime = processingTime;

      // Log detailed error information
      logger.error(`❌ OpenRouter API Error:`, {
        error: error.message,
        status: error.status,
        model: this.config?.model,
        code: error.code,
        processingTime: `${processingTime}ms`
      });

      // Handle specific error cases
      let errorMessage = error.message;
      if (error.status === 404 || error.message?.includes('model not found')) {
        errorMessage = `Model '${this.config.model}' not found in OpenRouter. Please check configuration.`;
      } else if (error.status === 401) {
        errorMessage = 'OpenRouter API key is invalid or expired';
        this.status.ready = false; // Mark as not ready on auth errors
      } else if (error.status === 429) {
        errorMessage = 'OpenRouter rate limit exceeded. Please try again later.';
      }

      return {
        success: false,
        error: errorMessage,
        provider: this.name,
        processingTime
      };
    }
  }

  /**
   * Get provider status
   */
  public getStatus(): ProviderStatus {
    return {
      ...this.status,
      model: this.config?.model
    };
  }

  /**
   * Test provider connectivity
   */
  public async healthCheck(): Promise<boolean> {
    if (!this.client || !this.config) {
      return false;
    }

    try {
      // Simple health check with minimal token usage
      const testCompletion = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: 'Respond with "OK"' },
          { role: 'user', content: 'Health check' }
        ],
        max_tokens: 10,
        temperature: 0
      });

      const isHealthy = !!testCompletion.choices[0]?.message?.content;
      
      this.status.lastHealthCheck = new Date();
      if (isHealthy) {
        this.status.ready = true;
        this.status.lastError = undefined;
      }
      
      return isHealthy;
      
    } catch (error) {
      this.status.lastError = error instanceof Error ? error.message : 'Health check failed';
      this.status.lastHealthCheck = new Date();
      logger.warn(`OpenRouter health check failed:`, error);
      return false;
    }
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