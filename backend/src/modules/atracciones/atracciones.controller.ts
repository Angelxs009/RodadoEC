import { Controller, Get, Post, Body, Patch, Put, Param, Delete, ParseUUIDPipe, Res, HttpCode, HttpStatus, Query, Header, Headers, HttpException } from '@nestjs/common';
import { Response } from 'express';
import { AtraccionesService } from './atracciones.service';
import { CreateAtraccionDto } from './dto/create-atraccion.dto';
import { UpdateAtraccionDto } from './dto/update-atraccion.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AtraccionResponseDto } from './dto/atraccion-response.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { SearchAtraccionesDto } from './dto/search-atracciones.dto';
import { SearchAtraccionesResponseDto } from './dto/search-response.dto';
import { DetailsRequestDto } from './dto/details-request.dto';
import { AvailabilityResponseDto } from './dto/availability.dto';
import { ReservationRequestDto, ReservationResponseDto, CancelReservationRequestDto } from './dto/reservation.dto';

@ApiTags('Atracciones')
@Controller('atracciones')
export class AtraccionesController {
  constructor(private readonly atraccionesService: AtraccionesService) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Búsqueda de atracciones (soporta paginación por tokens)' })
  @ApiResponse({ status: 200, description: 'Resultados de la búsqueda.', type: SearchAtraccionesResponseDto })
  @ApiResponse({ status: 400, description: 'Bad Request. Datos de entrada inválidos.' })
  search(@Body() searchDto: SearchAtraccionesDto) {
    return this.atraccionesService.search(searchDto);
  }

