# RodadoEc · Arquitectura de microservicios (Reto 2)

Dominio **Autos** del Booking Prototipo, separado en cuatro microservicios detrás de un API Gateway.
El monolito original sigue en [`../backend`](../backend) (rama `main`).

**En internet:** API `https://rodadoec-api.onrender.com` · contrato oficial v3 en `/api/v3` (Swagger `/api/docs-v3`) · v1 en `/api/v1` ·
GraphQL `/graphql` · salud `/autos/health` · frontend `https://rodado-ec.vercel.app` · base de datos en Neon (PostgreSQL).

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
| `apps/all` | Arranca los 5 módulos de arriba **en un solo proceso** (para hosting con una sola instancia, como Render gratis) | — | `$PORT` |
| `libs/common` | Infra compartida: logger JSON, correlation id, errores ProblemDetails sobre gRPC, TTL cache, JWT, bootstrap | | |

## Cómo se cumple cada punto de la rúbrica

| Criterio | Dónde está |
|---|---|
| Sistema migrado a microservicios | 4 servicios con datos propios (schema por servicio; ninguno lee tablas de otro) |
| Booking consume APIs/eventos | REST `/api/v1` + GraphQL `/graphql` (subgrafo federado) + webhooks firmados con HMAC y reintentos |
| API Gateway funcional | `apps/gateway`: enruta a los servicios, valida JWT, aplica idempotencia, traduce errores |
| Contratos documentados y versionados | [`../contracts`](../contracts): OpenAPI v3.0.0 (oficial) y v1/v2, `inventory.proto` oficial, 5 `.proto` internos v1, GraphQL 1.0.0, `CHANGELOG.md`, `check-compat.js` |
| Pruebas de integración | `test/gateway.integration.ts` (17 pruebas v1) y `test/v2-contract.integration.ts` (32 pruebas de conformidad con el contrato v3): 49 en total, pasan contra la URL pública |
| Seguridad básica | JWT HS256 con secretos separados admin/cliente, guard por rol, tarjetas validadas (Luhn), CORS por lista, HMAC en webhooks |
| Desplegado en Internet | Render (`../render.microservicios.yaml`, un servicio con los 5 módulos) + Neon (Postgres) + frontend en Vercel |

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

## Contrato oficial v2 del agregador (`/api/v2`)

El archivo [`contracts/autos-openapi-v2.yaml`](../contracts/autos-openapi-v2.yaml) (versión 2.0.0, entregado por el agregador Booking) se
implementa **completo**: las 19 operaciones bajo `/api/v2/autos/*`. La v1 sigue viva en `/api/v1`. Swagger del contrato: `/api/docs-v2`.

| Requisito del contrato | Dónde vive |
|---|---|
| Búsqueda con franjas de 30 min, filtros, recargo <25 / >70 años y 422 para menores de 18 | Gateway `v2/autos-v2.controller.ts` + `libs/common/pricing.ts` |
| Máquina de 6 estados y cooldown de 2 h tras la devolución (el auto sale de las búsquedas, 409 `VEHICLE_IN_CLEANING_COOLDOWN`) | Catálogo (`TransitionVehicle`, expiración al consultar) + Reservas |
| Check-in digital → entrega (odómetro de salida) → devolución (odómetro de retorno, km recorridos) | Reservas (`CheckinDigital`, `DeliverOrder`, `ReturnOrder`) |
| Mantenimiento preventivo con RBAC y bitácora; alerta si `km >= próximo mantenimiento` | Catálogo (`RecordMaintenance`) + guard `V2AccessGuard` |
| Cancelación compensatoria (Saga) con reembolso del 100% y auto de nuevo `DISPONIBLE` | Reservas (`CancelOrderV2`) → Catálogo + Pagos |
| `Idempotency-Key` en toda mutación y `X-Correlation-Id` | Gateway (`IdempotencyKeyGuard` / `IdempotencyInterceptor`) |
| Tolerancia de 5 s, Circuit Breaker y respaldo con el último catálogo válido | `GrpcCaller` (`GRPC_TIMEOUT_MS`) y cabecera `X-Data-Source: fallback-cache` |
| Acuerdo B2B de promociones (§9) | Reservas (`GetPromoContract` / `SetPromoContract`) |
| Feed Outbox de CloudEvents (`/autos/eventos`) | Reservas (tabla `outbox_events`) |
| Stock hacia Booking por gRPC (`inventory.InventoryStockService`, §2.1) | Reservas (`inventory.client.ts`; `INVENTORY_GRPC_URL`) |
| Eventos a RabbitMQ (`booking.events`, routing key `auto.order.confirmed`…) y Kafka (`topic-ordenes-b2b`) como CloudEvents | Reservas (`broker.publisher.ts`: relay del outbox con reintentos; `RABBITMQ_URL`, `KAFKA_BROKERS`) |

