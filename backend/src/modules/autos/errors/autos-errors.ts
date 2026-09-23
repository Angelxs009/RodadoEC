import { HttpException, HttpStatus } from '@nestjs/common';
import { ProblemCode } from '../dto/problem-details.dto';

function problem(status: HttpStatus, code: ProblemCode, title: string, detail: string): HttpException {
  return new HttpException(
    {
      type: `https://api.booking-hub.com/errors/${code.toLowerCase().replace(/_/g, '-')}`,
      title,
      status,
      detail,
      code,
    },
    status,
  );
}

export const carNoLongerAvailable = (vehicleId: string) =>
  problem(
    HttpStatus.CONFLICT,
    ProblemCode.CAR_NO_LONGER_AVAILABLE,
    'Vehículo no disponible',
    `El vehículo "${vehicleId}" ya no está disponible o el search_token expiró.`,
  );

export const priceChanged = () =>
  problem(
    HttpStatus.CONFLICT,
    ProblemCode.PRICE_CHANGED,
    'El precio cambió',
    'La previsualización de la orden expiró o el precio ya no es válido. Vuelve a previsualizar.',
  );

export const bookingNotConfirmed = (orderPreviewId: string) =>
  problem(
    HttpStatus.BAD_REQUEST,
    ProblemCode.BOOKING_NOT_CONFIRMED,
    'Previsualización no encontrada',
    `No existe una previsualización de orden con id "${orderPreviewId}".`,
  );

export const cancellationNotAllowed = () =>
  problem(
    HttpStatus.CONFLICT,
    ProblemCode.CANCELLATION_NOT_ALLOWED,
    'Cancelación no permitida',
    'La orden no se puede cancelar en su estado actual.',
  );

export const orderNotFound = (orderId: string) =>
  new HttpException(
    {
      type: 'https://api.booking-hub.com/errors/not-found',
      title: 'Orden no encontrada',
      status: HttpStatus.NOT_FOUND,
      detail: `No existe una orden con id "${orderId}".`,
      code: ProblemCode.BOOKING_NOT_CONFIRMED,
    },
    HttpStatus.NOT_FOUND,
  );

export const orderNotModifiable = () =>
  problem(
    HttpStatus.CONFLICT,
    ProblemCode.CANCELLATION_NOT_ALLOWED,
    'Orden no modificable',
    'Solo se pueden modificar órdenes en estado CONFIRMED.',
  );
