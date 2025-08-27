import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger'
import { LeadsService } from './leads.service'
import { CreateLeadDto } from './dto/create-lead.dto'
import { UpdateLeadDto } from './dto/update-lead.dto'
import { LeadsQueryDto } from './dto/leads-query.dto'
import { ClerkAuthGuard } from '../auth/clerk-auth.guard'
import { CurrentUser } from '../auth/user.decorator'
import { LeadStatus } from '@prisma/client'

@ApiTags('leads')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new lead' })
  @ApiResponse({ status: 201, description: 'The lead has been successfully created.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async create(@Body() createLeadDto: CreateLeadDto, @CurrentUser() user: any) {
    try {
      // If assignedTo is not provided in DTO but user context exists, use it
      if (!createLeadDto.assignedTo && user?.userId) {
        createLeadDto.assignedTo = user.userId
      }
      return await this.leadsService.create(createLeadDto)
    } catch (error) {
      if (error.message === 'Ya existe un lead con este número de teléfono') {
        throw new BadRequestException(error.message)
      }
      throw error
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get all leads with optional filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Return all leads.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiQuery({ name: 'status', required: false, enum: ['NUEVO', 'CONTACTADO', 'QUALIFIED', 'GANADO', 'PERDIDO'] })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  findAll(@Query() query: LeadsQueryDto, @CurrentUser() user: any) {
    return this.leadsService.findAll(query, user.userId)
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get leads statistics' })
  @ApiResponse({ status: 200, description: 'Return leads statistics.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  getStats(@CurrentUser() user: any) {
    return this.leadsService.getStats(user.userId)
  }


  @Get(':id')
  @ApiOperation({ summary: 'Get a lead by ID' })
  @ApiResponse({ status: 200, description: 'Return the lead.' })
  @ApiResponse({ status: 404, description: 'Lead not found.' })
  findOne(@Param('id') id: string) {
    return this.leadsService.findOne(id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a lead' })
  @ApiResponse({ status: 200, description: 'The lead has been successfully updated.' })
  @ApiResponse({ status: 404, description: 'Lead not found.' })
  update(@Param('id') id: string, @Body() updateLeadDto: UpdateLeadDto) {
    return this.leadsService.update(id, updateLeadDto)
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update lead status' })
  @ApiResponse({ status: 200, description: 'The lead status has been successfully updated.' })
  @ApiResponse({ status: 404, description: 'Lead not found.' })
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: LeadStatus
  ) {
    return this.leadsService.updateStatus(id, status)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a lead' })
  @ApiResponse({ status: 204, description: 'The lead has been successfully deleted.' })
  @ApiResponse({ status: 404, description: 'Lead not found.' })
  remove(@Param('id') id: string) {
    return this.leadsService.remove(id)
  }
}
