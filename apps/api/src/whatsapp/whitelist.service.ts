import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface WhitelistCheckResult {
  allowed: boolean;
  reason: string;
  leadInfo?: {
    id: string;
    name?: string;
    whatsappAuthorized?: boolean;
  };
}

@Injectable()
export class WhitelistService {
  private readonly logger = new Logger(WhitelistService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Quick whitelist check for API webhook - determines if number should create leads.
   *
   * PR5a: tenant-scoped. The caller (WhatsAppService.handleIncomingMessage)
   * resolves tenantId from the session before calling this method, so the
   * lead lookup can never accidentally cross tenants.
   */
  async isNumberAuthorized(
    phoneNumber: string,
    tenantId: string,
    sessionId?: string,
    messagePreview?: string,
  ): Promise<WhitelistCheckResult> {
    try {
      // Normalize phone number (remove WhatsApp suffix if present)
      const cleanPhone = phoneNumber
        .replace(/@c\.us$/, '')
        .replace(/@g\.us$/, '');

      this.logger.debug(
        `🔍 Checking whitelist authorization for: ${cleanPhone}`,
      );

      // 1. Check if lead exists in this tenant. findFirst (not findUnique on
      // phone) so when PR5b lifts `phone @unique` to composite this stays
      // correct without code change.
      const existingLead = await this.prisma.lead.findFirst({
        where: { phone: cleanPhone, tenantId },
        select: {
          id: true,
          name: true,
          whatsappAuthorized: true,
          status: true,
        },
      });

      if (existingLead) {
        // If lead exists with explicit authorization
        if (existingLead.whatsappAuthorized === true) {
          this.logger.log(`✅ Lead ${cleanPhone} explicitly authorized`);
          return {
            allowed: true,
            reason: `Lead autorizado: ${existingLead.name || cleanPhone}`,
            leadInfo: {
              id: existingLead.id,
              name: existingLead.name || undefined,
              whatsappAuthorized: true,
            },
          };
        }

        // If lead exists but is explicitly denied
        if (existingLead.whatsappAuthorized === false) {
          this.logger.log(`🚫 Lead ${cleanPhone} explicitly denied`);
          await this.logWhitelistDecision(
            cleanPhone,
            tenantId,
            sessionId,
            'BLOCKED',
            `Lead con autorización denegada: ${existingLead.name || cleanPhone}`,
            messagePreview,
          );

          return {
            allowed: false,
            reason: `Lead con autorización WhatsApp denegada: ${existingLead.name || cleanPhone}`,
            leadInfo: {
              id: existingLead.id,
              name: existingLead.name || undefined,
              whatsappAuthorized: false,
            },
          };
        }
      }

      // 2. Check for suspicious patterns (newsletters, bots, etc.)
      const suspiciousCheck = this.checkSuspiciousPatterns(
        cleanPhone,
        messagePreview,
      );
      if (suspiciousCheck.isSuspicious) {
        this.logger.log(
          `🚫 Suspicious number blocked: ${cleanPhone} - ${suspiciousCheck.reasons.join(', ')}`,
        );
        await this.logWhitelistDecision(
          cleanPhone,
          tenantId,
          sessionId,
          'BLOCKED',
          `Patrón sospechoso detectado: ${suspiciousCheck.reasons.join(', ')}`,
          messagePreview,
        );

        return {
          allowed: false,
          reason: `Número bloqueado por patrón sospechoso: ${suspiciousCheck.reasons.join(', ')}`,
          leadInfo: existingLead
            ? {
                id: existingLead.id,
                name: existingLead.name || undefined,
                whatsappAuthorized:
                  existingLead.whatsappAuthorized || undefined,
              }
            : undefined,
        };
      }

      // 3. Check environment settings for new leads.
      //
      // Fase A15 bis (2026-04-19): default abierto. Antes la condición era
      // `allowNewLeads = env === 'true'` → si `WHATSAPP_ALLOW_NEW_LEADS` no
      // estaba seteada, `allowNewLeads` era `false` y bloqueaba todo número
      // nuevo. Para un SaaS de captación de leads lo lógico es lo opuesto:
      // default open, cierre explícito si el cliente lo pide poniendo
      // `WHATSAPP_ALLOW_NEW_LEADS=false` en su .env. Coherente con el cambio
      // equivalente en `whatsapp-service/AuthAuditLogger.ts:92`.
      const allowNewLeads =
        process.env.WHATSAPP_ALLOW_NEW_LEADS?.toLowerCase() !== 'false';

      if (!existingLead && !allowNewLeads) {
        this.logger.log(`🚫 New lead creation disabled for: ${cleanPhone}`);
        await this.logWhitelistDecision(
          cleanPhone,
          tenantId,
          sessionId,
          'BLOCKED',
          'Creación de leads nuevos deshabilitada',
          messagePreview,
        );

        return {
          allowed: false,
          reason:
            'Creación automática de leads deshabilitada. Número no reconocido.',
        };
      }

      // 4. Default: Allow with logging for new leads
      if (!existingLead) {
        this.logger.log(
          `✅ New number allowed (will create lead): ${cleanPhone}`,
        );
        await this.logWhitelistDecision(
          cleanPhone,
          tenantId,
          sessionId,
          'ALLOWED',
          'Número nuevo permitido - se creará lead',
          messagePreview,
        );
      } else {
        this.logger.log(
          `✅ Existing lead without explicit auth - allowing: ${cleanPhone}`,
        );
        await this.logWhitelistDecision(
          cleanPhone,
          tenantId,
          sessionId,
          'ALLOWED',
          'Lead existente sin autorización explícita - permitido',
          messagePreview,
        );
      }

      return {
        allowed: true,
        reason: existingLead
          ? 'Lead existente sin restricciones'
          : 'Número nuevo permitido - se creará lead automáticamente',
        leadInfo: existingLead
          ? {
              id: existingLead.id,
              name: existingLead.name || undefined,
              whatsappAuthorized: existingLead.whatsappAuthorized || undefined,
            }
          : undefined,
      };
    } catch (error) {
      this.logger.error('Error in whitelist check:', error);

      // Conservative approach: block on error
      await this.logWhitelistDecision(
        phoneNumber,
        tenantId,
        sessionId,
        'BLOCKED',
        'Error en verificación de whitelist - bloqueado por seguridad',
        messagePreview,
      );

      return {
        allowed: false,
        reason: 'Error en sistema de autorización - bloqueado por seguridad',
      };
    }
  }

  /**
   * Check for suspicious patterns that indicate newsletters, bots, etc.
   */
  private checkSuspiciousPatterns(
    phoneNumber: string,
    messageContent?: string,
  ): {
    isSuspicious: boolean;
    reasons: string[];
  } {
    const reasons: string[] = [];

    // Common newsletter/bot number patterns
    const suspiciousPatterns = [
      // Very short numbers (usually short codes)
      /^[0-9]{1,5}$/,
      // Numbers with too many repeated digits
      /(.)\1{4,}/, // 5 or more consecutive same digits
      // Known test number patterns
      /^(123456789|111111111|000000000|555555555)$/,
      // Sequential patterns
      /012345|123456|234567|345678|456789|987654|876543|765432|654321/,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(phoneNumber)) {
        reasons.push(`pattern-match: ${pattern.source}`);
        break;
      }
    }

    // Check message content for newsletter indicators
    if (messageContent) {
      const newsletterKeywords = [
        /unsubscribe/i,
        /newsletter/i,
        /promotional/i,
        /marketing/i,
        /automated.*message/i,
        /do.*not.*reply/i,
        /this.*is.*automated/i,
      ];

      for (const keyword of newsletterKeywords) {
        if (keyword.test(messageContent)) {
          reasons.push(`newsletter-content: ${keyword.source}`);
          break;
        }
      }
    }

    return {
      isSuspicious: reasons.length > 0,
      reasons,
    };
  }

