import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Depot } from '../autos/entities/depot.entity';
import { Order } from '../autos/entities/order.entity';
import { Vehicle } from '../autos/entities/vehicle.entity';
import { Customer } from '../customers/entities/customer.entity';
import { CustomersModule } from '../customers/customers.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminUser } from './entities/admin-user.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthGuard } from './auth/admin-auth.guard';
import { AdminTokenService } from './auth/admin-token.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vehicle, Depot, Order, AdminUser, Customer]),
    CustomersModule, // PasswordService: mismo hash scrypt para admins y clientes
    // JwtModule local a este módulo: su secreto (ADMIN_JWT_SECRET) nunca se
    // mezcla con el de CustomersModule, aunque ambos usen @nestjs/jwt.
    JwtModule.register({
      secret: process.env.ADMIN_JWT_SECRET || 'dev-only-insecure-secret-rodadoec',
    }),
  ],
  controllers: [AdminController, AdminAuthController, AdminUsersController],
  providers: [AdminService, AdminUsersService, AdminTokenService, AdminAuthGuard],
})
export class AdminModule {}
