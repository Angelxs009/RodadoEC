import { computePricing, needsAgeSurcharge, normalizeCoverage, rentalDays } from '@autos/common';

describe('pricing', () => {
  describe('rentalDays', () => {
    it('cuenta los días entre recogida y devolución', () => {
      expect(rentalDays('2026-12-01', '2026-12-04')).toBe(3);
    });
    it('devuelve mínimo 1 día (mismo día o fechas invertidas)', () => {
      expect(rentalDays('2026-12-01', '2026-12-01')).toBe(1);
      expect(rentalDays('2026-12-05', '2026-12-01')).toBe(1);
    });
  });

  describe('needsAgeSurcharge', () => {
    it.each([
      [18, true],
      [24, true],
      [25, false],
      [70, false],
      [71, true],
    ])('edad %i → recargo %s', (age, expected) => {
      expect(needsAgeSurcharge(age)).toBe(expected);
    });
  });

  describe('normalizeCoverage', () => {
    it('TOTAL y PREMIUM se tratan como TOTAL', () => {
      expect(normalizeCoverage('TOTAL')).toBe('TOTAL');
      expect(normalizeCoverage('PREMIUM')).toBe('TOTAL');
    });
    it('cualquier otro valor cae en BASICA', () => {
      expect(normalizeCoverage('BASICA')).toBe('BASICA');
      expect(normalizeCoverage(undefined)).toBe('BASICA');
      expect(normalizeCoverage('xyz')).toBe('BASICA');
    });
  });

  describe('computePricing', () => {
    it('cobertura básica, conductor adulto: solo base y depósito $1000', () => {
      expect(computePricing({ dailyPrice: 50, days: 3, coverage: 'BASICA', driverAge: 30 })).toEqual({
        days: 3, base: 150, coverage: 0, surcharge: 0, total: 150, deposit: 1000,
      });
    });
    it('cobertura total suma $18/día y no pide depósito', () => {
      const p = computePricing({ dailyPrice: 50, days: 2, coverage: 'TOTAL', driverAge: 30 });
      expect(p.coverage).toBe(36);
      expect(p.total).toBe(136);
      expect(p.deposit).toBe(0);
    });
    it('conductor joven suma recargo de $8/día', () => {
      const p = computePricing({ dailyPrice: 40, days: 5, coverage: 'BASICA', driverAge: 21 });
      expect(p.surcharge).toBe(40);
      expect(p.total).toBe(240);
    });
    it('redondea a 2 decimales', () => {
      const p = computePricing({ dailyPrice: 33.333, days: 3, coverage: 'BASICA', driverAge: 30 });
      expect(p.base).toBe(100);
    });
  });
});
