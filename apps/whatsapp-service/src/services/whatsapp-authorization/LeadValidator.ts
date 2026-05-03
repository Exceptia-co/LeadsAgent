import { logger } from '../../utils/logger';
import type { Lead } from '../DatabaseService';
import DatabaseService from '../DatabaseService';
import PhoneNumberService from '../PhoneNumberService';
import type { AuthorizationContext } from './RuleEngine';

/**
 * WhatsApp Authorization - Lead Validator Module
 *
 * Responsible for:
 * - Lead lookup and validation logic
 * - Explicit whitelist verification
 * - Lead status evaluation and authorization checking
 * - Lead management integration and automatic lead creation
 */
export class LeadValidator {
  private static instance: LeadValidator;

  private constructor() {}

  public static getInstance(): LeadValidator {
    if (!LeadValidator.instance) {
      LeadValidator.instance = new LeadValidator();
    }
    return LeadValidator.instance;
  }

  /**
   * Buscar información del lead asociado al número
   */
  public async findLeadInfo(phoneNumber: string, opts?: { tenantId?: string }): Promise<Lead | null> {
    try {
      logger.debug('🔍 Looking up lead information', { phoneNumber });

      const normalizedPhone = PhoneNumberService.normalizePhoneNumber(phoneNumber);

      const lead = await DatabaseService.findLeadByPhone(normalizedPhone, opts?.tenantId ? { tenantId: opts.tenantId } : undefined);

      if (lead) {
        logger.debug('✅ Lead found', {
          leadId: lead.id,
          name: lead.name,
          status: lead.status,
          whatsappAuth: lead.whatsappAuthorized,
        });
      } else {
        logger.debug('ℹ️ No lead found for phone number', { phoneNumber: normalizedPhone });
      }

      return lead;
    } catch (error) {
      logger.warn('Error buscando información del lead:', error);
      return null;
    }
  }

  /**
   * Validar el estado de autorización de un lead
   */
  public validateLeadAuthorization(lead: Lead): {
    isAuthorized: boolean;
    status: 'explicitly-authorized' | 'explicitly-denied' | 'status-based' | 'neutral';
    confidence: number;
    reasoning: string;
  } {
    logger.debug('🔍 Validating lead authorization', {
      leadId: lead.id,
      whatsappAuth: lead.whatsappAuthorized,
      status: lead.status,
    });

    // Explicit authorization
    if (lead.whatsappAuthorized === true) {
      return {
        isAuthorized: true,
        status: 'explicitly-authorized',
        confidence: 0.95,
        reasoning: 'Lead has explicit WhatsApp authorization',
      };
    }

    // Explicit denial
    if (lead.whatsappAuthorized === false) {
      return {
        isAuthorized: false,
        status: 'explicitly-denied',
        confidence: 0.9,
        reasoning: 'Lead has explicit WhatsApp authorization denial',
      };
    }

    // Status-based evaluation
    const statusAuth = this.evaluateLeadByStatus(lead);
    return {
      isAuthorized: statusAuth.isAuthorized,
      status: 'status-based',
      confidence: statusAuth.confidence,
      reasoning: statusAuth.reasoning,
    };
  }

