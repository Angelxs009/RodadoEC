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

  // ── Contrato v2 ────────────────────────────────────────────────────────
  @GrpcMethod(S, 'CreateOrderV2')
  createOrderV2(req: any) {
    return this.booking.createOrderV2(req);
  }

  @GrpcMethod(S, 'CancelOrderV2')
  cancelOrderV2(req: any) {
    return this.booking.cancelOrderV2(req);
  }

  @GrpcMethod(S, 'CheckinDigital')
  checkinDigital(req: any) {
    return this.booking.checkinDigital(req);
  }

  @GrpcMethod(S, 'DeliverOrder')
  deliverOrder(req: any) {
    return this.booking.deliverOrder(req);
  }

  @GrpcMethod(S, 'ReturnOrder')
  returnOrder(req: any) {
    return this.booking.returnOrder(req);
  }

  @GrpcMethod(S, 'ReturnVehicle')
  returnVehicle(req: any) {
    return this.booking.returnVehicle(req);
  }

  @GrpcMethod(S, 'RegisterMaintenance')
  registerMaintenance(req: any) {
    return this.booking.registerMaintenance(req);
  }

  @GrpcMethod(S, 'ListEvents')
  listEvents(req: any) {
    return this.webhooks.listEvents(req);
  }

  @GrpcMethod(S, 'GetPromoContract')
  getPromoContract() {
    return this.booking.getPromoContract();
  }

  @GrpcMethod(S, 'SetPromoContract')
  setPromoContract(req: any) {
    return this.booking.setPromoContract(req);
  }

  @GrpcMethod(S, 'SyncInventory')
  syncInventory() {
    return this.booking.syncInventory();
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
