import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomerTokenService } from './auth/customer-token.service';
import { RegisterCustomerDto } from './auth/dto/register.dto';
import { LoginCustomerDto } from './auth/dto/login.dto';
import { CustomersService } from './customers.service';

/**
 * Cuenta de cliente del dominio Autos: no forma parte del contrato público
 * autos-openapi.yaml (que espera un login central compartido del Booking
 * Prototipo), pero permite checkout más rápido y ver "Mis reservas" sin
 * depender de esa infraestructura compartida.
 */
@Controller()
@ApiTags('Cuenta de cliente')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly tokenService: CustomerTokenService,
  ) {}

  @Post('auth/register')
  @ApiOperation({ summary: 'Registrar una cuenta de cliente' })
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterCustomerDto) {
    return this.customersService.register(dto);
  }

  @Post('auth/login')
  @ApiOperation({ summary: 'Iniciar sesión como cliente' })
  login(@Body() dto: LoginCustomerDto) {
    return this.customersService.login(dto);
  }

  @Get('auth/me')
  @ApiOperation({
    summary: 'Obtener el perfil del cliente autenticado',
    description:
      'Sin token: devuelve null (nadie identificado), sin dar error, para que se pueda ' +
      'probar en Swagger sin Authorize. Con un token de /auth/login o /auth/register válido, ' +
      'devuelve el perfil real de esa cuenta.',
  })
  me(@Headers('authorization') authHeader?: string) {
    const customerId = this.extractCustomerId(authHeader);
    return customerId ? this.customersService.getProfile(customerId) : null;
  }

  @Get('me/orders')
  @ApiOperation({
    summary: 'Listar las reservas del cliente autenticado',
    description:
      'Sin token: devuelve una lista vacía (nadie identificado), sin dar error. ' +
      'Con un token válido, devuelve las reservas reales de esa cuenta.',
  })
  myOrders(@Headers('authorization') authHeader?: string) {
    const customerId = this.extractCustomerId(authHeader);
    return customerId ? this.customersService.listMyOrders(customerId) : [];
  }

  private extractCustomerId(authHeader?: string): string | null {
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    return this.tokenService.verify(token);
  }
}
