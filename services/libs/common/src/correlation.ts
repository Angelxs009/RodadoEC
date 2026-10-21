import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

/**
 * Correlation ID (Semana 6): identificador único que viaja con cada petición a través del gateway,
 * los microservicios (metadata gRPC) y los eventos, para poder reconstruir el recorrido completo.
 */
export const CORRELATION_HEADER = 'x-correlation-id';

interface Ctx {
  correlationId: string;
}

const storage = new AsyncLocalStorage<Ctx>();

export function runWithCorrelation<T>(correlationId: string | undefined, fn: () => T): T {
  return storage.run({ correlationId: correlationId || randomUUID() }, fn);
}

export function currentCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
