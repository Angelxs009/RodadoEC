import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('autos_suppliers')
export class Supplier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int', unique: true })
  supplier_id: number;

  @Column({ type: 'varchar', length: 200 })
  name: string;
}