  /**
   * Método para autorizar un número y crear/actualizar el lead si es necesario
   */
  public async authorizeAndManageLead(
    context: AuthorizationContext & {
      contactName?: string;
      leadSource?: string;
    },
    authorizationDecision: {
      decision: 'ALLOWED' | 'BLOCKED';
      leadInfo?: Lead;
      metadata?: {
        isKnownLead: boolean;
      };
    }
  ): Promise<{
    leadCreated?: boolean;
    leadUpdated?: boolean;
    lead?: Lead;
    error?: string;
  }> {
    let leadCreated = false;
    let leadUpdated = false;
    let lead = authorizationDecision.leadInfo;

    logger.debug('🔧 Managing lead for authorization', {
      phoneNumber: context.phoneNumber,
      decision: authorizationDecision.decision,
      isKnownLead: authorizationDecision.metadata?.isKnownLead,
      hasContactName: !!context.contactName,
    });

    // Si es un número permitido pero no es un lead conocido, crear el lead
    if (
      authorizationDecision.decision === 'ALLOWED' &&
      !authorizationDecision.metadata?.isKnownLead
    ) {
      try {
        const createResult = await this.createLeadFromAuthorization(context);
        if (createResult.success && createResult.lead) {
          lead = createResult.lead;
          leadCreated = true;
          logger.info(`✅ Lead creado automáticamente: ${createResult.lead.phone}`, {
            leadId: createResult.lead.id,
            source: context.leadSource,
          });
        } else {
          logger.warn('No se pudo crear lead automáticamente:', createResult.error);
          return { error: createResult.error };
        }
      } catch (error) {
        logger.warn('Error creating lead automatically:', error);
        return { error: 'Failed to create lead automatically' };
      }
    }

    // Si es un lead existente y fue autorizado, actualizar su estado de WhatsApp
    if (
      authorizationDecision.decision === 'ALLOWED' &&
      authorizationDecision.metadata?.isKnownLead &&
      lead
    ) {
      if (lead.whatsappAuthorized !== true) {
        const updateResult = await this.updateLeadWhatsAppAuthorization(lead.id, true, context.tenantId ? { tenantId: context.tenantId } : undefined);
        if (updateResult.success) {
          leadUpdated = true;
          lead.whatsappAuthorized = true;
          logger.info(`✅ Autorización WhatsApp actualizada para lead: ${lead.id}`);
        } else {
          logger.warn(
            `❌ Error updating WhatsApp authorization for lead ${lead.id}:`,
            updateResult.error
          );
        }
      }
    }

    return {
      leadCreated,
      leadUpdated,
      lead,
    };
  }

  /**
   * Validate lead data quality and completeness
   */
  public validateLeadDataQuality(lead: Lead): {
    score: number; // 0-1 quality score
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 0.5; // Base score

    // Check for required fields
    if (lead.phone) {
      score += 0.2;
    } else {
      issues.push('missing-phone-number');
    }

    if (lead.name && lead.name.trim().length > 0) {
      score += 0.2;
    } else {
      issues.push('missing-name');
      recommendations.push('Add contact name for better personalization');
    }

    if (lead.email && lead.email.includes('@')) {
      score += 0.1;
    } else {
      issues.push('missing-or-invalid-email');
      recommendations.push('Collect email for multi-channel communication');
    }

    // Check for valid status
    const validStatuses = ['NUEVO', 'CONTACTADO', 'QUALIFIED', 'PERDIDO', 'GANADO'];
    if (validStatuses.includes(lead.status)) {
      score += 0.1;
    } else {
      issues.push('invalid-status');
    }

    // Check for recent activity
    if (lead.lastContact) {
      const daysSinceContact = (Date.now() - lead.lastContact.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceContact <= 30) {
        score += 0.1;
      } else if (daysSinceContact > 90) {
        issues.push('stale-contact-date');
        recommendations.push('Update contact information with recent interaction');
      }
    } else {
      issues.push('missing-last-contact');
    }

    // Check for assigned user
    if (lead.assignedTo) {
      score += 0.05;
    } else {
      recommendations.push('Assign lead to team member for follow-up');
    }

    // Check for tags/categorization
    if (lead.tags && lead.tags.length > 0) {
      score += 0.05;
    } else {
      recommendations.push('Add tags for better lead categorization');
    }

    return {
      score: Math.min(1, score),
      issues,
      recommendations,
    };
  }

