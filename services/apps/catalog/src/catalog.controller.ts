import { GrpcMethod } from '@nestjs/microservices';
import { GrpcController } from '@autos/common';
import { CatalogService } from './catalog.service';

const S = 'CatalogService';

/** Implementación del contrato contracts/proto/autos/catalog/v1/catalog.proto */
@GrpcController()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @GrpcMethod(S, 'Search')
  search(req: any) {
    return this.catalog.search(req);
  }

  @GrpcMethod(S, 'GetVehicles')
  getVehicles(req: any) {
    return this.catalog.getVehicles(req);
  }

  @GrpcMethod(S, 'ListDepots')
  listDepots() {
    return this.catalog.listDepots();
  }

  @GrpcMethod(S, 'ListSuppliers')
  listSuppliers(req: any) {
    return this.catalog.listSuppliers(req);
  }

  @GrpcMethod(S, 'GetConstants')
  getConstants(req: any) {
    return this.catalog.getConstants(req);
  }

  @GrpcMethod(S, 'ReserveVehicle')
  reserveVehicle(req: any) {
    return this.catalog.reserveVehicle(req);
  }

  @GrpcMethod(S, 'ReleaseVehicle')
  async releaseVehicle(req: any) {
    await this.catalog.releaseVehicle(req);
    return {};
  }

  @GrpcMethod(S, 'AdminListVehicles')
  adminListVehicles() {
    return this.catalog.adminListVehicles();
  }

  @GrpcMethod(S, 'AdminCreateVehicle')
  adminCreateVehicle(req: any) {
    return this.catalog.adminCreateVehicle(req);
  }

  @GrpcMethod(S, 'AdminUpdateVehicle')
  adminUpdateVehicle(req: any) {
    return this.catalog.adminUpdateVehicle(req);
  }

  @GrpcMethod(S, 'AdminSetVehicleStatus')
  adminSetVehicleStatus(req: any) {
    return this.catalog.adminSetVehicleStatus(req);
  }

  @GrpcMethod(S, 'AdminDeleteVehicle')
  async adminDeleteVehicle(req: any) {
    await this.catalog.adminDeleteVehicle(req);
    return {};
  }

  @GrpcMethod(S, 'AdminListDepots')
  adminListDepots() {
    return this.catalog.adminListDepots();
  }

  @GrpcMethod(S, 'AdminCreateDepot')
  adminCreateDepot(req: any) {
    return this.catalog.adminCreateDepot(req);
  }

  @GrpcMethod(S, 'AdminUpdateDepot')
  adminUpdateDepot(req: any) {
    return this.catalog.adminUpdateDepot(req);
  }

  @GrpcMethod(S, 'AdminDeleteDepot')
  async adminDeleteDepot(req: any) {
    await this.catalog.adminDeleteDepot(req);
    return {};
  }
}
