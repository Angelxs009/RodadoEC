import { api, DECLINED_CARD, DRIVER, http, idem, OK_CARD, previewAndPay } from './helpers';

/**
 * Pruebas de integración de extremo a extremo: golpean el API Gateway real y atraviesan los cuatro
 * microservicios por gRPC (Catálogo, Reservas, Pagos, Identidad). Requieren el sistema levantado
 * (docker compose up, o GATEWAY_URL apuntando a Render).
 */
describe('Gateway · salud y trazabilidad', () => {
  it('/warmup confirma que los 4 microservicios responden', async () => {
    const r = await http('GET', '/warmup');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ok');
    expect(r.body.services.map((s: any) => s.service).sort()).toEqual([
      'booking-service',
      'catalog-service',
      'identity-service',
      'payments-service',
    ]);
  });

  it('devuelve X-Correlation-Id y respeta el que envía el cliente', async () => {
    const r = await http('GET', '/health', undefined, { 'X-Correlation-Id': 'test-corr-123' });
    expect(r.headers.get('x-correlation-id')).toBe('test-corr-123');
    const r2 = await http('GET', '/health');
    expect(r2.headers.get('x-correlation-id')).toMatch(/[0-9a-f-]{8,}/);
  });
});

describe('Catálogo (REST → gRPC)', () => {
  it('/details lista al menos 25 vehículos distintos', async () => {
    const r = await api('POST', '/details', {});
    expect(r.status).toBe(200);
    expect(new Set(r.body.data.map((v: any) => v.vehicle_id)).size).toBeGreaterThanOrEqual(25);
  });

  it('/depots, /suppliers y /constants responden', async () => {
    for (const p of ['/depots', '/suppliers', '/constants']) expect((await api('POST', p, {})).status).toBe(200);
  });

  it('valida el cuerpo con ProblemDetails (400 VALIDATION_FAILED)', async () => {
    const r = await api('POST', '/orders/hold', {});
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_FAILED');
  });
});

describe('Saga de reserva (Reservas → Catálogo + Pagos)', () => {
  it('rechaza crear la orden sin pago aprobado (402)', async () => {
    const { previewId } = await previewAndPay(DECLINED_CARD);
    const r = await api(
      'POST',
      '/orders/create',
      { order_preview_id: previewId, payment_reference: 'NO-EXISTE', driver_details: DRIVER },
      idem(),
    );
    expect(r.status).toBe(402);
  });

  it('un pago rechazado devuelve 402 PAYMENT_DECLINED', async () => {
    const { pay } = await previewAndPay(DECLINED_CARD);
    expect(pay.status).toBe(402);
    expect(pay.body.code).toBe('PAYMENT_DECLINED');
  });

  it('flujo feliz: pago → orden → auto RESERVADO → no se reserva de nuevo → cancelar libera el auto', async () => {
    const ctx = await previewAndPay(OK_CARD);
    expect(ctx.pay.status).toBe(201);
    expect(ctx.pay.body.status).toBe('APPROVED');

    const key = idem();
    const body = {
      order_preview_id: ctx.previewId,
      payment_reference: ctx.pay.body.payment_reference,
      driver_details: DRIVER,
    };
    const create = await api('POST', '/orders/create', body, key);
    expect(create.status).toBe(201);
    expect(create.body.status).toBe('CONFIRMED');
    const order = create.body;

    // Idempotencia real: misma clave → misma respuesta, sin duplicar.
    const replay = await api('POST', '/orders/create', body, key);
    expect(replay.body.order_id).toBe(order.order_id);
    expect(replay.headers.get('idempotent-replayed')).toBe('true');

    // El auto queda RESERVED y no admite otro hold.
    const details = await api('POST', '/details', {});
    expect(details.body.data.find((v: any) => v.vehicle_id === ctx.car.vehicle_id).status).toBe('RESERVED');
    const again = await api('POST', '/orders/hold', { vehicle_id: ctx.car.vehicle_id, search_token: ctx.token });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('CAR_NO_LONGER_AVAILABLE');

    // Cancelar compensa: el auto vuelve a AVAILABLE.
    const cancel = await api('POST', `/orders/${order.order_id}/cancel`, undefined, idem());
    expect(cancel.status).toBe(200);
    const after = await api('POST', '/details', {});
    expect(after.body.data.find((v: any) => v.vehicle_id === ctx.car.vehicle_id).status).toBe('AVAILABLE');
    expect((await api('GET', `/orders/${order.order_id}`)).body.status).toBe('CANCELLED');
  });
});

