import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
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
    const sync = result.booking_sync;
    setDelivering(null);
    setNotice(
      sync?.notified
        ? { tone: 'success', text: `Entrega de ${order.locator} confirmada y notificada al Booking.` }
        : {
            tone: 'warning',
            text: `Entrega de ${order.locator} confirmada, pero el Booking no recibió el aviso${sync?.reason ? `: ${sync.reason}` : ''}.`,
          },
    );
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

function DeliveryDialog({
  order,
  onClose,
  onDone,
}: {
  order: AdminOrder;
  onClose: () => void;
  onDone: (order: AdminOrder, result: DeliveryResult) => void;
}) {
  const [license, setLicense] = useState('');
  const [km, setKm] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !submitting && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const kmNumber = Number(km);
    if (!license.trim() || !Number.isInteger(kmNumber) || kmNumber < 0) {
      setError('Escribe la licencia y un kilometraje entero mayor o igual a 0.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await adminApi.confirmDelivery(order.locator, {
        licencia_conducir: license.trim(),
        km_salida: kmNumber,
        tecnico_entrega: 'operador-mostrador',
        observaciones: notes.trim() || undefined,
      });
      onDone(order, result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo confirmar la entrega.');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/50 p-4 sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && !submitting && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="delivery-title"
        onSubmit={submit}
        className="flex w-full max-w-md flex-col gap-5 rounded-lg bg-white p-6 shadow-xl"
      >
        <div className="flex flex-col gap-1">
          <h2 id="delivery-title" className="text-lg font-semibold text-neutral-900">
            Confirmar entrega
          </h2>
          <p className="text-sm text-neutral-500">
            Orden <span className="font-mono">{order.locator}</span> · {order.vehicle_details.make}{' '}
            {order.vehicle_details.model}. Al confirmar, el auto pasa a ENTREGADO y se avisa al Booking.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <Input
            label="Licencia del conductor"
            value={license}
            onChange={(e) => setLicense(e.target.value)}
            placeholder="Como figura en la reserva"
            autoFocus
          />
          <Input
            label="Kilometraje de salida"
            type="number"
            inputMode="numeric"
            min={0}
            value={km}
            onChange={(e) => setKm(e.target.value)}
            placeholder="0"
          />
          <Input
            label="Observaciones (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Contrato y licencia firmados"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm font-medium text-danger-600">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" loading={submitting}>
            Confirmar entrega
          </Button>
        </div>
      </form>
    </div>
  );
}
