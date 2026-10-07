import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomerAuthGuard } from './auth/customer-auth.guard';
import { RegisterCustomerDto } from './auth/dto/register.dto';
import { LoginCustomerDto } from './auth/dto/login.dto';
import { CustomersService } from './customers.service';

interface AuthedRequest {
  customerId: string;
}

/**
 * Cuenta de cliente del dominio Autos: no forma parte del contrato público
 * autos-openapi.yaml (que espera un login central compartido del Booking
 * Prototipo), pero permite checkout más rápido y ver "Mis reservas" sin
 * depender de esa infraestructura compartida.
 */
@Controller()
@ApiTags('Cuenta de cliente')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

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
  @ApiTags('Cuenta de cliente')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener el perfil del cliente autenticado' })
  @UseGuards(CustomerAuthGuard)
  me(@Req() req: AuthedRequest) {
    return this.customersService.getProfile(req.customerId);
  }

  @Get('me/orders')
  @ApiTags('Cuenta de cliente')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar las reservas del cliente autenticado' })
  @UseGuards(CustomerAuthGuard)
  myOrders(@Req() req: AuthedRequest) {
    return this.customersService.listMyOrders(req.customerId);
  }
}
