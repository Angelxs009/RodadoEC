import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AdminTokenService } from './admin-token.service';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly tokenService: AdminTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    if (!this.tokenService.verify(token)) {
      throw new UnauthorizedException('Sesión de administrador inválida o expirada.');
    }
    return true;
  }
}
