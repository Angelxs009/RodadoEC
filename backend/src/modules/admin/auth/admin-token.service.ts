import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

interface TokenPayload {
  sub: string;
  exp: number;
}

/**
 * Emite y verifica tokens firmados (esquema tipo JWT simplificado, con HMAC-SHA256
 * y el módulo `crypto` nativo de Node) para proteger el backoffice de Admin.
 *
 * No es el OAuth2 central que espera autos-openapi.yaml para el contrato público
 * (ese sería compartido por todo el Booking Prototipo) — este es un login interno,
 * propio del backoffice de este dominio, para que solo el administrador pueda
 * editar el catálogo.
 */
@Injectable()
export class AdminTokenService {
  private readonly secret = process.env.ADMIN_JWT_SECRET || 'dev-only-insecure-secret-rodadoec';

  sign(username: string): string {
    const payload: TokenPayload = { sub: username, exp: Date.now() + TOKEN_TTL_MS };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = this.hmac(payloadB64);
    return `${payloadB64}.${signature}`;
  }

  verify(token: string | undefined): boolean {
    if (!token) return false;
    const [payloadB64, signature] = token.split('.');
    if (!payloadB64 || !signature) return false;

    const expected = this.hmac(payloadB64);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

    try {
      const payload: TokenPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
      return payload.exp > Date.now();
    } catch {
      return false;
    }
  }

  private hmac(data: string): string {
    return createHmac('sha256', this.secret).update(data).digest('hex');
  }
}
