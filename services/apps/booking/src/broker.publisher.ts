import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as amqp from 'amqplib';
import { Kafka, Producer } from 'kafkajs';
import { IsNull, Repository } from 'typeorm';
import { OutboxEvent } from './entities/booking.entities';

const RELAY_INTERVAL_MS = 10_000;

/** "ec.edu.epn.booking.autos.order.confirmed" → "auto.order.confirmed" (routing key de RabbitMQ). */
export const routingKeyOf = (type: string) => `auto.${type.split('.autos.')[1] ?? type}`;

/**
 * Relay del Transactional Outbox hacia los brokers del agregador (contrato v2, §1.8):
 *   · RabbitMQ: exchange `booking.events` (topic), routing key `auto.order.confirmed`, `auto.order.cancelled`…
 *   · Apache Kafka: topic `topic-ordenes-b2b`, con el id del auto como clave (orden por vehículo).
 * Cada evento sale como CloudEvent v1.0 (modo estructurado). El outbox es la fuente de verdad: un evento solo
 * se marca `published_at` cuando TODOS los brokers configurados lo aceptaron; si alguno está caído se
 * reintenta cada 10 s, de modo que ningún evento se pierde ni se duplica por una caída del broker.
 * Sin RABBITMQ_URL ni KAFKA_BROKERS el relay queda inactivo (el feed GET /autos/eventos sigue disponible).
 */
@Injectable()
export class BrokerPublisher implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(BrokerPublisher.name);
  private amqpChannel?: amqp.Channel;
  private amqpConn?: amqp.ChannelModel;
  private kafka?: Producer;
  private sweeping = false;
  private timer?: NodeJS.Timeout;

  constructor(@InjectRepository(OutboxEvent) private readonly outbox: Repository<OutboxEvent>) {}

  private get rabbitUrl() {
    return process.env.RABBITMQ_URL;
  }
  private get kafkaBrokers() {
    return (process.env.KAFKA_BROKERS ?? '').split(',').map((b) => b.trim()).filter(Boolean);
  }
  private get exchange() {
    return process.env.RABBITMQ_EXCHANGE ?? 'booking.events';
  }
  private get topic() {
    return process.env.KAFKA_TOPIC ?? 'topic-ordenes-b2b';
  }

  get enabled(): boolean {
    return !!this.rabbitUrl || this.kafkaBrokers.length > 0;
  }

  onModuleInit() {
    if (!this.enabled) return;
    this.logger.log(
      `Relay de eventos activo → ${[this.rabbitUrl ? `RabbitMQ (${this.exchange})` : '', this.kafkaBrokers.length ? `Kafka (${this.topic})` : ''].filter(Boolean).join(' + ')}`,
    );
    this.timer = setInterval(() => void this.sweep(), RELAY_INTERVAL_MS);
    this.timer.unref();
    void this.sweep();
  }

  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    await this.amqpChannel?.close().catch(() => undefined);
    await this.amqpConn?.close().catch(() => undefined);
    await this.kafka?.disconnect().catch(() => undefined);
  }

  /** Publica los eventos pendientes en orden de emisión; se detiene en el primer fallo para conservar el orden. */
  async sweep(): Promise<number> {
    if (!this.enabled || this.sweeping) return 0;
    this.sweeping = true;
    let published = 0;
    try {
      const pending = await this.outbox.find({ where: { published_at: IsNull() }, order: { seq: 'ASC' }, take: 100 });
      for (const ev of pending) {
        await this.publish(ev);
        await this.outbox.update({ seq: ev.seq }, { published_at: new Date() });
        published++;
      }
    } catch (err) {
      this.logger.warn(`Relay en pausa, se reintentará: ${(err as Error).message}`);
      this.resetConnections();
    } finally {
      this.sweeping = false;
    }
    return published;
  }

  private cloudEvent(ev: OutboxEvent) {
    return {
      specversion: '1.0',
      type: ev.type,
      source: '/microservices/ms-autos',
      id: ev.event_id,
      time: ev.time.toISOString(),
      correlation_id: ev.correlation_id ?? '',
      datacontenttype: 'application/json',
      data: ev.data,
    };
  }

  private async publish(ev: OutboxEvent) {
    const body = JSON.stringify(this.cloudEvent(ev));
    if (this.rabbitUrl) {
      const ch = await this.rabbitChannel();
      const ok = ch.publish(this.exchange, routingKeyOf(ev.type), Buffer.from(body), {
        contentType: 'application/cloudevents+json',
        persistent: true,
        messageId: ev.event_id,
        type: ev.type,
        correlationId: ev.correlation_id ?? undefined,
        timestamp: Math.floor(ev.time.getTime() / 1000),
      });
      if (!ok) await new Promise((r) => ch.once('drain', r));
    }
    if (this.kafkaBrokers.length) {
      const producer = await this.kafkaProducer();
      await producer.send({
        topic: this.topic,
        messages: [
          {
            key: String((ev.data as any).auto_id ?? ev.event_id),
            value: body,
            headers: { 'content-type': 'application/cloudevents+json', ce_id: ev.event_id, ce_type: ev.type, ce_specversion: '1.0' },
          },
        ],
      });
    }
  }

  private async rabbitChannel(): Promise<amqp.Channel> {
    if (!this.amqpChannel) {
      const conn = await amqp.connect(this.rabbitUrl!);
      conn.on('error', () => this.resetConnections());
      conn.on('close', () => this.resetConnections());
      const ch = await conn.createChannel();
      await ch.assertExchange(this.exchange, 'topic', { durable: true });
      this.amqpConn = conn;
      this.amqpChannel = ch;
    }
    return this.amqpChannel;
  }

  private async kafkaProducer(): Promise<Producer> {
    if (!this.kafka) {
      const producer = new Kafka({ clientId: 'ms-autos', brokers: this.kafkaBrokers, retry: { retries: 2 } }).producer({ allowAutoTopicCreation: true });
      await producer.connect();
      this.kafka = producer;
    }
    return this.kafka;
  }

  private resetConnections() {
    this.amqpChannel = undefined;
    this.amqpConn = undefined;
    const k = this.kafka;
    this.kafka = undefined;
    void k?.disconnect().catch(() => undefined);
  }
}
