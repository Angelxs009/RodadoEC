# RodadoEc — Dominio Autos del Booking Prototipo
## Informe técnico: migración a microservicios e integración con el agregador

**Curso:** Integración de Sistemas (PUCE) · **Entregable:** Reto 2 — arquitectura de microservicios
**Repositorio:** https://github.com/Angelxs009/RodadoEC (rama `microservicios`)
**En internet:** API `https://rodadoec-api.onrender.com` · contrato v3 en `/api/v3` (Swagger `/api/docs-v3`) · sitio `https://rodado-ec.vercel.app`

---

## 1. Resumen

RodadoEc es la tienda de **renta de autos** que se integra al **Booking Prototipo**, un marketplace que agrupa tiendas de varios dominios
(vuelos, alojamientos, atracciones, autos). Partimos de un monolito (NestJS + React) y lo migramos a **cuatro microservicios con base de
datos propia detrás de un API Gateway**, cumpliendo el contrato oficial que publicó el agregador (OpenAPI v3), con integración
asíncrona (gRPC de stock, webhooks, feed outbox hacia RabbitMQ y Kafka), pruebas de integración que validan cada respuesta contra el
propio contrato, y despliegue en internet.

| Resultado | Detalle |
|---|---|
| Microservicios | Catálogo, Reservas, Pagos e Identidad + API Gateway |
| Contrato oficial | `autos-openapi-v3.yaml`: las 19 operaciones implementadas y verificadas |
| Pruebas | 49 pruebas de integración, todas pasan contra la URL pública |
| Despliegue | Render (API) + Neon (PostgreSQL) + Vercel (frontend) |

---

## 2. Arquitectura

```
 Frontend (Vercel) ──┐
 Booking central ────┼──► API Gateway ──gRPC──► catalog-service    autos, agencias, disponibilidad, mantenimiento
 Otros subgrafos ────┘   REST /api/v1,/v3      booking-service    búsqueda, órdenes, check-ins, webhooks, SAGA, outbox
                         GraphQL /graphql        │  ├─gRPC─► catalog-service   reservar / liberar el auto
                         Swagger /api/docs*      │  └─gRPC─► payments-service  cobrar / consumir / reembolsar
                                                 payments-service   pasarela de pago simulada
                                                 identity-service   clientes, administradores, JWT
                        PostgreSQL · un schema por servicio (catalog, booking, payments, identity)

 Booking ◄── gRPC PushStockUpdate (inventory.proto) ── booking-service     stock en tiempo real
 Booking ◄── webhooks firmados · feed /autos/eventos · RabbitMQ / Kafka ── eventos de dominio (CloudEvents)
```

### 2.1 Servicios

| Servicio | Responsabilidad | Datos propios |
|---|---|---|
| **API Gateway** | Entrada única: REST (v1 y v3), GraphQL federado, JWT y roles, idempotencia, correlation id, traducción de errores | — |
| **Catálogo** | Vehículos (máquina de 6 estados), agencias, proveedores, odómetro, cooldown, bitácora de mantenimiento | schema `catalog` |
| **Reservas** | Órdenes, check-ins, **orquesta la saga**, webhooks, outbox de eventos, acuerdo B2B de promociones, stock hacia Booking | schema `booking` |
| **Pagos** | Pasarela simulada (Luhn, tarjetas de prueba), reembolsos, canal B2B | schema `payments` |
| **Identidad** | Registro y login de clientes, login de admin, usuarios, emisión de JWT | schema `identity` |

Cada servicio es una aplicación Nest independiente (`services/apps/*`) con su módulo, su servidor gRPC y su schema. **Ningún servicio lee
las tablas de otro**: se hablan por gRPC con IDs lógicos y sin llaves foráneas entre schemas. El script de base de datos unificado está en
`database/02_microservicios_autos.sql`.

### 2.2 Comunicación

