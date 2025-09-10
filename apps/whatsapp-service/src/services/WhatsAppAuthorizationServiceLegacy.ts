import { logger } from '../utils/logger';
import DatabaseService, { Lead } from './DatabaseService';
import PhoneNumberService from './PhoneNumberService';

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
  messagePreview?: string;
  timestamp?: Date;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Servicio de autorización de WhatsApp
 * 
 * Este servicio implementa la lógica de whitelist para determinar qué números
 * de teléfono tienen autorización para enviar mensajes a través de WhatsApp.
 */
class WhatsAppAuthorizationService {

  // Configuración por defecto
  private config = {
    // Leads conocidos con autorización explícita
    allowKnownLeadsWithAuth: true,
    
    // Permitir leads nuevos (sin registro previo)
    allowNewLeads: false,
    
    // Bloquear leads con autorización explícitamente denegada
    blockExplicitlyDenied: true,
    
    // Permitir números con ciertos prefijos (ej: España +34)
    allowedCountryCodes: ['+34', '+54', '+52', '+1'], // España, Argentina, México, USA/Canadá
    
    // Bloquear números con prefijos de alto riesgo
    blockedCountryCodes: [], // Vacío por defecto
    
    // Configuración de patrones sospechosos
    suspiciousPatterns: {
      tooManyConsecutiveNumbers: 6, // ej: 111111, 123456
      obviousTestNumbers: ['123456789', '000000000', '111111111']
    },
    
    // Límites de rate limiting (futuro)
    rateLimits: {
      messagesPerHour: 10,
      messagesPerDay: 50
    }
  };

  constructor() {
    // Cargar configuración desde base de datos o variables de entorno
    this.loadConfiguration();
  }

  /**
   * Método principal para autorizar un número de teléfono
   */
  public async authorize(context: AuthorizationContext): Promise<AuthorizationDecision> {
    const startTime = Date.now();
    
    logger.info('🔐 Evaluando autorización WhatsApp', {
      phoneNumber: context.phoneNumber,
      sessionId: context.sessionId,
      messagePreview: context.messagePreview?.substring(0, 50)
    });

    try {
      // 1. Normalizar número de teléfono
      const normalizedPhone = PhoneNumberService.normalizePhoneNumber(context.phoneNumber);
      
      // 2. Buscar información del lead
      const leadInfo = await this.findLeadInfo(normalizedPhone);
      
      // 3. Aplicar reglas de autorización en orden de prioridad
      const decision = await this.evaluateAuthorizationRules({
        ...context,
        phoneNumber: normalizedPhone
      }, leadInfo);
      
      // 4. Registrar decisión en logs
      await this.logAuthorizationDecision(context, decision);
      
      const processingTime = Date.now() - startTime;
      
      logger.info(`🔐 Autorización ${decision.decision}`, {
        phoneNumber: normalizedPhone,
        reason: decision.reason,
        confidence: decision.confidence,
        processingTime: `${processingTime}ms`,
        leadId: decision.leadInfo?.id
      });

      return decision;
      
    } catch (error) {
      logger.error('❌ Error en autorización WhatsApp:', error);
      
      // En caso de error, aplicar política por defecto (permitir con precaución)
      const fallbackDecision: AuthorizationDecision = {
        decision: 'ALLOWED',
        reason: 'Error en sistema de autorización - permitido por defecto con precaución',
        confidence: 0.3,
        metadata: {
          isKnownLead: false,
          hasWhatsAppAuth: false,
          riskFactors: ['system-error'],
          allowanceFactors: ['fallback-policy']
        }
      };
      
      await this.logAuthorizationDecision(context, fallbackDecision);
      return fallbackDecision;
    }
  }

