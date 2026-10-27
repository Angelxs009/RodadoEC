import {
  Body, Controller, Get, Headers, HttpCode, HttpException, HttpStatus, Param, Post, Put, Query, Req, Res, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  driverUnderage, InvalidParam, invalidParams, MIN_LEGAL_AGE, needsAgeSurcharge, normalizeCoverage, notFound, rentalDays, SURCHARGE_PER_DAY,
} from '@autos/common';
import { randomUUID } from 'crypto';
import { Backends } from '../backends';
import { V2AccessGuard, V2Roles } from '../common/auth';
import { IdempotencyInterceptor, IdempotencyKeyGuard } from '../common/idempotency';
import {
  CATEGORIES, CatalogData, checkTrip, coverageOptions, cooldownResponse, fleetItem, isDate, isEmail, isInt, isText, locationMatches,
  orderToV2, promoToV2, resolveLocation, throwIfInvalid, TRANSMISSIONS, transmissionOf, categoryOf, vehicleCard, ESTADO,
} from './support';

const VERSION = '2.0.0';
const COVERAGE_INPUT = ['BASICA', 'TOTAL', 'PREMIUM'];

/**
 * Contrato REST v2 del agregador Booking Prototipo (contracts/autos-openapi-v2.yaml, ruta /api/v2).
 * Es una fachada sobre los microservicios por gRPC. El contrato se publica tal cual en /api/docs/v2; este
 * controlador no se documenta con decoradores propios para que la única fuente de verdad sea el archivo.
 */
@Controller('v2/autos')
@ApiExcludeController()
export class AutosV2Controller {
  private snapshot?: CatalogData;

  constructor(private readonly backends: Backends) {}

  // ══ Lectura del catálogo con tolerancia a fallos (último dato válido como respaldo) ════════════
  /**
   * Catálogo completo (autos, agencias, proveedores). Si Catálogo no responde (timeout o Circuit Breaker
   * abierto) se sirve la última copia válida y se avisa con la cabecera X-Data-Source: fallback-cache.
   */
  private async catalogData(res?: any): Promise<CatalogData> {
    try {
      const [v, d, s] = await Promise.all([
        this.backends.catalog.call<any>('GetVehicles', {}),
        this.backends.catalog.call<any>('ListDepots', {}),
        this.backends.catalog.call<any>('ListSuppliers', {}),
      ]);
      this.snapshot = { vehicles: v.vehicles, depots: d.depots, suppliers: s.suppliers };
      return this.snapshot;
    } catch (err) {
      if (err instanceof HttpException && err.getStatus() >= 502 && this.snapshot) {
        res?.setHeader('X-Data-Source', 'fallback-cache');
        return this.snapshot;
      }
      throw err;
    }
  }

  private vehicleOr404(cat: CatalogData, id: string) {
    const v = cat.vehicles.find((x) => x.vehicle_id === id || x.id === id);
    if (!v) throw notFound('Vehículo no encontrado', `Vehículo "${id}" no encontrado en la flota.`);
    return v;
  }

  private base(req: any) {
    return `${req.protocol}://${req.get('host')}/api/v2`;
  }

