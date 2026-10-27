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

  // Alias de rutas del contrato v2/v3 (todas apuntan a la misma implementación):
  //   /api/v3/autos/*  →  /api/v2/autos/*        (ruta base canónica del contrato v3)
  //   /autos/*         →  /api/v2/autos/*        (Booking monta {baseUrlRest}/autos/health sin prefijo)
  //   /reservas[/…]    →  /api/v2/autos/reservas (la Guía §4 describe POST /reservas)
  // El error ProblemDetails conserva la URL original en `instance` (p. ej. "/reservas").
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const u = req.url;
    if (u.startsWith('/api/v3/')) req.url = '/api/v2/' + u.slice('/api/v3/'.length);
    else if (u === '/autos' || u.startsWith('/autos/') || u.startsWith('/autos?')) req.url = '/api/v2' + u;
    else if (u === '/reservas' || u.startsWith('/reservas/') || u.startsWith('/reservas?')) req.url = '/api/v2/autos' + u;
    next();
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
      logger.event('info', `${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Date.now() - started}ms`, 'http', {
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        duration_ms: Date.now() - started,
        idempotency_key: req.headers['idempotency-key'],
      });
    });
    runWithCorrelation(cid, () => next());
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new ProblemDetailsFilter());

  const config = new DocumentBuilder()
    .setTitle('GDS Autos Core API')
    .setDescription(
      'API Gateway del dominio Autos del Booking Prototipo. Fachada REST (contrato v1 en /api/v1; contrato oficial v3 en /api/v3, documentado en /api/docs-v3) sobre los microservicios ' +
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
  for (const [version, route] of [['v3', 'api/docs-v3'], ['v2', 'api/docs-v2']] as const) {
    const file = join(protoDir(), '..', `autos-openapi-${version}.yaml`);
    if (!existsSync(file)) continue;
    SwaggerModule.setup(route, app, loadYaml(readFileSync(file, 'utf8')) as any, {
      customSiteTitle: `Autos API ${version} · contrato oficial`,
      yamlDocumentUrl: `${route}/openapi.yaml`,
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`api-gateway listo en :${port} · REST /api/v1 · Swagger /api/docs · GraphQL /graphql`, 'bootstrap');
}
bootstrap();
