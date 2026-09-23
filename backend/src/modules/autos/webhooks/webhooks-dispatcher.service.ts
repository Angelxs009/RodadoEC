import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { WebhookEvent, WebhookSubscription } from '../entities/webhook-subscription.entity';

/**
 * Implementación mínima de un despachador de eventos (patrón EDA): cuando
 * ocurre un evento de negocio relevante (orden confirmada/cancelada), notifica
 * por HTTP POST a cada webhook suscrito a ese evento. Best-effort: un webhook
 * caído se loguea pero nunca bloquea ni falla la operación que lo disparó.
 */
@Injectable()
export class WebhooksDispatcherService {
  private readonly logger = new Logger(WebhooksDispatcherService.name);

  constructor(
    @InjectRepository(WebhookSubscription)
    private readonly webhookRepository: Repository<WebhookSubscription>,
  ) {}

  async dispatch(eventType: WebhookEvent, order: Order): Promise<void> {
    const subscriptions = await this.webhookRepository.find();
    const targets = subscriptions.filter((s) => s.events.includes(eventType));

    if (targets.length === 0) return;

    const payload = {
      eventId: randomUUID(),
      eventType,
      timestamp: new Date().toISOString(),
      resourceId: order.id,
      data: { locator: order.locator, status: order.status, total_price: order.total_price },
    };

    await Promise.all(targets.map((target) => this.deliver(target, payload)));
  }

  private async deliver(target: WebhookSubscription, payload: unknown): Promise<void> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(target.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      this.logger.log(`Webhook ${target.id} -> ${target.url}: HTTP ${response.status}`);
    } catch (err) {
      this.logger.warn(`Webhook ${target.id} -> ${target.url} falló: ${(err as Error).message}`);
    }
  }
}
