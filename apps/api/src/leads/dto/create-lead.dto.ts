import { IsString, IsOptional, IsPhoneNumber, IsIn, IsNumber, Min, Max } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateLeadDto {
  @ApiProperty({
    description: 'Phone number of the lead',
    example: '+1234567890'
  })
  @IsPhoneNumber()
  phone: string

  @ApiPropertyOptional({
    description: 'Name of the lead',
    example: 'Juan Pérez'
  })
  @IsOptional()
  @IsString()
  name?: string

  @ApiPropertyOptional({
    description: 'Status of the lead',
    enum: ['NEW', 'CONTACTED', 'HOT', 'WARM', 'COLD', 'DISCARDED'],
    example: 'NEW'
  })
  @IsOptional()
  @IsIn(['NEW', 'CONTACTED', 'HOT', 'WARM', 'COLD', 'DISCARDED'])
  status?: string

  @ApiPropertyOptional({
    description: 'AI score of the lead (0.0-1.0)',
    example: 0.8,
    minimum: 0,
    maximum: 1
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  score?: number
}
