import { Controller, Get, Post, Body, Patch, Param, BadRequestException, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger'
import { LeadsService } from './leads.service'
import { CreateLeadDto } from './dto/create-lead.dto'
import { LeadsQueryDto } from './dto/leads-query.dto'

@ApiTags('public')
@Controller('public/leads')
export class PublicLeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get leads statistics (public for testing)' })
  @ApiResponse({ status: 200, description: 'Return leads statistics.' })
  getStats() {
    return this.leadsService.getStats()
  }

  @Get()
  @ApiOperation({ summary: 'Get all leads (public for testing)' })
  @ApiResponse({ status: 200, description: 'Return all leads.' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10)' })
  @ApiQuery({ name: 'q', required: false, type: String, description: 'Search term' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'Filter by status' })
  findAll(@Query() query: LeadsQueryDto) {
    return this.leadsService.findAll(query)
  }

  @Post()
  @ApiOperation({ summary: 'Create a new lead (public for testing)' })
  @ApiResponse({ status: 201, description: 'The lead has been successfully created.' })
  @ApiResponse({ status: 400, description: 'Bad Request - Lead with phone already exists.' })
  async create(@Body() createLeadDto: CreateLeadDto) {
    try {
      return await this.leadsService.create(createLeadDto)
    } catch (error) {
      if (error.message === 'Ya existe un lead con este número de teléfono') {
        throw new BadRequestException(error.message)
      }
      throw error
    }
  }

  @Patch(':id/whatsapp')
  @ApiOperation({ summary: 'Update WhatsApp authorization for a lead (public for testing)' })
  @ApiResponse({ status: 200, description: 'The lead WhatsApp authorization has been updated.' })
  @ApiResponse({ status: 404, description: 'Lead not found.' })
  updateWhatsAppAuth(
    @Param('id') id: string,
    @Body('whatsappAuthorized') whatsappAuthorized: boolean
  ) {
    return this.leadsService.updateWhatsAppAuth(id, whatsappAuthorized)
  }
}
