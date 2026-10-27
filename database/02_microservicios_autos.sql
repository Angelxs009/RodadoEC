-- ============================================================================
-- RodadoEc · Dominio AUTOS — Modelo de datos unificado (PostgreSQL 14+)
-- Script maestro: 02_microservicios_autos.sql
-- ============================================================================
-- Patrón Database-per-Service: cada microservicio es dueño de su propio SCHEMA y ningún servicio
-- lee las tablas de otro (se comunican por gRPC/REST, con IDs lógicos, SIN llaves foráneas entre schemas).
--
--   catalog   → ms_catalog / ms_inventory : vehículos (máquina de 6 estados), agencias, proveedores, bitácora de mantenimiento
--   booking   → ms_order / ms_counter     : órdenes de renta, webhooks, outbox de eventos (CloudEvents), acuerdo B2B de promociones
--   payments  → pagos                     : pagos simulados (nunca se guarda el número completo de tarjeta ni el CVV)
--   identity  → ms_identity               : administradores y clientes (roles CLIENTE, ADMIN, MANTENIMIENTO)
--
-- Uso:
--   createdb rodadoec                       (o:  psql -U postgres -c "CREATE DATABASE rodadoec;")
--   psql -d rodadoec -f 02_microservicios_autos.sql
--   DATABASE_URL=postgresql://usuario:clave@localhost:5432/rodadoec
--
-- Para separar en 4 BASES distintas en vez de 4 schemas: ejecutar cada bloque ">>> SERVICIO" en su propia
-- base, quitando el prefijo del schema y las líneas CREATE SCHEMA.
-- Es idempotente: se puede ejecutar varias veces (CREATE ... IF NOT EXISTS y ON CONFLICT DO NOTHING).
-- Estados del auto (catalog.vehicles.status): AVAILABLE=DISPONIBLE, RESERVED=RESERVADO,
--   READY_FOR_DELIVERY=LISTO_PARA_ENTREGAR, DELIVERED=ENTREGADO, CLEANING=EN_LIMPIEZA (cooldown 2 h), MAINTENANCE=EN_MANTENIMIENTO.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS booking;
CREATE SCHEMA IF NOT EXISTS payments;
CREATE SCHEMA IF NOT EXISTS identity;

