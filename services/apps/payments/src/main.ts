import { bootstrapService } from '@autos/common';
import { PaymentsModule } from './payments.module';

bootstrapService({
  name: 'payments-service',
  module: PaymentsModule,
  grpcPackage: 'autos.payments.v1',
  protoFile: 'autos/payments/v1/payments.proto',
  defaultHttpPort: 3103,
  defaultGrpcPort: 50053,
  schema: 'payments',
});
