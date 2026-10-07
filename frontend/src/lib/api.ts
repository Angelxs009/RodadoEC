import type {
  CarDetailsResponse,
  CarSearchRequest,
  CardInput,
  CarSearchResponse,
  DriverDetails,
  OrderDetail,
  OrderHoldResponse,
  OrderPreviewResponse,
  OrderStatus,
  PaymentResponse,
  ProblemDetails,
  WebhookEvent,
  WebhookSubscription,
} from '../types/autos';
import type {
  AdminDepot,
  AdminOrder,
  AdminUserAccount,
  AdminVehicle,
  CreateDepotInput,
  CreateUserInput,
  UserRole,
  CreateVehicleInput,
} from '../types/admin';
import type {
  CustomerAuthResponse,
  CustomerOrder,
  CustomerProfile,
  LoginCustomerInput,
  RegisterCustomerInput,
} from '../types/customer';

// En dev, el proxy de Vite reenvía '/api' al backend local (ver vite.config.ts).
// En producción se apunta directo a la API desplegada vía VITE_API_URL (ver .env.production.example).
const BASE_URL = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;
export const SWAGGER_URL = `${import.meta.env.VITE_API_URL ?? ''}/api/docs`;
const AFFILIATE_ID = '1001';
const ADMIN_TOKEN_KEY = 'rodadoec_admin_token';
const CUSTOMER_TOKEN_KEY = 'rodadoec_customer_token';

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string | null) {
  try {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
    else localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // localStorage puede fallar (modo privado, storage bloqueado); no es crítico.
  }
}

