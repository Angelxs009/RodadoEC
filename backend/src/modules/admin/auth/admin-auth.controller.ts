import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { AdminUsersService } from '../admin-users.service';
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
 * Acepta (1) la cuenta de arranque definida por ADMIN_USERNAME / ADMIN_PASSWORD y
 * (2) los administradores creados desde el panel (tabla autos_admins).
 */
@Controller('admin/auth')
@ApiTags('Administración')
export class AdminAuthController {
  constructor(
    private readonly tokenService: AdminTokenService,
    private readonly usersService: AdminUsersService,
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión como administrador' })
  async login(@Body() dto: AdminLoginDto): Promise<AdminLoginResponseDto> {
    const expectedUser = process.env.ADMIN_USERNAME || 'admin';
    const expectedPassword = process.env.ADMIN_PASSWORD || 'rodadoec2026';

    // Se comparan ambos siempre (sin cortocircuito) para no filtrar cuál falló.
    const validUser = safeEqual(dto.username, expectedUser);
    const validPassword = safeEqual(dto.password, expectedPassword);
    if (validUser && validPassword) {
      return { token: this.tokenService.sign(dto.username) };
    }

    const admin = await this.usersService.verifyAdminCredentials(dto.username, dto.password);
    if (!admin) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos.');
    }
    return { token: this.tokenService.sign(admin.username) };
  }
}
