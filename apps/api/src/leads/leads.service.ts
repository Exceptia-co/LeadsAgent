import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadsQueryDto } from './dto/leads-query.dto';

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  async create(createLeadDto: CreateLeadDto, userId?: string) {
    return this.prisma.lead.create({
      data: {
        ...createLeadDto,
        userId,
      },
    });
  }

  async findAll(query: LeadsQueryDto, userId?: string) {
    const { page = 1, limit = 10, q, status } = query;
    const skip = (page - 1) * limit;

    const where = {
      ...(userId && { userId }),
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { phone: { contains: q, mode: 'insensitive' as const } },
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
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      data: leads,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    return this.prisma.lead.findUniqueOrThrow({
      where: { id },
    });
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

  async getStats(userId?: string) {
    const where = userId ? { userId } : {};

    const [total, newLeads, contacted, hot, warm, cold] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.count({ where: { ...where, status: 'NEW' } }),
      this.prisma.lead.count({ where: { ...where, status: 'CONTACTED' } }),
      this.prisma.lead.count({ where: { ...where, status: 'HOT' } }),
      this.prisma.lead.count({ where: { ...where, status: 'WARM' } }),
      this.prisma.lead.count({ where: { ...where, status: 'COLD' } }),
    ]);

    return {
      total,
      byStatus: {
        NEW: newLeads,
        CONTACTED: contacted,
        HOT: hot,
        WARM: warm,
        COLD: cold,
      },
    };
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.lead.update({
      where: { id },
      data: { status },
    });
  }
}
