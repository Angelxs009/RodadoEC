import { Injectable, Logger } from '@nestjs/common';
import { Backends } from '../backends';

const DEADLINE_MS = 8000;

/**
 * Notifica al Booking Central que el cliente retiró el auto en mostrador (check-in de entrega):
 *   POST {BOOKING_CORE_URL}/api/v3/reservas/{external_order_id}/checkin   (X-API-Key de nuestro nodo)
 * Es un aviso de mejor esfuerzo: si Booking no responde, la entrega ya registrada NO se deshace; el resultado se
 * devuelve en la respuesta (`booking_sync`) y queda en el log.
 */
@Injectable()
export class BookingNotifier {
  private readonly logger = new Logger(BookingNotifier.name);

  constructor(private readonly backends: Backends) {}

  /** client_id local del conductor de la orden: se reutiliza el existente o se registra para no duplicarlo. */
  private async clientIdOf(driver: any): Promise<string> {
    if (!driver?.email) return '';
    try {
      const c = await this.backends.identity.call<any>('CreateClient', {
        nombre: driver.full_name ?? '',
        email: driver.email,
        identificacion: driver.document_id ?? driver.identificacion ?? '',
        telefono: driver.phone ?? '',
        licencia: driver.license ?? '',
      });
      return c.client_id;
    } catch (err) {
      this.logger.warn(`No se pudo resolver el client_id local: ${(err as Error).message}`);
      return '';
    }
  }

  async notifyDelivery(order: any, opts: { adminId?: string; observaciones?: string }) {
    const base = (process.env.BOOKING_CORE_URL ?? 'https://booking-core-api.azurewebsites.net').replace(/\/$/, '');
    const apiKey = process.env.BOOKING_CHECKIN_API_KEY ?? process.env.BOOKING_API_KEY;
    const externalId = order.locator;
    const url = `${base}/api/v3/reservas/${encodeURIComponent(externalId)}/checkin`;
    if (!apiKey) {
      this.logger.warn(`Check-in de ${externalId} sin notificar a Booking: falta BOOKING_API_KEY.`);
      return { notified: false, reason: 'BOOKING_API_KEY no configurada' };
    }
    const body = {
      external_order_id: externalId,
      client_id: await this.clientIdOf(order.driver_details),
      estado: 'CONFIRMADO_ASISTIDO',
      admin_id: opts.adminId || 'operador-mostrador',
      fecha_checkin: (order.delivered_at ? new Date(order.delivered_at) : new Date()).toISOString(),
      observaciones: opts.observaciones || 'Vehículo entregado físicamente con contrato y licencia firmada',
    };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(DEADLINE_MS),
      });
      if (!res.ok) {
        this.logger.warn(`Booking respondió HTTP ${res.status} al check-in de ${externalId}`);
        return { notified: false, status: res.status, reason: `Booking respondió HTTP ${res.status}` };
      }
      return { notified: true, status: res.status };
    } catch (err) {
      this.logger.warn(`Check-in de ${externalId} no llegó a Booking: ${(err as Error).message}`);
      return { notified: false, reason: (err as Error).message };
    }
  }
}
