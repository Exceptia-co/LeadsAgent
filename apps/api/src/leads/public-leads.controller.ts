import { Controller, Get, Post, Body, Patch, Param } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { LeadsService } from './leads.service'
import { CreateLeadDto } from './dto/create-lead.dto'

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
  findAll() {
    return this.leadsService.findAll({})
  }

  @Post()
  @ApiOperation({ summary: 'Create a new lead (public for testing)' })
  @ApiResponse({ status: 201, description: 'The lead has been successfully created.' })
  create(@Body() createLeadDto: CreateLeadDto) {
    return this.leadsService.create(createLeadDto)
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
