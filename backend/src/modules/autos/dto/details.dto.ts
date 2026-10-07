import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class CarDetailsRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  last_modified?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  maximum_results?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  page?: string;
}

export class CarDetailsResultDto {
  @ApiProperty()
  vehicle_id: string;

  @ApiProperty()
  make: string;

  @ApiProperty()
  model: string;

  @ApiProperty()
  doors: number;

  @ApiProperty()
  bag_capacity: number;

  @ApiProperty()
  seats: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Extra no contractual: ruta/URL de la foto del vehículo.',
  })
  image_url?: string | null;

  @ApiPropertyOptional({
    enum: ['AVAILABLE', 'RESERVED'],
    description: 'Extra no contractual: estado del vehículo.',
  })
  status?: string;

  @ApiPropertyOptional({ description: 'Extra no contractual: edad mínima del conductor.' })
  min_driver_age?: number;
}

export class CarDetailsResponseDto {
  @ApiProperty()
  request_id: string;

  @ApiProperty({ type: [CarDetailsResultDto] })
  data: CarDetailsResultDto[];
}
