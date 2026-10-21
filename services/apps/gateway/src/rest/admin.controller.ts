import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseEnumPipe, ParseUUIDPipe, Post, Put, Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Backends } from '../backends';
import { Roles } from '../common/auth';
import { depotToAdmin, orderToRaw, presentFields, userToRest, vehicleToAdmin } from '../common/mappers';
import { CreateDepotAdminDto, UpdateDepotAdminDto } from '../dto/admin/depot-admin.dto';
import { CreateUserAdminDto, USER_ROLES, UserAdminResponseDto, type UserRole } from '../dto/admin/user-admin.dto';
import { CreateVehicleAdminDto, UpdateVehicleAdminDto } from '../dto/admin/vehicle-admin.dto';
import { OrderStatus } from '../dto/enums';

const vehicleInput = (d: Partial<CreateVehicleAdminDto>) => ({
  vehicle_id: d.vehicle_id ?? '',
  make: d.make ?? '',
  model: d.model ?? '',
  car_type: d.car_type ?? '',
  transmission: d.transmission ?? '',
  doors: d.doors ?? 0,
  bag_capacity: d.bag_capacity ?? 0,
  seats: d.seats ?? 0,
  price_per_day: d.price_per_day ?? 0,
  supplier_id: d.supplier_id ?? 0,
  depot_id: d.depot_id ?? 0,
  image_url: d.image_url ?? '',
  status: d.status ?? '',
  min_driver_age: d.min_driver_age ?? 0,
});

const depotInput = (d: Partial<CreateDepotAdminDto>) => ({
  depot_id: d.depot_id ?? 0,
  name: d.name ?? '',
  city_id: d.city_id ?? 0,
  airport: d.airport ?? '',
  score: d.score ?? 0,
});

/**
 * Backoffice de administración (no forma parte del contrato público). Fachada sobre Catálogo (autos y
 * agencias), Reservas (órdenes, entregas de webhooks) e Identidad (usuarios). Con AUTH_ENFORCE_ADMIN=true
 * exige un JWT de ADMIN (ver common/auth.ts).
 */
