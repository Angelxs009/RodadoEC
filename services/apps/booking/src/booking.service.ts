import { HttpException, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import {
  bookingNotConfirmed,
  cancellationNotAllowed,
  carNoLongerAvailable,
  computePricing,
  driverAgeRestriction,
  driverBelowVehicleMinimum,
  driverUnderage,
  GrpcCaller,
  invalidParams,
  invalidStateTransition,
  MIN_LEGAL_AGE,
  normalizeCoverage,
  notFound,
  orderNotFound,
  orderNotModifiable,
  paymentRequired,
  priceChanged,
  rentalDays,
  TtlCache,
  vehicleInCleaningCooldown,
  vehicleInMaintenance,
  vehicleReserved,
} from '@autos/common';
import { Order, OrderStatus, PromoContract, WebhookEvent } from './entities/booking.entities';
import { dateSlotOfIso, InventoryClient, localDateSlot } from './inventory.client';
import { WebhooksService } from './webhooks.service';

const SEARCH_TTL_MS = 30 * 60 * 1000;
const HOLD_TTL_MS = 5 * 60 * 1000;
const PREVIEW_TTL_MS = 10 * 60 * 1000;
const EXTRA_PRICE_PER_DAY = 5; // tarifa mock por cada extra
const CLEANING_COOLDOWN_MINUTES = 120;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCATOR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface CachedSearch {
  vehicles: any[];
  route: any;
  driver_age: number;
}

interface CachedPreview {
  driver_age: number;
  vehicle_id: string;
  search_token: string;
  extras: string[];
  total_price: number;
  currency: string;
  route: any;
}

function daysBetween(pickup: string, dropoff: string): number {
  const ms = new Date(dropoff).getTime() - new Date(pickup).getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : '');

export function toOrderMsg(o: Order) {
  return {
    order_id: o.id,
    locator: o.locator,
    status: o.status,
    vehicle: o.vehicle_details,
    route: o.route_details,
    extras: o.extras ?? [],
    total_price: o.total_price,
    currency: o.currency,
    creation_date: o.creation_date.toISOString(),
    customer_id: o.customer_id ?? '',
    payment_reference: o.payment_reference ?? '',
    driver_details: o.driver_details ?? null,
    coverage_type: o.coverage_type ?? 'BASICA',
    deposit: o.deposit ?? 0,
    pricing: o.pricing ?? undefined,
    km_salida: o.km_salida ?? 0,
    km_retorno: o.km_retorno ?? 0,
    checkin_at: iso(o.checkin_at),
    delivered_at: iso(o.delivered_at),
    returned_at: iso(o.returned_at),
    refund: o.refund ?? undefined,
  };
}

/**
 * Servicio de Reservas: dueño de las órdenes y del flujo de compra. Orquesta a Catálogo (disponibilidad)
 * y Pagos (cobro) por gRPC siguiendo una SAGA con compensaciones:
 *
 *   crear orden:  reservar auto (Catálogo) → consumir pago (Pagos) → guardar orden
 *   si falla:     consumir pago ✗ → liberar auto · guardar orden ✗ → liberar auto + reembolsar pago
 *   cancelar:     orden CANCELLED → liberar auto (Catálogo) + reembolsar pago (Pagos)
 *
 * Además implementa las fases presenciales del contrato v2 (check-in digital → entrega → devolución con
 * cooldown de limpieza), el mantenimiento preventivo, el feed outbox y el acuerdo B2B de promociones.
 */
@Injectable()
export class BookingService implements OnModuleInit {
  private readonly logger = new Logger(BookingService.name);
  private readonly catalog: GrpcCaller;
  private readonly payments: GrpcCaller;

  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(PromoContract) private readonly promo: Repository<PromoContract>,
    @Inject('CATALOG_CLIENT') catalogClient: ClientGrpc,
    @Inject('PAYMENTS_CLIENT') paymentsClient: ClientGrpc,
    private readonly cache: TtlCache,
    private readonly webhooks: WebhooksService,
    private readonly inventory: InventoryClient,
  ) {
    this.catalog = new GrpcCaller(catalogClient, 'CatalogService');
    this.payments = new GrpcCaller(paymentsClient, 'PaymentsService');
  }

  async onModuleInit() {
    if (/^(1|true)$/i.test(process.env.INVENTORY_SYNC_ON_START ?? '')) {
      this.syncInventory().catch((e) => this.logger.warn(`Sincronización inicial de stock omitida: ${e.message}`));
    }
  }

  // ═══ Búsqueda ═════════════════════════════════════════════════════════════
  async search(req: any) {
    const driverAge: number = req.driver.age;
    const pickup = req.route.pickup;
    const loc = pickup?.location ?? {};

    const { vehicles } = await this.catalog.call<{ vehicles: any[] }>('Search', {
      pickup_location: { airport: loc.airport ?? '', city_id: loc.city_id ?? 0 },
      car_types: req.filters?.car_types ?? [],
      transmission: req.filters?.transmission ?? [],
      limit: req.maximum_results || 100,
    });

    // Los reservables primero; los demás se muestran marcados como no disponibles.
    const bookable = (v: any) => v.status === 'AVAILABLE' && driverAge >= v.min_driver_age;
    const sorted = [...vehicles].sort((a, b) => Number(bookable(b)) - Number(bookable(a)));

    const days = daysBetween(pickup.datetime, req.route.dropoff.datetime);
    const search_token = randomUUID();
    this.cache.set(`search:${search_token}`, { vehicles: sorted, route: req.route, driver_age: driverAge } as CachedSearch, SEARCH_TTL_MS);

    return {
      request_id: randomUUID(),
      data: sorted.map((v) => ({
        vehicle_id: v.vehicle_id,
        price: Number((v.price_per_day * days).toFixed(2)),
        supplier_id: v.supplier_id,
        available: v.status === 'AVAILABLE',
        min_driver_age: v.min_driver_age,
        depot_id: v.depot_id,
      })),
      total_results: sorted.length,
      search_token,
    };
  }

  // ═══ Hold / Preview ═══════════════════════════════════════════════════════
  async hold(req: { vehicle_id: string; search_token: string }) {
    const cached = this.cache.get<CachedSearch>(`search:${req.search_token}`);
    const vehicle = cached?.vehicles.find((v) => v.vehicle_id === req.vehicle_id);
    if (!cached || !vehicle) throw carNoLongerAvailable(req.vehicle_id);
    this.assertDriverAge(vehicle, cached.driver_age);
    await this.freshAvailableVehicle(req.vehicle_id);

    const hold_id = randomUUID();
    this.cache.set(`hold:${hold_id}`, { vehicle_id: req.vehicle_id, search_token: req.search_token }, HOLD_TTL_MS);
    return { hold_id, expires_at: new Date(Date.now() + HOLD_TTL_MS).toISOString(), status: 'HELD' };
  }

  async preview(req: { vehicle_id: string; search_token: string; hold_id?: string; extras?: string[] }) {
    const cached = this.cache.get<CachedSearch>(`search:${req.search_token}`);
    const vehicle = cached?.vehicles.find((v) => v.vehicle_id === req.vehicle_id);
    if (!cached || !vehicle) throw carNoLongerAvailable(req.vehicle_id);
    if (req.hold_id && !this.cache.has(`hold:${req.hold_id}`)) throw carNoLongerAvailable(req.vehicle_id);
    this.assertDriverAge(vehicle, cached.driver_age);
    await this.freshAvailableVehicle(req.vehicle_id);

    const days = daysBetween(cached.route.pickup.datetime, cached.route.dropoff.datetime);
    const base_price = vehicle.price_per_day * days;
    const extras = req.extras ?? [];
    const extras_price = extras.length * EXTRA_PRICE_PER_DAY * days;
    const total_price = Number((base_price + extras_price).toFixed(2));

    const order_preview_id = randomUUID();
    this.cache.set(
      `preview:${order_preview_id}`,
      {
        driver_age: cached.driver_age,
        vehicle_id: req.vehicle_id,
        search_token: req.search_token,
        extras,
        total_price,
        currency: 'USD',
        route: cached.route,
      } as CachedPreview,
      PREVIEW_TTL_MS,
    );
    return {
      request_id: randomUUID(),
      order_preview_id,
      total_price,
      currency: 'USD',
      breakdown: { base_price, extras_price, days },
    };
  }

  // ═══ Pago ═════════════════════════════════════════════════════════════════
  async pay(req: { order_preview_id: string; card: any }) {
    const preview = this.cache.get<CachedPreview>(`preview:${req.order_preview_id}`);
    if (!preview) throw bookingNotConfirmed(req.order_preview_id);

    // No se cobra un auto que ya no está libre ni a un conductor que no cumple la edad mínima.
    const vehicle = await this.freshAvailableVehicle(preview.vehicle_id);
    this.assertDriverAge(vehicle, preview.driver_age);

    // Si Pagos rechaza la tarjeta, el ProblemDetails (402 PAYMENT_DECLINED) viaja de vuelta tal cual.
    const payment = await this.payments.call<any>('Charge', {
      order_preview_id: req.order_preview_id,
      amount: preview.total_price,
      currency: preview.currency,
      card: req.card,
    });
    await this.webhooks.emit(WebhookEvent.CAR_PAYMENT_APPROVED, payment.payment_reference, {
      amount: payment.amount,
      currency: payment.currency,
      card_last4: payment.card_last4,
    });
    return {
      payment_reference: payment.payment_reference,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      card_brand: payment.card_brand,
      card_last4: payment.card_last4,
      created_at: payment.created_at,
    };
  }

  // ═══ Crear orden (saga) ═══════════════════════════════════════════════════
  async createOrder(req: { order_preview_id: string; payment_reference: string; driver_details: any; customer_id?: string }) {
    const preview = this.cache.get<CachedPreview>(`preview:${req.order_preview_id}`);
    if (!preview) throw bookingNotConfirmed(req.order_preview_id);

    const { vehicles } = await this.catalog.call<{ vehicles: any[] }>('GetVehicles', { vehicle_ids: [preview.vehicle_id] });
    const vehicle = vehicles[0];
    if (!vehicle) throw priceChanged();
    this.assertDriverAge(vehicle, preview.driver_age);

    // Sin pago aprobado no hay reserva: debe existir, estar APROBADO, no usado, de esta previsualización y por el total.
    const payment = await this.payments.call<any>('GetPayment', { payment_reference: req.payment_reference }).catch((err: HttpException) => {
      if (err.getStatus() === 404) return null;
      throw err;
    });
    if (
      !payment ||
      payment.status !== 'APPROVED' ||
      payment.order_id ||
      payment.order_preview_id !== req.order_preview_id ||
      Number(payment.amount) !== Number(preview.total_price)
    ) {
      throw paymentRequired('Se requiere un pago aprobado (POST /payments) para esta previsualización antes de crear la orden.');
    }

    const saved = await this.confirmOrder({
      vehicle,
      paymentReference: req.payment_reference,
      route: preview.route,
      driverDetails: req.driver_details,
      extras: preview.extras,
      total: preview.total_price,
      currency: preview.currency,
      customerId: req.customer_id,
    });
    this.cache.delete(`preview:${req.order_preview_id}`);
    return toOrderMsg(saved);
  }

  /**
   * Núcleo de la saga (compartido por v1 y v2). Con el pago ya aprobado:
   *  1) reservar el auto (atómico) · 2) consumir el pago (atómico) · 3) guardar la orden y publicar eventos.
   */
  private async confirmOrder(p: {
    vehicle: any;
    paymentReference: string;
    route: any;
    driverDetails: any;
    extras: string[];
    total: number;
    currency: string;
    customerId?: string;
    coverage?: string;
    deposit?: number;
    pricing?: { days: number; base: number; coverage: number; surcharge: number };
  }): Promise<Order> {
    // Paso 1: reservar el auto (atómico). Si ya no está libre → compensar reembolsando el pago.
    const { reserved } = await this.catalog.call<{ reserved: boolean }>('ReserveVehicle', { vehicle_id: p.vehicle.vehicle_id });
    if (!reserved) {
      await this.payments.call('Refund', { payment_reference: p.paymentReference }).catch((e) =>
        this.logger.error(`Compensación fallida (reembolso) de ${p.paymentReference}: ${e.message}`),
      );
      throw vehicleReserved(p.vehicle.vehicle_id);
    }

    // Paso 2: consumir el pago (atómico). Si otro pedido lo usó antes → compensar liberando el auto.
    const orderId = randomUUID();
    try {
      await this.payments.call('Consume', { payment_reference: p.paymentReference, order_id: orderId });
    } catch (err) {
      await this.releaseVehicle(p.vehicle.vehicle_id);
      throw err;
    }

    // Paso 3: guardar la orden. Si falla → compensar liberando el auto y reembolsando el pago.
    let saved: Order;
    try {
      saved = await this.orders.save(
        this.orders.create({
          id: orderId,
          locator: await this.newLocator(),
          status: OrderStatus.CONFIRMED,
          vehicle_details: { ...p.vehicle, status: 'RESERVED' },
          route_details: p.route,
          driver_details: p.driverDetails,
          extras: p.extras,
          total_price: p.total,
          currency: p.currency,
          payment_reference: p.paymentReference,
          customer_id: p.customerId || null,
          coverage_type: p.coverage ?? 'BASICA',
          deposit: p.deposit ?? 0,
          pricing: p.pricing ?? null,
        }),
      );
    } catch (err) {
      await this.releaseVehicle(p.vehicle.vehicle_id);
      await this.payments.call('Refund', { payment_reference: p.paymentReference }).catch(() => undefined);
      throw err;
    }

    await this.webhooks.emit(WebhookEvent.CAR_ORDER_CONFIRMED, saved.id, {
      locator: saved.locator,
      pnr: saved.locator,
      status: saved.status,
      total_price: saved.total_price,
      vehicle_id: p.vehicle.vehicle_id,
    });
    await this.webhooks.emit(WebhookEvent.CAR_VEHICLE_RESERVED, p.vehicle.vehicle_id, { order_id: saved.id, locator: saved.locator });
    const at = dateSlotOfIso(p.route?.pickup?.datetime);
    void this.inventory.pushStock(p.vehicle.vehicle_id, at.date, at.slot, false);
    return saved;
  }

  // ═══ Contrato v2 · reserva directa B2B ════════════════════════════════════
  /**
   * POST /autos/orders/create (v2): el agregador reserva sin hold/preview ni tarjeta. Se validan edad y
   * estado del auto, se calcula el precio con cobertura y recargo, y se liquida con Pagos por el canal B2B
   * simulado para que toda orden quede respaldada por un pago (nunca hay reserva sin cobro registrado).
   */
  async createOrderV2(req: any) {
    const { vehicles } = await this.catalog.call<{ vehicles: any[] }>('GetVehicles', { vehicle_ids: [req.vehicle_id] });
    const vehicle = vehicles[0];
    if (!vehicle) {
      throw invalidParams('El vehículo indicado no existe.', [{ name: 'vehicle_id', reason: `No existe el vehículo "${req.vehicle_id}".` }]);
    }

    const age = req.driver?.age || 30;
    if (age < MIN_LEGAL_AGE) throw driverUnderage(age);
    if (age < vehicle.min_driver_age) throw driverBelowVehicleMinimum(vehicle.vehicle_id, vehicle.min_driver_age, age);
    this.assertBookableV2(vehicle);

    const days = rentalDays(req.pickup_date, req.dropoff_date);
    const coverage = normalizeCoverage(req.coverage_type);
    const pricing = computePricing({ dailyPrice: vehicle.price_per_day, days, coverage, driverAge: age });

    const dt = (date: string, time: string) => `${date}T${time || '10:00'}:00-05:00`;
    const route = {
      pickup: { datetime: dt(req.pickup_date, req.pickup_time), location: req.pickup_location ?? {} },
      dropoff: { datetime: dt(req.dropoff_date, req.dropoff_time), location: req.dropoff_location ?? {} },
    };
    const [firstName, ...rest] = String(req.driver?.full_name ?? '').trim().split(/\s+/);
    const driverDetails = {
      first_name: firstName ?? '',
      last_name: rest.join(' ') || firstName || '',
      email: req.driver?.email ?? '',
      phone_number: req.driver?.phone ?? '',
      license: req.driver?.license ?? '',
      license_country: req.driver?.license_country ?? '',
      age,
      flight_number: req.driver?.flight_number ?? '',
    };

    const payment = await this.payments.call<any>('Charge', {
      order_preview_id: `b2b-${randomUUID()}`,
      amount: pricing.total,
      currency: 'USD',
      channel: 'B2B',
    });

    const saved = await this.confirmOrder({
      vehicle,
      paymentReference: payment.payment_reference,
      route,
      driverDetails,
      extras: [],
      total: pricing.total,
      currency: 'USD',
      customerId: req.customer_id,
      coverage,
      deposit: pricing.deposit,
      pricing: { days: pricing.days, base: pricing.base, coverage: pricing.coverage, surcharge: pricing.surcharge },
    });
    return toOrderMsg(saved);
  }

  // ═══ Consultas y postventa ════════════════════════════════════════════════
  async getOrder(req: { order_id: string }) {
    return toOrderMsg(await this.findOrder(req.order_id));
  }

  async listOrders(req: { status?: string; customer_id?: string }) {
    const where: Record<string, unknown> = {};
    if (req.status) where.status = req.status;
    if (req.customer_id) where.customer_id = req.customer_id;
    const found = await this.orders.find({ where, order: { creation_date: 'DESC' } });
    return { orders: found.map(toOrderMsg) };
  }

  async modifyOrder(req: { order_id: string; extras_to_add?: string[]; extras_to_remove?: string[]; route?: any }) {
    const order = await this.findOrder(req.order_id);
    if (order.status !== OrderStatus.CONFIRMED) throw orderNotModifiable();

    const extras = new Set(order.extras ?? []);
    for (const e of req.extras_to_add ?? []) extras.add(e);
    for (const e of req.extras_to_remove ?? []) extras.delete(e);
    order.extras = Array.from(extras);
    if (req.route?.pickup?.datetime) order.route_details = req.route;

    const days = daysBetween(order.route_details.pickup.datetime, order.route_details.dropoff.datetime);
    const base = order.vehicle_details.price_per_day * days;
    order.total_price = Number((base + order.extras.length * EXTRA_PRICE_PER_DAY * days).toFixed(2));
    return toOrderMsg(await this.orders.save(order));
  }

  async cancelOrder(req: { order_id: string }) {
    await this.cancel(await this.findOrder(req.order_id));
  }

  /** Cancelación v2: igual que v1 pero devuelve el reembolso y el estado restituido del auto. */
  async cancelOrderV2(req: { order_id: string }) {
    const { order, refund } = await this.cancel(await this.findOrder(req.order_id));
    return { order: toOrderMsg(order), refund, vehicle_id: order.vehicle_details.vehicle_id, vehicle_state: 'AVAILABLE' };
  }

  private async cancel(order: Order) {
    if (order.status === OrderStatus.CANCELLED) return { order, refund: order.refund! }; // idempotente
    if (order.status !== OrderStatus.CONFIRMED) throw cancellationNotAllowed();

    order.status = OrderStatus.CANCELLED;
    order.refund = {
      refund_id: `REF-AUTO-${randomBytes(3).toString('hex').toUpperCase()}`,
      amount: order.total_price,
      currency: order.currency,
      percentage: 100,
      status: 'PROCESSED',
    };
    const saved = await this.orders.save(order);

    // Compensaciones: liberar el auto y reembolsar el pago (consistencia eventual si alguna falla).
    await this.releaseVehicle(order.vehicle_details.vehicle_id);
    await this.payments.call('RefundByOrder', { order_id: order.id }).catch((e) =>
      this.logger.error(`Reembolso de la orden ${order.id} pendiente: ${e.message}`),
    );

    await this.webhooks.emit(WebhookEvent.CAR_ORDER_CANCELLED, saved.id, {
      locator: saved.locator,
      pnr: saved.locator,
      status: saved.status,
      total_price: saved.total_price,
      vehicle_id: order.vehicle_details.vehicle_id,
      refund_id: order.refund.refund_id,
      refund_amount: order.refund.amount,
    });
    await this.webhooks.emit(WebhookEvent.CAR_VEHICLE_RELEASED, order.vehicle_details.vehicle_id, {
      order_id: saved.id,
      locator: saved.locator,
    });
    const at = dateSlotOfIso(order.route_details?.pickup?.datetime);
    void this.inventory.pushStock(order.vehicle_details.vehicle_id, at.date, at.slot, true);
    return { order: saved, refund: order.refund };
  }

  // ═══ Contrato v2 · fases presenciales ═════════════════════════════════════
  /** Check-in 1 (digital express): valida la licencia y deja el auto LISTO_PARA_ENTREGAR. */
  async checkinDigital(req: { order_id: string; document_id: string; license_number?: string; license_expiry?: string }) {
    const order = await this.findOrder(req.order_id);
    if (order.status !== OrderStatus.CONFIRMED) {
      throw invalidStateTransition(`El check-in digital solo aplica a órdenes CONFIRMED; la orden ${order.locator} está ${order.status}.`);
    }
    if (req.license_expiry && req.license_expiry < new Date().toISOString().slice(0, 10)) {
      throw invalidParams('La licencia de conducir está vencida.', [
        { name: 'fecha_vencimiento_licencia', reason: 'La licencia de conducir debe estar vigente.' },
      ]);
    }
    if (!order.checkin_at) {
      order.checkin_at = new Date();
      await this.orders.save(order);
      await this.catalog.call('TransitionVehicle', {
        vehicle_id: order.vehicle_details.vehicle_id,
        from_statuses: ['RESERVED'],
        to_status: 'READY_FOR_DELIVERY',
      });
    }
    return {
      order_id: order.id,
      pnr: order.locator,
      checkin_status: 'CHECKIN_COMPLETED',
      fast_track_pickup: true,
      voucher_qr_data: `AUTOS-CHECKIN-${order.locator}-VERIFIED-${req.document_id}`,
    };
  }

  /** Check-in 2 (mostrador): licencia física + odómetro de salida → el auto pasa a ENTREGADO. */
  async deliverOrder(req: { order_id: string; license: string; km_salida: number; technician?: string }) {
    const order = await this.findOrder(req.order_id);
    if (order.status !== OrderStatus.CONFIRMED) {
      throw invalidStateTransition(`Solo se puede entregar una orden CONFIRMED; la orden ${order.locator} está ${order.status}.`);
    }
    const expected = String(order.driver_details?.license ?? '').replace(/\s/g, '');
    if (expected && expected !== String(req.license).replace(/\s/g, '')) {
      throw invalidStateTransition('La licencia presentada en mostrador no coincide con la del conductor de la reserva.');
    }
    const moved = await this.catalog.call<{ changed: boolean }>('TransitionVehicle', {
      vehicle_id: order.vehicle_details.vehicle_id,
      from_statuses: ['RESERVED', 'READY_FOR_DELIVERY'],
      to_status: 'DELIVERED',
      odometer_km: req.km_salida,
    });
    if (!moved.changed) throw invalidStateTransition('El vehículo no está en un estado que permita su entrega.');

    order.status = OrderStatus.DELIVERED;
    order.delivered_at = new Date();
    order.km_salida = req.km_salida;
    return toOrderMsg(await this.orders.save(order));
  }

  /** Check-in 3 (patio): odómetro de retorno; completa la orden y arranca el cooldown de limpieza de 2 h. */
  async returnOrder(req: { order_id: string; km_retorno: number; fuel_level?: number }) {
    const order = await this.findOrder(req.order_id);
    if (order.status !== OrderStatus.DELIVERED) {
      throw invalidStateTransition(`Solo se puede devolver una orden ENTREGADO; la orden ${order.locator} está ${order.status}.`);
    }
    if (req.km_retorno < (order.km_salida ?? 0)) {
      throw invalidParams('El odómetro de retorno es menor que el de salida.', [
        { name: 'km_retorno', reason: `Debe ser mayor o igual a km_salida (${order.km_salida}).` },
      ]);
    }
    const result = await this.startCleaning(order.vehicle_details.vehicle_id, ['DELIVERED'], req.km_retorno);
    order.status = OrderStatus.COMPLETED;
    order.returned_at = new Date();
    order.km_retorno = req.km_retorno;
    const saved = await this.orders.save(order);
    return {
      order: toOrderMsg(saved),
      km_driven: req.km_retorno - (order.km_salida ?? 0),
      ...result,
    };
  }

  /** POST /autos/{id}/devolucion: devolución directa del auto; completa la orden activa si la hay. */
  async returnVehicle(req: { vehicle_id: string }) {
    const { vehicles } = await this.catalog.call<{ vehicles: any[] }>('GetVehicles', { vehicle_ids: [req.vehicle_id] });
    if (!vehicles[0]) throw notFound('Vehículo no encontrado', 'Vehículo "' + req.vehicle_id + '" no encontrado');
    const result = await this.startCleaning(req.vehicle_id, ['RESERVED', 'READY_FOR_DELIVERY', 'DELIVERED']);

    const active = await this.orders
      .createQueryBuilder('o')
      .where("o.vehicle_details->>'vehicle_id' = :v", { v: req.vehicle_id })
      .andWhere('o.status IN (:...s)', { s: [OrderStatus.CONFIRMED, OrderStatus.DELIVERED] })
      .getOne();
    let order: Order | null = null;
    if (active) {
      active.status = OrderStatus.COMPLETED;
      active.returned_at = new Date();
      order = await this.orders.save(active);
    }
    return { order: order ? toOrderMsg(order) : undefined, km_driven: 0, ...result };
  }

  /** Inicia el cooldown obligatorio de limpieza: el auto sale de las búsquedas durante 2 horas. */
  private async startCleaning(vehicleId: string, fromStatuses: string[], odometerKm = 0) {
    const availableFrom = new Date(Date.now() + CLEANING_COOLDOWN_MINUTES * 60_000);
    const moved = await this.catalog.call<{ changed: boolean; vehicle: any }>('TransitionVehicle', {
      vehicle_id: vehicleId,
      from_statuses: fromStatuses,
      to_status: 'CLEANING',
      odometer_km: odometerKm,
      available_from: availableFrom.toISOString(),
    });
    if (!moved.changed) {
      throw invalidStateTransition(`El vehículo ${vehicleId} está ${moved.vehicle.status}: no se puede registrar su devolución.`);
    }
    const v = moved.vehicle;
    const alert = v.odometer_km >= v.next_maintenance_km;

    await this.webhooks.emit(WebhookEvent.CAR_COOLDOWN_STARTED, vehicleId, {
      vehicle_id: vehicleId,
      cooldown_minutes: CLEANING_COOLDOWN_MINUTES,
      available_from: availableFrom.toISOString(),
    });
    if (alert) await this.emitMaintenanceAlert(v);

    // Stock hacia Booking: sin disponibilidad ahora, y de nuevo disponible al terminar el cooldown.
    const now = localDateSlot(new Date());
    const later = localDateSlot(availableFrom);
    void this.inventory.pushStock(vehicleId, now.date, now.slot, false);
    setTimeout(() => void this.inventory.pushStock(vehicleId, later.date, later.slot, true), CLEANING_COOLDOWN_MINUTES * 60_000).unref();

    return {
      vehicle: v,
      cooldown_hours: CLEANING_COOLDOWN_MINUTES / 60,
      available_from: availableFrom.toISOString(),
      maintenance_alert: alert
        ? `ALERTA PREVENTIVA: El vehículo ha superado el límite de ${v.next_maintenance_km} km. Mantenimiento requerido.`
        : '',
    };
  }

  // ═══ Contrato v2 · mantenimiento ══════════════════════════════════════════
  async registerMaintenance(req: any) {
    const before = (await this.catalog.call<{ vehicles: any[] }>('GetVehicles', { vehicle_ids: [req.vehicle_id] })).vehicles[0];
    const r = await this.catalog.call<{ vehicle: any; alert: boolean; log_id: string; timestamp: string }>('RecordMaintenance', req);
    if (r.alert) await this.emitMaintenanceAlert(r.vehicle);
    // Si el auto entró o salió de mantenimiento cambia su disponibilidad para Booking.
    if (before && before.status !== r.vehicle.status && (r.vehicle.status === 'MAINTENANCE' || before.status === 'MAINTENANCE')) {
      const now = localDateSlot(new Date());
      void this.inventory.pushStock(r.vehicle.vehicle_id, now.date, now.slot, r.vehicle.status === 'AVAILABLE');
    }
    return r;
  }

  private emitMaintenanceAlert(v: any) {
    return this.webhooks.emit(WebhookEvent.CAR_MAINTENANCE_ALERT, v.vehicle_id, {
      vehicle_id: v.vehicle_id,
      odometer_km: v.odometer_km,
      next_maintenance_km: v.next_maintenance_km,
    });
  }

  // ═══ Contrato v2 · acuerdo B2B de promociones ═════════════════════════════
  private promoMsg(p: PromoContract) {
    return {
      provider_code: process.env.NODE_ID ?? 'NODE_AUT_LOCAL',
      partner_name: process.env.NODE_NAME ?? 'RodadoEc (Flota Partner)',
      vertical: 'AUTOS',
      allows_promotions: p.allows_promotions,
      max_discount_percentage: p.max_discount_percentage,
      enabled_destinations: p.enabled_destinations ?? [],
      valid_until: p.valid_until ?? '',
      combo_conditions: p.combo_conditions ?? '',
    };
  }

  async getPromoContract() {
    let p = await this.promo.findOneBy({ id: 1 });
    if (!p) {
      p = await this.promo.save(
        this.promo.create({
          id: 1,
          allows_promotions: true,
          max_discount_percentage: 15,
          enabled_destinations: ['Quito', 'Guayaquil', 'Cuenca'],
          valid_until: '2026-12-31',
          combo_conditions: 'Descuento autorizado del 15% en combos multivertical con hotel o vuelo.',
        }),
      );
    }
    return this.promoMsg(p);
  }

  async setPromoContract(req: any) {
    await this.getPromoContract();
    const p = (await this.promo.findOneBy({ id: 1 }))!;
    p.allows_promotions = !!req.allows_promotions;
    p.max_discount_percentage = req.max_discount_percentage;
    if (req.enabled_destinations?.length) p.enabled_destinations = req.enabled_destinations;
    if (req.valid_until) p.valid_until = req.valid_until;
    if (req.combo_conditions) p.combo_conditions = req.combo_conditions;
    return this.promoMsg(await this.promo.save(p));
  }

  // ═══ Contrato v2 · stock hacia Booking Prototipo ══════════════════════════
  async syncInventory() {
    if (!this.inventory.enabled) return { enabled: false, total: 0, synchronized: false };
    const { vehicles } = await this.catalog.call<{ vehicles: any[] }>('GetVehicles', {});
    const r = await this.inventory.streamFleet(vehicles.map((v) => ({ itemId: v.vehicle_id, available: v.status === 'AVAILABLE' })));
    return { enabled: true, total: r?.total ?? 0, synchronized: r?.synchronized ?? false };
  }

  // ═══ helpers ══════════════════════════════════════════════════════════════
  /** Localizador PNR de 8 caracteres: "CAR" + 5 alfanuméricos (sin caracteres ambiguos). */
  private async newLocator(): Promise<string> {
    for (;;) {
      const bytes = randomBytes(5);
      const code = `CAR${Array.from(bytes, (b) => LOCATOR_ALPHABET[b % LOCATOR_ALPHABET.length]).join('')}`;
      if (!(await this.orders.existsBy({ locator: code }))) return code;
    }
  }

  /** Acepta el id interno (UUID) o el PNR de la orden. */
  private async findOrder(id: string): Promise<Order> {
    const order = UUID_REGEX.test(id) ? await this.orders.findOneBy({ id }) : await this.orders.findOneBy({ locator: String(id).toUpperCase() });
    if (!order) throw orderNotFound(id);
    return order;
  }

  private assertDriverAge(vehicle: { vehicle_id: string; min_driver_age: number }, age: number) {
    if (age < vehicle.min_driver_age) throw driverAgeRestriction(vehicle.vehicle_id, vehicle.min_driver_age, age);
  }

  /** Estado del auto para el contrato v2: distingue cooldown de limpieza, mantenimiento y reservado. */
  private assertBookableV2(vehicle: any) {
    if (vehicle.status === 'AVAILABLE') return;
    if (vehicle.status === 'CLEANING') throw vehicleInCleaningCooldown(vehicle.vehicle_id, vehicle.available_from);
    if (vehicle.status === 'MAINTENANCE') throw vehicleInMaintenance(vehicle.vehicle_id);
    throw vehicleReserved(vehicle.vehicle_id);
  }

  /** Consulta el estado actual del auto en Catálogo (la caché de búsqueda puede estar desactualizada). */
  private async freshAvailableVehicle(vehicleId: string): Promise<any> {
    const { vehicles } = await this.catalog.call<{ vehicles: any[] }>('GetVehicles', { vehicle_ids: [vehicleId] });
    const v = vehicles[0];
    if (!v) throw carNoLongerAvailable(vehicleId);
    if (v.status !== 'AVAILABLE') throw vehicleReserved(vehicleId);
    return v;
  }

  private async releaseVehicle(vehicleId: string) {
    await this.catalog.call('ReleaseVehicle', { vehicle_id: vehicleId }).catch((e) =>
      this.logger.error(`Liberación pendiente del auto ${vehicleId}: ${e.message}`),
    );
  }
}