| Canal | Uso |
|---|---|
| **gRPC** (contratos `.proto` v1 versionados) | Gateway ↔ servicios y Reservas ↔ Catálogo/Pagos |
| **REST** | Contrato v1 (original) y **v3 (oficial del agregador)** hacia clientes y Booking |
| **GraphQL federado** (`/graphql`) | Subgrafo Apollo con `@key` (`Vehiculo`, `Agencia`, `Orden`) para que el agregador lo componga |
| **gRPC hacia Booking** | `inventory.InventoryStockService/PushStockUpdate` (stock por cada reserva, cancelación, limpieza o mantenimiento) y `StreamInventoryChanges` (sincronización masiva) |
| **Eventos** | Webhooks con firma HMAC y 3 reintentos; feed `GET /autos/eventos` (Transactional Outbox); relay a RabbitMQ (`booking.events`) y Kafka (`topic-ordenes-b2b`) |

---

## 3. Contratos documentados y versionados

Los contratos viven en `contracts/` y se tratan como código (versionados en Git junto con la implementación).

| Contrato | Archivo | Versión |
|---|---|---|
| REST oficial del agregador | `autos-openapi-v3.yaml` | 3.0.0 (vigente) |
| REST anterior | `autos-openapi-v2.yaml`, `autos-openapi.yaml` | 2.0.0 y 1.1.0 |
| Stock gRPC hacia Booking | `proto/inventory/inventory.proto` | oficial del agregador, sin modificar |
| gRPC interno | `proto/autos/{common,catalog,booking,payments,identity}/v1/*.proto` | v1 |
| GraphQL (subgrafo federado) | `graphql/autos.graphql` | 1.0.0 |

**Versionado semántico aplicado a contratos:** agregar un campo o endpoint es MINOR (compatible); quitar, renombrar o cambiar un tipo es
MAJOR y obliga a publicar un contrato nuevo (`v2`) sin mutar el anterior. El verificador `contracts/check-compat.js` extrae la "superficie"
de cada contrato (endpoints y campos OpenAPI, mensajes y RPC gRPC, tipos GraphQL), la compara con `contracts/baseline.json` y **falla ante
cualquier cambio que rompa la compatibilidad**. El historial de cambios está en `contracts/CHANGELOG.md`.

Cuando el agregador cambió su contrato de v2 a v3 (y luego añadió alias), pudimos medir el impacto exacto con ese verificador y con la
suite de conformidad, en lugar de revisarlo a ojo.

---

## 4. Flujos y reglas de negocio

### 4.1 Reserva distribuida (saga orquestada por Reservas)

1. **Reservar el auto** en Catálogo, operación atómica (`AVAILABLE → RESERVED`). Si otro lo reservó antes, se compensa y se responde `409`.
2. **Consumir el pago** en Pagos (atómico: un pago solo sirve para una orden). Si falla, **se libera el auto**.
3. **Guardar la orden**. Si falla, **se libera el auto y se reembolsa el pago**.

Cancelar una orden también compensa: reembolsa el 100% y devuelve el auto a `DISPONIBLE`. En el contrato v3 la reserva no lleva tarjeta (la
paga el agregador), así que Pagos liquida por un **canal B2B simulado**: toda orden queda respaldada por un pago registrado.

### 4.2 Máquina de 6 estados del vehículo y cooldown

`DISPONIBLE → RESERVADO → LISTO_PARA_ENTREGAR → ENTREGADO → EN_LIMPIEZA → (DISPONIBLE)`, más `EN_MANTENIMIENTO`.
Check-in digital (QR), entrega en mostrador (odómetro de salida) y devolución (odómetro de retorno, km recorridos). Tras la devolución el
auto queda **2 horas en limpieza**: sale de las búsquedas y reservarlo responde `409 VEHICLE_UNAVAILABLE` (con `reason`). El cooldown vence
al consultar (sin temporizadores), por lo que sobrevive a reinicios. Si el odómetro supera el umbral, hay alerta preventiva, registro de
auditoría y el auto pasa a mantenimiento hasta que el técnico lo habilite.