@Controller('admin')
@ApiTags('Administración')
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly backends: Backends) {}

  // ── Vehículos ────────────────────────────────────────────────────────────
  @Get('vehicles')
  @ApiOperation({ summary: 'Listar todos los vehículos del catálogo' })
  async listVehicles() {
    return (await this.backends.catalog.call<any>('AdminListVehicles', {})).vehicles.map(vehicleToAdmin);
  }

  @Post('vehicles')
  @ApiOperation({ summary: 'Registrar un nuevo vehículo en el catálogo' })
  async createVehicle(@Body() dto: CreateVehicleAdminDto) {
    return vehicleToAdmin(await this.backends.catalog.call('AdminCreateVehicle', vehicleInput(dto)));
  }

  @Put('vehicles/:id')
  @ApiOperation({ summary: 'Actualizar un vehículo existente' })
  async updateVehicle(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVehicleAdminDto) {
    return vehicleToAdmin(
      await this.backends.catalog.call('AdminUpdateVehicle', { id, patch: vehicleInput(dto), fields: presentFields(dto) }),
    );
  }

  @Post('vehicles/:id/release')
  @ApiOperation({ summary: 'Marcar un vehículo como DISPONIBLE (libera una reserva)' })
  async releaseVehicle(@Param('id', ParseUUIDPipe) id: string) {
    return vehicleToAdmin(await this.backends.catalog.call('AdminSetVehicleStatus', { id, status: 'AVAILABLE' }));
  }

  @Post('vehicles/:id/reserve')
  @ApiOperation({ summary: 'Marcar un vehículo como RESERVADO (bloquea nuevas reservas)' })
  async reserveVehicle(@Param('id', ParseUUIDPipe) id: string) {
    return vehicleToAdmin(await this.backends.catalog.call('AdminSetVehicleStatus', { id, status: 'RESERVED' }));
  }

  @Delete('vehicles/:id')
  @ApiOperation({ summary: 'Eliminar un vehículo del catálogo' })
  async deleteVehicle(@Param('id', ParseUUIDPipe) id: string) {
    await this.backends.catalog.call('AdminDeleteVehicle', { id });
  }

  // ── Agencias ─────────────────────────────────────────────────────────────
  @Get('depots')
  @ApiOperation({ summary: 'Listar todas las agencias (depots)' })
  async listDepots() {
    return (await this.backends.catalog.call<any>('AdminListDepots', {})).depots.map(depotToAdmin);
  }

  @Post('depots')
  @ApiOperation({ summary: 'Registrar una nueva agencia' })
  async createDepot(@Body() dto: CreateDepotAdminDto) {
    return depotToAdmin(await this.backends.catalog.call('AdminCreateDepot', depotInput(dto)));
  }

  @Put('depots/:id')
  @ApiOperation({ summary: 'Actualizar una agencia' })
  async updateDepot(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDepotAdminDto) {
    return depotToAdmin(
      await this.backends.catalog.call('AdminUpdateDepot', { id, patch: depotInput(dto), fields: presentFields(dto) }),
    );
  }

  @Delete('depots/:id')
  @ApiOperation({ summary: 'Eliminar una agencia' })
  async deleteDepot(@Param('id', ParseUUIDPipe) id: string) {
    await this.backends.catalog.call('AdminDeleteDepot', { id });
  }

  // ── Órdenes (solo lectura) ───────────────────────────────────────────────
  @Get('orders')
  @ApiOperation({ summary: 'Listar todas las órdenes (filtro opcional por estado)' })
  @ApiQuery({ name: 'status', enum: OrderStatus, required: false })
  async listOrders(@Query('status') status?: OrderStatus) {
    return (await this.backends.booking.call<any>('ListOrders', { status: status ?? '' })).orders.map(orderToRaw);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Detalle administrativo de una orden' })
  async getOrder(@Param('id', ParseUUIDPipe) id: string) {
    return orderToRaw(await this.backends.booking.call('GetOrder', { order_id: id }));
  }

  // ── Observabilidad de eventos ────────────────────────────────────────────
  @Get('webhook-deliveries')
  @ApiOperation({ summary: 'Entregas de webhooks (DELIVERED y FAILED tras agotar los reintentos)' })
  async deliveries() {
    return (await this.backends.booking.call<any>('ListWebhookDeliveries', {})).deliveries;
  }

  // ── Usuarios (administradores y clientes) ────────────────────────────────
  @Get('users')
  @ApiOperation({ summary: 'Listar usuarios (administradores y clientes)' })
  @ApiResponse({ status: 200, type: [UserAdminResponseDto] })
  async listUsers() {
    return (await this.backends.identity.call<any>('ListUsers', {})).users.map(userToRest);
  }

  @Post('users')
  @ApiOperation({
    summary: 'Crear un usuario administrador o cliente',
    description:
      'role=ADMIN requiere username + password. role=CUSTOMER requiere email, password, first_name y last_name. La cuenta creada puede iniciar sesión de inmediato.',
  })
  @ApiResponse({ status: 201, type: UserAdminResponseDto })
  @ApiResponse({ status: 409, description: 'Username o correo ya registrado' })
  async createUser(@Body() dto: CreateUserAdminDto) {
    return userToRest(
      await this.backends.identity.call('CreateUser', {
        role: dto.role,
        username: dto.username ?? '',
        email: dto.email ?? '',
        password: dto.password,
        first_name: dto.first_name ?? '',
        last_name: dto.last_name ?? '',
        phone_number: dto.phone_number ?? '',
      }),
    );
  }

  @Delete('users/:role/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un usuario' })
  @ApiParam({ name: 'role', enum: USER_ROLES })
  @ApiParam({ name: 'id', format: 'uuid' })
  async deleteUser(
    @Param('role', new ParseEnumPipe(USER_ROLES)) role: UserRole,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.backends.identity.call('DeleteUser', { role, id });
  }
}
