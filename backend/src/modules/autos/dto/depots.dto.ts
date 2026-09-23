import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsInt, IsOptional, IsString } from 'class-validator';
import { LocationPointDto } from './common.dto';

export class DepotsRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  last_modified?: string;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @IsInt()
  maximum_results?: number = 100;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  page?: string;
}

export class DepotResultDto {
  @ApiProperty()
  depot_id: number;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: LocationPointDto })
  location: LocationPointDto;
}

export class DepotsResponseDto {
  @ApiProperty()
  request_id: string;

  @ApiProperty({ type: [DepotResultDto] })
  data: DepotResultDto[];

  @ApiProperty()
  metadata: Record<string, unknown>;
}
