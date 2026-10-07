import {
  Body, Controller, Delete, Get, Header, Headers, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Post, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags,
} from '@nestjs/swagger';
import { IdempotencyKeyGuard } from '../../common/guards/idempotency-key.guard';
import { CustomerTokenService } from '../customers/auth/customer-token.service';
import { AutosService } from './autos.service';
import { CarConstantsRequestDto, CarConstantsResponseDto } from './dto/constants.dto';
import { DepotScoresRequestDto, DepotScoresResponseDto } from './dto/depot-scores.dto';
import { DepotsRequestDto, DepotsResponseDto } from './dto/depots.dto';
import { CarDetailsRequestDto, CarDetailsResponseDto } from './dto/details.dto';
import { OrderCreateRequestDto } from './dto/order-create.dto';
import { OrderDetailDto } from './dto/order-detail.dto';
import { OrderHoldRequestDto, OrderHoldResponseDto } from './dto/order-hold.dto';
import { OrderModifyRequestDto } from './dto/order-modify.dto';
import { PaymentRequestDto, PaymentResponseDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';
import { OrderPreviewRequestDto, OrderPreviewResponseDto } from './dto/order-preview.dto';
import { CarSearchRequestDto, CarSearchResponseDto } from './dto/search.dto';
import { SuppliersRequestDto, SuppliersResponseDto } from './dto/suppliers.dto';
import { WebhookSubscriptionDto } from './dto/webhook.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Controlador BFF de Autos — Alineado 1:1 con autos-openapi.yaml
// ─────────────────────────────────────────────────────────────────────────────

@Controller()
export class AutosController {
  constructor(
    private readonly autosService: AutosService,
    private readonly paymentsService: PaymentsService,
    private readonly customerTokenService: CustomerTokenService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  //  Búsqueda y Catálogo
  // ══════════════════════════════════════════════════════════════════════════

  @Post('search')
  @ApiTags('Búsqueda y Catálogo')
  @ApiOperation({ summary: 'Búsqueda de renta de vehículos' })
  @ApiHeader({ name: 'X-Affiliate-Id', required: true })
  @ApiResponse({ status: 200, description: 'Vehículos encontrados', type: CarSearchResponseDto })
  @ApiResponse({ status: 400, description: 'Petición inválida' })
  @ApiResponse({ status: 429, description: 'Demasiadas peticiones' })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  search(
    @Headers('X-Affiliate-Id') affiliateId: string,
    @Body() searchRequest: CarSearchRequestDto,
  ): Promise<CarSearchResponseDto> {
    return this.autosService.search(searchRequest);
  }

  @Post('details')
  @ApiTags('Búsqueda y Catálogo')
  @ApiOperation({ summary: 'Obtener especificaciones y características de los vehículos' })
  @ApiHeader({ name: 'X-Affiliate-Id', required: true })
  @ApiResponse({ status: 200, description: 'Detalles de los vehículos solicitados', type: CarDetailsResponseDto })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  getDetails(
    @Headers('X-Affiliate-Id') affiliateId: string,
    @Body() detailsRequest: CarDetailsRequestDto,
  ): Promise<CarDetailsResponseDto> {
    return this.autosService.getDetails(detailsRequest);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Información de Agencias y Proveedores
  // ══════════════════════════════════════════════════════════════════════════

  @Post('depots')
  @ApiTags('Información de Agencias y Proveedores')
  @ApiOperation({ summary: 'Consultar lista de agencias de renta (puntos de recogida y entrega)' })
  @ApiHeader({ name: 'X-Affiliate-Id', required: true })
  @ApiResponse({ status: 200, description: 'Lista de agencias (depots)', type: DepotsResponseDto })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'public, max-age=3600')
  getDepots(
    @Headers('X-Affiliate-Id') affiliateId: string,
    @Body() depotsRequest: DepotsRequestDto,
  ): Promise<DepotsResponseDto> {
    return this.autosService.getDepots(depotsRequest);
  }

  @Post('depots/reviews/scores')
  @ApiTags('Información de Agencias y Proveedores')
  @ApiOperation({ summary: 'Obtener puntuaciones y reseñas de las agencias' })
  @ApiHeader({ name: 'X-Affiliate-Id', required: true })
  @ApiResponse({ status: 200, description: 'Puntuaciones desglosadas por agencia', type: DepotScoresResponseDto })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'public, max-age=600')
  getDepotScores(
    @Headers('X-Affiliate-Id') affiliateId: string,
    @Body() scoresRequest: DepotScoresRequestDto,
  ): Promise<DepotScoresResponseDto> {
    return this.autosService.getDepotScores(scoresRequest);
  }

  @Post('suppliers')
  @ApiTags('Información de Agencias y Proveedores')
  @ApiOperation({ summary: 'Listar proveedores de renta de autos' })
  @ApiHeader({ name: 'X-Affiliate-Id', required: true })
  @ApiResponse({ status: 200, description: 'Lista de proveedores de renta de autos', type: SuppliersResponseDto })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'public, max-age=3600')
  getSuppliers(
    @Headers('X-Affiliate-Id') affiliateId: string,
    @Body() suppliersRequest: SuppliersRequestDto,
  ): Promise<SuppliersResponseDto> {
    return this.autosService.getSuppliers(suppliersRequest);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Componentes Comunes
  // ══════════════════════════════════════════════════════════════════════════

  @Post('constants')
  @ApiTags('Componentes Comunes')
  @ApiOperation({ summary: 'Consultar constantes del sistema (políticas, seguros, servicios extra)' })
  @ApiHeader({ name: 'X-Affiliate-Id', required: true })
  @ApiResponse({ status: 200, description: 'Constantes del sistema', type: CarConstantsResponseDto })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'public, max-age=86400')
  getConstants(
    @Headers('X-Affiliate-Id') affiliateId: string,
    @Body() constantsRequest: CarConstantsRequestDto,
  ): CarConstantsResponseDto {
    return this.autosService.getConstants(constantsRequest);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Gestión de Órdenes (Reservas)
  // ══════════════════════════════════════════════════════════════════════════

  @Post('orders/hold')
  @ApiTags('Gestión de Órdenes (Reservas)')
  @ApiOperation({ summary: 'Bloquear temporalmente el vehículo y precio (Hold)' })
  @ApiResponse({ status: 200, description: 'Vehículo bloqueado exitosamente', type: OrderHoldResponseDto })
  @ApiResponse({ status: 400, description: 'Petición inválida' })
  @ApiResponse({ status: 409, description: 'Conflicto (auto no disponible)' })
  @HttpCode(HttpStatus.OK)
  holdOrder(@Body() holdRequest: OrderHoldRequestDto): Promise<OrderHoldResponseDto> {
    return this.autosService.holdOrder(holdRequest);
  }

  @Post('orders/preview')
  @ApiTags('Gestión de Órdenes (Reservas)')
  @ApiOperation({ summary: 'Previsualizar la orden de renta antes de confirmar' })
  @ApiResponse({ status: 200, description: 'Detalles de la orden previsualizada y precios finales', type: OrderPreviewResponseDto })
  @HttpCode(HttpStatus.OK)
  previewOrder(@Body() previewRequest: OrderPreviewRequestDto): Promise<OrderPreviewResponseDto> {
    return this.autosService.previewOrder(previewRequest);
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
  @ApiResponse({ status: 409, description: 'Vehículo ya reservado' })
  @HttpCode(HttpStatus.CREATED)
  pay(@Body() paymentRequest: PaymentRequestDto): Promise<PaymentResponseDto> {
    return this.paymentsService.charge(paymentRequest);
  }

  @Post('orders/create')
  @ApiTags('Gestión de Órdenes (Reservas)')
  @ApiOperation({
    summary: 'Crear orden/reserva de renta de vehículo',
    description:
      'Requiere una CUENTA de cliente: la reserva queda ligada a ella. Regístrate con POST /auth/register (o inicia sesión con POST /auth/login), copia el token y pégalo una sola vez en "Authorize". Además exige un pago aprobado (POST /payments).',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 401, description: 'Falta iniciar sesión (cuenta de cliente requerida)' })
  @ApiResponse({ status: 402, description: 'Pago requerido o no aprobado' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID v4 para evitar cobros duplicados' })
  @ApiResponse({ status: 201, description: 'Orden creada exitosamente', type: OrderDetailDto })
  @ApiResponse({ status: 400, description: 'Petición inválida' })
  @ApiResponse({ status: 409, description: 'Conflicto (auto no disponible)' })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(IdempotencyKeyGuard)
  createOrder(
    @Headers('Idempotency-Key') idempotencyKey: string,
    @Headers('Authorization') authHeader: string | undefined,
    @Body() createRequest: OrderCreateRequestDto,
  ): Promise<OrderDetailDto> {
    // Regla de negocio: no se reserva sin cuenta. El token de cliente (JWT) llega
    // en Authorization y la orden queda ligada a ese cliente.
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const customerId = this.customerTokenService.verify(token);
    if (!customerId) {
      throw new UnauthorizedException(
        'Debes iniciar sesión con una cuenta de cliente para reservar (POST /auth/register o /auth/login).',
      );
    }
    return this.autosService.createOrder(createRequest, customerId);
  }

  @Get('orders/:orderId')
  @ApiTags('Gestión de Órdenes (Reservas)')
  @ApiOperation({ summary: 'Obtener detalles de la orden' })
  @ApiParam({ name: 'orderId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Detalles completos de la orden', type: OrderDetailDto })
  @ApiResponse({ status: 404, description: 'Orden no encontrada' })
  getOrder(@Param('orderId', ParseUUIDPipe) orderId: string): Promise<OrderDetailDto> {
    return this.autosService.getOrder(orderId);
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
  modifyOrder(
    @Headers('Idempotency-Key') idempotencyKey: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() modifyRequest: OrderModifyRequestDto,
  ): Promise<OrderDetailDto> {
    return this.autosService.modifyOrder(orderId, modifyRequest);
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
  async cancelOrder(
    @Headers('Idempotency-Key') idempotencyKey: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<void> {
    await this.autosService.cancelOrder(orderId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Webhooks
  // ══════════════════════════════════════════════════════════════════════════

  @Get('webhooks')
  @ApiTags('Webhooks')
  @ApiOperation({ summary: 'Listar suscripciones a eventos' })
  @ApiResponse({ status: 200, description: 'Suscripciones activas' })
  listWebhooks() {
    return this.autosService.listWebhooks();
  }

  @Post('webhooks')
  @ApiTags('Webhooks')
  @ApiOperation({ summary: 'Registrar un nuevo webhook' })
  @ApiResponse({ status: 201, description: 'Webhook registrado' })
  @HttpCode(HttpStatus.CREATED)
  createWebhook(@Body() webhookSubscription: WebhookSubscriptionDto) {
    return this.autosService.createWebhook(webhookSubscription);
  }

  @Delete('webhooks/:id')
  @ApiTags('Webhooks')
  @ApiOperation({ summary: 'Eliminar suscripción de webhook' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Suscripción eliminada' })
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteWebhook(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.autosService.deleteWebhook(id);
  }
}