  /**
   * Log whitelist decision to database. PR5a: persist tenantId so the
   * decision audit log is tenant-scoped (and getWhitelistStats can filter).
   */
  private async logWhitelistDecision(
    phoneNumber: string,
    tenantId: string | null,
    sessionId?: string,
    decision: 'ALLOWED' | 'BLOCKED' = 'BLOCKED',
    reason?: string,
    messagePreview?: string,
  ): Promise<void> {
    try {
      await this.prisma.whatsAppWhitelistLog.create({
        data: {
          phoneNumber,
          tenantId: tenantId || null,
          sessionId: sessionId || null,
          decision,
          reason: reason || null,
          messagePreview: messagePreview?.substring(0, 200) || null,
          createdBy: 'api-webhook',
        },
      });

      this.logger.debug(
        `Logged whitelist decision: ${phoneNumber} -> ${decision}`,
      );
    } catch (error) {
      this.logger.error('Error logging whitelist decision:', error);
      // Don't throw - logging is non-critical
    }
  }

  /**
   * Update lead WhatsApp authorization.
   *
   * PR5a: tenant-scoped. Updating a lead from another tenant returns false
   * (treated as not-found) instead of leaking that the leadId exists.
   */
  async updateLeadAuthorization(
    leadId: string,
    authorized: boolean,
    tenantId: string,
    reason?: string,
  ): Promise<boolean> {
    try {
      // Use updateMany with composite where so a cross-tenant id silently
      // matches 0 rows (no exception, no leak).
      const result = await this.prisma.lead.updateMany({
        where: { id: leadId, tenantId },
        data: {
          whatsappAuthorized: authorized,
          updatedAt: new Date(),
        },
      });

      if (result.count === 0) {
        this.logger.warn(
          `Lead ${leadId} not found in tenant ${tenantId} (or already deleted)`,
        );
        return false;
      }

      this.logger.log(
        `Updated lead ${leadId} WhatsApp authorization: ${authorized} (reason: ${reason ?? 'n/a'})`,
      );
      return true;
    } catch (error) {
      this.logger.error('Error updating lead authorization:', error);
      return false;
    }
  }

