import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasswordService } from '../customers/auth/password.service';
import { Customer } from '../customers/entities/customer.entity';
import { CreateUserAdminDto, UserAdminResponseDto, UserRole } from './dto/user-admin.dto';
import { AdminUser } from './entities/admin-user.entity';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const envAdminUsername = () => process.env.ADMIN_USERNAME || 'admin';

/**
 * Gestión de usuarios desde el panel Admin: permite crear tanto administradores
 * como clientes. Ambos quedan con contraseña hasheada (scrypt) y pueden iniciar
 * sesión de inmediato: los admin en /admin/auth/login y los clientes en /auth/login.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(AdminUser) private readonly adminRepository: Repository<AdminUser>,
    @InjectRepository(Customer) private readonly customerRepository: Repository<Customer>,
    private readonly passwordService: PasswordService,
  ) {}

  async list(): Promise<UserAdminResponseDto[]> {
    const [admins, customers] = await Promise.all([
      this.adminRepository.find({ order: { created_at: 'ASC' } }),
      this.customerRepository.find({ order: { created_at: 'ASC' } }),
    ]);

    return [
      {
        id: null,
        role: 'ADMIN',
        login: envAdminUsername(),
        first_name: null,
        last_name: null,
        phone_number: null,
        created_at: null,
        protected: true,
      },
      ...admins.map((a) => ({
        id: a.id,
        role: 'ADMIN' as const,
        login: a.username,
        first_name: a.first_name,
        last_name: a.last_name,
        phone_number: null,
        created_at: a.created_at.toISOString(),
        protected: false,
      })),
      ...customers.map((c) => ({
        id: c.id,
        role: 'CUSTOMER' as const,
        login: c.email,
        first_name: c.first_name,
        last_name: c.last_name,
        phone_number: c.phone_number,
        created_at: c.created_at.toISOString(),
        protected: false,
      })),
    ];
  }

  async create(dto: CreateUserAdminDto): Promise<UserAdminResponseDto> {
    return dto.role === 'ADMIN' ? this.createAdmin(dto) : this.createCustomer(dto);
  }

  private async createAdmin(dto: CreateUserAdminDto): Promise<UserAdminResponseDto> {
    if (!dto.username) {
      throw new BadRequestException('username es obligatorio para crear un administrador.');
    }
    const username = dto.username.trim().toLowerCase();
    if (
      username === envAdminUsername().toLowerCase() ||
      (await this.adminRepository.findOneBy({ username }))
    ) {
      throw new ConflictException('Ya existe un administrador con ese username.');
    }

    const saved = await this.adminRepository.save(
      this.adminRepository.create({
        username,
        password_hash: this.passwordService.hash(dto.password),
        first_name: dto.first_name ?? null,
        last_name: dto.last_name ?? null,
      }),
    );
    return {
      id: saved.id,
      role: 'ADMIN',
      login: saved.username,
      first_name: saved.first_name,
      last_name: saved.last_name,
      phone_number: null,
      created_at: saved.created_at.toISOString(),
      protected: false,
    };
  }

  private async createCustomer(dto: CreateUserAdminDto): Promise<UserAdminResponseDto> {
    if (!dto.email || !EMAIL_RE.test(dto.email)) {
      throw new BadRequestException('email válido es obligatorio para crear un cliente.');
    }
    if (!dto.first_name || !dto.last_name) {
      throw new BadRequestException('first_name y last_name son obligatorios para crear un cliente.');
    }
    const email = dto.email.trim().toLowerCase();
    if (await this.customerRepository.findOneBy({ email })) {
      throw new ConflictException('Ya existe una cuenta registrada con ese correo.');
    }

    const saved = await this.customerRepository.save(
      this.customerRepository.create({
        email,
        password_hash: this.passwordService.hash(dto.password),
        first_name: dto.first_name,
        last_name: dto.last_name,
        phone_number: dto.phone_number ?? null,
      }),
    );
    return {
      id: saved.id,
      role: 'CUSTOMER',
      login: saved.email,
      first_name: saved.first_name,
      last_name: saved.last_name,
      phone_number: saved.phone_number,
      created_at: saved.created_at.toISOString(),
      protected: false,
    };
  }

  async remove(role: UserRole, id: string): Promise<void> {
    const repo: Repository<AdminUser | Customer> =
      role === 'ADMIN' ? this.adminRepository : this.customerRepository;
    const result = await repo.delete(id);
    if (!result.affected) throw new NotFoundException(`Usuario "${id}" no encontrado`);
  }

  /** Valida credenciales de un administrador creado desde el panel. */
  async verifyAdminCredentials(username: string, password: string): Promise<AdminUser | null> {
    const admin = await this.adminRepository.findOneBy({ username: username.trim().toLowerCase() });
    if (!admin || !this.passwordService.verify(password, admin.password_hash)) return null;
    return admin;
  }
}
