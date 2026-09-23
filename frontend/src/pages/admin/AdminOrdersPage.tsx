import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/Badge';
import { EmptyState, ErrorState } from '../../components/StateViews';
import { Table, TableBody, TableHead, Td, Th, Tr } from '../../components/Table';
import { ApiError, adminApi } from '../../lib/api';
import type { AdminOrder } from '../../types/admin';
import type { OrderStatus } from '../../types/autos';

const STATUS_TONE: Record<OrderStatus, 'success' | 'danger' | 'warning'> = {
  CONFIRMED: 'success',
  CANCELLED: 'danger',
  PENDING: 'warning',
};

export function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="display-heading text-2xl text-neutral-900 sm:text-3xl">Todas las órdenes</h1>
        <p className="text-sm text-neutral-500">Vista operativa de todas las reservas del sistema.</p>
      </div>

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
                  <Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge>
                </Td>
                <Td>${o.total_price.toFixed(2)} {o.currency}</Td>
                <Td>{new Date(o.creation_date).toLocaleString('es-EC')}</Td>
                <Td>
                  <Link to={`/orden/${o.id}`} className="text-sm font-semibold text-brand-500 hover:underline">
                    Ver
                  </Link>
                </Td>
              </Tr>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
