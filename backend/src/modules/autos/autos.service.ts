import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import { TtlCacheService } from './cache/ttl-cache.service';
import { MOCK_CONSTANTS } from './data/mock-catalog';
import { CarConstantsRequestDto, CarConstantsResponseDto } from './dto/constants.dto';
import { DepotScoresRequestDto, DepotScoresResponseDto } from './dto/depot-scores.dto';
import { DepotsRequestDto, DepotsResponseDto } from './dto/depots.dto';
import { CarDetailsRequestDto, CarDetailsResponseDto } from './dto/details.dto';
import { OrderCreateRequestDto } from './dto/order-create.dto';
import { OrderDetailDto } from './dto/order-detail.dto';
import { HoldStatus, OrderHoldRequestDto, OrderHoldResponseDto } from './dto/order-hold.dto';
import { OrderModifyRequestDto } from './dto/order-modify.dto';
import { OrderPreviewRequestDto, OrderPreviewResponseDto } from './dto/order-preview.dto';
import { CarSearchRequestDto, CarSearchResponseDto } from './dto/search.dto';
import { SuppliersRequestDto, SuppliersResponseDto } from './dto/suppliers.dto';
import { WebhookSubscriptionDto } from './dto/webhook.dto';
import { Depot } from './entities/depot.entity';
import { Order, OrderStatus } from './entities/order.entity';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { Supplier } from './entities/supplier.entity';
import { Vehicle, VehicleStatus } from './entities/vehicle.entity';
import { WebhookEvent, WebhookSubscription } from './entities/webhook-subscription.entity';
import {
  bookingNotConfirmed,
  cancellationNotAllowed,
  carNoLongerAvailable,
  driverAgeRestriction,
  orderNotFound,
  orderNotModifiable,
  paymentRequired,
  priceChanged,
  vehicleReserved,
} from './errors/autos-errors';
import { WebhooksDispatcherService } from './webhooks/webhooks-dispatcher.service';

interface CachedSearch {
  vehicles: Vehicle[];
  route: CarSearchRequestDto['route'];
  driver_age: number;
}

interface CachedHold {
  vehicle_id: string;
  search_token: string;
}

export interface CachedPreview {
  driver_age: number;
  vehicle_id: string;
  search_token: string;
  extras: string[];
  total_price: number;
  currency: string;
  breakdown: Record<string, unknown>;
  route: CarSearchRequestDto['route'];
}

const SEARCH_TTL_MS = 30 * 60 * 1000;
const HOLD_TTL_MS = 5 * 60 * 1000;
const PREVIEW_TTL_MS = 10 * 60 * 1000;

export const DEFAULT_MIN_DRIVER_AGE = 18; // mayoría de edad en Ecuador
export const minDriverAge = (v: Pick<Vehicle, 'min_driver_age'>): number =>
  v.min_driver_age ?? DEFAULT_MIN_DRIVER_AGE;

