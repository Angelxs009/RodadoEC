# RodadoEc · Arquitectura de microservicios (Reto 2)

Dominio **Autos** del Booking Prototipo, separado en cuatro microservicios detrás de un API Gateway.
El monolito original sigue en [`../backend`](../backend) hasta validar este sistema.

```
 Frontend (Vercel) ──┐
 Booking central ────┼──► API Gateway ──gRPC──► catalog-service    (autos, agencias, proveedores, disponibilidad)
 Otros subgrafos ────┘   REST /api/v1          booking-service    (hold, preview, órdenes, webhooks, SAGA)
                         GraphQL /graphql        │  ├─gRPC─► catalog-service   (reservar / liberar auto)
                         Swagger /api/docs       │  └─gRPC─► payments-service  (cobrar / consumir / reembolsar)
                                                 payments-service   (pasarela simulada)
                                                 identity-service   (clientes, administradores, JWT)
                              Postgres único · un schema por servicio (catalog, booking, payments, identity)
```

| Pieza | Responsabilidad | gRPC | HTTP local |
|---|---|---|---|
| `apps/gateway` | Entrada única: REST (contrato del profesor), GraphQL federado, JWT/roles, idempotencia, correlation id | — | 3000 |
| `apps/catalog` | Vehículos, agencias, proveedores, constantes; reserva atómica del auto | 50051 | 3101 |
| `apps/booking` | Búsqueda, hold, preview, órdenes, webhooks; **orquesta la saga** | 50052 | 3102 |
| `apps/payments` | Pago simulado (tarjeta 4242… aprobada, 4000…0002 rechazada), reembolsos | 50053 | 3103 |
| `apps/identity` | Registro/login de clientes, login de admin, CRUD de usuarios, emisión y verificación de JWT | 50054 | 3104 |
| `libs/common` | Infra compartida: logger JSON, correlation id, errores ProblemDetails sobre gRPC, TTL cache, JWT, bootstrap | | |

## Cómo se cumple cada punto de la rúbrica

| Criterio | Dónde está |
|---|---|
| Sistema migrado a microservicios | 4 servicios con datos propios (schema por servicio; ninguno lee tablas de otro) |
| Booking consume APIs/eventos | REST `/api/v1` + GraphQL `/graphql` (subgrafo federado) + webhooks firmados con HMAC y reintentos |
| API Gateway funcional | `apps/gateway`: enruta a los servicios, valida JWT, aplica idempotencia, traduce errores |
| Contratos documentados y versionados | [`../contracts`](../contracts): OpenAPI/AsyncAPI 1.1.0, 5 `.proto` v1, GraphQL 1.0.0, `CHANGELOG.md`, `check-compat.js` |
| Pruebas de integración | `test/gateway.integration.ts` (17 pruebas end-to-end contra el gateway real) |
| Seguridad básica | JWT HS256 con secretos separados admin/cliente, guard por rol, tarjetas validadas (Luhn), CORS por lista, HMAC en webhooks |
| Desplegado en Internet | `../render.microservicios.yaml` (Render) + frontend en Vercel |

### Saga de reserva (booking-service)

1. `Pay` → valida el preview y **cobra** en Pagos (queda `APPROVED` o `DECLINED`).
2. `CreateOrder` → (a) **reserva el auto** en Catálogo, operación atómica: si otro lo reservó antes, reembolsa el pago y responde 409;
   (b) **consume** el pago (atómico: un pago solo sirve para una orden); si falla, libera el auto;
   (c) guarda la orden; si falla, libera el auto y reembolsa.
3. `CancelOrder` también compensa: reembolsa (`RefundByOrder`) y libera el auto.

### Observabilidad

Cada petición lleva un `X-Correlation-Id` (se genera si el cliente no lo manda): viaja en metadata gRPC, aparece en
todos los logs JSON de todos los servicios y en los eventos de webhook (`correlationId`). `GET /warmup` consulta a los
cuatro servicios y reporta cuál está arriba.

## Contratos

Ver [`../contracts/CHANGELOG.md`](../contracts/CHANGELOG.md). Regla: agregar = MINOR; quitar/renombrar/cambiar tipo = MAJOR
y se publica un contrato nuevo (`v2`). Para verificarlo:

```bash
npm run check:contracts          # falla si algo se quitó o cambió respecto a contracts/baseline.json
node ../contracts/check-compat.js --update   # tras publicar una versión, regenera la línea base
```

## Ejecutar

**Todo con Docker (recomendado):** desde la raíz del repo

```bash
docker compose up --build        # gateway en http://localhost:3000 · Swagger /api/docs · GraphQL /graphql
```

**Sin Docker** (necesita un Postgres y `DATABASE_URL`):

```bash
npm ci && npm run build
# una terminal por servicio (o con & en bash):
PORT=3104 npm run start:identity ; PORT=3101 npm run start:catalog ; PORT=3103 npm run start:payments
PORT=3102 npm run start:booking  ; PORT=3000 npm run start:gateway
```

**Pruebas de integración** (con el sistema levantado):

```bash
GATEWAY_URL=http://localhost:3000 npm run test:integration
```

## Variables de entorno

| Variable | Dónde | Para qué |
|---|---|---|
| `DATABASE_URL`, `DATABASE_SSL` | catalog, booking, payments, identity | Postgres (cada servicio usa su schema) |
| `CATALOG_GRPC_URL`, `BOOKING_GRPC_URL`, `PAYMENTS_GRPC_URL`, `IDENTITY_GRPC_URL` | gateway (todas), booking (catalog y payments) | Dirección `host:puerto` de cada servicio |
| `GRPC_TLS=true` | quien llama | gRPC sobre TLS (Render termina TLS en `:443`) |
| `GRPC_ON_PORT=true` | servicios | gRPC escucha en `$PORT` y no se abre HTTP (Render: un solo puerto) |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | identity | Credenciales del administrador |
| `ADMIN_JWT_SECRET`, `CUSTOMER_JWT_SECRET` | gateway **e** identity (iguales) | Firma/verificación de JWT |
| `AUTH_ENFORCE_ADMIN`, `AUTH_ENFORCE_CUSTOMER` | gateway | `true` exige JWT de ese rol en `/admin/**` y `/auth/me`, `/me/**` |
| `CORS_ORIGINS` | gateway | Orígenes permitidos separados por coma |

> **Seguridad vs. Swagger sin candados.** Por decisión del equipo, `AUTH_ENFORCE_*` está en `false` para poder probar la API
> sin tokens. La protección está implementada y se activa **sin cambiar código**; para la defensa/entrega final ponerlas en `true`
> (Swagger mostrará entonces el candado).

## Despliegue en Render (plan gratis) — puntos a vigilar

1. Crear un **Blueprint** apuntando a `render.microservicios.yaml` (crea 5 servicios + 1 Postgres). Completar las variables
   `sync: false` (`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `CORS_ORIGINS`).
2. Los servicios gratis **se duermen a los 15 min**: antes de una demo abrir `https://<gateway>/warmup` para despertar toda la cadena.
3. Las horas gratis (750/mes) son **compartidas** por todos los servicios del workspace: cinco servicios encendidos 24/7 no caben.
   Mantener el monolito apagado mientras se usa este sistema, o pasar a un plan de pago para la defensa.
4. El Postgres gratis **expira a los ~30 días** (la base actual vence cerca del 28-oct-2026): hay que recrearla o subir de plan.
5. La comunicación entre servicios usa las URL públicas `*.onrender.com:443` con TLS (el plan gratis no ofrece red privada entre
   servicios web). Si Render rechaza gRPC en algún servicio, la alternativa es el mismo despliegue con `docker compose` en una VM.
