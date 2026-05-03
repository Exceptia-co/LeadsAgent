import { logger } from '../../utils/logger';
import type { Lead } from '../DatabaseService';

export interface AuthorizationDecision {
  decision: 'ALLOWED' | 'BLOCKED';
  reason: string;
  confidence: number; // 0-1
  leadInfo?: Lead;
  metadata?: {
    isKnownLead: boolean;
    hasWhatsAppAuth: boolean;
    leadStatus?: string;
    riskFactors: string[];
    allowanceFactors: string[];
  };
}

export interface AuthorizationContext {
  phoneNumber: string;
  sessionId?: string;
  tenantId?: string;
  messagePreview?: string;
  timestamp?: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthorizationConfig {
  allowKnownLeadsWithAuth: boolean;
  allowNewLeads: boolean;
  blockExplicitlyDenied: boolean;
  allowedCountryCodes: string[];
  blockedCountryCodes: string[];
  suspiciousPatterns: {
    tooManyConsecutiveNumbers: number;
    obviousTestNumbers: string[];
  };
  rateLimits: {
    messagesPerHour: number;
    messagesPerDay: number;
  };
}

/**
 * WhatsApp Authorization - Rule Engine Module
 *
 * Responsible for:
 * - Core authorization rules evaluation and decision logic
 * - Decision tree processing (whitelist, lead status, country codes)
 * - Confidence scoring and metadata generation
 * - Rule prioritization and fallback handling
 */
export class RuleEngine {
  private static instance: RuleEngine;

  private constructor() {}

  public static getInstance(): RuleEngine {
    if (!RuleEngine.instance) {
      RuleEngine.instance = new RuleEngine();
    }
    return RuleEngine.instance;
  }

  /**
   * Evaluar las reglas de autorización en orden de prioridad
   */
  public async evaluateAuthorizationRules(
    context: AuthorizationContext,
    leadInfo: Lead | null,
    config: AuthorizationConfig,
    riskAssessment: {
      isInExplicitWhitelist: { isAuthorized: boolean; reason?: string; authorizedBy?: string };
      suspiciousCheck: { isSuspicious: boolean; reasons: string[] };
      countryCheck: { isAllowed: boolean; isBlocked: boolean; countryCode?: string };
    }
  ): Promise<AuthorizationDecision> {
    const riskFactors: string[] = [];
    const allowanceFactors: string[] = [];

    logger.debug('🔐 Evaluating authorization rules', {
      phoneNumber: context.phoneNumber,
      hasLead: !!leadInfo,
      leadStatus: leadInfo?.status,
      inWhitelist: riskAssessment.isInExplicitWhitelist.isAuthorized,
      isSuspicious: riskAssessment.suspiciousCheck.isSuspicious,
      countryAllowed: riskAssessment.countryCheck.isAllowed,
    });

    // REGLA 0: Verificar lista blanca explícita (máxima prioridad)
    if (riskAssessment.isInExplicitWhitelist.isAuthorized) {
      allowanceFactors.push('explicit-whitelist');

      return this.createDecision(
        'ALLOWED',
        `Número en lista blanca explícita: ${riskAssessment.isInExplicitWhitelist.reason}`,
        1.0,
        leadInfo,
        riskFactors,
        allowanceFactors
      );
    }

    // REGLA 1: Verificar si es un lead conocido con autorización explícita
    const leadDecision = this.evaluateLeadRules(leadInfo, config, riskFactors, allowanceFactors);
    if (leadDecision) {
      return leadDecision;
    }

    // REGLA 2: Verificar patrones sospechosos en el número
    if (riskAssessment.suspiciousCheck.isSuspicious) {
      riskFactors.push(...riskAssessment.suspiciousCheck.reasons);

      return this.createDecision(
        'BLOCKED',
        `Número con patrón sospechoso: ${riskAssessment.suspiciousCheck.reasons.join(', ')}`,
        0.8,
        leadInfo,
        riskFactors,
        allowanceFactors
      );
    }

    // REGLA 3: Verificar país/código de área
    if (riskAssessment.countryCheck.isBlocked) {
      riskFactors.push('blocked-country-code');

      return this.createDecision(
        'BLOCKED',
        `Código de país no permitido: ${riskAssessment.countryCheck.countryCode}`,
        0.85,
        leadInfo,
        riskFactors,
        allowanceFactors
      );
    }

    if (riskAssessment.countryCheck.isAllowed) {
      allowanceFactors.push('allowed-country-code');
    }

    // REGLA 4: Lead conocido pero sin autorización explícita
    const leadStatusDecision = this.evaluateLeadStatusRules(
      leadInfo,
      riskFactors,
      allowanceFactors
    );
    if (leadStatusDecision) {
      return leadStatusDecision;
    }

    // REGLA 5: Nuevo número (no es un lead conocido)
    if (!leadInfo && config.allowNewLeads) {
      allowanceFactors.push('new-lead-policy');

      return this.createDecision(
        'ALLOWED',
        'Nuevo número - permitido por política de leads nuevos',
        0.5,
        undefined,
        riskFactors,
        allowanceFactors
      );
    }

    // REGLA POR DEFECTO: Bloquear si no coincide con ninguna regla anterior
    riskFactors.push('no-matching-rule');

    return this.createDecision(
      'BLOCKED',
      'Número no autorizado - no cumple con criterios de autorización',
      0.6,
      leadInfo,
      riskFactors,
      allowanceFactors
    );
  }

