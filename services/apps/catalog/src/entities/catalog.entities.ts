import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ValueTransformer } from 'typeorm';

class NumericTransformer implements ValueTransformer {
  to(data: number | null): number | null {
    return data;
  }
  from(data: string | null): number | null {
    return data ? parseFloat(data) : null;
  }
}

/** Máquina de estados de 6 fases (contrato v2 · Cátedra RDA2 §5). El gateway los traduce a DISPONIBLE, RESERVADO, … */
export enum VehicleStatus {
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  READY_FOR_DELIVERY = 'READY_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  CLEANING = 'CLEANING',
  MAINTENANCE = 'MAINTENANCE',
}

/** Cooldown obligatorio de limpieza tras la devolución. */
export const CLEANING_COOLDOWN_MINUTES = 120;
export const DEFAULT_MAINTENANCE_KM = 10000;

export const DEFAULT_MIN_DRIVER_AGE = 18; // mayoría de edad en Ecuador

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  vehicle_id: string;

  @Column({ type: 'varchar', length: 100 })
  make: string;

  @Column({ type: 'varchar', length: 100 })
  model: string;

  @Column({ type: 'varchar', length: 50 })
  car_type: string;

  @Column({ type: 'varchar', length: 50 })
  transmission: string;

  @Column({ type: 'int' })
  doors: number;

  @Column({ type: 'int' })
  bag_capacity: number;

  @Column({ type: 'int' })
  seats: number;

  @Column('numeric', { precision: 10, scale: 2, transformer: new NumericTransformer() })
  price_per_day: number;

  @Column({ type: 'int' })
  supplier_id: number;

  @Column({ type: 'int' })
  depot_id: number;

  @Column({ type: 'varchar', length: 300, nullable: true })
  image_url: string | null;

  // null = valor por defecto (18)
  @Column({ type: 'int', nullable: true })
  min_driver_age: number | null;

  // RESERVED = tiene una reserva activa; solo el admin (o cancelar la orden) lo devuelve a AVAILABLE.
  @Column({ type: 'varchar', length: 20, default: VehicleStatus.AVAILABLE })
  status: VehicleStatus;

  @Column({ type: 'int', default: 0 })
  odometer_km: number;

  @Column({ type: 'int', default: DEFAULT_MAINTENANCE_KM })
  next_maintenance_km: number;

  // Fin del cooldown de limpieza: hasta entonces el auto está EN_LIMPIEZA y no aparece en las búsquedas.
  @Column({ type: 'timestamptz', nullable: true })
  available_from: Date | null;
}

/** Bitácora de mantenimiento (rol técnico). */
@Entity('maintenance_log')
export class MaintenanceLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50 })
  vehicle_id: string;

  @Column({ type: 'varchar', length: 100 })
  technician_id: string;

  @Column({ type: 'int' })
  odometer_km: number;

  @Column({ type: 'int' })
  fuel_level: number;

  @Column({ type: 'varchar', length: 300, nullable: true })
  body_condition: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  tires_condition: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes: string | null;

  @Column({ type: 'boolean', default: false })
  maintenance_done: boolean;

  @Column({ type: 'boolean', default: false })
  alert: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

@Entity('depots')
export class Depot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int', unique: true })
  depot_id: number;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'int' })
  city_id: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  airport: string | null;

  @Column('numeric', { precision: 3, scale: 2, transformer: new NumericTransformer(), default: 0 })
  score: number;
}

@Entity('suppliers')
export class Supplier {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', unique: true })
  supplier_id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;
}
