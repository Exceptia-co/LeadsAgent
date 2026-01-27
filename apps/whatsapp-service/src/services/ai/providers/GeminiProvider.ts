/**
 * Google Gemini AI Provider
 *
 * Implements the IAIProvider interface for Google Gemini API integration.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../../../utils/logger';
import type {
  IAIProvider,
  ProviderConfig,
  AIResponse,
  MessageContext,
  ProviderStatus,
} from '../interfaces/IAIProvider';

/**
 * Google Gemini provider implementation
 */
export class GeminiProvider implements IAIProvider {
  public readonly name = 'gemini';

  private client: GoogleGenerativeAI | null = null;
  private config: ProviderConfig | null = null;
  private status: ProviderStatus = {
    ready: false,
    lastHealthCheck: new Date(),
  };

  /**
   * Initialize the Gemini provider
   */
  public async initialize(config: ProviderConfig): Promise<void> {
    try {
      // Validate required configuration
      if (!config.apiKey) {
        throw new Error('GEMINI_API_KEY is required');
      }

      // Initialize Google Generative AI client
      this.client = new GoogleGenerativeAI(config.apiKey);
      this.config = config;

      // Test connection
      await this.healthCheck();

      this.status.ready = true;
      this.status.model = config.model;
      this.status.lastHealthCheck = new Date();

      logger.info(`✅ Gemini provider initialized successfully`);
      logger.info(`   - Model: ${config.model}`);
      logger.info(`   - Max Tokens: ${config.maxTokens}`);
      logger.info(`   - Temperature: ${config.temperature}`);
    } catch (error) {
      this.status.ready = false;
      this.status.lastError =
        error instanceof Error ? error.message : 'Unknown initialization error';
      logger.error(`❌ Failed to initialize Gemini provider:`, error);
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
   * Generate response using Gemini
   */
  public async generateResponse(
    message: string,
    systemPrompt: string,
    context?: MessageContext
  ): Promise<AIResponse> {
    const startTime = Date.now();

    if (!this.isReady() || !this.client || !this.config) {
      throw new Error('Gemini provider not initialized or not ready');
    }

    try {
      // Get the generative model
      const model = this.client.getGenerativeModel({
        model: this.config.model,
        generationConfig: {
          maxOutputTokens: this.config.maxTokens,
          temperature: this.config.temperature,
        },
      });

      // Build full prompt including system context and conversation history
      let fullPrompt = systemPrompt;

      // Add conversation history if available
      if (context?.conversationHistory && context.conversationHistory.length > 0) {
        fullPrompt += '\n\nHistorial de conversación:\n';
        context.conversationHistory.forEach(msg => {
          const roleLabel = msg.role === 'user' ? 'Usuario' : 'Asistente';
          fullPrompt += `${roleLabel}: ${msg.content}\n`;
        });
      }

      // Add current user message
      fullPrompt += `\n\nMensaje actual del usuario: ${message}`;

      // Add context information if available
      if (context?.phoneNumber) {
        fullPrompt += `\nNúmero de teléfono: ${context.phoneNumber}`;
      }

      logger.debug(`🤖 Gemini API Request:`, {
        model: this.config.model,
        promptLength: fullPrompt.length,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });

      // Generate content
      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const responseContent = response.text();

      if (!responseContent || responseContent.trim().length === 0) {
        throw new Error('Empty response received from Gemini');
      }

      const processingTime = Date.now() - startTime;

      // Update status
      this.status.responseTime = processingTime;
      this.status.lastHealthCheck = new Date();

      logger.debug(`✅ Gemini response generated in ${processingTime}ms`);

      return {
        success: true,
        content: responseContent.trim(),
        provider: this.name,
        processingTime,
      };
    } catch (error: any) {
      const processingTime = Date.now() - startTime;

      // Update error status
      this.status.lastError = error.message;
      this.status.responseTime = processingTime;

      // Log detailed error information
      logger.error(`❌ Gemini API Error:`, {
        error: error.message,
        model: this.config?.model,
        processingTime: `${processingTime}ms`,
        errorCode: error.code,
        status: error.status,
      });

      // Handle specific error cases
      let errorMessage = error.message;
      if (error.status === 401 || error.code === 401) {
        errorMessage = 'Gemini API key is invalid or expired';
        this.status.ready = false; // Mark as not ready on auth errors
      } else if (error.status === 429 || error.code === 429) {
        errorMessage = 'Gemini rate limit exceeded. Please try again later.';
      } else if (error.message?.includes('SAFETY')) {
        errorMessage = 'Content was blocked by Gemini safety filters';
      } else if (error.message?.includes('RECITATION')) {
        errorMessage = 'Content was blocked due to recitation concerns';
      }

      return {
        success: false,
        error: errorMessage,
        provider: this.name,
        processingTime,
      };
    }
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
   * Test provider connectivity
   */
  public async healthCheck(): Promise<boolean> {
    if (!this.client || !this.config) {
      return false;
    }

    try {
      // Simple health check with minimal token usage
      const model = this.client.getGenerativeModel({
        model: this.config.model,
        generationConfig: {
          maxOutputTokens: 10,
          temperature: 0,
        },
      });

      const result = await model.generateContent('Respond with "OK"');
      const response = await result.response;
      const text = response.text();

      const isHealthy = !!text && text.trim().length > 0;

      this.status.lastHealthCheck = new Date();
      if (isHealthy) {
        this.status.ready = true;
        this.status.lastError = undefined;
      }

      return isHealthy;
    } catch (error) {
      this.status.lastError = error instanceof Error ? error.message : 'Health check failed';
      this.status.lastHealthCheck = new Date();
      logger.warn(`Gemini health check failed:`, error);
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
    logger.info('Gemini provider cleaned up');
  }
}
