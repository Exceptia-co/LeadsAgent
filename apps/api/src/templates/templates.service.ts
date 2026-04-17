import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { TemplatesQueryDto } from './dto/templates-query.dto';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: TemplatesQueryDto) {
    const { category, activeOnly = true } = query;
    const where = {
      ...(category ? { category } : {}),
      ...(activeOnly ? { isActive: true } : {}),
    };

    return this.prisma.messageTemplate.findMany({
      where,
      orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const template = await this.prisma.messageTemplate.findUnique({
      where: { id },
    });
    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }
    return template;
  }

  async create(dto: CreateTemplateDto, createdBy?: string) {
    return this.prisma.messageTemplate.create({
      data: {
        name: dto.name,
        category: dto.category,
        subject: dto.subject,
        content: dto.content,
        variables: dto.variables ?? [],
        createdBy: createdBy ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateTemplateDto) {
    await this.findOne(id);
    return this.prisma.messageTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        category: dto.category,
        subject: dto.subject,
        content: dto.content,
        variables: dto.variables,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.messageTemplate.delete({ where: { id } });
  }

  async preview(id: string, variables: Record<string, string> = {}) {
    const template = await this.findOne(id);
    const rendered = this.renderVariables(template.content, variables);
    return {
      id: template.id,
      name: template.name,
      category: template.category,
      rendered,
      missingVariables: this.findMissingVariables(template.content, variables),
    };
  }

  private renderVariables(
    content: string,
    variables: Record<string, string>,
  ): string {
    return content.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
      const value = variables[key];
      return value !== undefined && value !== null
        ? String(value)
        : `{{${key}}}`;
    });
  }

  private findMissingVariables(
    content: string,
    variables: Record<string, string>,
  ): string[] {
    const matches = content.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g);
    const names = new Set<string>();
    for (const m of matches) {
      names.add(m[1]);
    }
    return Array.from(names).filter((name) => !(name in variables));
  }
}
