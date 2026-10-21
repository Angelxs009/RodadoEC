import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AdminLoginDto {
  @ApiProperty({ example: 'admin', description: 'Usuario de demo: admin' })
  @IsString()
  @MinLength(1)
  username: string;

  @ApiProperty({ example: 'admin123', description: 'Clave de demo: admin123' })
  @IsString()
  @MinLength(1)
  password: string;
}

export class AdminLoginResponseDto {
  @ApiProperty()
  token: string;
}
