import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { BookerDto, DriverDto, RouteDto } from './common.dto';

class CarSearchFiltersDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  car_types?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  transmission?: string[];
}

export class CarSearchRequestDto {
  @ApiProperty({ type: BookerDto })
  @ValidateNested()
  @Type(() => BookerDto)
  booker: BookerDto;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency: string;

  @ApiProperty({ type: DriverDto })
  @ValidateNested()
  @Type(() => DriverDto)
  driver: DriverDto;

  @ApiProperty({ type: RouteDto })
  @ValidateNested()
  @Type(() => RouteDto)
  route: RouteDto;

  @ApiPropertyOptional({ type: CarSearchFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CarSearchFiltersDto)
  filters?: CarSearchFiltersDto;

  @ApiPropertyOptional({ default: 100, minimum: 10, maximum: 500 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(500)
  maximum_results?: number = 100;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  page?: string;
}

export class CarSearchResultDto {
  @ApiProperty()
  vehicle_id: string;

  @ApiProperty()
  price: number;

  @ApiProperty()
  supplier_id: number;
}

export class CarSearchResponseDto {
  @ApiProperty()
  request_id: string;

  @ApiProperty({ type: [CarSearchResultDto] })
  data: CarSearchResultDto[];

  @ApiProperty()
  metadata: { total_results: number; next_page: string | null };

  @ApiProperty({ description: 'Token necesario para el contexto de las siguientes peticiones.' })
  search_token: string;
}
