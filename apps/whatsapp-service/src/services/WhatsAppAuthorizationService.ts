import { logger } from '../utils/logger';
import PhoneNumberService from './PhoneNumberService';
import type { Lead } from './DatabaseService';

// Import modular components
import { RuleEngine } from './whatsapp-authorization/RuleEngine';
import { RiskAssessment } from './whatsapp-authorization/RiskAssessment';
import { LeadValidator } from './whatsapp-authorization/LeadValidator';
import { AuthAuditLogger } from './whatsapp-authorization/AuthAuditLogger';

// Re-export types for compatibility
export type {
  AuthorizationDecision,
  AuthorizationContext,
} from './whatsapp-authorization/RuleEngine';

/**
 * WhatsApp Authorization Service - Modular Architecture
 *
 * Facade pattern that orchestrates 4 specialized modules:
 * - RuleEngine: Authorization rules evaluation & decision logic
 * - RiskAssessment: Pattern detection & risk factor analysis
 * - LeadValidator: Lead lookup & validation logic
 * - AuthAuditLogger: Logging, statistics & configuration management
 *
 * Maintains singleton pattern and existing API.
 */
class WhatsAppAuthorizationService {
  private static instance: WhatsAppAuthorizationService;
  private useModular: boolean;

  // Modular components
  private ruleEngine: RuleEngine;
  private riskAssessment: RiskAssessment;
  private leadValidator: LeadValidator;
  private authAuditLogger: AuthAuditLogger;

  // Configuration cache
  private configCache: any = null;
  private configLastUpdate: number = 0;
  private readonly CONFIG_CACHE_DURATION = 300000; // 5 minutes

  private constructor() {
    // Modular architecture is now the only supported mode
    this.useModular = true;

    logger.info('🔐 WhatsApp Authorization Service Architecture: MODULAR (v2.0)');

    // Always initialize modular components
    this.ruleEngine = RuleEngine.getInstance();
    this.riskAssessment = RiskAssessment.getInstance();
    this.leadValidator = LeadValidator.getInstance();
    this.authAuditLogger = AuthAuditLogger.getInstance();

    // Initialize configuration
    this.loadConfiguration();
  }

  public static getInstance(): WhatsAppAuthorizationService {
    if (!WhatsAppAuthorizationService.instance) {
      WhatsAppAuthorizationService.instance = new WhatsAppAuthorizationService();
    }
    return WhatsAppAuthorizationService.instance;
  }

  // ============================================
  // PUBLIC API METHODS (100% BACKWARD COMPATIBLE)
  // ============================================

  /**
   * Método principal para autorizar un número de teléfono
   */
  public async authorize(
    context: import('./whatsapp-authorization/RuleEngine').AuthorizationContext
  ): Promise<import('./whatsapp-authorization/RuleEngine').AuthorizationDecision> {
    // B2.0-fix (FIX B): fail-closed sin tenant. Este guard debe vivir AQUÍ,
    // antes de authorizeModular — su catch aplica política fail-open (ALLOWED)
    // y anularía cualquier rechazo interno.
    if (!context.tenantId) {
      logger.error(
        `[REFUSED] authorize(${context.phoneNumber}) without tenantId — blocked before RuleEngine (fail-closed).`,
        { sessionId: context.sessionId }
      );
      return {
        decision: 'BLOCKED',
        reason: 'Missing tenant context — blocked by fail-closed policy',
        confidence: 1.0,
        metadata: {
          isKnownLead: false,
          hasWhatsAppAuth: false,
          riskFactors: ['missing-tenant-context'],
          allowanceFactors: [],
        },
      };
    }

    logger.debug('🔄 Using modular authorization components');
    return await this.authorizeModular(context);
  }

  /**
   * Actualizar configuración
   */
  public async updateConfiguration(updates: any): Promise<boolean> {
    logger.debug('🔄 Using modular AuthAuditLogger for updateConfiguration');
    const result = await this.authAuditLogger.updateConfiguration(updates);
    if (result.success) {
      this.configCache = null; // Invalidate cache
      return true;
    }
    return false;
  }

  /**
   * Obtener estadísticas de autorización
   */
  public async getAuthorizationStats(options: any = {}): Promise<any> {
    logger.debug('🔄 Using modular AuthAuditLogger for getAuthorizationStats');
    return await this.authAuditLogger.getAuthorizationStats(options);
  }

  /**
   * Método para autorizar un número y crear/actualizar el lead si es necesario
   */
  public async authorizeAndManageLead(context: any): Promise<any> {
    logger.debug('🔄 Using modular LeadValidator for authorizeAndManageLead');

    // First get authorization decision
    const authorizationDecision = await this.authorize(context);

    // Then manage lead
    const leadResult = await this.leadValidator.authorizeAndManageLead(context, {
      decision: authorizationDecision.decision,
      leadInfo: authorizationDecision.leadInfo,
      metadata: authorizationDecision.metadata,
    });

    return {
      authorization: authorizationDecision,
      ...leadResult,
    };
  }

  // ============================================
  // ENHANCED MODULAR-ONLY METHODS
  // ============================================

  /**
   * Perform comprehensive risk assessment
   */
  public async performRiskAssessment(phoneNumber: string, additionalContext?: any): Promise<any> {
    logger.debug('🔄 Using modular RiskAssessment for performRiskAssessment');
    const config = await this.getConfiguration();
    return await this.riskAssessment.performComprehensiveRiskAssessment(
      phoneNumber,
      config,
      additionalContext
    );
  }

