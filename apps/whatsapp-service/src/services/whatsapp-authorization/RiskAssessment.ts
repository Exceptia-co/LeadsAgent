import { logger } from '../../utils/logger';
import type { AuthorizationConfig } from './RuleEngine';

/**
 * WhatsApp Authorization - Risk Assessment Module
 *
 * Responsible for:
 * - Pattern analysis for phone numbers and fraud detection
 * - Geographic validation and country code checking
 * - Risk factor identification and scoring
 * - Suspicious behavior pattern detection
 */
export class RiskAssessment {
  private static instance: RiskAssessment;

  private constructor() {}

  public static getInstance(): RiskAssessment {
    if (!RiskAssessment.instance) {
      RiskAssessment.instance = new RiskAssessment();
    }
    return RiskAssessment.instance;
  }

  /**
   * Verificar si el número está en la lista blanca explícita
   */
  public async checkExplicitWhitelist(phoneNumber: string): Promise<{
    isAuthorized: boolean;
    reason?: string;
    authorizedBy?: string;
  }> {
    try {
      logger.debug('🔍 Checking explicit whitelist', { phoneNumber });

      // Para la implementación inicial, usaremos una verificación temporal
      // TODO: Implementar consulta real a la base de datos
      const testNumbers = ['34123456789', '34987654321', '1234567890'];

      if (testNumbers.includes(phoneNumber)) {
        logger.debug('✅ Phone number found in test whitelist', { phoneNumber });
        return {
          isAuthorized: true,
          reason: 'Número de prueba autorizado',
          authorizedBy: 'admin',
        };
      }

      return { isAuthorized: false };
    } catch (error) {
      logger.warn('Error verificando lista blanca explícita:', error);
      return { isAuthorized: false };
    }
  }

  /**
   * Verificar patrones sospechosos en el número de teléfono
   */
  public checkSuspiciousPatterns(
    phoneNumber: string,
    config: AuthorizationConfig
  ): {
    isSuspicious: boolean;
    reasons: string[];
    riskScore: number; // 0-1 risk score
  } {
    logger.debug('🔍 Checking suspicious patterns', { phoneNumber });

    const reasons: string[] = [];
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    let riskScore = 0;

    // Verificar números de prueba obvios
    for (const testNumber of config.suspiciousPatterns.obviousTestNumbers) {
      if (cleanNumber.includes(testNumber)) {
        reasons.push(`test-number-pattern: ${testNumber}`);
        riskScore += 0.8; // High risk for test numbers
        logger.debug('⚠️ Test number pattern detected', { pattern: testNumber });
      }
    }

    // Verificar demasiados números consecutivos iguales
    const consecutiveLimit = config.suspiciousPatterns.tooManyConsecutiveNumbers;
    for (let i = 0; i <= cleanNumber.length - consecutiveLimit; i++) {
      const segment = cleanNumber.substring(i, i + consecutiveLimit);
      const uniqueDigits = new Set(segment).size;

      if (uniqueDigits === 1) {
        reasons.push(`consecutive-digits: ${segment}`);
        riskScore += 0.6; // Medium-high risk for consecutive digits
        logger.debug('⚠️ Consecutive digits pattern detected', { pattern: segment });
        break;
      }
    }

    // Verificar patrones secuenciales obvios (123456, 654321)
    const sequenceRisk = this.checkSequentialPatterns(cleanNumber);
    if (sequenceRisk.hasSequences) {
      reasons.push(...sequenceRisk.patterns);
      riskScore += sequenceRisk.riskScore;
    }

    // Verificar longitud sospechosa
    const lengthRisk = this.checkNumberLength(cleanNumber);
    if (lengthRisk.isSuspicious) {
      reasons.push(lengthRisk.reason);
      riskScore += lengthRisk.riskScore;
    }

    // Verificar patrones de repetición
    const repetitionRisk = this.checkRepetitionPatterns(cleanNumber);
    if (repetitionRisk.isSuspicious) {
      reasons.push(...repetitionRisk.reasons);
      riskScore += repetitionRisk.riskScore;
    }

    // Normalizar risk score
    riskScore = Math.min(1, riskScore);

    const isSuspicious = reasons.length > 0;

    if (isSuspicious) {
      logger.warn('🚨 Suspicious patterns detected', {
        phoneNumber,
        reasons,
        riskScore: riskScore.toFixed(3),
      });
    }

    return {
      isSuspicious,
      reasons,
      riskScore,
    };
  }

