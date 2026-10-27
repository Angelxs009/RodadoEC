# Guía de integración local (Booking ↔ RodadoEc)

Prueba 100% en local: el Booking llama a tu máquina por la red privada de Tailscale. Nada depende de Render.

## 1. Antes de la reunión (una sola vez)

1. **Levanta el sistema** (la primera vez tarda unos minutos porque construye las imágenes):
   ```bash
   docker compose up -d --build
   curl http://localhost:3000/api/v2/autos/health     # debe responder "status": "HEALTHY"
   ```
2. **Instala Tailscale** e inicia sesión: `winget install Tailscale.Tailscale` (o desde tailscale.com/download).
   Tu IP privada es la que muestra `tailscale ip -4` (empieza por `100.`).
3. **Abre el puerto 3000 en el firewall de Windows** (PowerShell como administrador). Sin esto, tu propia máquina funciona pero
   las de tus compañeros reciben "connection refused / timed out":
   ```powershell
   New-NetFirewallRule -DisplayName "RodadoEc gateway 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Any
   ```
4. El gateway ya escucha en `0.0.0.0:3000` (no solo en localhost). Comprobación desde otra máquina:
   `curl http://<tu-ip-tailscale>:3000/api/v2/autos/health`.

## 2. Qué compartir con el Booking

| Dato | Valor |
|---|---|
| URL base del contrato v2 | `http://<tu-ip-tailscale>:3000/api/v2` |
| Swagger del contrato (probar desde el navegador) | `http://<tu-ip-tailscale>:3000/api/docs-v2` |
| Salud del nodo (semáforo del Panel 1) | `GET /api/v2/autos/health` |
| Cabeceras obligatorias en mutaciones | `Idempotency-Key` (UUID v4); opcional `X-Correlation-Id` |
| Seguridad | apagada por defecto. Para exigir JWT o clave: `AUTH_ENFORCE_V2=true BOOKING_API_KEY=<clave> docker compose up -d`; el Booking envía `X-API-Key` |

Prueba rápida (cambia las fechas por futuras):

```bash
curl -X POST http://<ip>:3000/api/v2/autos/search -H "Content-Type: application/json" \
  -d '{"pickup_location":"UIO","pickup_date":"2026-12-10","pickup_time":"10:00","dropoff_date":"2026-12-13","dropoff_time":"10:00","driver_age":32}'
```

## 3. Que RodadoEc le hable al Booking (dirección contraria)

Cuando el Booking te pase su IP de Tailscale (`<ip-booking>`), reinicia indicando dónde están sus servicios:

```bash
INVENTORY_GRPC_URL=<ip-booking>:50051 \
RABBITMQ_URL=amqp://usuario:clave@<ip-booking>:5672 \
KAFKA_BROKERS=<ip-booking>:9092 \
INVENTORY_SYNC_ON_START=true \
docker compose up -d
```

- `INVENTORY_GRPC_URL`: stock por gRPC (`PushStockUpdate` en cada cambio; con `INVENTORY_SYNC_ON_START=true` también envía toda la flota al arrancar).
  Sincronización manual cuando quieras: `curl -X POST http://localhost:3000/api/v1/admin/inventory/sync`.
- `RABBITMQ_URL` / `KAFKA_BROKERS`: eventos CloudEvents (`booking.events` y `topic-ordenes-b2b`). Déjalas vacías si no usan esos brokers.
  Los eventos también están siempre disponibles en `GET /api/v2/autos/eventos`.

## 4. Si aparece un error durante la prueba

| Síntoma | Causa y arreglo |
|---|---|
| `400` con `pickup_date: no puede ser en el pasado` | El ejemplo del contrato usa fechas de octubre. Usa fechas futuras, o arranca con `ALLOW_PAST_DATES=true docker compose up -d` |
| `409 VEHICLE_IN_CLEANING_COOLDOWN` | Es correcto: el auto devuelto queda 2 h en limpieza. Para volver a probar con la flota completa: `docker compose down -v && docker compose up -d` |
| `409` al reservar un auto | Ya está reservado (correcto). Elige otro de `GET /api/v2/autos` |
| `401` / `403` | `AUTH_ENFORCE_V2` está activo: enviar `X-API-Key`; para mantenimiento, `X-Role: MANTENIMIENTO` o `ADMIN` |
| `503` en `/autos/health` | Algún servicio interno cayó: `docker compose ps` y `docker compose logs <servicio>` |
| Connection refused desde otra máquina | Falta la regla de firewall del paso 1.3, o Tailscale no está conectado (`tailscale status`) |

## 5. Ver lo que pasa (para depurar con el Booking)

```bash
docker compose logs -f gateway booking      # cada petición con su X-Correlation-Id
```

Pídele al Booking que envíe `X-Correlation-Id`: aparece en los logs de todos los servicios y en los eventos, así se sigue una petición de punta a punta.