export function getCustomerToken(): string | null {
  try {
    return localStorage.getItem(CUSTOMER_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setCustomerToken(token: string | null) {
  try {
    if (token) localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
    else localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  } catch {
    // localStorage puede fallar (modo privado, storage bloqueado); no es crítico.
  }
}

export class ApiError extends Error {
  problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.problem = problem;
  }
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    auth?: boolean;
    idempotent?: boolean;
    adminAuth?: boolean;
    customerAuth?: boolean;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Affiliate-Id': AFFILIATE_ID,
  };

  if (options.auth) {
    // Si el cliente inició sesión, se manda su token real (el backend lo usa
    // para ligar la reserva a su cuenta); si no, el Bearer anónimo de siempre
    // (el contrato solo exige que exista el header, no valida su contenido).
    const customerToken = getCustomerToken();
    headers.Authorization = customerToken ? `Bearer ${customerToken}` : 'Bearer dev-token-autos';
  }
  if (options.adminAuth) {
    const token = getAdminToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (options.customerAuth) {
    const token = getCustomerToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (options.idempotent) {
    headers['Idempotency-Key'] = crypto.randomUUID();
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'POST',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const rawBody = await res.text();
  const data = rawBody ? JSON.parse(rawBody) : undefined;

  if (!res.ok) {
    if (options.adminAuth && res.status === 401) {
      // Sesión de admin inválida/expirada: se limpia para forzar login de nuevo.
      setAdminToken(null);
    }
    if (options.customerAuth && res.status === 401) {
      setCustomerToken(null);
    }
    throw new ApiError(data as ProblemDetails);
  }

  return data as T;
}

export const autosApi = {
  search: (payload: CarSearchRequest) =>
    request<CarSearchResponse>('/search', { body: payload }),

  details: () => request<CarDetailsResponse>('/details', { body: {} }),

  hold: (payload: { vehicle_id: string; search_token: string }) =>
    request<OrderHoldResponse>('/orders/hold', { body: payload, auth: true }),

  preview: (payload: {
    vehicle_id: string;
    search_token: string;
    hold_id?: string;
    extras?: string[];
  }) => request<OrderPreviewResponse>('/orders/preview', { body: payload, auth: true }),

  pay: (payload: { order_preview_id: string; card: CardInput }) =>
    request<PaymentResponse>('/payments', { body: payload, auth: true }),

  createOrder: (payload: {
    order_preview_id: string;
    payment_reference: string;
    driver_details: DriverDetails;
  }) =>
    request<OrderDetail>('/orders/create', {
      body: payload,
      auth: true,
      idempotent: true,
    }),

  getOrder: (orderId: string) =>
    request<OrderDetail>(`/orders/${orderId}`, { method: 'GET', auth: true }),

  cancelOrder: (orderId: string) =>
    request<void>(`/orders/${orderId}/cancel`, { auth: true, idempotent: true }),

  modifyOrder: (
    orderId: string,
    payload: { extras_to_add?: string[]; extras_to_remove?: string[] },
  ) =>
    request<OrderDetail>(`/orders/${orderId}/modify`, {
      body: payload,
      auth: true,
      idempotent: true,
    }),

  listWebhooks: () =>
    request<WebhookSubscription[]>('/webhooks', { method: 'GET', auth: true }),

  createWebhook: (payload: { url: string; events: WebhookEvent[] }) =>
    request<WebhookSubscription>('/webhooks', { body: payload, auth: true }),

  deleteWebhook: (id: string) =>
    request<void>(`/webhooks/${id}`, { method: 'DELETE', auth: true }),
};

export const adminAuthApi = {
  login: (username: string, password: string) =>
    request<{ token: string }>('/admin/auth/login', { body: { username, password } }),
};

export const adminApi = {
  listVehicles: () =>
    request<AdminVehicle[]>('/admin/vehicles', { method: 'GET', adminAuth: true }),
  createVehicle: (payload: CreateVehicleInput) =>
    request<AdminVehicle>('/admin/vehicles', { body: payload, adminAuth: true }),
  updateVehicle: (id: string, payload: Partial<CreateVehicleInput>) =>
    request<AdminVehicle>(`/admin/vehicles/${id}`, {
      method: 'PUT',
      body: payload,
      adminAuth: true,
    }),
  releaseVehicle: (id: string) =>
    request<AdminVehicle>(`/admin/vehicles/${id}/release`, { adminAuth: true }),
  reserveVehicle: (id: string) =>
    request<AdminVehicle>(`/admin/vehicles/${id}/reserve`, { adminAuth: true }),
  deleteVehicle: (id: string) =>
    request<void>(`/admin/vehicles/${id}`, { method: 'DELETE', adminAuth: true }),

  listDepots: () => request<AdminDepot[]>('/admin/depots', { method: 'GET', adminAuth: true }),
  createDepot: (payload: CreateDepotInput) =>
    request<AdminDepot>('/admin/depots', { body: payload, adminAuth: true }),
  updateDepot: (id: string, payload: Partial<CreateDepotInput>) =>
    request<AdminDepot>(`/admin/depots/${id}`, {
      method: 'PUT',
      body: payload,
      adminAuth: true,
    }),
  deleteDepot: (id: string) =>
    request<void>(`/admin/depots/${id}`, { method: 'DELETE', adminAuth: true }),

  listUsers: () => request<AdminUserAccount[]>('/admin/users', { method: 'GET', adminAuth: true }),
  createUser: (payload: CreateUserInput) =>
    request<AdminUserAccount>('/admin/users', { body: payload, adminAuth: true }),
  deleteUser: (role: UserRole, id: string) =>
    request<void>(`/admin/users/${role}/${id}`, { method: 'DELETE', adminAuth: true }),

  listOrders: (status?: OrderStatus) =>
    request<AdminOrder[]>(`/admin/orders${status ? `?status=${status}` : ''}`, {
      method: 'GET',
      adminAuth: true,
    }),
};

export const customerAuthApi = {
  register: (payload: RegisterCustomerInput) =>
    request<CustomerAuthResponse>('/auth/register', { body: payload }),
  login: (payload: LoginCustomerInput) =>
    request<CustomerAuthResponse>('/auth/login', { body: payload }),
  me: () => request<CustomerProfile>('/auth/me', { method: 'GET', customerAuth: true }),
};

export const customerApi = {
  myOrders: () => request<CustomerOrder[]>('/me/orders', { method: 'GET', customerAuth: true }),
};