  /**
   * Evaluar las reglas de autorización en orden de prioridad
   */
  private async evaluateAuthorizationRules(
    context: AuthorizationContext, 
    leadInfo: Lead | null
  ): Promise<AuthorizationDecision> {
    
    const riskFactors: string[] = [];
    const allowanceFactors: string[] = [];
    
    // REGLA 0: Verificar lista blanca explícita (máxima prioridad)
    const isInExplicitWhitelist = await this.checkExplicitWhitelist(context.phoneNumber);
    if (isInExplicitWhitelist.isAuthorized) {
      allowanceFactors.push('explicit-whitelist');
      
      return {
        decision: 'ALLOWED',
        reason: `Número en lista blanca explícita: ${isInExplicitWhitelist.reason}`,
        confidence: 1.0,
        leadInfo: leadInfo || undefined,
        metadata: {
          isKnownLead: !!leadInfo,
          hasWhatsAppAuth: true,
          leadStatus: leadInfo?.status,
          riskFactors,
          allowanceFactors
        }
      };
    }
    
    // REGLA 1: Verificar si es un lead conocido con autorización explícita
    if (leadInfo && this.config.allowKnownLeadsWithAuth) {
      if (leadInfo.whatsappAuthorized === true) {
        allowanceFactors.push('known-lead-authorized');
        
        return {
          decision: 'ALLOWED',
          reason: `Lead conocido con autorización WhatsApp: ${leadInfo.name || leadInfo.phone}`,
          confidence: 0.95,
          leadInfo,
          metadata: {
            isKnownLead: true,
            hasWhatsAppAuth: true,
            leadStatus: leadInfo.status,
            riskFactors,
            allowanceFactors
          }
        };
      }
      
      // Si el lead existe pero tiene autorización explícitamente negada
      if (leadInfo.whatsappAuthorized === false && this.config.blockExplicitlyDenied) {
        riskFactors.push('explicitly-denied');
        
        return {
          decision: 'BLOCKED',
          reason: `Lead con autorización WhatsApp denegada: ${leadInfo.name || leadInfo.phone}`,
          confidence: 0.9,
          leadInfo,
          metadata: {
            isKnownLead: true,
            hasWhatsAppAuth: false,
            leadStatus: leadInfo.status,
            riskFactors,
            allowanceFactors
          }
        };
      }
    }

    // REGLA 2: Verificar patrones sospechosos en el número
    const suspiciousCheck = this.checkSuspiciousPatterns(context.phoneNumber);
    if (suspiciousCheck.isSuspicious) {
      riskFactors.push(...suspiciousCheck.reasons);
      
      return {
        decision: 'BLOCKED',
        reason: `Número con patrón sospechoso: ${suspiciousCheck.reasons.join(', ')}`,
        confidence: 0.8,
        leadInfo: leadInfo || undefined,
        metadata: {
          isKnownLead: !!leadInfo,
          hasWhatsAppAuth: leadInfo?.whatsappAuthorized || false,
          leadStatus: leadInfo?.status,
          riskFactors,
          allowanceFactors
        }
      };
    }

    // REGLA 3: Verificar país/código de área
    const countryCheck = this.checkCountryCode(context.phoneNumber);
    if (countryCheck.isBlocked) {
      riskFactors.push('blocked-country-code');
      
      return {
        decision: 'BLOCKED',
        reason: `Código de país no permitido: ${countryCheck.countryCode}`,
        confidence: 0.85,
        leadInfo: leadInfo || undefined,
        metadata: {
          isKnownLead: !!leadInfo,
          hasWhatsAppAuth: leadInfo?.whatsappAuthorized || false,
          leadStatus: leadInfo?.status,
          riskFactors,
          allowanceFactors
        }
      };
    }
    
    if (countryCheck.isAllowed) {
      allowanceFactors.push('allowed-country-code');
    }

    // REGLA 4: Lead conocido pero sin autorización explícita
    if (leadInfo && !leadInfo.whatsappAuthorized) {
      // Evaluar por estado del lead
      if (['GANADO', 'QUALIFIED'].includes(leadInfo.status)) {
        allowanceFactors.push('high-value-lead-status');
        
        return {
          decision: 'ALLOWED',
          reason: `Lead conocido con estado de alta conversión: ${leadInfo.status}`,
          confidence: 0.8,
          leadInfo,
          metadata: {
            isKnownLead: true,
            hasWhatsAppAuth: false,
            leadStatus: leadInfo.status,
            riskFactors,
            allowanceFactors
          }
        };
      }
      
      // Lead conocido pero con estado neutral
      if (['NUEVO', 'CONTACTADO'].includes(leadInfo.status)) {
        allowanceFactors.push('known-lead-neutral-status');
        
        return {
          decision: 'ALLOWED',
          reason: `Lead conocido en proceso: ${leadInfo.status}`,
          confidence: 0.65,
          leadInfo,
          metadata: {
            isKnownLead: true,
            hasWhatsAppAuth: false,
            leadStatus: leadInfo.status,
            riskFactors,
            allowanceFactors
          }
        };
      }
      
      // Lead marcado como PERDIDO
      if (leadInfo.status === 'PERDIDO') {
        riskFactors.push('lost-lead-status');
        
        return {
          decision: 'BLOCKED',
          reason: 'Lead marcado como perdido - comunicación no deseada',
          confidence: 0.7,
          leadInfo,
          metadata: {
            isKnownLead: true,
            hasWhatsAppAuth: false,
            leadStatus: leadInfo.status,
            riskFactors,
            allowanceFactors
          }
        };
      }
    }

    // REGLA 5: Nuevo número (no es un lead conocido)
    if (!leadInfo && this.config.allowNewLeads) {
      allowanceFactors.push('new-lead-policy');
      
      return {
        decision: 'ALLOWED',
        reason: 'Nuevo número - permitido por política de leads nuevos',
        confidence: 0.5,
        leadInfo: undefined,
        metadata: {
          isKnownLead: false,
          hasWhatsAppAuth: false,
          riskFactors,
          allowanceFactors
        }
      };
    }

    // REGLA POR DEFECTO: Bloquear si no coincide con ninguna regla anterior
    riskFactors.push('no-matching-rule');
    
    return {
      decision: 'BLOCKED',
      reason: 'Número no autorizado - no cumple con criterios de autorización',
      confidence: 0.6,
      leadInfo: leadInfo || undefined,
      metadata: {
        isKnownLead: !!leadInfo,
        hasWhatsAppAuth: leadInfo?.whatsappAuthorized || false,
        leadStatus: leadInfo?.status,
        riskFactors,
        allowanceFactors
      }
    };
  }

