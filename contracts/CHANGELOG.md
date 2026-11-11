# Contratos del dominio Autos — historial de versiones

Los contratos viven en este directorio, **versionados en Git junto al código** y se tratan como código de
primera clase (Semana 7). Versionado semántico aplicado a contratos:

| Cambio | Tipo | Ejemplo |
|---|---|---|
| Agregar un campo opcional o un endpoint nuevo | MINOR (compatible hacia atrás) | `available` en `/search` |
| Corregir descripción o metadatos | PATCH | typo en un summary |
| Quitar/renombrar un campo, cambiar un tipo, hacer requerido un campo opcional | **MAJOR (rompe)** | quitar `price` |

Un cambio MAJOR **no muta** el contrato existente: se publica uno nuevo (`autos.<servicio>.v2`, `/api/v2`,
`autos.v2.graphql`) y el anterior sigue vigente hasta que todos los consumidores migren.
`contracts/check-compat.js` compara los contratos actuales contra la línea base y falla ante un cambio que rompe.

## Contratos y su versión actual

| Contrato | Archivo | Versión |
|---|---|---|
| REST del agregador Booking (OpenAPI, ruta `/api/v3`) — **contrato oficial vigente** | `autos-openapi-v3.yaml` | 3.0.0 |
| REST del agregador Booking, versión anterior (ruta `/api/v2`) | `autos-openapi-v2.yaml` | 2.0.0 |
| REST público original (OpenAPI, ruta `/api/v1`) | `autos-openapi.yaml` | 1.1.0 |
| gRPC de stock hacia Booking (`inventory.InventoryStockService`) | `proto/inventory/inventory.proto` | tal como lo publica Booking |
| Eventos de dominio (AsyncAPI) | `autos-asyncapi.yaml` | 1.1.0 |
| gRPC común | `proto/autos/common/v1/common.proto` | v1 |
| gRPC Catálogo | `proto/autos/catalog/v1/catalog.proto` | v1 |
| gRPC Reservas | `proto/autos/booking/v1/booking.proto` | v1 |
| gRPC Pagos | `proto/autos/payments/v1/payments.proto` | v1 |
| gRPC Identidad | `proto/autos/identity/v1/identity.proto` | v1 |
| GraphQL federado (subgrafo) | `graphql/autos.graphql` | 1.0.0 |

## 3.2.0 (REST v3.2, MINOR) — disponibilidad por fechas y aviso solo de reservas de Booking

Cambios compatibles hacia atrás (campos nuevos opcionales); a pedido del Booking.

- **Disponibilidad por fechas:** una reserva (CONFIRMED) o entrega en curso (ENTREGADO) ocupa al auto solo entre su recogida y su devolución más 2 h de limpieza. `POST /autos/search`, `GET /autos` y la creación de reservas calculan la disponibilidad con esas ventanas; ya no basta que el auto esté "reservado" para ocultarlo en todas las fechas. Un cruce de fechas sigue respondiendo `409 VEHICLE_UNAVAILABLE` (`reason: VEHICLE_ALREADY_RESERVED`). Mantenimiento y limpieza vigente siguen bloqueando.
- **Estado del auto:** `RESERVADO` / `LISTO_PARA_ENTREGAR` se muestran solo mientras la reserva está en curso; una reserva futura deja al auto `DISPONIBLE`. `ENTREGADO`, `EN_LIMPIEZA` y `EN_MANTENIMIENTO` no cambian.
- **Orden:** la respuesta agrega los campos opcionales `pickup_date` y `dropoff_date` (YYYY-MM-DD).
- **Origen de la reserva:** solo las reservas creadas con la `X-API-Key` del nodo se consideran de Booking (gRPC `Order.source` = `BOOKING`, `CreateOrderV2Request.source`; MINOR). `POST /autos/orders/create`, `POST /autos/reservas` y `GET /autos/orders` piden la `X-API-Key` (o un JWT) cuando el nodo tiene clave configurada.
- **Aviso de entrega:** `POST /autos/orders/{id}/checkin-entrega` solo avisa al Booking de las reservas con `source=BOOKING`, usando la `X-API-Key` propia del nodo (`NODE_API_KEY`), `estado: CONFIRMADO_ASISTIDO` y el PNR como `external_order_id`. Las reservas hechas en la web propia devuelven `booking_sync.notified=false` sin llamar a Booking.
- Configuración: `NODE_API_KEY` (una sola clave: la que Booking envía a nuestra API y la que nosotros enviamos al avisar). `BOOKING_API_KEY` se conserva como alias; `BOOKING_CHECKIN_API_KEY` ya no se usa.

