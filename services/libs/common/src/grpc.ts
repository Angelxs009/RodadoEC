import {
  applyDecorators,
  ArgumentsHost,
  CallHandler,
  Catch,
  Controller,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { ClientGrpc, GrpcOptions, RpcException, Transport } from '@nestjs/microservices';
import { ChannelCredentials, Metadata, status } from '@grpc/grpc-js';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { firstValueFrom, Observable, throwError, timeout } from 'rxjs';
import { CORRELATION_HEADER, currentCorrelationId, runWithCorrelation } from './correlation';

// ─────────────────────────────────────────────────────────────────────────────
//  Contratos .proto
// ─────────────────────────────────────────────────────────────────────────────

/** Carpeta contracts/proto: se busca hacia arriba (repo, imagen Docker) o se toma de PROTO_DIR. */
export function protoDir(): string {
  if (process.env.PROTO_DIR) return process.env.PROTO_DIR;
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, 'contracts', 'proto');
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  return join(process.cwd(), '..', 'contracts', 'proto');
}

function loader() {
  return { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true, arrays: true, includeDirs: [protoDir()] };
}

export function grpcServerOptions(pkg: string, protoFile: string, port: number | string): GrpcOptions {
  return {
    transport: Transport.GRPC,
    options: {
      package: pkg,
      protoPath: join(protoDir(), protoFile),
      url: `0.0.0.0:${port}`,
      loader: loader(),
    },
  };
}

