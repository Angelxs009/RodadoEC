import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterCustomerDto {
  @ApiProperty({ example: 'maria@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'claveSegura123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'María' })
  @IsString()
  @MinLength(1)
  first_name: string;

  @ApiProperty({ example: 'Pérez' })
  @IsString()
  @MinLength(1)
  last_name: string;

  @ApiProperty({ example: '0991234567', required: false })
  @IsOptional()
  @IsString()
  phone_number?: string;
}
