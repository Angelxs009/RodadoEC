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

export const vehicleReserved = (vehicleId: string) =>
  problem(
    HttpStatus.CONFLICT,
    ProblemCode.CAR_NO_LONGER_AVAILABLE,
    'Vehículo reservado',
    `El vehículo "${vehicleId}" ya está reservado y no estará disponible hasta que el administrador lo libere.`,
  );

export const driverAgeRestriction = (vehicleId: string, minAge: number, age: number) =>
  problem(
    HttpStatus.CONFLICT,
    ProblemCode.DRIVER_AGE_RESTRICTION,
    'Edad del conductor no permitida',
    `El vehículo "${vehicleId}" exige un conductor de al menos ${minAge} años; el conductor indicado tiene ${age}.`,
  );

export const paymentRequired = (detail: string) =>
  problem(HttpStatus.PAYMENT_REQUIRED, ProblemCode.PAYMENT_REQUIRED, 'Pago requerido', detail);

export const paymentDeclined = (detail: string) =>
  problem(HttpStatus.PAYMENT_REQUIRED, ProblemCode.PAYMENT_DECLINED, 'Pago rechazado', detail);

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