### 4.3 Idempotencia y trazabilidad

- **`Idempotency-Key`** obligatoria en toda mutación: repetirla devuelve la misma respuesta sin duplicar la reserva ni el cobro;
  reutilizarla con otro cuerpo responde `400 IDEMPOTENCY_CONFLICT`.
- **`X-Correlation-Id`** viaja del cliente al gateway, a los servicios (metadata gRPC), a los logs y a cada evento publicado.
- **Logs JSON** de una línea por evento, también en archivo físico con `correlation_id` e `idempotency_key`.

### 4.4 Errores (RFC 7807)

Todo error usa `application/problem+json` con `type`, `title`, `status`, `detail`, `code`, `instance`, `correlation_id`, `timestamp` e
`invalid_params`. Los códigos siguen al agregador: `409` es el **único** que activa la compensación de su saga; `422` (`DRIVER_UNDERAGE`,
`INVALID_DATES`) son errores semánticos que no la activan; `400` para sintaxis e idempotencia.

---

## 5. Seguridad

- **JWT (HS256)** con **secretos distintos** para administradores y clientes: un token de uno nunca valida en el otro.
- **Roles** `ADMIN`, `CLIENTE` y `MANTENIMIENTO` en el contrato v3; guard por rol en el gateway.
- **Clave M2M** `X-API-Key` para las llamadas del agregador, activable con `AUTH_ENFORCE_V2`.
- **Panel de administración protegido** en producción (`AUTH_ENFORCE_ADMIN=true`) con credenciales propias, no las de desarrollo.
- Tarjetas validadas con Luhn (el número completo y el CVV nunca se guardan), webhooks firmados con HMAC-SHA256, CORS por lista.
- Los secretos viven en variables de entorno (`.env` fuera del repositorio; en Render, variables del servicio).

*Decisión del equipo:* los candados de las rutas del contrato v2/v3 están **apagados por defecto** para que el agregador pueda probar sin
clave; la protección está implementada y se activa solo con una variable de entorno.

---

## 6. Resiliencia

- **Timeout de 5 s por llamada gRPC** (configurable) y **Circuit Breaker**: 5 fallos de transporte seguidos abren el circuito 10 s y las
  llamadas fallan rápido con `503` en lugar de colgarse. Un error de dominio (404, 409…) prueba que el servicio responde y no cuenta.
- **Respaldo de catálogo:** si Catálogo no responde, las lecturas del contrato v3 sirven la última copia válida y lo avisan con la
  cabecera `X-Data-Source: fallback-cache`.
- **Outbox con reintentos:** un evento solo se marca publicado cuando todos los brokers lo aceptaron; si uno está caído, se reintenta cada
  10 s y ningún evento se pierde (verificado deteniendo RabbitMQ).
- **Salud del nodo:** `GET /autos/health` informa `HEALTHY`, `DEGRADED` o `DOWN` con latencia y estado del circuit breaker;
  `GET /warmup` despierta toda la cadena en hosting gratuito.

---

## 7. Pruebas

49 pruebas de integración de extremo a extremo (`services/test/`), que llaman al gateway real y atraviesan los cuatro servicios:

- **17 del contrato v1** (flujo de pago, idempotencia, saga, admin, auth, webhooks, GraphQL, `_entities` de la federación).
- **32 de conformidad con el contrato v3.** Cada respuesta real se valida contra el esquema del propio YAML (Ajv) y la prueba falla si
  una operación devuelve un código de estado que el contrato no declara. Una prueba final exige que se hayan ejercitado **las 19
  operaciones** del contrato.

Resultado: **49 de 49 contra la URL pública de internet** (y contra el sistema local en Docker, donde la última corrida completa fue de 48 antes de añadir la prueba del catálogo completo).

---

## 8. Despliegue