  /**
   * Get lead interaction history and patterns
   */
  public async getLeadInteractionHistory(leadId: string): Promise<{
    totalInteractions: number;
    lastInteractionDate?: Date;
    interactionFrequency: 'high' | 'medium' | 'low';
    preferredChannels: string[];
    engagementScore: number; // 0-1
  }> {
    try {
      // This would integrate with conversation/message history
      // For now, return basic structure
      const conversations = await DatabaseService.getConversationHistory(leadId, 100);

      const totalInteractions = conversations.length;
      const lastInteractionDate =
        conversations.length > 0
          ? new Date(Math.max(...conversations.map(c => c.createdAt.getTime())))
          : undefined;

      // Calculate interaction frequency
      let interactionFrequency: 'high' | 'medium' | 'low' = 'low';
      if (totalInteractions > 20) {
        interactionFrequency = 'high';
      } else if (totalInteractions > 5) {
        interactionFrequency = 'medium';
      }

      // Analyze preferred channels (simplified)
      const channelCounts = new Map<string, number>();
      conversations.forEach(conv => {
        const channel = conv.messageType || 'unknown';
        channelCounts.set(channel, (channelCounts.get(channel) || 0) + 1);
      });

      const preferredChannels = Array.from(channelCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([channel]) => channel);

      // Calculate engagement score
      const avgResponseRate =
        conversations.filter(c => c.responseText).length / Math.max(totalInteractions, 1);
      const recentActivity = lastInteractionDate
        ? Math.max(0, 1 - (Date.now() - lastInteractionDate.getTime()) / (1000 * 60 * 60 * 24 * 30)) // 30 days
        : 0;

      const engagementScore = avgResponseRate * 0.6 + recentActivity * 0.4;

      return {
        totalInteractions,
        lastInteractionDate,
        interactionFrequency,
        preferredChannels,
        engagementScore,
      };
    } catch (error) {
      logger.error('Error getting lead interaction history:', error);
      return {
        totalInteractions: 0,
        interactionFrequency: 'low',
        preferredChannels: [],
        engagementScore: 0,
      };
    }
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  private evaluateLeadByStatus(lead: Lead): {
    isAuthorized: boolean;
    confidence: number;
    reasoning: string;
  } {
    switch (lead.status) {
      case 'GANADO':
      case 'QUALIFIED':
        return {
          isAuthorized: true,
          confidence: 0.8,
          reasoning: `Lead with high-value status: ${lead.status}`,
        };

      case 'NUEVO':
      case 'CONTACTADO':
        return {
          isAuthorized: true,
          confidence: 0.65,
          reasoning: `Lead in active process: ${lead.status}`,
        };

      case 'PERDIDO':
        return {
          isAuthorized: false,
          confidence: 0.7,
          reasoning: 'Lead marked as lost - communication not desired',
        };

      default:
        return {
          isAuthorized: false,
          confidence: 0.5,
          reasoning: `Unknown lead status: ${lead.status}`,
        };
    }
  }

  private async createLeadFromAuthorization(
    context: AuthorizationContext & {
      contactName?: string;
      leadSource?: string;
    }
  ): Promise<{
    success: boolean;
    lead?: Lead;
    error?: string;
  }> {
    try {
      const lead = await DatabaseService.createLead({
        name: context.contactName || null,
        phone: context.phoneNumber,
        source: context.leadSource || 'whatsapp',
        status: 'NUEVO',
      }, context.tenantId ? { tenantId: context.tenantId } : undefined);

      if (lead) {
        return { success: true, lead };
      } else {
        return { success: false, error: 'Failed to create lead in database' };
      }
    } catch (error) {
      logger.error('Error creating lead from authorization:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error creating lead',
      };
    }
  }

  private async updateLeadWhatsAppAuthorization(
    leadId: string,
    authorized: boolean,
    opts?: { tenantId?: string }
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const result = await DatabaseService.updateLeadWhatsAppAuth(leadId, authorized, opts);
      return { success: result };
    } catch (error) {
      logger.error('Error updating lead WhatsApp authorization:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error updating lead',
      };
    }
  }
}

export default LeadValidator.getInstance();
