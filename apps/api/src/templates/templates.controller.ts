import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/user.decorator';
import { CreateTemplateDto } from './dto/create-template.dto';
import { PreviewTemplateDto } from './dto/preview-template.dto';
import { TemplatesQueryDto } from './dto/templates-query.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { TemplatesService } from './templates.service';

@ApiTags('templates')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'List message templates' })
  @ApiResponse({
    status: 200,
    description: 'Returns templates filtered by category/active state.',
  })
  async findAll(@Query() query: TemplatesQueryDto) {
    const data = await this.templatesService.findAll(query);
    return { success: true, data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single template by id' })
  @ApiResponse({ status: 200, description: 'Template found.' })
  @ApiResponse({ status: 404, description: 'Template not found.' })
  async findOne(@Param('id') id: string) {
    const data = await this.templatesService.findOne(id);
    return { success: true, data };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new template' })
  @ApiResponse({ status: 201, description: 'Template created.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  async create(@Body() dto: CreateTemplateDto, @CurrentUser() user: any) {
    const data = await this.templatesService.create(dto, user?.userId);
    return { success: true, data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing template' })
  @ApiResponse({ status: 200, description: 'Template updated.' })
  @ApiResponse({ status: 404, description: 'Template not found.' })
  async update(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    const data = await this.templatesService.update(id, dto);
    return { success: true, data };
  }

  // Legacy alias: prior whatsapp-service routes used PUT; clients still
  // sending PUT (e.g. non-migrated pages) land here instead of 404.
  @Put(':id')
  @ApiOperation({ summary: 'Update an existing template (legacy PUT)' })
  @ApiResponse({ status: 200, description: 'Template updated.' })
  async updateLegacy(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a template' })
  @ApiResponse({ status: 200, description: 'Template deleted.' })
  @ApiResponse({ status: 404, description: 'Template not found.' })
  async remove(@Param('id') id: string) {
    await this.templatesService.remove(id);
    return { success: true };
  }

  @Post(':id/preview')
  @ApiOperation({ summary: 'Preview template with variable substitution' })
  @ApiResponse({
    status: 200,
    description: 'Rendered preview + missing variables.',
  })
  @ApiResponse({ status: 404, description: 'Template not found.' })
  async preview(@Param('id') id: string, @Body() dto: PreviewTemplateDto) {
    const data = await this.templatesService.preview(id, dto.variables ?? {});
    return { success: true, data };
  }
}