| Pieza | Dónde |
|---|---|
| API (gateway + 4 servicios) | Render, un servicio (`rodadoec-api`) |
| Base de datos | Neon (PostgreSQL), un schema por servicio |
| Frontend | Vercel, apunta al API con `VITE_API_URL` |
| Local | `docker compose up --build` (Postgres + 5 contenedores); opcional `--profile brokers` (RabbitMQ y Kafka) |

### Decisión de despliegue: un solo servicio en Render

Probamos primero el despliegue natural, **cinco servicios independientes** (`render.distribuido.yaml`). Todos arrancaron, pero el gateway no
lograba hablar con los servicios: **Render entrega las peticiones al servicio como HTTP/1.x, no HTTP/2, y gRPC necesita HTTP/2**, así que
cada llamada gRPC entre servicios web devolvía **502**. Lo verificamos con una llamada gRPC directa y con la documentación y foros de Render.
Como el plan gratuito no ofrece red privada entre servicios web, la solución fue `apps/all`: **un solo proceso de Node que aloja los cinco
módulos** como aplicaciones Nest separadas (cada una con su módulo, su schema y su servidor gRPC), llamándose por gRPC en `127.0.0.1`.
La arquitectura, los contratos y el código son los mismos; solo cambia el empaquetado. El despliegue con cinco servicios sigue disponible
para un host que sí soporte gRPC (por ejemplo Cloud Run o una máquina virtual con `docker compose`).

---

## 9. Cumplimiento de la rúbrica del Reto 2

| Criterio | Evidencia |
|---|---|
| Sistema migrado a microservicios | 4 servicios con datos propios + gateway (`services/apps/*`) |
| Booking consume APIs y eventos | REST v3, GraphQL federado, gRPC de stock, webhooks, feed outbox, RabbitMQ/Kafka |
| Marketplace web distribuido funciona | Sitio en Vercel contra el API en Render |
| Administración funciona | Panel con los 6 estados del auto, agencias, órdenes y usuarios |
| API Gateway funcional | `apps/gateway`: enruta, valida JWT, idempotencia, traduce errores |
| Contratos documentados y versionados | OpenAPI v1–v3, `.proto`, GraphQL, `CHANGELOG.md`, verificador de compatibilidad |
| Pruebas de integración | 49 pruebas, validadas contra el YAML |
| Seguridad básica | JWT con roles, clave M2M, admin protegido, HMAC, CORS |
| Todo desplegado en internet | Render + Neon + Vercel |

---

## 10. Limitaciones conocidas

- **Respaldo REST del stock** (`POST /api/v3/inventory/stock` en Booking): desde Render no se llega al `:50051` de Booking por gRPC; con
  Tailscale (red privada) sí. Falta el cuerpo exacto de esa petición para implementar el respaldo.
- **Plan gratuito:** el servicio se duerme a los 15 minutos y tarda en despertar; las horas gratuitas del mes se comparten entre todos los
  servicios del espacio de trabajo de Render.
- **Un solo proceso en Render:** los módulos comparten proceso y memoria (no se escalan ni fallan por separado en esa instancia).
- **Pagos simulados:** no se mueve dinero; hay tarjetas de prueba (aprobada, fondos insuficientes, bloqueada).
- **Candados del contrato v3 apagados por defecto** (decisión para facilitar las pruebas del agregador).

---

## 11. Cómo ejecutar

```bash
docker compose up --build                       # gateway en http://localhost:3000, Swagger /api/docs-v3
GATEWAY_URL=http://localhost:3000 npm run test:integration --prefix services
npm run check:contracts --prefix services       # verificador de compatibilidad de contratos
docker compose --profile brokers up -d          # RabbitMQ y Kafka (opcional)
```

Documentación detallada: `services/README.md`, `docs/GUIA_INTEGRACION_AUTOS.md` (guía del agregador) y `docs/GUIA-INTEGRACION-LOCAL.md`
(prueba con Tailscale).
