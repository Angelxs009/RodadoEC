import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum WebhookEvent {
  CAR_ORDER_CONFIRMED = 'CAR_ORDER_CONFIRMED',
  CAR_ORDER_CANCELLED = 'CAR_ORDER_CANCELLED',
  DEPOT_UPDATE = 'DEPOT_UPDATE',
}

@Entity('autos_webhook_subscriptions')
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
