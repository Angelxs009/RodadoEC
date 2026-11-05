import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, adminApi, type DeliveryResult } from '../lib/api';
import type { AdminOrder } from '../types/admin';
import { Button } from './Button';
import { Input } from './Input';

/** Resumen del aviso a Booking para mostrarlo al operador tras confirmar la entrega. */
export function deliveryNotice(order: AdminOrder, result: DeliveryResult) {
  const sync = result.booking_sync;
  return sync?.notified
    ? { tone: 'success' as const, text: `Entrega de ${order.locator} confirmada y notificada al Booking.` }
    : {
        tone: 'warning' as const,
        text: `Entrega de ${order.locator} confirmada, pero el Booking no recibió el aviso${sync?.reason ? `: ${sync.reason}` : ''}.`,
      };
}

/** Diálogo de check-in de entrega en mostrador: licencia, kilometraje y observaciones. */
export function DeliveryDialog({
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
            Confirmar entrega de llaves
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
            placeholder="Contrato y licencia validados"
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
