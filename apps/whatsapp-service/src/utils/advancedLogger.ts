import winston from 'winston';
import { format } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// ============================================
// INTERFACES Y TIPOS
// ============================================

export interface LogContext {
  sessionId?: string;
  phoneNumber?: string;
  leadId?: string;
  messageId?: string;
  operation?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  [key: string]: any;
}

export interface PerformanceMetrics {
  duration: number;
  memoryUsage?: NodeJS.MemoryUsage;
  cpuUsage?: NodeJS.CpuUsage;
  startTime: number;
  endTime: number;
}

export interface AIDecisionLog {
  messageText: string;
  intent: string;
  confidence: number;
  decision: 'RESPOND' | 'NO_RESPONSE' | 'ESCALATE' | 'DEFER';
  reasons: string[];
  processingTimeMs: number;
  knowledgeUsed: string[];
  contextData: any;
}

export interface SessionEvent {
  sessionId: string;
  eventType: 'CREATED' | 'AUTHENTICATED' | 'READY' | 'DISCONNECTED' | 'ERROR' | 'DESTROYED';
  phoneNumber?: string;
  clientId?: string;
  authState?: 'AUTHENTICATED' | 'PENDING' | 'FAILED' | 'NONE';
  metadata?: any;
  error?: any;
}

export interface AuthenticationEvent {
  sessionId: string;
  authType: 'LOCAL_AUTH' | 'QR_CODE' | 'PAIRING_CODE';
  clientId?: string;
  authDirectory?: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'VALIDATION_ERROR';
  fileStatus?: 'EXISTS' | 'MISSING' | 'CORRUPTED' | 'VALID';
  validationResults?: any;
  error?: any;
}

export interface MessageEvent {
  sessionId: string;
  phoneNumber: string;
  messageId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  messageType: string;
  content?: string;
  timestamp: Date;
  processed: boolean;
  aiResponse?: boolean;
  leadId?: string;
  whitelistStatus?: 'ALLOWED' | 'BLOCKED' | 'PENDING';
}

// ============================================
// LOGGER AVANZADO
// ============================================

class AdvancedLogger {
  private logger: winston.Logger;
  private metricsLogger: winston.Logger;
  private sessionLogger: winston.Logger;
  private aiLogger: winston.Logger;
  private securityLogger: winston.Logger;
  
  // Performance tracking
  private performanceTimers: Map<string, number> = new Map();
  private requestsCounter: Map<string, number> = new Map();
  
  constructor() {
    this.initializeLoggers();
  }

  private initializeLoggers(): void {
    const isProduction = process.env.NODE_ENV === 'production';
    const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');
    const logDir = process.env.LOG_DIR || path.join(process.cwd(), 'logs');

    // Formatters comunes
    const consoleFormat = format.combine(
      format.colorize({ all: true }),
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      format.printf((info) => {
        const { timestamp, level, message, ...meta } = info;
        const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
        return `[${timestamp}] ${level}: ${message}${metaStr}`;
      })
    );

    const fileFormat = format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      format.json()
    );

