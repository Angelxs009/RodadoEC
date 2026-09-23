export interface LocationPoint {
  airport?: string;
  city_id?: number;
}

export interface RouteEndpoint {
  datetime: string;
  location: LocationPoint;
}

export interface Route {
  pickup: RouteEndpoint;
  dropoff: RouteEndpoint;
}

export interface CarSearchRequest {
  booker: { country: string };
  currency: string;
  driver: { age: number };
  route: Route;
  filters?: { car_types?: string[]; transmission?: string[] };
  maximum_results?: number;
}

export interface CarSearchResult {
  vehicle_id: string;
  price: number;
  supplier_id: number;
}

export interface CarSearchResponse {
  request_id: string;
  data: CarSearchResult[];
  metadata: { total_results: number; next_page: string | null };
  search_token: string;
}

export interface CarDetailsResult {
  vehicle_id: string;
  make: string;
  model: string;
  doors: number;
  bag_capacity: number;
  seats: number;
  image_url?: string | null;
}

export interface CarDetailsResponse {
  request_id: string;
  data: CarDetailsResult[];
}

export interface OrderHoldResponse {
  hold_id: string;
  expires_at: string;
  status: 'HELD' | 'FAILED';
}

export interface OrderPreviewResponse {
  request_id: string;
  data: {
    order_preview_id: string;
    total_price: number;
    currency: string;
    breakdown: { base_price: number; extras_price: number; days: number };
  };
}

export interface DriverDetails {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
}

export type OrderStatus = 'CONFIRMED' | 'CANCELLED' | 'PENDING';

export interface OrderDetail {
  order_id: string;
  locator: string;
  status: OrderStatus;
  vehicle_details: Record<string, unknown>;
  route_details: Route;
  extras: string[];
  total_price: number;
  currency: string;
  creation_date: string;
  _links: Record<string, string>;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code: string;
}

export type WebhookEvent = 'CAR_ORDER_CONFIRMED' | 'CAR_ORDER_CANCELLED' | 'DEPOT_UPDATE';

export interface WebhookSubscription {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret?: string | null;
}
