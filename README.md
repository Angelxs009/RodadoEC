# RodadoEc — Dominio Autos (Booking Prototipo)

**RodadoEc** es el nodo de **Renta de Autos** del proyecto integrador Booking Prototipo (curso Integración de Sistemas, PUCE). Es un sistema de **microservicios** con un API Gateway al frente, que implementa el contrato oficial **v3** del agregador Booking, e incluye una web de reserva y un backoffice de mostrador.

| | Dirección |
|---|---|
| Sitio web (Vercel) | https://rodado-ec.vercel.app |
| API (Azure App Service) | https://rodadoec-api.azurewebsites.net/api/v3 |
| Swagger del contrato v3 | https://rodadoec-api.azurewebsites.net/api/docs-v3 |
| Salud | `GET /api/v3/autos/health` · calentar servicios: `GET /warmup` |
| Respaldo | Render (`render.microservicios.yaml`) |

## 1. Arquitectura

```
 Frontend React (Vercel) ─┐
 Booking central ─────────┼─► API Gateway (NestJS) ──gRPC──► catalog-service   autos, agencias, disponibilidad por fechas
 Otros subgrafos ─────────┘   REST /api/v1 · /v2 · /v3          booking-service   hold, preview, órdenes, cancelación, anexos, webhooks, SAGA
                              GraphQL /graphql                    payments-service  pago simulado, reembolsos
                              JWT · roles · X-API-Key             identity-service  clientes, administradores, JWT
                                     │
                                     ├─► PostgreSQL: un schema por servicio (catalog, booking, payments, identity)
                                     └─► Outbox ─► RabbitMQ / Kafka (CloudEvents) · Webhooks firmados con HMAC
```

| Pieza | Responsabilidad |
|---|---|
| `services/apps/gateway` | Entrada única: REST (v1, v2, v3), GraphQL federado, JWT por rol, `X-API-Key` del Booking, `Idempotency-Key`, errores RFC 7807, `X-Correlation-Id`, circuit breaker |
| `services/apps/catalog` | Vehículos, agencias, proveedores; reserva atómica del auto; estados y limpieza |
| `services/apps/booking` | Búsqueda, hold, preview, órdenes, cancelación, entrega/devolución, contratos anexos; **orquesta la saga** |
| `services/apps/payments` | Pasarela simulada (Luhn), consumo de pago y reembolsos |
| `services/apps/identity` | Registro/login, administradores, emisión y verificación de JWT |
| `services/apps/all` | Los 5 módulos en un solo proceso (así corre en Azure) |
| `services/libs/common` | Logger JSON, correlation id, ProblemDetails sobre gRPC, caché TTL, JWT |
| `frontend/` | React + Vite + Tailwind: web del cliente y panel de mostrador/administración |
| `contracts/` | OpenAPI v1–v3, `.proto` por servicio, GraphQL, AsyncAPI, `CHANGELOG.md`, `baseline.json`, `check-compat.js` |

El monolito original (contrato v1) quedó en `backend/` solo como referencia histórica.

## 2. Flujo de negocio

1. **Reserva:** búsqueda → hold del auto → vista previa → pago → orden `CONFIRMED` (PNR). El auto se reserva de forma atómica; si el pago o la reserva fallan, la saga compensa (reembolso y liberación del auto).
2. **Cancelación:** solo con **al menos 24 h** de anticipación a la recogida (`CANCEL_MIN_HOURS`). Antes del plazo hay reembolso del 100 % y el auto vuelve al inventario; después, `409 Cancelación Fuera de Plazo`. Una orden ya entregada o completada responde `409 Cancelación No Permitida`.
3. **Mostrador:** check-in digital → entrega de llaves (odómetro de salida, estado `ENTREGADO`) → devolución (odómetro de retorno, orden `COMPLETADA`) → limpieza de 2 h → `DISPONIBLE`.
4. **Contrato anexo:** los extras, upgrades o días adicionales pedidos al retirar se cobran aparte (`ANX-XXXXXX`); la orden original no cambia.
5. **Disponibilidad por fechas:** un auto solo queda ocupado entre su recogida y su devolución más 2 h de limpieza.

