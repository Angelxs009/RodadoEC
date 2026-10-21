import { GrpcMethod } from '@nestjs/microservices';
import { GrpcController } from '@autos/common';
import { PaymentsService } from './payments.service';

const S = 'PaymentsService';

/** Implementación del contrato contracts/proto/autos/payments/v1/payments.proto */
@GrpcController()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @GrpcMethod(S, 'Charge')
  charge(req: any) {
    return this.payments.charge(req);
  }

  @GrpcMethod(S, 'GetPayment')
  getPayment(req: any) {
    return this.payments.getPayment(req);
  }

  @GrpcMethod(S, 'Consume')
  consume(req: any) {
    return this.payments.consume(req);
  }

  @GrpcMethod(S, 'Refund')
  refund(req: any) {
    return this.payments.refund(req);
  }

  @GrpcMethod(S, 'RefundByOrder')
  async refundByOrder(req: any) {
    await this.payments.refundByOrder(req);
    return {};
  }
}
