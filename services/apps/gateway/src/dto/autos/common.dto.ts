import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class BookerDto {
  @ApiProperty({ example: 'ec', description: 'Código ISO 3166-1 alpha-2 del país del comprador.' })
  @IsString()
  @Matches(/^[a-z]{2}$/)
  country: string;
}

export class DriverDto {
  @ApiProperty({ example: 25, description: 'Edad del conductor.' })
  @IsInt()
  @Min(18)
  @Max(99)
  age: number;
}

export class LocationPointDto {
  @ApiPropertyOptional({ example: 'UIO', description: 'Código IATA de aeropuerto, si aplica.' })
  @IsOptional()
  @IsString()
  airport?: string;

  @ApiPropertyOptional({ example: 1, description: 'ID interno de la ciudad.' })
  @IsOptional()
  @IsInt()
  city_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  coordinates?: { latitude: number; longitude: number };
}

class RouteEndpointDto {
  @ApiProperty({ example: '2026-10-01T10:00:00Z' })
  @IsDateString()
  datetime: string;

  @ApiProperty({ type: LocationPointDto })
  @ValidateNested()
  @Type(() => LocationPointDto)
  location: LocationPointDto;
}

export class RouteDto {
  @ApiProperty({ type: RouteEndpointDto })
  @ValidateNested()
  @Type(() => RouteEndpointDto)
  pickup: RouteEndpointDto;

  @ApiProperty({ type: RouteEndpointDto })
  @ValidateNested()
  @Type(() => RouteEndpointDto)
  dropoff: RouteEndpointDto;
}

export class DriverDetailsDto {
  @ApiProperty({ example: 'Ana' })
  @IsString()
  @IsNotEmpty()
  first_name: string;

  @ApiProperty({ example: 'Pérez' })
  @IsString()
  @IsNotEmpty()
  last_name: string;

  @ApiProperty({ example: 'ana.perez@example.com' })
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: '+593999999999' })
  @IsString()
  @IsNotEmpty()
  phone_number: string;
}

export class MetadataDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  total_results?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  next_page?: string | null;
}
