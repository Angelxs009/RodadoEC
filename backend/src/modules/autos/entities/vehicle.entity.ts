import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

@Entity('autos_vehicles')
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

  @Column('numeric', {
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  price_per_day: number;

  @Column({ type: 'int' })
  supplier_id: number;

  @Column({ type: 'int' })
  depot_id: number;

  @Column({ type: 'varchar', length: 300, nullable: true })
  image_url: string | null;
}