describe('Identidad y seguridad', () => {
  const email = `it-${Date.now()}@test.com`;
  let token: string;

  it('registra un cliente y devuelve un JWT', async () => {
    const r = await api('POST', '/auth/register', { email, password: 'clave12345', first_name: 'It', last_name: 'Test' });
    expect(r.status).toBe(201);
    token = r.body.token;
    expect(token.split('.')).toHaveLength(3);
  });

  it('inicia sesión con credenciales válidas y rechaza las inválidas', async () => {
    expect((await api('POST', '/auth/login', { email, password: 'clave12345' })).status).toBe(201);
    expect((await api('POST', '/auth/login', { email, password: 'incorrecta' })).status).toBe(401);
  });

  it('/auth/me reconoce el JWT del cliente y no un token manipulado', async () => {
    const ok = await api('GET', '/auth/me', undefined, { Authorization: `Bearer ${token}` });
    expect(ok.status).toBe(200);
    expect(ok.body.email).toBe(email);
    const bad = await api('GET', '/auth/me', undefined, { Authorization: `Bearer ${token}x` });
    expect(bad.body?.email).toBeUndefined();
  });

  it('el admin inicia sesión y obtiene un JWT', async () => {
    const r = await api('POST', '/admin/auth/login', {
      username: process.env.ADMIN_USERNAME ?? 'admin',
      password: process.env.ADMIN_PASSWORD ?? 'rodadoec2026',
    });
    expect([200, 201]).toContain(r.status);
    expect(r.body.token).toBeDefined();
  });
});

describe('Administración', () => {
  it('lista vehículos, agencias, órdenes y usuarios', async () => {
    for (const p of ['/admin/vehicles', '/admin/depots', '/admin/orders', '/admin/users']) {
      const r = await api('GET', p);
      // 401 solo si AUTH_ENFORCE_ADMIN=true y no se envía token.
      expect([200, 401]).toContain(r.status);
      if (r.status === 200) expect(Array.isArray(r.body)).toBe(true);
    }
  });
});

describe('GraphQL federado', () => {
  const gql = (query: string, variables?: unknown) => http('POST', '/graphql', { query, variables });

  it('expone el SDL del subgrafo (_service)', async () => {
    const r = await gql('{ _service { sdl } }');
    expect(r.body.data._service.sdl).toContain('type Vehiculo');
  });

  it('resuelve vehículos con agencia y proveedor (llamadas gRPC encadenadas)', async () => {
    const r = await gql('{ vehiculos(ciudadId: 2) { id marca agencia { nombre ciudad } proveedor { nombre } } }');
    expect(r.body.errors).toBeUndefined();
    expect(r.body.data.vehiculos.length).toBeGreaterThan(0);
    expect(r.body.data.vehiculos[0].agencia.ciudad).toBe('Guayaquil');
  });

  it('resuelve entidades federadas (_entities) para que otro subgrafo extienda Vehiculo', async () => {
    const all = await gql('{ vehiculos { id } }');
    const id = all.body.data.vehiculos[0].id;
    const r = await gql('query($r:[_Any!]!){ _entities(representations:$r){ ... on Vehiculo { id marca } } }', {
      r: [{ __typename: 'Vehiculo', id }],
    });
    expect(r.body.data._entities[0].id).toBe(id);
  });
});

describe('Clientes v3.1 (/api/v3/clientes)', () => {
  const stamp = Date.now();
  const email = `cli-${stamp}@test.com`;
  const identificacion = String(stamp).slice(-10);
  const post = (b: unknown) => http('POST', '/api/v3/clientes', b);
  let clientId: string;

  it('404 si el conductor no existe', async () => {
    const r = await http('GET', `/api/v3/clientes?email=${encodeURIComponent(email)}`);
    expect(r.status).toBe(404);
  });

  it('crea al conductor y responde 201 con su client_id', async () => {
    const r = await post({ nombre: 'Cli Test', email, identificacion, telefono: '0999', licencia: 'L-9' });
    expect(r.status).toBe(201);
    expect(r.body.client_id).toBeTruthy();
    clientId = r.body.client_id;
  });

  it('no duplica: mismo email (otra capitalización) o misma identificación devuelven el mismo client_id', async () => {
    const byMail = await post({ nombre: 'Otro', email: email.toUpperCase(), identificacion: `${identificacion}9` });
    const byId = await post({ nombre: 'Otro', email: `otro-${stamp}@test.com`, identificacion });
    expect(byMail.body.client_id).toBe(clientId);
    expect(byId.body.client_id).toBe(clientId);
  });

  it('200 con los datos al buscar por email o por identificación', async () => {
    for (const q of [`email=${encodeURIComponent(email)}`, `identificacion=${identificacion}`]) {
      const r = await http('GET', `/api/v3/clientes?${q}`);
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ client_id: clientId, nombre: 'Cli Test', email, identificacion });
    }
  });

  it('valida el cuerpo (400)', async () => {
    expect((await post({ email: 'x' })).status).toBe(400);
  });
});

describe('Webhooks', () => {
  it('registra y elimina una suscripción', async () => {
    const c = await api('POST', '/webhooks', {
      url: 'https://example.com/hook',
      events: ['CAR_ORDER_CONFIRMED'],
      secret: 'integration-secret',
    });
    expect(c.status).toBe(201);
    expect((await api('DELETE', `/webhooks/${c.body.id}`)).status).toBeLessThan(300);
  });
});