-- >>> SERVICIO: catalog ------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalog.suppliers (
  id           SERIAL PRIMARY KEY,
  supplier_id  INTEGER      NOT NULL UNIQUE,
  name         VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog.depots (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  depot_id  INTEGER      NOT NULL UNIQUE,
  name      VARCHAR(200) NOT NULL,
  city_id   INTEGER      NOT NULL,          -- 1 Quito · 2 Guayaquil · 3 Cuenca
  airport   VARCHAR(10),                    -- código IATA (UIO, GYE, CUE) o NULL
  score     NUMERIC(3,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS catalog.vehicles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id           VARCHAR(50)   NOT NULL UNIQUE,   -- id público (veh-001)
  make                 VARCHAR(100)  NOT NULL,
  model                VARCHAR(100)  NOT NULL,
  car_type             VARCHAR(50)   NOT NULL,          -- Compacto | Sedan | SUV
  transmission         VARCHAR(50)   NOT NULL,          -- Manual | Automatica
  doors                INTEGER       NOT NULL,
  bag_capacity         INTEGER       NOT NULL,
  seats                INTEGER       NOT NULL,
  price_per_day        NUMERIC(10,2) NOT NULL,
  supplier_id          INTEGER       NOT NULL,          -- ID lógico → catalog.suppliers.supplier_id
  depot_id             INTEGER       NOT NULL,          -- ID lógico → catalog.depots.depot_id
  image_url            VARCHAR(300),
  min_driver_age       INTEGER,                         -- NULL = 18 (mayoría de edad en Ecuador)
  status               VARCHAR(20)   NOT NULL DEFAULT 'AVAILABLE',
  odometer_km          INTEGER       NOT NULL DEFAULT 0,
  next_maintenance_km  INTEGER       NOT NULL DEFAULT 10000,
  available_from       TIMESTAMPTZ,                     -- fin del cooldown de limpieza (EN_LIMPIEZA)
  CONSTRAINT vehicles_status_chk CHECK (status IN
    ('AVAILABLE','RESERVED','READY_FOR_DELIVERY','DELIVERED','CLEANING','MAINTENANCE'))
);
CREATE INDEX IF NOT EXISTS vehicles_status_idx ON catalog.vehicles (status);
CREATE INDEX IF NOT EXISTS vehicles_depot_idx  ON catalog.vehicles (depot_id);

CREATE TABLE IF NOT EXISTS catalog.maintenance_log (
  id                SERIAL PRIMARY KEY,                 -- bitácora BIT-AUTO-<id>
  vehicle_id        VARCHAR(50)  NOT NULL,              -- ID lógico → catalog.vehicles.vehicle_id
  technician_id     VARCHAR(100) NOT NULL,
  odometer_km       INTEGER      NOT NULL,
  fuel_level        INTEGER      NOT NULL,
  body_condition    VARCHAR(300),
  tires_condition   VARCHAR(100),
  notes             VARCHAR(500),
  maintenance_done  BOOLEAN      NOT NULL DEFAULT FALSE,
  alert             BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- >>> SERVICIO: booking ------------------------------------------------------
CREATE TABLE IF NOT EXISTS booking.orders (
  id                 UUID PRIMARY KEY,
  locator            VARCHAR(30)   NOT NULL UNIQUE,     -- PNR de 8 caracteres: CAR + 5
  status             VARCHAR(20)   NOT NULL DEFAULT 'CONFIRMED',  -- CONFIRMED | CANCELLED | PENDING | ENTREGADO | COMPLETADA
  vehicle_details    JSONB         NOT NULL,            -- instantánea del auto (sin depender de catalog)
  route_details      JSONB         NOT NULL,
  driver_details     JSONB,
  extras             JSONB         NOT NULL DEFAULT '[]',
  total_price        NUMERIC(10,2) NOT NULL,
  currency           VARCHAR(3)    NOT NULL,
  payment_reference  VARCHAR(100),                      -- ID lógico → payments.payments.reference
  customer_id        VARCHAR(50),                       -- ID lógico → identity.customers.id (NULL = invitado)
  creation_date      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  coverage_type      VARCHAR(10)   NOT NULL DEFAULT 'BASICA',      -- BASICA | TOTAL
  deposit            NUMERIC(10,2) NOT NULL DEFAULT 0,
  pricing            JSONB,                             -- {days, base, coverage, surcharge}
  checkin_at         TIMESTAMPTZ,
  delivered_at       TIMESTAMPTZ,
  returned_at        TIMESTAMPTZ,
  km_salida          INTEGER,
  km_retorno         INTEGER,
  refund             JSONB                              -- {refund_id, amount, currency, percentage, status}
);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON booking.orders (customer_id);
CREATE INDEX IF NOT EXISTS orders_status_idx   ON booking.orders (status);

CREATE TABLE IF NOT EXISTS booking.webhook_subscriptions (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url     VARCHAR(500) NOT NULL,
  events  JSONB        NOT NULL,
  secret  VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS booking.webhook_deliveries (   -- los FAILED son los "dead letters"
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  VARCHAR(50)  NOT NULL,
  url              VARCHAR(500) NOT NULL,
  event_id         VARCHAR(50)  NOT NULL,
  event_type       VARCHAR(50)  NOT NULL,
  correlation_id   VARCHAR(50),
  status           VARCHAR(20)  NOT NULL,                -- DELIVERED | FAILED
  attempts         INTEGER      NOT NULL,
  last_error       VARCHAR(300),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS booking.outbox_events (        -- Transactional Outbox (GET /autos/eventos → RabbitMQ / Kafka)
  seq             SERIAL PRIMARY KEY,
  event_id        VARCHAR(60)  NOT NULL UNIQUE,           -- evt-car-ord-xxxxxx
  type            VARCHAR(120) NOT NULL,                  -- ec.edu.epn.booking.autos.order.confirmed …
  correlation_id  VARCHAR(60),
  data            JSONB        NOT NULL,
  time            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  published_at    TIMESTAMPTZ                             -- NULL = pendiente de publicar en los brokers
);

CREATE TABLE IF NOT EXISTS booking.promo_contract (       -- Acuerdo B2B de promociones y combos (Cátedra RDA2 §9): una sola fila
  id                       INTEGER PRIMARY KEY,
  allows_promotions        BOOLEAN       NOT NULL DEFAULT TRUE,
  max_discount_percentage  NUMERIC(5,2)  NOT NULL DEFAULT 15,
  enabled_destinations     JSONB         NOT NULL DEFAULT '[]',
  valid_until              VARCHAR(10),
  combo_conditions         VARCHAR(500)
);

-- >>> SERVICIO: payments -----------------------------------------------------
CREATE TABLE IF NOT EXISTS payments.payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference         VARCHAR(30)   NOT NULL UNIQUE,         -- PAY-XXXXXXXXXX
  status            VARCHAR(20)   NOT NULL,                -- APPROVED | DECLINED | REFUNDED
  amount            NUMERIC(10,2) NOT NULL,
  currency          VARCHAR(3)    NOT NULL,
  order_preview_id  VARCHAR(50)   NOT NULL,
  card_brand        VARCHAR(20)   NOT NULL,                -- VISA | MASTERCARD | AMEX | B2B
  card_last4        VARCHAR(4)    NOT NULL,
  cardholder_name   VARCHAR(100)  NOT NULL,
  decline_reason    VARCHAR(200),
  order_id          VARCHAR(50),                           -- ID lógico → booking.orders.id (un pago = una orden)
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- >>> SERVICIO: identity -----------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.admins (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username       VARCHAR(60)  NOT NULL UNIQUE,
  password_hash  VARCHAR(200) NOT NULL,
  first_name     VARCHAR(100),
  last_name      VARCHAR(100),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity.customers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          VARCHAR(180) NOT NULL UNIQUE,
  password_hash  VARCHAR(200) NOT NULL,
  first_name     VARCHAR(100) NOT NULL,
  last_name      VARCHAR(100) NOT NULL,
  phone_number   VARCHAR(30),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
-- El administrador de arranque NO está en la base: se define por entorno (ADMIN_USERNAME / ADMIN_PASSWORD).

-- ============================================================================
-- DATOS INICIALES (siembra idempotente: no pisa ediciones hechas después)
-- ============================================================================

INSERT INTO catalog.suppliers (supplier_id, name) VALUES
  (1, 'Localiza Ecuador'),
  (2, 'Hertz Quito'),
  (3, 'Avis Guayaquil')
ON CONFLICT (supplier_id) DO NOTHING;

INSERT INTO catalog.depots (depot_id, name, city_id, airport, score) VALUES
  (100, 'Aeropuerto Mariscal Sucre (UIO)', 1, 'UIO', 4.6),
  (101, 'Centro Histórico Quito', 1, NULL, 4.2),
  (200, 'Aeropuerto José Joaquín de Olmedo (GYE)', 2, 'GYE', 4.4),
  (201, 'Urdesa — Guayaquil Norte', 2, NULL, 4.3),
  (300, 'Centro Cuenca', 3, NULL, 4),
  (301, 'Aeropuerto Mariscal Lamar (CUE)', 3, 'CUE', 4.1)
ON CONFLICT (depot_id) DO NOTHING;

INSERT INTO catalog.vehicles
  (vehicle_id, make, model, car_type, transmission, doors, bag_capacity, seats, price_per_day, supplier_id, depot_id, image_url, min_driver_age, odometer_km) VALUES
  ('veh-001', 'Chevrolet', 'Spark GT', 'Compacto', 'Manual', 4, 2, 4, 28, 1, 100, '/cars/veh-001.jpg', 18, 1500),
  ('veh-002', 'Kia', 'Rio', 'Sedan', 'Automatica', 4, 3, 5, 35, 2, 100, '/cars/veh-002.jpg', 18, 3373),
  ('veh-003', 'Toyota', 'RAV4', 'SUV', 'Automatica', 4, 4, 5, 65, 2, 100, '/cars/veh-003.jpg', 18, 5246),
  ('veh-004', 'Hyundai', 'Accent', 'Sedan', 'Manual', 4, 3, 5, 32, 3, 200, '/cars/veh-004.jpg', 18, 7119),
  ('veh-005', 'Ford', 'Explorer', 'SUV', 'Automatica', 4, 5, 7, 89, 1, 300, '/cars/veh-005.jpg', 18, 8992),
  ('veh-006', 'Volkswagen', 'Gol', 'Compacto', 'Manual', 4, 2, 4, 27, 3, 101, '/cars/veh-006.jpg', 18, 2665),
  ('veh-007', 'Nissan', 'Versa', 'Sedan', 'Automatica', 4, 3, 5, 38, 1, 101, '/cars/veh-007.jpg', 18, 4538),
  ('veh-008', 'Jeep', 'Renegade', 'SUV', 'Automatica', 4, 4, 5, 72, 2, 300, '/cars/veh-008.jpg', 18, 6411),
  ('veh-009', 'Chevrolet', 'Sail', 'Sedan', 'Manual', 4, 3, 5, 30, 1, 201, '/cars/veh-009.jpg', 18, 8284),
  ('veh-010', 'Chevrolet', 'Tracker', 'SUV', 'Automatica', 4, 4, 5, 58, 1, 101, '/cars/veh-010.jpg', 18, 1957),
  ('veh-011', 'Kia', 'Picanto', 'Compacto', 'Manual', 4, 2, 4, 26, 2, 101, '/cars/veh-011.jpg', 18, 3830),
  ('veh-012', 'Kia', 'Sportage', 'SUV', 'Automatica', 4, 4, 5, 70, 2, 100, '/cars/veh-012.jpg', 18, 5703),
  ('veh-013', 'Kia', 'Seltos', 'SUV', 'Automatica', 4, 4, 5, 62, 2, 300, '/cars/veh-013.jpg', 18, 7576),
  ('veh-014', 'Hyundai', 'i10', 'Compacto', 'Manual', 4, 2, 4, 25, 3, 200, '/cars/veh-014.jpg', 18, 9449),
  ('veh-015', 'Hyundai', 'Tucson', 'SUV', 'Automatica', 4, 4, 5, 75, 3, 201, '/cars/veh-015.jpg', 18, 3122),
  ('veh-016', 'Hyundai', 'Creta', 'SUV', 'Automatica', 4, 4, 5, 60, 3, 101, '/cars/veh-016.jpg', 18, 4995),
  ('veh-017', 'Toyota', 'Yaris', 'Sedan', 'Automatica', 4, 3, 5, 36, 2, 300, '/cars/veh-017.jpg', 18, 6868),
  ('veh-018', 'Toyota', 'Corolla', 'Sedan', 'Automatica', 4, 3, 5, 45, 2, 100, '/cars/veh-018.jpg', 18, 8741),
  ('veh-019', 'Toyota', 'Fortuner', 'SUV', 'Automatica', 4, 5, 7, 95, 1, 200, '/cars/veh-019.jpg', 18, 2414),
  ('veh-020', 'Nissan', 'Kicks', 'SUV', 'Automatica', 4, 3, 5, 55, 1, 201, '/cars/veh-020.jpg', 18, 4287),
  ('veh-021', 'Nissan', 'Sentra', 'Sedan', 'Automatica', 4, 3, 5, 42, 3, 301, '/cars/veh-021.jpg', 18, 6160),
  ('veh-022', 'Mazda', '3', 'Sedan', 'Automatica', 4, 3, 5, 48, 2, 200, '/cars/veh-022.jpg', 18, 8033),
  ('veh-023', 'Mazda', 'CX-5', 'SUV', 'Automatica', 4, 4, 5, 78, 2, 301, '/cars/veh-023.jpg', 18, 1706),
  ('veh-024', 'Suzuki', 'Swift', 'Compacto', 'Manual', 4, 2, 4, 28, 3, 201, '/cars/veh-024.jpg', 18, 3579),
  ('veh-025', 'Suzuki', 'Vitara', 'SUV', 'Automatica', 4, 3, 5, 56, 3, 200, '/cars/veh-025.jpg', 18, 5452),
  ('veh-026', 'Renault', 'Sandero', 'Compacto', 'Manual', 4, 3, 5, 24, 1, 300, '/cars/veh-026.jpg', 18, 7325),
  ('veh-027', 'Renault', 'Duster', 'SUV', 'Manual', 4, 4, 5, 50, 1, 301, '/cars/veh-027.jpg', 18, 9198),
  ('veh-028', 'Volkswagen', 'Polo', 'Compacto', 'Manual', 4, 3, 5, 31, 3, 201, '/cars/veh-028.jpg', 18, 2871),
  ('veh-029', 'Honda', 'CR-V', 'SUV', 'Automatica', 4, 4, 5, 82, 2, 200, '/cars/veh-029.jpg', 18, 4744),
  ('veh-030', 'Ford', 'Escape', 'SUV', 'Automatica', 4, 4, 5, 68, 1, 100, '/cars/veh-030.jpg', 18, 6617),
  ('veh-031', 'Peugeot', '208', 'Compacto', 'Manual', 4, 2, 5, 29, 3, 301, '/cars/veh-031.jpg', 18, 8490)
ON CONFLICT (vehicle_id) DO NOTHING;

INSERT INTO booking.promo_contract (id, allows_promotions, max_discount_percentage, enabled_destinations, valid_until, combo_conditions)
VALUES (1, TRUE, 15, '["Quito","Guayaquil","Cuenca"]', '2026-12-31', 'Descuento autorizado del 15% en combos multivertical con hotel o vuelo.')
ON CONFLICT (id) DO NOTHING;

-- Verificación rápida:
--   SELECT status, count(*) FROM catalog.vehicles GROUP BY status;     -- 31 autos AVAILABLE
--   SELECT count(*) FROM catalog.depots;                               -- 6 agencias
