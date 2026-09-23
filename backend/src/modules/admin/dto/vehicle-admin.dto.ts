import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min, MinLength } from 'class-validator';

const CAR_TYPES = ['Compacto', 'Sedan', 'SUV'];
const TRANSMISSIONS = ['Manual', 'Automatica'];

export class CreateVehicleAdminDto {
  @ApiProperty({ example: 'veh-009' })
  @IsString()
  @MinLength(2)
  vehicle_id: string;

  @ApiProperty({ example: 'Mazda' })
  @IsString()
  @MinLength(1)
  make: string;

  @ApiProperty({ example: '2' })
  @IsString()
  @MinLength(1)
  model: string;

  @ApiProperty({ enum: CAR_TYPES })
  @IsIn(CAR_TYPES)
  car_type: string;

  @ApiProperty({ enum: TRANSMISSIONS })
  @IsIn(TRANSMISSIONS)
  transmission: string;

  @ApiProperty()
  @IsInt()
  @Min(2)
  doors: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  bag_capacity: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  seats: number;

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  price_per_day: number;

  @ApiProperty()
  @IsInt()
  supplier_id: number;

  @ApiProperty()
  @IsInt()
  depot_id: number;

  @ApiPropertyOptional({ example: '/cars/veh-009.jpg' })
  @IsOptional()
  @IsString()
  image_url?: string;
}

export class UpdateVehicleAdminDto extends PartialType(CreateVehicleAdminDto) {}

export class VehicleAdminResponseDto extends CreateVehicleAdminDto {
  @ApiPropertyOptional({ format: 'uuid' })
  id: string;
}
