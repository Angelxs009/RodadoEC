import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { CalendarIcon, CheckCircleIcon, MapPinIcon, PlaneIcon } from '../components/icons';
import { PageContainer } from '../components/PageContainer';
import { ErrorState } from '../components/StateViews';
import { VehicleImage } from '../components/VehicleImage';
import { ApiError, autosApi } from '../lib/api';
import { cityLabel, useAgencies } from '../lib/depots';
import { EXTRAS_CATALOG } from '../lib/extras-catalog';
import { usePolling } from '../lib/use-polling';
import type { CancelResult, OrderDetail } from '../types/autos';

const STATUS_TONE: Record<string, 'success' | 'danger' | 'warning' | 'brand'> = {
  CONFIRMED: 'success',
  CANCELLED: 'danger',
  PENDING: 'warning',
  ENTREGADO: 'brand',
  COMPLETADA: 'brand',
};

const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  PENDING: 'Pendiente',
  ENTREGADO: 'Entregada',
  COMPLETADA: 'Completada',
};

const CANCEL_MIN_HOURS = 24;

/** Hora de recogida como instante (las fechas de la API son hora de Ecuador, UTC-5, si no traen zona). */
function pickupMs(iso?: string): number {
  if (!iso) return NaN;
  return new Date(/(Z|[+-]\d{2}:\d{2})$/.test(iso) ? iso : `${iso.length === 16 ? `${iso}:00` : iso}-05:00`).getTime();
}

