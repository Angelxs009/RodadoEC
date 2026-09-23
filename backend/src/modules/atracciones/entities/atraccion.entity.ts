import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

@Entity('atracciones')
export class Atraccion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  nombre: string;

  @Column({ type: 'text' })
  descripcion: string;

  @Column({ type: 'varchar', length: 100 })
  ciudad: string;

  @Column('numeric', {
    precision: 10,
    scale: 6,
    transformer: new ColumnNumericTransformer(),
  })
  latitud: number;

  @Column('numeric', {
    precision: 10,
    scale: 6,
    transformer: new ColumnNumericTransformer(),
  })
  longitud: number;

  @Column('numeric', {
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  precioTicket: number;

  @Column({ type: 'int' })
  duracionHoras: number;

  @Column({ type: 'boolean', default: true })
  estaActivo: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date;
}
