/**
 * Disponibilidad de un auto POR FECHAS.
 *
 * Una reserva (CONFIRMED) o una entrega en curso (ENTREGADO) ocupa al auto solo entre su recogida y su
 * devolución más el tiempo de limpieza obligatorio; fuera de esa ventana el auto sigue disponible. El estado
 * RESERVED / READY_FOR_DELIVERY / DELIVERED del auto es informativo y ya no lo bloquea para todas las fechas;
 * solo bloquean de forma global el mantenimiento, la limpieza en curso y una marca manual RESERVED sin orden.
 */
export const CLEANING_MINUTES = 120;
const BLOCKING_ORDER_STATUSES = ['CONFIRMED', 'ENTREGADO'];

export interface Window {
  start: number;
  end: number;
}

/** Interpreta "YYYY-MM-DD" / "YYYY-MM-DDTHH:mm" como hora de Ecuador (UTC-5) y devuelve milisegundos. */
export function ecuadorMs(value: string | undefined | null, endOfDay = false): number {
  if (!value) return NaN;
  const hasOffset = /(Z|[+-]\d{2}:\d{2})$/.test(value);
  if (hasOffset) return new Date(value).getTime();
  const full = value.length <= 10 ? `${value}T${endOfDay ? '23:59' : '00:00'}:00` : value.length === 16 ? `${value}:00` : value;
  return new Date(`${full}-05:00`).getTime();
}

/** Ventana que una orden ocupa: [recogida, devolución + limpieza]. Una entrega vencida sigue ocupando hasta devolverse. */
export function orderWindow(o: { status?: string; route?: any; route_details?: any }, now = Date.now()): Window | null {
  if (!BLOCKING_ORDER_STATUSES.includes(String(o.status))) return null;
  const route = o.route ?? o.route_details;
  const start = new Date(route?.pickup?.datetime).getTime();
  let end = new Date(route?.dropoff?.datetime).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (o.status === 'ENTREGADO') end = Math.max(end, now);
  return { start, end: end + CLEANING_MINUTES * 60_000 };
}

/** ¿La ventana pedida [from, to] (+ limpieza) choca con alguna de las órdenes dadas del mismo auto? */
export function conflictsWithOrders(orders: any[], fromMs: number, toMs: number, now = Date.now()): boolean {
  const reqEnd = (Number.isNaN(toMs) ? fromMs : toMs) + CLEANING_MINUTES * 60_000;
  return orders.some((o) => {
    const w = orderWindow(o, now);
    return !!w && fromMs < w.end && w.start < reqEnd;
  });
}

/**
 * Bloqueos propios del auto que no dependen de las órdenes: mantenimiento, limpieza que aún no termina para la
 * recogida pedida, o una marca manual RESERVED sin ninguna orden vigente que la explique.
 */
export function blockedByVehicleState(v: { status: string; available_from?: string }, fromMs: number, hasActiveOrders: boolean): boolean {
  if (v.status === 'MAINTENANCE') return true;
  if (v.status === 'CLEANING') return !v.available_from || fromMs < new Date(v.available_from).getTime();
  if (v.status === 'RESERVED') return !hasActiveOrders;
  return false;
}

/** Disponibilidad completa de un auto para [from, to], dadas todas las órdenes (de cualquier auto). */
export function isFreeForDates(v: { vehicle_id: string; status: string; available_from?: string }, allOrders: any[], fromMs: number, toMs: number): boolean {
  const mine = allOrders.filter((o) => (o.vehicle?.vehicle_id ?? o.vehicle_details?.vehicle_id) === v.vehicle_id && orderWindow(o));
  return !blockedByVehicleState(v, fromMs, mine.length > 0) && !conflictsWithOrders(mine, fromMs, toMs);
}

/**
 * Estado que se MUESTRA del auto: RESERVADO / LISTO_PARA_ENTREGAR solo mientras hay una reserva en curso (hoy cae
 * entre su recogida y su devolución + limpieza); ENTREGADO, EN_LIMPIEZA y EN_MANTENIMIENTO se respetan tal cual.
 * Una reserva futura no cambia el estado del auto: sigue DISPONIBLE hasta que llegue su fecha.
 */
export function effectiveStatus(v: { vehicle_id: string; status: string }, allOrders: any[], now = Date.now()): string {
  if (['DELIVERED', 'CLEANING', 'MAINTENANCE'].includes(v.status)) return v.status;
  const mine = allOrders.filter((o) => (o.vehicle?.vehicle_id ?? o.vehicle_details?.vehicle_id) === v.vehicle_id && orderWindow(o, now));
  const inProgress = mine.some((o) => {
    const w = orderWindow(o, now)!;
    return w.start <= now && now < w.end;
  });
  if (v.status === 'READY_FOR_DELIVERY' && mine.length > 0) return 'READY_FOR_DELIVERY'; // check-in digital hecho, entrega pendiente
  if (inProgress) return 'RESERVED';
  if (v.status === 'RESERVED' && mine.length === 0) return 'RESERVED'; // marca manual del administrador
  return 'AVAILABLE';
}
