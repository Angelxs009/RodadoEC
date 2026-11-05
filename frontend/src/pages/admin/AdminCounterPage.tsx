import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { DeliveryDialog, deliveryNotice } from '../../components/DeliveryDialog';
import { EmptyState, ErrorState } from '../../components/StateViews';
import { ApiError, adminApi, findClient, type DeliveryResult } from '../../lib/api';
import type { AdminOrder } from '../../types/admin';

type Tone = 'success' | 'danger' | 'warning' | 'brand' | 'neutral';

// La orden recién recibida de Booking está CONFIRMED en el backend; para el operador es "Reservado".
const STATUS_VIEW: Record<string, { label: string; tone: Tone }> = {
  CONFIRMED: { label: 'RESERVADO', tone: 'success' },
  ENTREGADO: { label: 'ENTREGADO', tone: 'brand' },
  COMPLETADA: { label: 'COMPLETADA', tone: 'neutral' },
  CANCELLED: { label: 'CANCELADA', tone: 'danger' },
};

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

function driverName(o: AdminOrder) {
  const d = o.driver_details;
  return [d?.first_name, d?.last_name].filter(Boolean).join(' ') || 'Sin nombre';
}

/** Pantalla del operador de mostrador: busca la reserva y confirma la entrega de llaves (check-in). */
export function AdminCounterPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  // Correo del cliente hallado por cédula/identificación (los pedidos guardan correo, no cédula).
  const [emailByIdentification, setEmailByIdentification] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [delivering, setDelivering] = useState<AdminOrder | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    adminApi
      .listOrders()
      .then(setOrders)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudieron cargar las reservas.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function search(e: FormEvent) {
    e.preventDefault();
    const q = norm(query);
    setApplied(q);
    setEmailByIdentification(null);
    // Sin "@": puede ser una cédula. Se resuelve contra /api/v3/clientes para obtener el correo del conductor.
    if (q && !q.includes('@')) {
      setSearching(true);
      try {
        const client = await findClient({ identificacion: query.trim() });
        setEmailByIdentification(client ? norm(client.email) : null);
      } catch {
        setEmailByIdentification(null);
      } finally {
        setSearching(false);
      }
    }
  }

  const results = useMemo(() => {
    if (!applied) return orders.filter((o) => o.status === 'CONFIRMED');
    return orders.filter((o) => {
      const email = norm(o.driver_details?.email);
      return (
        norm(o.locator).includes(applied) ||
        email.includes(applied) ||
        norm(driverName(o)).includes(applied) ||
        (emailByIdentification !== null && email === emailByIdentification)
      );
    });
  }, [orders, applied, emailByIdentification]);

  function onDelivered(order: AdminOrder, result: DeliveryResult) {
    setDelivering(null);
    setNotice(deliveryNotice(order, result));
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="display-heading text-2xl text-neutral-900 sm:text-3xl">Mostrador de entregas</h1>
        <p className="text-sm text-neutral-500">
          Busca la reserva del cliente y confirma la entrega de llaves. Se avisa al Booking automáticamente.
        </p>
      </div>

      <form onSubmit={search} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium text-neutral-700">Código de reserva, cédula o correo</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ej. CARM7CAW, 1712345678 o ana@correo.com"
            className="h-11 rounded-sm border border-neutral-300 px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
          />
        </label>
        <div className="flex gap-3">
          <Button type="submit" loading={searching}>
            Buscar
          </Button>
          {applied && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQuery('');
                setApplied('');
                setEmailByIdentification(null);
              }}
            >
              Limpiar
            </Button>
          )}
        </div>
      </form>

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

      {!loading && !error && results.length === 0 && (
        <EmptyState
          title={applied ? 'No hay reservas con ese dato' : 'Sin reservas pendientes de entrega'}
          description={
            applied
              ? 'Revisa el código, la cédula o el correo, o pulsa Limpiar para ver las pendientes.'
              : 'Las reservas recibidas de Booking aparecerán aquí como Reservado.'
          }
        />
      )}

      {!loading && results.length > 0 && (
        <>
          <p className="text-sm font-medium text-neutral-500">
            {applied ? `${results.length} resultado(s)` : `${results.length} reserva(s) pendiente(s) de entrega`}
          </p>
          <ul className="flex flex-col gap-3">
            {results.map((o) => {
              const view = STATUS_VIEW[o.status] ?? { label: o.status, tone: 'neutral' as Tone };
              return (
                <li
                  key={o.id}
                  className="flex flex-col gap-4 rounded-md border border-neutral-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-neutral-900">{o.locator}</span>
                      <Badge tone={view.tone}>{view.label}</Badge>
                    </div>
                    <p className="truncate text-sm text-neutral-700">
                      {o.vehicle_details.make} {o.vehicle_details.model} · {driverName(o)}
                    </p>
                    <p className="truncate text-sm text-neutral-500">{o.driver_details?.email ?? 'Sin correo'}</p>
                  </div>
                  {o.status === 'CONFIRMED' && (
                    <Button onClick={() => setDelivering(o)} className="shrink-0">
                      Confirmar entrega de llaves
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {delivering && (
        <DeliveryDialog order={delivering} onClose={() => setDelivering(null)} onDone={onDelivered} />
      )}
    </div>
  );
}
