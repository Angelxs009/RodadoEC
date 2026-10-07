import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../autos/entities/order.entity';
import { PasswordService } from './auth/password.service';
import { CustomerTokenService } from './auth/customer-token.service';
import { Customer } from './entities/customer.entity';
import { RegisterCustomerDto } from './auth/dto/register.dto';
import { LoginCustomerDto } from './auth/dto/login.dto';
import { CustomerAuthResponseDto, CustomerProfileDto } from './dto/customer-profile.dto';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer) private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Order) private readonly orderRepository: Repository<Order>,
    private readonly passwordService: PasswordService,
    private readonly tokenService: CustomerTokenService,
  ) {}

  async register(dto: RegisterCustomerDto): Promise<CustomerAuthResponseDto> {
    const existing = await this.customerRepository.findOneBy({ email: dto.email.toLowerCase() });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta registrada con ese correo.');
    }

    const customer = this.customerRepository.create({
      email: dto.email.toLowerCase(),
      password_hash: this.passwordService.hash(dto.password),
      first_name: dto.first_name,
      last_name: dto.last_name,
      phone_number: dto.phone_number ?? null,
    });
    const saved = await this.customerRepository.save(customer);

    return { token: this.tokenService.sign(saved.id), profile: this.toProfile(saved) };
  }

  async login(dto: LoginCustomerDto): Promise<CustomerAuthResponseDto> {
    const customer = await this.customerRepository.findOneBy({ email: dto.email.toLowerCase() });
    if (!customer || !this.passwordService.verify(dto.password, customer.password_hash)) {
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }
    return { token: this.tokenService.sign(customer.id), profile: this.toProfile(customer) };
  }

  async getProfile(customerId: string): Promise<CustomerProfileDto> {
    const customer = await this.customerRepository.findOneBy({ id: customerId });
    if (!customer) {
      throw new UnauthorizedException('Cuenta no encontrada.');
    }
    return this.toProfile(customer);
  }

  listMyOrders(customerId: string): Promise<Order[]> {
    return this.orderRepository.find({
      where: { customer_id: customerId },
      order: { creation_date: 'DESC' },
    });
  }

  private toProfile(customer: Customer): CustomerProfileDto {
    return {
      id: customer.id,
      email: customer.email,
      first_name: customer.first_name,
      last_name: customer.last_name,
      phone_number: customer.phone_number,
    };
  }
}
