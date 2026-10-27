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
| REST del agregador Booking (OpenAPI, ruta `/api/v2`) — **contrato oficial vigente** | `autos-openapi-v2.yaml` | 2.0.0 |
| REST público original (OpenAPI, ruta `/api/v1`) | `autos-openapi.yaml` | 1.1.0 |
| gRPC de stock hacia Booking (`inventory.InventoryStockService`) | `proto/inventory/inventory.proto` | tal como lo publica Booking |
| Eventos de dominio (AsyncAPI) | `autos-asyncapi.yaml` | 1.1.0 |
| gRPC común | `proto/autos/common/v1/common.proto` | v1 |
| gRPC Catálogo | `proto/autos/catalog/v1/catalog.proto` | v1 |
| gRPC Reservas | `proto/autos/booking/v1/booking.proto` | v1 |
| gRPC Pagos | `proto/autos/payments/v1/payments.proto` | v1 |
| gRPC Identidad | `proto/autos/identity/v1/identity.proto` | v1 |
| GraphQL federado (subgrafo) | `graphql/autos.graphql` | 1.0.0 |

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
