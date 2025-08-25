import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadsQueryDto } from './dto/leads-query.dto';
import { LeadStatus } from '@prisma/client';

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  async create(createLeadDto: CreateLeadDto) {
    return this.prisma.lead.create({
      data: createLeadDto,
    });
  }

  async findAll(query: LeadsQueryDto, assignedUserId?: string) {
    const { page = 1, limit = 10, q, status } = query;
    const skip = (page - 1) * limit;

    const where = {
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
    const transformedLeads = leads.map(lead => ({
      ...lead,
      score: lead.moodScore, // Map moodScore to score for frontend
    }));

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
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id },
    });
    
    // Transform data to match frontend expectations
    return {
      ...lead,
      score: lead.moodScore, // Map moodScore to score for frontend
    };
  }

  async update(id: string, updateLeadDto: UpdateLeadDto) {
    return this.prisma.lead.update({
      where: { id },
      data: updateLeadDto,
    });
  }

  async remove(id: string) {
    return this.prisma.lead.delete({
      where: { id },
    });
  }

  async getStats(assignedUserId?: string) {
    const where = assignedUserId ? { assignedTo: assignedUserId } : {};

    const [total, nuevos, contactados, qualified, ganados, perdidos, averageScoreData] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.count({ where: { ...where, status: LeadStatus.NUEVO } }),
      this.prisma.lead.count({ where: { ...where, status: LeadStatus.CONTACTADO } }),
      this.prisma.lead.count({ where: { ...where, status: LeadStatus.QUALIFIED } }),
      this.prisma.lead.count({ where: { ...where, status: LeadStatus.GANADO } }),
      this.prisma.lead.count({ where: { ...where, status: LeadStatus.PERDIDO } }),
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
    return this.prisma.lead.update({
      where: { id },
      data: { status },
    });
  }

  async updateWhatsAppAuth(id: string, whatsappAuthorized: boolean) {
    const lead = await this.prisma.lead.update({
      where: { id },
      data: { whatsappAuthorized },
    });
    
    return {
      success: true,
      message: `WhatsApp authorization ${whatsappAuthorized ? 'enabled' : 'disabled'} for lead`,
      data: { leadId: id, whatsappAuthorized }
    };
  }
}
