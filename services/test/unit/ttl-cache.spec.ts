import { TtlCache } from '@autos/common';

describe('TtlCache', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-12-01T00:00:00Z')));
  afterEach(() => jest.useRealTimers());

  it('guarda y recupera un valor vigente', () => {
    const c = new TtlCache();
    c.set('k', { a: 1 }, 1000);
    expect(c.get('k')).toEqual({ a: 1 });
    expect(c.has('k')).toBe(true);
  });
  it('expira pasado el TTL', () => {
    const c = new TtlCache();
    c.set('k', 'v', 1000);
    jest.setSystemTime(new Date('2026-12-01T00:00:01.500Z'));
    expect(c.get('k')).toBeUndefined();
    expect(c.has('k')).toBe(false);
  });
  it('delete borra la clave y una clave inexistente da undefined', () => {
    const c = new TtlCache();
    c.set('k', 'v', 1000);
    c.delete('k');
    expect(c.get('k')).toBeUndefined();
    expect(c.get('nada')).toBeUndefined();
  });
});
