import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

const TOKEN_TTL = '12h';

/**
 * Emite y verifica JWT (RFC 7519, estándar real vía @nestjs/jwt + jsonwebtoken,
 * algoritmo HS256) para proteger el backoffice de Admin.
 *
 * No es el OAuth2 central que espera autos-openapi.yaml para el contrato público
 * (ese sería compartido por todo el Booking Prototipo) — este es un login interno,
 * propio del backoffice de este dominio, para que solo el administrador pueda
 * editar el catálogo.
 */
@Injectable()
export class AdminTokenService {
  constructor(private readonly jwtService: JwtService) {}

  sign(username: string): string {
    return this.jwtService.sign({ sub: username, role: 'admin' }, { expiresIn: TOKEN_TTL });
  }

  verify(token: string | undefined): boolean {
    if (!token) return false;
    try {
      this.jwtService.verify(token);
      return true;
    } catch {
      return false; // firma inválida, token expirado, o mal formado
    }
  }
}
