import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

export enum OrderStatus {
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  PENDING = 'PENDING',
}

@Entity('autos_orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  locator: string;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.CONFIRMED })
  status: OrderStatus;

  @Column({ type: 'jsonb' })
  vehicle_details: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  route_details: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  driver_details: Record<string, unknown> | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  extras: string[];

  @Column('numeric', {
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  total_price: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  payment_reference: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  creation_date: Date;
}
