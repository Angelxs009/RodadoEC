import { JwtService } from '@nestjs/jwt';

// Mismos secretos y valores por defecto de desarrollo que el monolito original.
export const adminJwtSecret = () => process.env.ADMIN_JWT_SECRET || 'dev-only-insecure-secret-rodadoec';
export const customerJwtSecret = () =>
  process.env.CUSTOMER_JWT_SECRET || 'dev-only-insecure-secret-rodadoec-customers';

export type Role = 'ADMIN' | 'CUSTOMER';

export interface Principal {
  role: Role;
  subject: string;
}

/**
 * JWT estándar (RFC 7519, HS256). Admin y cliente usan secretos distintos: un token de uno nunca
 * sirve para el otro. Lo usan Identidad (emitir/verificar) y el Gateway (verificar sin viaje de red).
 */
export class JwtTokens {
  private readonly admin = new JwtService({ secret: adminJwtSecret() });
  private readonly customer = new JwtService({ secret: customerJwtSecret() });

  signAdmin(username: string): string {
    return this.admin.sign({ sub: username, role: 'admin' }, { expiresIn: '12h' });
  }

  signCustomer(customerId: string): string {
    return this.customer.sign({ sub: customerId, role: 'customer' }, { expiresIn: '30d' });
  }

  verify(token: string | undefined): Principal | null {
    if (!token) return null;
    try {
      const p = this.admin.verify<{ sub: string }>(token);
      return { role: 'ADMIN', subject: p.sub };
    } catch {
      /* no es de admin: se prueba como cliente */
    }
    try {
      const p = this.customer.verify<{ sub: string }>(token);
      return { role: 'CUSTOMER', subject: p.sub };
    } catch {
      return null;
    }
  }
}
