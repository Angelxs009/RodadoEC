import { HttpStatus } from '@nestjs/common';
import { ProblemCode, carNoLongerAvailable, driverAgeRestriction, paymentDeclined, paymentRequired, problem } from '@autos/common';

describe('problem (application/problem+json)', () => {
  it('arma el cuerpo con type, title, status, detail y code', () => {
    const e = problem(HttpStatus.CONFLICT, ProblemCode.PRICE_CHANGED, 'T', 'D');
    expect(e.getStatus()).toBe(409);
    expect(e.getResponse()).toEqual({
      type: 'https://api.booking-hub.com/errors/price-changed',
      title: 'T', status: 409, detail: 'D', code: 'PRICE_CHANGED',
    });
  });
  it('permite un type propio', () => {
    expect((problem(400, 'X', 't', 'd', 'urn:x').getResponse() as any).type).toBe('urn:x');
  });
  it('carNoLongerAvailable → 409 CAR_NO_LONGER_AVAILABLE con el id', () => {
    const e = carNoLongerAvailable('V7');
    expect(e.getStatus()).toBe(409);
    expect((e.getResponse() as any).code).toBe('CAR_NO_LONGER_AVAILABLE');
    expect((e.getResponse() as any).detail).toContain('V7');
  });
  it('driverAgeRestriction → 409 DRIVER_AGE_RESTRICTION', () => {
    const e = driverAgeRestriction('V1', 21, 19);
    expect((e.getResponse() as any).code).toBe('DRIVER_AGE_RESTRICTION');
    expect((e.getResponse() as any).detail).toContain('21');
  });
  it('pagos: requerido y rechazado devuelven 402', () => {
    expect(paymentRequired('x').getStatus()).toBe(402);
    expect((paymentDeclined('x').getResponse() as any).code).toBe('PAYMENT_DECLINED');
  });
});
