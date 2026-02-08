/**
 * AI Provider Factory
 *
 * Implements the Factory pattern for creating and managing AI provider instances.
 * Handles provider initialization, health monitoring, and fallback strategies.
 */

import { logger } from '../../utils/logger';
import { aiConfig } from '../../config/enhanced-ai.config';
import type {
  IAIProvider,
  IAIProviderFactory,
  AIProviderType,
  ProviderStatus,
} from './interfaces/IAIProvider';

// Import concrete providers
import { OpenRouterProvider } from './providers/OpenRouterProvider';
import { GeminiProvider } from './providers/GeminiProvider';

/**
 * Provider factory implementation
 */
export class AIProviderFactory implements IAIProviderFactory {
  private providers: Map<AIProviderType, IAIProvider> = new Map();
  private providersStatus: Map<AIProviderType, ProviderStatus> = new Map();
  private initialized = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize the factory
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('🏭 Initializing AI Provider Factory...');

    try {
      // Initialize all configured providers
      await this.initializeAllProviders();
      this.initialized = true;
      logger.info('✅ AI Provider Factory initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize AI Provider Factory:', error);
      throw error;
    }
  }

  /**
   * Initialize all configured providers
   */
  private async initializeAllProviders(): Promise<void> {
    const config = aiConfig.getConfig();
    const providerTypes: AIProviderType[] = ['openrouter', 'gemini'];

    const initPromises = providerTypes.map(async providerType => {
      try {
        const provider = await this.createProviderInstance(providerType);
        const providerConfig = config.providers[providerType];

        // Only initialize if API key is available
        if (providerConfig.apiKey) {
          await provider.initialize(providerConfig);
          this.providers.set(providerType, provider);

          const status = provider.getStatus();
          this.providersStatus.set(providerType, status);

          if (status.ready) {
            logger.info(`✅ ${providerType} provider initialized: Ready`);
          } else {
            logger.warn(`⚠️  ${providerType} provider initialized: Not Ready`);
          }
        } else {
          logger.warn(`⚠️  ${providerType} provider skipped: No API key configured`);
          this.providersStatus.set(providerType, {
            ready: false,
            lastError: 'No API key configured',
            lastHealthCheck: new Date(),
          });
        }
      } catch (error) {
        logger.error(`❌ Failed to initialize ${providerType} provider:`, error);
        this.providersStatus.set(providerType, {
          ready: false,
          lastError: error instanceof Error ? error.message : 'Initialization failed',
          lastHealthCheck: new Date(),
        });
      }
    });

    await Promise.allSettled(initPromises);
  }

  /**
   * Create provider instance by type
   */
  public async createProvider(type: AIProviderType): Promise<IAIProvider> {
    // Check if provider already exists and is ready
    const existingProvider = this.providers.get(type);
    if (existingProvider && existingProvider.isReady()) {
      return existingProvider;
    }

    // Create new provider instance
    const provider = await this.createProviderInstance(type);
    const config = aiConfig.getProviderConfig(type);

    // Initialize the provider
    await provider.initialize(config);

    // Store provider and update status
    this.providers.set(type, provider);
    this.providersStatus.set(type, provider.getStatus());

    logger.info(`✅ Created and initialized ${type} provider`);
    return provider;
  }

  /**
   * Create provider instance without initialization
   */
  private async createProviderInstance(type: AIProviderType): Promise<IAIProvider> {
    switch (type) {
      case 'openrouter':
        return new OpenRouterProvider();

      case 'gemini':
        return new GeminiProvider();

      default:
        throw new Error(`Unsupported provider type: ${type}`);
    }
  }

  /**
   * Get recommended provider based on availability and configuration
   */
  public async getRecommendedProvider(): Promise<IAIProvider> {
    const config = aiConfig.getConfig();

    // Try default provider first
    const defaultProvider = this.providers.get(config.defaultProvider);
    if (defaultProvider && defaultProvider.isReady()) {
      logger.debug(`Using default provider: ${config.defaultProvider}`);
      return defaultProvider;
    }

    // Fallback to any available provider
    if (config.features.enableProviderFallback) {
      for (const [providerType, provider] of this.providers.entries()) {
        if (provider.isReady()) {
          logger.info(
            `🔄 Using fallback provider: ${providerType} (default ${config.defaultProvider} unavailable)`
          );
          return provider;
        }
      }
    }

    // If no providers are ready, try to reinitialize default
    logger.warn(
      `⚠️  No ready providers found, attempting to reinitialize ${config.defaultProvider}`
    );
    try {
      return await this.createProvider(config.defaultProvider);
    } catch (error) {
      logger.error(`❌ Failed to reinitialize default provider ${config.defaultProvider}:`, error);
      throw new Error(
        `No AI providers available. Last error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get status of all providers
   */
  public async getAllProvidersStatus(): Promise<Record<AIProviderType, ProviderStatus>> {
    // Update status from active providers
    for (const [type, provider] of this.providers.entries()) {
      if (provider) {
        this.providersStatus.set(type, provider.getStatus());
      }
    }

    // Convert Map to Record
    const statusRecord: Record<AIProviderType, ProviderStatus> = {} as any;

    const allTypes: AIProviderType[] = ['openrouter', 'gemini', 'openai', 'claude'];
    allTypes.forEach(type => {
      statusRecord[type] = this.providersStatus.get(type) || {
        ready: false,
        lastError: 'Not initialized',
        lastHealthCheck: new Date(),
      };
    });

    return statusRecord;
  }

  /**
   * Get provider by type (if exists and ready)
   */
  public getProvider(type: AIProviderType): IAIProvider | null {
    const provider = this.providers.get(type);
    return provider && provider.isReady() ? provider : null;
  }

  /**
   * Switch default provider
   */
  public async switchDefaultProvider(type: AIProviderType): Promise<boolean> {
    try {
      const provider = await this.createProvider(type);
      if (provider.isReady()) {
        // Update configuration (this would need to be implemented in aiConfig)
        logger.info(`✅ Switched default provider to: ${type}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`❌ Failed to switch to provider ${type}:`, error);
      return false;
    }
  }

  /**
   * Health check for all providers
   */
  public async performHealthChecks(): Promise<void> {
    logger.debug('🔍 Performing health checks for all providers...');

    const healthCheckPromises = Array.from(this.providers.entries()).map(
      async ([type, provider]) => {
        try {
          const isHealthy = (await provider.healthCheck?.()) ?? provider.isReady();
          const status = provider.getStatus();
          this.providersStatus.set(type, {
            ...status,
            ready: isHealthy,
            lastHealthCheck: new Date(),
          });

          logger.debug(`Health check ${type}: ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);
        } catch (error) {
          logger.warn(`Health check failed for ${type}:`, error);
          this.providersStatus.set(type, {
            ready: false,
            lastError: error instanceof Error ? error.message : 'Health check failed',
            lastHealthCheck: new Date(),
          });
        }
      }
    );

    await Promise.allSettled(healthCheckPromises);
    logger.debug('🏁 Health checks completed');
  }

  /**
   * Get factory status and statistics
   */
  public getFactoryStatus() {
    const totalProviders = this.providers.size;
    const readyProviders = Array.from(this.providers.values()).filter(p => p.isReady()).length;

    return {
      initialized: this.initialized,
      totalProviders,
      readyProviders,
      readyPercentage: totalProviders > 0 ? (readyProviders / totalProviders) * 100 : 0,
      defaultProvider: aiConfig.getDefaultProvider(),
      lastHealthCheck: new Date(),
    };
  }

  /**
   * Cleanup all providers
   */
  public async cleanup(): Promise<void> {
    logger.info('🧹 Cleaning up AI Provider Factory...');

    const cleanupPromises = Array.from(this.providers.values()).map(async provider => {
      try {
        await provider.cleanup?.();
      } catch (error) {
        logger.warn('Error during provider cleanup:', error);
      }
    });

    await Promise.allSettled(cleanupPromises);

    this.providers.clear();
    this.providersStatus.clear();
    this.initialized = false;

    logger.info('✅ AI Provider Factory cleanup completed');
  }
}

// Export singleton instance
export const aiProviderFactory = new AIProviderFactory();