  /**
   * Evaluar reglas específicas para leads conocidos con autorización explícita
   */
  private evaluateLeadRules(
    leadInfo: Lead | null,
    config: AuthorizationConfig,
    riskFactors: string[],
    allowanceFactors: string[]
  ): AuthorizationDecision | null {
    if (leadInfo && config.allowKnownLeadsWithAuth) {
      if (leadInfo.whatsappAuthorized === true) {
        allowanceFactors.push('known-lead-authorized');

        return this.createDecision(
          'ALLOWED',
          `Lead conocido con autorización WhatsApp: ${leadInfo.name || leadInfo.phone}`,
          0.95,
          leadInfo,
          riskFactors,
          allowanceFactors
        );
      }

      // Si el lead existe pero tiene autorización explícitamente negada
      if (leadInfo.whatsappAuthorized === false && config.blockExplicitlyDenied) {
        riskFactors.push('explicitly-denied');

        return this.createDecision(
          'BLOCKED',
          `Lead con autorización WhatsApp denegada: ${leadInfo.name || leadInfo.phone}`,
          0.9,
          leadInfo,
          riskFactors,
          allowanceFactors
        );
      }
    }

    return null;
  }

  /**
   * Evaluar reglas basadas en el estado del lead
   */
  private evaluateLeadStatusRules(
    leadInfo: Lead | null,
    riskFactors: string[],
    allowanceFactors: string[]
  ): AuthorizationDecision | null {
    if (leadInfo && !leadInfo.whatsappAuthorized) {
      // Evaluar por estado del lead
      if (['GANADO', 'QUALIFIED'].includes(leadInfo.status)) {
        allowanceFactors.push('high-value-lead-status');

        return this.createDecision(
          'ALLOWED',
          `Lead conocido con estado de alta conversión: ${leadInfo.status}`,
          0.8,
          leadInfo,
          riskFactors,
          allowanceFactors
        );
      }

      // Lead conocido pero con estado neutral
      if (['NUEVO', 'CONTACTADO'].includes(leadInfo.status)) {
        allowanceFactors.push('known-lead-neutral-status');

        return this.createDecision(
          'ALLOWED',
          `Lead conocido en proceso: ${leadInfo.status}`,
          0.65,
          leadInfo,
          riskFactors,
          allowanceFactors
        );
      }

      // Lead marcado como PERDIDO
      if (leadInfo.status === 'PERDIDO') {
        riskFactors.push('lost-lead-status');

        return this.createDecision(
          'BLOCKED',
          'Lead marcado como perdido - comunicación no deseada',
          0.7,
          leadInfo,
          riskFactors,
          allowanceFactors
        );
      }
    }

    return null;
  }

  /**
   * Helper method to create consistent decision objects
   */
  private createDecision(
    decision: 'ALLOWED' | 'BLOCKED',
    reason: string,
    confidence: number,
    leadInfo: Lead | undefined,
    riskFactors: string[],
    allowanceFactors: string[]
  ): AuthorizationDecision {
    return {
      decision,
      reason,
      confidence,
      leadInfo,
      metadata: {
        isKnownLead: !!leadInfo,
        hasWhatsAppAuth: leadInfo?.whatsappAuthorized || false,
        leadStatus: leadInfo?.status,
        riskFactors,
        allowanceFactors,
      },
    };
  }

  /**
   * Calculate overall authorization confidence based on multiple factors
   */
  public calculateAuthorizationConfidence(
    decision: AuthorizationDecision,
    additionalFactors?: {
      leadAge?: number; // days since lead creation
      interactionHistory?: number; // number of previous interactions
      fraudScore?: number; // 0-1 fraud probability
    }
  ): number {
    let confidence = decision.confidence;

    if (additionalFactors) {
      // Adjust confidence based on lead age
      if (additionalFactors.leadAge !== undefined) {
        if (additionalFactors.leadAge > 30) {
          confidence += 0.05; // Older leads are more trustworthy
        } else if (additionalFactors.leadAge < 1) {
          confidence -= 0.1; // Very new leads are less trustworthy
        }
      }

      // Adjust confidence based on interaction history
      if (additionalFactors.interactionHistory !== undefined) {
        if (additionalFactors.interactionHistory > 5) {
          confidence += 0.1; // More interactions increase trust
        }
      }

      // Adjust confidence based on fraud score
      if (additionalFactors.fraudScore !== undefined) {
        confidence -= additionalFactors.fraudScore * 0.3; // High fraud score reduces confidence
      }
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Get detailed rule evaluation breakdown for debugging/auditing
   */
  public getEvaluationBreakdown(
    _context: AuthorizationContext,
    leadInfo: Lead | null,
    config: AuthorizationConfig
  ): {
    appliedRules: string[];
    skippedRules: string[];
    factorsConsidered: string[];
    recommendedActions: string[];
  } {
    const appliedRules: string[] = [];
    const skippedRules: string[] = [];
    const factorsConsidered: string[] = [];
    const recommendedActions: string[] = [];

    // Analyze which rules would apply
    factorsConsidered.push('phone-number-format', 'lead-existence', 'authorization-status');

    if (leadInfo) {
      appliedRules.push('lead-lookup');
      factorsConsidered.push('lead-status', 'whatsapp-authorization');

      if (leadInfo.whatsappAuthorized === true) {
        appliedRules.push('explicit-authorization');
      } else if (leadInfo.whatsappAuthorized === false) {
        appliedRules.push('explicit-denial');
      } else {
        appliedRules.push('status-based-evaluation');
      }
    } else {
      skippedRules.push('lead-evaluation');

      if (config.allowNewLeads) {
        appliedRules.push('new-lead-policy');
      } else {
        recommendedActions.push('Consider enabling allowNewLeads policy');
      }
    }

    appliedRules.push('suspicious-pattern-check', 'country-code-validation');
    factorsConsidered.push('geographic-restrictions', 'pattern-analysis');

    return {
      appliedRules,
      skippedRules,
      factorsConsidered,
      recommendedActions,
    };
  }
}

export default RuleEngine.getInstance();
