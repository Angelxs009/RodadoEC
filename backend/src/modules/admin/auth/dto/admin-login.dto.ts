import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AdminLoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @MinLength(1)
  username: string;

  @ApiProperty({ example: 'tu-clave' })
  @IsString()
  @MinLength(1)
  password: string;
}

export class AdminLoginResponseDto {
  @ApiProperty()
  token: string;
}
