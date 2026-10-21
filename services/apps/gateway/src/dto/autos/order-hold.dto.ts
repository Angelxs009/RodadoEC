import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { DriverDto } from './common.dto';

export class OrderHoldRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  vehicle_id: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  search_token: string;

  @ApiPropertyOptional({ type: DriverDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DriverDto)
  driver?: DriverDto;
}

export enum HoldStatus {
  HELD = 'HELD',
  FAILED = 'FAILED',
}

export class OrderHoldResponseDto {
  @ApiProperty()
  hold_id: string;

  @ApiProperty()
  expires_at: string;

  @ApiProperty({ enum: HoldStatus })
  status: HoldStatus;
}