  /**
   * Get whitelist statistics for monitoring.
   *
   * PR5a: tenant-scoped. The whatsapp_whitelist_logs table has tenantId
   * (B1 schema) so stats are filtered to the caller's tenant.
   */
  async getWhitelistStats(
    days = 7,
    tenantId?: string,
  ): Promise<{
    total: number;
    allowed: number;
    blocked: number;
    allowedPercentage: number;
    blockedPercentage: number;
  }> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // tenantId is required at runtime (controllers pass it post-PR5a) but
      // typed as optional to keep backwards compatibility for any callers
      // we may have missed. If missing, fall back to global stats and log
      // a warning so we can spot the leak in dev.
      if (!tenantId) {
        this.logger.warn(
          'getWhitelistStats called without tenantId — returning global aggregates (PR5a regression?)',
        );
      }

      const stats = tenantId
        ? await this.prisma.$queryRaw<
            Array<{ decision: string; count: bigint }>
          >`
            SELECT decision, COUNT(*) as count
            FROM whatsapp_whitelist_logs
            WHERE created_at >= ${startDate} AND tenant_id = ${tenantId}::uuid
            GROUP BY decision
          `
        : await this.prisma.$queryRaw<
            Array<{ decision: string; count: bigint }>
          >`
            SELECT decision, COUNT(*) as count
            FROM whatsapp_whitelist_logs
            WHERE created_at >= ${startDate}
            GROUP BY decision
          `;

      let total = 0;
      let allowed = 0;
      let blocked = 0;

      stats.forEach((stat) => {
        const count = Number(stat.count);
        total += count;
        if (stat.decision === 'ALLOWED') {
          allowed = count;
        } else if (stat.decision === 'BLOCKED') {
          blocked = count;
        }
      });

      return {
        total,
        allowed,
        blocked,
        allowedPercentage: total > 0 ? Math.round((allowed / total) * 100) : 0,
        blockedPercentage: total > 0 ? Math.round((blocked / total) * 100) : 0,
      };
    } catch (error) {
      this.logger.error('Error getting whitelist stats:', error);
      return {
        total: 0,
        allowed: 0,
        blocked: 0,
        allowedPercentage: 0,
        blockedPercentage: 0,
      };
    }
  }
}
