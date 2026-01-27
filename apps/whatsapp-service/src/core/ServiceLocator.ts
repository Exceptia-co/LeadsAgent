/**
 * @fileoverview Service Locator pattern for dependency management
 * Provides a centralized registry for services to avoid circular dependencies
 */

import { logger } from '../utils/logger';
import type { IDataPersistence } from '../interfaces/IDataPersistence';
import type { IWhatsAppSessionManager } from '../interfaces/IWhatsAppSessionManager';
import type {
  IMessageProcessor,
  IEventHandler,
  IMediaHandler,
  IContactManager,
  IConnectionManager,
} from '../types';

/**
 * Service registry interface
 */
interface ServiceRegistry {
  dataPersistence?: IDataPersistence;
  sessionManager?: IWhatsAppSessionManager;
  messageProcessor?: IMessageProcessor;
  eventHandler?: IEventHandler;
  mediaHandler?: IMediaHandler;
  contactManager?: IContactManager;
  connectionManager?: IConnectionManager;
}

/**
 * Service Locator for managing dependencies
 * Helps break circular dependencies by providing lazy service resolution
 */
export class ServiceLocator {
  private static instance: ServiceLocator;
  private services: ServiceRegistry = {};
  private isInitializing: Set<string> = new Set();

  private constructor() {}

  public static getInstance(): ServiceLocator {
    if (!ServiceLocator.instance) {
      ServiceLocator.instance = new ServiceLocator();
    }
    return ServiceLocator.instance;
  }

  /**
   * Register a service in the locator
   */
  public register<K extends keyof ServiceRegistry>(
    serviceName: K,
    service: ServiceRegistry[K]
  ): void {
    if (this.services[serviceName]) {
      logger.warn(`🔄 Service '${serviceName}' is being replaced in ServiceLocator`);
    }

    this.services[serviceName] = service;
    logger.debug(`✅ Service '${serviceName}' registered in ServiceLocator`);
  }

  /**
   * Get a service from the locator
   */
  public get<K extends keyof ServiceRegistry>(serviceName: K): ServiceRegistry[K] {
    const service = this.services[serviceName];

    if (!service) {
      throw new Error(
        `Service '${serviceName}' not found in ServiceLocator. ` +
          `Available services: ${Object.keys(this.services).join(', ')}`
      );
    }

    return service;
  }

  /**
   * Get a service with lazy initialization support
   */
  public async getLazy<K extends keyof ServiceRegistry>(
    serviceName: K,
    initializer?: () => Promise<ServiceRegistry[K]>
  ): Promise<ServiceRegistry[K]> {
    // Check if service is already registered
    if (this.services[serviceName]) {
      return this.services[serviceName];
    }

    // Check if service is currently being initialized to prevent circular init
    if (this.isInitializing.has(serviceName)) {
      throw new Error(`Circular initialization detected for service '${serviceName}'`);
    }

    // Initialize if initializer provided
    if (initializer) {
      this.isInitializing.add(serviceName);

      try {
        logger.debug(`🔄 Lazy initializing service '${serviceName}'`);
        const service = await initializer();
        this.register(serviceName, service);
        return service;
      } catch (error) {
        logger.error(`❌ Failed to lazy initialize service '${serviceName}':`, error);
        throw error;
      } finally {
        this.isInitializing.delete(serviceName);
      }
    }

    throw new Error(
      `Service '${serviceName}' not found and no initializer provided. ` +
        `Available services: ${Object.keys(this.services).join(', ')}`
    );
  }

  /**
   * Check if a service is registered
   */
  public has<K extends keyof ServiceRegistry>(serviceName: K): boolean {
    return serviceName in this.services && this.services[serviceName] !== undefined;
  }

  /**
   * Unregister a service
   */
  public unregister<K extends keyof ServiceRegistry>(serviceName: K): void {
    if (this.services[serviceName]) {
      delete this.services[serviceName];
      logger.debug(`🗑️ Service '${serviceName}' unregistered from ServiceLocator`);
    }
  }

  /**
   * Get all registered service names
   */
  public getRegisteredServices(): string[] {
    return Object.keys(this.services);
  }

  /**
   * Clear all services (useful for testing)
   */
  public clear(): void {
    this.services = {};
    this.isInitializing.clear();
    logger.debug('🧹 ServiceLocator cleared');
  }

  /**
   * Get service registry stats
   */
  public getStats(): {
    registeredServices: number;
    initializingServices: number;
    serviceNames: string[];
  } {
    return {
      registeredServices: Object.keys(this.services).length,
      initializingServices: this.isInitializing.size,
      serviceNames: Object.keys(this.services),
    };
  }
}

/**
 * Convenience function to get the service locator instance
 */
export const serviceLocator = ServiceLocator.getInstance();
