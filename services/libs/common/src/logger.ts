import { LoggerService } from '@nestjs/common';
import { appendFile, mkdirSync } from 'fs';
import { join } from 'path';
import { currentCorrelationId } from './correlation';

/**
 * Logs estructurados en JSON (una línea por evento) con el correlation_id de la petición en curso.
 * Formato pensado para enviarse a un agregador (ELK, Loki, CloudWatch).
 *
 * Con LOG_DIR definido, cada línea se agrega además a un archivo físico `<LOG_DIR>/<servicio>.log`
 * (requisito de trazabilidad de la rúbrica RDA2: correlation_id e idempotency_key en logs de archivo).
 */
export class StructuredLogger implements LoggerService {
  private readonly file?: string;

  constructor(private readonly service: string) {
    const dir = process.env.LOG_DIR;
    if (dir) {
      try {
        mkdirSync(dir, { recursive: true });
        this.file = join(dir, `${service}.log`);
      } catch {
        /* sin archivo: se sigue escribiendo a la consola */
      }
    }
  }

  /** Evento estructurado con campos propios (p. ej. idempotency_key, status, latencia). */
  event(level: string, message: string, context: string, extra: Record<string, unknown>) {
    this.write(level, message, context, extra);
  }

  private write(level: string, message: unknown, context?: string, extra?: Record<string, unknown>) {
    const line = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      correlation_id: currentCorrelationId(),
      context,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      ...extra,
    };
    const out = JSON.stringify(line);
    if (this.file) appendFile(this.file, out + '\n', () => undefined);
    if (level === 'error') process.stderr.write(out + '\n');
    else process.stdout.write(out + '\n');
  }

  log(message: unknown, context?: string) {
    this.write('info', message, context);
  }
  error(message: unknown, trace?: string, context?: string) {
    this.write('error', message, context, trace ? { trace } : undefined);
  }
  warn(message: unknown, context?: string) {
    this.write('warn', message, context);
  }
  debug(message: unknown, context?: string) {
    if (process.env.LOG_DEBUG) this.write('debug', message, context);
  }
  verbose(message: unknown, context?: string) {
    if (process.env.LOG_DEBUG) this.write('verbose', message, context);
  }
}