export function grpcClientOptions(pkg: string, protoFile: string, url: string): GrpcOptions {
  const tls = /^(1|true)$/i.test(process.env.GRPC_TLS ?? '');
  return {
    transport: Transport.GRPC,
    options: {
      package: pkg,
      protoPath: join(protoDir(), protoFile),
      url,
      loader: loader(),
      ...(tls ? { credentials: ChannelCredentials.createSsl() } : {}),
      channelOptions: { 'grpc.keepalive_time_ms': 30000, 'grpc.keepalive_permit_without_calls': 1 },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Errores: ProblemDetails (application/problem+json) <-> gRPC status
// ─────────────────────────────────────────────────────────────────────────────

function httpToGrpc(httpStatus: number): number {
  switch (httpStatus) {
    case 400:
      return status.INVALID_ARGUMENT;
    case 401:
      return status.UNAUTHENTICATED;
    case 402:
      return status.FAILED_PRECONDITION;
    case 403:
      return status.PERMISSION_DENIED;
    case 404:
      return status.NOT_FOUND;
    case 409:
      return status.ABORTED;
    case 503:
      return status.UNAVAILABLE;
    default:
      return status.INTERNAL;
  }
}

/** Server: convierte cualquier error en un RpcException que lleva el ProblemDetails como JSON. */
export function toRpcException(e: unknown): RpcException {
  if (e instanceof RpcException) return e;
  if (e instanceof HttpException) {
    const httpStatus = e.getStatus();
    const body = e.getResponse();
    const problem =
      typeof body === 'object' && body !== null
        ? { ...(body as object), status: httpStatus }
        : { type: 'about:blank', title: String(body), status: httpStatus, detail: String(body), code: 'ERROR' };
    return new RpcException({ code: httpToGrpc(httpStatus), message: JSON.stringify(problem) });
  }
  const message = e instanceof Error ? e.message : String(e);
  return new RpcException({
    code: status.INTERNAL,
    message: JSON.stringify({
      type: 'about:blank',
      title: 'Error interno',
      status: 500,
      detail: message,
      code: 'INTERNAL',
    }),
  });
}

/** Client: reconstruye la HttpException (ProblemDetails) a partir del error gRPC. */
export function fromRpcError(err: any): HttpException {
  if (err instanceof HttpException) return err;
  const raw: string | undefined = typeof err?.details === 'string' ? err.details : err?.message;
  if (raw) {
    try {
      const problem = JSON.parse(raw);
      if (problem && typeof problem === 'object' && problem.status) {
        return new HttpException(problem, Number(problem.status));
      }
    } catch {
      /* no era JSON: se trata como error de transporte */
    }
  }
  const unavailable = err?.code === status.UNAVAILABLE || err?.code === status.DEADLINE_EXCEEDED || err?.name === 'TimeoutError';
  const httpStatus = unavailable ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY;
  return new HttpException(
    {
      type: 'https://api.booking-hub.com/errors/service-unavailable',
      title: unavailable ? 'Servicio no disponible' : 'Error en un servicio interno',
      status: httpStatus,
      detail: err?.name === 'TimeoutError' ? 'El microservicio no respondió dentro del tiempo de tolerancia.' : err?.details || err?.message || 'Fallo la comunicación con un microservicio.',
      code: unavailable ? 'SERVICE_UNAVAILABLE' : 'UPSTREAM_ERROR',
    },
    httpStatus,
  );
}

@Catch()
export class GrpcProblemFilter {
  catch(exception: unknown, _host: ArgumentsHost): Observable<never> {
    return throwError(() => toRpcException(exception).getError());
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Correlation ID en el servidor gRPC
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class CorrelationRpcInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const md = context.switchToRpc().getContext() as Metadata;
    const cid = md?.get?.(CORRELATION_HEADER)?.[0] as string | undefined;
    return new Observable((subscriber) => {
      const sub = runWithCorrelation(cid, () => next.handle().subscribe(subscriber));
      return () => sub.unsubscribe();
    });
  }
}

/** Decorador de clase para los controladores gRPC: filtro de errores + correlation id. */
export const GrpcController = () =>
  applyDecorators(Controller(), UseFilters(GrpcProblemFilter), UseInterceptors(CorrelationRpcInterceptor));

// ─────────────────────────────────────────────────────────────────────────────
//  Cliente gRPC tipado con correlation id y errores ya traducidos
// ─────────────────────────────────────────────────────────────────────────────

export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

const callTimeoutMs = () => Number(process.env.GRPC_TIMEOUT_MS ?? 5000);
const BREAKER_THRESHOLD = 5; // fallos de transporte seguidos que abren el circuito
const BREAKER_OPEN_MS = 10_000;

/**
 * Cliente gRPC con tolerancia perimetral: cada llamada expira a los 5 s (GRPC_TIMEOUT_MS) y un Circuit
 * Breaker corta las llamadas a un servicio caído (falla rápido con 503 en vez de colgarse) hasta que se
 * recupere. Un error de dominio (404, 409…) prueba que el servicio responde, así que no cuenta como fallo.
 */
export class GrpcCaller {
  private svc: any;
  private failures = 0;
  private openUntil = 0;

  constructor(
    private readonly client: ClientGrpc,
    private readonly serviceName: string,
  ) {}

  get breakerState(): BreakerState {
    if (!this.openUntil) return 'CLOSED';
    return Date.now() < this.openUntil ? 'OPEN' : 'HALF_OPEN';
  }

  async call<T = any>(method: string, data: object = {}): Promise<T> {
    if (this.breakerState === 'OPEN') {
      throw new HttpException(
        {
          type: 'https://api.booking-hub.com/errors/service-unavailable',
          title: 'Servicio no disponible',
          status: HttpStatus.SERVICE_UNAVAILABLE,
          detail: `Circuit Breaker abierto: ${this.serviceName} no responde; se reintentará en unos segundos.`,
          code: 'SERVICE_UNAVAILABLE',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    this.svc ??= this.client.getService<any>(this.serviceName);
    const metadata = new Metadata();
    const cid = currentCorrelationId();
    if (cid) metadata.set(CORRELATION_HEADER, cid);
    try {
      const result = await firstValueFrom<T>(this.svc[method](data, metadata).pipe(timeout(callTimeoutMs())));
      this.failures = 0;
      this.openUntil = 0;
      return result;
    } catch (err) {
      const http = fromRpcError(err);
      if (http.getStatus() >= 502) {
        if (++this.failures >= BREAKER_THRESHOLD) this.openUntil = Date.now() + BREAKER_OPEN_MS;
      } else {
        this.failures = 0;
        this.openUntil = 0;
      }
      throw http;
    }
  }
}
