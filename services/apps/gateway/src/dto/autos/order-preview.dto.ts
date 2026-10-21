import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class OrderPreviewRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  vehicle_id: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  search_token: string;

  @ApiPropertyOptional({
    description: 'Si el vehículo fue puesto en Hold previamente, incluir el ID.',
  })
  @IsOptional()
  @IsString()
  hold_id?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Equipamiento extra (Ej. Silla de bebé, GPS).',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extras?: string[];
}

export class OrderPreviewResponseDto {
  @ApiProperty()
  request_id: string;

  @ApiProperty()
  data: {
    order_preview_id: string;
    total_price: number;
    currency: string;
    breakdown: Record<string, unknown>;
  };
}
