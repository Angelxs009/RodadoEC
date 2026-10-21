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
}

export enum WebhookEvent {
  CAR_ORDER_CONFIRMED = 'CAR_ORDER_CONFIRMED',
  CAR_ORDER_CANCELLED = 'CAR_ORDER_CANCELLED',
  CAR_PAYMENT_APPROVED = 'CAR_PAYMENT_APPROVED',
  CAR_VEHICLE_RESERVED = 'CAR_VEHICLE_RESERVED',
  CAR_VEHICLE_RELEASED = 'CAR_VEHICLE_RELEASED',
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
