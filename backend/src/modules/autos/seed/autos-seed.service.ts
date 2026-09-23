import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MOCK_DEPOTS, MOCK_DEPOT_SCORES, MOCK_SUPPLIERS, MOCK_VEHICLES } from '../data/mock-catalog';
import { Depot } from '../entities/depot.entity';
import { Supplier } from '../entities/supplier.entity';
import { Vehicle } from '../entities/vehicle.entity';

/**
 * Siembra la base de datos con el catálogo inicial (autos, depots, suppliers)
 * la primera vez que arranca la aplicación. Idempotente: no inserta nada si
 * las tablas ya tienen datos, para no pisar ediciones hechas desde el admin.
 */
@Injectable()
export class AutosSeedService implements OnModuleInit {
  private readonly logger = new Logger(AutosSeedService.name);

  constructor(
    @InjectRepository(Vehicle) private readonly vehicleRepository: Repository<Vehicle>,
    @InjectRepository(Depot) private readonly depotRepository: Repository<Depot>,
    @InjectRepository(Supplier) private readonly supplierRepository: Repository<Supplier>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedSuppliers();
    await this.seedDepots();
    await this.seedVehicles();
  }

  private async seedSuppliers(): Promise<void> {
    if ((await this.supplierRepository.count()) > 0) return;
    await this.supplierRepository.save(
      MOCK_SUPPLIERS.map((s) => this.supplierRepository.create(s)),
    );
    this.logger.log(`Sembrados ${MOCK_SUPPLIERS.length} suppliers`);
  }

  private async seedDepots(): Promise<void> {
    if ((await this.depotRepository.count()) > 0) return;
    await this.depotRepository.save(
      MOCK_DEPOTS.map((d) =>
        this.depotRepository.create({
          ...d,
          airport: d.airport ?? null,
          score: MOCK_DEPOT_SCORES[d.depot_id] ?? 0,
        }),
      ),
    );
    this.logger.log(`Sembrados ${MOCK_DEPOTS.length} depots`);
  }

  private async seedVehicles(): Promise<void> {
    if ((await this.vehicleRepository.count()) === 0) {
      await this.vehicleRepository.save(
        MOCK_VEHICLES.map((v) =>
          this.vehicleRepository.create({ ...v, image_url: `/cars/${v.vehicle_id}.jpg` }),
        ),
      );
      this.logger.log(`Sembrados ${MOCK_VEHICLES.length} vehículos`);
      return;
    }

    // Backfill: vehículos creados antes de existir image_url
    for (const v of MOCK_VEHICLES) {
      await this.vehicleRepository
        .createQueryBuilder()
        .update(Vehicle)
        .set({ image_url: `/cars/${v.vehicle_id}.jpg` })
        .where('vehicle_id = :id AND image_url IS NULL', { id: v.vehicle_id })
        .execute();
    }
  }
}
