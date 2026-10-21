import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { ensureSchema } from './database';
import { grpcServerOptions } from './grpc';
import { StructuredLogger } from './logger';

export const SERVICE_VERSION = '1.1.0';

export function healthModuleFor(service: string) {
  @Controller()
  class HealthController {
    @Get('health')
    health() {
      return { status: 'ok', service, version: SERVICE_VERSION, uptime_s: Math.round(process.uptime()) };
    }
  }
  @Module({ controllers: [HealthController] })
  class HealthModule {}
  return HealthModule;
}

interface ServiceOptions {
  name: string;
  module: any;
  grpcPackage: string;
  protoFile: string;
  defaultHttpPort: number;
  defaultGrpcPort: number;
  /** schema de Postgres del servicio (se crea si no existe) */
  schema?: string;
}

/**
 * Arranque común de un microservicio: servidor gRPC (contrato .proto) + un puerto HTTP mínimo con /health
 * (lo usan Render, docker-compose y los monitores de disponibilidad).
 */
export async function bootstrapService(o: ServiceOptions): Promise<void> {
  const logger = new StructuredLogger(o.name);
  if (o.schema) await ensureSchema(o.schema);

  const app = await NestFactory.create(o.module, { logger });
  // GRPC_ON_PORT=true (Render): la plataforma expone un único puerto por servicio y termina TLS en su borde,
  // así que el servidor gRPC escucha directamente en $PORT y no se levanta el HTTP de /health.
  const grpcOnPort = /^(1|true)$/i.test(process.env.GRPC_ON_PORT ?? '') && !!process.env.PORT;
  const grpcPort = grpcOnPort ? process.env.PORT! : (process.env.GRPC_PORT ?? o.defaultGrpcPort);
  app.connectMicroservice<MicroserviceOptions>(grpcServerOptions(o.grpcPackage, o.protoFile, grpcPort), {
    inheritAppConfig: true,
  });
  await app.startAllMicroservices();

  if (grpcOnPort) {
    await app.init();
    logger.log(`${o.name} listo: gRPC :${grpcPort} (modo puerto único)`, 'bootstrap');
    return;
  }

  const httpPort = Number(process.env.PORT ?? o.defaultHttpPort);
  await app.listen(httpPort, '0.0.0.0');
  logger.log(`${o.name} listo: gRPC :${grpcPort} · HTTP /health :${httpPort}`, 'bootstrap');
}
