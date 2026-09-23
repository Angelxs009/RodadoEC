# RodadoEc — Dominio Autos (Booking Prototipo)

**RodadoEc** es la implementación del dominio **Renta de Autos** para el proyecto integrador Booking Prototipo (curso Integración de Sistemas, PUCE). Cumple el contrato `contracts/autos-openapi.yaml` provisto por la cátedra e incorpora un backoffice de administración, un mecanismo de eventos (webhooks) y un frontend de reserva completo.

## 1. Alcance

- **Backend** (`backend/`): API REST en NestJS + TypeORM + PostgreSQL, fiel al contrato OpenAPI del dominio Autos, más un módulo de administración y un despachador de eventos.
- **Frontend** (`frontend/`): SPA en React + Vite + Tailwind con el flujo completo de reserva (búsqueda → detalle → checkout → confirmación → modificar/cancelar) y un panel de administración (vehículos, agencias, órdenes).

## 2. Arquitectura

```
┌─────────────────┐      REST (JSON)      ┌───────────────────────────┐
│  Frontend React  │ ───────────────────▶ │   API NestJS (/api/v1)    │
│  (Vite + Router) │ ◀─────────────────── │                            │
└─────────────────┘                       │  ┌──────────────────────┐  │
                                           │  │ AutosController      │  │  ← 1:1 con autos-openapi.yaml
                                           │  │ (contrato público)   │  │
                                           │  └──────────┬───────────┘  │
                                           │             │              │
                                           │  ┌──────────▼───────────┐  │
                                           │  │ AutosService          │──┼──▶ TtlCacheService (search_token,
                                           │  │                       │  │      hold_id, order_preview_id)
                                           │  └──────────┬───────────┘  │
                                           │             │              │
                                           │  ┌──────────▼───────────┐  │        ┌─────────────────────┐
                                           │  │ WebhooksDispatcher    │──┼──HTTP─▶│ Sistemas externos    │
                                           │  │ Service (EDA)         │  │  POST  │ suscritos a eventos  │
                                           │  └───────────────────────┘  │        └─────────────────────┘
                                           │                            │
                                           │  ┌──────────────────────┐  │
                                           │  │ AdminController        │  │  ← backoffice, no es parte
                                           │  │ (/admin/...)           │  │    del contrato público
                                           │  └──────────┬───────────┘  │
                                           └─────────────┼──────────────┘
                                                          │
                                                   ┌──────▼──────┐
                                                   │  PostgreSQL │
                                                   └─────────────┘
```

El `AutosController` es fiel al contrato del curso (rutas planas: `/search`, `/orders/hold`, etc., sin prefijo de dominio, porque cada equipo corre su propia instancia). El `AdminController` vive aparte, bajo `/admin`, porque es tooling interno de gestión — no forma parte del contrato que se comparte con los demás grupos.

## 3. Modelo de datos

| Entidad | Tabla | Campos clave | Notas |
|---|---|---|---|
| `Vehicle` | `autos_vehicles` | `vehicle_id`, `make`, `model`, `car_type`, `transmission`, `price_per_day`, `supplier_id`, `depot_id` | Catálogo administrable; fuente de verdad para `/search` y `/details`. |
| `Depot` | `autos_depots` | `depot_id`, `name`, `city_id`, `airport`, `score` | Agencias de recogida/entrega. |
| `Supplier` | `autos_suppliers` | `supplier_id`, `name` | Proveedores de renta. |
| `Order` | `autos_orders` | `locator`, `status`, `vehicle_details` (jsonb), `route_details` (jsonb), `extras`, `total_price`, `currency` | Snapshot del vehículo/ruta al momento de la reserva; persiste el ciclo de vida completo (CONFIRMED/CANCELLED). |
| `WebhookSubscription` | `autos_webhook_subscriptions` | `url`, `events` (array), `secret` | Suscripciones a eventos de dominio. |

Las tablas se siembran automáticamente al arrancar (`AutosSeedService`, idempotente) con el catálogo inicial definido en `backend/src/modules/autos/data/mock-catalog.ts`.

