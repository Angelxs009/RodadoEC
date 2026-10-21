import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';

/**
 * Traduce cualquier error al formato ProblemDetails (application/problem+json) del contrato.
 * Los errores que vienen de un microservicio ya traen su ProblemDetails (con `code`) y pasan tal cual.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProblemDetails');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;
    const response = host.switchToHttp().getResponse<Response>();

    if (!(exception instanceof HttpException)) {
      this.logger.error((exception as Error)?.stack ?? String(exception));
      response
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'https://api.booking-hub.com/errors/internal',
          title: 'Error interno',
          status: 500,
          detail: 'Ocurrió un error inesperado.',
          code: 'INTERNAL',
        });
      return;
    }

    const status = exception.getStatus();
    const body = exception.getResponse();

    if (typeof body === 'object' && body !== null && 'code' in body) {
      response.status(status).header('Content-Type', 'application/problem+json').send(body);
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
          invalidParams: (body as { message: string[] }).message.map((msg) => ({ name: msg.split(' ')[0], reason: msg })),
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

    response.status(status).header('Content-Type', 'application/problem+json').send(problem);
  }
}