  /**
   * Verificar código de país del número de teléfono
   */
  public checkCountryCode(
    phoneNumber: string,
    config: AuthorizationConfig
  ): {
    isAllowed: boolean;
    isBlocked: boolean;
    countryCode?: string;
    riskScore: number;
    confidence: number;
  } {
    logger.debug('🌍 Checking country code', { phoneNumber });

    // Detectar código de país
    let detectedCountryCode: string | undefined;
    let confidence = 0;

    // Buscar códigos en orden de longitud (más específicos primero)
    const allCodes = [...config.allowedCountryCodes, ...config.blockedCountryCodes].sort(
      (a, b) => b.length - a.length
    );

    for (const code of allCodes) {
      if (phoneNumber.startsWith(code)) {
        detectedCountryCode = code;
        confidence = code.length >= 3 ? 0.9 : 0.7; // Longer codes are more reliable
        break;
      }
    }

    if (!detectedCountryCode) {
      logger.debug('⚠️ No country code detected', { phoneNumber });
      return {
        isAllowed: false,
        isBlocked: false,
        riskScore: 0.3, // Unknown country is medium risk
        confidence: 0,
      };
    }

    const isBlocked = config.blockedCountryCodes.includes(detectedCountryCode);
    const isAllowed = config.allowedCountryCodes.includes(detectedCountryCode);

    let riskScore = 0;
    if (isBlocked) {
      riskScore = 0.9; // High risk for blocked countries
    } else if (!isAllowed) {
      riskScore = 0.4; // Medium risk for neutral countries
    } else {
      riskScore = 0.1; // Low risk for allowed countries
    }

    logger.debug('🌍 Country code analysis completed', {
      countryCode: detectedCountryCode,
      isAllowed,
      isBlocked,
      riskScore: riskScore.toFixed(3),
      confidence: confidence.toFixed(3),
    });

    return {
      isAllowed,
      isBlocked,
      countryCode: detectedCountryCode,
      riskScore,
      confidence,
    };
  }

