import {
  computePricing, COVERAGE_RULES, Coverage, InvalidParam, invalidParams, needsAgeSurcharge, normalizeCoverage, rentalDays,
} from '@autos/common';

/**
 * Soporte del contrato REST v2 (autos-openapi-v2.yaml): traducción de los mensajes gRPC (inglés, 6 estados
 * internos) a los esquemas en español del contrato, y validación de entradas con `invalid_params` (RFC 7807).
 */

// ── Máquina de estados ──────────────────────────────────────────────────────
export const ESTADO: Record<string, string> = {
  AVAILABLE: 'DISPONIBLE',
  RESERVED: 'RESERVADO',
  READY_FOR_DELIVERY: 'LISTO_PARA_ENTREGAR',
  DELIVERED: 'ENTREGADO',
  CLEANING: 'EN_LIMPIEZA',
  MAINTENANCE: 'EN_MANTENIMIENTO',
};

export const CATEGORIES = ['ECONOMICO', 'COMPACTO', 'SUV', 'PREMIUM', 'VAN'] as const;
export const TRANSMISSIONS = ['MANUAL', 'AUTOMATICO'] as const;

export function categoryOf(v: any): string {
  const t = String(v.car_type ?? '').toLowerCase();
  if (t.includes('suv')) return 'SUV';
  if (t.includes('van') || t.includes('minivan')) return 'VAN';
  if (t.includes('compact')) return 'COMPACTO';
  return v.price_per_day >= 60 ? 'PREMIUM' : 'ECONOMICO'; // sedanes: por tarifa
}

export const transmissionOf = (v: any) => (/auto/i.test(String(v.transmission)) ? 'AUTOMATICO' : 'MANUAL');

const ASSETS = () => (process.env.PUBLIC_ASSETS_URL ?? '').replace(/\/$/, '');
const absolute = (url: string) => (!url ? '' : /^https?:\/\//.test(url) ? url : `${ASSETS()}${url}`);

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ── Fechas y horas ──────────────────────────────────────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLOT_RE = /^([01]\d|2[0-3]):(00|30)$/;

export const isDate = (s: unknown): s is string =>
  typeof s === 'string' && DATE_RE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
export const isSlot = (s: unknown): s is string => typeof s === 'string' && SLOT_RE.test(s);

/** Fecha de hoy en Ecuador (YYYY-MM-DD). */
export const todayEcuador = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date());

export function checkTrip(b: { pickupDate: any; pickupTime?: any; dropoffDate: any; dropoffTime?: any }, bad: InvalidParam[], requireTimes: boolean) {
  const pd = { name: 'pickup_date', ok: isDate(b.pickupDate) };
  const dd = { name: 'dropoff_date', ok: isDate(b.dropoffDate) };
  if (!pd.ok) bad.push({ name: pd.name, reason: 'Debe ser una fecha válida en formato YYYY-MM-DD.' });
  if (!dd.ok) bad.push({ name: dd.name, reason: 'Debe ser una fecha válida en formato YYYY-MM-DD.' });
  for (const [name, val] of [['pickup_time', b.pickupTime], ['dropoff_time', b.dropoffTime]] as const) {
    if (val === undefined && !requireTimes) continue;
    if (!isSlot(val)) bad.push({ name, reason: 'Debe ser una franja de 30 minutos en formato HH:00 o HH:30.' });
  }
  if (pd.ok && b.pickupDate < todayEcuador()) bad.push({ name: 'pickup_date', reason: 'La fecha de recogida no puede ser en el pasado.' });
  if (pd.ok && dd.ok) {
    if (b.dropoffDate < b.pickupDate) bad.push({ name: 'dropoff_date', reason: 'La fecha de devolución no puede ser anterior a la de recogida.' });
    else if (b.dropoffDate === b.pickupDate && isSlot(b.pickupTime) && isSlot(b.dropoffTime) && b.dropoffTime <= b.pickupTime) {
      bad.push({ name: 'dropoff_time', reason: 'La hora de devolución debe ser posterior a la de recogida el mismo día.' });
    }
  }
}

export function throwIfInvalid(bad: InvalidParam[]) {
  if (bad.length) throw invalidParams('Uno o más campos no cumplen con el contrato.', bad);
}

