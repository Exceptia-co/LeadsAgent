/**
 * @fileoverview Centralized EventBus with Observer Pattern and strongly typed events
 */

import { logger } from '../utils/logger';
import type { IEventBus, EventHandler, DomainEvent } from '../types';
import { SafeExecutor } from '../utils/decorators';

/**
 * WhatsApp specific events
 */
export namespace WhatsAppEvents {
  export interface QrCodeGenerated {
    sessionId: string;
    qrCode: string;
    timestamp: Date;
  }

  export interface SessionAuthenticated {
    sessionId: string;
    phoneNumber: string;
    clientInfo: any;
    timestamp: Date;
  }

  export interface SessionReady {
    sessionId: string;
    phoneNumber: string;
    clientInfo: any;
    timestamp: Date;
  }

  export interface SessionDisconnected {
    sessionId: string;
    reason: string;
    timestamp: Date;
  }

  export interface MessageReceived {
    sessionId: string;
    messageId: string;
    from: string;
    to: string;
    body: string;
    type: string;
    timestamp: Date;
  }

  export interface MessageSent {
    sessionId: string;
    messageId: string;
    to: string;
    body: string;
    success: boolean;
    timestamp: Date;
  }

  export interface AuthenticationFailed {
    sessionId: string;
    error: string;
    timestamp: Date;
  }

  export interface SessionCreated {
    sessionId: string;
    timestamp: Date;
  }

  export interface SessionDestroyed {
    sessionId: string;
    timestamp: Date;
  }

  export interface StatusChanged {
    sessionId: string;
    oldStatus: string;
    newStatus: string;
    timestamp: Date;
    metadata?: any;
  }

  export interface SessionReconnected {
    sessionId: string;
    attempts: number;
    timestamp: Date;
  }

  export interface SessionAuthFailed {
    sessionId: string;
    reason: string;
    timestamp: Date;
  }

  export interface QrReceived {
    sessionId: string;
    qrCode: string;
    timestamp: Date;
  }

  export interface LoadingProgress {
    sessionId: string;
    percent: number;
    message: string;
    timestamp: Date;
  }

  export interface MessageAck {
    sessionId: string;
    messageId: string;
    ackType: string;
    timestamp: Date;
  }

  export interface GroupJoin {
    sessionId: string;
    groupId: string;
    participants: string[];
    timestamp: Date;
  }

  export interface GroupLeave {
    sessionId: string;
    groupId: string;
    participants: string[];
    timestamp: Date;
  }

  export interface EventError {
    sessionId: string;
    eventName: string;
    error: string;
    timestamp: Date;
  }

  export interface MediaDownloaded {
    sessionId: string;
    messageId: string;
    mediaType: string;
    filePath: string;
    fileSize: number;
    timestamp: Date;
  }

  export interface ContactBlocked {
    sessionId: string;
    contactId: string;
    phoneNumber: string;
    timestamp: Date;
  }

  export interface ContactUnblocked {
    sessionId: string;
    contactId: string;
    phoneNumber: string;
    timestamp: Date;
  }
}

/**
 * AI service events
 */
export namespace AIEvents {
  export interface ResponseGenerated {
    sessionId: string;
    provider: string;
    prompt: string;
    response: string;
    tokensUsed: number;
    processingTime: number;
    timestamp: Date;
  }

  export interface ProviderFailed {
    provider: string;
    error: string;
    sessionId?: string;
    timestamp: Date;
  }

  export interface MessageClassified {
    sessionId: string;
    messageId: string;
    classification: string;
    confidence: number;
    timestamp: Date;
  }
}

/**
 * System events
 */
export namespace SystemEvents {
  export interface ServiceStarted {
    serviceName: string;
    version: string;
    timestamp: Date;
  }

  export interface ServiceStopped {
    serviceName: string;
    reason: string;
    timestamp: Date;
  }

  export interface HealthCheckFailed {
    serviceName: string;
    error: string;
    timestamp: Date;
  }

  export interface DatabaseConnected {
    databaseType: string;
    connectionString: string;
    timestamp: Date;
  }

  export interface CacheConnected {
    cacheType: string;
    connectionString: string;
    timestamp: Date;
  }
}

/**
 * Event type mapping for type safety
 */
