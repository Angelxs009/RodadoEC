import { LoggerService } from '@nestjs/common';
import { currentCorrelationId } from './correlation';

/**
 * Logs estructurados en JSON (una línea por evento) con el correlation_id de la petición en curso.
 * Formato pensado para enviarse a un agregador (ELK, Loki, CloudWatch).
 */
export class StructuredLogger implements LoggerService {
  constructor(private readonly service: string) {}

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
