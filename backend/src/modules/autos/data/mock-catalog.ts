export interface MockVehicle {
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
}

export interface MockDepot {
  depot_id: number;
  name: string;
  city_id: number;
  airport?: string;
}

export interface MockSupplier {
  supplier_id: number;
  name: string;
}

export const MOCK_SUPPLIERS: MockSupplier[] = [
  { supplier_id: 1, name: 'Localiza Ecuador' },
  { supplier_id: 2, name: 'Hertz Quito' },
  { supplier_id: 3, name: 'Avis Guayaquil' },
];

export const MOCK_DEPOTS: MockDepot[] = [
  { depot_id: 100, name: 'Aeropuerto Mariscal Sucre (UIO)', city_id: 1, airport: 'UIO' },
  { depot_id: 101, name: 'Centro Histórico Quito', city_id: 1 },
  { depot_id: 200, name: 'Aeropuerto José Joaquín de Olmedo (GYE)', city_id: 2, airport: 'GYE' },
  { depot_id: 300, name: 'Centro Cuenca', city_id: 3 },
];

export const MOCK_DEPOT_SCORES: Record<number, number> = {
  100: 4.6,
  101: 4.2,
  200: 4.4,
  300: 4.0,
};

export const MOCK_VEHICLES: MockVehicle[] = [
  {
    vehicle_id: 'veh-001',
    make: 'Chevrolet',
    model: 'Spark GT',
    car_type: 'Compacto',
    transmission: 'Manual',
    doors: 4,
    bag_capacity: 2,
    seats: 4,
    price_per_day: 28,
    supplier_id: 1,
    depot_id: 100,
  },
  {
    vehicle_id: 'veh-002',
    make: 'Kia',
    model: 'Rio',
    car_type: 'Sedan',
    transmission: 'Automatica',
    doors: 4,
    bag_capacity: 3,
    seats: 5,
    price_per_day: 35,
    supplier_id: 2,
    depot_id: 100,
  },
  {
    vehicle_id: 'veh-003',
    make: 'Toyota',
    model: 'RAV4',
    car_type: 'SUV',
    transmission: 'Automatica',
    doors: 4,
    bag_capacity: 4,
    seats: 5,
    price_per_day: 65,
    supplier_id: 2,
    depot_id: 200,
  },
  {
    vehicle_id: 'veh-004',
    make: 'Hyundai',
    model: 'Accent',
    car_type: 'Sedan',
    transmission: 'Manual',
    doors: 4,
    bag_capacity: 3,
    seats: 5,
    price_per_day: 32,
    supplier_id: 3,
    depot_id: 200,
  },
  {
    vehicle_id: 'veh-005',
    make: 'Ford',
    model: 'Explorer',
    car_type: 'SUV',
    transmission: 'Automatica',
    doors: 4,
    bag_capacity: 5,
    seats: 7,
    price_per_day: 89,
    supplier_id: 1,
    depot_id: 300,
  },
  {
    vehicle_id: 'veh-006',
    make: 'Volkswagen',
    model: 'Gol',
    car_type: 'Compacto',
    transmission: 'Manual',
    doors: 4,
    bag_capacity: 2,
    seats: 4,
    price_per_day: 27,
    supplier_id: 3,
    depot_id: 101,
  },
  {
    vehicle_id: 'veh-007',
    make: 'Nissan',
    model: 'Versa',
    car_type: 'Sedan',
    transmission: 'Automatica',
    doors: 4,
    bag_capacity: 3,
    seats: 5,
    price_per_day: 38,
    supplier_id: 1,
    depot_id: 101,
  },
  {
    vehicle_id: 'veh-008',
    make: 'Jeep',
    model: 'Renegade',
    car_type: 'SUV',
    transmission: 'Automatica',
    doors: 4,
    bag_capacity: 4,
    seats: 5,
    price_per_day: 72,
    supplier_id: 2,
    depot_id: 300,
  },
];

export const MOCK_CONSTANTS: Record<string, unknown> = {
  fuel_policies: ['FULL_TO_FULL', 'FULL_TO_EMPTY', 'PREPAID'],
  fuel_types: ['GASOLINA', 'DIESEL', 'HIBRIDO', 'ELECTRICO'],
  transmission: ['Manual', 'Automatica'],
  payment_timings: ['PAGO_ANTICIPADO', 'PAGO_EN_DEPOSITO'],
  depot_services: ['ENTREGA_A_DOMICILIO', 'SILLA_BEBE', 'GPS', 'CONDUCTOR_ADICIONAL'],
  general: { moneda_base: 'USD', pais: 'Ecuador' },
};
