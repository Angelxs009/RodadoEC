import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

export enum PaymentStatus {
  APPROVED = 'APPROVED',
  DECLINED = 'DECLINED',
  REFUNDED = 'REFUNDED',
}

/**
 * Pago simulado. Nunca se guarda el número completo de la tarjeta ni el CVV:
 * solo la marca y los últimos 4 dígitos (igual que haría una pasarela real).
 */
@Entity('autos_payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Referencia que el cliente envía luego en orders/create (payment_reference).
  @Column({ type: 'varchar', length: 30, unique: true })
  reference: string;

  @Column({ type: 'enum', enum: PaymentStatus })
  status: PaymentStatus;

  @Column('numeric', { precision: 10, scale: 2, transformer: new ColumnNumericTransformer() })
  amount: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 50 })
  order_preview_id: string;

  @Column({ type: 'varchar', length: 20 })
  card_brand: string;

  @Column({ type: 'varchar', length: 4 })
  card_last4: string;

  @Column({ type: 'varchar', length: 100 })
  cardholder_name: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  decline_reason: string | null;

  // Se llena cuando el pago se consume en una orden (un pago = una orden).
  @Column({ type: 'uuid', nullable: true })
  order_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
