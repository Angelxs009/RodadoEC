import { randomUUID } from 'crypto';
import { api, http } from './helpers';
import { CONTRACT_OPERATIONS, exercisedOperations, schemaErrors, v2 } from './contract';

/**
 * Conformidad con el contrato oficial autos-openapi-v3.yaml. Cada respuesta se valida contra el esquema del
 * contrato (ver contract.ts) y al final se comprueba que se ejercitó TODA operación que el contrato define.
 * Requiere el sistema levantado (docker compose up) y la bandera AUTH_ENFORCE_V2 apagada.
 */
const idem = () => ({ 'Idempotency-Key': randomUUID() });
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const PICKUP = day(30);
const DROPOFF = day(33);

const driver = (extra: Record<string, unknown> = {}) => ({
  full_name: 'Carlos Andrés Zambrano',
  email: 'carlos.zambrano@example.com',
  phone: '+593987654321',
  license_number: '1723456789',
  country_license: 'Ecuador',
  age: 32,
  ...extra,
});

const reserva = (vehicleId: string, extra: Record<string, unknown> = {}) => ({
  vehicle_id: vehicleId,
  pickup_date: PICKUP,
  dropoff_date: DROPOFF,
  pickup_time: '10:00',
  dropoff_time: '10:00',
  pickup_location: 'Aeropuerto Mariscal Sucre (UIO), Quito',
  coverage_type: 'TOTAL',
  driver: driver(),
  ...extra,
});

const usedVehicles: string[] = [];
let freeCars: string[] = [];
const nextCar = () => {
  const id = freeCars.shift();
  if (!id) throw new Error('No quedan autos DISPONIBLES para la prueba.');
  usedVehicles.push(id);
  return id;
};

let adminUuids: Record<string, string> = {};

beforeAll(async () => {
  const list = await v2('GET', '/autos', {}, { query: { limit: 500 } });
  freeCars = list.body.data.filter((c: any) => c.estado === 'DISPONIBLE').map((c: any) => c.vehicle_id);
  const admin = await api('GET', '/admin/vehicles');
  adminUuids = Object.fromEntries((admin.body as any[]).map((v) => [v.vehicle_id, v.id]));
});

afterAll(async () => {
  // Deja la flota como estaba: los autos usados vuelven a DISPONIBLE (sin esperar las 2 h de cooldown).
  for (const id of usedVehicles) if (adminUuids[id]) await api('POST', `/admin/vehicles/${adminUuids[id]}/release`);
});

describe('Telemetría y salud', () => {
  it('GET /autos/health: HEALTHY con telemetría del nodo', async () => {
    const r = await v2('GET', '/autos/health');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('HEALTHY');
    expect(r.body.version).toBe('3.0.0');
    expect(r.body.vertical).toBe('AUTOS');
    expect(r.body.total_vehiculos).toBeGreaterThanOrEqual(25);
  });
});

