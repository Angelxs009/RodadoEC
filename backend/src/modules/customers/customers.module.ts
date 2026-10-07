import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../autos/entities/order.entity';
import { CustomerAuthGuard } from './auth/customer-auth.guard';
import { CustomerTokenService } from './auth/customer-token.service';
import { PasswordService } from './auth/password.service';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { Customer } from './entities/customer.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, Order]),
    // JwtModule local a este módulo: su secreto (CUSTOMER_JWT_SECRET) nunca se
    // mezcla con el de AdminModule, aunque ambos usen @nestjs/jwt.
    JwtModule.register({
      secret: process.env.CUSTOMER_JWT_SECRET || 'dev-only-insecure-secret-rodadoec-customers',
    }),
  ],
  controllers: [CustomersController],
  providers: [CustomersService, PasswordService, CustomerTokenService, CustomerAuthGuard],
  exports: [CustomerTokenService], // AutosModule lo usa para ligar órdenes al cliente logueado
})
export class CustomersModule {}
