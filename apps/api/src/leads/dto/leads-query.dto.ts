import { IsOptional, IsString, IsIn, IsNumberString } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { LeadStatus } from '@prisma/client'

export class LeadsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by lead status',
    enum: ['NUEVO', 'CONTACTADO', 'QUALIFIED', 'GANADO', 'PERDIDO']
  })
  @IsOptional()
  @IsIn(['NUEVO', 'CONTACTADO', 'QUALIFIED', 'GANADO', 'PERDIDO'])
  status?: LeadStatus

  @ApiPropertyOptional({
    description: 'Search query for name or phone',
    example: 'Juan'
  })
  @IsOptional()
  @IsString()
  q?: string

  @ApiPropertyOptional({
    description: 'Page number for pagination',
    example: '1'
  })
  @IsOptional()
  @IsNumberString()
  @Transform(({ value }) => parseInt(value))
  page?: number

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: '20'
  })
  @IsOptional()
  @IsNumberString()
  @Transform(({ value }) => parseInt(value))
  limit?: number
}
