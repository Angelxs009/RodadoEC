import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { currentCorrelationId, notFound } from '@autos/common';
import { MoreThan } from 'typeorm';
import { OutboxEvent, WebhookDelivery, WebhookEvent, WebhookSubscription } from './entities/booking.entities';

const RETRY_DELAYS_MS = [0, 1000, 3000]; // 3 intentos con espera creciente
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Eventos de dominio expuestos como CloudEvents v1.0 (feed Outbox GET /autos/eventos → RabbitMQ / Kafka). */
const CLOUD_SOURCE = '/microservices/ms-autos';
const CLOUD_EVENTS: Partial<Record<WebhookEvent, { type: string; prefix: string; build: (d: any) => Record<string, unknown> }>> = {
  [WebhookEvent.CAR_ORDER_CONFIRMED]: {
    type: 'ec.edu.epn.booking.autos.order.confirmed',
    prefix: 'ord',
    build: (d) => ({ order_id: d.pnr, pnr: d.pnr, auto_id: d.vehicle_id, total_price: d.total_price, nuevo_estado_auto: 'RESERVADO' }),
  },
  [WebhookEvent.CAR_ORDER_CANCELLED]: {
    type: 'ec.edu.epn.booking.autos.order.cancelled',
    prefix: 'canc',
    build: (d) => ({
      order_id: d.pnr, pnr: d.pnr, auto_id: d.vehicle_id, refund_id: d.refund_id, refund_amount: d.refund_amount, estado_restituido: 'DISPONIBLE',
    }),
  },
  [WebhookEvent.CAR_COOLDOWN_STARTED]: {
    type: 'ec.edu.epn.booking.autos.cooldown.started',
    prefix: 'cool',
    build: (d) => ({ auto_id: d.vehicle_id, estado: 'EN_LIMPIEZA', cooldown_minutos: d.cooldown_minutes, disponible_desde: d.available_from }),
  },
  [WebhookEvent.CAR_MAINTENANCE_ALERT]: {
    type: 'ec.edu.epn.booking.autos.mantenimiento.alerta',
    prefix: 'mant',
    build: (d) => ({ auto_id: d.vehicle_id, kilometraje_actual: d.odometer_km, proximo_mantenimiento_km: d.next_maintenance_km, severidad: 'WARNING' }),
  },
};

export function toCloudEvent(o: OutboxEvent) {
  return {
    specversion: '1.0',
    type: o.type,
    source: CLOUD_SOURCE,
    id: o.event_id,
    time: o.time.toISOString(),
    correlation_id: o.correlation_id ?? '',
    datacontenttype: 'application/json',
    data_json: JSON.stringify(o.data),
  };
}

export function toWebhookMsg(w: WebhookSubscription) {
  return { id: w.id, url: w.url, events: w.events, secret: w.secret ?? '' };
}

