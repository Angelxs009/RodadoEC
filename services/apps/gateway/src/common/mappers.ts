/**
 * Mapeadores gRPC → REST. El contrato REST (autos-openapi.yaml) no cambia: el gateway traduce los mensajes
 * .proto (sin nulos) a las formas JSON que ya consumen el frontend y los demás grupos.
 */

const orNull = <T>(v: T | '' | 0 | undefined | null): T | null => (v === '' || v === 0 || v === undefined || v === null ? null : (v as T));

export function normalizeLocation(loc: any) {
  const out: Record<string, unknown> = {};
  if (loc?.airport) out.airport = loc.airport;
  if (loc?.city_id) out.city_id = loc.city_id;
  return out;
}

export function normalizeRoute(route: any) {
  if (!route) return null;
  return {
    pickup: { datetime: route.pickup?.datetime ?? '', location: normalizeLocation(route.pickup?.location) },
    dropoff: { datetime: route.dropoff?.datetime ?? '', location: normalizeLocation(route.dropoff?.location) },
  };
}

/** Vehículo tal como lo muestran /details y las órdenes (snapshot). */
export function vehicleSnapshot(v: any) {
  if (!v) return null;
  return { ...v, image_url: orNull(v.image_url) };
}

export function vehicleToDetails(v: any) {
  return {
    vehicle_id: v.vehicle_id,
    make: v.make,
    model: v.model,
    doors: v.doors,
    bag_capacity: v.bag_capacity,
    seats: v.seats,
    image_url: orNull(v.image_url),
    status: v.status,
    min_driver_age: v.min_driver_age,
    depot_id: v.depot_id,
  };
}

export function vehicleToAdmin(v: any) {
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
    image_url: orNull(v.image_url),
    status: v.status,
    min_driver_age: v.min_driver_age,
  };
}

export function depotToAdmin(d: any) {
  return { id: d.id, depot_id: d.depot_id, name: d.name, city_id: d.city_id, airport: orNull(d.airport), score: d.score };
}

export function orderToDetail(o: any) {
  const links: Record<string, string> = { self: `/api/v1/orders/${o.order_id}` };
  if (o.status === 'CONFIRMED') {
    links.modify = `/api/v1/orders/${o.order_id}/modify`;
    links.cancel = `/api/v1/orders/${o.order_id}/cancel`;
  }
  return {
    order_id: o.order_id,
    locator: o.locator,
    status: o.status,
    vehicle_details: vehicleSnapshot(o.vehicle),
    route_details: normalizeRoute(o.route),
    extras: o.extras ?? [],
    total_price: o.total_price,
    currency: o.currency,
    creation_date: o.creation_date,
    _links: links,
  };
}

/** Forma "cruda" que consumen el panel Admin y "Mis reservas". */
export function orderToRaw(o: any) {
  return {
    id: o.order_id,
    locator: o.locator,
    status: o.status,
    vehicle_details: vehicleSnapshot(o.vehicle),
    route_details: normalizeRoute(o.route),
    driver_details: o.driver_details ?? null,
    extras: o.extras ?? [],
    total_price: o.total_price,
    currency: o.currency,
    payment_reference: orNull(o.payment_reference),
    customer_id: orNull(o.customer_id),
    creation_date: o.creation_date,
  };
}

export function profileToRest(p: any) {
  return { id: p.id, email: p.email, first_name: p.first_name, last_name: p.last_name, phone_number: orNull(p.phone_number) };
}

export function userToRest(u: any) {
  return {
    id: orNull(u.id),
    role: u.role,
    login: u.login,
    first_name: orNull(u.first_name),
    last_name: orNull(u.last_name),
    phone_number: orNull(u.phone_number),
    created_at: orNull(u.created_at),
    protected: u.protected,
  };
}

export function webhookToRest(w: any) {
  return { id: w.id, url: w.url, events: w.events, secret: orNull(w.secret) };
}

/** Máscara de actualización: campos presentes en el DTO de un PUT parcial. */
export function presentFields(dto: object): string[] {
  return Object.entries(dto)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k);
}