## 3.1.0 (REST v3.1, MINOR) — clientes y aviso de entrega al Booking

Solo se agregaron endpoints y un campo opcional; nada de lo publicado en 3.0.0 cambió (compatible hacia atrás). Requerimiento de cátedra.

- `GET /api/v3/clientes?email=&identificacion=`: `200 {client_id, nombre, email, identificacion, telefono, licencia}` si el conductor existe; `404` si no.
- `POST /api/v3/clientes` (`nombre`, `email`, `identificacion` obligatorios; `telefono`, `licencia` opcionales): `201 {client_id}`. Es idempotente: si ya existe un cliente con ese correo (sin distinguir mayúsculas) o esa identificación se devuelve el mismo `client_id`, sin duplicar.
- Check-in de entrega (`POST /autos/orders/{id}/checkin-entrega`): tras registrar la entrega, el backend avisa al Booking con `POST {BOOKING_CORE_URL}/api/v3/reservas/{external_order_id}/checkin` (`X-API-Key`; estado `CONFIRMADO_ASISTIDO`, `client_id` local, `admin_id`, `fecha_checkin`, `observaciones`). El aviso es de mejor esfuerzo: si falla, la entrega no se deshace. La respuesta agrega el campo opcional `booking_sync` (`notified`, `status`, `reason`).
- gRPC Identidad (MINOR): `IdentityService.FindClient` y `IdentityService.CreateClient`; mensajes `ClientRecord`, `FindClientRequest/Response`, `CreateClientRequest`.
- Configuración: `BOOKING_CORE_URL` (por defecto `https://booking-core-api.azurewebsites.net`) y la clave `BOOKING_CHECKIN_API_KEY` (si falta, `BOOKING_API_KEY`).

## 3.0.0 (REST v3) — contrato canónico vigente

`autos-openapi-v3.yaml` (copiado sin modificar) reemplaza al v2 como contrato de referencia; las 19 operaciones son las mismas.
El gateway lo sirve en `/api/v3` (y en `/api/v2`, `/autos/*` y `POST /reservas`), con Swagger en `/api/docs-v3`.

- La reserva exige `driver` en inglés (`full_name`, `email`, `phone`, `license_number`, `age` ≥ 18); `conductor` y los nombres en español se aceptan como alias. `coverage_type`: `BASIC` | `TOTAL` | `BASICA`.
- Errores: auto no disponible → `409 VEHICLE_UNAVAILABLE` (único código que activa la compensación de Saga, con `reason` del motivo); fechas inválidas → `422 INVALID_DATES`; reutilizar una `Idempotency-Key` con otro cuerpo → `400 IDEMPOTENCY_CONFLICT`.
- La ficha del auto agrega `total_price`, `status` y `cleaning_cooldown`; la orden agrega los alias `vehicle_id` y `voucher_qr_payload`.
- `inventory.proto` oficial (v3): `slot_id` (`slot-YYYYMMDD-HHMM`), `error_code` y `current_available` en el acuse, y `GetSlotAvailability`. El timestamp de cada aviso es estrictamente creciente.
- Respaldo REST del stock hacia Booking (`INVENTORY_REST_URL`): mismo cuerpo que `StockUpdateMessage` en JSON (suposición; la guía no publica el esquema).
- `GET /autos` sin parámetros devuelve el catálogo disponible completo (hasta 100): Booking lo importa así.

