import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

const TOKEN_TTL = '30d'; // sesión de cliente, más larga que la de admin (12h)

/**
 * JWT (RFC 7519, vía @nestjs/jwt + jsonwebtoken, HS256) para la cuenta de
 * cliente. Usa su propio JwtService/secreto (ver CustomersModule), así que un
 * token de cliente nunca sirve para entrar al backoffice de Admin, ni viceversa.
 */
@Injectable()
export class CustomerTokenService {
  constructor(private readonly jwtService: JwtService) {}

  sign(customerId: string): string {
    return this.jwtService.sign({ sub: customerId, role: 'customer' }, { expiresIn: TOKEN_TTL });
  }

  /** Devuelve el customerId si el token es válido y no ha expirado, o null si no. */
  verify(token: string | undefined): string | null {
    if (!token) return null;
    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      return payload.sub;
    } catch {
      return null; // firma inválida, token expirado, o mal formado
    }
  }
}
