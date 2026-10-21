import { bootstrapService } from '@autos/common';
import { CatalogModule } from './catalog.module';

bootstrapService({
  name: 'catalog-service',
  module: CatalogModule,
  grpcPackage: 'autos.catalog.v1',
  protoFile: 'autos/catalog/v1/catalog.proto',
  defaultHttpPort: 3101,
  defaultGrpcPort: 50051,
  schema: 'catalog',
});
