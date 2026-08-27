import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WhitelistService {
  private readonly logger = new Logger(WhitelistService.name);

  constructor(private prisma: PrismaService) {}

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
