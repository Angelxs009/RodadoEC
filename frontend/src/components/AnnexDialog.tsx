import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, createAnnexContract, type AnnexContract } from '../lib/api';
import { EXTRAS_CATALOG } from '../lib/extras-catalog';
import type { AdminOrder } from '../types/admin';
import { Button } from './Button';
import { Input } from './Input';

const DAILY_PRICE: Record<string, number> = { GPS: 5, SILLA_BEBE: 5, CONDUCTOR_ADICIONAL: 5 };

/** Resumen para el operador tras crear el contrato anexo. */
export function annexNotice(order: AdminOrder, annex: AnnexContract) {
  return {
    tone: 'success' as const,
    text: `Contrato anexo ${annex.contrato_id} creado para ${order.locator}: $${annex.total.toFixed(2)} ${annex.moneda} cobrados en mostrador. La reserva original no cambió.`,
  };
}

/**
 * Extras, upgrade o días adicionales pedidos al retirar el auto: se cobran como contrato anexo independiente
 * para no desfasar la orden de Booking ni la facturación SRI (regla oficial de mostrador).
 */
export function AnnexDialog({
  order,
  onClose,
  onDone,
}: {
  order: AdminOrder;
  onClose: () => void;
  onDone: (order: AdminOrder, annex: AnnexContract) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [days, setDays] = useState('1');
  const [otherText, setOtherText] = useState('');
  const [otherPrice, setOtherPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !submitting && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const nDays = Math.max(1, Math.floor(Number(days)) || 1);
  const otherAmount = Number(otherPrice);
  const lines = [
    ...selected.map((id) => ({
      descripcion: `${EXTRAS_CATALOG.find((e) => e.id === id)?.label ?? id} (${nDays} ${nDays === 1 ? 'día' : 'días'})`,
      precio_unitario: DAILY_PRICE[id] ?? 5,
      cantidad: nDays,
    })),
    ...(otherText.trim() && otherAmount > 0 ? [{ descripcion: otherText.trim(), precio_unitario: otherAmount, cantidad: 1 }] : []),
  ];
  const total = lines.reduce((sum, l) => sum + l.precio_unitario * l.cantidad, 0);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lines.length === 0) {
      setError('Elige al menos un extra o escribe un concepto con su precio.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const annex = await createAnnexContract(order.locator, { conceptos: lines, operador: 'operador-mostrador' });
      onDone(order, annex);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el contrato anexo.');
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
        aria-labelledby="annex-title"
        onSubmit={submit}
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-5 overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
      >
        <div className="flex flex-col gap-1">
          <h2 id="annex-title" className="text-lg font-semibold text-neutral-900">
            Extras en mostrador
          </h2>
          <p className="text-sm text-neutral-500">
            Orden <span className="font-mono">{order.locator}</span>. Se cobran como contrato anexo independiente: la
            reserva original y su factura no se modifican.
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-neutral-700">Extras</legend>
          {EXTRAS_CATALOG.map((extra) => (
            <label
              key={extra.id}
              className="flex cursor-pointer items-center justify-between rounded-sm border border-neutral-200 px-3 py-2.5 hover:bg-neutral-50"
            >
              <span className="flex items-center gap-2 text-sm text-neutral-800">
                <input
                  type="checkbox"
                  checked={selected.includes(extra.id)}
                  onChange={() => toggle(extra.id)}
                  className="size-4 accent-[var(--color-brand-500)]"
                />
                {extra.label}
              </span>
              <span className="text-xs font-semibold text-neutral-500">${extra.price}</span>
            </label>
          ))}
          <Input
            label="Días de uso de los extras"
            type="number"
            inputMode="numeric"
            min={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </fieldset>

        <div className="flex flex-col gap-3">
          <Input
            label="Upgrade u otro concepto (opcional)"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="Ej. Upgrade a SUV, día extra"
          />
          <Input
            label="Monto del concepto (USD)"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={otherPrice}
            onChange={(e) => setOtherPrice(e.target.value)}
            placeholder="0.00"
          />
        </div>

        <div className="flex items-center justify-between border-t border-neutral-200 pt-4 text-sm">
          <span className="text-neutral-500">Total del anexo</span>
          <span className="font-semibold tabular-nums text-neutral-900">${total.toFixed(2)} USD</span>
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
            Cobrar en mostrador
          </Button>
        </div>
      </form>
    </div>
  );
}
