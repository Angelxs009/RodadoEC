import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { DeliveryDialog, deliveryNotice } from '../../components/DeliveryDialog';
import { EmptyState, ErrorState } from '../../components/StateViews';
import { Table, TableBody, TableHead, Td, Th, Tr } from '../../components/Table';
import { ApiError, adminApi, type DeliveryResult } from '../../lib/api';
import type { AdminOrder } from '../../types/admin';

type Tone = 'success' | 'danger' | 'warning' | 'brand' | 'neutral';

// El backend también devuelve ENTREGADO y COMPLETADA; lo desconocido se muestra neutro.
const STATUS_TONE: Record<string, Tone> = {
  CONFIRMED: 'success',
  ENTREGADO: 'brand',
  COMPLETADA: 'neutral',
  CANCELLED: 'danger',
  PENDING: 'warning',
};

export function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [delivering, setDelivering] = useState<AdminOrder | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    adminApi
      .listOrders()
      .then(setOrders)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar las órdenes.'),
      )
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function onDelivered(order: AdminOrder, result: DeliveryResult) {
    setDelivering(null);
    setNotice(deliveryNotice(order, result));
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="display-heading text-2xl text-neutral-900 sm:text-3xl">Todas las órdenes</h1>
        <p className="text-sm text-neutral-500">Vista operativa de todas las reservas del sistema.</p>
      </div>

      {notice && (
        <div
          role="status"
          className={`flex items-start justify-between gap-4 rounded-md px-4 py-3 text-sm font-medium ${
            notice.tone === 'success' ? 'bg-success-50 text-success-600' : 'bg-warning-50 text-warning-600'
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="rounded-sm font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Cerrar
          </button>
        </div>
      )}

      {error && <ErrorState message={error} onRetry={load} />}

      {loading && <div className="h-40 animate-pulse rounded-md bg-neutral-100" />}

      {!loading && orders.length === 0 && (
        <EmptyState title="Sin órdenes todavía" description="Aparecerán aquí cuando alguien reserve un auto." />
      )}

      {!loading && orders.length > 0 && (
        <Table>
          <TableHead>
            <Th>Locator</Th>
            <Th>Vehículo</Th>
            <Th>Estado</Th>
            <Th>Total</Th>
            <Th>Fecha</Th>
            <Th></Th>
          </TableHead>
          <TableBody>
            {orders.map((o) => (
              <Tr key={o.id}>
                <Td className="font-mono text-xs">{o.locator}</Td>
                <Td>
                  {o.vehicle_details.make} {o.vehicle_details.model}
                </Td>
                <Td>
                  <Badge tone={STATUS_TONE[o.status] ?? 'neutral'}>{o.status}</Badge>
                </Td>
                <Td>${o.total_price.toFixed(2)} {o.currency}</Td>
                <Td>{new Date(o.creation_date).toLocaleString('es-EC')}</Td>
                <Td>
                  <div className="flex items-center gap-3">
                    {o.status === 'CONFIRMED' && (
                      <Button size="sm" variant="secondary" onClick={() => setDelivering(o)}>
                        Confirmar entrega
                      </Button>
                    )}
                    <Link to={`/orden/${o.id}`} className="text-sm font-semibold text-brand-500 hover:underline">
                      Ver
                    </Link>
                  </div>
                </Td>
              </Tr>
            ))}
          </TableBody>
        </Table>
      )}

      {delivering && (
        <DeliveryDialog order={delivering} onClose={() => setDelivering(null)} onDone={onDelivered} />
      )}
    </div>
  );
}
