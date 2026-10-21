import { Inject, Injectable, Module } from '@nestjs/common';
import { ClientGrpc, ClientsModule } from '@nestjs/microservices';
import { GrpcCaller, grpcClientOptions } from '@autos/common';

/** Direcciones de los microservicios (variables de entorno; por defecto, desarrollo local). */
const urls = {
  catalog: () => process.env.CATALOG_GRPC_URL ?? '127.0.0.1:50051',
  booking: () => process.env.BOOKING_GRPC_URL ?? '127.0.0.1:50052',
  payments: () => process.env.PAYMENTS_GRPC_URL ?? '127.0.0.1:50053',
  identity: () => process.env.IDENTITY_GRPC_URL ?? '127.0.0.1:50054',
};

/** Acceso tipado a los cuatro microservicios por gRPC (con correlation id y errores ProblemDetails). */
@Injectable()
export class Backends {
  readonly catalog: GrpcCaller;
  readonly booking: GrpcCaller;
  readonly payments: GrpcCaller;
  readonly identity: GrpcCaller;

  constructor(
    @Inject('CATALOG_CLIENT') catalog: ClientGrpc,
    @Inject('BOOKING_CLIENT') booking: ClientGrpc,
    @Inject('PAYMENTS_CLIENT') payments: ClientGrpc,
    @Inject('IDENTITY_CLIENT') identity: ClientGrpc,
  ) {
    this.catalog = new GrpcCaller(catalog, 'CatalogService');
    this.booking = new GrpcCaller(booking, 'BookingService');
    this.payments = new GrpcCaller(payments, 'PaymentsService');
    this.identity = new GrpcCaller(identity, 'IdentityService');
  }
}

@Module({
  imports: [
    ClientsModule.register([
      { name: 'CATALOG_CLIENT', ...grpcClientOptions('autos.catalog.v1', 'autos/catalog/v1/catalog.proto', urls.catalog()) },
      { name: 'BOOKING_CLIENT', ...grpcClientOptions('autos.booking.v1', 'autos/booking/v1/booking.proto', urls.booking()) },
      { name: 'PAYMENTS_CLIENT', ...grpcClientOptions('autos.payments.v1', 'autos/payments/v1/payments.proto', urls.payments()) },
      { name: 'IDENTITY_CLIENT', ...grpcClientOptions('autos.identity.v1', 'autos/identity/v1/identity.proto', urls.identity()) },
    ]),
  ],
  providers: [Backends],
  exports: [Backends],
})
export class BackendsModule {}
