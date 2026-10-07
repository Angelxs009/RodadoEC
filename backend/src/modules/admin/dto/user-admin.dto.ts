import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export const USER_ROLES = ['ADMIN', 'CUSTOMER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export class CreateUserAdminDto {
  @ApiProperty({
    enum: USER_ROLES,
    description:
      'ADMIN: entra al panel de administración (/admin/auth/login con username). CUSTOMER: cliente que puede reservar (/auth/login con email).',
  })
  @IsIn(USER_ROLES)
  role: UserRole;

  @ApiPropertyOptional({
    example: 'maria.admin',
    description: 'Obligatorio si role=ADMIN. 3–60 caracteres: letras, números, punto, guion o guion bajo.',
  })
  @IsOptional()
  @Matches(/^[a-zA-Z0-9._-]{3,60}$/, {
    message: 'username debe tener 3–60 caracteres: letras, números, punto, guion o guion bajo',
  })
  username?: string;

  @ApiPropertyOptional({ example: 'cliente@example.com', description: 'Obligatorio si role=CUSTOMER.' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ example: 'claveSegura123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ example: 'María', description: 'Obligatorio si role=CUSTOMER.' })
  @IsOptional()
  @IsString()
  first_name?: string;

  @ApiPropertyOptional({ example: 'Pérez', description: 'Obligatorio si role=CUSTOMER.' })
  @IsOptional()
  @IsString()
  last_name?: string;

  @ApiPropertyOptional({ example: '0991234567' })
  @IsOptional()
  @IsString()
  phone_number?: string;
}

export class UserAdminResponseDto {
  @ApiProperty({ format: 'uuid', nullable: true, description: 'null en el administrador de entorno.' })
  id: string | null;

  @ApiProperty({ enum: USER_ROLES })
  role: UserRole;

  @ApiProperty({ description: 'username (ADMIN) o email (CUSTOMER) con el que inicia sesión.' })
  login: string;

  @ApiProperty({ nullable: true })
  first_name: string | null;

  @ApiProperty({ nullable: true })
  last_name: string | null;

  @ApiProperty({ nullable: true })
  phone_number: string | null;

  @ApiProperty({ nullable: true })
  created_at: string | null;

  @ApiProperty({ description: 'true = cuenta de arranque (variables de entorno); no se puede eliminar.' })
  protected: boolean;
}
