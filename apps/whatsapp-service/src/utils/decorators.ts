/**
 * @fileoverview TypeScript decorators for enhanced logging and metrics
 */

import { logger } from './logger';
import type { BaseError } from '../errors';

/**
 * Context for correlation tracking - made flexible for additional properties
 */
export interface ExecutionContext {
  correlationId: string;
  sessionId?: string;
  userId?: string;
  operationId?: string;
  // Allow additional properties for specific contexts
  phoneNumber?: string;
  messageId?: string;
  to?: string;
  chatId?: string;
  query?: string;
  filePath?: string;
  status?: string;
  maxAttempts?: number;
  olderThanDays?: number;
  [key: string]: any; // Allow any additional properties
}

/**
 * Type guards for Result<T, E> pattern
 */
export type Result<T, E = BaseError> = 
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Type guard to check if a result is successful
 */
export function isSuccess<T, E>(result: Result<T, E>): result is { success: true; data: T } {
  return result.success === true;
}

/**
 * Type guard to check if a result is a failure
 */
export function isFailure<T, E>(result: Result<T, E>): result is { success: false; error: E } {
  return result.success === false;
}

/**
 * Performance metrics interface
 */
export interface PerformanceMetrics {
  executionTime: number;
  memoryUsed: number;
  timestamp: Date;
  success: boolean;
}

/**
 * Decorator to log execution time of methods
 */
export function LogExecutionTime(context?: Partial<ExecutionContext>) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;
      const methodName = `${target.constructor.name}.${propertyName}`;
      
      // Generate correlation ID if not provided
      const correlationId = context?.correlationId || Math.random().toString(36).substring(7);
      
      const logContext = {
        method: methodName,
        correlationId,
        sessionId: context?.sessionId,
        userId: context?.userId,
        operationId: context?.operationId,
      };

      logger.debug(`🚀 Starting ${methodName}`, logContext);

      try {
        const result = await method.apply(this, args);
        const executionTime = Date.now() - startTime;
        const memoryUsed = process.memoryUsage().heapUsed - startMemory;

        const metrics: PerformanceMetrics = {
          executionTime,
          memoryUsed,
          timestamp: new Date(),
          success: true,
        };

        logger.info(`✅ Completed ${methodName} in ${executionTime}ms`, {
          ...logContext,
          metrics,
        });

        return result;
      } catch (error) {
        const executionTime = Date.now() - startTime;
        const memoryUsed = process.memoryUsage().heapUsed - startMemory;

        const metrics: PerformanceMetrics = {
          executionTime,
          memoryUsed,
          timestamp: new Date(),
          success: false,
        };

        logger.error(`❌ Failed ${methodName} after ${executionTime}ms`, {
          ...logContext,
          metrics,
          error: error instanceof Error ? error.message : String(error),
        });

        throw error;
      }
    };
  };
}

/**
 * Decorator to add retry logic with exponential backoff
 */
export function Retry(maxAttempts: number = 3, baseDelayMs: number = 1000) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const methodName = `${target.constructor.name}.${propertyName}`;
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await method.apply(this, args);
        } catch (error) {
          const isLastAttempt = attempt === maxAttempts;
          
          if (isLastAttempt) {
            logger.error(`❌ ${methodName} failed after ${maxAttempts} attempts`, { 
              error: error instanceof Error ? error.message : String(error) 
            });
            throw error;
          }

          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          logger.warn(`⚠️ ${methodName} attempt ${attempt} failed, retrying in ${delay}ms`, {
            error: error instanceof Error ? error.message : String(error)
          });
          
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    };
  };
}

/**
 * Decorator to validate method arguments
 */
export function ValidateArgs(validator: (args: any[]) => boolean | string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = function (...args: any[]) {
      const validationResult = validator(args);
      
      if (typeof validationResult === 'string') {
        throw new Error(`Validation failed for ${target.constructor.name}.${propertyName}: ${validationResult}`);
      }
      
      if (validationResult === false) {
        throw new Error(`Invalid arguments for ${target.constructor.name}.${propertyName}`);
      }

      return method.apply(this, args);
    };
  };
}

/**
 * Safe executor utility for wrapping dangerous operations
 */
