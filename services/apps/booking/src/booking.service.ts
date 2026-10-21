import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import {
  bookingNotConfirmed,
  cancellationNotAllowed,
  carNoLongerAvailable,
  driverAgeRestriction,
  GrpcCaller,
  orderNotFound,
  orderNotModifiable,
  paymentRequired,
  priceChanged,
  TtlCache,
  vehicleReserved,
} from '@autos/common';
import { Order, OrderStatus, WebhookEvent } from './entities/booking.entities';
import { WebhooksService } from './webhooks.service';

const SEARCH_TTL_MS = 30 * 60 * 1000;
const HOLD_TTL_MS = 5 * 60 * 1000;
const PREVIEW_TTL_MS = 10 * 60 * 1000;
const EXTRA_PRICE_PER_DAY = 5; // tarifa mock por cada extra

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
  };
}

/**
 * Servicio de Reservas: dueño de las órdenes y del flujo de compra. Orquesta a Catálogo (disponibilidad)
 * y Pagos (cobro) por gRPC siguiendo una SAGA con compensaciones:
 *
 *   crear orden:  reservar auto (Catálogo) → consumir pago (Pagos) → guardar orden
 *   si falla:     consumir pago ✗ → liberar auto · guardar orden ✗ → liberar auto + reembolsar pago
 *   cancelar:     orden CANCELLED → liberar auto (Catálogo) + reembolsar pago (Pagos)
 */
@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);
  private readonly catalog: GrpcCaller;
  private readonly payments: GrpcCaller;

  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @Inject('CATALOG_CLIENT') catalogClient: ClientGrpc,
    @Inject('PAYMENTS_CLIENT') paymentsClient: ClientGrpc,
    private readonly cache: TtlCache,
    private readonly webhooks: WebhooksService,
  ) {
    this.catalog = new GrpcCaller(catalogClient, 'CatalogService');
    this.payments = new GrpcCaller(paymentsClient, 'PaymentsService');
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
    this.webhooks.emit(WebhookEvent.CAR_PAYMENT_APPROVED, payment.payment_reference, {
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

    // Paso 1: reservar el auto (atómico). Si ya no está libre → compensar reembolsando el pago.
    const { reserved } = await this.catalog.call<{ reserved: boolean }>('ReserveVehicle', { vehicle_id: vehicle.vehicle_id });
    if (!reserved) {
      await this.payments.call('Refund', { payment_reference: req.payment_reference }).catch((e) =>
        this.logger.error(`Compensación fallida (reembolso) de ${req.payment_reference}: ${e.message}`),
      );
      throw vehicleReserved(vehicle.vehicle_id);
    }

    // Paso 2: consumir el pago (atómico). Si otro pedido lo usó antes → compensar liberando el auto.
    const orderId = randomUUID();
    try {
      await this.payments.call('Consume', { payment_reference: req.payment_reference, order_id: orderId });
    } catch (err) {
      await this.releaseVehicle(vehicle.vehicle_id);
      throw err;
    }

    // Paso 3: guardar la orden. Si falla → compensar liberando el auto y reembolsando el pago.
    let saved: Order;
    try {
      saved = await this.orders.save(
        this.orders.create({
          id: orderId,
          locator: `AUTOS-${randomUUID().slice(0, 8).toUpperCase()}`,
          status: OrderStatus.CONFIRMED,
          vehicle_details: { ...vehicle, status: 'RESERVED' },
          route_details: preview.route,
          driver_details: req.driver_details,
          extras: preview.extras,
          total_price: preview.total_price,
          currency: preview.currency,
          payment_reference: req.payment_reference,
          customer_id: req.customer_id || null,
        }),
      );
    } catch (err) {
      await this.releaseVehicle(vehicle.vehicle_id);
      await this.payments.call('Refund', { payment_reference: req.payment_reference }).catch(() => undefined);
      throw err;
    }
    this.cache.delete(`preview:${req.order_preview_id}`);

    this.webhooks.emit(WebhookEvent.CAR_ORDER_CONFIRMED, saved.id, {
      locator: saved.locator,
      status: saved.status,
      total_price: saved.total_price,
      vehicle_id: vehicle.vehicle_id,
    });
    this.webhooks.emit(WebhookEvent.CAR_VEHICLE_RESERVED, vehicle.vehicle_id, { order_id: saved.id, locator: saved.locator });
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
    const order = await this.findOrder(req.order_id);
    if (order.status === OrderStatus.CANCELLED) return; // idempotente
    if (order.status !== OrderStatus.CONFIRMED) throw cancellationNotAllowed();

    order.status = OrderStatus.CANCELLED;
    const saved = await this.orders.save(order);

    // Compensaciones: liberar el auto y reembolsar el pago (consistencia eventual si alguna falla).
    await this.releaseVehicle(order.vehicle_details.vehicle_id);
    await this.payments.call('RefundByOrder', { order_id: order.id }).catch((e) =>
      this.logger.error(`Reembolso de la orden ${order.id} pendiente: ${e.message}`),
    );

    this.webhooks.emit(WebhookEvent.CAR_ORDER_CANCELLED, saved.id, {
      locator: saved.locator,
      status: saved.status,
      total_price: saved.total_price,
    });
    this.webhooks.emit(WebhookEvent.CAR_VEHICLE_RELEASED, order.vehicle_details.vehicle_id, {
      order_id: saved.id,
      locator: saved.locator,
    });
  }

  // ═══ helpers ══════════════════════════════════════════════════════════════
  private async findOrder(id: string): Promise<Order> {
    const order = /^[0-9a-f-]{36}$/i.test(id) ? await this.orders.findOneBy({ id }) : null;
    if (!order) throw orderNotFound(id);
    return order;
  }

  private assertDriverAge(vehicle: { vehicle_id: string; min_driver_age: number }, age: number) {
    if (age < vehicle.min_driver_age) throw driverAgeRestriction(vehicle.vehicle_id, vehicle.min_driver_age, age);
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
