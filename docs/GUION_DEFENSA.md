# Guion de defensa — RodadoEc (Reto 2)

Duración sugerida: **8–10 minutos de demostración** y el resto para preguntas. Todo lo que se muestra está en internet.

## Antes de empezar (2 minutos antes de tu turno)

1. Abre `https://rodadoec-api.onrender.com/warmup` y espera a que diga `"status":"ok"` con los 4 servicios `up`. El plan gratuito se
   duerme a los 15 minutos y el primer arranque tarda; así la demo no se queda esperando.
2. Ten abiertas estas pestañas: el sitio `https://rodado-ec.vercel.app`, el Swagger `https://rodadoec-api.onrender.com/api/docs-v3`,
   el repositorio de GitHub y el informe (`docs/INFORME_TECNICO.md`).
3. Ten a mano la contraseña del admin (está en tu `.env`, no en el repositorio) y una terminal con el proyecto.

## Demostración (orden recomendado)

**1. Qué es y qué se hizo (1 min).** "RodadoEc es la tienda de renta de autos que se integra al Booking Prototipo. Partimos de un monolito
y lo migramos a cuatro microservicios con base de datos propia detrás de un API Gateway, cumpliendo el contrato oficial del agregador."
Muestra el diagrama del informe (sección 2).

**2. La arquitectura en el código (1 min).** En GitHub, carpeta `services/apps`: gateway, catalog, booking, payments, identity.
"Cada servicio tiene su módulo, su servidor gRPC y su schema; ninguno lee las tablas de otro." Abre `database/02_microservicios_autos.sql`.

**3. El flujo de compra en el sitio (2 min).** En `rodado-ec.vercel.app`: busca en Quito, elige un auto, paga con la tarjeta de prueba
`4242 4242 4242 4242` y confirma. Aquí se ve el sistema completo funcionando de extremo a extremo.
Variante de falla: paga con `4000 0000 0000 0002` (fondos insuficientes) y muestra que **no se crea la reserva**.

**4. El contrato oficial y su verificación (2 min).** En Swagger `/api/docs-v3`: "este es el contrato que publicó el agregador, copiado
sin modificar". Ejecuta `GET /autos/health` (semáforo del nodo). Después en la terminal:
`GATEWAY_URL=https://rodadoec-api.onrender.com npm run test:integration --prefix services`
y señala que **cada respuesta se valida contra el propio YAML** y que se ejercitan las 19 operaciones. Resultado: 49 de 49.

**5. La saga y la máquina de estados (2 min).** En Swagger o con curl, en este orden:
`POST /autos/orders/create` (el auto pasa a RESERVADO) → intentar reservarlo otra vez (`409 VEHICLE_UNAVAILABLE`) →
`POST /autos/orders/{pnr}/cancel` (reembolso del 100% y el auto vuelve a DISPONIBLE). Menciona que si un paso de la saga falla, los
anteriores se compensan.

**6. Cooldown de 2 horas (1 min).** Entrega y devuelve un auto (`checkin-entrega` y `checkin-devolucion`): queda `EN_LIMPIEZA`, desaparece
de `GET /autos` y aparece en `GET /autos/flota` con el cronómetro.

**7. Trazabilidad (30 s).** Muestra que la respuesta trae `X-Correlation-Id` y que el mismo identificador sale en los logs y en los
eventos (`GET /autos/eventos`).

## Preguntas probables y cómo responderlas

**¿Por qué todo corre en un solo servicio de Render si es "microservicios"?**
Lo intentamos con cinco servicios y no funcionó: el proxy de Render entrega las peticiones como HTTP/1.x y gRPC necesita HTTP/2, así que
cada llamada gRPC entre servicios devolvía 502 (lo comprobamos con una llamada directa). El plan gratuito tampoco ofrece red privada.
Dejamos los cinco módulos como aplicaciones separadas (módulo, schema y servidor gRPC propios) dentro de un mismo proceso. La arquitectura y
el código son los mismos y el despliegue con cinco servicios sigue en `render.distribuido.yaml` para un host que soporte gRPC.
*(Sé honesto: en esa instancia comparten proceso y no escalan por separado. Es una limitación del hosting, no del diseño.)*

