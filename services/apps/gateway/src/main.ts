import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { load as loadYaml } from 'js-yaml';
import { join } from 'path';
import { NextFunction, Request, Response } from 'express';
import { CORRELATION_HEADER, protoDir, runWithCorrelation, SERVICE_VERSION, StructuredLogger } from '@autos/common';
import { enforceAdmin } from './common/auth';
import { ProblemDetailsFilter } from './common/problem-details.filter';
import { WebhookPayloadDto } from './dto/autos/webhook.dto';
import { GatewayModule } from './gateway.module';

async function bootstrap() {
  const logger = new StructuredLogger('api-gateway');
  const app = await NestFactory.create(GatewayModule, { logger });

  const allowedOrigins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({
    origin: allowedOrigins && allowedOrigins.length > 0 ? allowedOrigins : true,
    exposedHeaders: [CORRELATION_HEADER, 'Idempotent-Replayed'],
  });

  // /api/v1 (contrato original) y /api/v2 (contrato del agregador) cuelgan de /api; /graphql, /health y /warmup quedan en la raíz.
  app.setGlobalPrefix('api', { exclude: ['graphql', 'health', 'health/deep', 'warmup'] });

  // Correlation ID: se acepta el que envía el cliente o se genera uno; viaja a los microservicios (metadata
  // gRPC) y a los eventos, y se devuelve en la respuesta. Además se registra cada petición en JSON.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const cid = (req.headers[CORRELATION_HEADER] as string | undefined)?.slice(0, 64) || randomUUID();
    res.setHeader(CORRELATION_HEADER, cid);
    const started = Date.now();
    res.on('finish', () => {
      if (req.path === '/health') return;
      logger.log(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Date.now() - started}ms`, 'http');
    });
    runWithCorrelation(cid, () => next());
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new ProblemDetailsFilter());

  const config = new DocumentBuilder()
    .setTitle('GDS Autos Core API')
    .setDescription(
      'API Gateway del dominio Autos del Booking Prototipo. Fachada REST (contrato v1 en /api/v1; contrato oficial v2 en /api/v2, documentado en /api/docs-v2) sobre los microservicios ' +
        'Catálogo, Reservas, Pagos e Identidad (gRPC). También publica GraphQL federado en /graphql. ' +
        (enforceAdmin() ? 'Las rutas /admin exigen un JWT de ADMIN (POST /admin/auth/login).' : ''),
    )
    .setVersion(SERVICE_VERSION)
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config, { extraModels: [WebhookPayloadDto] });

  // @nestjs/swagger no tiene decorador para 'callbacks' de OpenAPI: se inyecta para documentar el POST que el
  // servidor hace a la URL del webhook (fiel a autos-openapi.yaml).
  const webhooksPost = document.paths['/api/v1/webhooks']?.post;
  if (webhooksPost) {
    webhooksPost.callbacks = {
      carEvent: {
        '{$request.body#/url}': {
          post: {
            requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/WebhookPayloadDto' } } } },
            responses: { '200': { description: 'Evento recibido exitosamente' } },
          },
        },
      },
    };
  }
  SwaggerModule.setup('api/docs', app, document, { swaggerOptions: { persistAuthorization: true } });

  // Contrato v2 del agregador: se publica el archivo tal cual (única fuente de verdad), sin regenerarlo desde el código.
  const v2File = join(protoDir(), '..', 'autos-openapi-v2.yaml');
  if (existsSync(v2File)) {
    SwaggerModule.setup('api/docs-v2', app, loadYaml(readFileSync(v2File, 'utf8')) as any, {
      customSiteTitle: 'Autos API v2 · contrato oficial',
      yamlDocumentUrl: 'api/docs-v2/openapi.yaml',
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`api-gateway listo en :${port} · REST /api/v1 · Swagger /api/docs · GraphQL /graphql`, 'bootstrap');
}
bootstrap();
