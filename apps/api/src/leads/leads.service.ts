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

  private async assertActiveLead(id: string): Promise<void> {
    const lead = await this.prisma.lead.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
  }

  async create(createLeadDto: CreateLeadDto) {
    try {
      // Limpiar el número de teléfono - remover el símbolo + si existe
      const cleanedPhone = this.cleanPhone(createLeadDto.phone);

      // Verificar si ya existe un lead con este número
      const existingLead = await this.prisma.lead.findUnique({
        where: { phone: cleanedPhone },
      });

      if (existingLead) {
        throw new ConflictException(
          'Ya existe un lead con este número de teléfono',
        );
      }

      // Crear el lead con el teléfono limpio (sin +)
      const lead = await this.prisma.lead.create({
        data: {
          ...createLeadDto,
          phone: cleanedPhone,
        },
      });

      // Devolver el lead con el formato de teléfono con +
      return this.formatLeadForResponse(lead);
    } catch (error) {
      // Para errores de Prisma, proporcionar mensajes más amigables
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          'Ya existe un lead con este número de teléfono',
        );
      }
      throw error;
    }
  }

  async findAll(query: LeadsQueryDto, assignedUserId?: string) {
    const { page = 1, limit = 10, q, status } = query;
    const skip = (page - 1) * limit;

    const where = {
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
            take: 1, // Get latest message
          },
        },
      }),
      this.prisma.lead.count({ where }),
    ]);

    // Transform data to match frontend expectations
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

  async findOne(id: string) {
    // T4.1: soft delete — treat a soft-deleted lead as not found.
    const lead = await this.prisma.lead.findFirst({
      where: { id, deletedAt: null },
    });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    // Transform data to match frontend expectations
    return this.formatLeadForResponse(lead);
  }

  async update(id: string, updateLeadDto: UpdateLeadDto) {
    await this.assertActiveLead(id);

    const data: UpdateLeadDto = {
      ...updateLeadDto,
      ...(updateLeadDto.phone
        ? { phone: this.cleanPhone(updateLeadDto.phone) }
        : {}),
    };

    try {
      const lead = await this.prisma.lead.update({
        where: { id },
        data,
      });

      // Devolver con el formato de teléfono con +
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

  async remove(id: string) {
    await this.assertActiveLead(id);

    // T4.1: soft delete — marcar `deleted_at` en vez de eliminar la fila.
    // Las tablas relacionadas (messages, proactive_messages,
    // whatsapp_conversations) tienen FK ON DELETE SET NULL, pero al usar
    // soft delete los registros relacionados conservan su lead_id intacto.
    return this.prisma.lead.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async getStats(assignedUserId?: string) {
    // T4.1: soft delete — las estadísticas excluyen leads soft-deleted.
    const where = {
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

    // Calculate average score, default to 0 if no leads have scores
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

  async updateStatus(id: string, status: LeadStatus) {
    await this.assertActiveLead(id);

    const lead = await this.prisma.lead.update({
      where: { id },
      data: { status },
    });

    // Devolver con el formato de teléfono con +
    return this.formatLeadForResponse(lead);
  }

  async updateWhatsAppAuth(id: string, whatsappAuthorized: boolean) {
    await this.assertActiveLead(id);

    await this.prisma.lead.update({
      where: { id },
      data: { whatsappAuthorized },
    });

    return {
      success: true,
      message: `WhatsApp authorization ${whatsappAuthorized ? 'enabled' : 'disabled'} for lead`,
      data: { leadId: id, whatsappAuthorized },
    };
  }
}
