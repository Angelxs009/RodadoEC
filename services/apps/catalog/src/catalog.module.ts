import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseModule, healthModuleFor } from '@autos/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { Depot, Supplier, Vehicle } from './entities/catalog.entities';

@Module({
  imports: [
    databaseModule('catalog', [Vehicle, Depot, Supplier]),
    TypeOrmModule.forFeature([Vehicle, Depot, Supplier]),
    healthModuleFor('catalog-service'),
  ],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
