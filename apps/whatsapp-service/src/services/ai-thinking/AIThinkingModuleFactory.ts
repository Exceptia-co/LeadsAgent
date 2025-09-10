/**
 * AIThinkingModuleFactory - Phase 3 AI Services Modularization
 *
 * Factory class that manages all AI thinking modules and provides
 * a unified interface for creating and configuring modular components.
 *
 * Part of Phase 3: AI Services Modularization
 */

import { logger } from '../../utils/logger';
import { ContextEnricher } from './ContextEnricher';
import { KnowledgeRetrieval } from './KnowledgeRetrieval';
import { StrategySelector } from './StrategySelector';
import { DecisionEngine } from './DecisionEngine';
import { ResponseGenerator } from './ResponseGenerator';

// ============================================
// INTERFACES Y TIPOS
// ============================================

export interface ModuleConfig {
  enableContextEnricher: boolean;
  enableKnowledgeRetrieval: boolean;
  enableStrategySelector: boolean;
  enableDecisionEngine: boolean;
  enableResponseGenerator: boolean;
  performanceOptimized: boolean;
}

export interface ModuleInstances {
  contextEnricher: ContextEnricher;
  knowledgeRetrieval: KnowledgeRetrieval;
  strategySelector: StrategySelector;
  decisionEngine: DecisionEngine;
  responseGenerator: ResponseGenerator;
}

// ============================================
// AI THINKING MODULE FACTORY
// ============================================

export class AIThinkingModuleFactory {
  private static instance: AIThinkingModuleFactory;
  private modules: ModuleInstances | null = null;
  private isInitialized = false;

  private readonly DEFAULT_CONFIG: ModuleConfig = {
    enableContextEnricher: true,
    enableKnowledgeRetrieval: true,
    enableStrategySelector: true,
    enableDecisionEngine: true,
    enableResponseGenerator: true,
    performanceOptimized: true,
  };

  private constructor() {
    logger.debug('AIThinkingModuleFactory initialized');
  }

  public static getInstance(): AIThinkingModuleFactory {
    if (!AIThinkingModuleFactory.instance) {
      AIThinkingModuleFactory.instance = new AIThinkingModuleFactory();
    }
    return AIThinkingModuleFactory.instance;
  }

  // ============================================
  // FACTORY METHODS
  // ============================================

  /**
   * Initialize all AI thinking modules
   */
  public async initializeModules(config?: Partial<ModuleConfig>): Promise<ModuleInstances> {
    if (this.isInitialized && this.modules) {
      return this.modules;
    }

    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };

    try {
      logger.info('🧠 Initializing AI Thinking Modules...');

      // Initialize all modules
      const modules: ModuleInstances = {
        contextEnricher: new ContextEnricher(),
        knowledgeRetrieval: new KnowledgeRetrieval(),
        strategySelector: new StrategySelector(),
        decisionEngine: new DecisionEngine(),
        responseGenerator: new ResponseGenerator(),
      };

      // Validate modules
      this.validateModules(modules, finalConfig);

      this.modules = modules;
      this.isInitialized = true;

      logger.info('✅ AI Thinking Modules initialized successfully', {
        contextEnricher: finalConfig.enableContextEnricher,
        knowledgeRetrieval: finalConfig.enableKnowledgeRetrieval,
        strategySelector: finalConfig.enableStrategySelector,
        decisionEngine: finalConfig.enableDecisionEngine,
        responseGenerator: finalConfig.enableResponseGenerator,
        performanceOptimized: finalConfig.performanceOptimized,
      });

      return modules;
    } catch (error) {
      logger.error('❌ Error initializing AI Thinking Modules:', error);
      throw new Error(
        `Failed to initialize AI Thinking Modules: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get initialized modules (throws if not initialized)
   */
  public getModules(): ModuleInstances {
    if (!this.isInitialized || !this.modules) {
      throw new Error('AI Thinking Modules not initialized. Call initializeModules() first.');
    }
    return this.modules;
  }

  /**
   * Check if modules are initialized
   */
  public isModulesInitialized(): boolean {
    return this.isInitialized && this.modules !== null;
  }

  /**
   * Reset factory (for testing purposes)
   */
  public reset(): void {
    this.modules = null;
    this.isInitialized = false;
    logger.debug('AIThinkingModuleFactory reset');
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Validate that all required modules are properly initialized
   */
  private validateModules(modules: ModuleInstances, config: ModuleConfig): void {
    const validations = [
      {
        enabled: config.enableContextEnricher,
        module: modules.contextEnricher,
        name: 'ContextEnricher',
      },
      {
        enabled: config.enableKnowledgeRetrieval,
        module: modules.knowledgeRetrieval,
        name: 'KnowledgeRetrieval',
      },
      {
        enabled: config.enableStrategySelector,
        module: modules.strategySelector,
        name: 'StrategySelector',
      },
      {
        enabled: config.enableDecisionEngine,
        module: modules.decisionEngine,
        name: 'DecisionEngine',
      },
      {
        enabled: config.enableResponseGenerator,
        module: modules.responseGenerator,
        name: 'ResponseGenerator',
      },
    ];

    for (const validation of validations) {
      if (validation.enabled && !validation.module) {
        throw new Error(`${validation.name} module failed to initialize`);
      }
    }

    logger.debug('✅ All AI Thinking Modules validated successfully');
  }
}

// Export singleton instance
export default AIThinkingModuleFactory.getInstance();