function daysBetween(pickup: string, dropoff: string): number {
  const ms = new Date(dropoff).getTime() - new Date(pickup).getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

@Injectable()
export class AutosService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(WebhookSubscription)
    private readonly webhookRepository: Repository<WebhookSubscription>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepository: Repository<Vehicle>,
    @InjectRepository(Depot)
    private readonly depotRepository: Repository<Depot>,
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    private readonly cache: TtlCacheService,
    private readonly webhooksDispatcher: WebhooksDispatcherService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  //  Búsqueda y Catálogo
  // ═══════════════════════════════════════════════════════════════════════

  async search(searchRequest: CarSearchRequestDto): Promise<CarSearchResponseDto> {
    const where: Record<string, unknown> = {};
    if (searchRequest.filters?.car_types?.length) {
      where.car_type = In(searchRequest.filters.car_types);
    }
    if (searchRequest.filters?.transmission?.length) {
      where.transmission = In(searchRequest.filters.transmission);
    }

    // La agencia de recogida manda: solo se ofrecen autos de las agencias de la ciudad
    // (o del aeropuerto) elegida. Sin ubicación, se devuelve todo el catálogo.
    const pickup = searchRequest.route.pickup.location;
    if (pickup?.airport || pickup?.city_id) {
      const depots = await this.depotRepository.find();
      const ids = depots
        .filter((d) =>
          pickup.airport
            ? d.airport?.toUpperCase() === pickup.airport.toUpperCase()
            : d.city_id === pickup.city_id,
        )
        .map((d) => d.depot_id);
      where.depot_id = In(ids);
    }

    const limit = searchRequest.maximum_results ?? 100;
    const found = await this.vehicleRepository.find({ where, take: limit });
    // Los disponibles primero; los reservados se muestran igual, marcados como no disponibles.
    const driverAge = searchRequest.driver.age;
    const bookable = (v: Vehicle) =>
      v.status === VehicleStatus.AVAILABLE && driverAge >= minDriverAge(v);
    const vehicles = [...found].sort((a, b) => Number(bookable(b)) - Number(bookable(a)));

    const days = daysBetween(searchRequest.route.pickup.datetime, searchRequest.route.dropoff.datetime);
    const search_token = randomUUID();

    this.cache.set(`search:${search_token}`, { vehicles, route: searchRequest.route, driver_age: driverAge } as CachedSearch, SEARCH_TTL_MS);

    return {
      request_id: randomUUID(),
      data: vehicles.map((v) => ({
        vehicle_id: v.vehicle_id,
        price: Number((v.price_per_day * days).toFixed(2)),
        supplier_id: v.supplier_id,
        available: v.status === VehicleStatus.AVAILABLE,
        min_driver_age: minDriverAge(v),
        depot_id: v.depot_id,
      })),
      metadata: { total_results: vehicles.length, next_page: null },
      search_token,
    };
  }

  async getDetails(_detailsRequest: CarDetailsRequestDto): Promise<CarDetailsResponseDto> {
    const vehicles = await this.vehicleRepository.find();
    return {
      request_id: randomUUID(),
      data: vehicles.map((v) => ({
        vehicle_id: v.vehicle_id,
        make: v.make,
        model: v.model,
        doors: v.doors,
        bag_capacity: v.bag_capacity,
        seats: v.seats,
        image_url: v.image_url,
        status: v.status,
        min_driver_age: minDriverAge(v),
        depot_id: v.depot_id,
      })),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Información de Agencias y Proveedores
  // ═══════════════════════════════════════════════════════════════════════

  async getDepots(_depotsRequest: DepotsRequestDto): Promise<DepotsResponseDto> {
    const depots = await this.depotRepository.find();
    return {
      request_id: randomUUID(),
      data: depots.map((d) => ({
        depot_id: d.depot_id,
        name: d.name,
        location: { city_id: d.city_id, airport: d.airport ?? undefined },
      })),
      metadata: { total_results: depots.length },
    };
  }

  async getDepotScores(_scoresRequest: DepotScoresRequestDto): Promise<DepotScoresResponseDto> {
    const depots = await this.depotRepository.find();
    return {
      request_id: randomUUID(),
      data: depots.map((d) => ({ depot_id: d.depot_id, score: d.score })),
      metadata: { total_results: depots.length },
    };
  }

  async getSuppliers(suppliersRequest: SuppliersRequestDto): Promise<SuppliersResponseDto> {
    const where = suppliersRequest.suppliers?.length
      ? { supplier_id: In(suppliersRequest.suppliers) }
      : {};
    const suppliers = await this.supplierRepository.find({ where });
    return {
      request_id: randomUUID(),
      data: suppliers.map((s) => ({ supplier_id: s.supplier_id, name: s.name })),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Componentes Comunes
  // ═══════════════════════════════════════════════════════════════════════

  getConstants(constantsRequest: CarConstantsRequestDto): CarConstantsResponseDto {
    const keys = constantsRequest.constants?.length
      ? constantsRequest.constants
      : Object.keys(MOCK_CONSTANTS);

    const data: Record<string, unknown> = {};
    for (const key of keys) {
      data[key] = MOCK_CONSTANTS[key];
    }

    return { request_id: randomUUID(), data };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Gestión de Órdenes (Reservas)
  // ═══════════════════════════════════════════════════════════════════════

  async holdOrder(holdRequest: OrderHoldRequestDto): Promise<OrderHoldResponseDto> {
    const cached = this.cache.get<CachedSearch>(`search:${holdRequest.search_token}`);
    const vehicle = cached?.vehicles.find((v) => v.vehicle_id === holdRequest.vehicle_id);

    if (!cached || !vehicle) {
      throw carNoLongerAvailable(holdRequest.vehicle_id);
    }
    this.assertDriverAge(vehicle, cached.driver_age);
    await this.assertVehicleAvailable(holdRequest.vehicle_id);

    const hold_id = randomUUID();
    this.cache.set(
      `hold:${hold_id}`,
      { vehicle_id: holdRequest.vehicle_id, search_token: holdRequest.search_token } as CachedHold,
      HOLD_TTL_MS,
    );

    return {
      hold_id,
      expires_at: new Date(Date.now() + HOLD_TTL_MS).toISOString(),
      status: HoldStatus.HELD,
    };
  }

  async previewOrder(previewRequest: OrderPreviewRequestDto): Promise<OrderPreviewResponseDto> {
    const cached = this.cache.get<CachedSearch>(`search:${previewRequest.search_token}`);
    const vehicle = cached?.vehicles.find((v) => v.vehicle_id === previewRequest.vehicle_id);

    if (!cached || !vehicle) {
      throw carNoLongerAvailable(previewRequest.vehicle_id);
    }

    if (previewRequest.hold_id && !this.cache.has(`hold:${previewRequest.hold_id}`)) {
      throw carNoLongerAvailable(previewRequest.vehicle_id);
    }
    this.assertDriverAge(vehicle, cached.driver_age);
    await this.assertVehicleAvailable(previewRequest.vehicle_id);

    const days = daysBetween(cached.route.pickup.datetime, cached.route.dropoff.datetime);
    const basePrice = vehicle.price_per_day * days;
    const extras = previewRequest.extras ?? [];
    const extrasPrice = extras.length * 5 * days; // $5/día por cada extra, tarifa mock
    const total_price = Number((basePrice + extrasPrice).toFixed(2));

    const order_preview_id = randomUUID();
    this.cache.set(
      `preview:${order_preview_id}`,
      {
        driver_age: cached.driver_age,
        vehicle_id: previewRequest.vehicle_id,
        search_token: previewRequest.search_token,
        extras,
        total_price,
        currency: 'USD',
        breakdown: { base_price: basePrice, extras_price: extrasPrice, days },
        route: cached.route,
      } as CachedPreview,
      PREVIEW_TTL_MS,
    );

    return {
      request_id: randomUUID(),
      data: {
        order_preview_id,
        total_price,
        currency: 'USD',
        breakdown: { base_price: basePrice, extras_price: extrasPrice, days },
      },
    };
  }

  async createOrder(
    createRequest: OrderCreateRequestDto,
    customerId: string | null = null,
  ): Promise<OrderDetailDto> {
    const preview = this.cache.get<CachedPreview>(`preview:${createRequest.order_preview_id}`);
    if (!preview) {
      throw bookingNotConfirmed(createRequest.order_preview_id);
    }

    const vehicle = await this.vehicleRepository.findOneBy({ vehicle_id: preview.vehicle_id });
    if (!vehicle) {
      throw priceChanged();
    }

    this.assertDriverAge(vehicle, preview.driver_age);

    // Sin pago aprobado no hay reserva: el pago debe existir, estar APROBADO,
    // no haberse usado ya, corresponder a esta previsualización y cubrir el total.
    const payment = await this.paymentRepository.findOneBy({
      reference: createRequest.payment_reference,
    });
    if (
      !payment ||
      payment.status !== PaymentStatus.APPROVED ||
      payment.order_id !== null ||
      payment.order_preview_id !== createRequest.order_preview_id ||
      payment.amount !== preview.total_price
    ) {
      throw paymentRequired(
        'Se requiere un pago aprobado (POST /payments) para esta previsualización antes de crear la orden.',
      );
    }

    // Reserva atómica del auto: solo una petición puede pasar de AVAILABLE a RESERVED.
    const reserved = await this.vehicleRepository.update(
      { vehicle_id: vehicle.vehicle_id, status: VehicleStatus.AVAILABLE },
      { status: VehicleStatus.RESERVED },
    );
    if (!reserved.affected) {
      payment.status = PaymentStatus.REFUNDED;
      await this.paymentRepository.save(payment);
      throw vehicleReserved(vehicle.vehicle_id);
    }

    const order = this.orderRepository.create({
      locator: `AUTOS-${randomUUID().slice(0, 8).toUpperCase()}`,
      status: OrderStatus.CONFIRMED,
      vehicle_details: vehicle as unknown as Record<string, unknown>,
      route_details: preview.route as unknown as Record<string, unknown>,
      driver_details: createRequest.driver_details as unknown as Record<string, unknown>,
      extras: preview.extras,
      total_price: preview.total_price,
      currency: preview.currency,
      payment_reference: createRequest.payment_reference,
      customer_id: customerId,
    });

    let saved: Order;
    try {
      saved = await this.orderRepository.save(order);
    } catch (err) {
      await this.vehicleRepository.update(
        { vehicle_id: vehicle.vehicle_id },
        { status: VehicleStatus.AVAILABLE },
      );
      throw err;
    }
    payment.order_id = saved.id;
    await this.paymentRepository.save(payment);
    this.cache.delete(`preview:${createRequest.order_preview_id}`);

    this.webhooksDispatcher
      .dispatch(WebhookEvent.CAR_ORDER_CONFIRMED, saved)
      .catch(() => undefined);

    return this.toOrderDetail(saved);
  }

  async getOrder(orderId: string): Promise<OrderDetailDto> {
    const order = await this.orderRepository.findOneBy({ id: orderId });
    if (!order) {
      throw orderNotFound(orderId);
    }
    return this.toOrderDetail(order);
  }

  async modifyOrder(orderId: string, modifyRequest: OrderModifyRequestDto): Promise<OrderDetailDto> {
    const order = await this.orderRepository.findOneBy({ id: orderId });
    if (!order) {
      throw orderNotFound(orderId);
    }
    if (order.status !== OrderStatus.CONFIRMED) {
      throw orderNotModifiable();
    }

    const extras = new Set(order.extras ?? []);
    for (const e of modifyRequest.extras_to_add ?? []) extras.add(e);
    for (const e of modifyRequest.extras_to_remove ?? []) extras.delete(e);
    order.extras = Array.from(extras);

    if (modifyRequest.route) {
      order.route_details = modifyRequest.route as unknown as Record<string, unknown>;
    }

    const route = order.route_details as unknown as CachedSearch['route'];
    const days = daysBetween(route.pickup.datetime, route.dropoff.datetime);
    const pricePerDay = (order.vehicle_details as { price_per_day: number }).price_per_day;
    const basePrice = pricePerDay * days;
    const extrasPrice = order.extras.length * 5 * days;
    order.total_price = Number((basePrice + extrasPrice).toFixed(2));

    const saved = await this.orderRepository.save(order);
    return this.toOrderDetail(saved);
  }

  async cancelOrder(orderId: string): Promise<void> {
    const order = await this.orderRepository.findOneBy({ id: orderId });
    if (!order) {
      throw orderNotFound(orderId);
    }
    if (order.status === OrderStatus.CANCELLED) {
      return; // idempotente
    }
    if (order.status !== OrderStatus.CONFIRMED) {
      throw cancellationNotAllowed();
    }
    order.status = OrderStatus.CANCELLED;
    const saved = await this.orderRepository.save(order);

    // Cancelar libera el auto y reembolsa (simulado) el pago asociado.
    const vehicleId = (order.vehicle_details as { vehicle_id?: string }).vehicle_id;
    if (vehicleId) {
      await this.vehicleRepository.update({ vehicle_id: vehicleId }, { status: VehicleStatus.AVAILABLE });
    }
    await this.paymentRepository.update({ order_id: order.id }, { status: PaymentStatus.REFUNDED });

    this.webhooksDispatcher
      .dispatch(WebhookEvent.CAR_ORDER_CANCELLED, saved)
      .catch(() => undefined);
  }

  private assertDriverAge(vehicle: Pick<Vehicle, 'vehicle_id' | 'min_driver_age'>, age: number): void {
    const min = minDriverAge(vehicle);
    if (age < min) throw driverAgeRestriction(vehicle.vehicle_id, min, age);
  }

  private async assertVehicleAvailable(vehicleId: string): Promise<void> {
    const vehicle = await this.vehicleRepository.findOneBy({ vehicle_id: vehicleId });
    if (!vehicle) throw carNoLongerAvailable(vehicleId);
    if (vehicle.status !== VehicleStatus.AVAILABLE) throw vehicleReserved(vehicleId);
  }

  private toOrderDetail(order: Order): OrderDetailDto {
    const links: Record<string, string> = {
      self: `/api/v1/orders/${order.id}`,
    };
    if (order.status === OrderStatus.CONFIRMED) {
      links.modify = `/api/v1/orders/${order.id}/modify`;
      links.cancel = `/api/v1/orders/${order.id}/cancel`;
    }

    return {
      order_id: order.id,
      locator: order.locator,
      status: order.status,
      vehicle_details: order.vehicle_details,
      route_details: order.route_details,
      extras: order.extras ?? [],
      total_price: order.total_price,
      currency: order.currency,
      creation_date: order.creation_date.toISOString(),
      _links: links,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Webhooks
  // ═══════════════════════════════════════════════════════════════════════

  listWebhooks(): Promise<WebhookSubscription[]> {
    return this.webhookRepository.find();
  }

  async createWebhook(webhookSubscription: WebhookSubscriptionDto): Promise<WebhookSubscription> {
    const entity = this.webhookRepository.create({
      url: webhookSubscription.url,
      events: webhookSubscription.events,
      secret: webhookSubscription.secret ?? null,
    });
    return this.webhookRepository.save(entity);
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.webhookRepository.delete(id);
  }
}
