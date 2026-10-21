import {
  Body, Controller, Delete, Get, Header, Headers, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { Backends } from '../backends';
import { IdempotencyInterceptor, IdempotencyKeyGuard } from '../common/idempotency';
import { orderToDetail, vehicleToDetails, webhookToRest } from '../common/mappers';
import { CarConstantsRequestDto, CarConstantsResponseDto } from '../dto/autos/constants.dto';
import { DepotScoresRequestDto, DepotScoresResponseDto } from '../dto/autos/depot-scores.dto';
import { DepotsRequestDto, DepotsResponseDto } from '../dto/autos/depots.dto';
import { CarDetailsRequestDto, CarDetailsResponseDto } from '../dto/autos/details.dto';
import { OrderCreateRequestDto } from '../dto/autos/order-create.dto';
import { OrderDetailDto } from '../dto/autos/order-detail.dto';
import { OrderHoldRequestDto, OrderHoldResponseDto } from '../dto/autos/order-hold.dto';
import { OrderModifyRequestDto } from '../dto/autos/order-modify.dto';
import { OrderPreviewRequestDto, OrderPreviewResponseDto } from '../dto/autos/order-preview.dto';
import { PaymentRequestDto, PaymentResponseDto } from '../dto/autos/payment.dto';
import { CarSearchRequestDto, CarSearchResponseDto } from '../dto/autos/search.dto';
import { SuppliersRequestDto, SuppliersResponseDto } from '../dto/autos/suppliers.dto';
import { WebhookSubscriptionDto } from '../dto/autos/webhook.dto';

/**
 * Contrato REST público de Autos (autos-openapi.yaml, ruta /api/v1). Es una fachada: valida la petición y
 * la reparte por gRPC a Catálogo (autos, agencias, proveedores) o Reservas (búsqueda, órdenes, pagos, webhooks).
 */
@Controller()
export class AutosController {
  constructor(private readonly backends: Backends) {}

  // ══ Búsqueda y Catálogo ═══════════════════════════════════════════════════
  @Post('search')
  @ApiTags('Búsqueda y Catálogo')
  @ApiOperation({ summary: 'Búsqueda de renta de vehículos' })
  @ApiHeader({ name: 'X-Affiliate-Id', required: true })
  @ApiResponse({ status: 200, description: 'Vehículos encontrados', type: CarSearchResponseDto })
  @ApiResponse({ status: 400, description: 'Petición inválida' })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async search(@Headers('X-Affiliate-Id') _affiliateId: string, @Body() dto: CarSearchRequestDto): Promise<CarSearchResponseDto> {
    const r = await this.backends.booking.call<any>('Search', {
      booker_country: dto.booker.country,
      currency: dto.currency,
      driver: dto.driver,
      route: dto.route,
      filters: dto.filters ?? {},
      maximum_results: dto.maximum_results ?? 100,
    });
    return {
      request_id: r.request_id,
      data: r.data,
      metadata: { total_results: r.total_results, next_page: null },
      search_token: r.search_token,
    };
  }

  @Post('details')
  @ApiTags('Búsqueda y Catálogo')
  @ApiOperation({ summary: 'Obtener especificaciones y características de los vehículos' })
  @ApiHeader({ name: 'X-Affiliate-Id', required: true })
  @ApiResponse({ status: 200, description: 'Detalles de los vehículos solicitados', type: CarDetailsResponseDto })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async details(@Headers('X-Affiliate-Id') _a: string, @Body() _dto: CarDetailsRequestDto): Promise<CarDetailsResponseDto> {
    const r = await this.backends.catalog.call<any>('GetVehicles', {});
    return { request_id: randomUUID(), data: r.vehicles.map(vehicleToDetails) };
  }

  // ══ Agencias y Proveedores ════════════════════════════════════════════════
  @Post('depots')
  @ApiTags('Información de Agencias y Proveedores')
  @ApiOperation({ summary: 'Consultar lista de agencias de renta (puntos de recogida y entrega)' })
  @ApiHeader({ name: 'X-Affiliate-Id', required: true })
  @ApiResponse({ status: 200, description: 'Lista de agencias (depots)', type: DepotsResponseDto })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'public, max-age=3600')
  async depots(@Headers('X-Affiliate-Id') _a: string, @Body() _dto: DepotsRequestDto): Promise<DepotsResponseDto> {
    const r = await this.backends.catalog.call<any>('ListDepots', {});
    return {
      request_id: randomUUID(),
      data: r.depots.map((d: any) => ({
        depot_id: d.depot_id,
        name: d.name,
        location: { city_id: d.city_id, ...(d.airport ? { airport: d.airport } : {}) },
      })),
      metadata: { total_results: r.depots.length },
    };
  }

  @Post('depots/reviews/scores')
  @ApiTags('Información de Agencias y Proveedores')
  @ApiOperation({ summary: 'Obtener puntuaciones y reseñas de las agencias' })
  @ApiHeader({ name: 'X-Affiliate-Id', required: true })
  @ApiResponse({ status: 200, description: 'Puntuaciones desglosadas por agencia', type: DepotScoresResponseDto })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'public, max-age=600')
  async depotScores(@Headers('X-Affiliate-Id') _a: string, @Body() _dto: DepotScoresRequestDto): Promise<DepotScoresResponseDto> {
    const r = await this.backends.catalog.call<any>('ListDepots', {});
    return {
      request_id: randomUUID(),
      data: r.depots.map((d: any) => ({ depot_id: d.depot_id, score: d.score })),
      metadata: { total_results: r.depots.length },
    };
  }

  @Post('suppliers')
  @ApiTags('Información de Agencias y Proveedores')
  @ApiOperation({ summary: 'Listar proveedores de renta de autos' })
  @ApiHeader({ name: 'X-Affiliate-Id', required: true })
  @ApiResponse({ status: 200, description: 'Lista de proveedores de renta de autos', type: SuppliersResponseDto })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'public, max-age=3600')
  async suppliers(@Headers('X-Affiliate-Id') _a: string, @Body() dto: SuppliersRequestDto): Promise<SuppliersResponseDto> {
    const r = await this.backends.catalog.call<any>('ListSuppliers', { supplier_ids: dto.suppliers ?? [] });
    return { request_id: randomUUID(), data: r.suppliers };
  }

  // ══ Componentes comunes ═══════════════════════════════════════════════════
  @Post('constants')
  @ApiTags('Componentes Comunes')
  @ApiOperation({ summary: 'Consultar constantes del sistema (políticas, seguros, servicios extra)' })
  @ApiHeader({ name: 'X-Affiliate-Id', required: true })
  @ApiResponse({ status: 200, description: 'Constantes del sistema', type: CarConstantsResponseDto })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'public, max-age=86400')
  async constants(@Headers('X-Affiliate-Id') _a: string, @Body() dto: CarConstantsRequestDto): Promise<CarConstantsResponseDto> {
    const r = await this.backends.catalog.call<any>('GetConstants', { constants: dto.constants ?? [] });
    return { request_id: randomUUID(), data: JSON.parse(r.data_json) };
  }

  // ══ Órdenes (reservas) ════════════════════════════════════════════════════
  @Post('orders/hold')
  @ApiTags('Gestión de Órdenes (Reservas)')
  @ApiOperation({ summary: 'Bloquear temporalmente el vehículo y precio (Hold)' })
  @ApiResponse({ status: 200, description: 'Vehículo bloqueado exitosamente', type: OrderHoldResponseDto })
  @ApiResponse({ status: 409, description: 'Conflicto (auto no disponible o edad no permitida)' })
  @HttpCode(HttpStatus.OK)
  hold(@Body() dto: OrderHoldRequestDto): Promise<OrderHoldResponseDto> {
    return this.backends.booking.call('Hold', { vehicle_id: dto.vehicle_id, search_token: dto.search_token });
  }

  @Post('orders/preview')
  @ApiTags('Gestión de Órdenes (Reservas)')
  @ApiOperation({ summary: 'Previsualizar la orden de renta antes de confirmar' })
  @ApiResponse({ status: 200, description: 'Detalles de la orden previsualizada y precios finales', type: OrderPreviewResponseDto })
  @HttpCode(HttpStatus.OK)
  async preview(@Body() dto: OrderPreviewRequestDto): Promise<OrderPreviewResponseDto> {
    const r = await this.backends.booking.call<any>('Preview', {
      vehicle_id: dto.vehicle_id,
      search_token: dto.search_token,
      hold_id: dto.hold_id ?? '',
      extras: dto.extras ?? [],
    });
    return {
      request_id: r.request_id,
      data: {
        order_preview_id: r.order_preview_id,
        total_price: r.total_price,
        currency: r.currency,
        breakdown: r.breakdown,
      },
    };
  }

  @Post('payments')
  @ApiTags('Pagos (simulado)')
  @ApiOperation({
    summary: 'Procesar un pago simulado (obligatorio antes de crear la orden)',
    description:
      'Simula una pasarela de pago. El monto se toma del order_preview_id. Si queda APPROVED, usa payment_reference en /orders/create. Tarjetas de prueba: 4242424242424242 aprobada; 4000000000000002 rechazada (fondos insuficientes).',
  })
  @ApiResponse({ status: 201, description: 'Pago aprobado', type: PaymentResponseDto })
  @ApiResponse({ status: 402, description: 'Pago rechazado' })
  @ApiResponse({ status: 409, description: 'Vehículo ya reservado o edad no permitida' })
  @HttpCode(HttpStatus.CREATED)
  pay(@Body() dto: PaymentRequestDto): Promise<PaymentResponseDto> {
    return this.backends.booking.call('Pay', { order_preview_id: dto.order_preview_id, card: dto.card });
  }

  @Post('orders/create')
  @ApiTags('Gestión de Órdenes (Reservas)')
  @ApiOperation({
    summary: 'Crear orden/reserva de renta de vehículo',
    description:
      'Opcionalmente, envía un token de cliente válido (POST /auth/register o POST /auth/login) para ligar la reserva a tu cuenta. También se puede reservar sin cuenta. Además exige un pago aprobado (POST /payments).',
  })
  @ApiResponse({ status: 402, description: 'Pago requerido o no aprobado' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID v4: repetir la misma clave devuelve la misma respuesta sin duplicar la reserva' })
  @ApiResponse({ status: 201, description: 'Orden creada exitosamente', type: OrderDetailDto })
  @ApiResponse({ status: 400, description: 'Petición inválida' })
  @ApiResponse({ status: 409, description: 'Conflicto (auto no disponible)' })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(IdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async createOrder(@Req() req: any, @Body() dto: OrderCreateRequestDto): Promise<OrderDetailDto> {
    // Si llega un JWT de cliente, la orden queda ligada a esa cuenta; si no, es reserva de invitado.
    const customerId = req.principal?.role === 'CUSTOMER' ? req.principal.subject : '';
    const o = await this.backends.booking.call('CreateOrder', {
      order_preview_id: dto.order_preview_id,
      payment_reference: dto.payment_reference,
      driver_details: dto.driver_details,
      customer_id: customerId,
    });
    return orderToDetail(o) as unknown as OrderDetailDto;
  }

  @Get('orders/:orderId')
  @ApiTags('Gestión de Órdenes (Reservas)')
  @ApiOperation({ summary: 'Obtener detalles de la orden' })
  @ApiParam({ name: 'orderId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Detalles completos de la orden', type: OrderDetailDto })
  @ApiResponse({ status: 404, description: 'Orden no encontrada' })
  async getOrder(@Param('orderId', ParseUUIDPipe) orderId: string): Promise<OrderDetailDto> {
    return orderToDetail(await this.backends.booking.call('GetOrder', { order_id: orderId })) as unknown as OrderDetailDto;
  }

  @Post('orders/:orderId/modify')
  @ApiTags('Gestión de Órdenes (Reservas)')
  @ApiOperation({ summary: 'Modificar una orden existente' })
  @ApiParam({ name: 'orderId', type: 'string', format: 'uuid' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID v4 para evitar modificaciones duplicadas' })
  @ApiResponse({ status: 200, description: 'Orden modificada', type: OrderDetailDto })
  @ApiResponse({ status: 409, description: 'Conflicto' })
  @HttpCode(HttpStatus.OK)
  @UseGuards(IdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async modifyOrder(@Param('orderId', ParseUUIDPipe) orderId: string, @Body() dto: OrderModifyRequestDto): Promise<OrderDetailDto> {
    const o = await this.backends.booking.call('ModifyOrder', {
      order_id: orderId,
      extras_to_add: dto.extras_to_add ?? [],
      extras_to_remove: dto.extras_to_remove ?? [],
      route: dto.route ?? null,
    });
    return orderToDetail(o) as unknown as OrderDetailDto;
  }

  @Post('orders/:orderId/cancel')
  @ApiTags('Gestión de Órdenes (Reservas)')
  @ApiOperation({ summary: 'Cancelar una orden de renta' })
  @ApiParam({ name: 'orderId', type: 'string', format: 'uuid' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID v4 para evitar cancelaciones duplicadas' })
  @ApiResponse({ status: 200, description: 'Cancelación procesada' })
  @ApiResponse({ status: 409, description: 'Conflicto' })
  @HttpCode(HttpStatus.OK)
  @UseGuards(IdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async cancelOrder(@Param('orderId', ParseUUIDPipe) orderId: string): Promise<void> {
    await this.backends.booking.call('CancelOrder', { order_id: orderId });
  }

  // ══ Webhooks ══════════════════════════════════════════════════════════════
  @Get('webhooks')
  @ApiTags('Webhooks')
  @ApiOperation({ summary: 'Listar suscripciones a eventos' })
  @ApiResponse({ status: 200, description: 'Suscripciones activas' })
  async listWebhooks() {
    return (await this.backends.booking.call<any>('ListWebhooks', {})).webhooks.map(webhookToRest);
  }

  @Post('webhooks')
  @ApiTags('Webhooks')
  @ApiOperation({ summary: 'Registrar un nuevo webhook' })
  @ApiResponse({ status: 201, description: 'Webhook registrado' })
  @HttpCode(HttpStatus.CREATED)
  async createWebhook(@Body() dto: WebhookSubscriptionDto) {
    return webhookToRest(
      await this.backends.booking.call('CreateWebhook', { url: dto.url, events: dto.events, secret: dto.secret ?? '' }),
    );
  }

  @Delete('webhooks/:id')
  @ApiTags('Webhooks')
  @ApiOperation({ summary: 'Eliminar suscripción de webhook' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Suscripción eliminada' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWebhook(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.backends.booking.call('DeleteWebhook', { id });
  }
}