El panel de órdenes y el de flota se refrescan solos cada 5 segundos, sin recargar la página.

## 3. Contratos

| Contrato | Archivo | Versión |
|---|---|---|
| REST oficial del agregador (`/api/v3`) | `contracts/autos-openapi-v3.yaml` | 3.3.0 |
| REST anterior (`/api/v2`) y original (`/api/v1`) | `autos-openapi-v2.yaml` · `autos-openapi.yaml` | 2.0.0 · 1.1.0 |
| gRPC internos | `contracts/proto/autos/{common,catalog,booking,payments,identity}/v1` | v1 |
| Stock hacia Booking | `contracts/proto/inventory/inventory.proto` | de Booking |
| GraphQL federado | `contracts/graphql/autos.graphql` | 1.0.0 |
| Eventos | `contracts/autos-asyncapi.yaml` | 1.1.0 |

Los cambios compatibles suben MINOR; los que rompen requieren una versión nueva (`/api/v4`). Detalle en `contracts/CHANGELOG.md`. El verificador `node contracts/check-compat.js` (se corre desde `services/`) compara contra `baseline.json` y falla ante un cambio que rompa.

## 4. Seguridad

- **JWT HS256** con secretos separados: administradores (12 h) y clientes (30 d). Roles `ADMIN`, `CLIENTE` y `MANTENIMIENTO`.
- **`X-API-Key`** (`NODE_API_KEY`): Booking la envía en las rutas de órdenes y reservas (`/autos/orders…`, `/autos/reservas`). Sin ella o con una distinta responde 401.
- Tarjetas validadas con Luhn (nunca se guarda el número completo ni el CVV), CORS por lista, webhooks firmados con HMAC e `Idempotency-Key` en toda mutación.

## 5. Cómo correrlo

```bash
# Todo el sistema con Docker (gateway en http://localhost:3000)
docker compose up --build

# Solo el backend, sin Docker (requiere Postgres y .env)
cd services
npm ci
npm run build
node dist/apps/all/main

# Frontend
cd frontend
npm ci
npm run dev        # http://localhost:5173
```

Variables principales: `DATABASE_URL`, `ADMIN_JWT_SECRET`, `CUSTOMER_JWT_SECRET`, `NODE_API_KEY`, `CANCEL_MIN_HOURS` (por defecto 24), `CORS_ORIGINS`, y `VITE_API_URL` en el frontend.

## 6. Pruebas y CI/CD

```bash
cd services
npm run test:unit          # pruebas unitarias
npm run test:integration   # integración contra el sistema levantado
node ../contracts/check-compat.js
```

- **CI** (`.github/workflows/ci.yml`): lint de tipos → pruebas unitarias → E2E con Postgres → verificación de contratos. Cada job depende del anterior.
- **CD** (`.github/workflows/cd.yml`): al terminar el CI en verde se despliega a Azure con login federado **OIDC** (sin contraseñas ni perfiles de publicación) y una prueba de humo sobre `/api/v3/autos/health`.
- Las pruebas de integración validan cada respuesta contra el esquema del propio OpenAPI v3 (ajv).

## 7. Más documentación

- [`services/README.md`](services/README.md): detalle de los microservicios, la saga y el contrato v2/v3.
- [`docs/INFORME_TECNICO.md`](docs/INFORME_TECNICO.md): informe técnico.
- [`docs/GUIA_INTEGRACION_AUTOS.md`](docs/GUIA_INTEGRACION_AUTOS.md) y [`docs/GUIA-INTEGRACION-LOCAL.md`](docs/GUIA-INTEGRACION-LOCAL.md): integración con Booking.
- [`docs/GUION_DEFENSA.md`](docs/GUION_DEFENSA.md): guion de la defensa.

## 8. Limitaciones conocidas

- Proyecto académico: el pago es simulado y no hay pasarela real.
- El envío de stock hacia Booking (`INVENTORY_REST_URL` / `INVENTORY_GRPC_URL`) depende de que Booking entregue su URL y clave; mientras tanto Booking obtiene los autos leyendo `GET /api/v3/autos`.
- El esquema se crea con `synchronize: true` de TypeORM, sin migraciones.
