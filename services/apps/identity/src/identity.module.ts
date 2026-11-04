import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseModule, healthModuleFor } from '@autos/common';
import { AdminUser, Client, Customer } from './entities/identity.entities';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { PasswordService } from './password.service';

@Module({
  imports: [
    databaseModule('identity', [AdminUser, Customer, Client]),
    TypeOrmModule.forFeature([AdminUser, Customer, Client]),
    healthModuleFor('identity-service'),
  ],
  controllers: [IdentityController],
  providers: [IdentityService, PasswordService],
})
export class IdentityModule {}
