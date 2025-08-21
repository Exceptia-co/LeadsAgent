import { IsString, IsOptional, IsPhoneNumber, IsIn, IsEmail, IsArray, IsNumber, Min, Max } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { LeadStatus } from '@prisma/client'

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
    description: 'Email of the lead',
    example: 'juan@example.com'
  })
  @IsOptional()
  @IsEmail()
  email?: string

  @ApiPropertyOptional({
    description: 'Tags for the lead',
    example: ['prospecto', 'urgente'],
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]

  @ApiPropertyOptional({
    description: 'Status of the lead',
    enum: ['NUEVO', 'CONTACTADO', 'QUALIFIED', 'GANADO', 'PERDIDO'],
    example: 'NUEVO'
  })
  @IsOptional()
  @IsIn(['NUEVO', 'CONTACTADO', 'QUALIFIED', 'GANADO', 'PERDIDO'])
  status?: LeadStatus

  @ApiPropertyOptional({
    description: 'AI mood score of the lead (0.0-1.0)',
    example: 0.8,
    minimum: 0,
    maximum: 1
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  moodScore?: number

  @ApiPropertyOptional({
    description: 'Source of the lead',
    example: 'whatsapp',
    default: 'whatsapp'
  })
  @IsOptional()
  @IsString()
  source?: string

  @ApiPropertyOptional({
    description: 'Clerk user ID to assign the lead to',
    example: 'user_2abc123def456'
  })
  @IsOptional()
  @IsString()
  assignedTo?: string
}
