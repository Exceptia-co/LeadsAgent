import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { CurrentUser } from '../auth/user.decorator';
import { AiAgentsService } from './ai-agents.service';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';
import {
  CreateKnowledgeItemDto,
  UpdateKnowledgeItemDto,
} from './dto/create-knowledge-item.dto';

@UseGuards(ClerkAuthGuard, TenantContextGuard)
@Controller('ai-agents')
export class AiAgentsController {
  constructor(private readonly service: AiAgentsService) {}

  // ── B2.7: Agents ──────────────────────────────────────────────

  @Get()
  async findAll(@CurrentUser() user: { tenantId?: string }) {
    const data = await this.service.findAll(user.tenantId!);
    return { success: true, data };
  }

  @Get(':agentId')
  async findOne(
    @Param('agentId') agentId: string,
    @CurrentUser() user: { tenantId?: string },
  ) {
    const data = await this.service.findOne(user.tenantId!, agentId);
    return { success: true, data };
  }

  @Put(':agentId')
  async update(
    @Param('agentId') agentId: string,
    @Body() dto: UpdateAgentDto,
    @CurrentUser() user: { tenantId?: string },
  ) {
    const data = await this.service.update(user.tenantId!, agentId, dto);
    return { success: true, data };
  }

  // ── B2.8: Knowledge Items ─────────────────────────────────────

  @Get(':agentId/knowledge-items')
  async findKnowledgeItems(
    @Param('agentId') agentId: string,
    @CurrentUser() user: { tenantId?: string },
  ) {
    const data = await this.service.findKnowledgeItems(user.tenantId!, agentId);
    return { success: true, data };
  }

  @Post(':agentId/knowledge-items')
  async createKnowledgeItem(
    @Param('agentId') agentId: string,
    @Body() dto: CreateKnowledgeItemDto,
    @CurrentUser() user: { tenantId?: string },
  ) {
    const data = await this.service.createKnowledgeItem(
      user.tenantId!,
      agentId,
      dto,
    );
    return { success: true, data };
  }

  @Put(':agentId/knowledge-items/:itemId')
  async updateKnowledgeItem(
    @Param('agentId') agentId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateKnowledgeItemDto,
    @CurrentUser() user: { tenantId?: string },
  ) {
    const data = await this.service.updateKnowledgeItem(
      user.tenantId!,
      agentId,
      itemId,
      dto,
    );
    return { success: true, data };
  }

  @Delete(':agentId/knowledge-items/:itemId')
  async deleteKnowledgeItem(
    @Param('agentId') agentId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: { tenantId?: string },
  ) {
    await this.service.deleteKnowledgeItem(user.tenantId!, agentId, itemId);
    return { success: true };
  }

  // ── B2.8: Products ────────────────────────────────────────────

  @Get(':agentId/products')
  async findProducts(
    @Param('agentId') agentId: string,
    @CurrentUser() user: { tenantId?: string },
  ) {
    const data = await this.service.findProducts(user.tenantId!, agentId);
    return { success: true, data };
  }

  @Post(':agentId/products')
  async createProduct(
    @Param('agentId') agentId: string,
    @Body() dto: CreateProductDto,
    @CurrentUser() user: { tenantId?: string },
  ) {
    const data = await this.service.createProduct(user.tenantId!, agentId, dto);
    return { success: true, data };
  }

  @Put(':agentId/products/:productId')
  async updateProduct(
    @Param('agentId') agentId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: { tenantId?: string },
  ) {
    const data = await this.service.updateProduct(
      user.tenantId!,
      agentId,
      productId,
      dto,
    );
    return { success: true, data };
  }

  @Delete(':agentId/products/:productId')
  async deleteProduct(
    @Param('agentId') agentId: string,
    @Param('productId') productId: string,
    @CurrentUser() user: { tenantId?: string },
  ) {
    await this.service.deleteProduct(user.tenantId!, agentId, productId);
    return { success: true };
  }

  // ── B2.9: Preview ─────────────────────────────────────────────

  @Post(':agentId/preview')
  async previewPrompt(
    @Param('agentId') agentId: string,
    @Body('message') message: string,
    @CurrentUser() user: { tenantId?: string },
  ) {
    const data = await this.service.previewPrompt(
      user.tenantId!,
      agentId,
      message || 'Hola',
    );
    return { success: true, data };
  }
}
