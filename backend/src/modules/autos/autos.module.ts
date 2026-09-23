import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutosService } from './autos.service';
import { AutosController } from './autos.controller';
import { CommonModule } from '../../common/common.module';
import { TtlCacheService } from './cache/ttl-cache.service';
import { Depot } from './entities/depot.entity';
import { Order } from './entities/order.entity';
import { Supplier } from './entities/supplier.entity';
import { Vehicle } from './entities/vehicle.entity';
import { WebhookSubscription } from './entities/webhook-subscription.entity';
import { AutosSeedService } from './seed/autos-seed.service';
import { WebhooksDispatcherService } from './webhooks/webhooks-dispatcher.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, WebhookSubscription, Vehicle, Depot, Supplier]),
    CommonModule,
  ],
  controllers: [AutosController],
  providers: [AutosService, TtlCacheService, AutosSeedService, WebhooksDispatcherService],
})
export class AutosModule {}