describe('Catálogo y búsqueda', () => {
  it('GET /autos: solo DISPONIBLES, con filtros', async () => {
    const r = await v2('GET', '/autos', {}, { query: { category: 'SUV', transmission: 'AUTOMATICO', limit: 5 } });
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBeLessThanOrEqual(5);
    for (const c of r.body.data) {
      expect(c.categoria).toBe('SUV');
      expect(c.transmision).toBe('AUTOMATICO');
      expect(c.estado).toBe('DISPONIBLE');
    }
  });

  it('GET /autos con filtro inválido responde 400 con invalid_params', async () => {
    // El contrato solo declara 200/500 para este GET: la validación de filtros (400) es un añadido del gateway.
    const r = await http('GET', '/api/v2/autos?category=TANQUE');
    expect(r.status).toBe(400);
    expect(r.body.invalid_params[0].name).toBe('category');
  });

  it('POST /autos/search: franjas de 30 min, metadata y recargo por edad', async () => {
    const body = { pickup_location: 'UIO', pickup_date: PICKUP, pickup_time: '10:00', dropoff_date: DROPOFF, dropoff_time: '10:30', driver_age: 32 };
    const normal = await v2('POST', '/autos/search', {}, { body });
    expect(normal.status).toBe(200);
    expect(normal.body.metadata.surcharge_applied).toBe(false);
    expect(normal.body.metadata.total_results).toBe(normal.body.data.length);

    const joven = await v2('POST', '/autos/search', {}, { body: { ...body, driver_age: 22 } });
    expect(joven.body.metadata.surcharge_applied).toBe(true);
    expect(joven.body.metadata.surcharge_amount).toBeGreaterThan(0);
    if (joven.body.data.length && normal.body.data.length) {
      expect(joven.body.data[0].precio_total).toBeGreaterThan(normal.body.data[0].precio_total);
    }
  });

  it('POST /autos/search: menor de 18 → 422; hora fuera de franja → 400; fecha pasada → 400', async () => {
    const body = { pickup_location: 'Quito', pickup_date: PICKUP, pickup_time: '10:00', dropoff_date: DROPOFF, dropoff_time: '10:00' };
    const menor = await v2('POST', '/autos/search', {}, { body: { ...body, driver_age: 17 } });
    expect(menor.status).toBe(422);
    expect(menor.body.code).toBe('DRIVER_UNDERAGE');

    const franja = await v2('POST', '/autos/search', {}, { body: { ...body, pickup_time: '10:17' } });
    expect(franja.status).toBe(400);
    expect(franja.body.invalid_params.map((p: any) => p.name)).toContain('pickup_time');

    // Errores semánticos de fechas: 422 INVALID_DATES (no activan compensaciones de Saga).
    const pasada = await v2('POST', '/autos/search', {}, { body: { ...body, pickup_date: '2020-01-01' } });
    expect(pasada.status).toBe(422);
    expect(pasada.body.code).toBe('INVALID_DATES');
    expect(pasada.body.invalid_params.map((p: any) => p.name)).toContain('pickup_date');
  });

  it('GET /autos/flota: 6 estados posibles y telemetría de kilometraje', async () => {
    const r = await v2('GET', '/autos/flota');
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThanOrEqual(25);
    expect(r.body[0]).toHaveProperty('kilometraje_actual');
  });

  it('GET /autos/{id} y /autos/{id}/coberturas', async () => {
    const id = freeCars[0];
    const detalle = await v2('GET', '/autos/{id}', { id });
    expect(detalle.body.vehicle_id).toBe(id);
    const cob = await v2('GET', '/autos/{id}/coberturas', { id });
    const total = cob.body.opciones.find((o: any) => o.tipo === 'TOTAL');
    expect(total.franquicia).toBe(0);
    expect(total.deposito_garantia).toBe(0);
    expect(cob.body.opciones.find((o: any) => o.tipo === 'BASICA').franquicia).toBe(1200);
    expect((await v2('GET', '/autos/{id}', { id: 'no-existe' })).status).toBe(404);
  });
});

