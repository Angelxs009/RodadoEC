import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Traduce cualquier HttpException (incluidas las del ValidationPipe) al
 * formato ProblemDetails definido en los contratos OpenAPI (application/problem+json).
 */
@Catch(HttpException)
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
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
          invalidParams: ((body as { message: string[] }).message).map((msg) => ({
            name: msg.split(' ')[0],
            reason: msg,
          })),
        }
      : {
          type: `https://api.booking-hub.com/errors/${status}`,
          title: (typeof body === 'object' && body && 'error' in body
            ? String((body as { error: unknown }).error)
            : exception.message) || 'Error',
          status,
          detail: exception.message,
          code: 'VALIDATION_FAILED',
        };

    response.status(status).header('Content-Type', 'application/problem+json').send(problem);
  }
}
