import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import {
  ArrowLeftIcon,
  BagIcon,
  DoorIcon,
  MapPinIcon,
  PlaneIcon,
  StarIcon,
  UsersIcon,
} from '../components/icons';
import { PageContainer } from '../components/PageContainer';
import { VehicleImage } from '../components/VehicleImage';
import { EmptyState, ErrorState } from '../components/StateViews';
import { ApiError, autosApi } from '../lib/api';
import { useBooking } from '../lib/booking-context';
import { cityLabel, useAgencies } from '../lib/depots';
import { useSuppliers } from '../lib/suppliers';
import { EXTRAS_CATALOG } from '../lib/extras-catalog';

export function VehicleDetailPage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const navigate = useNavigate();
  const { searchRequest, searchResponse, detailsById, setHoldId, setPreview } = useBooking();
  const { byId: agencyById } = useAgencies();
  const supplierNames = useSuppliers();
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = searchResponse?.data.find((v) => v.vehicle_id === vehicleId);
  const detail = vehicleId ? detailsById[vehicleId] : undefined;

  if (!searchResponse || !result || !vehicleId) {
    return (
      <PageContainer>
        <EmptyState
          title="No encontramos ese vehículo"
          description="La búsqueda pudo haber expirado. Intenta buscar de nuevo."
          actionLabel="Ir a buscar"
          onAction={() => navigate('/')}
        />
      </PageContainer>
    );
  }

  const driverAge = searchRequest?.driver.age ?? 0;
  const underAge = driverAge < result.min_driver_age;
  const canBook = result.available && !underAge;
  const agency = agencyById[result.depot_id];
  const AgencyIcon = agency?.airport ? PlaneIcon : MapPinIcon;

  function toggleExtra(id: string) {
    setSelectedExtras((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    );
  }

  async function handleContinue() {
    setLoading(true);
    setError(null);
    try {
      const hold = await autosApi.hold({
        vehicle_id: vehicleId!,
        search_token: searchResponse!.search_token,
      });
      setHoldId(hold.hold_id);

      const preview = await autosApi.preview({
        vehicle_id: vehicleId!,
        search_token: searchResponse!.search_token,
        hold_id: hold.hold_id,
        extras: selectedExtras,
      });
      setPreview(preview.data.order_preview_id, preview.data.total_price);

      navigate('/checkout');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo bloquear el vehículo. Intenta nuevamente.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageContainer>
      <div className="flex max-w-2xl flex-col gap-6">
        <button
          onClick={() => navigate('/resultados')}
          className="flex items-center gap-1.5 self-start text-sm font-bold text-brand-600 hover:underline"
        >
          <ArrowLeftIcon className="size-4" /> Volver a resultados
        </button>

        <Card className="flex flex-col gap-4 overflow-hidden !p-0">
          <VehicleImage
            src={detail?.image_url}
            alt={detail ? `${detail.make} ${detail.model}` : vehicleId}
            className="h-64 w-full sm:h-80"
          />
          <div className="flex flex-col gap-4 p-6 pt-2">
          <div className="flex items-center gap-4">
            <div>
              <p className="display-heading text-xl text-neutral-900">
                {detail ? `${detail.make} ${detail.model}` : vehicleId}
              </p>
              <p className="text-sm text-neutral-500">{supplierNames[result.supplier_id] ?? `Proveedor #${result.supplier_id}`}</p>
              {detail && (
                <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-neutral-500">
                  <span className="flex items-center gap-1">
                    <UsersIcon className="size-3.5" /> {detail.seats} asientos
                  </span>
                  <span className="flex items-center gap-1">
                    <DoorIcon className="size-3.5" /> {detail.doors} puertas
                  </span>
                  <span className="flex items-center gap-1">
                    <BagIcon className="size-3.5" /> {detail.bag_capacity} maletas
                  </span>
                </div>
              )}
            </div>
          </div>
          <p className="text-2xl font-extrabold text-brand-600">${result.price.toFixed(2)}</p>
          </div>
        </Card>

        {agency && (
          <Card className="flex items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <AgencyIcon className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-brand-600">
                Recogida y entrega
              </p>
              <p className="truncate text-base font-bold text-neutral-900" title={agency.name}>
                {agency.name}
              </p>
              <p className="text-sm text-neutral-500">{cityLabel(agency.city_id)}, Ecuador</p>
            </div>
            {agency.score !== null && (
              <div className="flex shrink-0 flex-col items-center rounded-md bg-neutral-50 px-3 py-2">
                <span className="flex items-center gap-1 text-lg font-extrabold tabular-nums text-neutral-900">
                  <StarIcon className="size-4 text-warning-600" />
                  {agency.score.toFixed(1)}
                </span>
                <span className="text-[11px] font-medium text-neutral-500">valoración</span>
              </div>
            )}
          </Card>
        )}

        <Card className="flex flex-col gap-3">
          <p className="text-sm font-bold text-neutral-800">Agrega extras (opcional)</p>
          <div className="flex flex-col gap-2">
            {EXTRAS_CATALOG.map((extra) => (
              <label
                key={extra.id}
                className="flex cursor-pointer items-center justify-between rounded-sm border border-neutral-200 px-3 py-2.5 hover:bg-neutral-50"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedExtras.includes(extra.id)}
                    onChange={() => toggleExtra(extra.id)}
                    className="size-4 accent-[var(--color-brand-500)]"
                  />
                  <span className="text-sm text-neutral-800">{extra.label}</span>
                </span>
                <Badge tone="brand">${extra.price}</Badge>
              </label>
            ))}
          </div>
        </Card>

        {result.available && underAge && (
          <div
            role="alert"
            className="rounded-md border border-warning-600/30 bg-warning-50 px-4 py-3 text-sm font-medium text-warning-600"
          >
            Este auto exige un conductor de al menos {result.min_driver_age} años y el conductor
            indicado tiene {driverAge}. Modifica la búsqueda o elige otro auto.
          </div>
        )}

        {!result.available && (
          <div
            role="alert"
            className="rounded-md border border-danger-600/30 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-600"
          >
            Este auto ya está reservado y no estará disponible hasta que el administrador lo libere.
          </div>
        )}

        {error && <ErrorState message={error} onRetry={handleContinue} />}

        <Button
          size="lg"
          loading={loading}
          disabled={!canBook}
          onClick={handleContinue}
          className="self-start px-10"
        >
          {!result.available ? 'Auto reservado' : underAge ? 'Edad no permitida' : 'Continuar con la reserva'}
        </Button>
      </div>
    </PageContainer>
  );
}
