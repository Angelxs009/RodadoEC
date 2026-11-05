import { Body, Controller, Get, HttpCode, HttpStatus, Logger, Post, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InvalidParam, notFound } from '@autos/common';
import { Backends } from '../backends';
import { V2AccessGuard } from '../common/auth';
import { isEmail, isText, throwIfInvalid } from './support';

/**
 * Contrato v3.1 — módulo de clientes (conductores). Booking consulta si el conductor ya existe antes de crearlo,
 * de modo que el mismo usuario nunca queda duplicado en ambas plataformas.
 * /api/v3/clientes se reescribe a /api/v2/clientes en main.ts (igual que el resto del contrato).
 */
@Controller('v2/clientes')
@ApiExcludeController()
export class ClientesController {
  private readonly logger = new Logger('Clientes');

  constructor(private readonly backends: Backends) {}

  /** 200 con el cliente si existe (por email o identificación); 404 si no. */
  @Get()
  @UseGuards(V2AccessGuard)
  async find(@Query('email') email?: string, @Query('identificacion') identificacion?: string) {
    const bad: InvalidParam[] = [];
    if (!isText(email) && !isText(identificacion)) {
      bad.push({ name: 'email', reason: 'Envía email o identificacion para buscar al cliente.' });
    }
    throwIfInvalid(bad);
    const r = await this.backends.identity.call<any>('FindClient', { email: email ?? '', identificacion: identificacion ?? '' });
    this.logger.log(
      `Consulta de cliente (email=${email ?? '-'}, identificacion=${identificacion ?? '-'}): ${r.found ? `existe ${r.client.client_id}` : 'no existe'}`,
      'clientes',
    );
    if (!r.found) throw notFound('Cliente no encontrado', 'No existe un cliente con ese email o identificación.');
    return r.client;
  }

  /** Crea al conductor. Es idempotente: si ya existe (mismo email o misma identificación) devuelve su client_id. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(V2AccessGuard)
  async create(@Body() b: any) {
    const bad: InvalidParam[] = [];
    if (!isText(b?.nombre)) bad.push({ name: 'nombre', reason: 'Es obligatorio.' });
    if (!isEmail(b?.email)) bad.push({ name: 'email', reason: 'Es obligatorio y debe ser un correo válido.' });
    if (!isText(b?.identificacion)) bad.push({ name: 'identificacion', reason: 'Es obligatoria.' });
    throwIfInvalid(bad);
    const c = await this.backends.identity.call<any>('CreateClient', {
      nombre: b.nombre,
      email: b.email,
      identificacion: b.identificacion,
      telefono: b.telefono ?? '',
      licencia: b.licencia ?? '',
    });
    this.logger.log(`Cliente registrado o reutilizado (email=${b.email}): ${c.client_id}`, 'clientes');
    return { client_id: c.client_id };
  }
}