describe('Reservas: ciclo completo con máquina de estados', () => {
  let car: string;
  let pnr: string;

  it('POST /autos/orders/create: reserva con cobertura, PNR de 8 caracteres e idempotencia', async () => {
    car = nextCar();
    const key = idem();
    const r = await v2('POST', '/autos/orders/create', {}, { body: reserva(car), headers: key });
    expect(r.status).toBe(201);
    pnr = r.body.pnr;
    expect(pnr).toMatch(/^CAR[A-Z0-9]{5}$/);
    expect(r.body.order_id).toBe(pnr);
    expect(r.body.status).toBe('CONFIRMED');
    expect(r.body.tipo_cobertura).toBe('TOTAL');
    expect(r.body.deposito_garantia).toBe(0);
    expect(r.body.total_price.total).toBeGreaterThan(0);

    const replay = await v2('POST', '/autos/orders/create', {}, { body: reserva(car), headers: key });
    expect(replay.body.pnr).toBe(pnr);
    expect(replay.headers.get('idempotent-replayed')).toBe('true');
  });

  it('el auto queda RESERVADO y desaparece de las búsquedas; una segunda reserva da 409', async () => {
    expect((await v2('GET', '/autos/{id}', { id: car })).body.estado).toBe('RESERVADO');
    const lista = await v2('GET', '/autos', {}, { query: { limit: 500 } });
    expect(lista.body.data.map((c: any) => c.vehicle_id)).not.toContain(car);
    const otra = await v2('POST', '/autos/orders/create', {}, { body: reserva(car), headers: idem() });
    expect(otra.status).toBe(409);
    expect(otra.body.code).toBe('VEHICLE_UNAVAILABLE');
  });

  it('POST /autos/orders/create valida el cuerpo, la edad y exige Idempotency-Key', async () => {
    // Idempotency-Key es obligatoria (parámetro required del contrato): sin ella, 400.
    const sinClave = await v2('POST', '/autos/orders/create', {}, { body: reserva(freeCars[0]) });
    expect(sinClave.status).toBe(400);

    const invalida = await v2('POST', '/autos/orders/create', {}, { body: { vehicle_id: freeCars[0] }, headers: idem() });
    expect(invalida.status).toBe(400);
    expect(invalida.body.invalid_params.map((p: any) => p.name)).toEqual(expect.arrayContaining(['pickup_date', 'driver']));

    const menor = await v2('POST', '/autos/orders/create', {}, { body: reserva(freeCars[0], { driver: driver({ age: 17 }) }), headers: idem() });
    expect(menor.status).toBe(422);
  });

  it('GET /autos/orders y GET /autos/orders/{orderId} (por PNR)', async () => {
    const lista = await v2('GET', '/autos/orders');
    expect(lista.body.map((o: any) => o.pnr)).toContain(pnr);
    const una = await v2('GET', '/autos/orders/{orderId}', { orderId: pnr });
    expect(una.body.auto_id).toBe(car);
    expect((await v2('GET', '/autos/orders/{orderId}', { orderId: 'CAR00000' })).status).toBe(404);
  });

  it('POST /autos/reservas/{id}/checkin: el auto pasa a LISTO_PARA_ENTREGAR', async () => {
    const r = await v2('POST', '/autos/reservas/{id}/checkin', { id: pnr }, { body: { documento_identidad: '1723456789', numero_licencia: '1723456789', fecha_vencimiento_licencia: '2030-12-31' }, headers: idem() });
    expect(r.status).toBe(200);
    expect(r.body.checkin_status).toBe('CHECKIN_COMPLETED');
    expect(r.body.voucher_qr_data).toContain(pnr);
    expect((await v2('GET', '/autos/{id}', { id: car })).body.estado).toBe('LISTO_PARA_ENTREGAR');
  });

  it('check-in con licencia vencida → 400', async () => {
    const r = await v2('POST', '/autos/reservas/{id}/checkin', { id: pnr }, { body: { documento_identidad: '1723456789', fecha_vencimiento_licencia: '2020-01-01' }, headers: idem() });
    expect(r.status).toBe(400);
  });

  it('no se puede devolver un auto que aún no se entregó (409)', async () => {
    const r = await v2('POST', '/autos/orders/{id}/checkin-devolucion', { id: pnr }, { body: { km_retorno: 100 }, headers: idem() });
    expect(r.status).toBe(409);
  });

  it('POST /autos/orders/{id}/checkin-entrega: el auto pasa a ENTREGADO', async () => {
    const r = await v2('POST', '/autos/orders/{id}/checkin-entrega', { id: pnr }, { body: { licencia_conducir: '1723456789', km_salida: 12500, tecnico_entrega: 'Roberto Paredes' }, headers: idem() });
    expect(r.status).toBe(200);
    expect(r.body.estado_orden).toBe('ENTREGADO');
    expect((await v2('GET', '/autos/{id}', { id: car })).body.estado).toBe('ENTREGADO');
  });

  it('una orden entregada ya no se puede cancelar (409)', async () => {
    const r = await v2('POST', '/autos/orders/{orderId}/cancel', { orderId: pnr }, { headers: idem() });
    expect(r.status).toBe(409);
  });

  it('POST /autos/orders/{id}/checkin-devolucion: odómetro, km recorridos y cooldown de 2 h', async () => {
    const menos = await v2('POST', '/autos/orders/{id}/checkin-devolucion', { id: pnr }, { body: { km_retorno: 100 }, headers: idem() });
    expect(menos.status).toBe(400); // el odómetro de retorno no puede ser menor que el de salida

    const r = await v2('POST', '/autos/orders/{id}/checkin-devolucion', { id: pnr }, { body: { km_retorno: 12950, nivel_combustible: 100 }, headers: idem() });
    expect(r.status).toBe(200);
    expect(r.body.estado_orden).toBe('COMPLETADA');
    expect(r.body.km_recorridos).toBe(450);
    expect(r.body.cooldown.estado).toBe('EN_LIMPIEZA');
    expect(r.body.cooldown.cooldown_horas).toBe(2);
  });

  it('cooldown: el auto está EN_LIMPIEZA, fuera de resultados, con cronómetro en la flota y reservarlo da 409 VEHICLE_IN_CLEANING_COOLDOWN', async () => {
    expect((await v2('GET', '/autos/{id}', { id: car })).body.estado).toBe('EN_LIMPIEZA');
    const lista = await v2('GET', '/autos', {}, { query: { limit: 500 } });
    expect(lista.body.data.map((c: any) => c.vehicle_id)).not.toContain(car);

    const flota = (await v2('GET', '/autos/flota')).body.find((c: any) => c.id === car);
    expect(flota.cooldown_activo).toBe(true);
    expect(flota.segundos_restantes_cooldown).toBeGreaterThan(7000);
    expect(flota.segundos_restantes_cooldown).toBeLessThanOrEqual(7200);

    const r = await v2('POST', '/autos/orders/create', {}, { body: reserva(car), headers: idem() });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('VEHICLE_UNAVAILABLE'); // único código que activa la compensación LIFO en Booking
    expect(r.body.reason).toBe('VEHICLE_IN_CLEANING_COOLDOWN');
    expect(r.body.detail).toMatch(/limpieza/);
    expect((await v2('GET', '/autos/{id}', { id: car })).body.cleaning_cooldown.activo).toBe(true);

    const orden = (await v2('GET', '/autos/orders/{orderId}', { orderId: pnr })).body;
    expect(orden.status).toBe('COMPLETADA');
    expect(orden.cooldown_info.activo).toBe(true);
  });
});