export const isInt = (n: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;
export const isEmail = (s: unknown): s is string => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
export const isText = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;

// ── Ubicaciones ─────────────────────────────────────────────────────────────
const CITY_NAMES: Record<string, number> = { quito: 1, guayaquil: 2, cuenca: 3 };

/** Resuelve el texto libre del contrato (IATA, ciudad o nombre de agencia) a {airport?, city_id?}. */
export function resolveLocation(text: string, depots: any[]): { airport?: string; city_id?: number } | null {
  const iata = /\b(UIO|GYE|CUE)\b/i.exec(text)?.[1]?.toUpperCase();
  if (iata && depots.some((d) => d.airport === iata)) return { airport: iata };
  const n = normalize(text);
  const depot = depots.find((d) => n.includes(normalize(d.name)) || normalize(d.name).includes(n));
  if (depot) return { city_id: depot.city_id };
  for (const [name, id] of Object.entries(CITY_NAMES)) if (n.includes(name)) return { city_id: id };
  return null;
}

export const locationMatches = (v: any, loc: { airport?: string; city_id?: number } | null, depots: any[]) => {
  if (!loc) return true;
  const d = depots.find((x) => x.depot_id === v.depot_id);
  if (!d) return false;
  return loc.airport ? d.airport === loc.airport : d.city_id === loc.city_id;
};

// ── Mapeadores a los esquemas del contrato ──────────────────────────────────
export interface CatalogData {
  vehicles: any[];
  depots: any[];
  suppliers: any[];
}

export function vehicleCard(v: any, cat: CatalogData, opts: { days?: number; driverAge?: number; coverage?: Coverage } = {}) {
  const depot = cat.depots.find((d) => d.depot_id === v.depot_id);
  const supplier = cat.suppliers.find((s) => s.supplier_id === v.supplier_id);
  const days = opts.days ?? 1;
  const total = opts.days
    ? computePricing({ dailyPrice: v.price_per_day, days, coverage: opts.coverage ?? 'BASICA', driverAge: opts.driverAge ?? 30 }).total
    : v.price_per_day;
  const category = categoryOf(v);
  const transmission = transmissionOf(v);
  const photo = absolute(v.image_url);
  const mantenimiento_requerido = v.odometer_km >= v.next_maintenance_km;
  return {
    vehicle_id: v.vehicle_id,
    marca: v.make,
    modelo: v.model,
    categoria: category,
    precio_diario: v.price_per_day,
    precio_total: total,
    moneda: 'USD',
    transmision: transmission,
    asientos: v.seats,
    puertas: v.doors,
    maletas_grandes: v.bag_capacity,
    maletas_pequenas: v.bag_capacity > 0 ? 1 : 0,
    aire_acondicionado: true,
    kilometraje_ilimitado: true,
    politica_combustible: 'LLENO_A_LLENO',
    cancelacion_gratuita: true,
    proveedor: {
      nombre: supplier?.name ?? `Proveedor ${v.supplier_id}`,
      rating: Number(((depot?.score ?? 0) * 2).toFixed(1)),
      ubicacion: depot?.name ?? '',
    },
    estado: ESTADO[v.status] ?? 'DISPONIBLE',
    kilometraje_actual: v.odometer_km,
    proximo_mantenimiento_km: v.next_maintenance_km,
    mantenimiento_requerido,
    foto_url: photo,
    images: photo ? [photo] : [],
    // alias canónicos (el contrato publica ambos nombres)
    auto_id: v.vehicle_id,
    id: v.vehicle_id,
    brand: v.make,
    model: v.model,
    category,
    daily_price: v.price_per_day,
    total_price_usd: total,
    currency: 'USD',
    transmission,
    seats: v.seats,
    doors: v.doors,
    air_conditioning: true,
    unlimited_mileage: true,
    fuel_policy: 'Lleno a Lleno (Full-to-Full)',
    free_cancellation: true,
  };
}

export function fleetItem(v: any) {
  const cleaning = v.status === 'CLEANING' && !!v.available_from;
  const ms = cleaning ? new Date(v.available_from).getTime() - Date.now() : 0;
  return {
    id: v.vehicle_id,
    marca: v.make,
    modelo: v.model,
    categoria: categoryOf(v),
    precio_diario: v.price_per_day,
    estado_operativo: ESTADO[v.status] ?? 'DISPONIBLE',
    cooldown_activo: cleaning && ms > 0,
    segundos_restantes_cooldown: Math.max(0, Math.floor(ms / 1000)),
    disponible_estimado_at: cleaning ? v.available_from : null,
    kilometraje_actual: v.odometer_km,
    umbral_mantenimiento_km: v.next_maintenance_km,
    alerta_mantenimiento: v.odometer_km >= v.next_maintenance_km,
    foto_url: absolute(v.image_url),
  };
}

export function coverageOptions(v: any) {
  const options = [
    {
      tipo: 'BASICA' as const,
      nombre: 'Protección Básica (Incluida)',
      descripcion: `Franquicia de $${COVERAGE_RULES.BASICA.franchise.toFixed(2)} ante daños y depósito de garantía retenido en tarjeta de crédito.`,
      beneficios: ['Responsabilidad civil obligatoria', 'Kilometraje ilimitado', 'Cancelación gratuita'],
    },
    {
      tipo: 'TOTAL' as const,
      nombre: 'Cobertura Total / Protección Premium',
      descripcion: 'Elimina totalmente la franquicia ante daños en carrocería, cristales, neumáticos, bajos y pérdida de llaves.',
      beneficios: ['Franquicia $0.00', 'Sin depósito de garantía', 'Cristales, neumáticos y bajos', 'Pérdida de llaves', 'Kilometraje ilimitado'],
    },
  ];
  return {
    auto_id: v.vehicle_id,
    vehiculo: `${v.make} ${v.model}`,
    opciones: options.map((o) => ({
      ...o,
      costo_adicional_diario: COVERAGE_RULES[o.tipo].dailyCost,
      franquicia: COVERAGE_RULES[o.tipo].franchise,
      deposito_garantia: COVERAGE_RULES[o.tipo].deposit,
    })),
  };
}

const orderStatus = (s: string) => s;

export function orderToV2(o: any, base: string) {
  const cancelled = o.status === 'CANCELLED';
  const autoId = o.vehicle?.vehicle_id ?? '';
  const refund = o.refund?.refund_id ? { ...o.refund } : null;
  const pricing = o.pricing ?? { days: 1, base: o.total_price, coverage: 0, surcharge: 0 };
  const status = orderStatus(o.status);
  const body: Record<string, unknown> = {
    order_id: o.locator,
    pnr: o.locator,
    status,
    auto_id: autoId,
    tipo_cobertura: o.coverage_type || 'BASICA',
    deposito_garantia: o.deposit ?? 0,
    total_price: {
      currency: o.currency,
      total: o.total_price,
      desglose: { dias: pricing.days, tarifa_base: pricing.base, cobertura: pricing.coverage, recargo_edad: pricing.surcharge },
    },
    voucher_qr_data: `BOOKING-CAR-${o.locator}-${autoId}-${status}`,
    checklist_mostrador: [
      'Licencia de conducir vigente (original)',
      'Documento de identidad',
      o.deposit > 0 ? `Tarjeta de crédito para el depósito de garantía ($${Number(o.deposit).toFixed(2)})` : 'Sin depósito de garantía (Cobertura Total)',
    ],
    refund,
    _links: {
      self: { href: `${base}/autos/orders/${o.locator}` },
      ...(o.status === 'CONFIRMED'
        ? {
            checkin: { href: `${base}/autos/reservas/${o.locator}/checkin`, method: 'POST' },
            cancel: { href: `${base}/autos/orders/${o.locator}/cancel`, method: 'POST' },
          }
        : {}),
    },
    codigo_reserva: o.locator,
    estado: status,
    moneda: o.currency,
    precio_total_monto: o.total_price,
  };
  if (cancelled && refund) {
    body.reembolso_id = refund.refund_id;
    body.monto_reembolsado = refund.amount;
  }
  if (o.status === 'COMPLETADA' && o.returned_at) {
    const start = new Date(o.returned_at).getTime();
    const end = start + 120 * 60_000;
    body.cooldown_info = {
      cooldown_horas: 2,
      cooldown_minutos: 120,
      activo: Date.now() < end,
      inicio_cooldown: new Date(start).toISOString(),
      fin_cooldown: new Date(end).toISOString(),
      proximo_estado: 'DISPONIBLE',
    };
  }
  return body;
}

export function cooldownResponse(r: { vehicle: any; cooldown_hours: number; available_from: string }) {
  const v = r.vehicle;
  return {
    auto_id: v.vehicle_id,
    vehiculo: `${v.make} ${v.model}`,
    estado: ESTADO[v.status] ?? 'EN_LIMPIEZA',
    cooldown_horas: r.cooldown_hours,
    disponible_desde: r.available_from,
    mensaje: `Vehículo en ciclo de limpieza y desinfección. Estará disponible en ${r.cooldown_hours} horas.`,
  };
}

export function promoToV2(p: any) {
  return {
    proveedor_codigo: p.provider_code,
    nombre_socio: p.partner_name,
    vertical: p.vertical,
    permite_promociones: p.allows_promotions,
    porcentaje_descuento_maximo: p.max_discount_percentage,
    destinos_habilitados: p.enabled_destinations ?? [],
    ...(p.valid_until ? { vigencia_hasta: p.valid_until } : {}),
    condiciones_combo: p.combo_conditions ?? '',
  };
}

export { needsAgeSurcharge, normalizeCoverage, rentalDays };
