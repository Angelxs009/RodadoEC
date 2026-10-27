import { Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn, ValueTransformer } from 'typeorm';

class NumericTransformer implements ValueTransformer {
  to(data: number | null): number | null {
    return data;
  }
  from(data: string | null): number | null {
    return data ? parseFloat(data) : null;
  }
}

export enum OrderStatus {
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  PENDING = 'PENDING',
  // Fases presenciales del contrato v2
  DELIVERED = 'ENTREGADO',
  COMPLETED = 'COMPLETADA',
}

export enum WebhookEvent {
  CAR_ORDER_CONFIRMED = 'CAR_ORDER_CONFIRMED',
  CAR_ORDER_CANCELLED = 'CAR_ORDER_CANCELLED',
  CAR_PAYMENT_APPROVED = 'CAR_PAYMENT_APPROVED',
  CAR_VEHICLE_RESERVED = 'CAR_VEHICLE_RESERVED',
  CAR_VEHICLE_RELEASED = 'CAR_VEHICLE_RELEASED',
  CAR_COOLDOWN_STARTED = 'CAR_COOLDOWN_STARTED',
  CAR_MAINTENANCE_ALERT = 'CAR_MAINTENANCE_ALERT',
  DEPOT_UPDATE = 'DEPOT_UPDATE',
}

/** El id lo genera el servicio (UUID) para poder ligar el pago a la orden antes de guardarla. */
@Entity('orders')
export class Order {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  locator: string;

  @Column({ type: 'varchar', length: 20, default: OrderStatus.CONFIRMED })
  status: OrderStatus;

  // Snapshots desnormalizados: el servicio de Reservas no depende de las tablas de Catálogo.
  @Column({ type: 'jsonb' })
  vehicle_details: Record<string, any>;

  @Column({ type: 'jsonb' })
  route_details: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  driver_details: Record<string, any> | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  extras: string[];

  @Column('numeric', { precision: 10, scale: 2, transformer: new NumericTransformer() })
  total_price: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  payment_reference: string | null;

  // null = reserva de invitado
  @Column({ type: 'varchar', length: 50, nullable: true })
  customer_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  creation_date: Date;

  // ── Contrato v2 ──
  @Column({ type: 'varchar', length: 10, default: 'BASICA' })
  coverage_type: string;

  @Column('numeric', { precision: 10, scale: 2, transformer: new NumericTransformer(), default: 0 })
  deposit: number;

  @Column({ type: 'jsonb', nullable: true })
  pricing: { days: number; base: number; coverage: number; surcharge: number } | null;

  @Column({ type: 'timestamptz', nullable: true })
  checkin_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  delivered_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  returned_at: Date | null;

  @Column({ type: 'int', nullable: true })
  km_salida: number | null;

  @Column({ type: 'int', nullable: true })
  km_retorno: number | null;

  @Column({ type: 'jsonb', nullable: true })
  refund: { refund_id: string; amount: number; currency: string; percentage: number; status: string } | null;
}

/** Transactional Outbox: cada evento de dominio se asienta aquí como CloudEvent y se publica por GET /autos/eventos. */
@Entity('outbox_events')
export class OutboxEvent {
  @PrimaryGeneratedColumn()
  seq: number;

  @Column({ type: 'varchar', length: 60, unique: true })
  event_id: string;

  @Column({ type: 'varchar', length: 120 })
  type: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  correlation_id: string | null;

  @Column({ type: 'jsonb' })
  data: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  time: Date;

  // null = pendiente de publicar en los brokers (el relay lo reintenta hasta lograrlo)
  @Column({ type: 'timestamptz', nullable: true })
  published_at: Date | null;
}

/** Acuerdo B2B de promociones y combos (Cátedra RDA2 §9): una sola fila. */
@Entity('promo_contract')
export class PromoContract {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ type: 'boolean', default: true })
  allows_promotions: boolean;

  @Column('numeric', { precision: 5, scale: 2, transformer: new NumericTransformer(), default: 15 })
  max_discount_percentage: number;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  enabled_destinations: string[];

  @Column({ type: 'varchar', length: 10, nullable: true })
  valid_until: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  combo_conditions: string | null;
}

@Entity('webhook_subscriptions')
export class WebhookSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({ type: 'jsonb' })
  events: WebhookEvent[];

  @Column({ type: 'varchar', length: 100, nullable: true })
  secret: string | null;
}

/** Registro de entregas de webhooks: los FAILED son los "dead letters" tras agotar reintentos. */
@Entity('webhook_deliveries')
export class WebhookDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  subscription_id: string;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({ type: 'varchar', length: 50 })
  event_id: string;

  @Column({ type: 'varchar', length: 50 })
  event_type: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  correlation_id: string | null;

  @Column({ type: 'varchar', length: 20 })
  status: 'DELIVERED' | 'FAILED';

  @Column({ type: 'int' })
  attempts: number;

  @Column({ type: 'varchar', length: 300, nullable: true })
  last_error: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
