import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Cuenta de administrador del backoffice, creada desde el propio panel Admin.
 * Convive con el administrador "de entorno" (ADMIN_USERNAME / ADMIN_PASSWORD),
 * que sigue siendo la cuenta de arranque para poder entrar la primera vez.
 */
@Entity('autos_admins')
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
