import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadsQueryDto } from './dto/leads-query.dto';
import { Lead, LeadStatus, Prisma } from '@prisma/client';

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  private cleanPhone(phone: string): string {
    return phone.replace(/^\+/, '');
  }

  private formatLeadForResponse(lead: Lead) {
    return {
      ...lead,
      phone: lead.phone ? '+' + lead.phone : lead.phone,
      score: lead.moodScore ? Number(lead.moodScore) : null,
    };
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === code
    );
  }

  /**
   * PR5a-bis (Codex finding #3): atomic tenant-scoped mutate. Uses
   * updateMany with composite where {id, tenantId, deletedAt: null}, one
   * SQL statement — no TOCTOU window between an "exists" check and the
   * actual UPDATE. Returns the affected count; callers convert 0 -> 404.
   */
  private async scopedUpdate(
    id: string,
    tenantId: string,
    data: Prisma.LeadUpdateManyMutationInput,
  ): Promise<number> {
    const result = await this.prisma.lead.updateMany({
      where: { id, tenantId, deletedAt: null },
      data,
    });
    return result.count;
  }

  /**
   * PR5a-bis: re-fetch the row after an atomic scopedUpdate so callers can
   * format the response. Tenant-scoped lookup; returns null if not found.
   */
  private async fetchScopedLead(id: string, tenantId: string) {
    return this.prisma.lead.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  }

  async create(createLeadDto: CreateLeadDto, tenantId: string) {
    try {
      const cleanedPhone = this.cleanPhone(createLeadDto.phone);

      // PR5a: phone is still globally unique on the schema. Detecting the
      // collision early gives a friendlier error than the P2002 thrown by
      // Prisma. Until PR5b lifts the global unique into a composite
      // (phone, tenant_id), this also doubles as cross-tenant collision
      // detection — which is acceptable because the `phone` column is
      // shared until then.
      const existingLead = await this.prisma.lead.findUnique({
        where: { phone: cleanedPhone },
      });

      if (existingLead) {
        throw new ConflictException(
          'Ya existe un lead con este número de teléfono',
        );
      }

      const lead = await this.prisma.lead.create({
        data: {
          ...createLeadDto,
          phone: cleanedPhone,
          tenantId,
        },
      });

      return this.formatLeadForResponse(lead);
    } catch (error) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          'Ya existe un lead con este número de teléfono',
        );
      }
      throw error;
    }
  }

  async findAll(
    query: LeadsQueryDto,
    tenantId: string,
    assignedUserId?: string,
  ) {
    const { page = 1, limit = 10, q, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.LeadWhereInput = {
      tenantId,
      // T4.1: soft delete — excluir leads marcados como deleted.
      deletedAt: null,
      ...(assignedUserId && { assignedTo: assignedUserId }),
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { phone: { contains: q, mode: 'insensitive' as const } },
          { email: { contains: q, mode: 'insensitive' as const } },
        ],
      }),
      ...(status && { status }),
    };

    const [leads, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.lead.count({ where }),
    ]);

    const transformedLeads = leads.map((lead) =>
      this.formatLeadForResponse(lead),
    );

    return {
      data: transformedLeads,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async findOne(id: string, tenantId: string) {
    // PR5a: tenant-scoped lookup. soft-deleted treated as not found (T4.1).
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    return this.formatLeadForResponse(lead);
  }

  async update(id: string, updateLeadDto: UpdateLeadDto, tenantId: string) {
    const data: UpdateLeadDto = {
      ...updateLeadDto,
      ...(updateLeadDto.phone
        ? { phone: this.cleanPhone(updateLeadDto.phone) }
        : {}),
    };

    try {
      const count = await this.scopedUpdate(id, tenantId, data);
      if (count === 0) {
        throw new NotFoundException('Lead not found');
      }

      const lead = await this.fetchScopedLead(id, tenantId);
      // count > 0 means the row exists, but soft-delete in flight could
      // theoretically nullify the re-fetch — treat as 404 to be safe.
      if (!lead) {
        throw new NotFoundException('Lead not found');
      }
      return this.formatLeadForResponse(lead);
    } catch (error) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          'Ya existe un lead con este número de teléfono',
        );
      }
      throw error;
    }
  }

  async remove(id: string, tenantId: string) {
    const count = await this.scopedUpdate(id, tenantId, {
      deletedAt: new Date(),
    });
    if (count === 0) {
      throw new NotFoundException('Lead not found');
    }
    return { success: true, leadId: id };
  }

  async getStats(tenantId: string, assignedUserId?: string) {
    const where: Prisma.LeadWhereInput = {
      tenantId,
      deletedAt: null,
      ...(assignedUserId ? { assignedTo: assignedUserId } : {}),
    };

    const [
      total,
      nuevos,
      contactados,
      qualified,
      ganados,
      perdidos,
      averageScoreData,
    ] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.count({ where: { ...where, status: LeadStatus.NUEVO } }),
      this.prisma.lead.count({
        where: { ...where, status: LeadStatus.CONTACTADO },
      }),
      this.prisma.lead.count({
        where: { ...where, status: LeadStatus.QUALIFIED },
      }),
      this.prisma.lead.count({
        where: { ...where, status: LeadStatus.GANADO },
      }),
      this.prisma.lead.count({
        where: { ...where, status: LeadStatus.PERDIDO },
      }),
      this.prisma.lead.aggregate({
        where: { ...where, moodScore: { not: null } },
        _avg: { moodScore: true },
      }),
    ]);

    const averageScore = averageScoreData._avg.moodScore || 0;

    return {
      total,
      averageScore: Number(averageScore.toFixed(1)),
      byStatus: {
        NUEVO: nuevos,
        CONTACTADO: contactados,
        QUALIFIED: qualified,
        GANADO: ganados,
        PERDIDO: perdidos,
      },
    };
  }

  async updateStatus(id: string, status: LeadStatus, tenantId: string) {
    const count = await this.scopedUpdate(id, tenantId, { status });
    if (count === 0) {
      throw new NotFoundException('Lead not found');
    }
    const lead = await this.fetchScopedLead(id, tenantId);
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    return this.formatLeadForResponse(lead);
  }

  async updateWhatsAppAuth(
    id: string,
    whatsappAuthorized: boolean,
    tenantId: string,
  ) {
    const count = await this.scopedUpdate(id, tenantId, { whatsappAuthorized });
    if (count === 0) {
      throw new NotFoundException('Lead not found');
    }

    return {
      success: true,
      message: `WhatsApp authorization ${whatsappAuthorized ? 'enabled' : 'disabled'} for lead`,
      data: { leadId: id, whatsappAuthorized },
    };
  }
}