  /**
   * Generate compliance report.
   * PR5a-quater: tenantId required.
   */
  public async generateComplianceReport(options: {
    tenantId: string;
    startDate: Date;
    endDate: Date;
    includePersonalData?: boolean;
  }): Promise<any> {
    logger.debug('🔄 Using modular AuthAuditLogger for generateComplianceReport');
    return await this.authAuditLogger.generateComplianceReport(options);
  }

  /**
   * Validate lead data quality
   */
  public validateLeadDataQuality(lead: Lead): any {
    logger.debug('🔄 Using modular LeadValidator for validateLeadDataQuality');
    return this.leadValidator.validateLeadDataQuality(lead);
  }

  /**
   * Get lead interaction history
   */
  public async getLeadInteractionHistory(leadId: string): Promise<any> {
    logger.debug('🔄 Using modular LeadValidator for getLeadInteractionHistory');
    return await this.leadValidator.getLeadInteractionHistory(leadId);
  }

  // ============================================
  // PRIVATE MODULAR IMPLEMENTATION
  // ============================================

  private async authorizeModular(
    context: import('./whatsapp-authorization/RuleEngine').AuthorizationContext
  ): Promise<import('./whatsapp-authorization/RuleEngine').AuthorizationDecision> {
    const startTime = Date.now();

    logger.info('🔐 Evaluando autorización WhatsApp (Modular)', {
      phoneNumber: context.phoneNumber,
      sessionId: context.sessionId,
      messagePreview: context.messagePreview?.substring(0, 50),
    });

    try {
      // 1. Normalizar número de teléfono
      const normalizedPhone = PhoneNumberService.normalizePhoneNumber(context.phoneNumber);
      const normalizedContext = { ...context, phoneNumber: normalizedPhone };

      // 2. Cargar configuración
      const config = await this.getConfiguration();

      // 3. Buscar información del lead (B2.0: tenant-scoped when tenantId available)
      const leadInfo = await this.leadValidator.findLeadInfo(normalizedPhone, normalizedContext.tenantId ? { tenantId: normalizedContext.tenantId } : undefined);

      // 4. Realizar evaluación de riesgos
      const riskAssessment = {
        isInExplicitWhitelist: await this.riskAssessment.checkExplicitWhitelist(normalizedPhone),
        suspiciousCheck: this.riskAssessment.checkSuspiciousPatterns(normalizedPhone, config),
        countryCheck: this.riskAssessment.checkCountryCode(normalizedPhone, config),
      };

      // 5. Aplicar reglas de autorización
      const decision = await this.ruleEngine.evaluateAuthorizationRules(
        normalizedContext,
        leadInfo,
        config,
        riskAssessment
      );

      // 6. Registrar decisión en logs
      await this.authAuditLogger.logAuthorizationDecision(normalizedContext, decision);

      const processingTime = Date.now() - startTime;

      logger.info(`🔐 Autorización ${decision.decision} (Modular)`, {
        phoneNumber: normalizedPhone,
        reason: decision.reason,
        confidence: decision.confidence,
        processingTime: `${processingTime}ms`,
        leadId: decision.leadInfo?.id,
        riskFactors: decision.metadata?.riskFactors?.length || 0,
      });

      return decision;
    } catch (error) {
      logger.error('❌ Error en autorización WhatsApp (Modular):', error);

      // En caso de error, aplicar política por defecto (permitir con precaución)
      const fallbackDecision: import('./whatsapp-authorization/RuleEngine').AuthorizationDecision =
        {
          decision: 'ALLOWED',
          reason: 'Error en sistema de autorización modular - permitido por defecto con precaución',
          confidence: 0.3,
          metadata: {
            isKnownLead: false,
            hasWhatsAppAuth: false,
            riskFactors: ['system-error-modular'],
            allowanceFactors: ['fallback-policy-modular'],
          },
        };

      if (this.authAuditLogger) {
        await this.authAuditLogger.logAuthorizationDecision(context, fallbackDecision);
      }
      return fallbackDecision;
    }
  }

  private async getConfiguration(): Promise<any> {
    // Check cache first
    if (this.configCache && Date.now() - this.configLastUpdate < this.CONFIG_CACHE_DURATION) {
      return this.configCache;
    }

    // Load fresh configuration
    this.configCache = await this.authAuditLogger.loadConfiguration();
    this.configLastUpdate = Date.now();

    return this.configCache;
  }

  private async loadConfiguration(): Promise<void> {
    try {
      await this.getConfiguration();
      logger.debug('✅ WhatsApp Authorization configuration loaded');
    } catch (error) {
      logger.warn('⚠️ Error loading WhatsApp Authorization configuration:', error);
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Get current architecture mode
   */
  public getArchitectureMode(): 'modular' {
    return 'modular';
  }

  /**
   * Get module health status
   */
  public getModuleHealthStatus(): {
    architecture: 'modular';
    modules: {
      ruleEngine: boolean;
      riskAssessment: boolean;
      leadValidator: boolean;
      authAuditLogger: boolean;
    };
    configCached: boolean;
  } {
    return {
      architecture: 'modular',
      modules: {
        ruleEngine: !!this.ruleEngine,
        riskAssessment: !!this.riskAssessment,
        leadValidator: !!this.leadValidator,
        authAuditLogger: !!this.authAuditLogger,
      },
      configCached: !!this.configCache,
    };
  }
}

// Export singleton instance
export default WhatsAppAuthorizationService.getInstance();