export class SafeExecutor {
  /**
   * Execute a function safely with proper error handling
   */
  static async execute<T>(
    operation: () => Promise<T>,
    context: {
      operationName: string;
      context?: Partial<ExecutionContext>;
      timeout?: number;
      fallback?: T;
    }
  ): Promise<{ success: true; data: T } | { success: false; error: BaseError }> {
    const { operationName, timeout = 30000, fallback } = context;
    const logContext = {
      operation: operationName,
      ...context.context,
    };

    try {
      logger.debug(`🔄 Executing ${operationName}`, logContext);
      
      let result: T;
      
      if (timeout > 0) {
        result = await Promise.race([
          operation(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Operation timeout after ${timeout}ms`)), timeout)
          ),
        ]);
      } else {
        result = await operation();
      }

      logger.debug(`✅ Successfully executed ${operationName}`, logContext);
      return { success: true, data: result };
      
    } catch (error) {
      logger.error(`❌ Failed to execute ${operationName}`, {
        ...logContext,
        error: error instanceof Error ? error.message : String(error),
      });

      if (fallback !== undefined) {
        logger.info(`🔄 Using fallback for ${operationName}`, logContext);
        return { success: true, data: fallback };
      }

      return {
        success: false,
        error: error instanceof Error ? error as BaseError : new Error(String(error)) as BaseError,
      };
    }
  }

  /**
   * Execute with circuit breaker pattern
   */
  static async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    circuitBreakerKey: string,
    context: {
      operationName: string;
      context?: Partial<ExecutionContext>;
      timeout?: number;
    }
  ): Promise<{ success: true; data: T } | { success: false; error: BaseError }> {
    // This would integrate with a circuit breaker implementation
    // For now, we'll just use the regular execute method
    return this.execute(operation, context);
  }

  /**
   * Execute multiple operations in parallel with error isolation
   */
  static async executeParallel<T>(
    operations: Array<{
      operation: () => Promise<T>;
      name: string;
      required?: boolean;
    }>,
    context: Partial<ExecutionContext> = {}
  ): Promise<{
    successful: Array<{ name: string; result: T }>;
    failed: Array<{ name: string; error: BaseError }>;
  }> {
    const results = await Promise.allSettled(
      operations.map(async (op) => {
        const result = await this.execute(op.operation, {
          operationName: op.name,
          context,
        });
        return { name: op.name, result, required: op.required };
      })
    );

    const successful: Array<{ name: string; result: T }> = [];
    const failed: Array<{ name: string; error: BaseError }> = [];

    results.forEach((result, index) => {
      const { name, required } = operations[index];
      
      if (result.status === 'fulfilled' && result.value.result.success) {
        successful.push({
          name,
          result: result.value.result.data,
        });
      } else {
        const error = result.status === 'rejected' 
          ? new Error(result.reason) as BaseError
          : result.status === 'fulfilled' && !result.value.result.success
            ? (result.value.result as { success: false; error: BaseError }).error
            : new Error('Unknown error') as BaseError;
          
        failed.push({ name, error });
        
        if (required) {
          logger.error(`❌ Required operation ${name} failed`, {
            ...context,
            error: error.message,
          });
        }
      }
    });

    return { successful, failed };
  }
}

/**
 * Utility for creating correlation contexts
 */
export class ContextManager {
  private static contexts = new Map<string, ExecutionContext>();

  static createContext(data: Partial<ExecutionContext> = {}): ExecutionContext {
    const context: ExecutionContext = {
      correlationId: Math.random().toString(36).substring(7),
      ...data,
    };
    
    this.contexts.set(context.correlationId, context);
    return context;
  }

  static getContext(correlationId: string): ExecutionContext | undefined {
    return this.contexts.get(correlationId);
  }

  static updateContext(correlationId: string, updates: Partial<ExecutionContext>): void {
    const existing = this.contexts.get(correlationId);
    if (existing) {
      this.contexts.set(correlationId, { ...existing, ...updates });
    }
  }

  static deleteContext(correlationId: string): void {
    this.contexts.delete(correlationId);
  }

  static cleanup(): void {
    // Remove contexts older than 1 hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [id, context] of this.contexts.entries()) {
      if (Date.now() - oneHourAgo > 0) {
        this.contexts.delete(id);
      }
    }
  }
}
