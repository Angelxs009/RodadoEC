import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SERVICE_VERSION } from '@autos/common';
import { Backends } from '../backends';

/**
 * /health: el gateway está vivo. /health/deep (alias /warmup): consulta a los cuatro microservicios.
 * En un plan gratis donde cada servicio se duerme por separado, llamar a /warmup antes de una demo
 * despierta toda la cadena y confirma que cada pieza responde.
 */
@Controller()
@ApiExcludeController()
export class HealthController {
  constructor(private readonly backends: Backends) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'api-gateway', version: SERVICE_VERSION, uptime_s: Math.round(process.uptime()) };
  }

  @Get(['health/deep', 'warmup'])
  async deep() {
    const probe = async (name: string, fn: () => Promise<unknown>) => {
      const started = Date.now();
      try {
        await fn();
        return { service: name, status: 'up', ms: Date.now() - started };
      } catch (err: any) {
        // Un error de dominio (404/401…) significa que el servicio respondió: está vivo.
        const code = err?.getResponse?.()?.code;
        const down = code === 'SERVICE_UNAVAILABLE' || code === 'UPSTREAM_ERROR';
        return { service: name, status: down ? 'down' : 'up', ms: Date.now() - started, ...(down ? { error: code } : {}) };
      }
    };
    const services = await Promise.all([
      probe('catalog-service', () => this.backends.catalog.call('ListSuppliers', {})),
      probe('booking-service', () => this.backends.booking.call('ListWebhooks', {})),
      probe('payments-service', () => this.backends.payments.call('GetPayment', { payment_reference: 'health-check' })),
      probe('identity-service', () => this.backends.identity.call('VerifyToken', { token: 'health-check' })),
    ]);
    return { status: services.every((s) => s.status === 'up') ? 'ok' : 'degraded', service: 'api-gateway', services };
  }
}
