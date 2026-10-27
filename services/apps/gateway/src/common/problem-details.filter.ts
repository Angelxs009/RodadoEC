import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { CORRELATION_HEADER, currentCorrelationId } from '@autos/common';

/**
 * Traduce cualquier error al formato ProblemDetails (application/problem+json) del contrato.
 * Los errores que vienen de un microservicio ya traen su ProblemDetails (con `code`) y pasan tal cual.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProblemDetails');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isV2 = request.originalUrl?.startsWith('/api/v2');
    // Todo ProblemDetails lleva instance, correlation_id y timestamp (trazabilidad, contrato v2 y RFC 7807).
    const enrich = (p: Record<string, unknown>) => ({
      ...p,
      instance: p.instance ?? request.originalUrl?.split('?')[0],
      correlation_id: p.correlation_id ?? currentCorrelationId() ?? response.getHeader(CORRELATION_HEADER),
      timestamp: p.timestamp ?? new Date().toISOString(),
    });

    if (!(exception instanceof HttpException)) {
      this.logger.error((exception as Error)?.stack ?? String(exception));
      response
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .header('Content-Type', 'application/problem+json')
        .send(
          enrich({
            type: 'https://api.booking-hub.com/errors/internal',
            title: 'Error interno',
            status: 500,
            detail: 'Ocurrió un error inesperado.',
            code: 'INTERNAL',
          }),
        );
      return;
    }

    const status = exception.getStatus();
    const body = exception.getResponse();

    if (typeof body === 'object' && body !== null && 'code' in body) {
      response.status(status).header('Content-Type', 'application/problem+json').send(enrich(body as Record<string, unknown>));
      return;
    }

    const isValidationError =
      status === HttpStatus.BAD_REQUEST &&
      typeof body === 'object' &&
      body !== null &&
      Array.isArray((body as { message?: unknown }).message);

    const problem = isValidationError
      ? {
          type: 'https://api.booking-hub.com/errors/validation-failed',
          title: 'Petición inválida',
          status,
          detail: 'Uno o más campos no cumplen con el contrato.',
          code: 'VALIDATION_FAILED',
          [isV2 ? 'invalid_params' : 'invalidParams']: (body as { message: string[] }).message.map((msg) => ({ name: msg.split(' ')[0], reason: msg })),
        }
      : {
          type: `https://api.booking-hub.com/errors/${status}`,
          title:
            (typeof body === 'object' && body && 'error' in body ? String((body as { error: unknown }).error) : exception.message) ||
            'Error',
          status,
          detail: exception.message,
          code: status === 401 ? 'UNAUTHORIZED' : status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : 'VALIDATION_FAILED',
        };

    response.status(status).header('Content-Type', 'application/problem+json').send(enrich(problem));
  }
}
