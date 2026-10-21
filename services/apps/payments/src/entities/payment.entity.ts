import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, ValueTransformer } from 'typeorm';

class NumericTransformer implements ValueTransformer {
  to(data: number | null): number | null {
    return data;
  }
  from(data: string | null): number | null {
    return data ? parseFloat(data) : null;
  }
}

export enum PaymentStatus {
  APPROVED = 'APPROVED',
  DECLINED = 'DECLINED',
  REFUNDED = 'REFUNDED',
}

/** Pago simulado. Nunca se guarda el número completo de la tarjeta ni el CVV: solo marca y últimos 4. */
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  reference: string;

  @Column({ type: 'varchar', length: 20 })
  status: PaymentStatus;

  @Column('numeric', { precision: 10, scale: 2, transformer: new NumericTransformer() })
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
  @Column({ type: 'varchar', length: 50, nullable: true })
  order_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
