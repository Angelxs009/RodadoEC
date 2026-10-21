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
| REST público (OpenAPI, ruta `/api/v1`) | `autos-openapi.yaml` | 1.1.0 |
| Eventos de dominio (AsyncAPI) | `autos-asyncapi.yaml` | 1.1.0 |
| gRPC común | `proto/autos/common/v1/common.proto` | v1 |
| gRPC Catálogo | `proto/autos/catalog/v1/catalog.proto` | v1 |
| gRPC Reservas | `proto/autos/booking/v1/booking.proto` | v1 |
| gRPC Pagos | `proto/autos/payments/v1/payments.proto` | v1 |
| gRPC Identidad | `proto/autos/identity/v1/identity.proto` | v1 |
| GraphQL federado (subgrafo) | `graphql/autos.graphql` | 1.0.0 |

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
