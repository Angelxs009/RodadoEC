import {
  CallHandler,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, of, tap } from 'rxjs';
import { TtlCache } from '@autos/common';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bad(title: string, detail: string, type: string) {
  return new HttpException(
    { type: `https://api.booking-hub.com/errors/${type}`, title, status: HttpStatus.BAD_REQUEST, detail, code: 'VALIDATION_FAILED' },
    HttpStatus.BAD_REQUEST,
  );
}

/** Exige la cabecera Idempotency-Key (UUID v4) en las operaciones transaccionales. */
@Injectable()
export class IdempotencyKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const key = context.switchToHttp().getRequest().headers['idempotency-key'] as string | undefined;
    if (!key || !key.trim()) {
      throw bad(
        'Idempotency-Key header is required',
        'All transactional endpoints require an Idempotency-Key header (UUID v4) to prevent duplicate operations such as double charges.',
        'missing-idempotency-key',
      );
    }
    if (!UUID_REGEX.test(key)) {
      throw bad('Invalid Idempotency-Key format', `The Idempotency-Key header must be a valid UUID v4. Received: "${key}".`, 'invalid-idempotency-key');
    }
    return true;
  }
}

/**
 * Idempotencia real: si llega otra vez la misma Idempotency-Key para la misma operación, se devuelve la
 * respuesta guardada en vez de ejecutarla de nuevo (un doble clic no duplica la reserva ni el cobro).
 * Solo se guardan las respuestas exitosas; las fallidas pueden reintentarse con la misma clave.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly cache = new TtlCache();
  private static readonly TTL_MS = 24 * 60 * 60 * 1000;

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    const key = req.headers['idempotency-key'] as string | undefined;
    if (!key) return next.handle();

    const cacheKey = `${req.method}:${req.route?.path ?? req.path}:${JSON.stringify(req.params ?? {})}:${key}`;
    const fingerprint = JSON.stringify(req.body ?? null);
    const hit = this.cache.get<{ body: unknown; fingerprint: string }>(cacheKey);
    if (hit) {
      // Misma clave con otra petición distinta: no es un reintento, es un uso indebido de la clave.
      if (hit.fingerprint !== fingerprint) {
        throw new HttpException(
          {
            type: 'https://booking.epn.edu.ec/errors/idempotency-conflict',
            title: 'Conflicto de idempotencia',
            status: HttpStatus.BAD_REQUEST,
            detail: 'La Idempotency-Key ya se usó con un cuerpo distinto. Genera una clave nueva (UUID v4) para una operación diferente.',
            code: 'IDEMPOTENCY_CONFLICT',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      res.setHeader('Idempotent-Replayed', 'true');
      return of(hit.body);
    }
    return next.handle().pipe(tap((body) => this.cache.set(cacheKey, { body, fingerprint }, IdempotencyInterceptor.TTL_MS)));
  }
}
