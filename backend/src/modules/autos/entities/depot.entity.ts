import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

@Entity('autos_depots')
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

  @Column('numeric', {
    precision: 3,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
    default: 0,
  })
  score: number;
}
