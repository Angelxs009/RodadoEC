import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { DriverDetailsDto } from './common.dto';

export class OrderCreateRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  order_preview_id: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  payment_reference: string;

  @ApiProperty({ type: DriverDetailsDto })
  @ValidateNested()
  @Type(() => DriverDetailsDto)
  driver_details: DriverDetailsDto;
}
