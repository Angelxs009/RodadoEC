import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { badRequest, conflict, notFound } from '@autos/common';
import { MOCK_CONSTANTS, MOCK_DEPOT_SCORES, MOCK_DEPOTS, MOCK_SUPPLIERS, MOCK_VEHICLES } from './data/mock-catalog';
import { DEFAULT_MIN_DRIVER_AGE, Depot, Supplier, Vehicle, VehicleStatus } from './entities/catalog.entities';

const VEHICLE_FIELDS = [
  'vehicle_id', 'make', 'model', 'car_type', 'transmission', 'doors', 'bag_capacity', 'seats',
  'price_per_day', 'supplier_id', 'depot_id', 'image_url', 'status', 'min_driver_age',
] as const;
const DEPOT_FIELDS = ['depot_id', 'name', 'city_id', 'airport', 'score'] as const;

/** Mensajes del contrato catalog.proto (proto3 no tiene nulos: vacío/0 = no definido). */
export function toVehicleMsg(v: Vehicle) {
  return {
    id: v.id,
    vehicle_id: v.vehicle_id,
    make: v.make,
    model: v.model,
    car_type: v.car_type,
    transmission: v.transmission,
    doors: v.doors,
    bag_capacity: v.bag_capacity,
    seats: v.seats,
    price_per_day: v.price_per_day,
    supplier_id: v.supplier_id,
    depot_id: v.depot_id,
    image_url: v.image_url ?? '',
    status: v.status,
    min_driver_age: v.min_driver_age ?? DEFAULT_MIN_DRIVER_AGE,
  };
}

export function toDepotMsg(d: Depot) {
  return {
    id: d.id,
    depot_id: d.depot_id,
    name: d.name,
    city_id: d.city_id,
    airport: d.airport ?? '',
    score: d.score ?? 0,
  };
}