  // ══ Telemetría ═════════════════════════════════════════════════════════════
  @Get('health')
  async health() {
    const probe = async (fn: () => Promise<any>) => {
      const started = Date.now();
      try {
        return { up: true, ms: Date.now() - started, value: await fn() };
      } catch (err: any) {
        // Un error de dominio (404/401…) significa que el servicio respondió: está vivo.
        return { up: !(err instanceof HttpException) || err.getStatus() < 502, ms: Date.now() - started, value: null };
      }
    };
    const [catalog, booking, payments, identity] = await Promise.all([
      probe(() => this.backends.catalog.call('GetVehicles', {})),
      probe(() => this.backends.booking.call('ListWebhooks', {})),
      probe(() => this.backends.payments.call('GetPayment', { payment_reference: 'health-check' })),
      probe(() => this.backends.identity.call('VerifyToken', { token: 'health-check' })),
    ]);
    const states = [this.backends.catalog, this.backends.booking, this.backends.payments, this.backends.identity].map((c) => c.breakerState);
    const circuit = states.includes('OPEN') ? 'OPEN' : states.includes('HALF_OPEN') ? 'HALF_OPEN' : 'CLOSED';
    const core = catalog.up && booking.up;
    const status = !core ? 'DOWN' : payments.up && identity.up ? 'HEALTHY' : 'DEGRADED';

    if (status === 'DOWN') {
      throw new HttpException(
        {
          type: 'https://booking.epn.edu.ec/errors/service-unavailable',
          title: 'Nodo de autos no disponible',
          status: HttpStatus.SERVICE_UNAVAILABLE,
          detail: `Agencia de alquiler no disponible (Circuit Breaker ${circuit === 'OPEN' ? 'abierto' : 'en recuperación'}): ${!catalog.up ? 'catálogo' : 'reservas'} no responde.`,
          code: 'SERVICE_UNAVAILABLE',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const vehicles: any[] = catalog.value?.vehicles ?? [];
    return {
      status,
      nodo_id: process.env.NODE_ID ?? 'NODE_AUT_LOCAL',
      nombre_proveedor: process.env.NODE_NAME ?? 'RodadoEc (Flota Partner)',
      vertical: 'AUTOS',
      version: VERSION,
      uptime_seconds: Math.round(process.uptime()),
      latencia_ms: Math.max(catalog.ms, booking.ms, payments.ms, identity.ms),
      circuit_breaker_estado: circuit,
      cooldown_activo_count: vehicles.filter((v) => v.status === 'CLEANING').length,
      total_vehiculos: vehicles.length,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('eventos')
  @UseGuards(V2AccessGuard)
  async eventos(@Query('limit') limitRaw?: string, @Query('after') after?: string) {
    const limit = limitRaw === undefined ? 10 : Number(limitRaw);
    if (!isInt(limit, 1, 100)) {
      throw invalidParams('Parámetros de consulta inválidos.', [{ name: 'limit', reason: 'Debe ser un entero entre 1 y 100.' }]);
    }
    const r = await this.backends.booking.call<any>('ListEvents', { limit, after: after ?? '' });
    return {
      events: r.events.map((e: any) => ({
        specversion: e.specversion,
        type: e.type,
        source: e.source,
        id: e.id,
        time: e.time,
        correlation_id: e.correlation_id,
        datacontenttype: e.datacontenttype,
        data: JSON.parse(e.data_json),
      })),
      metadata: { total: r.total, timestamp: r.timestamp },
    };
  }

  // ══ Promociones B2B ════════════════════════════════════════════════════════
  @Get('promociones/contrato')
  @UseGuards(V2AccessGuard)
  async getPromo() {
    return promoToV2(await this.backends.booking.call('GetPromoContract', {}));
  }

  @Put('promociones/contrato')
  @HttpCode(HttpStatus.OK)
  @UseGuards(V2AccessGuard, IdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async putPromo(@Body() b: any) {
    const bad: InvalidParam[] = [];
    if (typeof b?.permite_promociones !== 'boolean') bad.push({ name: 'permite_promociones', reason: 'Es obligatorio y debe ser booleano.' });
    const pct = b?.porcentaje_descuento_maximo;
    if (typeof pct !== 'number' || pct < 0 || pct > 100) bad.push({ name: 'porcentaje_descuento_maximo', reason: 'Es obligatorio y debe ser un número entre 0 y 100.' });
    if (b?.destinos_habilitados !== undefined && !(Array.isArray(b.destinos_habilitados) && b.destinos_habilitados.every(isText))) {
      bad.push({ name: 'destinos_habilitados', reason: 'Debe ser un arreglo de nombres de ciudad.' });
    }
    if (b?.vigencia_hasta !== undefined && !isDate(b.vigencia_hasta)) bad.push({ name: 'vigencia_hasta', reason: 'Debe ser una fecha YYYY-MM-DD.' });
    throwIfInvalid(bad);
    const saved = await this.backends.booking.call('SetPromoContract', {
      allows_promotions: b.permite_promociones,
      max_discount_percentage: b.porcentaje_descuento_maximo,
      enabled_destinations: b.destinos_habilitados ?? [],
      valid_until: b.vigencia_hasta ?? '',
      combo_conditions: b.condiciones_combo ?? '',
    });
    return {
      success: true,
      mensaje: 'Acuerdo B2B de promociones y combos actualizado exitosamente.',
      contrato: promoToV2(saved),
    };
  }

  // ══ Catálogo y búsqueda ════════════════════════════════════════════════════
  @Get()
  async list(@Res({ passthrough: true }) res: any, @Query('category') category = 'ALL', @Query('transmission') transmission = 'ALL', @Query('limit') limitRaw?: string) {
    const limit = limitRaw === undefined ? 10 : Number(limitRaw);
    const bad: InvalidParam[] = [];
    if (category !== 'ALL' && !(CATEGORIES as readonly string[]).includes(category)) bad.push({ name: 'category', reason: `Valores admitidos: ALL, ${CATEGORIES.join(', ')}.` });
    if (transmission !== 'ALL' && !(TRANSMISSIONS as readonly string[]).includes(transmission)) bad.push({ name: 'transmission', reason: 'Valores admitidos: ALL, MANUAL, AUTOMATICO.' });
    if (!isInt(limit, 1, 500)) bad.push({ name: 'limit', reason: 'Debe ser un entero positivo.' });
    throwIfInvalid(bad);

    const cat = await this.catalogData(res);
    const matches = cat.vehicles.filter(
      (v) => v.status === 'AVAILABLE' && (category === 'ALL' || categoryOf(v) === category) && (transmission === 'ALL' || transmissionOf(v) === transmission),
    );
    return { total: matches.length, limit, data: matches.slice(0, limit).map((v) => vehicleCard(v, cat)) };
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  async search(@Body() b: any, @Res({ passthrough: true }) res: any) {
    const bad: InvalidParam[] = [];
    if (!isText(b?.pickup_location)) bad.push({ name: 'pickup_location', reason: 'Es obligatorio (ciudad o código IATA).' });
    checkTrip({ pickupDate: b?.pickup_date, pickupTime: b?.pickup_time, dropoffDate: b?.dropoff_date, dropoffTime: b?.dropoff_time }, bad, true);
    if (b?.driver_age !== undefined && !isInt(b.driver_age, 0, 120)) bad.push({ name: 'driver_age', reason: 'Debe ser un entero entre 0 y 120.' });
    const category = b?.category ?? 'ALL';
    const transmission = b?.transmission ?? 'ALL';
    if (category !== 'ALL' && !(CATEGORIES as readonly string[]).includes(category)) bad.push({ name: 'category', reason: `Valores admitidos: ALL, ${CATEGORIES.join(', ')}.` });
    if (transmission !== 'ALL' && !(TRANSMISSIONS as readonly string[]).includes(transmission)) bad.push({ name: 'transmission', reason: 'Valores admitidos: ALL, MANUAL, AUTOMATICO.' });
    throwIfInvalid(bad);

    const age: number = b.driver_age ?? 30;
    if (age < MIN_LEGAL_AGE) throw driverUnderage(age);

    const cat = await this.catalogData(res);
    const loc = resolveLocation(b.pickup_location, cat.depots);
    if (!loc) {
      throw invalidParams('La ubicación de recogida no pertenece a nuestra red.', [
        { name: 'pickup_location', reason: 'Ubicación no reconocida. Usa una ciudad (Quito, Guayaquil, Cuenca) o un código IATA (UIO, GYE, CUE).' },
      ]);
    }
    const days = rentalDays(b.pickup_date, b.dropoff_date);
    // Excluye los autos que no se pueden rentar: RESERVADO, ENTREGADO, EN_MANTENIMIENTO y EN_LIMPIEZA (cooldown de 2 h).
    const found = cat.vehicles.filter(
      (v) =>
        v.status === 'AVAILABLE' &&
        v.min_driver_age <= age &&
        locationMatches(v, loc, cat.depots) &&
        (category === 'ALL' || categoryOf(v) === category) &&
        (transmission === 'ALL' || transmissionOf(v) === transmission),
    );
    const surcharge = needsAgeSurcharge(age);
    return {
      request_id: `req-autos-${randomUUID().slice(0, 6)}`,
      metadata: {
        total_results: found.length,
        surcharge_applied: surcharge,
        surcharge_amount: surcharge ? SURCHARGE_PER_DAY * days : 0,
        pickup_location: loc.airport ?? b.pickup_location,
        pickup_date: b.pickup_date,
        dropoff_date: b.dropoff_date,
      },
      data: found.map((v) => vehicleCard(v, cat, { days, driverAge: age })),
    };
  }

  @Get('flota')
  async flota(@Res({ passthrough: true }) res: any) {
    const cat = await this.catalogData(res);
    return cat.vehicles.map(fleetItem);
  }

  // ══ Reservas ═══════════════════════════════════════════════════════════════
  @Get('orders')
  @UseGuards(V2AccessGuard)
  async listOrders(@Req() req: any) {
    const r = await this.backends.booking.call<any>('ListOrders', {});
    return r.orders.map((o: any) => orderToV2(this.shape(o), this.base(req)));
  }

  @Post('orders/create')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(V2AccessGuard, IdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  createOrder(@Req() req: any, @Body() b: any, @Res({ passthrough: true }) res: any) {
    return this.create(req, b, res);
  }

  /** Alias de compatibilidad de /autos/orders/create. */
  @Post('reservas')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(V2AccessGuard, IdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  createReserva(@Req() req: any, @Body() b: any, @Res({ passthrough: true }) res: any) {
    return this.create(req, b, res);
  }

  private async create(req: any, b: any, res: any) {
    const c = b?.conductor ?? {};
    const norm = {
      vehicle_id: b?.vehicle_id ?? b?.auto_id,
      pickup_date: b?.pickup_date ?? b?.fecha_recogida,
      dropoff_date: b?.dropoff_date ?? b?.fecha_devolucion,
      pickup_time: b?.pickup_time ?? b?.hora_recogida,
      dropoff_time: b?.dropoff_time ?? b?.hora_devolucion,
      pickup_location: b?.pickup_location ?? b?.lugar_recogida,
      dropoff_location: b?.dropoff_location ?? b?.lugar_devolucion,
      coverage: b?.tipo_cobertura ?? b?.cobertura,
      name: c.nombre ?? c.nombre_completo ?? c.full_name,
      email: c.email ?? c.correo,
      phone: c.telefono ?? c.phone,
      license: c.licencia_conducir,
      license_country: c.pais_licencia,
      age: c.edad ?? c.edad_conductor ?? c.driver_age,
      flight: c.numero_vuelo,
    };
    const bad: InvalidParam[] = [];
    if (!isText(norm.vehicle_id)) bad.push({ name: 'vehicle_id', reason: 'Es obligatorio.' });
    checkTrip({ pickupDate: norm.pickup_date, pickupTime: norm.pickup_time, dropoffDate: norm.dropoff_date, dropoffTime: norm.dropoff_time }, bad, false);
    if (b?.conductor === undefined || typeof b.conductor !== 'object') bad.push({ name: 'conductor', reason: 'Es obligatorio.' });
    else {
      if (!isText(norm.name)) bad.push({ name: 'conductor.nombre', reason: 'Es obligatorio.' });
      if (!isEmail(norm.email)) bad.push({ name: 'conductor.email', reason: 'Es obligatorio y debe ser un correo válido.' });
      if (!isText(norm.phone)) bad.push({ name: 'conductor.telefono', reason: 'Es obligatorio.' });
      if (!isText(norm.license)) bad.push({ name: 'conductor.licencia_conducir', reason: 'Es obligatorio.' });
      if (norm.age !== undefined && !isInt(norm.age, 0, 120)) bad.push({ name: 'conductor.edad', reason: 'Debe ser un entero entre 0 y 120.' });
    }
    if (norm.coverage !== undefined && !COVERAGE_INPUT.includes(norm.coverage)) bad.push({ name: 'tipo_cobertura', reason: 'Valores admitidos: BASICA, TOTAL, PREMIUM.' });
    throwIfInvalid(bad);

    // Las ubicaciones son opcionales y de texto libre: si se reconocen se guardan resueltas.
    const depots = norm.pickup_location || norm.dropoff_location ? (await this.catalogData(res)).depots : [];
    const loc = (t?: string) => (t ? resolveLocation(t, depots) ?? {} : {});
    const customerId = req.principal?.role === 'CUSTOMER' ? req.principal.subject : '';

    const order = await this.backends.booking.call<any>('CreateOrderV2', {
      vehicle_id: norm.vehicle_id,
      pickup_date: norm.pickup_date,
      pickup_time: norm.pickup_time ?? '',
      dropoff_date: norm.dropoff_date,
      dropoff_time: norm.dropoff_time ?? '',
      pickup_location: loc(norm.pickup_location),
      dropoff_location: loc(norm.dropoff_location ?? norm.pickup_location),
      coverage_type: normalizeCoverage(norm.coverage),
      driver: {
        full_name: norm.name,
        email: norm.email,
        phone: norm.phone,
        license: norm.license,
        license_country: norm.license_country ?? '',
        age: norm.age ?? 0,
        flight_number: norm.flight ?? '',
      },
      customer_id: customerId,
    });
    return orderToV2(this.shape(order), this.base(req));
  }

  @Post('reservas/:id/checkin')
  @HttpCode(HttpStatus.OK)
  @UseGuards(V2AccessGuard, IdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async checkin(@Param('id') id: string, @Body() b: any) {
    const bad: InvalidParam[] = [];
    if (!isText(b?.documento_identidad)) bad.push({ name: 'documento_identidad', reason: 'Es obligatorio.' });
    if (b?.fecha_vencimiento_licencia !== undefined && !isDate(b.fecha_vencimiento_licencia)) bad.push({ name: 'fecha_vencimiento_licencia', reason: 'Debe ser una fecha YYYY-MM-DD.' });
    throwIfInvalid(bad);
    const r = await this.backends.booking.call<any>('CheckinDigital', {
      order_id: id,
      document_id: b.documento_identidad,
      license_number: b.numero_licencia ?? '',
      license_expiry: b.fecha_vencimiento_licencia ?? '',
    });
    return {
      reserva_id: r.pnr,
      pnr: r.pnr,
      checkin_status: r.checkin_status,
      fast_track_pickup: r.fast_track_pickup,
      mensaje: 'Check-in digital exitoso. Presenta tu código QR en el mostrador para retiro express.',
      voucher_qr_data: r.voucher_qr_data,
      requisitos: ['Licencia de conducir vigente (original)', 'Documento de identidad', 'Código QR del voucher digital'],
    };
  }

  @Post('orders/:id/checkin-entrega')
  @HttpCode(HttpStatus.OK)
  @UseGuards(V2AccessGuard, IdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async checkinEntrega(@Param('id') id: string, @Body() b: any) {
    const bad: InvalidParam[] = [];
    if (!isText(b?.licencia_conducir)) bad.push({ name: 'licencia_conducir', reason: 'Es obligatorio.' });
    if (!isInt(b?.km_salida, 0)) bad.push({ name: 'km_salida', reason: 'Es obligatorio y debe ser un entero mayor o igual a 0.' });
    throwIfInvalid(bad);
    const o = await this.backends.booking.call<any>('DeliverOrder', {
      order_id: id,
      license: b.licencia_conducir,
      km_salida: b.km_salida,
      technician: b.tecnico_entrega ?? '',
    });
    return {
      success: true,
      order_id: o.locator,
      pnr: o.locator,
      estado_orden: o.status,
      km_salida: o.km_salida,
      licencia_verificada: b.licencia_conducir,
      mensaje: 'Llaves entregadas al conductor. Auto en tránsito (Fase ENTREGADO).',
    };
  }

  @Post('orders/:id/checkin-devolucion')
  @HttpCode(HttpStatus.OK)
  @UseGuards(V2AccessGuard, IdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async checkinDevolucion(@Param('id') id: string, @Body() b: any) {
    const bad: InvalidParam[] = [];
    if (!isInt(b?.km_retorno, 0)) bad.push({ name: 'km_retorno', reason: 'Es obligatorio y debe ser un entero mayor o igual a 0.' });
    if (b?.nivel_combustible !== undefined && !isInt(b.nivel_combustible, 0, 100)) bad.push({ name: 'nivel_combustible', reason: 'Debe ser un porcentaje entero de 0 a 100.' });
    throwIfInvalid(bad);
    const r = await this.backends.booking.call<any>('ReturnOrder', {
      order_id: id,
      km_retorno: b.km_retorno,
      fuel_level: b.nivel_combustible ?? 0,
      notes: b.observaciones ?? '',
    });
    return {
      success: true,
      order_id: r.order.locator,
      pnr: r.order.locator,
      estado_orden: r.order.status,
      km_retorno: r.order.km_retorno,
      km_recorridos: r.km_driven,
      cooldown: cooldownResponse(r),
      alerta_mantenimiento: r.maintenance_alert || 'Kilometraje en rango normal.',
    };
  }

  @Get('orders/:orderId')
  @UseGuards(V2AccessGuard)
  async getOrder(@Req() req: any, @Param('orderId') orderId: string) {
    return orderToV2(this.shape(await this.backends.booking.call('GetOrder', { order_id: orderId })), this.base(req));
  }

  @Post('orders/:orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(V2AccessGuard, IdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async cancel(@Param('orderId') orderId: string, @Body() b: any) {
    if (b?.solicitante !== undefined && !['CLIENTE', 'SAGA_ORCHESTRATOR', 'ADMIN'].includes(b.solicitante)) {
      throw invalidParams('Parámetros inválidos.', [{ name: 'solicitante', reason: 'Valores admitidos: CLIENTE, SAGA_ORCHESTRATOR, ADMIN.' }]);
    }
    const r = await this.backends.booking.call<any>('CancelOrderV2', { order_id: orderId });
    return {
      order_id: r.order.locator,
      pnr: r.order.locator,
      status: r.order.status,
      auto_id: r.vehicle_id,
      refund: { ...r.refund },
      inventory_restoration: { status: 'RESTORED', vehicle_id: r.vehicle_id, new_state: ESTADO[r.vehicle_state] ?? 'DISPONIBLE' },
      message: 'Orden de renta cancelada exitosamente. Vehículo liberado y reembolso procesado.',
    };
  }

  // ══ Flota y mantenimiento (las rutas con :id van al final) ═════════════════
  @Get(':id/coberturas')
  async coberturas(@Param('id') id: string, @Res({ passthrough: true }) res: any) {
    return coverageOptions(this.vehicleOr404(await this.catalogData(res), id));
  }

  @Get(':id')
  async detail(@Param('id') id: string, @Res({ passthrough: true }) res: any) {
    const cat = await this.catalogData(res);
    return vehicleCard(this.vehicleOr404(cat, id), cat);
  }

  @Post(':id/devolucion')
  @HttpCode(HttpStatus.OK)
  @UseGuards(V2AccessGuard, IdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async devolucion(@Param('id') id: string) {
    return cooldownResponse(await this.backends.booking.call<any>('ReturnVehicle', { vehicle_id: id }));
  }

  @Post(':id/mantenimiento/registro')
  @HttpCode(HttpStatus.OK)
  @V2Roles('MANTENIMIENTO', 'ADMIN')
  @UseGuards(V2AccessGuard, IdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async mantenimiento(@Param('id') id: string, @Body() b: any, @Headers('x-role') _role?: string) {
    const bad: InvalidParam[] = [];
    if (!isInt(b?.kilometraje_registrado, 0)) bad.push({ name: 'kilometraje_registrado', reason: 'Es obligatorio y debe ser un entero mayor o igual a 0.' });
    if (!isInt(b?.nivel_combustible, 0, 100)) bad.push({ name: 'nivel_combustible', reason: 'Es obligatorio y debe ser un porcentaje entero de 0 a 100.' });
    if (!isText(b?.tecnico_id)) bad.push({ name: 'tecnico_id', reason: 'Es obligatorio.' });
    if (b?.nuevo_proximo_mantenimiento_km !== undefined && !isInt(b.nuevo_proximo_mantenimiento_km, 1)) bad.push({ name: 'nuevo_proximo_mantenimiento_km', reason: 'Debe ser un entero positivo.' });
    throwIfInvalid(bad);

    const r = await this.backends.booking.call<any>('RegisterMaintenance', {
      vehicle_id: id,
      technician_id: b.tecnico_id,
      odometer_km: b.kilometraje_registrado,
      fuel_level: b.nivel_combustible,
      body_condition: b.condiciones_carroceria ?? '',
      tires_condition: b.estado_neumaticos ?? '',
      notes: b.observaciones ?? '',
      maintenance_done: !!b.mantenimiento_realizado,
      new_next_maintenance_km: b.nuevo_proximo_mantenimiento_km ?? 0,
    });
    const v = r.vehicle;
    return {
      auto_id: v.vehicle_id,
      marca_modelo: `${v.make} ${v.model}`,
      kilometraje_actual: v.odometer_km,
      proximo_mantenimiento_km: v.next_maintenance_km,
      mantenimiento_requerido: r.alert,
      alerta_preventiva: r.alert
        ? `ALERTA PREVENTIVA: El vehículo ha superado el límite de ${v.next_maintenance_km} km. Mantenimiento requerido.`
        : 'Sin alertas: el kilometraje está dentro del umbral preventivo.',
      nivel_combustible: `${b.nivel_combustible}%`,
      bitacora_id: r.log_id,
      timestamp: r.timestamp,
    };
  }

  /** Normaliza un Order gRPC (sin nulos): el reembolso solo existe si tiene id. */
  private shape(o: any) {
    return { ...o, refund: o.refund?.refund_id ? o.refund : null, pricing: o.pricing?.days ? o.pricing : null };
  }
}
