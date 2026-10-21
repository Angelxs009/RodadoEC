import { HttpException, HttpStatus } from '@nestjs/common';

/** Códigos de error del dominio (enum del contrato autos-openapi.yaml, más los de pago). */
export enum ProblemCode {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  CAR_NO_LONGER_AVAILABLE = 'CAR_NO_LONGER_AVAILABLE',
  PRICE_CHANGED = 'PRICE_CHANGED',
  DEPOT_CLOSED = 'DEPOT_CLOSED',
  DRIVER_AGE_RESTRICTION = 'DRIVER_AGE_RESTRICTION',
  BOOKING_NOT_CONFIRMED = 'BOOKING_NOT_CONFIRMED',
  CANCELLATION_NOT_ALLOWED = 'CANCELLATION_NOT_ALLOWED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  PAYMENT_REFERENCE_INVALID = 'PAYMENT_REFERENCE_INVALID',
  PAYMENT_NOT_AUTHORIZED = 'PAYMENT_NOT_AUTHORIZED',
  PAYMENT_DECLINED = 'PAYMENT_DECLINED',
  PAYMENT_REQUIRED = 'PAYMENT_REQUIRED',
}

/** Construye una excepción con el formato application/problem+json del contrato. */
export function problem(
  status: HttpStatus,
  code: ProblemCode | string,
  title: string,
  detail: string,
  type?: string,
): HttpException {
  return new HttpException(
    {
      type:
        type ?? `https://api.booking-hub.com/errors/${String(code).toLowerCase().replace(/_/g, '-')}`,
      title,
      status,
      detail,
      code,
    },
    status,
  );
}

// ── Errores de dominio compartidos entre servicios ─────────────────────────
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
  problem(
    HttpStatus.NOT_FOUND,
    ProblemCode.BOOKING_NOT_CONFIRMED,
    'Orden no encontrada',
    `No existe una orden con id "${orderId}".`,
    'https://api.booking-hub.com/errors/not-found',
  );

export const orderNotModifiable = () =>
  problem(
    HttpStatus.CONFLICT,
    ProblemCode.CANCELLATION_NOT_ALLOWED,
    'Orden no modificable',
    'Solo se pueden modificar órdenes en estado CONFIRMED.',
  );

export const notFound = (title: string, detail: string) =>
  problem(HttpStatus.NOT_FOUND, 'NOT_FOUND', title, detail, 'https://api.booking-hub.com/errors/not-found');

export const conflict = (detail: string) =>
  problem(HttpStatus.CONFLICT, 'CONFLICT', 'Conflicto', detail, 'https://api.booking-hub.com/errors/conflict');

export const badRequest = (detail: string) =>
  problem(
    HttpStatus.BAD_REQUEST,
    ProblemCode.VALIDATION_FAILED,
    'Petición inválida',
    detail,
    'https://api.booking-hub.com/errors/validation-failed',
  );

export const unauthorized = (detail: string) =>
  problem(
    HttpStatus.UNAUTHORIZED,
    'UNAUTHORIZED',
    'No autorizado',
    detail,
    'https://api.booking-hub.com/errors/unauthorized',
  );
