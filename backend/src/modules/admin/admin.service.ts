import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Depot } from '../autos/entities/depot.entity';
import { Order, OrderStatus } from '../autos/entities/order.entity';
import { Vehicle } from '../autos/entities/vehicle.entity';
import { CreateDepotAdminDto, UpdateDepotAdminDto } from './dto/depot-admin.dto';
import { CreateVehicleAdminDto, UpdateVehicleAdminDto } from './dto/vehicle-admin.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Vehicle) private readonly vehicleRepository: Repository<Vehicle>,
    @InjectRepository(Depot) private readonly depotRepository: Repository<Depot>,
    @InjectRepository(Order) private readonly orderRepository: Repository<Order>,
  ) {}

  // ── Vehículos ──────────────────────────────────────────────────────────

  listVehicles(): Promise<Vehicle[]> {
    return this.vehicleRepository.find({ order: { make: 'ASC' } });
  }

  createVehicle(dto: CreateVehicleAdminDto): Promise<Vehicle> {
    return this.vehicleRepository.save(this.vehicleRepository.create(dto));
  }

  async updateVehicle(id: string, dto: UpdateVehicleAdminDto): Promise<Vehicle> {
    const vehicle = await this.vehicleRepository.findOneBy({ id });
    if (!vehicle) throw new NotFoundException(`Vehículo "${id}" no encontrado`);
    Object.assign(vehicle, dto);
    return this.vehicleRepository.save(vehicle);
  }

  async deleteVehicle(id: string): Promise<void> {
    const result = await this.vehicleRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException(`Vehículo "${id}" no encontrado`);
  }

  // ── Depots ─────────────────────────────────────────────────────────────

  listDepots(): Promise<Depot[]> {
    return this.depotRepository.find({ order: { name: 'ASC' } });
  }

  createDepot(dto: CreateDepotAdminDto): Promise<Depot> {
    return this.depotRepository.save(this.depotRepository.create(dto));
  }

  async updateDepot(id: string, dto: UpdateDepotAdminDto): Promise<Depot> {
    const depot = await this.depotRepository.findOneBy({ id });
    if (!depot) throw new NotFoundException(`Depot "${id}" no encontrado`);
    Object.assign(depot, dto);
    return this.depotRepository.save(depot);
  }

  async deleteDepot(id: string): Promise<void> {
    const result = await this.depotRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException(`Depot "${id}" no encontrado`);
  }

  // ── Órdenes (solo lectura) ─────────────────────────────────────────────

  listOrders(status?: OrderStatus): Promise<Order[]> {
    return this.orderRepository.find({
      where: status ? { status } : {},
      order: { creation_date: 'DESC' },
    });
  }

  async getOrder(id: string): Promise<Order> {
    const order = await this.orderRepository.findOneBy({ id });
    if (!order) throw new NotFoundException(`Orden "${id}" no encontrada`);
    return order;
  }
}
