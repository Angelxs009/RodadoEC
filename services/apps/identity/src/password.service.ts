import { Injectable } from '@nestjs/common';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/** Hash de contraseñas con scrypt nativo de Node. Formato: "<salt-hex>:<hash-hex>". */
@Injectable()
export class PasswordService {
  hash(plain: string): string {
    const salt = randomBytes(16).toString('hex');
    return `${salt}:${scryptSync(plain, salt, 64).toString('hex')}`;
  }

  verify(plain: string, stored: string): boolean {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const derived = scryptSync(plain, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  }
}
