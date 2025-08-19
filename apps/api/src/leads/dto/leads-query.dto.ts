import { IsOptional, IsString, IsIn, IsNumberString } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'

export class LeadsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by lead status',
    enum: ['NEW', 'CONTACTED', 'HOT', 'WARM', 'COLD', 'DISCARDED']
  })
  @IsOptional()
  @IsIn(['NEW', 'CONTACTED', 'HOT', 'WARM', 'COLD', 'DISCARDED'])
  status?: string

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
