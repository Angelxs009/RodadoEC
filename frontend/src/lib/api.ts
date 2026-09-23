import type {
  CarDetailsResponse,
  CarSearchRequest,
  CarSearchResponse,
  DriverDetails,
  OrderDetail,
  OrderHoldResponse,
  OrderPreviewResponse,
  OrderStatus,
  ProblemDetails,
  WebhookEvent,
  WebhookSubscription,
} from '../types/autos';
import type {
  AdminDepot,
  AdminOrder,
  AdminVehicle,
  CreateDepotInput,
  CreateVehicleInput,
} from '../types/admin';

const BASE_URL = '/api/v1';
const AFFILIATE_ID = '1001';

export class ApiError extends Error {
  problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.problem = problem;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean; idempotent?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Affiliate-Id': AFFILIATE_ID,
  };

  if (options.auth) {
    headers.Authorization = 'Bearer dev-token-autos';
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

export const adminApi = {
  listVehicles: () => request<AdminVehicle[]>('/admin/vehicles', { method: 'GET' }),
  createVehicle: (payload: CreateVehicleInput) =>
    request<AdminVehicle>('/admin/vehicles', { body: payload }),
  updateVehicle: (id: string, payload: Partial<CreateVehicleInput>) =>
    request<AdminVehicle>(`/admin/vehicles/${id}`, { method: 'PUT', body: payload }),
  deleteVehicle: (id: string) =>
    request<void>(`/admin/vehicles/${id}`, { method: 'DELETE' }),

  listDepots: () => request<AdminDepot[]>('/admin/depots', { method: 'GET' }),
  createDepot: (payload: CreateDepotInput) =>
    request<AdminDepot>('/admin/depots', { body: payload }),
  updateDepot: (id: string, payload: Partial<CreateDepotInput>) =>
    request<AdminDepot>(`/admin/depots/${id}`, { method: 'PUT', body: payload }),
  deleteDepot: (id: string) =>
    request<void>(`/admin/depots/${id}`, { method: 'DELETE' }),

  listOrders: (status?: OrderStatus) =>
    request<AdminOrder[]>(`/admin/orders${status ? `?status=${status}` : ''}`, {
      method: 'GET',
    }),
};
