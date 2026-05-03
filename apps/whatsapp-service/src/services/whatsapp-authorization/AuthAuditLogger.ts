import { logger } from '../../utils/logger';
import DatabaseService from '../DatabaseService';
import type {
  AuthorizationContext,
  AuthorizationDecision,
  AuthorizationConfig,
} from './RuleEngine';

/**
 * WhatsApp Authorization - Auth Audit Logger Module
 *
 * Responsible for:
 * - Decision logging and audit trail
 * - Statistics generation and reporting
 * - Configuration management (load/save/update)
 * - Compliance and security monitoring
 */
export class AuthAuditLogger {
  private static instance: AuthAuditLogger;

  private constructor() {}

  public static getInstance(): AuthAuditLogger {
    if (!AuthAuditLogger.instance) {
      AuthAuditLogger.instance = new AuthAuditLogger();
    }
    return AuthAuditLogger.instance;
  }

  /**
   * Registrar la decisión de autorización en los logs
   */
  public async logAuthorizationDecision(
    context: AuthorizationContext,
    decision: AuthorizationDecision
  ): Promise<void> {
    try {
      logger.debug('📝 Logging authorization decision', {
        phoneNumber: context.phoneNumber,
        decision: decision.decision,
        reason: decision.reason,
        confidence: decision.confidence,
      });

      await DatabaseService.logWhitelistDecision({
        phoneNumber: context.phoneNumber,
        sessionId: context.sessionId,
        decision: decision.decision,
        reason: decision.reason,
        leadId: decision.leadInfo?.id,
        leadName: decision.leadInfo?.name,
        messagePreview: context.messagePreview,
        aiProvider: 'whatsapp-auth-service',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      // Also log to application logs for immediate monitoring
      logger.info('🔐 Authorization decision logged', {
        phoneNumber: context.phoneNumber,
        decision: decision.decision,
        confidence: decision.confidence.toFixed(3),
        hasLead: !!decision.leadInfo,
        riskFactors: decision.metadata?.riskFactors?.length || 0,
        allowanceFactors: decision.metadata?.allowanceFactors?.length || 0,
      });
    } catch (error) {
      logger.error('Error guardando log de autorización:', error);

      // Critical error - log to fallback mechanism
      this.logToFallbackMechanism(context, decision, error);
    }
  }

  /**
   * Cargar configuración desde base de datos o variables de entorno
   */
  public async loadConfiguration(): Promise<AuthorizationConfig> {
    logger.debug('📋 Loading authorization configuration');

    // Configuración por defecto.
    //
    // Fase A (2026-04-19): `allowNewLeads` cambiado de `false` a `true` tras
    // prueba real del owner. El bloqueo del default viejo era inconsistente
    // con el objetivo del producto: un SaaS de captación de leads **debe
    // responder a cualquier número nuevo que escriba** (ahí está la capta).
    // Si se quisiera cerrar el acceso (modo support privado), ponga
    // `WHATSAPP_ALLOW_NEW_LEADS=false` en el .env. El default `true` solo
    // afecta al flujo cuando no hay config en DB ni override de entorno.
    let config: AuthorizationConfig = {
      allowKnownLeadsWithAuth: true,
      allowNewLeads: true,
      blockExplicitlyDenied: true,
      allowedCountryCodes: ['+34', '+54', '+52', '+1'], // España, Argentina, México, USA/Canadá
      blockedCountryCodes: [], // Vacío por defecto
      suspiciousPatterns: {
        tooManyConsecutiveNumbers: 6, // ej: 111111, 123456
        obviousTestNumbers: ['123456789', '000000000', '111111111'],
      },
      rateLimits: {
        messagesPerHour: 10,
        messagesPerDay: 50,
      },
    };

    try {
      // Intentar cargar configuración desde base de datos
      const dbConfig = await DatabaseService.getAIConfiguration('whatsapp_auth_config');

      if (dbConfig) {
        const parsedConfig = JSON.parse(dbConfig);
        config = { ...config, ...parsedConfig };
        logger.info('✅ Configuración de autorización WhatsApp cargada desde BD');
      } else {
        logger.info('ℹ️ Using default authorization configuration');
      }
    } catch (error) {
      logger.warn('Error loading database configuration, using defaults:', error);
    }

    // Override con variables de entorno si existen
    config = this.applyEnvironmentOverrides(config);

    logger.debug('📋 Configuration loaded successfully', {
      allowNewLeads: config.allowNewLeads,
      allowedCountries: config.allowedCountryCodes.length,
      blockedCountries: config.blockedCountryCodes.length,
      testNumbersCount: config.suspiciousPatterns.obviousTestNumbers.length,
    });

    return config;
  }

  /**
   * Actualizar configuración
   */
  public async updateConfiguration(updates: Partial<AuthorizationConfig>): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      logger.info('🔄 Updating authorization configuration', updates);

      // Validate configuration updates
      const validationResult = this.validateConfigurationUpdates(updates);
      if (!validationResult.isValid) {
        logger.warn('❌ Invalid configuration updates:', validationResult.errors);
        return { success: false, error: validationResult.errors.join(', ') };
      }

      // Load current config and merge updates
      const currentConfig = await this.loadConfiguration();
      const newConfig = { ...currentConfig, ...updates };

      // Save to database
      await DatabaseService.updateAIConfiguration(
        'whatsapp_auth_config',
        JSON.stringify(newConfig),
        'whatsapp-auth-service'
      );

      logger.info('✅ Configuración de autorización WhatsApp actualizada');
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error actualizando configuración de autorización:', error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Obtener estadísticas de autorización.
   * PR5a-quater: tenantId required to forward to DatabaseService.
   */
  public async getAuthorizationStats(options: {
    tenantId: string;
    startDate?: Date;
    endDate?: Date;
    sessionId?: string;
    includeDetailedBreakdown?: boolean;
  }): Promise<{
    totalDecisions: number;
    allowedCount: number;
    blockedCount: number;
    allowedPercentage: string;
    blockedPercentage: string;
    topReasons: Array<{ reason: string; count: number }>;
    leadBreakdown: {
      knownLeads: number;
      newNumbers: number;
      authorizedLeads: number;
      deniedLeads: number;
    };
    timeDistribution?: Array<{ hour: number; allowed: number; blocked: number }>;
    riskAnalysis?: {
      averageConfidence: number;
      highRiskDecisions: number;
      lowConfidenceDecisions: number;
    };
  }> {
    try {
      logger.debug('📊 Generating authorization statistics', options);

      const stats = await DatabaseService.getWhitelistStats(options);
      const logs = await DatabaseService.getWhitelistLogs({
        ...options,
        limit: options.includeDetailedBreakdown ? 5000 : 1000,
      });

      // Analizar razones más comunes
      const reasonCounts: Record<string, number> = {};
      const leadStats = {
        knownLeads: 0,
        newNumbers: 0,
        authorizedLeads: 0,
        deniedLeads: 0,
      };

      // Time distribution analysis
      const timeDistribution: Array<{ hour: number; allowed: number; blocked: number }> = [];
      if (options.includeDetailedBreakdown) {
        for (let hour = 0; hour < 24; hour++) {
          timeDistribution.push({ hour, allowed: 0, blocked: 0 });
        }
      }

      // Risk analysis
      let totalConfidence = 0;
      let highRiskDecisions = 0;
      let lowConfidenceDecisions = 0;

      logs.forEach(log => {
        // Contar razones
        if (log.reason) {
          reasonCounts[log.reason] = (reasonCounts[log.reason] || 0) + 1;
        }

        // Analizar tipos de leads
        if (log.reason?.includes('Lead conocido')) {
          leadStats.knownLeads++;

          if (log.reason.includes('autorización WhatsApp')) {
            leadStats.authorizedLeads++;
          } else if (log.reason.includes('denegada')) {
            leadStats.deniedLeads++;
          }
        } else if (log.reason?.includes('Nuevo número')) {
          leadStats.newNumbers++;
        }

        // Time distribution
        if (options.includeDetailedBreakdown && log.createdAt) {
          const hour = new Date(log.createdAt).getHours();
          if (log.decision === 'ALLOWED') {
            timeDistribution[hour].allowed++;
          } else {
            timeDistribution[hour].blocked++;
          }
        }

        // Risk analysis (if confidence data available)
        // Note: This would need to be added to the log structure
        const estimatedConfidence = this.estimateConfidenceFromReason(log.reason || '');
        totalConfidence += estimatedConfidence;

        if (log.reason?.includes('sospechoso') || log.reason?.includes('riesgo')) {
          highRiskDecisions++;
        }

        if (estimatedConfidence < 0.5) {
          lowConfidenceDecisions++;
        }
      });

      const topReasons = Object.entries(reasonCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([reason, count]) => ({ reason, count }));

      const result = {
        ...stats,
        topReasons,
        leadBreakdown: leadStats,
      };

      // Add detailed breakdown if requested
      if (options.includeDetailedBreakdown) {
        Object.assign(result, {
          timeDistribution,
          riskAnalysis: {
            averageConfidence: logs.length > 0 ? totalConfidence / logs.length : 0,
            highRiskDecisions,
            lowConfidenceDecisions,
          },
        });
      }

      logger.info('📊 Authorization statistics generated', {
        totalDecisions: stats.totalDecisions,
        allowedPercentage: stats.allowedPercentage,
        topReasonsCount: topReasons.length,
        includeDetailedBreakdown: options.includeDetailedBreakdown,
      });

      return result;
    } catch (error) {
      logger.error('Error obteniendo estadísticas de autorización:', error);
      return {
        totalDecisions: 0,
        allowedCount: 0,
        blockedCount: 0,
        allowedPercentage: '0',
        blockedPercentage: '0',
        topReasons: [],
        leadBreakdown: {
          knownLeads: 0,
          newNumbers: 0,
          authorizedLeads: 0,
          deniedLeads: 0,
        },
      };
    }
  }

  /**
   * Generate compliance report for security audits.
   * PR5a-quater: tenantId is required so the report scopes by tenant.
   */
  public async generateComplianceReport(options: {
    tenantId: string;
    startDate: Date;
    endDate: Date;
    includePersonalData?: boolean;
  }): Promise<{
    reportId: string;
    generatedAt: Date;
    period: { start: Date; end: Date };
    summary: {
      totalDecisions: number;
      complianceScore: number; // 0-100
      securityIncidents: number;
      dataProtectionCompliance: boolean;
    };
    findings: Array<{
      category: 'security' | 'compliance' | 'data-protection' | 'operational';
      severity: 'low' | 'medium' | 'high' | 'critical';
      description: string;
      recommendation: string;
      count: number;
    }>;
    recommendations: string[];
  }> {
    const reportId = `auth-compliance-${Date.now()}`;

    logger.info('📋 Generating compliance report', { reportId, ...options });

    try {
      const stats = await this.getAuthorizationStats({
        tenantId: options.tenantId,
        startDate: options.startDate,
        endDate: options.endDate,
        includeDetailedBreakdown: true,
      });

      const findings: Array<{
        category: 'security' | 'compliance' | 'data-protection' | 'operational';
        severity: 'low' | 'medium' | 'high' | 'critical';
        description: string;
        recommendation: string;
        count: number;
      }> = [];

      const recommendations: string[] = [];

      // Analyze security incidents
      let securityIncidents = 0;
      stats.topReasons.forEach(reason => {
        if (reason.reason.includes('sospechoso') || reason.reason.includes('blocked')) {
          securityIncidents += reason.count;

          if (reason.count > 10) {
            findings.push({
              category: 'security',
              severity: reason.count > 50 ? 'high' : 'medium',
              description: `High frequency of security blocks: ${reason.reason}`,
              recommendation: 'Review and update security patterns',
              count: reason.count,
            });
          }
        }
      });

      // Check compliance score
      const allowedRate = parseInt(stats.allowedPercentage) / 100;
      let complianceScore = 70; // Base score

      if (allowedRate > 0.9) {
        complianceScore -= 10; // Too permissive might be a concern
        recommendations.push('Review authorization criteria - very high approval rate detected');
      } else if (allowedRate < 0.3) {
        complianceScore -= 15; // Too restrictive
        recommendations.push('Consider relaxing authorization criteria - very low approval rate');
      } else {
        complianceScore += 10; // Good balance
      }

      if (securityIncidents < stats.totalDecisions * 0.05) {
        complianceScore += 10; // Low security incidents
      }

      // Data protection compliance
      const dataProtectionCompliance = !options.includePersonalData; // Simplified check

      return {
        reportId,
        generatedAt: new Date(),
        period: { start: options.startDate, end: options.endDate },
        summary: {
          totalDecisions: stats.totalDecisions,
          complianceScore: Math.min(100, Math.max(0, complianceScore)),
          securityIncidents,
          dataProtectionCompliance,
        },
        findings,
        recommendations,
      };
    } catch (error) {
      logger.error('Error generating compliance report:', error);
      throw new Error('Failed to generate compliance report');
    }
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  private applyEnvironmentOverrides(config: AuthorizationConfig): AuthorizationConfig {
    const overrides = { ...config };

    if (process.env.WHATSAPP_ALLOWED_COUNTRIES) {
      overrides.allowedCountryCodes = process.env.WHATSAPP_ALLOWED_COUNTRIES.split(',');
      logger.debug('Applied WHATSAPP_ALLOWED_COUNTRIES override');
    }

    if (process.env.WHATSAPP_BLOCKED_COUNTRIES) {
      overrides.blockedCountryCodes = process.env.WHATSAPP_BLOCKED_COUNTRIES.split(',');
      logger.debug('Applied WHATSAPP_BLOCKED_COUNTRIES override');
    }

    if (process.env.WHATSAPP_ALLOW_NEW_LEADS) {
      overrides.allowNewLeads = process.env.WHATSAPP_ALLOW_NEW_LEADS.toLowerCase() === 'true';
      logger.debug('Applied WHATSAPP_ALLOW_NEW_LEADS override');
    }

    return overrides;
  }

  private validateConfigurationUpdates(updates: Partial<AuthorizationConfig>): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validate country codes
    if (updates.allowedCountryCodes) {
      updates.allowedCountryCodes.forEach(code => {
        if (!code.startsWith('+') || code.length < 2 || code.length > 4) {
          errors.push(`Invalid country code format: ${code}`);
        }
      });
    }

    if (updates.blockedCountryCodes) {
      updates.blockedCountryCodes.forEach(code => {
        if (!code.startsWith('+') || code.length < 2 || code.length > 4) {
          errors.push(`Invalid blocked country code format: ${code}`);
        }
      });
    }

    // Validate suspicious patterns
    if (updates.suspiciousPatterns?.tooManyConsecutiveNumbers) {
      const count = updates.suspiciousPatterns.tooManyConsecutiveNumbers;
      if (count < 3 || count > 10) {
        errors.push('Consecutive numbers limit must be between 3 and 10');
      }
    }

    // Validate rate limits
    if (updates.rateLimits) {
      if (updates.rateLimits.messagesPerHour && updates.rateLimits.messagesPerHour < 1) {
        errors.push('Messages per hour must be at least 1');
      }
      if (updates.rateLimits.messagesPerDay && updates.rateLimits.messagesPerDay < 1) {
        errors.push('Messages per day must be at least 1');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  private estimateConfidenceFromReason(reason: string): number {
    // Estimate confidence based on reason text (simplified)
    if (reason.includes('lista blanca explícita')) return 1.0;
    if (reason.includes('autorización WhatsApp')) return 0.95;
    if (reason.includes('alta conversión')) return 0.8;
    if (reason.includes('proceso')) return 0.65;
    if (reason.includes('sospechoso')) return 0.8; // High confidence it's suspicious
    if (reason.includes('país no permitido')) return 0.85;
    if (reason.includes('perdido')) return 0.7;
    return 0.6; // Default
  }

  private logToFallbackMechanism(
    context: AuthorizationContext,
    decision: AuthorizationDecision,
    error: any
  ): void {
    // Log to file system as fallback
    const fallbackLog = {
      timestamp: new Date().toISOString(),
      phoneNumber: context.phoneNumber,
      decision: decision.decision,
      reason: decision.reason,
      error: error.message,
      fallback: true,
    };

    // In a real implementation, this would write to a file or external logging service
    logger.error('🚨 FALLBACK: Authorization decision logged to fallback mechanism', fallbackLog);
  }
}

export default AuthAuditLogger.getInstance();
