import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTemplateDto {
  @ApiProperty({ description: 'Nombre del template', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ description: 'Categoría del template', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category!: string;

  @ApiPropertyOptional({
    description: 'Asunto (solo aplica a email-like templates)',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subject?: string;

  @ApiProperty({
    description: 'Contenido del mensaje con placeholders {{variable}}',
  })
  @IsString()
  @IsNotEmpty()
  content!: string;

  @ApiPropertyOptional({
    description: 'Lista de variables usadas en el contenido',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];
}