**¿Cómo garantizan que no se reserve dos veces el mismo auto?**
La reserva del auto es una operación atómica en base de datos (`UPDATE ... WHERE status = 'AVAILABLE'`): solo una petición logra el cambio.
Además, la clave `Idempotency-Key` evita duplicados por reintentos de red.

**¿Qué pasa si falla un paso de la reserva?**
Es una saga orquestada por el servicio de Reservas: reservar auto → consumir pago → guardar orden. Si el pago falla se libera el auto; si
guardar la orden falla se libera el auto y se reembolsa el pago. Cancelar también compensa.

**¿Qué pasa si se cae un servicio?**
Cada llamada gRPC tiene timeout de 5 s y un circuit breaker: tras 5 fallos seguidos el circuito se abre y las llamadas fallan rápido con 503.
Para lecturas, el catálogo se sirve desde la última copia válida con `X-Data-Source: fallback-cache`. Los eventos usan un outbox con
reintentos: si un broker está caído, no se pierde ninguno (lo probamos deteniendo RabbitMQ).

**¿Por qué gRPC por dentro y REST por fuera?**
gRPC (contratos `.proto` tipados y versionados) es eficiente y estricto entre servicios; REST es el contrato que exige el agregador y lo que
consume el navegador. El gateway traduce entre ambos y también publica GraphQL para el agregador.

**¿Cómo versionan los contratos y qué pasa si cambian?**
Versionado semántico: agregar es compatible; quitar o cambiar un tipo exige un contrato nuevo. El verificador `check-compat.js` compara
contra una línea base y falla si algo se rompe. Cuando el agregador pasó de v2 a v3 y luego añadió alias, medimos el impacto exacto con el
verificador y con la suite de conformidad, que valida cada respuesta contra el YAML.

**¿Cómo es la seguridad?**
JWT HS256 con secretos distintos para admin y clientes, roles `ADMIN`, `CLIENTE` y `MANTENIMIENTO`, clave M2M `X-API-Key`, panel de admin
protegido en producción con credenciales propias, tarjetas validadas con Luhn sin guardar número ni CVV, webhooks firmados con HMAC y CORS
por lista. Los candados de las rutas del contrato v3 están apagados por defecto para que el agregador pruebe sin clave; se activan con una
variable de entorno (`AUTH_ENFORCE_V2`). *(Si te lo preguntan de frente: es una decisión de facilidad de integración, no una carencia.)*

**¿Por qué cada servicio tiene su base y no una compartida?**
Para que ningún servicio dependa de las tablas de otro. Usamos una sola instancia de PostgreSQL con un schema por servicio porque el plan
gratuito solo ofrece una base; el script `02_microservicios_autos.sql` permite separarlas en bases distintas sin cambiar el código.

**¿Qué falta o qué mejorarían?**
Confirmar con el agregador el cuerpo exacto del respaldo REST del stock (implementado pero basado en una suposición: los mismos campos del mensaje
gRPC; desde Render no se llega a su puerto 50051). También escalar los módulos por separado en un host con soporte de gRPC, y reemplazar la
pasarela simulada por una real.

## Si algo falla en la demo

| Síntoma | Qué hacer |
|---|---|
| La API tarda mucho en responder | Está despertando (plan gratuito). Espera 30–60 s y repite; `/warmup` confirma cuando está lista |
| `/warmup` dice `degraded` | Espera unos segundos y repite; los módulos arrancan en cadena |
| El sitio no carga autos | Comprueba `https://rodadoec-api.onrender.com/autos/health`; si responde, recarga con Ctrl+F5 |
| `409` al reservar un auto | Es correcto: ya está reservado o en limpieza. Elige otro de `GET /autos` |
| Falla el login de admin | La contraseña está en tu `.env` (`ADMIN_PASSWORD`), usuario `admin` |