@Injectable()
export class CatalogService implements OnModuleInit {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(Depot) private readonly depots: Repository<Depot>,
    @InjectRepository(Supplier) private readonly suppliers: Repository<Supplier>,
  ) {}

  // ── Siembra idempotente (por id público, no pisa ediciones del admin) ─────
  async onModuleInit() {
    const knownSuppliers = new Set((await this.suppliers.find()).map((s) => s.supplier_id));
    const newSuppliers = MOCK_SUPPLIERS.filter((s) => !knownSuppliers.has(s.supplier_id));
    if (newSuppliers.length) await this.suppliers.save(newSuppliers.map((s) => this.suppliers.create(s)));

    const knownDepots = new Set((await this.depots.find()).map((d) => d.depot_id));
    const newDepots = MOCK_DEPOTS.filter((d) => !knownDepots.has(d.depot_id));
    if (newDepots.length) {
      await this.depots.save(
        newDepots.map((d) =>
          this.depots.create({ ...d, airport: d.airport ?? null, score: MOCK_DEPOT_SCORES[d.depot_id] ?? 0 }),
        ),
      );
    }

    const knownVehicles = new Set((await this.vehicles.find({ select: { vehicle_id: true } })).map((v) => v.vehicle_id));
    const newVehicles = MOCK_VEHICLES.filter((v) => !knownVehicles.has(v.vehicle_id));
    if (newVehicles.length) {
      await this.vehicles.save(
        newVehicles.map((v) =>
          this.vehicles.create({ ...v, image_url: `/cars/${v.vehicle_id}.jpg`, min_driver_age: DEFAULT_MIN_DRIVER_AGE }),
        ),
      );
    }
    this.logger.log(
      `Catálogo sembrado: +${newVehicles.length} autos, +${newDepots.length} agencias, +${newSuppliers.length} proveedores`,
    );
  }

  // ── Consulta ──────────────────────────────────────────────────────────────
  async search(req: { pickup_location?: { airport?: string; city_id?: number }; car_types?: string[]; transmission?: string[]; limit?: number }) {
    const where: Record<string, unknown> = {};
    if (req.car_types?.length) where.car_type = In(req.car_types);
    if (req.transmission?.length) where.transmission = In(req.transmission);

    // La agencia de recogida manda: solo se ofrecen autos de la ciudad/aeropuerto elegido.
    const loc = req.pickup_location;
    if (loc?.airport || loc?.city_id) {
      const all = await this.depots.find();
      where.depot_id = In(
        all
          .filter((d) =>
            loc.airport ? d.airport?.toUpperCase() === loc.airport.toUpperCase() : d.city_id === loc.city_id,
          )
          .map((d) => d.depot_id),
      );
    }
    const found = await this.vehicles.find({ where, take: req.limit || 100 });
    return { vehicles: found.map(toVehicleMsg) };
  }

  async getVehicles(req: { vehicle_ids?: string[] }) {
    const found = req.vehicle_ids?.length
      ? await this.vehicles.find({ where: { vehicle_id: In(req.vehicle_ids) } })
      : await this.vehicles.find();
    return { vehicles: found.map(toVehicleMsg) };
  }

  async listDepots() {
    return { depots: (await this.depots.find()).map(toDepotMsg) };
  }

  async listSuppliers(req: { supplier_ids?: number[] }) {
    const found = req.supplier_ids?.length
      ? await this.suppliers.find({ where: { supplier_id: In(req.supplier_ids) } })
      : await this.suppliers.find();
    return { suppliers: found.map((s) => ({ supplier_id: s.supplier_id, name: s.name })) };
  }

  getConstants(req: { constants?: string[] }) {
    const keys = req.constants?.length ? req.constants : Object.keys(MOCK_CONSTANTS);
    const data: Record<string, unknown> = {};
    for (const k of keys) data[k] = MOCK_CONSTANTS[k];
    return { data_json: JSON.stringify(data) };
  }

  // ── Disponibilidad ────────────────────────────────────────────────────────
  /** Reserva atómica: solo una petición puede pasar de AVAILABLE a RESERVED. */
  async reserveVehicle(req: { vehicle_id: string }) {
    const r = await this.vehicles.update(
      { vehicle_id: req.vehicle_id, status: VehicleStatus.AVAILABLE },
      { status: VehicleStatus.RESERVED },
    );
    return { reserved: !!r.affected };
  }

  async releaseVehicle(req: { vehicle_id: string }) {
    await this.vehicles.update({ vehicle_id: req.vehicle_id }, { status: VehicleStatus.AVAILABLE });
  }

  // ── Administración: vehículos ─────────────────────────────────────────────
  async adminListVehicles() {
    return { vehicles: (await this.vehicles.find({ order: { make: 'ASC' } })).map(toVehicleMsg) };
  }

  async adminCreateVehicle(input: any) {
    if (await this.vehicles.findOneBy({ vehicle_id: input.vehicle_id })) {
      throw conflict(`Ya existe un vehículo con vehicle_id "${input.vehicle_id}".`);
    }
    const saved = await this.vehicles.save(this.vehicles.create(this.vehicleFromInput(input, VEHICLE_FIELDS as any)));
    return toVehicleMsg(saved);
  }

  async adminUpdateVehicle(req: { id: string; patch: any; fields: string[] }) {
    const v = await this.vehicles.findOneBy({ id: req.id });
    if (!v) throw notFound('Vehículo no encontrado', `Vehículo "${req.id}" no encontrado`);
    Object.assign(v, this.vehicleFromInput(req.patch, req.fields));
    return toVehicleMsg(await this.vehicles.save(v));
  }

  async adminSetVehicleStatus(req: { id: string; status: string }) {
    if (!(req.status in VehicleStatus)) throw badRequest('status debe ser AVAILABLE o RESERVED.');
    const v = await this.vehicles.findOneBy({ id: req.id });
    if (!v) throw notFound('Vehículo no encontrado', `Vehículo "${req.id}" no encontrado`);
    v.status = req.status as VehicleStatus;
    return toVehicleMsg(await this.vehicles.save(v));
  }

  async adminDeleteVehicle(req: { id: string }) {
    const r = await this.vehicles.delete(req.id);
    if (!r.affected) throw notFound('Vehículo no encontrado', `Vehículo "${req.id}" no encontrado`);
  }

  // ── Administración: agencias ──────────────────────────────────────────────
  async adminListDepots() {
    return { depots: (await this.depots.find({ order: { name: 'ASC' } })).map(toDepotMsg) };
  }

  async adminCreateDepot(input: any) {
    if (await this.depots.findOneBy({ depot_id: input.depot_id })) {
      throw conflict(`Ya existe una agencia con depot_id ${input.depot_id}.`);
    }
    const saved = await this.depots.save(this.depots.create(this.depotFromInput(input, DEPOT_FIELDS as any)));
    return toDepotMsg(saved);
  }

  async adminUpdateDepot(req: { id: string; patch: any; fields: string[] }) {
    const d = await this.depots.findOneBy({ id: req.id });
    if (!d) throw notFound('Agencia no encontrada', `Depot "${req.id}" no encontrado`);
    Object.assign(d, this.depotFromInput(req.patch, req.fields));
    return toDepotMsg(await this.depots.save(d));
  }

  async adminDeleteDepot(req: { id: string }) {
    const r = await this.depots.delete(req.id);
    if (!r.affected) throw notFound('Agencia no encontrada', `Depot "${req.id}" no encontrado`);
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  private vehicleFromInput(input: any, fields: readonly string[]) {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      if (!(VEHICLE_FIELDS as readonly string[]).includes(f)) continue;
      let val = input[f];
      if (f === 'image_url') val = val || null;
      if (f === 'min_driver_age') val = val || null; // 0 = por defecto
      if (f === 'status') val = val || VehicleStatus.AVAILABLE;
      out[f] = val;
    }
    return out;
  }

  private depotFromInput(input: any, fields: readonly string[]) {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      if (!(DEPOT_FIELDS as readonly string[]).includes(f)) continue;
      out[f] = f === 'airport' ? input[f] || null : input[f];
    }
    return out;
  }
}
