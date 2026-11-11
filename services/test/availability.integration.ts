// El gateway completo (JWT, gRPC) no hace falta aquí: solo la lógica pura.
jest.mock('@autos/common', () => ({ CORRELATION_HEADER: 'x-correlation-id', currentCorrelationId: () => undefined, unauthorized: (m: string) => new Error(m), JwtTokens: class {}, }), { virtual: true });
jest.mock('../apps/gateway/src/backends', () => ({ Backends: class {} }));
import { conflictsWithOrders, ecuadorMs, effectiveStatus, isFreeForDates } from '../libs/common/src/availability';
import { BookingNotifier } from '../apps/gateway/src/v2/booking-notifier';
import { hasNodeApiKey } from '../apps/gateway/src/common/auth';

/** Pruebas sin red ni base de datos: disponibilidad por fechas y aviso a Booking solo de sus reservas. */
const order = (vehicle_id: string, pickup: string, dropoff: string, status = 'CONFIRMED') => ({
  status,
  vehicle: { vehicle_id },
  route: { pickup: { datetime: `${pickup}T10:00:00-05:00` }, dropoff: { datetime: `${dropoff}T10:00:00-05:00` } },
});
const car = { vehicle_id: 'tracker', status: 'AVAILABLE' };
const at = (d: string, t = '10:00') => ecuadorMs(`${d}T${t}`);

describe('Disponibilidad por fechas', () => {
  const orders = [order('tracker', '2026-11-10', '2026-11-12')];

  it('el auto reservado el 10 de noviembre sigue libre del 25 al 27', () => {
    expect(isFreeForDates(car, orders, at('2026-11-25'), at('2026-11-27'))).toBe(true);
  });

  it('se bloquea en las fechas de la reserva y se cruza con ellas', () => {
    expect(isFreeForDates(car, orders, at('2026-11-10'), at('2026-11-12'))).toBe(false);
    expect(isFreeForDates(car, orders, at('2026-11-11'), at('2026-11-14'))).toBe(false);
    expect(isFreeForDates(car, orders, at('2026-11-08'), at('2026-11-10', '12:00'))).toBe(false);
  });

  it('respeta las 2 h de limpieza tras la devolución', () => {
    expect(isFreeForDates(car, orders, at('2026-11-12', '11:00'), at('2026-11-13'))).toBe(false); // dentro de la limpieza
    expect(isFreeForDates(car, orders, at('2026-11-12', '12:30'), at('2026-11-13'))).toBe(true);
    expect(isFreeForDates(car, orders, at('2026-11-08'), at('2026-11-10', '08:30'))).toBe(false); // su propia limpieza antes de la recogida
    expect(isFreeForDates(car, orders, at('2026-11-08'), at('2026-11-10', '07:00'))).toBe(true);
  });

  it('una reserva cancelada o completada no bloquea', () => {
    expect(conflictsWithOrders([order('tracker', '2026-11-10', '2026-11-12', 'CANCELLED')], at('2026-11-10'), at('2026-11-12'))).toBe(false);
    expect(conflictsWithOrders([order('tracker', '2026-11-10', '2026-11-12', 'COMPLETADA')], at('2026-11-10'), at('2026-11-12'))).toBe(false);
  });

  it('una entrega vencida sigue ocupando el auto hasta que se devuelva', () => {
    const now = at('2026-11-15');
    const out = [order('tracker', '2026-11-10', '2026-11-12', 'ENTREGADO')];
    expect(conflictsWithOrders(out, at('2026-11-15', '11:00'), at('2026-11-16'), now)).toBe(true);
  });

  it('mantenimiento y limpieza vigente bloquean; RESERVED manual sin orden bloquea', () => {
    expect(isFreeForDates({ vehicle_id: 'x', status: 'MAINTENANCE' }, [], at('2026-11-25'), at('2026-11-27'))).toBe(false);
    const cleaning = { vehicle_id: 'x', status: 'CLEANING', available_from: '2026-11-10T20:00:00-05:00' };
    expect(isFreeForDates(cleaning, [], at('2026-11-10', '18:00'), at('2026-11-11'))).toBe(false);
    expect(isFreeForDates(cleaning, [], at('2026-11-25'), at('2026-11-27'))).toBe(true);
    expect(isFreeForDates({ vehicle_id: 'x', status: 'RESERVED' }, [], at('2026-11-25'), at('2026-11-27'))).toBe(false);
  });

  it('el estado RESERVADO solo se muestra mientras la reserva está en curso', () => {
    expect(effectiveStatus(car, orders, at('2026-11-05'))).toBe('AVAILABLE');
    expect(effectiveStatus(car, orders, at('2026-11-11'))).toBe('RESERVED');
    expect(effectiveStatus(car, orders, at('2026-11-20'))).toBe('AVAILABLE');
    expect(effectiveStatus({ vehicle_id: 'tracker', status: 'DELIVERED' }, orders, at('2026-11-20'))).toBe('DELIVERED');
  });
});

describe('Aviso de entrega a Booking', () => {
  const OLD = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD };
    jest.restoreAllMocks();
  });
  const identity = { call: jest.fn().mockResolvedValue({ client_id: 'cli-1' }) };
  const notifier = new BookingNotifier({ identity } as any);
  const base = { locator: 'CARAB234', delivered_at: '2026-11-10T15:00:00Z', driver_details: { email: 'a@b.com', first_name: 'Ana', last_name: 'Paz' } };

  it('no avisa de una reserva hecha en la web propia', async () => {
    process.env.NODE_API_KEY = 'k-nodo';
    const spy = jest.spyOn(global, 'fetch' as any);
    const r = await notifier.notifyDelivery({ ...base, source: 'WEB' }, {});
    expect(r.notified).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('avisa de una reserva de Booking con la X-API-Key del nodo, CONFIRMADO_ASISTIDO y el PNR como external_order_id', async () => {
    process.env.NODE_API_KEY = 'k-nodo';
    delete process.env.BOOKING_API_KEY;
    const spy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: true, status: 200 } as any);
    const r = await notifier.notifyDelivery({ ...base, source: 'BOOKING' }, { adminId: 'op-1' });
    expect(r.notified).toBe(true);
    const [url, init] = spy.mock.calls[0] as [string, any];
    expect(url).toContain('/api/v3/reservas/CARAB234/checkin');
    expect(init.headers['X-API-Key']).toBe('k-nodo');
    const body = JSON.parse(init.body);
    expect(body.estado).toBe('CONFIRMADO_ASISTIDO');
    expect(body.external_order_id).toBe('CARAB234');
  });

  it('una reserva es de Booking solo si llega con la X-API-Key del nodo', () => {
    process.env.NODE_API_KEY = 'k-nodo';
    expect(hasNodeApiKey({ headers: { 'x-api-key': 'k-nodo' } })).toBe(true);
    expect(hasNodeApiKey({ headers: { 'x-api-key': 'otra' } })).toBe(false);
    expect(hasNodeApiKey({ headers: {} })).toBe(false);
    delete process.env.NODE_API_KEY;
    delete process.env.BOOKING_API_KEY;
    expect(hasNodeApiKey({ headers: { 'x-api-key': '' } })).toBe(false);
  });
});
