import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrderStatus } from '../autos/entities/order.entity';
import { AdminService } from './admin.service';
import { CreateDepotAdminDto, UpdateDepotAdminDto } from './dto/depot-admin.dto';
import { CreateVehicleAdminDto, UpdateVehicleAdminDto } from './dto/vehicle-admin.dto';

/**
 * Backoffice interno de administración del dominio Autos: no forma parte del
 * contrato público autos-openapi.yaml (ese contrato es de consumo, no de
 * gestión), pero se documenta igual en Swagger bajo su propio tag.
 */
@Controller('admin')
@ApiTags('Administración')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Vehículos ──────────────────────────────────────────────────────────

  @Get('vehicles')
  @ApiOperation({ summary: 'Listar todos los vehículos del catálogo' })
  listVehicles() {
    return this.adminService.listVehicles();
  }

  @Post('vehicles')
  @ApiOperation({ summary: 'Registrar un nuevo vehículo en el catálogo' })
  createVehicle(@Body() dto: CreateVehicleAdminDto) {
    return this.adminService.createVehicle(dto);
  }

  @Put('vehicles/:id')
  @ApiOperation({ summary: 'Actualizar un vehículo existente' })
  updateVehicle(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVehicleAdminDto) {
    return this.adminService.updateVehicle(id, dto);
  }

  @Delete('vehicles/:id')
  @ApiOperation({ summary: 'Eliminar un vehículo del catálogo' })
  deleteVehicle(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.deleteVehicle(id);
  }

  // ── Depots ─────────────────────────────────────────────────────────────

  @Get('depots')
  @ApiOperation({ summary: 'Listar todas las agencias (depots)' })
  listDepots() {
    return this.adminService.listDepots();
  }

  @Post('depots')
  @ApiOperation({ summary: 'Registrar una nueva agencia' })
  createDepot(@Body() dto: CreateDepotAdminDto) {
    return this.adminService.createDepot(dto);
  }

  @Put('depots/:id')
  @ApiOperation({ summary: 'Actualizar una agencia existente' })
  updateDepot(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDepotAdminDto) {
    return this.adminService.updateDepot(id, dto);
  }

  @Delete('depots/:id')
  @ApiOperation({ summary: 'Eliminar una agencia' })
  deleteDepot(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.deleteDepot(id);
  }

  // ── Órdenes (solo lectura) ─────────────────────────────────────────────

  @Get('orders')
  @ApiOperation({ summary: 'Listar todas las órdenes, opcionalmente filtradas por estado' })
  @ApiQuery({ name: 'status', enum: OrderStatus, required: false })
  listOrders(@Query('status') status?: OrderStatus) {
    return this.adminService.listOrders(status);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Obtener el detalle administrativo de una orden' })
  getOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getOrder(id);
  }
}