Los estados efímeros del flujo de reserva (`search_token`, `hold_id`, `order_preview_id`) **no** se persisten en base de datos: viven en una caché en memoria con expiración (`TtlCacheService`), igual que lo haría un `search_token` de corta vida en un GDS real.

## 4. APIs

### 4.1 Contrato público (`contracts/autos-openapi.yaml`)

13 endpoints agrupados en 5 categorías: Búsqueda y Catálogo (`/search`, `/details`), Agencias y Proveedores (`/depots`, `/depots/reviews/scores`, `/suppliers`), Componentes Comunes (`/constants`), Gestión de Órdenes (`/orders/hold`, `/orders/preview`, `/orders/create`, `/orders/{id}`, `/orders/{id}/modify`, `/orders/{id}/cancel`) y Webhooks (`/webhooks`, `/webhooks/{id}`). Documentados en Swagger: `http://localhost:3000/api/docs`.

### 4.2 Backoffice de administración (no forma parte del contrato)

| Método | Ruta | Descripción |
|---|---|---|
| GET/POST | `/api/v1/admin/vehicles` | Listar / crear vehículos |
| PUT/DELETE | `/api/v1/admin/vehicles/:id` | Editar / eliminar un vehículo |
| GET/POST | `/api/v1/admin/depots` | Listar / crear agencias |
| PUT/DELETE | `/api/v1/admin/depots/:id` | Editar / eliminar una agencia |
| GET | `/api/v1/admin/orders` | Listar todas las órdenes (filtro opcional `?status=`) |
| GET | `/api/v1/admin/orders/:id` | Detalle administrativo de una orden |

Documentado en el mismo Swagger, bajo el tag **Administración**.

## 5. Diseño de eventos (SOA/EDA)

El sistema emite eventos de dominio cuando cambia el estado de una orden. El mecanismo de entrega reutiliza el CRUD de `Webhooks` ya definido en el contrato: cualquier sistema externo se suscribe con `POST /webhooks` indicando su URL y los eventos de interés.

| Evento | Disparado por | Estado |
|---|---|---|
| `CAR_ORDER_CONFIRMED` | `POST /orders/create` | ✅ Implementado (`WebhooksDispatcherService`) |
| `CAR_ORDER_CANCELLED` | `POST /orders/{id}/cancel` | ✅ Implementado |
| `DEPOT_UPDATE` | — | 📋 Documentado en `contracts/autos-asyncapi.yaml` como evolución futura; aún no se dispara desde ningún flujo. |

El envío es *best-effort* y asíncrono respecto a la respuesta HTTP: un webhook caído se registra en el log del servidor pero nunca bloquea ni hace fallar la operación que lo originó. El contrato formal de estos eventos está en `backend/contracts/autos-asyncapi.yaml` (AsyncAPI 2.6), complementario al OpenAPI.

## 6. Cómo correr el proyecto

### Backend
```bash
cd backend
npm install
cp .env.example .env   # ajustar DATABASE_URL si hace falta
docker compose up -d   # levanta Postgres
npm run start:dev
```
Swagger: `http://localhost:3000/api/docs`

### Frontend
```bash
cd frontend
npm install
npm run dev
```
App: `http://localhost:5173` (proxy configurado hacia el backend en `vite.config.ts`)

## 7. Limitaciones conocidas / alcance no cubierto

- **No hay despliegue en la nube**: el sistema corre localmente. Pendiente como siguiente paso.
- **Seguridad simplificada**: no existe un servidor de autorización OAuth2 real; el guard de scopes (`ScopesGuard`) solo exige la presencia de un header `Authorization: Bearer`, sin validar firma ni claims. El contrato documenta los scopes reales (`autos:read`, `autos:book`, `autos:cancel`, `autos:webhooks`) vía Swagger para fines de interoperabilidad.
- El evento `DEPOT_UPDATE` está documentado pero no implementado (ver sección 5).
