import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';

export class SuppliersRequestDto {
  @ApiPropertyOptional({
    type: [Number],
    description: 'IDs de los proveedores específicos. Si es vacío, retorna todos.',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  suppliers?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  maximum_results?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  page?: string;
}

export class SupplierResultDto {
  @ApiProperty()
  supplier_id: number;

  @ApiProperty()
  name: string;
}

export class SuppliersResponseDto {
  @ApiProperty()
  request_id: string;

  @ApiProperty({ type: [SupplierResultDto] })
  data: SupplierResultDto[];
}
