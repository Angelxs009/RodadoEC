import { ApiProperty } from '@nestjs/swagger';

export class CustomerProfileDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() first_name: string;
  @ApiProperty() last_name: string;
  @ApiProperty({ nullable: true }) phone_number: string | null;
}

export class CustomerAuthResponseDto {
  @ApiProperty() token: string;
  @ApiProperty({ type: CustomerProfileDto }) profile: CustomerProfileDto;
}
