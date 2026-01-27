/**
 * @fileoverview Custom error hierarchy for WhatsApp service
 * Provides structured error handling with proper typing and context
 */

export abstract class BaseError extends Error {
  public readonly timestamp: Date;
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    public readonly code: string,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date();
    this.context = context;

    // Maintain proper stack trace in Node.js
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error to JSON for logging
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * WhatsApp related errors
 */
export class WhatsAppError extends BaseError {
  constructor(
    message: string,
    code: string,
    public readonly sessionId?: string,
    context?: Record<string, any>
  ) {
    super(message, `WHATSAPP_${code}`, { ...context, sessionId });
  }
}

export class SessionError extends WhatsAppError {
  constructor(message: string, sessionId: string, context?: Record<string, any>) {
    super(message, 'SESSION_ERROR', sessionId, context);
  }
}

export class AuthenticationError extends WhatsAppError {
  constructor(message: string, sessionId: string, context?: Record<string, any>) {
    super(message, 'AUTH_ERROR', sessionId, context);
  }
}

export class ConnectionError extends WhatsAppError {
  constructor(message: string, sessionId?: string, context?: Record<string, any>) {
    super(message, 'CONNECTION_ERROR', sessionId, context);
  }
}

export class MessageError extends WhatsAppError {
  constructor(
    message: string,
    sessionId: string,
    public readonly messageId?: string,
    context?: Record<string, any>
  ) {
    super(message, 'MESSAGE_ERROR', sessionId, { ...context, messageId });
  }
}

/**
 * AI Provider related errors
 */
export class AIProviderError extends BaseError {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly statusCode?: number,
    context?: Record<string, any>
  ) {
    super(message, `AI_${provider.toUpperCase()}_ERROR`, { ...context, provider, statusCode });
  }
}

export class AIRateLimitError extends AIProviderError {
  constructor(provider: string, retryAfter?: number, context?: Record<string, any>) {
    super(`Rate limit exceeded for ${provider}`, provider, 429, { ...context, retryAfter });
  }
}

export class AIQuotaExceededError extends AIProviderError {
  constructor(provider: string, context?: Record<string, any>) {
    super(`Quota exceeded for ${provider}`, provider, 402, context);
  }
}

/**
 * Database related errors
 */
export class DatabaseError extends BaseError {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly table?: string,
    context?: Record<string, any>
  ) {
    super(message, `DATABASE_${operation.toUpperCase()}_ERROR`, { ...context, operation, table });
  }
}

export class ValidationError extends BaseError {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value?: any,
    context?: Record<string, any>
  ) {
    super(message, 'VALIDATION_ERROR', { ...context, field, value });
  }
}

/**
 * Configuration and environment errors
 */
export class ConfigurationError extends BaseError {
  constructor(
    message: string,
    public readonly configKey: string,
    context?: Record<string, any>
  ) {
    super(message, 'CONFIG_ERROR', { ...context, configKey });
  }
}

/**
 * Network and external service errors
 */
export class NetworkError extends BaseError {
  constructor(
    message: string,
    public readonly url?: string,
    public readonly statusCode?: number,
    context?: Record<string, any>
  ) {
    super(message, 'NETWORK_ERROR', { ...context, url, statusCode });
  }
}

/**
 * Circuit breaker related errors
 */
export class CircuitBreakerError extends BaseError {
  constructor(
    public readonly serviceName: string,
    public readonly state: 'OPEN' | 'HALF_OPEN',
    context?: Record<string, any>
  ) {
    super(
      `Circuit breaker is ${state.toLowerCase()} for service ${serviceName}`,
      'CIRCUIT_BREAKER_ERROR',
      { ...context, serviceName, state }
    );
  }
}

/**
 * Type guards for error checking
 */
export const isWhatsAppError = (error: any): error is WhatsAppError => {
  return error instanceof WhatsAppError;
};

export const isAIProviderError = (error: any): error is AIProviderError => {
  return error instanceof AIProviderError;
};

export const isDatabaseError = (error: any): error is DatabaseError => {
  return error instanceof DatabaseError;
};

export const isValidationError = (error: any): error is ValidationError => {
  return error instanceof ValidationError;
};

/**
 * Error factory for creating typed errors
 */
export class ErrorFactory {
  static whatsapp(
    message: string,
    code: string,
    sessionId?: string,
    context?: Record<string, any>
  ) {
    return new WhatsAppError(message, code, sessionId, context);
  }

  static session(message: string, sessionId: string, context?: Record<string, any>) {
    return new SessionError(message, sessionId, context);
  }

  static authentication(message: string, sessionId: string, context?: Record<string, any>) {
    return new AuthenticationError(message, sessionId, context);
  }

  static connection(message: string, sessionId?: string, context?: Record<string, any>) {
    return new ConnectionError(message, sessionId, context);
  }

  static message(
    message: string,
    sessionId: string,
    messageId?: string,
    context?: Record<string, any>
  ) {
    return new MessageError(message, sessionId, messageId, context);
  }

  static aiProvider(
    message: string,
    provider: string,
    statusCode?: number,
    context?: Record<string, any>
  ) {
    return new AIProviderError(message, provider, statusCode, context);
  }

  static database(
    message: string,
    operation: string,
    table?: string,
    context?: Record<string, any>
  ) {
    return new DatabaseError(message, operation, table, context);
  }

  static validation(message: string, field: string, value?: any, context?: Record<string, any>) {
    return new ValidationError(message, field, value, context);
  }

  static configuration(message: string, configKey: string, context?: Record<string, any>) {
    return new ConfigurationError(message, configKey, context);
  }

  static network(
    message: string,
    url?: string,
    statusCode?: number,
    context?: Record<string, any>
  ) {
    return new NetworkError(message, url, statusCode, context);
  }

  static circuitBreaker(
    serviceName: string,
    state: 'OPEN' | 'HALF_OPEN',
    context?: Record<string, any>
  ) {
    return new CircuitBreakerError(serviceName, state, context);
  }
}
