import { Injectable, Logger } from '@nestjs/common';
import { CORRELATION_HEADER, currentCorrelationId } from '@autos/common';
import { Backends } from '../backends';
import { nodeApiKey } from '../common/auth';

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
  async clientIdOf(driver: any): Promise<string> {
    if (!driver?.email) return '';
    try {
      // La orden guarda first_name/last_name/phone_number/license (ver BookingService.createOrderV2); full_name y phone
      // cubren el formato de entrada por si llega sin transformar.
      const first = String(driver.first_name ?? '').trim();
      const last = String(driver.last_name ?? '').trim();
      const nombre = driver.full_name ?? (last && last !== first ? `${first} ${last}` : first);
      const c = await this.backends.identity.call<any>('CreateClient', {
        nombre: nombre || driver.email,
        email: driver.email,
        identificacion: driver.document_id ?? driver.identificacion ?? '',
        telefono: driver.phone_number ?? driver.phone ?? '',
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
    const apiKey = nodeApiKey();
    const externalId = order.locator;
    const url = `${base}/api/v3/reservas/${encodeURIComponent(externalId)}/checkin`;
    // El conductor se registra como cliente aunque el aviso no pueda salir (así existe en nuestro sistema sin duplicarse).
    const clientId = await this.clientIdOf(order.driver_details);
    // Solo se avisa de las reservas que llegaron desde Booking (creadas por la API con nuestra X-API-Key).
    if (order.source !== 'BOOKING') {
      return { notified: false, client_id: clientId, reason: 'Reserva creada en la web propia: no se avisa a Booking' };
    }
    if (!apiKey) {
      this.logger.warn(`Check-in de ${externalId} sin notificar a Booking: falta NODE_API_KEY.`);
      return { notified: false, client_id: clientId, reason: 'NODE_API_KEY no configurada' };
    }
    const body = {
      external_order_id: externalId,
      client_id: clientId,
      estado: 'CONFIRMADO_ASISTIDO',
      admin_id: opts.adminId || 'operador-mostrador',
      fecha_checkin: (order.delivered_at ? new Date(order.delivered_at) : new Date()).toISOString(),
      observaciones: opts.observaciones || 'Vehículo entregado físicamente con contrato y licencia firmada',
    };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
          // Trazabilidad: el mismo correlation_id viaja hacia Booking.
          ...(currentCorrelationId() ? { [CORRELATION_HEADER]: currentCorrelationId() as string } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(DEADLINE_MS),
      });
      if (!res.ok) {
        this.logger.warn(`Booking respondió HTTP ${res.status} al check-in de ${externalId}`);
        return { notified: false, client_id: clientId, status: res.status, reason: `Booking respondió HTTP ${res.status}` };
      }
      return { notified: true, client_id: clientId, status: res.status };
    } catch (err) {
      this.logger.warn(`Check-in de ${externalId} no llegó a Booking: ${(err as Error).message}`);
      return { notified: false, client_id: clientId, reason: (err as Error).message };
    }
  }
}