**Cómo se comprueba que se cumple:** `test/v2-contract.integration.ts` valida **cada respuesta real** contra el esquema del propio YAML
(Ajv) y falla si una operación devuelve un código que el contrato no declara; además exige que se hayan ejercitado las 19 operaciones.
Para probar el empuje de stock sin Booking: `node test/mock-inventory-server.js` e `INVENTORY_GRPC_URL=127.0.0.1:50999` en Reservas.

**Brokers.** El relay publica cada evento del outbox en orden y solo lo marca como publicado cuando todos los brokers configurados lo
aceptaron; si uno está caído, reintenta cada 10 s (verificado: con RabbitMQ detenido los eventos quedan pendientes y se reenvían al volver).
Para probarlo en local: `docker compose --profile brokers up -d rabbitmq kafka`, arrancar Reservas con
`RABBITMQ_URL=amqp://guest:guest@localhost:5672 KAFKA_BROKERS=localhost:9092` y escuchar con `node test/consume-brokers.js`.

Decisiones donde el contrato es ambiguo o no alcanza:
- La reserva v2 no lleva tarjeta (la paga el agregador): Reservas liquida por un canal **B2B simulado** en Pagos, de modo que toda orden queda respaldada por un pago.
- Se devuelve `400` por validación también donde el contrato no lo declara (listado, eventos, mantenimiento); las pruebas lo señalan.
- Un auto que supera el umbral de kilometraje pasa a `EN_MANTENIMIENTO` hasta que el técnico registre `mantenimiento_realizado`.
- Las fechas pasadas en búsqueda o reserva se rechazan con 400, como muestra el ejemplo de `ProblemDetails` del contrato.

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
| `NO_SERVICE_HTTP=true` | servicios | Sin puerto HTTP de /health: solo gRPC local (lo usa `apps/all`) |
| `GRPC_TLS=true`, `GRPC_ON_PORT=true` | quien llama / servicios | Solo para el despliegue de 5 servicios separados (`render.distribuido.yaml`); **no funcionan en Render** (ver abajo) |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | identity | Credenciales del administrador |
| `ADMIN_JWT_SECRET`, `CUSTOMER_JWT_SECRET` | gateway **e** identity (iguales) | Firma/verificación de JWT |
| `AUTH_ENFORCE_V2`, `BOOKING_API_KEY` | gateway | `true` exige JWT o `X-API-Key` en las rutas protegidas del contrato v2; `BOOKING_API_KEY` es la clave M2M |
| `RABBITMQ_URL`, `KAFKA_BROKERS`, `RABBITMQ_EXCHANGE`, `KAFKA_TOPIC` | booking | Brokers del agregador (vacío = desactivado; exchange `booking.events` y topic `topic-ordenes-b2b` por defecto) |
| `INVENTORY_GRPC_URL`, `INVENTORY_GRPC_TLS`, `INVENTORY_SYNC_ON_START` | booking | Servicio de stock de Booking Prototipo (vacío = desactivado) |
| `GRPC_TIMEOUT_MS` | quien llama | Tolerancia por llamada gRPC (5000 por defecto; 60000 en Render por los arranques en frío) |
| `NODE_ID`, `NODE_NAME`, `PUBLIC_ASSETS_URL` | gateway / booking | Identidad del nodo en `/autos/health` y origen de las fotos |
| `AUTH_ENFORCE_ADMIN`, `AUTH_ENFORCE_CUSTOMER` | gateway | `true` exige JWT de ese rol en `/admin/**` y `/auth/me`, `/me/**` |
| `CORS_ORIGINS` | gateway | Orígenes permitidos separados por coma |

