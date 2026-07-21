import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';
import {
  CreateKnowledgeItemDto,
  UpdateKnowledgeItemDto,
} from './dto/create-knowledge-item.dto';

@Injectable()
export class AiAgentsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── B2.7: Agents ──────────────────────────────────────────────

  async findAll(tenantId: string) {
    return this.prisma.aiAgent.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: {
            products: true,
            knowledgeBaseItems: true,
            whatsappSessions: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(tenantId: string, agentId: string) {
    const agent = await this.prisma.aiAgent.findFirst({
      where: { id: agentId, tenantId },
      include: {
        products: { where: { active: true }, orderBy: { createdAt: 'asc' } },
        _count: {
          select: { knowledgeBaseItems: true, whatsappSessions: true },
        },
      },
    });
    if (!agent) throw new NotFoundException('Agent not found');
    return agent;
  }

  async update(tenantId: string, agentId: string, data: UpdateAgentDto) {
    const result = await this.prisma.aiAgent.updateMany({
      where: { id: agentId, tenantId },
      data,
    });
    if (result.count === 0) throw new NotFoundException('Agent not found');
    return this.prisma.aiAgent.findFirst({ where: { id: agentId, tenantId } });
  }

  // ── B2.8: Knowledge Items ─────────────────────────────────────

  private async assertAgentOwnership(tenantId: string, agentId: string) {
    const agent = await this.prisma.aiAgent.findFirst({
      where: { id: agentId, tenantId },
      select: { id: true },
    });
    if (!agent) throw new NotFoundException('Agent not found');
  }

  async findKnowledgeItems(tenantId: string, agentId: string) {
    return this.prisma.ai_knowledge_base.findMany({
      where: { tenantId, agentId },
      orderBy: { priority: 'desc' },
    });
  }

  async createKnowledgeItem(
    tenantId: string,
    agentId: string,
    data: CreateKnowledgeItemDto,
  ) {
    await this.assertAgentOwnership(tenantId, agentId);
    return this.prisma.ai_knowledge_base.create({
      data: {
        tenantId,
        agentId,
        category: data.category,
        title: data.title,
        content: data.content,
        keywords: data.keywords ?? [],
        priority: data.priority ?? 1,
        is_active: data.isActive ?? true,
      },
    });
  }

  async updateKnowledgeItem(
    tenantId: string,
    agentId: string,
    itemId: string,
    data: UpdateKnowledgeItemDto,
  ) {
    await this.assertAgentOwnership(tenantId, agentId);
    const result = await this.prisma.ai_knowledge_base.updateMany({
      where: { id: itemId, tenantId, agentId },
      data: {
        ...(data.category !== undefined && { category: data.category }),
        ...(data.title !== undefined && { title: data.title }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.keywords !== undefined && { keywords: data.keywords }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.isActive !== undefined && { is_active: data.isActive }),
        updated_at: new Date(),
      },
    });
    if (result.count === 0)
      throw new NotFoundException('Knowledge item not found');
    return this.prisma.ai_knowledge_base.findFirst({
      where: { id: itemId, tenantId, agentId },
    });
  }

  async deleteKnowledgeItem(tenantId: string, agentId: string, itemId: string) {
    await this.assertAgentOwnership(tenantId, agentId);
    const result = await this.prisma.ai_knowledge_base.deleteMany({
      where: { id: itemId, tenantId, agentId },
    });
    if (result.count === 0)
      throw new NotFoundException('Knowledge item not found');
  }

  // ── B2.8: Products ────────────────────────────────────────────

  async findProducts(tenantId: string, agentId: string) {
    return this.prisma.aiProduct.findMany({
      where: { tenantId, agentId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createProduct(
    tenantId: string,
    agentId: string,
    data: CreateProductDto,
  ) {
    await this.assertAgentOwnership(tenantId, agentId);
    return this.prisma.aiProduct.create({
      data: {
        tenantId,
        agentId,
        name: data.name,
        description: data.description,
        priceMin: data.priceMin,
        priceMax: data.priceMax,
        url: data.url,
        imageUrl: data.imageUrl,
        tags: data.tags ?? [],
        active: data.active ?? true,
      },
    });
  }

  async updateProduct(
    tenantId: string,
    agentId: string,
    productId: string,
    data: UpdateProductDto,
  ) {
    await this.assertAgentOwnership(tenantId, agentId);
    const result = await this.prisma.aiProduct.updateMany({
      where: { id: productId, tenantId, agentId },
      data,
    });
    if (result.count === 0) throw new NotFoundException('Product not found');
    return this.prisma.aiProduct.findFirst({
      where: { id: productId, tenantId, agentId },
    });
  }

  async deleteProduct(tenantId: string, agentId: string, productId: string) {
    await this.assertAgentOwnership(tenantId, agentId);
    const result = await this.prisma.aiProduct.deleteMany({
      where: { id: productId, tenantId, agentId },
    });
    if (result.count === 0) throw new NotFoundException('Product not found');
  }

  // ── B2.9: Preview ─────────────────────────────────────────────
  // Renders a prompt preview from agent config without cross-app import
  // of SystemPromptService (API and whatsapp-service are separate processes).
  // Accepts minor drift from runtime prompt in exchange for independence.

  async previewPrompt(tenantId: string, agentId: string, message: string) {
    const agent = await this.findOne(tenantId, agentId);

    const knowledgeItems = await this.prisma.ai_knowledge_base.findMany({
      where: { tenantId, agentId, is_active: true },
      orderBy: { priority: 'desc' },
      take: 10,
      select: { category: true, title: true, content: true },
    });

    const toneMap: Record<string, string> = {
      FORMAL: 'Registro formal (usted). Sin emojis.',
      CASUAL: 'Registro informal (tú). Emojis moderados.',
      FRIENDLY: 'Tono cercano y amigable (tú). Emojis bienvenidos.',
      TECHNICAL: 'Lenguaje técnico preciso. Sin emojis.',
    };

    const goalMap: Record<string, string> = {
      REGISTER: 'Guiar al usuario hacia el registro.',
      PURCHASE: 'Guiar al usuario hacia la compra.',
      MEETING: 'Agendar una reunión.',
      CONTACT: 'Facilitar contacto con el equipo.',
      CUSTOM: agent.goalDescription || 'Asistir al usuario.',
    };

    const sections = [
      `Eres ${agent.personaName || 'Asistente'}, asistente virtual de ${agent.businessName}.`,
      agent.industry ? `Sector: ${agent.industry}.` : null,
      agent.websiteUrl ? `Web: ${agent.websiteUrl}` : null,
      `Tono: ${toneMap[agent.tone] || toneMap['FRIENDLY']}`,
      agent.customInstructions
        ? `Instrucciones: ${agent.customInstructions.substring(0, 500)}`
        : null,
      knowledgeItems.length > 0
        ? `Conocimiento (${knowledgeItems.length} items):\n${knowledgeItems.map((k, i) => `${i + 1}. [${k.category}] ${k.title}`).join('\n')}`
        : null,
      agent.products.length > 0
        ? `Productos (${agent.products.length}):\n${agent.products.map((p) => `- ${p.name}${p.priceMin ? ` (${p.priceMin})` : ''}`).join('\n')}`
        : null,
      `Objetivo: ${goalMap[agent.primaryGoal] || goalMap['CONTACT']}`,
      agent.goalCtaUrl ? `CTA: ${agent.goalCtaUrl}` : null,
      `Formato: máx ${agent.responseMaxWords || 80} palabras. ${agent.allowEmojis ? 'Emojis OK.' : 'Sin emojis.'}`,
      `Mensaje de prueba: "${message}"`,
    ].filter(Boolean);

    return {
      prompt: sections.join('\n\n'),
      agentId,
      agentName: agent.name,
      message,
    };
  }
}
