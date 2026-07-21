import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhitelistService } from './whitelist.service';
import { signServiceRequest } from './service-auth';
import {
  LeadStatus,
  MessageType,
  MessageDirection,
  MessageStatus,
} from '@prisma/client';

interface WhatsAppMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  timestamp: number;
  type: string;
  isGroup: boolean;
  fromMe: boolean;
}

interface SessionTenantCacheEntry {
  tenantId: string | null;
  expiresAt: number;
}

const SESSION_TENANT_CACHE_TTL_MS = 60_000;

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  // PR5a: lookup cache for sessionId -> tenantId. Single-process; moves to
  // Redis when api goes multi-replica. Negative results (null tenantId) are
  // also cached so we don't re-query for sessions that haven't been
  // backfilled yet, but only for the same TTL — a backfill mid-flight will
  // self-heal in ≤60s.
  private static sessionTenantCache = new Map<
    string,
    SessionTenantCacheEntry
  >();

  constructor(
    private prisma: PrismaService,
    private whitelistService: WhitelistService,
  ) {}

  /**
   * PR5a: resolve the tenant that owns a WhatsApp session. Returns null if
   * the session has no tenantId yet (legacy data pre-backfill).
   */
  async getSessionTenantId(sessionId: string): Promise<string | null> {
    const now = Date.now();
    const cached = WhatsAppService.sessionTenantCache.get(sessionId);
    if (cached && cached.expiresAt > now) {
      return cached.tenantId;
    }

    const session = await this.prisma.whatsAppSession.findUnique({
      where: { sessionId },
      select: { tenantId: true },
    });

    const tenantId = session?.tenantId ?? null;
    WhatsAppService.sessionTenantCache.set(sessionId, {
      tenantId,
      expiresAt: now + SESSION_TENANT_CACHE_TTL_MS,
    });
    return tenantId;
  }

  /**
   * PR5a: enforce that the caller's tenant owns the WhatsApp session.
   * Throws ForbiddenException otherwise. Used by user-initiated send flows
   * (sendMessage controller) so a tenant can't enumerate sessionIds.
   */
  async assertSessionTenant(
    sessionId: string,
    tenantId: string,
  ): Promise<void> {
    const sessionTenantId = await this.getSessionTenantId(sessionId);
    if (sessionTenantId === null) {
      throw new NotFoundException('Session not found');
    }
    if (sessionTenantId !== tenantId) {
      throw new ForbiddenException(
        'Session does not belong to your organization',
      );
    }
  }

  static __resetCachesForTests(): void {
    WhatsAppService.sessionTenantCache.clear();
  }

  async handleIncomingMessage(
    sessionId: string,
    messageData: WhatsAppMessage,
  ): Promise<void> {
    try {
      if (messageData.fromMe) {
        return;
      }

      if (messageData.isGroup) {
        this.logger.log('Skipping group message');
        return;
      }

      const phoneNumber = messageData.from.replace('@c.us', '');

      this.logger.log(
        `Processing message from ${phoneNumber}: ${messageData.body.substring(0, 50)}...`,
      );

      // PR5a: resolve tenant from session BEFORE running whitelist or
      // touching Lead/Message. Pre-backfill sessions return null and are
      // dropped — we don't want to create cross-tenant orphans now that the
      // schema has tenantId.
      const tenantId = await this.getSessionTenantId(sessionId);
      if (!tenantId) {
        this.logger.warn(
          `🚫 Session ${sessionId} has no tenantId — dropping message from ${phoneNumber}. Run B1.9 backfill.`,
        );
        return;
      }

      const whitelistResult = await this.whitelistService.isNumberAuthorized(
        phoneNumber,
        tenantId,
        sessionId,
        messageData.body,
      );

      if (!whitelistResult.allowed) {
        this.logger.warn(
          `🚫 Message from ${phoneNumber} BLOCKED by whitelist: ${whitelistResult.reason}`,
        );
        return;
      }

      this.logger.log(
        `✅ Message from ${phoneNumber} AUTHORIZED: ${whitelistResult.reason}`,
      );

      // PR5a: tenant-scoped lead lookup. findFirst (not findUnique on phone)
      // because PR5b will lift `phone @unique` to composite.
      let lead = await this.prisma.lead.findFirst({
        where: { phone: phoneNumber, tenantId },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!lead) {
        // If the phone collides cross-tenant, the global unique on `phone`
        // (still in place pre-PR5b) will throw P2002 — log it and bail; the
        // operator can resolve the collision manually.
        try {
          lead = await this.prisma.lead.create({
            data: {
              name: `Lead ${phoneNumber}`,
              phone: phoneNumber,
              status: LeadStatus.NUEVO,
              whatsappAuthorized:
                whitelistResult.leadInfo?.whatsappAuthorized ?? true,
              source: 'whatsapp-inbound',
              tenantId,
            },
            include: {
              messages: true,
            },
          });
          this.logger.log(`✅ Created new AUTHORIZED lead for ${phoneNumber}`);
        } catch (error) {
          this.logger.error(
            `Failed to create lead for ${phoneNumber} in tenant ${tenantId}: ${error.message}`,
          );
          return;
        }
      }

      await this.prisma.message.create({
        data: {
          leadId: lead.id,
          tenantId,
          content: messageData.body,
          messageType: MessageType.TEXT,
          direction: MessageDirection.INBOUND,
          status: MessageStatus.READ,
          whatsappMessageId: messageData.id,
          createdAt: new Date(messageData.timestamp),
        },
      });

      if (lead.status === LeadStatus.NUEVO) {
        await this.prisma.lead.updateMany({
          where: { id: lead.id, tenantId, deletedAt: null },
          data: {
            status: LeadStatus.CONTACTADO,
            lastContact: new Date(),
          },
        });
      } else {
        await this.prisma.lead.updateMany({
          where: { id: lead.id, tenantId, deletedAt: null },
          data: { lastContact: new Date() },
        });
      }

      this.logger.log(`✅ Message stored for authorized lead ${lead.id}`);
    } catch (error) {
      this.logger.error('❌ Error handling incoming message:', error);
    }
  }

  private async scopedSessionUpdate(
    sessionId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const tenantId = await this.getSessionTenantId(sessionId);
    if (tenantId) {
      await this.prisma.whatsAppSession.updateMany({
        where: { sessionId, tenantId },
        data,
      });
    } else {
      this.logger.warn(
        `Session ${sessionId} has no tenantId — using unscoped update (pre-backfill legacy)`,
      );
      await this.prisma.whatsAppSession.update({
        where: { sessionId },
        data,
      });
    }
  }

  async handleSessionAuthenticated(
    sessionId: string,
    data: any,
  ): Promise<void> {
    this.logger.log(`Session ${sessionId} authenticated successfully`);
    try {
      await this.scopedSessionUpdate(sessionId, {
        status: 'authenticated',
        lastSeen: new Date(),
        lastError: null,
        connectedNumber: data?.number ?? undefined,
      });
    } catch (error) {
      this.logger.error(
        `Failed to persist authenticated status for ${sessionId}`,
        error,
      );
    }
  }

  async handleSessionDisconnected(sessionId: string, data: any): Promise<void> {
    this.logger.log(`Session ${sessionId} disconnected: ${data?.reason}`);
    try {
      await this.scopedSessionUpdate(sessionId, {
        status: data?.authInvalidated ? 'auth_failure' : 'disconnected',
        lastSeen: new Date(),
        lastError: data?.reason ?? null,
      });
    } catch (error) {
      this.logger.error(
        `Failed to persist disconnected status for ${sessionId}`,
        error,
      );
    }
  }

  async handleStatusChange(sessionId: string, data: any): Promise<void> {
    this.logger.log(`Session ${sessionId} status changed:`, data);
    const nextStatus: string | undefined = data?.status;
    if (!nextStatus) {
      return;
    }
    try {
      await this.scopedSessionUpdate(sessionId, {
        status: nextStatus,
        lastSeen: new Date(),
        lastError:
          nextStatus === 'auth_failure'
            ? (data?.message ?? data?.reason ?? 'auth_failure')
            : null,
      });
    } catch (error) {
      this.logger.error(
        `Failed to persist status change for ${sessionId}`,
        error,
      );
    }
  }

  async sendMessage(
    sessionId: string,
    to: string,
    message: string,
  ): Promise<boolean> {
    try {
      const whatsappServiceUrl =
        process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3002';
      const secret = process.env.WHATSAPP_SERVICE_HMAC_SECRET;
      if (!secret) {
        this.logger.error(
          'WHATSAPP_SERVICE_HMAC_SECRET is not configured — cannot sign outbound request',
        );
        return false;
      }

      // PR5a-bis: bind the session's tenantId into the HMAC payload so
      // the whatsapp-service can authoritatively scope the send by tenant.
      // If the session has no tenantId (legacy pre-backfill) we abort
      // rather than send under an empty tenant claim — the receiver would
      // reject it anyway, this just fails earlier with a clearer log.
      const tenantId = await this.getSessionTenantId(sessionId);
      if (!tenantId) {
        this.logger.error(
          `Cannot send via session ${sessionId}: session has no tenantId. Run B1.9 backfill.`,
        );
        return false;
      }

      const body = JSON.stringify({ to, message });
      const signedHeaders = signServiceRequest(body, secret, tenantId);

      const response = await fetch(
        `${whatsappServiceUrl}/api/sessions/${sessionId}/send`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...signedHeaders,
          },
          body,
        },
      );

      const result = await response.json();

      if (result.success) {
        this.logger.log(`Message sent successfully to ${to}`);

        // PR5a: persist outbound message scoped to the session's tenant.
        // Caller (controller) already validated tenant ownership via
        // assertSessionTenant; we re-derive tenantId here from the session
        // so the writer doesn't depend on caller plumbing.
        const tenantId = await this.getSessionTenantId(sessionId);
        if (!tenantId) {
          this.logger.warn(
            `Outbound to ${to} succeeded but session ${sessionId} has no tenantId — message not persisted`,
          );
          return true;
        }

        const lead = await this.prisma.lead.findFirst({
          where: { phone: to, tenantId },
        });

        if (lead) {
          await this.prisma.message.create({
            data: {
              leadId: lead.id,
              tenantId,
              content: message,
              messageType: MessageType.TEXT,
              direction: MessageDirection.OUTBOUND,
              status: MessageStatus.SENT,
              createdAt: new Date(),
            },
          });

          await this.prisma.lead.updateMany({
            where: { id: lead.id, tenantId, deletedAt: null },
            data: { lastContact: new Date() },
          });
        }

        return true;
      } else {
        this.logger.error(`Failed to send message: ${result.error}`);
        return false;
      }
    } catch (error) {
      this.logger.error('Error sending message:', error);
      return false;
    }
  }
}