> **Seguridad vs. Swagger sin candados.** Por decisión del equipo, `AUTH_ENFORCE_*` está en `false` para poder probar la API
> sin tokens. La protección está implementada y se activa **sin cambiar código**; para la defensa/entrega final ponerlas en `true`
> (Swagger mostrará entonces el candado).

## Despliegue en internet

**Render (API) + Neon (base de datos) + Vercel (frontend).**

| Pieza | Dónde | Cómo |
|---|---|---|
| API (gateway + 4 servicios) | Render, un solo servicio `rodadoec-api` | Blueprint `render.microservicios.yaml`, rama `microservicios`, `APP=all` |
| Base de datos | Neon (PostgreSQL gratis) | URL **directa** (sin `-pooler`) en `DATABASE_URL`; cada servicio usa su schema |
| Frontend | Vercel (`rodado-ec`) | `VITE_API_URL=https://rodadoec-api.onrender.com` (tipo Config) |

**Por qué un solo servicio de Render y no cinco.** El proxy público de Render entrega las peticiones al servicio como HTTP/1.x, no
HTTP/2, y gRPC lo necesita: la llamada gRPC a un servicio de Render devuelve **502** (verificado; también lo reporta la comunidad de
Render). Así que `apps/all` arranca Catálogo, Pagos, Identidad y Reservas como aplicaciones Nest separadas (su módulo, su schema y su
servidor gRPC) y el gateway las llama por gRPC en `127.0.0.1` dentro del mismo contenedor. Solo el gateway abre el puerto público.
El despliegue con 5 servicios independientes (para un host que sí soporte gRPC) quedó en `render.distribuido.yaml`.

**Variables en Render.** El blueprint no puede crear las `sync: false` al sincronizarse solo: `DATABASE_URL`, `ADMIN_USERNAME` y
`ADMIN_PASSWORD` se agregan a mano (Environment → Add variable → Import from .env). Los secretos JWT los genera Render.

Puntos a vigilar (plan gratis):
1. El servicio **se duerme a los 15 min** y tarda en despertar: antes de una demo abrir `/warmup`.
2. Las horas gratis (750/mes) son compartidas por todo el workspace de Render.
3. Esta red bloquea el puerto 5432 saliente: no se puede probar la conexión a Neon desde la PC; se verifica en los logs de Render.
4. `AUTH_ENFORCE_ADMIN=true` en producción (el API es público): el panel de admin exige JWT. `AUTH_ENFORCE_V2` queda apagado para que Booking pueda probar sin clave.
5. Con `ALLOW_PAST_DATES=true` se aceptan fechas pasadas (útil con los ejemplos del contrato, cuyas fechas ya pasaron).

## Registrar el nodo en el panel de Booking

Base URL REST: `https://rodadoec-api.onrender.com`. El semáforo consulta `GET /health` o `GET /autos/health` (ambos responden) y el botón de
catálogo importa `GET /autos` (devuelve el catálogo disponible completo). Booking también puede usar `/api/v3`, `/api/v2` o la raíz
(`/autos/*`, `POST /reservas`) como `baseUrlRest`. Guía completa: [`../docs/GUIA_INTEGRACION_AUTOS.md`](../docs/GUIA_INTEGRACION_AUTOS.md) y
prueba local con Tailscale: [`../docs/GUIA-INTEGRACION-LOCAL.md`](../docs/GUIA-INTEGRACION-LOCAL.md).

## Pendiente conocido

- **Respaldo REST del stock** (`POST /api/v3/inventory/stock` en Booking): desde Render no se llega a su `:50051` por gRPC; falta el cuerpo
  exacto de ese POST para implementarlo.
