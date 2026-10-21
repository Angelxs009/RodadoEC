import { randomUUID } from 'crypto';

/** URL base del API Gateway bajo prueba (local por defecto; puede apuntar a Render con GATEWAY_URL). */
export const BASE = (process.env.GATEWAY_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export interface Res<T = any> { status: number; body: T; headers: Headers }

export async function http<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res<T>> {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Affiliate-Id': '1001', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: r.status, body: parsed, headers: r.headers };
}

export const api = (method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
  http(method, `/api/v1${path}`, body, headers);

export const idem = () => ({ 'Idempotency-Key': randomUUID() });

export const OK_CARD = { holder_name: 'Test User', number: '4242424242424242', expiry_month: 12, expiry_year: 2030, cvv: '123' };
export const DECLINED_CARD = { ...OK_CARD, number: '4000000000000002' };
export const DRIVER = { first_name: 'Test', last_name: 'User', email: 'test@example.com', phone_number: '0999999999' };

/** Ruta de 3 días con fechas únicas por ejecución, para no chocar con otras reservas. */
export function route(daysAhead = 400) {
  const start = new Date(Date.now() + daysAhead * 86400000 + Math.floor(Math.random() * 300) * 86400000);
  const end = new Date(start.getTime() + 3 * 86400000);
  return {
    pickup: { datetime: start.toISOString(), location: { city_id: 2 } },
    dropoff: { datetime: end.toISOString(), location: { city_id: 2 } },
  };
}

/** Busca y bloquea un auto libre; devuelve lo necesario para continuar el flujo. */
export async function holdAvailableCar(driverAge = 30) {
  const r = route();
  const s = await api('POST', '/search', { booker: { country: 'ec' }, currency: 'USD', driver: { age: driverAge }, route: r });
  const car = s.body.data.find((c: any) => c.available !== false) ?? s.body.data[0];
  const h = await api('POST', '/orders/hold', { vehicle_id: car.vehicle_id, search_token: s.body.search_token });
  return { search: s, car, hold: h, token: s.body.search_token };
}

export async function previewAndPay(card = OK_CARD) {
  const ctx = await holdAvailableCar();
  const p = await api('POST', '/orders/preview', { vehicle_id: ctx.car.vehicle_id, search_token: ctx.token, extras: [] });
  const previewId = p.body.data.order_preview_id;
  const pay = await api('POST', '/payments', { order_preview_id: previewId, card });
  return { ...ctx, preview: p, previewId, pay };
}
