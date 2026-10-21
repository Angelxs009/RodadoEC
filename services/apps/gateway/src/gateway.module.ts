import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApolloFederationDriver, ApolloFederationDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { join } from 'path';
import { protoDir } from '@autos/common';
import { BackendsModule } from './backends';
import { AuthGuard } from './common/auth';
import { GRAPHQL_PROVIDERS } from './graphql/autos.resolvers';
import { AccountsController } from './rest/accounts.controller';
import { AdminController } from './rest/admin.controller';
import { AutosController } from './rest/autos.controller';
import { HealthController } from './rest/health.controller';

/** Subgrafo federado: el esquema es el contrato versionado de contracts/graphql/autos.graphql (schema-first). */
const graphqlSchema = join(protoDir(), '..', 'graphql', 'autos.graphql').replace(/\\/g, '/');

@Module({
  imports: [
    BackendsModule,
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      typePaths: [graphqlSchema],
      path: '/graphql',
      introspection: true,
    }),
  ],
  controllers: [AutosController, AccountsController, AdminController, HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }, ...GRAPHQL_PROVIDERS],
})
export class GatewayModule {}