  /**
   * Verificar si el número está en la lista blanca explícita
   */
  private async checkExplicitWhitelist(phoneNumber: string): Promise<{
    isAuthorized: boolean;
    reason?: string;
    authorizedBy?: string;
  }> {
    try {
      // Para la implementación inicial, usaremos una verificación temporal
      // TODO: Implementar consulta real a la base de datos
      const testNumbers = ['34123456789', '34987654321', '1234567890'];
      
      if (testNumbers.includes(phoneNumber)) {
        return {
          isAuthorized: true,
          reason: 'Número de prueba autorizado',
          authorizedBy: 'admin'
        };
      }
      
      return { isAuthorized: false };
      
    } catch (error) {
      logger.warn('Error verificando lista blanca explícita:', error);
      return { isAuthorized: false };
    }
  }

  /**
   * Buscar información del lead asociado al número
   */
  private async findLeadInfo(phoneNumber: string): Promise<Lead | null> {
    try {
      return await DatabaseService.findLeadByPhone(phoneNumber);
    } catch (error) {
      logger.warn('Error buscando información del lead:', error);
      return null;
    }
  }

  /**
   * Verificar patrones sospechosos en el número de teléfono
   */
  private checkSuspiciousPatterns(phoneNumber: string): {
    isSuspicious: boolean;
    reasons: string[];
  } {
    const reasons: string[] = [];
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    
    // Verificar números de prueba obvios
    for (const testNumber of this.config.suspiciousPatterns.obviousTestNumbers) {
      if (cleanNumber.includes(testNumber)) {
        reasons.push(`test-number-pattern: ${testNumber}`);
      }
    }
    
    // Verificar demasiados números consecutivos iguales
    const consecutiveLimit = this.config.suspiciousPatterns.tooManyConsecutiveNumbers;
    for (let i = 0; i <= cleanNumber.length - consecutiveLimit; i++) {
      const segment = cleanNumber.substring(i, i + consecutiveLimit);
      const uniqueDigits = new Set(segment).size;
      
      if (uniqueDigits === 1) {
        reasons.push(`consecutive-digits: ${segment}`);
        break;
      }
    }
    
    // Verificar patrones secuenciales obvios (123456, 654321)
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
      
      if (isAscending && segment !== '012345') { // Excluir 012345 que puede ser válido
        reasons.push(`ascending-sequence: ${segment}`);
        break;
      }
      
      if (isDescending && segment !== '987654') { // Similar para descendente
        reasons.push(`descending-sequence: ${segment}`);
        break;
      }
    }
    