export interface EventTypeMap {
  // WhatsApp events
  'whatsapp:qr-generated': WhatsAppEvents.QrCodeGenerated;
  'whatsapp:authenticated': WhatsAppEvents.SessionAuthenticated;
  'whatsapp:ready': WhatsAppEvents.SessionReady;
  'whatsapp:disconnected': WhatsAppEvents.SessionDisconnected;
  'whatsapp:message-received': WhatsAppEvents.MessageReceived;
  'whatsapp:message-sent': WhatsAppEvents.MessageSent;
  'whatsapp:auth-failed': WhatsAppEvents.AuthenticationFailed;
  'whatsapp:session-created': WhatsAppEvents.SessionCreated;
  'whatsapp:session-destroyed': WhatsAppEvents.SessionDestroyed;
  'whatsapp:status-changed': WhatsAppEvents.StatusChanged;
  'whatsapp:session-reconnected': WhatsAppEvents.SessionReconnected;
  
  // New WhatsApp events
  'whatsapp:session-auth-failed': WhatsAppEvents.SessionAuthFailed;
  'whatsapp:qr-received': WhatsAppEvents.QrReceived;
  'whatsapp:session-ready': WhatsAppEvents.SessionReady;
  'whatsapp:session-authenticated': WhatsAppEvents.SessionAuthenticated;
  'whatsapp:session-disconnected': WhatsAppEvents.SessionDisconnected;
  'whatsapp:loading-progress': WhatsAppEvents.LoadingProgress;
  'whatsapp:message-ack': WhatsAppEvents.MessageAck;
  'whatsapp:group-join': WhatsAppEvents.GroupJoin;
  'whatsapp:group-leave': WhatsAppEvents.GroupLeave;
  'whatsapp:event-error': WhatsAppEvents.EventError;
  'whatsapp:media-downloaded': WhatsAppEvents.MediaDownloaded;
  'whatsapp:contact-blocked': WhatsAppEvents.ContactBlocked;
  'whatsapp:contact-unblocked': WhatsAppEvents.ContactUnblocked;
  
  // AI events
  'ai:response-generated': AIEvents.ResponseGenerated;
  'ai:provider-failed': AIEvents.ProviderFailed;
  'ai:message-classified': AIEvents.MessageClassified;
  
  // System events
  'system:service-started': SystemEvents.ServiceStarted;
  'system:service-stopped': SystemEvents.ServiceStopped;
  'system:health-check-failed': SystemEvents.HealthCheckFailed;
  'system:database-connected': SystemEvents.DatabaseConnected;
  'system:cache-connected': SystemEvents.CacheConnected;
}

/**
 * Centralized EventBus implementation with type safety
 */
export class EventBus implements IEventBus {
  private static instance: EventBus;
  private handlers = new Map<string, Set<EventHandler<any>>>();
  private onceHandlers = new Map<string, Set<EventHandler<any>>>();
  private middleware: EventMiddleware[] = [];

