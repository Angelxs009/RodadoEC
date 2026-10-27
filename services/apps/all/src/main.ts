/**
 * Arranque de TODO el sistema en un solo proceso de Node (para hosting con una sola instancia pequeña, p. ej.
 * Render gratis: 512 MB y sin gRPC entre servicios a través de su proxy público).
 *
 * La arquitectura NO cambia: Catálogo, Pagos, Identidad y Reservas siguen siendo aplicaciones Nest separadas,
 * con su propio módulo, su propio schema de base de datos y su servidor gRPC; el gateway las llama por gRPC en
 * 127.0.0.1. Solo comparten proceso y el puerto público (el del gateway, $PORT).
 */
process.env.NO_SERVICE_HTTP = process.env.NO_SERVICE_HTTP ?? 'true';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await import('../../identity/src/main');
  await import('../../catalog/src/main');
  await import('../../payments/src/main');
  await sleep(4000);
  await import('../../booking/src/main'); // Reservas llama a Catálogo y Pagos
  await sleep(4000);
  await import('../../gateway/src/main'); // el gateway abre el puerto público
}
main().catch((err) => {
  console.error('No se pudo arrancar el sistema:', err);
  process.exit(1);
});