  @Post('details')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtener detalles de múltiples atracciones (Batch)' })
  @ApiResponse({ status: 200, description: 'Detalles de atracciones', type: SearchAtraccionesResponseDto })
  async getDetailsBatch(@Body() dto: DetailsRequestDto) {
    return this.atraccionesService.getDetailsBatch(dto);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar una nueva atracción' })
  @ApiResponse({ status: 201, description: 'La atracción ha sido creada exitosamente. Devuelve cabecera Location.', type: AtraccionResponseDto })
  @ApiResponse({ status: 400, description: 'Bad Request. Datos de entrada inválidos.' })
  create(
    @Body() createAtraccionDto: CreateAtraccionDto,
    @Res({ passthrough: true }) res: Response
  ): AtraccionResponseDto {
    const atraccion = this.atraccionesService.create(createAtraccionDto);
    res.setHeader('Location', `/api/v1/atracciones/${atraccion.id || 'uuid-generado'}`);
    return atraccion;
  }

  @Get()
  @Header('X-API-Deprecation-Date', '2027-12-31')
  @Header('Cache-Control', 'max-age=300')
  @ApiOperation({ summary: 'Obtener el listado paginado de atracciones' })
  @ApiResponse({ status: 200, description: 'Listado de atracciones recuperado exitosamente.', type: PaginatedResponseDto })
  findAll(@Query() query: PaginationQueryDto) {
    return this.atraccionesService.findAll(query);
  }

  @Get('health')
  @ApiOperation({ summary: 'Healthcheck del microservicio para el API Gateway (Reto 2)' })
  @ApiResponse({ status: 200, description: 'Servicio de atracciones operativo.' })
  checkHealth() {
    return { status: 'UP', timestamp: new Date().toISOString() };
  }

  @Get(':id')
  @Header('X-API-Deprecation-Date', '2027-12-31')
  @Header('Cache-Control', 'max-age=300')
  @ApiOperation({ summary: 'Obtener el detalle de una atracción por su ID' })
  @ApiParam({ name: 'id', description: 'UUID de la atracción', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Detalle de la atracción.', type: AtraccionResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found. La atracción no existe.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): AtraccionResponseDto {
    return this.atraccionesService.findOne(id);
  }

  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reemplazar datos de una atracción' })
  @ApiParam({ name: 'id', description: 'UUID de la atracción', type: 'string', format: 'uuid' })
  async replace(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateAtraccionDto) {
    return this.atraccionesService.replace(id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar parcialmente una atracción' })
  @ApiParam({ name: 'id', description: 'UUID de la atracción', type: 'string', format: 'uuid' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAtraccionDto) {
    return this.atraccionesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una atracción' })
  @ApiParam({ name: 'id', description: 'UUID de la atracción', type: 'string', format: 'uuid' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.atraccionesService.delete(id);
  }

  @Get(':id/availability')
  @ApiOperation({ summary: 'Consultar disponibilidad de cupos' })
  @ApiParam({ name: 'id', description: 'UUID de la atracción', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Disponibilidad recuperada exitosamente.', type: AvailabilityResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found. La atracción no existe.' })
  getAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('date') date: string
  ): AvailabilityResponseDto {
    return this.atraccionesService.getAvailability(id, date);
  }

  @Post(':id/reservations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear una reserva de la atracción' })
  @ApiParam({ name: 'id', description: 'UUID de la atracción', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Reserva confirmada', type: ReservationResponseDto })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 404, description: 'Not Found.' })
  @ApiResponse({ status: 409, description: 'Conflicto de Idempotencia.' })
  reserve(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() reservationDto: ReservationRequestDto
  ): ReservationResponseDto {
    if (!idempotencyKey) {
      throw new HttpException('Idempotency-Key header is required', HttpStatus.BAD_REQUEST);
    }
    return this.atraccionesService.reserve(id, reservationDto, idempotencyKey);
  }

  @Post('reservations/:reservationId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar una reserva existente (Requiere Idempotency-Key)' })
  @ApiParam({ name: 'reservationId', description: 'ID de la reserva a cancelar', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Reserva cancelada exitosamente.', type: ReservationResponseDto })
  @ApiResponse({ status: 409, description: 'Conflicto de Idempotencia.' })
  cancelReservation(
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: CancelReservationRequestDto
  ): ReservationResponseDto {
    if (!idempotencyKey) {
      throw new HttpException('Idempotency-Key header is required', HttpStatus.BAD_REQUEST);
    }
    return this.atraccionesService.cancelReservation(reservationId, dto, idempotencyKey);
  }

  @Get('reservations')
  @ApiOperation({ summary: 'Consultar el historial de reservas del usuario' })
  @ApiResponse({ status: 200, description: 'Listado de reservas.' })
  getReservations(): ReservationResponseDto[] {
    return this.atraccionesService.getReservations();
  }

  @Get('reservations/:reservationId')
  @ApiOperation({ summary: 'Obtener detalle de una reserva específica' })
  @ApiParam({ name: 'reservationId', description: 'ID de la reserva', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Detalle de la reserva.', type: ReservationResponseDto })
  @ApiResponse({ status: 404, description: 'Reserva no encontrada.' })
  getReservationById(@Param('reservationId', ParseUUIDPipe) reservationId: string): ReservationResponseDto {
    return this.atraccionesService.getReservationById(reservationId);
  }

  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reemplazar completamente los datos de una atracción' })
  @ApiParam({ name: 'id', description: 'UUID de la atracción', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'La atracción ha sido reemplazada correctamente.' })
  @ApiResponse({ status: 400, description: 'Bad Request. Datos de entrada inválidos.' })
  @ApiResponse({ status: 404, description: 'Not Found. La atracción no existe.' })
  replace(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() createAtraccionDto: CreateAtraccionDto,
  ): void {
    this.atraccionesService.replace(id, createAtraccionDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar parcialmente los datos de una atracción' })
  @ApiParam({ name: 'id', description: 'UUID de la atracción', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'La atracción ha sido actualizada.', type: AtraccionResponseDto })
  @ApiResponse({ status: 400, description: 'Bad Request. Datos de entrada inválidos.' })
  @ApiResponse({ status: 404, description: 'Not Found. La atracción no existe.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateAtraccionDto: UpdateAtraccionDto,
  ): AtraccionResponseDto {
    return this.atraccionesService.update(id, updateAtraccionDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar o desactivar una atracción' })
  @ApiParam({ name: 'id', description: 'UUID de la atracción', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'La atracción ha sido eliminada correctamente.' })
  @ApiResponse({ status: 404, description: 'Not Found. La atracción no existe.' })
  remove(@Param('id', ParseUUIDPipe) id: string): void {
    this.atraccionesService.remove(id);
  }
}
