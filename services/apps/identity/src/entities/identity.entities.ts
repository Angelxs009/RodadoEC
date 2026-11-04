import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Administrador creado desde el panel (convive con el administrador de arranque definido por entorno). */
@Entity('admins')
export class AdminUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 60, unique: true })
  username: string;

  @Column({ type: 'varchar', length: 200 })
  password_hash: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  first_name: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  last_name: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 180, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 200 })
  password_hash: string;

  @Column({ type: 'varchar', length: 100 })
  first_name: string;

  @Column({ type: 'varchar', length: 100 })
  last_name: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone_number: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

/** Conductor registrado en el sistema (puede venir del Booking o de una reserva). Sin duplicados por email ni identificación. */
@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 160 })
  nombre: string;

  @Column({ type: 'varchar', length: 180, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 40, nullable: true, unique: true })
  identificacion: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  telefono: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  licencia: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
