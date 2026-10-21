import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseModule, healthModuleFor } from '@autos/common';
import { Payment } from './entities/payment.entity';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [databaseModule('payments', [Payment]), TypeOrmModule.forFeature([Payment]), healthModuleFor('payments-service')],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
