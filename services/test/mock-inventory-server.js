/**
 * Servidor de prueba del InventoryStockService de Booking Prototipo (contracts/proto/inventory/inventory.proto).
 * Sirve para verificar localmente que el nodo de Autos empuja su stock por gRPC:
 *   node test/mock-inventory-server.js [puerto]        (por defecto 50999)
 *   INVENTORY_GRPC_URL=127.0.0.1:50999 en el servicio de Reservas
 * Imprime cada mensaje recibido y valida el contrato (fecha YYYY-MM-DD, franja HH:00|HH:30, unidades 0|1).
 */
const grpc = require('@grpc/grpc-js');
const loader = require('@grpc/proto-loader');
const path = require('path');

const def = loader.loadSync(path.join(__dirname, '..', '..', 'contracts', 'proto', 'inventory', 'inventory.proto'), {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
});
const { InventoryStockService } = grpc.loadPackageDefinition(def).inventory;
const port = process.argv[2] || 50999;

const valid = (m) => /^\d{4}-\d{2}-\d{2}$/.test(m.date) && /^\d{2}:(00|30)$/.test(m.time_slot) && [0, 1].includes(m.available_units);
let streamed = 0;

const server = new grpc.Server();
server.addService(InventoryStockService.service, {
  PushStockUpdate(call, cb) {
    const m = call.request;
    console.log(`PUSH   ${m.service_id} ${m.item_id} ${m.date} ${m.time_slot} unidades=${m.available_units} ${valid(m) ? 'OK' : 'INVÁLIDO'}`);
    cb(null, { success: valid(m), message: valid(m) ? 'stock actualizado' : 'mensaje inválido', processed_at: String(Date.now()) });
  },
  StreamInventoryChanges(call, cb) {
    let total = 0;
    call.on('data', (e) => { total++; streamed++; if (total <= 3) console.log(`STREAM ${e.service_id} ${e.item_id} ${e.date} ${e.time_slot} delta=${e.delta}`); });
    call.on('end', () => { console.log(`STREAM fin: ${total} eventos`); cb(null, { total_events_processed: total, is_synchronized: true, last_sync_hash: 'mock-' + total }); });
  },
});
server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err) => {
  if (err) throw err;
  console.log(`InventoryStockService (mock) escuchando en :${port}`);
});
