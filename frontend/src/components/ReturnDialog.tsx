import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, adminApi, type ReturnResult } from '../lib/api';
import type { AdminOrder } from '../types/admin';
import { Button } from './Button';
import { Input } from './Input';

/** Resumen para el operador tras registrar la devolución: km recorridos, limpieza y alerta de mantenimiento. */
export function returnNotice(order: AdminOrder, result: ReturnResult) {
  const alerta = result.alerta_mantenimiento?.startsWith('ALERTA') ? ` ${result.alerta_mantenimiento}` : '';
  return {
    tone: alerta ? ('warning' as const) : ('success' as const),
    text: `Devolución de ${order.locator} registrada: ${result.km_recorridos} km recorridos. El auto queda ${
      result.cooldown?.cooldown_horas ?? 2
    } h en limpieza antes de volver a estar disponible.${alerta}`,
  };
}

/** Diálogo de check-in de devolución en mostrador: kilometraje de retorno, combustible y observaciones. */
export function ReturnDialog({
  order,
  onClose,
  onDone,
}: {
  order: AdminOrder;
  onClose: () => void;
  onDone: (order: AdminOrder, result: ReturnResult) => void;
}) {
  const [km, setKm] = useState('');
  const [fuel, setFuel] = useState('');
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
    const fuelNumber = fuel.trim() === '' ? undefined : Number(fuel);
    if (!Number.isInteger(kmNumber) || kmNumber < 0) {
      setError('Escribe el kilometraje de retorno (entero mayor o igual a 0).');
      return;
    }
    if (fuelNumber !== undefined && (!Number.isInteger(fuelNumber) || fuelNumber < 0 || fuelNumber > 100)) {
      setError('El nivel de combustible es un porcentaje entero de 0 a 100.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await adminApi.confirmReturn(order.locator, {
        km_retorno: kmNumber,
        nivel_combustible: fuelNumber,
        observaciones: notes.trim() || undefined,
      });
      onDone(order, result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar la devolución.');
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
        aria-labelledby="return-title"
        onSubmit={submit}
        className="flex w-full max-w-md flex-col gap-5 rounded-lg bg-white p-6 shadow-xl"
      >
        <div className="flex flex-col gap-1">
          <h2 id="return-title" className="text-lg font-semibold text-neutral-900">
            Registrar devolución
          </h2>
          <p className="text-sm text-neutral-500">
            Orden <span className="font-mono">{order.locator}</span> · {order.vehicle_details.make}{' '}
            {order.vehicle_details.model}. Al confirmar, la orden pasa a COMPLETADA y el auto entra 2 h en limpieza. No
            hay reembolso por devolución anticipada.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <Input
            label="Kilometraje de retorno"
            type="number"
            inputMode="numeric"
            min={0}
            value={km}
            onChange={(e) => setKm(e.target.value)}
            placeholder="Debe ser mayor o igual al de salida"
            autoFocus
          />
          <Input
            label="Nivel de combustible % (opcional)"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={fuel}
            onChange={(e) => setFuel(e.target.value)}
            placeholder="100"
          />
          <Input
            label="Observaciones (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Sin daños, tanque lleno"
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
            Confirmar devolución
          </Button>
        </div>
      </form>
    </div>
  );
}