  private constructor() {}

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Subscribe to an event with type safety
   */
  public subscribe<K extends keyof EventTypeMap>(
    eventName: K,
    handler: EventHandler<EventTypeMap[K]>
  ): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, new Set());
    }
    this.handlers.get(eventName)!.add(handler);
    
    logger.debug(`📡 Subscribed to event: ${eventName}`, {
      totalHandlers: this.handlers.get(eventName)!.size
    });
  }

  /**
   * Subscribe to an event for one-time execution
   */
  public once<K extends keyof EventTypeMap>(
    eventName: K,
    handler: EventHandler<EventTypeMap[K]>
  ): void {
    if (!this.onceHandlers.has(eventName)) {
      this.onceHandlers.set(eventName, new Set());
    }
    this.onceHandlers.get(eventName)!.add(handler);
    
    logger.debug(`📡 Subscribed once to event: ${eventName}`);
  }

  /**
   * Unsubscribe from an event
   */
  public unsubscribe<K extends keyof EventTypeMap>(
    eventName: K,
    handler: EventHandler<EventTypeMap[K]>
  ): void {
    const handlers = this.handlers.get(eventName);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(eventName);
      }
    }

    const onceHandlers = this.onceHandlers.get(eventName);
    if (onceHandlers) {
      onceHandlers.delete(handler);
      if (onceHandlers.size === 0) {
        this.onceHandlers.delete(eventName);
      }
    }
    
    logger.debug(`📡 Unsubscribed from event: ${eventName}`);
  }

  /**
   * Publish an event with type safety
   */
  public async publish<K extends keyof EventTypeMap>(
    eventName: K,
    data: EventTypeMap[K]
  ): Promise<void> {
    const startTime = Date.now();
    const correlationId = Math.random().toString(36).substring(7);
    
    logger.debug(`📤 Publishing event: ${eventName}`, {
      correlationId,
      data: this.sanitizeEventData(data)
    });

    try {
      // Apply middleware
      let processedData = data;
      for (const middleware of this.middleware) {
        processedData = await middleware.beforePublish(eventName, processedData, correlationId);
      }

      // Get all handlers
      const regularHandlers = this.handlers.get(eventName) || new Set();
      const onceHandlers = this.onceHandlers.get(eventName) || new Set();
      const allHandlers = [...regularHandlers, ...onceHandlers];

      if (allHandlers.length === 0) {
        logger.debug(`📭 No handlers for event: ${eventName}`, { correlationId });
        return;
      }

      // Execute all handlers in parallel
      const results = await SafeExecutor.executeParallel(
        allHandlers.map((handler, index) => ({
          name: `${eventName}-handler-${index}`,
          operation: async () => {
            await handler(processedData);
            return true;
          },
          required: false
        })),
        { correlationId }
      );

      // Clean up once handlers
      if (onceHandlers.size > 0) {
        this.onceHandlers.delete(eventName);
      }

      const executionTime = Date.now() - startTime;
      logger.debug(`📤 Event published successfully: ${eventName}`, {
        correlationId,
        executionTime,
        handlersExecuted: results.successful.length,
        handlersFailed: results.failed.length
      });

      // Log handler failures
      if (results.failed.length > 0) {
        logger.warn(`⚠️ Some event handlers failed for: ${eventName}`, {
          correlationId,
          failures: results.failed.map(f => ({ name: f.name, error: f.error.message }))
        });
      }

    } catch (error) {
      logger.error(`❌ Failed to publish event: ${eventName}`, {
        correlationId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Add middleware for event processing
   */
  public addMiddleware(middleware: EventMiddleware): void {
    this.middleware.push(middleware);
    logger.debug(`🔧 Added event middleware: ${middleware.constructor.name}`);
  }

  /**
   * Remove middleware
   */
  public removeMiddleware(middleware: EventMiddleware): void {
    const index = this.middleware.indexOf(middleware);
    if (index > -1) {
      this.middleware.splice(index, 1);
      logger.debug(`🔧 Removed event middleware: ${middleware.constructor.name}`);
    }
  }

  /**
   * Get event statistics
   */
  public getStats(): EventBusStats {
    const totalSubscriptions = Array.from(this.handlers.values())
      .reduce((sum, handlers) => sum + handlers.size, 0);
    
    const totalOnceSubscriptions = Array.from(this.onceHandlers.values())
      .reduce((sum, handlers) => sum + handlers.size, 0);

    return {
      totalEvents: this.handlers.size + this.onceHandlers.size,
      totalSubscriptions,
      totalOnceSubscriptions,
      middleware: this.middleware.length,
      eventsByType: Object.fromEntries(
        Array.from(this.handlers.entries()).map(([event, handlers]) => [
          event,
          handlers.size
        ])
      )
    };
  }

  /**
   * Clean up all handlers (useful for testing)
   */
  public clear(): void {
    this.handlers.clear();
    this.onceHandlers.clear();
    this.middleware = [];
    logger.debug('🧹 EventBus cleared');
  }

  /**
   * Sanitize event data for logging (remove sensitive information)
   */
  private sanitizeEventData(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'auth'];
    const sanitized = { ...data };

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}

/**
 * Event middleware interface
 */
export interface EventMiddleware {
  beforePublish<K extends keyof EventTypeMap>(
    eventName: K,
    data: EventTypeMap[K],
    correlationId: string
  ): Promise<EventTypeMap[K]>;
}

/**
 * Event bus statistics
 */
export interface EventBusStats {
  totalEvents: number;
  totalSubscriptions: number;
  totalOnceSubscriptions: number;
  middleware: number;
  eventsByType: Record<string, number>;
}

/**
 * Logging middleware for events
 */
export class LoggingMiddleware implements EventMiddleware {
  async beforePublish<K extends keyof EventTypeMap>(
    eventName: K,
    data: EventTypeMap[K],
    correlationId: string
  ): Promise<EventTypeMap[K]> {
    logger.info(`🎯 Event middleware: ${eventName}`, {
      correlationId,
      timestamp: new Date().toISOString()
    });
    return data;
  }
}

/**
 * Metrics middleware for events
 */
export class MetricsMiddleware implements EventMiddleware {
  private eventCounts = new Map<string, number>();

  async beforePublish<K extends keyof EventTypeMap>(
    eventName: K,
    data: EventTypeMap[K],
    correlationId: string
  ): Promise<EventTypeMap[K]> {
    const currentCount = this.eventCounts.get(eventName) || 0;
    this.eventCounts.set(eventName, currentCount + 1);
    return data;
  }

  public getMetrics(): Record<string, number> {
    return Object.fromEntries(this.eventCounts.entries());
  }
}

// Export singleton instance
export const eventBus = EventBus.getInstance();
