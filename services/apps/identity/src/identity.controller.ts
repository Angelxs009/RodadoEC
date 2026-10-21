import { GrpcMethod } from '@nestjs/microservices';
import { GrpcController } from '@autos/common';
import { IdentityService } from './identity.service';

const S = 'IdentityService';

/** Implementación del contrato contracts/proto/autos/identity/v1/identity.proto */
@GrpcController()
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @GrpcMethod(S, 'RegisterCustomer')
  registerCustomer(req: any) {
    return this.identity.registerCustomer(req);
  }

  @GrpcMethod(S, 'LoginCustomer')
  loginCustomer(req: any) {
    return this.identity.loginCustomer(req);
  }

  @GrpcMethod(S, 'GetCustomer')
  getCustomer(req: any) {
    return this.identity.getCustomer(req);
  }

  @GrpcMethod(S, 'LoginAdmin')
  loginAdmin(req: any) {
    return this.identity.loginAdmin(req);
  }

  @GrpcMethod(S, 'VerifyToken')
  verifyToken(req: any) {
    return this.identity.verifyToken(req);
  }

  @GrpcMethod(S, 'ListUsers')
  listUsers() {
    return this.identity.listUsers();
  }

  @GrpcMethod(S, 'CreateUser')
  createUser(req: any) {
    return this.identity.createUser(req);
  }

  @GrpcMethod(S, 'DeleteUser')
  async deleteUser(req: any) {
    await this.identity.deleteUser(req);
    return {};
  }
}
