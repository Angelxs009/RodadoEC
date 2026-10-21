import { bootstrapService } from '@autos/common';
import { IdentityModule } from './identity.module';

bootstrapService({
  name: 'identity-service',
  module: IdentityModule,
  grpcPackage: 'autos.identity.v1',
  protoFile: 'autos/identity/v1/identity.proto',
  defaultHttpPort: 3104,
  defaultGrpcPort: 50054,
  schema: 'identity',
});