## 2.0.0 (REST v2) — contrato oficial del agregador Booking Prototipo

`autos-openapi-v2.yaml` es el archivo entregado por el agregador; se copia **sin modificar** y es la fuente de verdad.
El gateway lo implementa completo en `/api/v2/autos/*` (19 operaciones) y lo publica como Swagger en `/api/docs-v2`.
La v1 sigue en `/api/v1` sin cambios de ruta ni de forma (compatibilidad hacia atrás).

- Máquina de 6 estados del auto: `DISPONIBLE → RESERVADO → LISTO_PARA_ENTREGAR → ENTREGADO → EN_LIMPIEZA → EN_MANTENIMIENTO`.
- Cooldown obligatorio de 2 h tras la devolución (`EN_LIMPIEZA`): el auto sale de las búsquedas y reservarlo da 409 `VEHICLE_IN_CLEANING_COOLDOWN`.
- Tres check-ins: digital (`/reservas/{id}/checkin`), entrega (`checkin-entrega`) y devolución (`checkin-devolucion`), más `/{id}/devolucion`.
- Mantenimiento preventivo con RBAC (`X-Role`: MANTENIMIENTO o ADMIN) y bitácora `BIT-AUTO-nn`.
- Acuerdo B2B de promociones (`/promociones/contrato`), telemetría (`/health`, `/flota`) y feed Outbox de CloudEvents (`/eventos`).
- Errores RFC 7807 con `instance`, `correlation_id`, `timestamp` e `invalid_params`; edad menor de 18 → 422; recargo por conductor <25 o >70 años.
- Eventos hacia RabbitMQ (`booking.events`) y Kafka (`topic-ordenes-b2b`) como CloudEvents, con relay del outbox y reintentos.
- Seguridad: JWT o `X-API-Key` (`AUTH_ENFORCE_V2=true` la exige; apagada por defecto para probar en Swagger).
- gRPC hacia Booking: cada cambio de stock se empuja con `PushStockUpdate` y la flota completa con `StreamInventoryChanges` (`INVENTORY_GRPC_URL`).
- gRPC interno (MINOR, solo se agregaron campos y RPCs; nada se renumeró): `Vehicle` (+odómetro, mantenimiento, fin de cooldown), `Order` (+cobertura, depósito, km, check-in, reembolso), `CatalogService.TransitionVehicle/RecordMaintenance`, `BookingService` (+10 RPCs v2), `ChargeRequest.channel`.
- Localizador de reserva: ahora `CAR` + 5 caracteres (8 en total, como exige el v2); la v1 lo devuelve con el mismo formato.

## 1.1.0 (REST/AsyncAPI) — arquitectura de microservicios (Reto 2)

- Los endpoints REST **no cambian de ruta ni de forma**: ahora los sirve un API Gateway que reparte las
  llamadas a cuatro microservicios por gRPC (Catálogo, Reservas, Pagos, Identidad).
- Nuevo: encabezado `X-Correlation-Id` (se genera si no llega) en todas las respuestas y propagado a los servicios y a los eventos.
- Nuevo: GraphQL federado en `POST /graphql` (`graphql/autos.graphql` 1.0.0).
- Eventos: `WebhookPayload` incluye `correlationId`. Nuevos tipos de evento: `CAR_PAYMENT_APPROVED`,
  `CAR_VEHICLE_RESERVED`, `CAR_VEHICLE_RELEASED` (MINOR: los consumidores que no los conozcan los ignoran).
- Entrega de webhooks con reintentos (backoff exponencial, 3 intentos) y registro de entregas fallidas.
- Campos extra no contractuales en `/search` y `/details` (MINOR): `available`, `min_driver_age`, `depot_id`, `status`.
- Nuevo endpoint `POST /payments` (pago simulado) y `/admin/users` (MINOR).

## 1.0.0

- Contrato inicial entregado por la cátedra (`autos-openapi.yaml`) y diseño preliminar de eventos.
