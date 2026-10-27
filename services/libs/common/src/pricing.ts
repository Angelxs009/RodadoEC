/**
 * Reglas de precio del contrato REST v2 (coberturas y recargo por edad), compartidas por el gateway
 * (búsqueda y coberturas) y el servicio de Reservas (cobro de la orden) para que ambos cuadren al centavo.
 */
export type Coverage = 'BASICA' | 'TOTAL';

export const COVERAGE_RULES: Record<Coverage, { dailyCost: number; franchise: number; deposit: number }> = {
  // Protección básica (incluida): franquicia de $1,200 y depósito retenido en tarjeta de crédito.
  BASICA: { dailyCost: 0, franchise: 1200, deposit: 1000 },
  // Cobertura total / premium: sin franquicia ni depósito.
  TOTAL: { dailyCost: 18, franchise: 0, deposit: 0 },
};

/** Recargo diario para conductores jóvenes (<25) o seniors (>70). */
export const SURCHARGE_PER_DAY = 8;
export const MIN_LEGAL_AGE = 18;

export const needsAgeSurcharge = (age: number) => age < 25 || age > 70;

const round2 = (n: number) => Number(n.toFixed(2));

/** Días de renta entre dos fechas YYYY-MM-DD (mínimo 1). */
export function rentalDays(pickupDate: string, dropoffDate: string): number {
  const ms = new Date(`${dropoffDate}T00:00:00Z`).getTime() - new Date(`${pickupDate}T00:00:00Z`).getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

export function normalizeCoverage(value?: string): Coverage {
  return value === 'TOTAL' || value === 'PREMIUM' ? 'TOTAL' : 'BASICA';
}

export function computePricing(p: { dailyPrice: number; days: number; coverage: Coverage; driverAge: number }) {
  const base = round2(p.dailyPrice * p.days);
  const coverage = round2(COVERAGE_RULES[p.coverage].dailyCost * p.days);
  const surcharge = needsAgeSurcharge(p.driverAge) ? round2(SURCHARGE_PER_DAY * p.days) : 0;
  return {
    days: p.days,
    base,
    coverage,
    surcharge,
    total: round2(base + coverage + surcharge),
    deposit: COVERAGE_RULES[p.coverage].deposit,
  };
}
