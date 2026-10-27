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

// ── Errores del contrato REST v2 (RFC 7807 con invalid_params) ─────────────
const V2_ERRORS = 'https://booking.epn.edu.ec/errors';

export interface InvalidParam {
  name: string;
  reason: string;
}

/** 400 con la lista de campos que no pasaron la validación (invalid_params). */
export function invalidParams(detail: string, params: InvalidParam[]): HttpException {
  return new HttpException(
    {
      type: `${V2_ERRORS}/validation-failed`,
      title: 'Petición inválida',
      status: HttpStatus.BAD_REQUEST,
      detail,
      code: ProblemCode.VALIDATION_FAILED,
      invalid_params: params,
    },
    HttpStatus.BAD_REQUEST,
  );
}

export const unprocessable = (code: string, title: string, detail: string) =>
  problem(HttpStatus.UNPROCESSABLE_ENTITY, code, title, detail, `${V2_ERRORS}/${code.toLowerCase().replace(/_/g, '-')}`);

export const driverUnderage = (age: number) =>
  unprocessable('DRIVER_UNDERAGE', 'Conductor menor de edad', `El conductor tiene ${age} años: la renta de vehículos exige ser mayor de 18 años.`);

export const driverBelowVehicleMinimum = (vehicleId: string, minAge: number, age: number) =>
  unprocessable(
    'DRIVER_AGE_RESTRICTION',
    'Edad del conductor no permitida',
    `El vehículo "${vehicleId}" exige un conductor de al menos ${minAge} años; el conductor indicado tiene ${age}.`,
  );

export const vehicleInCleaningCooldown = (vehicleId: string, availableFromIso: string) =>
  problem(
    HttpStatus.CONFLICT,
    'VEHICLE_IN_CLEANING_COOLDOWN',
    'Vehículo en Cooldown de Limpieza Obligatorio (2 Horas)',
    `El vehículo ${vehicleId} se encuentra en fase de limpieza y desinfección obligatoria de 120 minutos tras su retorno. Estará disponible nuevamente a las ${availableFromIso}.`,
    `${V2_ERRORS}/cooldown-activo`,
  );

export const vehicleInMaintenance = (vehicleId: string) =>
  problem(
    HttpStatus.CONFLICT,
    'VEHICLE_IN_MAINTENANCE',
    'Vehículo en mantenimiento',
    `El vehículo ${vehicleId} está en mantenimiento preventivo y no se puede reservar hasta que el técnico lo habilite.`,
    `${V2_ERRORS}/vehicle-in-maintenance`,
  );

export const invalidStateTransition = (detail: string) =>
  problem(HttpStatus.CONFLICT, 'INVALID_STATE_TRANSITION', 'Transición de estado no permitida', detail, `${V2_ERRORS}/invalid-state-transition`);