    return {
      isSuspicious: reasons.length > 0,
      reasons
    };
  }

  /**
   * Verificar código de país del número de teléfono
   */
  private checkCountryCode(phoneNumber: string): {
    isAllowed: boolean;
    isBlocked: boolean;
    countryCode?: string;
  } {
    // Detectar código de país
    let detectedCountryCode: string | undefined;
    
    for (const code of [...this.config.allowedCountryCodes, ...this.config.blockedCountryCodes]) {
      if (phoneNumber.startsWith(code)) {
        detectedCountryCode = code;
        break;
      }
    }
    
    if (!detectedCountryCode) {
      return { isAllowed: false, isBlocked: false };
    }
    
    const isBlocked = this.config.blockedCountryCodes.includes(detectedCountryCode);
    const isAllowed = this.config.allowedCountryCodes.includes(detectedCountryCode);
    
    return {
      isAllowed,
      isBlocked,
      countryCode: detectedCountryCode
    };
  }

  /**
   * Registrar la decisión de autorización en los logs
   */
  private async logAuthorizationDecision(
    context: AuthorizationContext, 
    decision: AuthorizationDecision
  ): Promise<void> {
    try {
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
        userAgent: context.userAgent
      });
    } catch (error) {
      logger.error('Error guardando log de autorización:', error);
    }
  }

  /**
   * Cargar configuración desde base de datos o variables de entorno
   */
  private async loadConfiguration(): Promise<void> {
    try {
      // Intentar cargar configuración desde base de datos
      const dbConfig = await DatabaseService.getAIConfiguration('whatsapp_auth_config');
      
      if (dbConfig) {
        const parsedConfig = JSON.parse(dbConfig);
        this.config = { ...this.config, ...parsedConfig };
        logger.info('✅ Configuración de autorización WhatsApp cargada desde BD');
      }
      
    } catch (error) {
      logger.warn('Usando configuración por defecto para autorización WhatsApp');
    }
    
    // Override con variables de entorno si existen
    if (process.env.WHATSAPP_ALLOWED_COUNTRIES) {
      this.config.allowedCountryCodes = process.env.WHATSAPP_ALLOWED_COUNTRIES.split(',');
    }
    
    if (process.env.WHATSAPP_BLOCKED_COUNTRIES) {
      this.config.blockedCountryCodes = process.env.WHATSAPP_BLOCKED_COUNTRIES.split(',');
    }
    
    if (process.env.WHATSAPP_ALLOW_NEW_LEADS) {
      this.config.allowNewLeads = process.env.WHATSAPP_ALLOW_NEW_LEADS.toLowerCase() === 'true';
    }
  }

  /**
   * Actualizar configuración
   */
  public async updateConfiguration(updates: Partial<typeof this.config>): Promise<boolean> {
    try {
      this.config = { ...this.config, ...updates };
      
      // Guardar en base de datos
      await DatabaseService.updateAIConfiguration(
        'whatsapp_auth_config',
        JSON.stringify(this.config),
        'whatsapp-auth-service'
      );
      
      logger.info('✅ Configuración de autorización WhatsApp actualizada');
      return true;
    } catch (error) {
      logger.error('Error actualizando configuración de autorización:', error);
      return false;
    }
  }

  /**
   * Obtener estadísticas de autorización
   */
  public async getAuthorizationStats(options: {
    startDate?: Date;
    endDate?: Date;
    sessionId?: string;
  } = {}): Promise<{
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
  }> {
    try {
      const stats = await DatabaseService.getWhitelistStats(options);
      const logs = await DatabaseService.getWhitelistLogs({
        ...options,
        limit: 1000 // Obtener más logs para análisis detallado
      });
      
      // Analizar razones más comunes
      const reasonCounts: Record<string, number> = {};
      const leadStats = {
        knownLeads: 0,
        newNumbers: 0,
        authorizedLeads: 0,
        deniedLeads: 0
      };
      
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
      });
      
      const topReasons = Object.entries(reasonCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([reason, count]) => ({ reason, count }));
      
      return {
        ...stats,
        topReasons,
        leadBreakdown: leadStats
      };
      
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
          deniedLeads: 0
        }
      };
    }
  }

  /**
   * Método para autorizar un número y crear/actualizar el lead si es necesario
   */
  public async authorizeAndManageLead(context: AuthorizationContext & {
    contactName?: string;
    leadSource?: string;
  }): Promise<{
    authorization: AuthorizationDecision;
    leadCreated?: boolean;
    leadUpdated?: boolean;
    lead?: Lead;
  }> {
    const authorization = await this.authorize(context);
    let leadCreated = false;
    let leadUpdated = false;
    let lead = authorization.leadInfo;

    // Si es un número permitido pero no es un lead conocido, crear el lead
    if (authorization.decision === 'ALLOWED' && !authorization.metadata?.isKnownLead) {
      try {
        const newLead = await DatabaseService.createLead({
          name: context.contactName || null,
          phone: context.phoneNumber,
          source: context.leadSource || 'whatsapp',
          status: 'NUEVO'
        });
        
        if (newLead) {
          lead = newLead;
          leadCreated = true;
          logger.info(`✅ Lead creado automáticamente: ${newLead.phone}`);
        }
      } catch (error) {
        logger.warn('No se pudo crear lead automáticamente:', error);
      }
    }
    
    // Si es un lead existente y fue autorizado, actualizar su estado de WhatsApp
    if (authorization.decision === 'ALLOWED' && authorization.metadata?.isKnownLead && lead) {
      if (lead.whatsappAuthorized !== true) {
        const updated = await DatabaseService.updateLeadWhatsAppAuth(lead.id, true);
        if (updated) {
          leadUpdated = true;
          lead.whatsappAuthorized = true;
          logger.info(`✅ Autorización WhatsApp actualizada para lead: ${lead.id}`);
        }
      }
    }

    return {
      authorization,
      leadCreated,
      leadUpdated,
      lead
    };
  }
}

// Exportar instancia singleton
export default new WhatsAppAuthorizationService();
