export interface CustomerProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
}

export interface CustomerAuthResponse {
  token: string;
  profile: CustomerProfile;
}

export interface RegisterCustomerInput {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone_number?: string;
}

export interface LoginCustomerInput {
  email: string;
  password: string;
}

/** Shape cruda que devuelve GET /me/orders (la entidad Order del backend). */
export interface CustomerOrder {
  id: string;
  locator: string;
  status: 'CONFIRMED' | 'CANCELLED' | 'PENDING';
  vehicle_details: { make?: string; model?: string; image_url?: string | null };
  total_price: number;
  currency: string;
  creation_date: string;
}
