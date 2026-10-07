import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutosService } from './autos.service';
import { AutosController } from './autos.controller';
import { CommonModule } from '../../common/common.module';
import { CustomersModule } from '../customers/customers.module';
import { TtlCacheService } from './cache/ttl-cache.service';
import { Depot } from './entities/depot.entity';
import { Payment } from './entities/payment.entity';
import { PaymentsService } from './payments.service';
import { Order } from './entities/order.entity';
import { Supplier } from './entities/supplier.entity';
import { Vehicle } from './entities/vehicle.entity';
import { WebhookSubscription } from './entities/webhook-subscription.entity';
import { AutosSeedService } from './seed/autos-seed.service';
import { WebhooksDispatcherService } from './webhooks/webhooks-dispatcher.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, WebhookSubscription, Vehicle, Depot, Supplier, Payment]),
    CommonModule,
    CustomersModule, // CustomerTokenService: liga la orden al cliente logueado, si lo hay
  ],
  controllers: [AutosController],
  providers: [AutosService, PaymentsService, TtlCacheService, AutosSeedService, WebhooksDispatcherService],
})
export class AutosModule {}
