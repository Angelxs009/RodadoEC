import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

export const SCOPES_KEY = 'requiredScopes';
export const RequireScopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);

/**
 * Guard simplificado para fines académicos: no existe un servidor de
 * autorización OAuth2 real en el curso, así que solo exige que llegue un
 * header `Authorization: Bearer <token>` (no valida firma ni scopes reales
 * del token). El contrato documenta los scopes vía @ApiSecurity para que
 * Swagger los muestre correctamente.
 */
@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException(
        {
          type: 'https://api.booking-hub.com/errors/unauthorized',
          title: 'Autenticación requerida',
          status: HttpStatus.UNAUTHORIZED,
          detail: `Este endpoint requiere un token Bearer con los scopes: ${requiredScopes.join(', ')}.`,
          code: 'VALIDATION_FAILED',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    return true;
  }
}
