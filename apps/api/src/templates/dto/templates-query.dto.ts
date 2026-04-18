import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class TemplatesQueryDto {
  @ApiPropertyOptional({ description: 'Filtrar por categoría' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Si es true (default) solo devuelve templates activos',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'false' || value === false ? false : true,
  )
  @IsBoolean()
  activeOnly?: boolean;
}
