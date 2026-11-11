import {
  CLEANING_MINUTES, blockedByVehicleState, conflictsWithOrders, ecuadorMs, effectiveStatus, isFreeForDates, orderWindow,
} from '@autos/common';

const order = (status: string, pickup: string, dropoff: string, vehicle_id = 'V1') => ({
  status,
  vehicle: { vehicle_id },
  route: { pickup: { datetime: pickup }, dropoff: { datetime: dropoff } },
});
const ms = (s: string) => new Date(s).getTime();
const CLEAN = CLEANING_MINUTES * 60_000;

describe('availability', () => {
  describe('ecuadorMs', () => {
    it('interpreta una fecha sin zona como UTC-5', () => {
      expect(ecuadorMs('2026-12-01')).toBe(ms('2026-12-01T00:00:00-05:00'));
      expect(ecuadorMs('2026-12-01', true)).toBe(ms('2026-12-01T23:59:00-05:00'));
      expect(ecuadorMs('2026-12-01T10:30')).toBe(ms('2026-12-01T10:30:00-05:00'));
    });
    it('respeta un offset explícito y devuelve NaN si no hay valor', () => {
      expect(ecuadorMs('2026-12-01T10:00:00Z')).toBe(ms('2026-12-01T10:00:00Z'));
      expect(ecuadorMs(undefined)).toBeNaN();
      expect(ecuadorMs('')).toBeNaN();
    });
  });

  describe('orderWindow', () => {
    it('solo CONFIRMED y ENTREGADO bloquean', () => {
      expect(orderWindow(order('CANCELLED', '2026-12-01T10:00:00Z', '2026-12-02T10:00:00Z'))).toBeNull();
      expect(orderWindow(order('CONFIRMED', '2026-12-01T10:00:00Z', '2026-12-02T10:00:00Z'))).not.toBeNull();
    });
    it('la ventana termina en devolución + limpieza', () => {
      const w = orderWindow(order('CONFIRMED', '2026-12-01T10:00:00Z', '2026-12-02T10:00:00Z'))!;
      expect(w.start).toBe(ms('2026-12-01T10:00:00Z'));
      expect(w.end).toBe(ms('2026-12-02T10:00:00Z') + CLEAN);
    });
    it('una entrega vencida sigue ocupando hasta "ahora"', () => {
      const now = ms('2026-12-10T00:00:00Z');
      const w = orderWindow(order('ENTREGADO', '2026-12-01T10:00:00Z', '2026-12-02T10:00:00Z'), now)!;
      expect(w.end).toBe(now + CLEAN);
    });
    it('fechas inválidas → null', () => {
      expect(orderWindow({ status: 'CONFIRMED', route: {} })).toBeNull();
    });
  });

  describe('conflictsWithOrders', () => {
    const orders = [order('CONFIRMED', '2026-12-10T10:00:00Z', '2026-12-12T10:00:00Z')];
    it('detecta solape', () => {
      expect(conflictsWithOrders(orders, ms('2026-12-11T00:00:00Z'), ms('2026-12-13T00:00:00Z'))).toBe(true);
    });
    it('rango antes o después no choca', () => {
      expect(conflictsWithOrders(orders, ms('2026-12-01T00:00:00Z'), ms('2026-12-05T00:00:00Z'))).toBe(false);
      expect(conflictsWithOrders(orders, ms('2026-12-20T00:00:00Z'), ms('2026-12-22T00:00:00Z'))).toBe(false);
    });
    it('respeta la limpieza: pedir 1h después de devolver choca, tras 2h no', () => {
      const ret = ms('2026-12-12T10:00:00Z');
      expect(conflictsWithOrders(orders, ret + 60 * 60_000, ret + 5 * 3600_000)).toBe(true);
      expect(conflictsWithOrders(orders, ret + CLEAN, ret + CLEAN + 3600_000)).toBe(false);
    });
    it('una orden cancelada no choca', () => {
      const cancelled = [order('CANCELLED', '2026-12-10T10:00:00Z', '2026-12-12T10:00:00Z')];
      expect(conflictsWithOrders(cancelled, ms('2026-12-11T00:00:00Z'), ms('2026-12-11T05:00:00Z'))).toBe(false);
    });
  });

  describe('blockedByVehicleState', () => {
    const from = ms('2026-12-01T00:00:00Z');
    it('mantenimiento bloquea siempre', () => {
      expect(blockedByVehicleState({ status: 'MAINTENANCE' }, from, false)).toBe(true);
    });
    it('limpieza bloquea hasta available_from', () => {
      const v = { status: 'CLEANING', available_from: '2026-12-02T00:00:00Z' };
      expect(blockedByVehicleState(v, from, false)).toBe(true);
      expect(blockedByVehicleState(v, ms('2026-12-03T00:00:00Z'), false)).toBe(false);
      expect(blockedByVehicleState({ status: 'CLEANING' }, from, false)).toBe(true);
    });
    it('RESERVED manual sin órdenes bloquea; con órdenes no', () => {
      expect(blockedByVehicleState({ status: 'RESERVED' }, from, false)).toBe(true);
      expect(blockedByVehicleState({ status: 'RESERVED' }, from, true)).toBe(false);
    });
    it('AVAILABLE no bloquea', () => {
      expect(blockedByVehicleState({ status: 'AVAILABLE' }, from, false)).toBe(false);
    });
  });

  describe('isFreeForDates', () => {
    const orders = [
      order('CONFIRMED', '2026-12-10T10:00:00Z', '2026-12-12T10:00:00Z', 'V1'),
      order('CONFIRMED', '2026-12-10T10:00:00Z', '2026-12-12T10:00:00Z', 'V2'),
    ];
    it('el auto con orden solapada no está libre; un auto sin órdenes sí', () => {
      const f = ms('2026-12-11T00:00:00Z');
      const t = ms('2026-12-11T12:00:00Z');
      expect(isFreeForDates({ vehicle_id: 'V1', status: 'AVAILABLE' }, orders, f, t)).toBe(false);
      expect(isFreeForDates({ vehicle_id: 'V3', status: 'AVAILABLE' }, orders, f, t)).toBe(true);
    });
    it('fuera de la ventana el auto reservado sigue libre', () => {
      expect(isFreeForDates({ vehicle_id: 'V1', status: 'RESERVED' }, orders, ms('2026-12-20T00:00:00Z'), ms('2026-12-21T00:00:00Z'))).toBe(true);
    });
  });

  describe('effectiveStatus', () => {
    const orders = [order('CONFIRMED', '2026-12-10T10:00:00Z', '2026-12-12T10:00:00Z')];
    it('reserva futura: sigue AVAILABLE', () => {
      expect(effectiveStatus({ vehicle_id: 'V1', status: 'AVAILABLE' }, orders, ms('2026-12-01T00:00:00Z'))).toBe('AVAILABLE');
    });
    it('reserva en curso: RESERVED', () => {
      expect(effectiveStatus({ vehicle_id: 'V1', status: 'AVAILABLE' }, orders, ms('2026-12-11T00:00:00Z'))).toBe('RESERVED');
    });
    it('DELIVERED/CLEANING/MAINTENANCE se respetan', () => {
      for (const s of ['DELIVERED', 'CLEANING', 'MAINTENANCE']) {
        expect(effectiveStatus({ vehicle_id: 'V1', status: s }, orders)).toBe(s);
      }
    });
    it('marca manual RESERVED sin órdenes se conserva', () => {
      expect(effectiveStatus({ vehicle_id: 'V9', status: 'RESERVED' }, orders)).toBe('RESERVED');
    });
    it('READY_FOR_DELIVERY con orden se conserva', () => {
      expect(effectiveStatus({ vehicle_id: 'V1', status: 'READY_FOR_DELIVERY' }, orders, ms('2026-12-01T00:00:00Z'))).toBe('READY_FOR_DELIVERY');
    });
  });
});
