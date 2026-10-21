import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { timingSafeEqual } from 'crypto';
import { Repository } from 'typeorm';
import { badRequest, conflict, JwtTokens, notFound, unauthorized } from '@autos/common';
import { AdminUser, Customer } from './entities/identity.entities';
import { PasswordService } from './password.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,60}$/;

const envAdminUsername = () => process.env.ADMIN_USERNAME || 'admin';
const envAdminPassword = () => process.env.ADMIN_PASSWORD || 'rodadoec2026';

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface UserAccountMsg {
  id: string;
  role: 'ADMIN' | 'CUSTOMER';
  login: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  created_at: string;
  protected: boolean;
}

@Injectable()
export class IdentityService {
  private readonly tokens = new JwtTokens();

  constructor(
    @InjectRepository(AdminUser) private readonly admins: Repository<AdminUser>,
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    private readonly passwords: PasswordService,
  ) {}

  // ── Clientes ────────────────────────────────────────────────────────────
  async registerCustomer(req: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    phone_number?: string;
  }) {
    const email = req.email.trim().toLowerCase();
    if (await this.customers.findOneBy({ email })) {
      throw conflict('Ya existe una cuenta registrada con ese correo.');
    }
    const saved = await this.customers.save(
      this.customers.create({
        email,
        password_hash: this.passwords.hash(req.password),
        first_name: req.first_name,
        last_name: req.last_name,
        phone_number: req.phone_number || null,
      }),
    );
    return { token: this.tokens.signCustomer(saved.id), profile: this.profile(saved) };
  }

  async loginCustomer(req: { login: string; password: string }) {
    const customer = await this.customers.findOneBy({ email: req.login.trim().toLowerCase() });
    if (!customer || !this.passwords.verify(req.password, customer.password_hash)) {
      throw unauthorized('Correo o contraseña incorrectos.');
    }
    return { token: this.tokens.signCustomer(customer.id), profile: this.profile(customer) };
  }

  async getCustomer(req: { id: string }) {
    const customer = await this.customers.findOneBy({ id: req.id });
    if (!customer) throw unauthorized('Cuenta no encontrada.');
    return this.profile(customer);
  }

  // ── Administradores ─────────────────────────────────────────────────────
  async loginAdmin(req: { login: string; password: string }) {
    // Se evalúan ambas comparaciones sin cortocircuito para no filtrar cuál falló.
    const validUser = safeEqual(req.login, envAdminUsername());
    const validPass = safeEqual(req.password, envAdminPassword());
    if (validUser && validPass) return { token: this.tokens.signAdmin(req.login) };

    const admin = await this.admins.findOneBy({ username: req.login.trim().toLowerCase() });
    if (!admin || !this.passwords.verify(req.password, admin.password_hash)) {
      throw unauthorized('Usuario o contraseña incorrectos.');
    }
    return { token: this.tokens.signAdmin(admin.username) };
  }

  verifyToken(req: { token: string }) {
    const principal = this.tokens.verify(req.token);
    if (!principal) throw unauthorized('Sesión inválida o expirada.');
    return principal;
  }

  // ── Gestión de usuarios (panel Admin) ───────────────────────────────────
  async listUsers(): Promise<{ users: UserAccountMsg[] }> {
    const [admins, customers] = await Promise.all([
      this.admins.find({ order: { created_at: 'ASC' } }),
      this.customers.find({ order: { created_at: 'ASC' } }),
    ]);
    return {
      users: [
        this.account('', 'ADMIN', envAdminUsername(), '', '', '', '', true),
        ...admins.map((a) =>
          this.account(a.id, 'ADMIN', a.username, a.first_name, a.last_name, '', a.created_at.toISOString(), false),
        ),
        ...customers.map((c) =>
          this.account(c.id, 'CUSTOMER', c.email, c.first_name, c.last_name, c.phone_number, c.created_at.toISOString(), false),
        ),
      ],
    };
  }

  async createUser(req: {
    role: string;
    username?: string;
    email?: string;
    password: string;
    first_name?: string;
    last_name?: string;
    phone_number?: string;
  }): Promise<UserAccountMsg> {
    if (req.role === 'ADMIN') {
      if (!req.username || !USERNAME_RE.test(req.username)) {
        throw badRequest('username es obligatorio (3–60 caracteres: letras, números, punto, guion o guion bajo).');
      }
      const username = req.username.trim().toLowerCase();
      if (username === envAdminUsername().toLowerCase() || (await this.admins.findOneBy({ username }))) {
        throw conflict('Ya existe un administrador con ese username.');
      }
      const saved = await this.admins.save(
        this.admins.create({
          username,
          password_hash: this.passwords.hash(req.password),
          first_name: req.first_name || null,
          last_name: req.last_name || null,
        }),
      );
      return this.account(saved.id, 'ADMIN', saved.username, saved.first_name, saved.last_name, '', saved.created_at.toISOString(), false);
    }

    if (req.role === 'CUSTOMER') {
      if (!req.email || !EMAIL_RE.test(req.email)) throw badRequest('email válido es obligatorio para crear un cliente.');
      if (!req.first_name || !req.last_name) {
        throw badRequest('first_name y last_name son obligatorios para crear un cliente.');
      }
      const email = req.email.trim().toLowerCase();
      if (await this.customers.findOneBy({ email })) throw conflict('Ya existe una cuenta registrada con ese correo.');
      const saved = await this.customers.save(
        this.customers.create({
          email,
          password_hash: this.passwords.hash(req.password),
          first_name: req.first_name,
          last_name: req.last_name,
          phone_number: req.phone_number || null,
        }),
      );
      return this.account(saved.id, 'CUSTOMER', saved.email, saved.first_name, saved.last_name, saved.phone_number, saved.created_at.toISOString(), false);
    }
    throw badRequest('role debe ser ADMIN o CUSTOMER.');
  }

  async deleteUser(req: { role: string; id: string }): Promise<void> {
    const repo = req.role === 'ADMIN' ? this.admins : req.role === 'CUSTOMER' ? this.customers : null;
    if (!repo) throw badRequest('role debe ser ADMIN o CUSTOMER.');
    const result = await (repo as Repository<any>).delete(req.id);
    if (!result.affected) throw notFound('Usuario no encontrado', `Usuario "${req.id}" no encontrado`);
  }

  // ── helpers ─────────────────────────────────────────────────────────────
  private profile(c: Customer) {
    return {
      id: c.id,
      email: c.email,
      first_name: c.first_name,
      last_name: c.last_name,
      phone_number: c.phone_number ?? '',
    };
  }

  private account(
    id: string,
    role: 'ADMIN' | 'CUSTOMER',
    login: string,
    first_name: string | null,
    last_name: string | null,
    phone_number: string | null,
    created_at: string,
    isProtected: boolean,
  ): UserAccountMsg {
    return {
      id,
      role,
      login,
      first_name: first_name ?? '',
      last_name: last_name ?? '',
      phone_number: phone_number ?? '',
      created_at,
      protected: isProtected,
    };
  }
}
