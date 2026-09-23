import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
}

class InvalidParamDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  reason: string;
}

export class ProblemDetailsDto {
  @ApiProperty()
  type: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  status: number;

  @ApiPropertyOptional()
  detail?: string;

  @ApiProperty({ enum: ProblemCode })
  code: ProblemCode;

  @ApiPropertyOptional({ type: [InvalidParamDto] })
  invalidParams?: InvalidParamDto[];
}
