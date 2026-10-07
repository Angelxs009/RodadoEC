import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días (sesión de cliente, no de admin)

interface TokenPayload {
  sub: string; // customer id
  exp: number;
}

/**
 * Mismo esquema de token que AdminTokenService (HMAC-SHA256 con `crypto` nativo),
 * pero con secreto y audiencia propios: un token de cliente nunca debe servir
 * para entrar al backoffice de Admin, ni viceversa.
 */
@Injectable()
export class CustomerTokenService {
  private readonly secret =
    process.env.CUSTOMER_JWT_SECRET || 'dev-only-insecure-secret-rodadoec-customers';

  sign(customerId: string): string {
    const payload: TokenPayload = { sub: customerId, exp: Date.now() + TOKEN_TTL_MS };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = this.hmac(payloadB64);
    return `${payloadB64}.${signature}`;
  }

  /** Devuelve el customerId si el token es válido y no ha expirado, o null si no. */
  verify(token: string | undefined): string | null {
    if (!token) return null;
    const [payloadB64, signature] = token.split('.');
    if (!payloadB64 || !signature) return null;

    const expected = this.hmac(payloadB64);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    try {
      const payload: TokenPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
      return payload.exp > Date.now() ? payload.sub : null;
    } catch {
      return null;
    }
  }

  private hmac(data: string): string {
    return createHmac('sha256', this.secret).update(data).digest('hex');
  }
}