  /**
   * Perform comprehensive risk assessment
   */
  public performComprehensiveRiskAssessment(
    phoneNumber: string,
    config: AuthorizationConfig,
    additionalContext?: {
      ipAddress?: string;
      userAgent?: string;
      timeOfDay?: number; // Hour of day (0-23)
      previousAttempts?: number;
    }
  ): {
    overallRiskScore: number;
    riskFactors: string[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    recommendation: 'allow' | 'review' | 'block';
    confidence: number;
  } {
    logger.debug('🔍 Performing comprehensive risk assessment', { phoneNumber });

    const riskFactors: string[] = [];
    let overallRiskScore = 0;

    // Phone number pattern analysis
    const patternRisk = this.checkSuspiciousPatterns(phoneNumber, config);
    if (patternRisk.isSuspicious) {
      riskFactors.push(...patternRisk.reasons);
      overallRiskScore += patternRisk.riskScore * 0.4; // 40% weight
    }

    // Country code analysis
    const countryRisk = this.checkCountryCode(phoneNumber, config);
    if (countryRisk.isBlocked) {
      riskFactors.push('blocked-country');
      overallRiskScore += countryRisk.riskScore * 0.3; // 30% weight
    } else if (!countryRisk.isAllowed) {
      riskFactors.push('unknown-country');
      overallRiskScore += countryRisk.riskScore * 0.2; // 20% weight
    }

    // Additional context analysis
    if (additionalContext) {
      const contextRisk = this.analyzeAdditionalContext(additionalContext);
      riskFactors.push(...contextRisk.factors);
      overallRiskScore += contextRisk.score * 0.3; // 30% weight
    }

    // Normalize risk score
    overallRiskScore = Math.min(1, overallRiskScore);

    // Determine risk level and recommendation
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    let recommendation: 'allow' | 'review' | 'block';

    if (overallRiskScore >= 0.8) {
      riskLevel = 'critical';
      recommendation = 'block';
    } else if (overallRiskScore >= 0.6) {
      riskLevel = 'high';
      recommendation = 'block';
    } else if (overallRiskScore >= 0.4) {
      riskLevel = 'medium';
      recommendation = 'review';
    } else {
      riskLevel = 'low';
      recommendation = 'allow';
    }

    const confidence = this.calculateAssessmentConfidence(phoneNumber, config);

    logger.info('🔍 Risk assessment completed', {
      phoneNumber,
      overallRiskScore: overallRiskScore.toFixed(3),
      riskLevel,
      recommendation,
      confidence: confidence.toFixed(3),
      riskFactorsCount: riskFactors.length,
    });

    return {
      overallRiskScore,
      riskFactors,
      riskLevel,
      recommendation,
      confidence,
    };
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  private checkSequentialPatterns(cleanNumber: string): {
    hasSequences: boolean;
    patterns: string[];
    riskScore: number;
  } {
    const patterns: string[] = [];
    let riskScore = 0;

    for (let i = 0; i <= cleanNumber.length - 6; i++) {
      const segment = cleanNumber.substring(i, i + 6);

      // Secuencia ascendente
      let isAscending = true;
      let isDescending = true;

      for (let j = 1; j < segment.length; j++) {
        const current = parseInt(segment[j]);
        const previous = parseInt(segment[j - 1]);

        if (current !== previous + 1) isAscending = false;
        if (current !== previous - 1) isDescending = false;
      }

      if (isAscending && segment !== '012345') {
        // Excluir 012345 que puede ser válido
        patterns.push(`ascending-sequence: ${segment}`);
        riskScore += 0.5;
        break;
      }

      if (isDescending && segment !== '987654') {
        // Similar para descendente
        patterns.push(`descending-sequence: ${segment}`);
        riskScore += 0.5;
        break;
      }
    }

    return {
      hasSequences: patterns.length > 0,
      patterns,
      riskScore: Math.min(riskScore, 0.7), // Cap at 0.7
    };
  }

  private checkNumberLength(cleanNumber: string): {
    isSuspicious: boolean;
    reason: string;
    riskScore: number;
  } {
    const length = cleanNumber.length;

    // Números demasiado cortos o largos
    if (length < 7) {
      return {
        isSuspicious: true,
        reason: `number-too-short: ${length} digits`,
        riskScore: 0.6,
      };
    }

    if (length > 15) {
      return {
        isSuspicious: true,
        reason: `number-too-long: ${length} digits`,
        riskScore: 0.5,
      };
    }

    return {
      isSuspicious: false,
      reason: '',
      riskScore: 0,
    };
  }

  private checkRepetitionPatterns(cleanNumber: string): {
    isSuspicious: boolean;
    reasons: string[];
    riskScore: number;
  } {
    const reasons: string[] = [];
    let riskScore = 0;

    // Verificar patrones ABAB (ej: 1212, 3434)
    for (let i = 0; i <= cleanNumber.length - 4; i++) {
      const segment = cleanNumber.substring(i, i + 4);
      if (segment[0] === segment[2] && segment[1] === segment[3] && segment[0] !== segment[1]) {
        reasons.push(`abab-pattern: ${segment}`);
        riskScore += 0.3;
        break;
      }
    }

    // Verificar patrones de triple repetición (ej: 111, 222)
    for (let i = 0; i <= cleanNumber.length - 3; i++) {
      const segment = cleanNumber.substring(i, i + 3);
      if (segment[0] === segment[1] && segment[1] === segment[2]) {
        reasons.push(`triple-repetition: ${segment}`);
        riskScore += 0.2;
        break;
      }
    }

    return {
      isSuspicious: reasons.length > 0,
      reasons,
      riskScore: Math.min(riskScore, 0.4), // Cap at 0.4
    };
  }

  private analyzeAdditionalContext(context: {
    ipAddress?: string;
    userAgent?: string;
    timeOfDay?: number;
    previousAttempts?: number;
  }): {
    factors: string[];
    score: number;
  } {
    const factors: string[] = [];
    let score = 0;

    // Analyze time of day patterns
    if (context.timeOfDay !== undefined) {
      // Unusual hours (2-6 AM) might be suspicious
      if (context.timeOfDay >= 2 && context.timeOfDay <= 6) {
        factors.push('unusual-time-of-day');
        score += 0.2;
      }
    }

    // Analyze previous attempts
    if (context.previousAttempts !== undefined) {
      if (context.previousAttempts > 5) {
        factors.push('multiple-previous-attempts');
        score += 0.4;
      } else if (context.previousAttempts > 2) {
        factors.push('some-previous-attempts');
        score += 0.1;
      }
    }

    // Basic IP/User Agent analysis (simplified)
    if (context.ipAddress && this.isIPSuspicious(context.ipAddress)) {
      factors.push('suspicious-ip-pattern');
      score += 0.3;
    }

    if (context.userAgent && this.isUserAgentSuspicious(context.userAgent)) {
      factors.push('suspicious-user-agent');
      score += 0.2;
    }

    return { factors, score };
  }

  private isIPSuspicious(ipAddress: string): boolean {
    // Basic IP analysis - this could be expanded with real IP reputation services
    return ipAddress.startsWith('127.') || ipAddress === '::1' || ipAddress.includes('192.168.');
  }

  private isUserAgentSuspicious(userAgent: string): boolean {
    // Basic User Agent analysis
    const suspiciousPatterns = ['bot', 'crawler', 'spider', 'scraper'];
    return suspiciousPatterns.some(pattern => userAgent.toLowerCase().includes(pattern));
  }

  private calculateAssessmentConfidence(phoneNumber: string, config: AuthorizationConfig): number {
    let confidence = 0.5; // Base confidence

    // Higher confidence for numbers with clear country codes
    const countryCheck = this.checkCountryCode(phoneNumber, config);
    confidence += countryCheck.confidence * 0.3;

    // Higher confidence for numbers with standard length
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanNumber.length >= 10 && cleanNumber.length <= 12) {
      confidence += 0.2;
    }

    return Math.min(1, confidence);
  }
}

export default RiskAssessment.getInstance();
