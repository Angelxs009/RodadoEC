import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { CustomerTokenService } from './customer-token.service';

/** Exige un token de cliente válido. Usado solo en endpoints de "mi cuenta" (ej. /me/orders). */
@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(private readonly tokenService: CustomerTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    const customerId = this.tokenService.verify(token);
    if (!customerId) {
      throw new UnauthorizedException('Sesión inválida o expirada. Inicia sesión de nuevo.');
    }
    request.customerId = customerId;
    return true;
  }
}
