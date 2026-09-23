import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { CheckCircleIcon } from '../components/icons';
import { PageContainer } from '../components/PageContainer';
import { ErrorState } from '../components/StateViews';
import { VehicleImage } from '../components/VehicleImage';
import { ApiError, autosApi } from '../lib/api';
import { EXTRAS_CATALOG } from '../lib/extras-catalog';
import type { OrderDetail } from '../types/autos';

const STATUS_TONE = {
  CONFIRMED: 'success',
  CANCELLED: 'danger',
  PENDING: 'warning',
} as const;

const STATUS_LABEL = {
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  PENDING: 'Pendiente',
} as const;

export function ConfirmationPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
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

  async function handleCancel() {
    if (!orderId) return;
    setCancelling(true);
    try {
      await autosApi.cancelOrder(orderId);
      loadOrder();
    } catch (err) {
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

        <div className="flex gap-3">
          {order.status === 'CONFIRMED' && (
            <Button variant="destructive" loading={cancelling} onClick={handleCancel}>
              Cancelar reserva
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
    </PageContainer>
  );
}
