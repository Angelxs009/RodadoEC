import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtTokens, Principal, Role, unauthorized } from '@autos/common';

/**
 * Seguridad del gateway (JWT + roles).
 *
 * El gateway valida el JWT (HS256) de cada petición y deja el `principal` en `req.principal`.
 * Las rutas marcadas con @Roles(...) se protegen según estas variables de entorno:
 *   AUTH_ENFORCE_ADMIN=true     → /admin/** exige un JWT de ADMIN (401 sin token, 403 con otro rol)
 *   AUTH_ENFORCE_CUSTOMER=true  → /auth/me y /me/orders exigen un JWT de CLIENTE
 * Por defecto están apagadas para que Swagger se pueda probar sin tokens (decisión del equipo);
 * activarlas no requiere cambios de código. Cuando están activas, Swagger muestra el candado.
 */
const flag = (name: string) => /^(1|true)$/i.test(process.env[name] ?? '');
export const enforceAdmin = () => flag('AUTH_ENFORCE_ADMIN');
export const enforceCustomer = () => flag('AUTH_ENFORCE_CUSTOMER');

export const ROLES_KEY = 'roles';

/** Restringe una ruta a uno o más roles. Aplica el candado de Swagger solo si la protección está activa. */
export function Roles(...roles: Role[]) {
  const enforced = roles.includes('ADMIN') ? enforceAdmin() : enforceCustomer();
  return applyDecorators(SetMetadata(ROLES_KEY, roles), ...(enforced ? [ApiBearerAuth()] : []));
}

declare module 'express-serve-static-core' {
  interface Request {
    principal?: Principal | null;
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly tokens = new JwtTokens();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Los resolvers GraphQL no usan @Roles; su petición vive en el contexto de Apollo, no en el HTTP de Nest.
    if (context.getType<string>() !== 'http') return true;
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const principal = this.tokens.verify(token);
    req.principal = principal;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;

    const enforced = roles.includes('ADMIN') ? enforceAdmin() : enforceCustomer();
    if (!enforced) return true;

    if (!principal) throw unauthorized('Falta un token JWT válido (Authorization: Bearer <token>).');
    if (!roles.includes(principal.role)) {
      throw new HttpException(
        {
          type: 'https://api.booking-hub.com/errors/forbidden',
          title: 'Prohibido',
          status: HttpStatus.FORBIDDEN,
          detail: `Esta ruta requiere el rol ${roles.join(' o ')}; el token es de ${principal.role}.`,
          code: 'FORBIDDEN',
        },
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Contrato REST v2: seguridad BearerAuth (JWT) o ApiKeyAuth (X-API-Key), roles CLIENTE | ADMIN | MANTENIMIENTO
// ─────────────────────────────────────────────────────────────────────────────

export type V2Role = 'CLIENTE' | 'ADMIN' | 'MANTENIMIENTO';
export const V2_ROLES_KEY = 'v2roles';

/** Restringe una ruta v2 a ciertos roles (RBAC RDA2 §5). Sin argumentos solo exige autenticación. */
export const V2Roles = (...roles: V2Role[]) => SetMetadata(V2_ROLES_KEY, roles);

export const enforceV2 = () => flag('AUTH_ENFORCE_V2');

/**
 * Guard de las rutas protegidas del contrato v2.
 *  · Autenticación: JWT válido (Authorization: Bearer) o clave M2M (X-API-Key = BOOKING_API_KEY).
 *  · Rol: el del JWT (ADMIN→ADMIN, CUSTOMER→CLIENTE) o, con clave M2M, el de la cabecera X-Role.
 * Con AUTH_ENFORCE_V2=true exige 401 sin credenciales y 403 con rol insuficiente. Con la bandera apagada
 * (por defecto, para probar en Swagger sin tokens) solo rechaza 403 si se envía explícitamente un X-Role
 * que no corresponde a la ruta.
 */
@Injectable()
export class V2AccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType<string>() !== 'http') return true;
    const req = context.switchToHttp().getRequest();
    const roles = this.reflector.getAllAndOverride<V2Role[] | undefined>(V2_ROLES_KEY, [context.getHandler(), context.getClass()]) ?? [];

    const expectedKey = process.env.BOOKING_API_KEY;
    const apiKeyOk = !!expectedKey && req.headers['x-api-key'] === expectedKey;
    const principal: Principal | null | undefined = req.principal;
    const authenticated = apiKeyOk || !!principal;

    const headerRole = String(req.headers['x-role'] ?? '').toUpperCase() as V2Role | '';
    const role: V2Role | '' =
      apiKeyOk && headerRole ? headerRole : principal ? (principal.role === 'ADMIN' ? 'ADMIN' : 'CLIENTE') : headerRole;

    const forbidden = () =>
      new HttpException(
        {
          type: 'https://booking.epn.edu.ec/errors/forbidden',
          title: 'Acceso restringido por rol',
          status: HttpStatus.FORBIDDEN,
          detail: `Esta operación requiere el rol ${roles.join(' o ')}${role ? `; el rol recibido es ${role}` : ''}.`,
          code: 'FORBIDDEN',
        },
        HttpStatus.FORBIDDEN,
      );

    if (!enforceV2()) {
      if (roles.length && headerRole && !roles.includes(headerRole)) throw forbidden();
      return true;
    }
    if (!authenticated) throw unauthorized('Falta un JWT válido (Authorization: Bearer) o una clave de API (X-API-Key).');
    if (roles.length && !roles.includes(role as V2Role)) throw forbidden();
    return true;
  }
}
