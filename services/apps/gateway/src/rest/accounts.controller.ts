import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Backends } from '../backends';
import { Roles } from '../common/auth';
import { orderToRaw, profileToRest } from '../common/mappers';
import { AdminLoginDto, AdminLoginResponseDto } from '../dto/admin/admin-login.dto';
import { CustomerAuthResponseDto, CustomerProfileDto } from '../dto/customers/customer-profile.dto';
import { LoginCustomerDto } from '../dto/customers/login.dto';
import { RegisterCustomerDto } from '../dto/customers/register.dto';

/** Cuenta de cliente y login de administrador: fachada sobre el microservicio de Identidad. */
@Controller('v1')
export class AccountsController {
  constructor(private readonly backends: Backends) {}

  @Post('auth/register')
  @ApiTags('Cuenta de cliente')
  @ApiOperation({ summary: 'Registrar una cuenta de cliente' })
  @ApiResponse({ status: 201, type: CustomerAuthResponseDto })
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterCustomerDto) {
    const r = await this.backends.identity.call<any>('RegisterCustomer', {
      email: dto.email,
      password: dto.password,
      first_name: dto.first_name,
      last_name: dto.last_name,
      phone_number: dto.phone_number ?? '',
    });
    return { token: r.token, profile: profileToRest(r.profile) };
  }

  @Post('auth/login')
  @ApiTags('Cuenta de cliente')
  @ApiOperation({ summary: 'Iniciar sesión como cliente' })
  @ApiResponse({ status: 201, type: CustomerAuthResponseDto })
  async login(@Body() dto: LoginCustomerDto) {
    const r = await this.backends.identity.call<any>('LoginCustomer', { login: dto.email, password: dto.password });
    return { token: r.token, profile: profileToRest(r.profile) };
  }

  @Get('auth/me')
  @Roles('CUSTOMER')
  @ApiTags('Cuenta de cliente')
  @ApiOperation({ summary: 'Obtener el perfil del cliente autenticado (null si no hay sesión)' })
  @ApiResponse({ status: 200, type: CustomerProfileDto })
  async me(@Req() req: any) {
    if (req.principal?.role !== 'CUSTOMER') return null;
    return profileToRest(await this.backends.identity.call('GetCustomer', { id: req.principal.subject }));
  }

  @Get('me/orders')
  @Roles('CUSTOMER')
  @ApiTags('Cuenta de cliente')
  @ApiOperation({ summary: 'Listar las reservas del cliente autenticado ([] si no hay sesión)' })
  async myOrders(@Req() req: any) {
    if (req.principal?.role !== 'CUSTOMER') return [];
    const r = await this.backends.booking.call<any>('ListOrders', { customer_id: req.principal.subject });
    return r.orders.map(orderToRaw);
  }

  @Post('admin/auth/login')
  @ApiTags('Administración')
  @ApiOperation({ summary: 'Iniciar sesión como administrador' })
  @ApiResponse({ status: 201, type: AdminLoginResponseDto })
  async adminLogin(@Body() dto: AdminLoginDto): Promise<AdminLoginResponseDto> {
    return this.backends.identity.call('LoginAdmin', { login: dto.username, password: dto.password });
  }
}
