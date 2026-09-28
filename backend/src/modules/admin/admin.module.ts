import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Depot } from '../autos/entities/depot.entity';
import { Order } from '../autos/entities/order.entity';
import { Vehicle } from '../autos/entities/vehicle.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthGuard } from './auth/admin-auth.guard';
import { AdminTokenService } from './auth/admin-token.service';

@Module({
  imports: [TypeOrmModule.forFeature([Vehicle, Depot, Order])],
  controllers: [AdminController, AdminAuthController],
  providers: [AdminService, AdminTokenService, AdminAuthGuard],
})
export class AdminModule {}