    // Logger principal
    this.logger = winston.createLogger({
      level: logLevel,
      format: fileFormat,
      defaultMeta: { service: 'whatsapp-service' },
      transports: [
        // Console output
        new winston.transports.Console({
          format: consoleFormat,
          level: 'info'
        }),
        
        // General logs con rotación
        new DailyRotateFile({
          filename: path.join(logDir, 'whatsapp-service-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d',
          level: 'info'
        }),

        // Error logs
        new winston.transports.File({
          filename: path.join(logDir, 'error.log'),
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5
        })
      ],
      exceptionHandlers: [
        new winston.transports.File({ 
          filename: path.join(logDir, 'exceptions.log') 
        })
      ],
      rejectionHandlers: [
        new winston.transports.File({ 
          filename: path.join(logDir, 'rejections.log') 
        })
      ]
    });

    // Logger específico para métricas
    this.metricsLogger = winston.createLogger({
      level: 'info',
      format: format.combine(
        format.timestamp(),
        format.json()
      ),
      defaultMeta: { type: 'metrics' },
      transports: [
        new DailyRotateFile({
          filename: path.join(logDir, 'metrics-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '50m',
          maxFiles: '30d'
        })
      ]
    });

    // Logger específico para sesiones
    this.sessionLogger = winston.createLogger({
      level: 'info',
      format: format.combine(
        format.timestamp(),
        format.json()
      ),
      defaultMeta: { type: 'session' },
      transports: [
        new DailyRotateFile({
          filename: path.join(logDir, 'sessions-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '7d'
        })
      ]
    });

    // Logger específico para decisiones AI
    this.aiLogger = winston.createLogger({
      level: 'info',
      format: format.combine(
        format.timestamp(),
        format.json()
      ),
      defaultMeta: { type: 'ai-decisions' },
      transports: [
        new DailyRotateFile({
          filename: path.join(logDir, 'ai-decisions-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '100m',
          maxFiles: '30d'
        })
      ]
    });

    // Logger específico para seguridad
    this.securityLogger = winston.createLogger({
      level: 'info',
      format: format.combine(
        format.timestamp(),
        format.json()
      ),
      defaultMeta: { type: 'security' },
      transports: [
        new winston.transports.File({
          filename: path.join(logDir, 'security.log'),
          maxsize: 10485760, // 10MB
          maxFiles: 10
        })
      ]
    });
  }

  // ============================================
  // MÉTODOS DE LOGGING BÁSICOS
  // ============================================

  debug(message: string, context?: LogContext): void {
    this.logger.debug(message, { ...context, timestamp: new Date().toISOString() });
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(message, { ...context, timestamp: new Date().toISOString() });
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(message, { ...context, timestamp: new Date().toISOString() });
  }

  error(message: string, error?: any, context?: LogContext): void {
    const errorData = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : error;

    this.logger.error(message, {
      ...context,
      error: errorData,
      timestamp: new Date().toISOString()
    });
  }

  // ============================================
  // LOGGING DE EVENTOS DE SESIÓN
  // ============================================

  logSessionEvent(event: SessionEvent): void {
    this.sessionLogger.info('Session event', {
      ...event,
      timestamp: new Date().toISOString()
    });

    // También log principal para eventos críticos
    if (['ERROR', 'DESTROYED'].includes(event.eventType)) {
      this.error(`Session ${event.eventType}: ${event.sessionId}`, event.error, {
        sessionId: event.sessionId,
        phoneNumber: event.phoneNumber
      });
    }
  }

  // ============================================
  // LOGGING DE AUTENTICACIÓN
  // ============================================

  logAuthenticationEvent(event: AuthenticationEvent): void {
    this.sessionLogger.info('Authentication event', {
      ...event,
      timestamp: new Date().toISOString()
    });

    // Log de seguridad para fallos de autenticación
    if (event.status === 'FAILED') {
      this.securityLogger.warn('Authentication failed', {
        ...event,
        timestamp: new Date().toISOString()
      });
    }
  }

  // ============================================
  // LOGGING DE DECISIONES AI
  // ============================================

  logAIDecision(decision: AIDecisionLog, context?: LogContext): void {
    this.aiLogger.info('AI decision made', {
      ...decision,
      ...context,
      timestamp: new Date().toISOString()
    });

    // También en log principal para decisiones importantes
    const emoji = decision.decision === 'RESPOND' ? '🤖' : '❌';
    this.info(`${emoji} AI Decision: ${decision.decision} (${decision.confidence.toFixed(2)} confidence)`, {
      ...context,
      decision: decision.decision,
      confidence: decision.confidence,
      processingTime: decision.processingTimeMs
    });
  }

  // ============================================
  // LOGGING DE MENSAJES
  // ============================================

  logMessageEvent(event: MessageEvent, context?: LogContext): void {
    this.info(`📱 Message ${event.direction}: ${event.phoneNumber}`, {
      ...event,
      ...context
    });

    // Log de seguridad para mensajes bloqueados
    if (event.whitelistStatus === 'BLOCKED') {
      this.securityLogger.info('Message blocked by whitelist', {
        ...event,
        ...context,
        timestamp: new Date().toISOString()
      });
    }
  }

  // ============================================
  // LOGGING DE PERFORMANCE
  // ============================================

  startPerformanceTimer(operation: string, context?: LogContext): string {
    const timerId = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.performanceTimers.set(timerId, Date.now());
    
    this.debug(`⏱️ Starting operation: ${operation}`, {
      ...context,
      timerId,
      operation
    });

    return timerId;
  }

  endPerformanceTimer(timerId: string, operation: string, context?: LogContext): PerformanceMetrics {
    const startTime = this.performanceTimers.get(timerId);
    const endTime = Date.now();
    
    if (!startTime) {
      this.warn(`Performance timer not found: ${timerId}`, context);
      return {
        duration: 0,
        startTime: endTime,
        endTime,
      };
    }

    const duration = endTime - startTime;
    const memoryUsage = process.memoryUsage();
    
    const metrics: PerformanceMetrics = {
      duration,
      memoryUsage,
      startTime,
      endTime
    };

    // Log performance
    this.metricsLogger.info('Operation completed', {
      operation,
      ...metrics,
      ...context,
      timestamp: new Date().toISOString()
    });

    // Log lento en main logger
    if (duration > 5000) { // > 5 segundos
      this.warn(`🐌 Slow operation: ${operation} took ${duration}ms`, {
        ...context,
        duration,
        operation
      });
    }

    this.performanceTimers.delete(timerId);
    return metrics;
  }

  // ============================================
  // MÉTRICAS Y ESTADÍSTICAS
  // ============================================

  incrementCounter(metric: string, value: number = 1, tags?: Record<string, string>): void {
    const currentCount = this.requestsCounter.get(metric) || 0;
    this.requestsCounter.set(metric, currentCount + value);

    this.metricsLogger.info('Counter incremented', {
      metric,
      value,
      newTotal: currentCount + value,
      tags,
      timestamp: new Date().toISOString()
    });
  }

  recordGauge(metric: string, value: number, tags?: Record<string, string>): void {
    this.metricsLogger.info('Gauge recorded', {
      metric,
      value,
      tags,
      timestamp: new Date().toISOString()
    });
  }

  recordHistogram(metric: string, value: number, tags?: Record<string, string>): void {
    this.metricsLogger.info('Histogram recorded', {
      metric,
      value,
      tags,
      timestamp: new Date().toISOString()
    });
  }

  // ============================================
  // LOGGING DE WHITELIST
  // ============================================

  logWhitelistDecision(decision: {
    phoneNumber: string;
    sessionId?: string;
    decision: 'ALLOWED' | 'BLOCKED';
    reason: string;
    leadId?: string;
    leadName?: string;
    messagePreview?: string;
  }, context?: LogContext): void {
    const emoji = decision.decision === 'ALLOWED' ? '✅' : '🚫';
    
    this.info(`${emoji} Whitelist ${decision.decision}: ${decision.phoneNumber} - ${decision.reason}`, {
      ...context,
      ...decision
    });

    this.securityLogger.info('Whitelist decision', {
      ...decision,
      ...context,
      timestamp: new Date().toISOString()
    });
  }

  // ============================================
  // HEALTH CHECK LOGGING
  // ============================================

  logHealthCheck(sessionId: string, status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY', details: any): void {
    const emoji = status === 'HEALTHY' ? '💚' : status === 'DEGRADED' ? '💛' : '❤️';
    
    this.info(`${emoji} Health Check: ${sessionId} is ${status}`, {
      sessionId,
      status,
      details
    });

    this.metricsLogger.info('Health check result', {
      sessionId,
      status,
      details,
      timestamp: new Date().toISOString()
    });
  }

  // ============================================
  // UTILIDADES
  // ============================================

  flush(): Promise<void> {
    return new Promise((resolve) => {
      let pendingFlushes = 4;
      const checkDone = () => {
        pendingFlushes--;
        if (pendingFlushes === 0) resolve();
      };

      this.logger.on('finish', checkDone);
      this.metricsLogger.on('finish', checkDone);
      this.sessionLogger.on('finish', checkDone);
      this.aiLogger.on('finish', checkDone);

      this.logger.end();
      this.metricsLogger.end();
      this.sessionLogger.end();
      this.aiLogger.end();
    });
  }

  getMetricsSnapshot(): Record<string, any> {
    return {
      counters: Object.fromEntries(this.requestsCounter.entries()),
      activeTimers: this.performanceTimers.size,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }
}

// ============================================
// EXPORT SINGLETON
// ============================================

export const advancedLogger = new AdvancedLogger();
export default advancedLogger;