/** Diálogo modal mínimo (fondo oscuro + tarjeta). */
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-md bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function ConfirmationPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { byId: agencyById } = useAgencies();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelResult, setCancelResult] = useState<CancelResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editingExtras, setEditingExtras] = useState(false);
  const [draftExtras, setDraftExtras] = useState<string[]>([]);
  const [savingExtras, setSavingExtras] = useState(false);

  function loadOrder() {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    autosApi
      .getOrder(orderId)
      .then((data) => {
        setOrder(data);
        setDraftExtras(data.extras ?? []);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar la orden.'),
      )
      .finally(() => setLoading(false));
  }

  useEffect(loadOrder, [orderId]);

  // Refresh silencioso: si Booking cancela o el mostrador entrega el auto, la tarjeta cambia sola (sin loader).
  usePolling(async () => {
    if (!orderId || cancelling || savingExtras) return;
    const fresh = await autosApi.getOrder(orderId);
    setOrder((prev) =>
      prev && prev.status === fresh.status && prev.total_price === fresh.total_price && prev.extras.join() === fresh.extras.join()
        ? prev
        : fresh,
    );
  });

  async function handleCancel() {
    if (!orderId) return;
    setCancelling(true);
    setError(null);
    try {
      const result = await autosApi.cancelOrder(orderId);
      setConfirmingCancel(false);
      setCancelResult(result);
      setOrder((prev) => (prev ? { ...prev, status: 'CANCELLED' } : prev));
    } catch (err) {
      setConfirmingCancel(false);
      setError(err instanceof ApiError ? err.message : 'No se pudo cancelar la orden.');
    } finally {
      setCancelling(false);
    }
  }

  function toggleDraftExtra(id: string) {
    setDraftExtras((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    );
  }

  async function handleSaveExtras() {
    if (!orderId || !order) return;
    setSavingExtras(true);
    setError(null);

    const current = new Set(order.extras ?? []);
    const next = new Set(draftExtras);
    const extras_to_add = draftExtras.filter((e) => !current.has(e));
    const extras_to_remove = (order.extras ?? []).filter((e) => !next.has(e));

    try {
      const updated = await autosApi.modifyOrder(orderId, { extras_to_add, extras_to_remove });
      setOrder(updated);
      setDraftExtras(updated.extras ?? []);
      setEditingExtras(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron actualizar los extras.');
    } finally {
      setSavingExtras(false);
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="h-40 animate-pulse rounded-md bg-neutral-100" />
      </PageContainer>
    );
  }

  if (error && !order) {
    return (
      <PageContainer>
        <ErrorState message={error} onRetry={loadOrder} />
      </PageContainer>
    );
  }

  if (!order) return null;

  const depotId = Number(order.vehicle_details.depot_id);
  const agency = agencyById[depotId];
  const AgencyIcon = agency?.airport ? PlaneIcon : MapPinIcon;
  const dateFmt = new Intl.DateTimeFormat('es-EC', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  const pickupAt = order.route_details?.pickup?.datetime;
  const dropoffAt = order.route_details?.dropoff?.datetime;
  const pickedUp = order.status === 'ENTREGADO' || order.status === 'COMPLETADA';
  const msToPickup = pickupMs(pickupAt) - Date.now();
  const cancelOpen = order.status === 'CONFIRMED' && !(msToPickup < CANCEL_MIN_HOURS * 3_600_000);

  return (
    <PageContainer>
    <div className="flex max-w-xl flex-col gap-6">
      <Card className="flex flex-col gap-5">
        {typeof order.vehicle_details.image_url === 'string' && (
          <VehicleImage
            src={order.vehicle_details.image_url}
            alt={`${order.vehicle_details.make} ${order.vehicle_details.model}`}
            className="h-48 w-full rounded-md"
          />
        )}
        {typeof order.vehicle_details.make === 'string' && (
          <p className="-mb-2 text-sm font-bold text-neutral-700">
            {String(order.vehicle_details.make)} {String(order.vehicle_details.model)}
          </p>
        )}
        <div className="flex items-start justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium text-neutral-500">
              {order.status === 'CONFIRMED' && <CheckCircleIcon className="size-4 text-success-600" />}
              Código de reserva
            </p>
            <p className="display-heading text-2xl text-neutral-900 sm:text-3xl">{order.locator}</p>
          </div>
          <Badge tone={STATUS_TONE[order.status]}>{STATUS_LABEL[order.status]}</Badge>
        </div>

        {(agency || pickupAt) && (
          <div className="grid grid-cols-1 gap-3 border-t border-neutral-200 pt-4 sm:grid-cols-2">
            {[
              { label: 'Recogida', at: pickupAt },
              { label: 'Entrega', at: dropoffAt },
            ].map((leg) => (
              <div key={leg.label} className="flex flex-col gap-1.5 rounded-md bg-neutral-50 p-3">
                <p className="text-xs font-bold uppercase tracking-widest text-brand-600">{leg.label}</p>
                {leg.at && (
                  <p className="flex items-center gap-1.5 text-sm font-semibold capitalize text-neutral-900">
                    <CalendarIcon className="size-4 text-neutral-400" />
                    {dateFmt.format(new Date(leg.at))}
                  </p>
                )}
                {agency && (
                  <p className="flex items-start gap-1.5 text-sm text-neutral-600">
                    <AgencyIcon className="mt-0.5 size-4 shrink-0 text-neutral-400" />
                    <span>
                      {agency.name}
                      <span className="block text-xs text-neutral-400">
                        {cityLabel(agency.city_id)}, Ecuador
                      </span>
                    </span>
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-1 border-t border-neutral-200 pt-4">
          <div className="flex justify-between text-sm">
            <span className="text-neutral-500">Total</span>
            <span className="font-semibold text-neutral-900">
              ${order.total_price.toFixed(2)} {order.currency}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-neutral-500">Reservado el</span>
            <span className="font-medium text-neutral-700">
              {new Date(order.creation_date).toLocaleString('es-EC')}
            </span>
          </div>
        </div>

        {error && <ErrorState message={error} />}

        {pickedUp && (
          <p className="rounded-md bg-neutral-50 p-3 text-sm text-neutral-600">
            Vehículo entregado / Alquiler en curso (No cancelable)
          </p>
        )}
        {order.status === 'CONFIRMED' && !cancelOpen && (
          <p className="rounded-md bg-warning-50 p-3 text-sm text-neutral-700">
            Cancelación no disponible (menos de 24h antes del retiro del vehículo). La política de
            cancelación gratuita aplica hasta 24h antes.
          </p>
        )}

        <div className="flex gap-3">
          {cancelOpen && (
            <Button variant="destructive" onClick={() => setConfirmingCancel(true)}>
              Cancelar Renta
            </Button>
          )}
          <Link to="/">
            <Button variant="secondary" type="button">
              Nueva búsqueda
            </Button>
          </Link>
        </div>
      </Card>

      {order.status === 'CONFIRMED' && (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-neutral-800">Extras de la reserva</p>
            {!editingExtras && (
              <button
                onClick={() => setEditingExtras(true)}
                className="text-sm font-semibold text-brand-500 hover:underline"
              >
                Modificar
              </button>
            )}
          </div>

          {!editingExtras && (
            <div className="flex flex-wrap gap-1.5">
              {order.extras.length === 0 ? (
                <span className="text-sm text-neutral-500">Sin extras agregados.</span>
              ) : (
                order.extras.map((id) => (
                  <Badge key={id} tone="brand">
                    {EXTRAS_CATALOG.find((e) => e.id === id)?.label ?? id}
                  </Badge>
                ))
              )}
            </div>
          )}

          {editingExtras && (
            <>
              <div className="flex flex-col gap-2">
                {EXTRAS_CATALOG.map((extra) => (
                  <label
                    key={extra.id}
                    className="flex cursor-pointer items-center justify-between rounded-sm border border-neutral-200 px-3 py-2.5 hover:bg-neutral-50"
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draftExtras.includes(extra.id)}
                        onChange={() => toggleDraftExtra(extra.id)}
                        className="size-4 accent-[var(--color-brand-500)]"
                      />
                      <span className="text-sm text-neutral-800">{extra.label}</span>
                    </span>
                    <Badge tone="brand">${extra.price}</Badge>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" loading={savingExtras} onClick={handleSaveExtras}>
                  Guardar cambios
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setDraftExtras(order.extras ?? []);
                    setEditingExtras(false);
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
    </div>

    {confirmingCancel && (
      <Modal onClose={() => !cancelling && setConfirmingCancel(false)}>
        <h2 className="text-lg font-bold text-neutral-900">¿Cancelar esta renta?</h2>
        <p className="mt-2 text-sm text-neutral-600">
          Se anulará la reserva <strong>{order.locator}</strong> y el vehículo volverá a estar
          disponible para otros usuarios. Se te reembolsará el 100% del monto pagado.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            type="button"
            disabled={cancelling}
            onClick={() => setConfirmingCancel(false)}
          >
            Volver
          </Button>
          <Button variant="destructive" loading={cancelling} onClick={handleCancel}>
            Sí, cancelar renta
          </Button>
        </div>
      </Modal>
    )}

    {cancelResult && (
      <Modal onClose={() => setCancelResult(null)}>
        <Badge tone="success">Cancelada</Badge>
        <h2 className="mt-3 text-lg font-bold text-neutral-900">
          ¡Cancelación y Reembolso Exitosos!
        </h2>
        <dl className="mt-3 flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Código de Reembolso</dt>
            <dd className="font-semibold text-neutral-900">{cancelResult.refund.refund_id}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Monto Reembolsado</dt>
            <dd className="font-semibold text-neutral-900">
              {cancelResult.refund.percentage}% (${cancelResult.refund.amount.toFixed(2)}{' '}
              {cancelResult.refund.currency})
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Inventario</dt>
            <dd className="font-semibold text-success-600">✓ Vehículo liberado a DISPONIBLE</dd>
          </div>
        </dl>
        <div className="mt-5 flex justify-end">
          <Button onClick={() => setCancelResult(null)}>Entendido</Button>
        </div>
      </Modal>
    )}
    </PageContainer>
  );
}
