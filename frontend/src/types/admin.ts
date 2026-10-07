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
  status: 'AVAILABLE' | 'RESERVED';
}

export type CreateVehicleInput = Omit<AdminVehicle, 'id' | 'status'> & {
  status?: AdminVehicle['status'];
};

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

export type UserRole = 'ADMIN' | 'CUSTOMER';

export interface AdminUserAccount {
  id: string | null;
  role: UserRole;
  /** username (ADMIN) o email (CUSTOMER) con el que inicia sesión. */
  login: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  created_at: string | null;
  /** Cuenta de arranque (variables de entorno): no se puede eliminar. */
  protected: boolean;
}

export interface CreateUserInput {
  role: UserRole;
  username?: string;
  email?: string;
  password: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
}
