import { GrpcMethod } from '@nestjs/microservices';
import { GrpcController } from '@autos/common';
import { BookingService } from './booking.service';
import { WebhooksService } from './webhooks.service';

const S = 'BookingService';

/** Implementación del contrato contracts/proto/autos/booking/v1/booking.proto */
@GrpcController()
export class BookingController {
  constructor(
    private readonly booking: BookingService,
    private readonly webhooks: WebhooksService,
  ) {}

  @GrpcMethod(S, 'Search')
  search(req: any) {
    return this.booking.search(req);
  }

  @GrpcMethod(S, 'Hold')
  hold(req: any) {
    return this.booking.hold(req);
  }

  @GrpcMethod(S, 'Preview')
  preview(req: any) {
    return this.booking.preview(req);
  }

  @GrpcMethod(S, 'Pay')
  pay(req: any) {
    return this.booking.pay(req);
  }

  @GrpcMethod(S, 'CreateOrder')
  createOrder(req: any) {
    return this.booking.createOrder(req);
  }

  @GrpcMethod(S, 'GetOrder')
  getOrder(req: any) {
    return this.booking.getOrder(req);
  }

  @GrpcMethod(S, 'ModifyOrder')
  modifyOrder(req: any) {
    return this.booking.modifyOrder(req);
  }

  @GrpcMethod(S, 'CancelOrder')
  async cancelOrder(req: any) {
    await this.booking.cancelOrder(req);
    return {};
  }

  @GrpcMethod(S, 'ListOrders')
  listOrders(req: any) {
    return this.booking.listOrders(req);
  }

  @GrpcMethod(S, 'ListWebhooks')
  listWebhooks() {
    return this.webhooks.list();
  }

  @GrpcMethod(S, 'CreateWebhook')
  createWebhook(req: any) {
    return this.webhooks.create(req);
  }

  @GrpcMethod(S, 'DeleteWebhook')
  async deleteWebhook(req: any) {
    await this.webhooks.remove(req);
    return {};
  }

  @GrpcMethod(S, 'ListWebhookDeliveries')
  listWebhookDeliveries() {
    return this.webhooks.listDeliveries();
  }
}
