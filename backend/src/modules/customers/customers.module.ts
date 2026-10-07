import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../autos/entities/order.entity';
import { CustomerAuthGuard } from './auth/customer-auth.guard';
import { CustomerTokenService } from './auth/customer-token.service';
import { PasswordService } from './auth/password.service';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { Customer } from './entities/customer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, Order])],
  controllers: [CustomersController],
  providers: [CustomersService, PasswordService, CustomerTokenService, CustomerAuthGuard],
  exports: [CustomerTokenService], // AutosModule lo usa para ligar órdenes al cliente logueado
})
export class CustomersModule {}
