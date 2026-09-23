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
import { Supplier } from './entities/supplier.entity';
import { Vehicle } from './entities/vehicle.entity';
import { WebhookEvent, WebhookSubscription } from './entities/webhook-subscription.entity';
import {
  bookingNotConfirmed,
  cancellationNotAllowed,
  carNoLongerAvailable,
  orderNotFound,
  orderNotModifiable,
  priceChanged,
} from './errors/autos-errors';
import { WebhooksDispatcherService } from './webhooks/webhooks-dispatcher.service';

interface CachedSearch {
  vehicles: Vehicle[];
  route: CarSearchRequestDto['route'];
}

interface CachedHold {
  vehicle_id: string;
  search_token: string;
}

interface CachedPreview {
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

    const limit = searchRequest.maximum_results ?? 100;
    const vehicles = await this.vehicleRepository.find({ where, take: limit });

    const days = daysBetween(searchRequest.route.pickup.datetime, searchRequest.route.dropoff.datetime);
    const search_token = randomUUID();

    this.cache.set(`search:${search_token}`, { vehicles, route: searchRequest.route } as CachedSearch, SEARCH_TTL_MS);

    return {
      request_id: randomUUID(),
      data: vehicles.map((v) => ({
        vehicle_id: v.vehicle_id,
        price: Number((v.price_per_day * days).toFixed(2)),
        supplier_id: v.supplier_id,
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

  holdOrder(holdRequest: OrderHoldRequestDto): OrderHoldResponseDto {
    const cached = this.cache.get<CachedSearch>(`search:${holdRequest.search_token}`);
    const vehicle = cached?.vehicles.find((v) => v.vehicle_id === holdRequest.vehicle_id);

    if (!cached || !vehicle) {
      throw carNoLongerAvailable(holdRequest.vehicle_id);
    }

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

  previewOrder(previewRequest: OrderPreviewRequestDto): OrderPreviewResponseDto {
    const cached = this.cache.get<CachedSearch>(`search:${previewRequest.search_token}`);
    const vehicle = cached?.vehicles.find((v) => v.vehicle_id === previewRequest.vehicle_id);

    if (!cached || !vehicle) {
      throw carNoLongerAvailable(previewRequest.vehicle_id);
    }

    if (previewRequest.hold_id && !this.cache.has(`hold:${previewRequest.hold_id}`)) {
      throw carNoLongerAvailable(previewRequest.vehicle_id);
    }

    const days = daysBetween(cached.route.pickup.datetime, cached.route.dropoff.datetime);
    const basePrice = vehicle.price_per_day * days;
    const extras = previewRequest.extras ?? [];
    const extrasPrice = extras.length * 5 * days; // $5/día por cada extra, tarifa mock
    const total_price = Number((basePrice + extrasPrice).toFixed(2));

    const order_preview_id = randomUUID();
    this.cache.set(
      `preview:${order_preview_id}`,
      {
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

  async createOrder(createRequest: OrderCreateRequestDto): Promise<OrderDetailDto> {
    const preview = this.cache.get<CachedPreview>(`preview:${createRequest.order_preview_id}`);
    if (!preview) {
      throw bookingNotConfirmed(createRequest.order_preview_id);
    }

    const vehicle = await this.vehicleRepository.findOneBy({ vehicle_id: preview.vehicle_id });
    if (!vehicle) {
      throw priceChanged();
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
    });

    const saved = await this.orderRepository.save(order);
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

    this.webhooksDispatcher
      .dispatch(WebhookEvent.CAR_ORDER_CANCELLED, saved)
      .catch(() => undefined);
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
