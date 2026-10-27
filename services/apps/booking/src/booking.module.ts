import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseModule, grpcClientOptions, healthModuleFor, TtlCache } from '@autos/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { Order, OutboxEvent, PromoContract, WebhookDelivery, WebhookSubscription } from './entities/booking.entities';
import { InventoryClient } from './inventory.client';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [
    databaseModule('booking', [Order, WebhookSubscription, WebhookDelivery, OutboxEvent, PromoContract]),
    TypeOrmModule.forFeature([Order, WebhookSubscription, WebhookDelivery, OutboxEvent, PromoContract]),
    // Clientes gRPC hacia los otros microservicios (direcciones por variable de entorno).
    ClientsModule.register([
      {
        name: 'CATALOG_CLIENT',
        ...grpcClientOptions('autos.catalog.v1', 'autos/catalog/v1/catalog.proto', process.env.CATALOG_GRPC_URL ?? '127.0.0.1:50051'),
      },
      {
        name: 'PAYMENTS_CLIENT',
        ...grpcClientOptions('autos.payments.v1', 'autos/payments/v1/payments.proto', process.env.PAYMENTS_GRPC_URL ?? '127.0.0.1:50053'),
      },
    ]),
    healthModuleFor('booking-service'),
  ],
  controllers: [BookingController],
  providers: [BookingService, WebhooksService, InventoryClient, TtlCache],
})
export class BookingModule {}
