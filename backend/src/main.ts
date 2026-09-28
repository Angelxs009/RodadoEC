import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';
import { WebhookPayloadDto } from './modules/autos/dto/webhook.dto';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const allowedOrigins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim());
  app.enableCors({ origin: allowedOrigins && allowedOrigins.length > 0 ? allowedOrigins : true });
  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new ProblemDetailsFilter());

  const config = new DocumentBuilder()
    .setTitle('Booking Prototipo API')
    .setDescription('API base para los dominios de Alojamientos, Autos, Atracciones y Vuelos.')
    .setVersion('1.0')
    .addBearerAuth() // usado por el login del backoffice de Admin (POST /admin/auth/login)
    .build();
  
  // extraModels: registra WebhookPayloadDto en components.schemas aunque no
  // aparezca en ningún @Body()/@ApiResponse() de un endpoint (solo lo usa el
  // callback inyectado abajo).
  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [WebhookPayloadDto],
  });

  // @nestjs/swagger no tiene decorador para 'callbacks' de OpenAPI (documenta
  // el POST que el servidor le hará a la URL del webhook cuando ocurra un evento).
  // Se inyecta manualmente para que Swagger sea fiel al contrato (autos-openapi.yaml).
  const webhooksPost = document.paths['/api/v1/webhooks']?.post;
  if (webhooksPost) {
    webhooksPost.callbacks = {
      carEvent: {
        '{$request.body#/url}': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/WebhookPayloadDto' },
                },
              },
            },
            responses: {
              '200': { description: 'Evento recibido exitosamente' },
            },
          },
        },
      },
    };
  }

  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
