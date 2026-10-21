import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { currentCorrelationId, notFound } from '@autos/common';
import { WebhookDelivery, WebhookEvent, WebhookSubscription } from './entities/booking.entities';

const RETRY_DELAYS_MS = [0, 1000, 3000]; // 3 intentos con espera creciente
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  /** Dispara el evento en segundo plano (no espera la entrega). */
  emit(eventType: WebhookEvent, resourceId: string, data: Record<string, unknown>): void {
    const correlationId = currentCorrelationId();
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