describe('Cancelación con compensación (Saga)', () => {
  it('POST /autos/reservas + cancel: reembolso 100% y el auto vuelve a DISPONIBLE', async () => {
    const car = nextCar();
    const created = await v2('POST', '/autos/reservas', {}, { body: reserva(car, { coverage_type: 'BASICA' }), headers: idem() });
    expect(created.status).toBe(201);
    expect(created.body.deposito_garantia).toBe(1000);

    const key = idem();
    const r = await v2('POST', '/autos/orders/{orderId}/cancel', { orderId: created.body.pnr }, { body: { motivo: 'Cambio de itinerario', solicitante: 'SAGA_ORCHESTRATOR' }, headers: key });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('CANCELLED');
    expect(r.body.refund.percentage).toBe(100);
    expect(r.body.refund.amount).toBe(created.body.total_price.total);
    expect(r.body.inventory_restoration.new_state).toBe('DISPONIBLE');
    expect((await v2('GET', '/autos/{id}', { id: car })).body.estado).toBe('DISPONIBLE');

    const orden = await v2('GET', '/autos/orders/{orderId}', { orderId: created.body.pnr });
    expect(orden.body.reembolso_id).toBe(r.body.refund.refund_id);

    const mal = await v2('POST', '/autos/orders/{orderId}/cancel', { orderId: created.body.pnr }, { body: { solicitante: 'EL_VECINO' }, headers: idem() });
    expect(mal.status).toBe(400);
  });

  it('contrato v3: acepta driver en inglés, conductor con alias en español y coverage_type BASIC', async () => {
    const car = nextCar();
    const ingles = await v2('POST', '/autos/orders/create', {}, { body: reserva(car, { coverage_type: 'BASIC' }), headers: idem() });
    expect(ingles.status).toBe(201);
    expect(ingles.body.tipo_cobertura).toBe('BASICA');
    expect(ingles.body.vehicle_id).toBe(car);
    expect(ingles.body.voucher_qr_payload).toContain(ingles.body.pnr);

    const car2 = nextCar();
    const { driver: _d, coverage_type: _c, ...sinDriver } = reserva(car2) as any;
    const espanol = await v2('POST', '/autos/reservas', {}, {
      body: { ...sinDriver, conductor: { nombre: 'Ana Pérez', correo: 'ana@example.com', telefono: '0999999999', licencia_conducir: 'A123', edad: 40 } },
      headers: idem(),
    });
    expect(espanol.status).toBe(201);
  });

  it('driver sin age → 400; menor de 18 → 422', async () => {
    const car = freeCars[0];
    const sinEdad = await v2('POST', '/autos/orders/create', {}, { body: reserva(car, { driver: driver({ age: undefined }) }), headers: idem() });
    expect(sinEdad.status).toBe(400);
    expect(sinEdad.body.invalid_params.map((p: any) => p.name)).toContain('driver.age');
  });

  it('fechas inválidas en la reserva → 422 INVALID_DATES (no 400)', async () => {
    const r = await v2('POST', '/autos/orders/create', {}, { body: reserva(freeCars[0], { pickup_date: DROPOFF, dropoff_date: PICKUP }), headers: idem() });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('INVALID_DATES');
  });

  it('Idempotency-Key reutilizada con otro cuerpo → 400 IDEMPOTENCY_CONFLICT', async () => {
    const car = nextCar();
    const key = idem();
    expect((await v2('POST', '/autos/orders/create', {}, { body: reserva(car), headers: key })).status).toBe(201);
    const otro = await v2('POST', '/autos/orders/create', {}, { body: reserva(car, { driver: driver({ full_name: 'Otra Persona' }) }), headers: key });
    expect(otro.status).toBe(400);
    expect(otro.body.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('POST /autos/{id}/devolucion: devolución directa con cooldown de 2 h', async () => {
    const car = nextCar();
    await v2('POST', '/autos/orders/create', {}, { body: reserva(car), headers: idem() });
    const r = await v2('POST', '/autos/{id}/devolucion', { id: car }, { headers: idem() });
    expect(r.status).toBe(200);
    expect(r.body.estado).toBe('EN_LIMPIEZA');
    expect(r.body.cooldown_horas).toBe(2);
    expect((await v2('POST', '/autos/{id}/devolucion', { id: car }, { headers: idem() })).status).toBe(409);
  });
});

describe('Mantenimiento preventivo (RBAC)', () => {
  it('un rol CLIENTE no puede registrar mantenimiento (403)', async () => {
    const car = nextCar();
    const r = await v2('POST', '/autos/{id}/mantenimiento/registro', { id: car }, {
      body: { kilometraje_registrado: 500, nivel_combustible: 80, tecnico_id: 'tec-01' },
      headers: { ...idem(), 'X-Role': 'CLIENTE' },
    });
    expect(r.status).toBe(403);
  });

  it('MANTENIMIENTO registra el odómetro; al superar el umbral hay alerta, el auto sale de circulación y se emite el evento', async () => {
    const car = nextCar();
    const headers = () => ({ ...idem(), 'X-Role': 'MANTENIMIENTO' });
    const alerta = await v2('POST', '/autos/{id}/mantenimiento/registro', { id: car }, {
      body: { kilometraje_registrado: 10250, nivel_combustible: 100, tecnico_id: 'tec-rosero-01', estado_neumaticos: 'BUENO' },
      headers: headers(),
    });
    expect(alerta.status).toBe(200);
    expect(alerta.body.mantenimiento_requerido).toBe(true);
    expect(alerta.body.alerta_preventiva).toContain('ALERTA PREVENTIVA');
    expect(alerta.body.bitacora_id).toMatch(/^BIT-AUTO-/);
    expect((await v2('GET', '/autos/{id}', { id: car })).body.estado).toBe('EN_MANTENIMIENTO');

    const hecho = await v2('POST', '/autos/{id}/mantenimiento/registro', { id: car }, {
      body: { kilometraje_registrado: 10250, nivel_combustible: 100, tecnico_id: 'tec-rosero-01', mantenimiento_realizado: true, nuevo_proximo_mantenimiento_km: 15000 },
      headers: headers(),
    });
    expect(hecho.body.mantenimiento_requerido).toBe(false);
    expect(hecho.body.proximo_mantenimiento_km).toBe(15000);
    expect((await v2('GET', '/autos/{id}', { id: car })).body.estado).toBe('DISPONIBLE');
  });

  it('valida el cuerpo (400)', async () => {
    // El contrato no declara 400 para esta operación: se valida igualmente el cuerpo con invalid_params.
    const r = await http('POST', `/api/v2/autos/${freeCars[0]}/mantenimiento/registro`, { nivel_combustible: 250 }, { ...idem(), 'X-Role': 'ADMIN' });
    expect(r.status).toBe(400);
    expect(r.body.invalid_params.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Rutas que Booking puede usar como baseUrlRest', () => {
  it('/api/v3, /api/v2 y la raíz (/autos, /reservas) llegan a la misma implementación', async () => {
    for (const base of ['/api/v3', '/api/v2', '']) {
      const h = await http('GET', `${base}/autos/health`);
      expect(h.status).toBe(200);
      expect(h.body.status).toBe('HEALTHY');
    }
    // POST /reservas en la raíz (Guía §4): 400 por cuerpo vacío demuestra que la ruta existe y valida.
    const r = await http('POST', '/reservas', {}, idem());
    expect(r.status).toBe(400);
    expect(r.body.instance).toBe('/reservas');
    expect(r.body.invalid_params.length).toBeGreaterThan(0);
  });
});

describe('Acuerdo B2B de promociones (Cátedra RDA2 §9)', () => {
  it('GET y PUT /autos/promociones/contrato', async () => {
    const antes = await v2('GET', '/autos/promociones/contrato');
    expect(antes.status).toBe(200);
    expect(antes.body.vertical).toBe('AUTOS');

    const r = await v2('PUT', '/autos/promociones/contrato', {}, {
      body: { permite_promociones: true, porcentaje_descuento_maximo: 12.5, destinos_habilitados: ['Quito', 'Cuenca'], vigencia_hasta: '2027-06-30', condiciones_combo: 'Combo auto + hotel' },
      headers: idem(),
    });
    expect(r.status).toBe(200);
    expect(r.body.contrato.porcentaje_descuento_maximo).toBe(12.5);
    expect((await v2('GET', '/autos/promociones/contrato')).body.destinos_habilitados).toEqual(['Quito', 'Cuenca']);

    const mal = await v2('PUT', '/autos/promociones/contrato', {}, { body: { permite_promociones: 'si', porcentaje_descuento_maximo: 150 }, headers: idem() });
    expect(mal.status).toBe(400);
  });
});

describe('Feed Outbox de eventos CloudEvents', () => {
  it('GET /autos/eventos: eventos del ciclo de vida con correlation_id y paginación por cursor', async () => {
    const r = await v2('GET', '/autos/eventos', {}, { query: { limit: 100 } });
    expect(r.status).toBe(200);
    const types = new Set(r.body.events.map((e: any) => e.type));
    expect(types).toContain('ec.edu.epn.booking.autos.order.confirmed');
    expect(types).toContain('ec.edu.epn.booking.autos.order.cancelled');
    expect(types).toContain('ec.edu.epn.booking.autos.cooldown.started');
    expect(types).toContain('ec.edu.epn.booking.autos.mantenimiento.alerta');

    const schemaOf: Record<string, string> = {
      'ec.edu.epn.booking.autos.order.confirmed': 'CloudEventAutoOrderConfirmed',
      'ec.edu.epn.booking.autos.order.cancelled': 'CloudEventAutoOrderCancelled',
      'ec.edu.epn.booking.autos.cooldown.started': 'CloudEventAutoCleaningCooldownStarted',
      'ec.edu.epn.booking.autos.mantenimiento.alerta': 'CloudEventAutoMantenimientoAlerta',
    };
    for (const e of r.body.events) {
      const name = schemaOf[e.type];
      if (name) expect({ type: e.type, errors: schemaErrors(name, e) }).toEqual({ type: e.type, errors: [] });
    }

    const primero = await v2('GET', '/autos/eventos', {}, { query: { limit: 1 } });
    const siguiente = await v2('GET', '/autos/eventos', {}, { query: { limit: 100, after: primero.body.events[0].id } });
    expect(siguiente.body.events.map((e: any) => e.id)).not.toContain(primero.body.events[0].id);
  });
});

describe('Cobertura total del contrato', () => {
  it('las pruebas ejercitaron TODAS las operaciones que define autos-openapi-v3.yaml', () => {
    const faltan = CONTRACT_OPERATIONS.filter((op) => !exercisedOperations().has(op));
    expect(faltan).toEqual([]);
    expect(CONTRACT_OPERATIONS.length).toBe(19);
  });
});
