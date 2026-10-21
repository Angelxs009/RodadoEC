import { Injectable } from '@nestjs/common';
import { Args, Mutation, Parent, Query, ResolveField, ResolveReference, Resolver } from '@nestjs/graphql';
import { Backends } from '../backends';

const ESTADO_VEHICULO: Record<string, string> = { AVAILABLE: 'DISPONIBLE', RESERVED: 'RESERVADO' };
const ESTADO_ORDEN: Record<string, string> = { CONFIRMED: 'CONFIRMADA', CANCELLED: 'CANCELADA', PENDING: 'PENDIENTE' };
const ESTADO_ORDEN_INV: Record<string, string> = { CONFIRMADA: 'CONFIRMED', CANCELADA: 'CANCELLED', PENDIENTE: 'PENDING' };
const CIUDADES: Record<number, string> = { 1: 'Quito', 2: 'Guayaquil', 3: 'Cuenca' };

// ── Traducción de los mensajes gRPC (inglés/snake_case) al esquema GraphQL (español/camelCase) ────
export function toVehiculo(v: any) {
  return {
    id: v.vehicle_id,
    marca: v.make,
    modelo: v.model,
    tipo: v.car_type,
    transmision: v.transmission,
    puertas: v.doors,
    maletas: v.bag_capacity,
    asientos: v.seats,
    precioPorDia: v.price_per_day,
    imagenUrl: v.image_url || null,
    estado: ESTADO_VEHICULO[v.status] ?? 'DISPONIBLE',
    edadMinima: v.min_driver_age,
    _depotId: v.depot_id,
    _supplierId: v.supplier_id,
  };
}

export function toAgencia(d: any) {
  return {
    id: String(d.depot_id),
    nombre: d.name,
    ciudadId: d.city_id,
    ciudad: CIUDADES[d.city_id] ?? 'Ecuador',
    aeropuerto: d.airport || null,
    puntuacion: d.score || null,
  };
}

export function toOrden(o: any) {
  return {
    id: o.order_id,
    codigo: o.locator,
    estado: ESTADO_ORDEN[o.status] ?? 'PENDIENTE',
    vehiculo: toVehiculo(o.vehicle),
    total: o.total_price,
    moneda: o.currency,
    extras: o.extras ?? [],
    recogida: o.route?.pickup?.datetime || null,
    entrega: o.route?.dropoff?.datetime || null,
    clienteId: o.customer_id || null,
    fechaCreacion: o.creation_date,
  };
}

@Injectable()
class Lookups {
  constructor(readonly backends: Backends) {}

  async vehiculoPorId(id: string) {
    const r = await this.backends.catalog.call<any>('GetVehicles', { vehicle_ids: [id] });
    return r.vehicles[0] ? toVehiculo(r.vehicles[0]) : null;
  }

  async agenciaPorId(id: string | number) {
    const r = await this.backends.catalog.call<any>('ListDepots', {});
    const d = r.depots.find((x: any) => String(x.depot_id) === String(id));
    return d ? toAgencia(d) : null;
  }

  async ordenPorId(id: string) {
    try {
      return toOrden(await this.backends.booking.call('GetOrder', { order_id: id }));
    } catch (e: any) {
      if (e?.getStatus?.() === 404) return null;
      throw e;
    }
  }
}

// ── Raíz del esquema ──────────────────────────────────────────────────────────
@Resolver()
export class AutosQueryResolver {
  constructor(private readonly backends: Backends, private readonly lookups: Lookups) {}

  @Query('vehiculos')
  async vehiculos(
    @Args('ciudadId') ciudadId?: number,
    @Args('aeropuerto') aeropuerto?: string,
    @Args('tipos') tipos?: string[],
    @Args('transmision') transmision?: string[],
  ) {
    const r = await this.backends.catalog.call<any>('Search', {
      pickup_location: { airport: aeropuerto ?? '', city_id: ciudadId ?? 0 },
      car_types: tipos ?? [],
      transmission: transmision ?? [],
    });
    return r.vehicles.map(toVehiculo);
  }

  @Query('vehiculo')
  vehiculo(@Args('id') id: string) {
    return this.lookups.vehiculoPorId(id);
  }

  @Query('agencias')
  async agencias() {
    return (await this.backends.catalog.call<any>('ListDepots', {})).depots.map(toAgencia);
  }

  @Query('orden')
  orden(@Args('id') id: string) {
    return this.lookups.ordenPorId(id);
  }

  @Query('ordenes')
  async ordenes(@Args('estado') estado?: string, @Args('clienteId') clienteId?: string) {
    const r = await this.backends.booking.call<any>('ListOrders', {
      status: estado ? ESTADO_ORDEN_INV[estado] : '',
      customer_id: clienteId ?? '',
    });
    return r.orders.map(toOrden);
  }

  @Mutation('cancelarOrden')
  async cancelarOrden(@Args('id') id: string) {
    await this.backends.booking.call('CancelOrder', { order_id: id });
    return this.lookups.ordenPorId(id);
  }
}

// ── Entidades federadas (@key): otros subgrafos pueden extenderlas ──────────────
@Resolver('Vehiculo')
export class VehiculoResolver {
  constructor(private readonly backends: Backends, private readonly lookups: Lookups) {}

  @ResolveField('agencia')
  agencia(@Parent() v: any) {
    return this.lookups.agenciaPorId(v._depotId);
  }

  @ResolveField('proveedor')
  async proveedor(@Parent() v: any) {
    const r = await this.backends.catalog.call<any>('ListSuppliers', { supplier_ids: [v._supplierId] });
    const s = r.suppliers[0];
    return { id: String(v._supplierId), nombre: s?.name ?? `Proveedor ${v._supplierId}` };
  }

  @ResolveReference()
  resolveReference(ref: { __typename: string; id: string }) {
    return this.lookups.vehiculoPorId(ref.id);
  }
}

@Resolver('Agencia')
export class AgenciaResolver {
  constructor(private readonly backends: Backends, private readonly lookups: Lookups) {}

  @ResolveField('vehiculos')
  async vehiculos(@Parent() a: any) {
    const r = await this.backends.catalog.call<any>('GetVehicles', {});
    return r.vehicles.filter((v: any) => String(v.depot_id) === String(a.id)).map(toVehiculo);
  }

  @ResolveReference()
  resolveReference(ref: { __typename: string; id: string }) {
    return this.lookups.agenciaPorId(ref.id);
  }
}

@Resolver('Orden')
export class OrdenResolver {
  constructor(private readonly lookups: Lookups) {}

  @ResolveReference()
  resolveReference(ref: { __typename: string; id: string }) {
    return this.lookups.ordenPorId(ref.id);
  }
}

export const GRAPHQL_PROVIDERS = [Lookups, AutosQueryResolver, VehiculoResolver, AgenciaResolver, OrdenResolver];
