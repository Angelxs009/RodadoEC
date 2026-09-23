import type { OrderStatus } from './autos';

export interface AdminVehicle {
  id: string;
  vehicle_id: string;
  make: string;
  model: string;
  car_type: string;
  transmission: string;
  doors: number;
  bag_capacity: number;
  seats: number;
  price_per_day: number;
  supplier_id: number;
  depot_id: number;
  image_url?: string | null;
}

export type CreateVehicleInput = Omit<AdminVehicle, 'id'>;

export interface AdminDepot {
  id: string;
  depot_id: number;
  name: string;
  city_id: number;
  airport?: string | null;
  score: number;
}

export type CreateDepotInput = Omit<AdminDepot, 'id'>;

export interface AdminOrder {
  id: string;
  locator: string;
  status: OrderStatus;
  vehicle_details: { make?: string; model?: string; vehicle_id?: string };
  total_price: number;
  currency: string;
  creation_date: string;
}
