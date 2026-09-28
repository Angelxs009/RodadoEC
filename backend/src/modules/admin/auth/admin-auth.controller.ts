import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { AdminLoginDto, AdminLoginResponseDto } from './dto/admin-login.dto';
import { AdminTokenService } from './admin-token.service';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Login del backoffice de Admin (no forma parte del contrato público de Autos).
 * Credenciales configurables por variables de entorno ADMIN_USERNAME / ADMIN_PASSWORD.
 */
@Controller('admin/auth')
@ApiTags('Administración')
export class AdminAuthController {
  constructor(private readonly tokenService: AdminTokenService) {}

  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión como administrador' })
  login(@Body() dto: AdminLoginDto): AdminLoginResponseDto {
    const expectedUser = process.env.ADMIN_USERNAME || 'admin';
    const expectedPassword = process.env.ADMIN_PASSWORD || 'rodadoec2026';

    const validUser = safeEqual(dto.username, expectedUser);
    const validPassword = safeEqual(dto.password, expectedPassword);

    if (!validUser || !validPassword) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos.');
    }

    return { token: this.tokenService.sign(dto.username) };
  }
}
