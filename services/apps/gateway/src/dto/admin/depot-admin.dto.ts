import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateDepotAdminDto {
  @ApiProperty({ example: 400 })
  @IsInt()
  depot_id: number;

  @ApiProperty({ example: 'Terminal Terrestre Ambato' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 4 })
  @IsInt()
  city_id: number;

  @ApiPropertyOptional({ example: 'UIO' })
  @IsOptional()
  @IsString()
  airport?: string;

  @ApiPropertyOptional({ example: 4.5, minimum: 0, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  score?: number;
}

export class UpdateDepotAdminDto extends PartialType(CreateDepotAdminDto) {}

export class DepotAdminResponseDto extends CreateDepotAdminDto {
  @ApiPropertyOptional({ format: 'uuid' })
  id: string;
}
