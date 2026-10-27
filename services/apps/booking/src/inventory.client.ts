import { Injectable, Logger } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { protoDir } from '@autos/common';

const TZ = 'America/Guayaquil';
const DEADLINE_MS = 5000;

/** Fecha (YYYY-MM-DD) y franja de 30 min (HH:00 | HH:30) de un instante, en hora de Ecuador. */
export function localDateSlot(d: Date): { date: string; slot: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, slot: `${get('hour')}:${Number(get('minute')) >= 30 ? '30' : '00'}` };
}

/** Fecha y franja tal como se escribieron en un datetime ISO ("2026-11-10T10:00:00-05:00" → 2026-11-10 · 10:00). */
export function dateSlotOfIso(iso: string): { date: string; slot: string } {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(iso ?? '');
  if (!m) return localDateSlot(new Date());
  return { date: m[1], slot: `${m[2]}:${Number(m[3]) >= 30 ? '30' : '00'}` };
}

/**
 * Cliente del servicio gRPC de stock del agregador Booking Prototipo (contrato inventory.proto, §2.1 del
 * contrato v2): cada cambio de disponibilidad de un auto se empuja a Booking en tiempo real.
 * Se activa con INVENTORY_GRPC_URL (p. ej. booking.epn.edu.ec:50051); sin ella queda desactivado.
 * Nunca hace fallar la operación de negocio que lo dispara: los errores solo se registran.
 */
@Injectable()
export class InventoryClient {
  private readonly logger = new Logger(InventoryClient.name);
  private client: any;

  get enabled(): boolean {
    return !!process.env.INVENTORY_GRPC_URL;
  }

  private get nodeId(): string {
    return process.env.NODE_ID ?? 'NODE_AUT_LOCAL';
  }

  private getClient(): any {
    if (!this.client) {
      const def = protoLoader.loadSync(join(protoDir(), 'inventory', 'inventory.proto'), {
        keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
      });
      const pkg = (grpc.loadPackageDefinition(def) as any).inventory;
      const tls = /^(1|true)$/i.test(process.env.INVENTORY_GRPC_TLS ?? '');
      this.client = new pkg.InventoryStockService(
        process.env.INVENTORY_GRPC_URL!,
        tls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure(),
      );
    }
    return this.client;
  }

  /** PushStockUpdate: 1 unidad si el auto está DISPONIBLE, 0 si queda RESERVADO o EN_LIMPIEZA. */
  async pushStock(itemId: string, date: string, timeSlot: string, available: boolean): Promise<void> {
    if (!this.enabled) return;
    const msg = {
      service_id: this.nodeId,
      item_id: itemId,
      date,
      time_slot: timeSlot,
      available_units: available ? 1 : 0,
      timestamp: String(Date.now()),
    };
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const ack: any = await new Promise((resolve, reject) =>
          this.getClient().PushStockUpdate(msg, { deadline: Date.now() + DEADLINE_MS }, (err: Error | null, res: unknown) =>
            err ? reject(err) : resolve(res),
          ),
        );
        if (ack?.success) return;
        this.logger.warn(`Booking rechazó el stock de ${itemId}: ${ack?.message}`);
        return;
      } catch (err) {
        if (attempt === 2) this.logger.warn(`No se pudo sincronizar el stock de ${itemId} con Booking: ${(err as Error).message}`);
      }
    }
  }

  /** StreamInventoryChanges: sincronización masiva de la flota completa (delta +1 disponible / -1 no disponible). */
  async streamFleet(items: { itemId: string; available: boolean }[]): Promise<{ total: number; synchronized: boolean } | null> {
    if (!this.enabled) return null;
    const { date, slot } = localDateSlot(new Date());
    return new Promise((resolve) => {
      const stream = this.getClient().StreamInventoryChanges({ deadline: Date.now() + 30000 }, (err: Error | null, summary: any) => {
        if (err) {
          this.logger.warn(`Sincronización masiva falló: ${err.message}`);
          return resolve(null);
        }
        resolve({ total: summary.total_events_processed, synchronized: summary.is_synchronized });
      });
      for (const it of items) {
        stream.write({
          event_id: randomUUID(),
          service_id: this.nodeId,
          item_id: it.itemId,
          date,
          time_slot: slot,
          delta: it.available ? 1 : -1,
          timestamp: String(Date.now()),
        });
      }
      stream.end();
    });
  }
}
