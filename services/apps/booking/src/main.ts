import { bootstrapService } from '@autos/common';
import { BookingModule } from './booking.module';

bootstrapService({
  name: 'booking-service',
  module: BookingModule,
  grpcPackage: 'autos.booking.v1',
  protoFile: 'autos/booking/v1/booking.proto',
  defaultHttpPort: 3102,
  defaultGrpcPort: 50052,
  schema: 'booking',
});
