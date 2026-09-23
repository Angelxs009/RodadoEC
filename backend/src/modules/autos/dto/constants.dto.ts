import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

const CONSTANT_KEYS = [
  'depot_services',
  'fuel_policies',
  'fuel_types',
  'general',
  'payment_timings',
  'transmission',
] as const;

export class CarConstantsRequestDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @ApiPropertyOptional({ type: [String], enum: CONSTANT_KEYS })
  @IsOptional()
  @IsArray()
  @IsIn(CONSTANT_KEYS, { each: true })
  constants?: (typeof CONSTANT_KEYS)[number][];
}

export class CarConstantsResponseDto {
  @ApiProperty()
  request_id: string;

  @ApiProperty()
  data: Record<string, unknown>;
}
