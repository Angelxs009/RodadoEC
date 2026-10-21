import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { RouteDto } from './common.dto';

export class OrderModifyRequestDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extras_to_add?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extras_to_remove?: string[];

  @ApiPropertyOptional({ type: RouteDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RouteDto)
  route?: RouteDto;
}