/**
 * Eventos de dominio por webhook (patrón EDA, Semana 6): publicar-suscribir desacoplado. Cada entrega
 * lleva correlation_id y firma HMAC opcional, se reintenta con backoff y deja registro (los FAILED
 * hacen de "dead letter queue" consultable). Nunca bloquea ni hace fallar la operación que lo disparó.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(WebhookSubscription) private readonly subscriptions: Repository<WebhookSubscription>,
    @InjectRepository(WebhookDelivery) private readonly deliveries: Repository<WebhookDelivery>,
    @InjectRepository(OutboxEvent) private readonly outbox: Repository<OutboxEvent>,
  ) {}

  async list() {
    return { webhooks: (await this.subscriptions.find()).map(toWebhookMsg) };
  }

  async create(req: { url: string; events: string[]; secret?: string }) {
    const saved = await this.subscriptions.save(
      this.subscriptions.create({ url: req.url, events: req.events as WebhookEvent[], secret: req.secret || null }),
    );
    return toWebhookMsg(saved);
  }

  async remove(req: { id: string }) {
    const r = await this.subscriptions.delete(req.id);
    if (!r.affected) throw notFound('Webhook no encontrado', `No existe un webhook con id "${req.id}".`);
  }

  async listDeliveries() {
    const found = await this.deliveries.find({ order: { created_at: 'DESC' }, take: 200 });
    return {
      deliveries: found.map((d) => ({
        id: d.id,
        subscription_id: d.subscription_id,
        url: d.url,
        event_id: d.event_id,
        event_type: d.event_type,
        correlation_id: d.correlation_id ?? '',
        status: d.status,
        attempts: d.attempts,
        last_error: d.last_error ?? '',
        created_at: d.created_at.toISOString(),
      })),
    };
  }

  /** Feed Transactional Outbox: eventos en orden de emisión; `after` es el id del último evento ya consumido. */
  async listEvents(req: { limit?: number; after?: string }) {
    const limit = Math.min(Math.max(req.limit || 10, 1), 100);
    let afterSeq = 0;
    if (req.after) {
      const marker = await this.outbox.findOneBy({ event_id: req.after });
      if (marker) afterSeq = marker.seq;
    }
    const [found, total] = await this.outbox.findAndCount({
      where: { seq: MoreThan(afterSeq) },
      order: { seq: 'ASC' },
      take: limit,
    });
    return { events: found.map(toCloudEvent), total, timestamp: new Date().toISOString() };
  }

  /**
   * Publica un evento de dominio: lo asienta en el outbox (esperado, para no perderlo) y lo despacha a los
   * webhooks suscritos en segundo plano (no espera la entrega ni hace fallar la operación que lo disparó).
   */
  async emit(eventType: WebhookEvent, resourceId: string, data: Record<string, unknown>): Promise<void> {
    const correlationId = currentCorrelationId();
    const cloud = CLOUD_EVENTS[eventType];
    if (cloud) {
      await this.outbox
        .save(
          this.outbox.create({
            event_id: `evt-car-${cloud.prefix}-${randomUUID().slice(0, 6)}`,
            type: cloud.type,
            correlation_id: correlationId ?? null,
            data: cloud.build(data),
          }),
        )
        .catch((err) => this.logger.warn(`No se pudo asentar ${eventType} en el outbox: ${(err as Error).message}`));
    }
    this.dispatch(eventType, resourceId, data, correlationId).catch((err) =>
      this.logger.warn(`No se pudo despachar ${eventType}: ${(err as Error).message}`),
    );
  }

  private async dispatch(
    eventType: WebhookEvent,
    resourceId: string,
    data: Record<string, unknown>,
    correlationId?: string,
  ) {
    const targets = (await this.subscriptions.find()).filter((s) => s.events.includes(eventType));
    if (!targets.length) return;
    const payload = {
      eventId: randomUUID(),
      eventType,
      timestamp: new Date().toISOString(),
      resourceId,
      correlationId,
      data,
    };
    await Promise.all(targets.map((t) => this.deliver(t, payload)));
  }

  private async deliver(target: WebhookSubscription, payload: any) {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Event-Id': payload.eventId,
      'X-Event-Type': payload.eventType,
    };
    if (payload.correlationId) headers['X-Correlation-Id'] = payload.correlationId;
    if (target.secret) headers['X-Signature'] = 'sha256=' + createHmac('sha256', target.secret).update(body).digest('hex');

    let lastError = '';
    let attempts = 0;
    for (const delay of RETRY_DELAYS_MS) {
      if (delay) await sleep(delay);
      attempts++;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(target.url, { method: 'POST', headers, body, signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          this.logger.log(`Webhook ${target.id} ${payload.eventType} entregado (intento ${attempts})`);
          await this.record(target, payload, 'DELIVERED', attempts, null);
          return;
        }
        lastError = `HTTP ${res.status}`;
      } catch (err) {
        lastError = (err as Error).message;
      }
      this.logger.warn(`Webhook ${target.id} ${payload.eventType} falló (intento ${attempts}): ${lastError}`);
    }
    await this.record(target, payload, 'FAILED', attempts, lastError);
  }

  private async record(
    target: WebhookSubscription,
    payload: any,
    status: 'DELIVERED' | 'FAILED',
    attempts: number,
    lastError: string | null,
  ) {
    await this.deliveries.save(
      this.deliveries.create({
        subscription_id: target.id,
        url: target.url,
        event_id: payload.eventId,
        event_type: payload.eventType,
        correlation_id: payload.correlationId ?? null,
        status,
        attempts,
        last_error: lastError,
      }),
    );
  }
}
