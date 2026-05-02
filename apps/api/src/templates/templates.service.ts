import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { TemplatesQueryDto } from './dto/templates-query.dto';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: TemplatesQueryDto, tenantId: string) {
    const { category, activeOnly = true } = query;
    const where = {
      tenantId,
      ...(category ? { category } : {}),
      ...(activeOnly ? { isActive: true } : {}),
    };

    return this.prisma.messageTemplate.findMany({
      where,
      orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * PR5a: tenant-scoped fetch. Returns 404 (not 403) if the template
   * exists in another tenant — same anti-leak rationale as LeadsService.
   */
  async findOne(id: string, tenantId: string) {
    const template = await this.prisma.messageTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }
    return template;
  }

  async create(dto: CreateTemplateDto, tenantId: string, createdBy?: string) {
    return this.prisma.messageTemplate.create({
      data: {
        name: dto.name,
        category: dto.category,
        subject: dto.subject,
        content: dto.content,
        variables: dto.variables ?? [],
        createdBy: createdBy ?? null,
        tenantId,
      },
    });
  }

  /**
   * PR5a-bis (Codex finding #3): atomic tenant-scoped update via
   * updateMany. One SQL statement, no TOCTOU window.
   */
  async update(id: string, dto: UpdateTemplateDto, tenantId: string) {
    const result = await this.prisma.messageTemplate.updateMany({
      where: { id, tenantId },
      data: {
        name: dto.name,
        category: dto.category,
        subject: dto.subject,
        content: dto.content,
        variables: dto.variables,
        isActive: dto.isActive,
      },
    });
    if (result.count === 0) {
      throw new NotFoundException(`Template ${id} not found`);
    }
    // Re-fetch to return the updated row.
    const template = await this.prisma.messageTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }
    return template;
  }

  /**
   * PR5a-bis: atomic tenant-scoped delete via deleteMany.
   */
  async remove(id: string, tenantId: string) {
    const result = await this.prisma.messageTemplate.deleteMany({
      where: { id, tenantId },
    });
    if (result.count === 0) {
      throw new NotFoundException(`Template ${id} not found`);
    }
    return { success: true, templateId: id };
  }

  async preview(
    id: string,
    tenantId: string,
    variables: Record<string, string> = {},
  ) {
    const template = await this.findOne(id, tenantId);
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
