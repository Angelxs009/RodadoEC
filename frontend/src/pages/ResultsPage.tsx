import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AgencyLine } from '../components/AgencyLine';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { BagIcon, CalendarIcon, DoorIcon, MapPinIcon, UsersIcon } from '../components/icons';
import { PageContainer } from '../components/PageContainer';
import { VehicleImage } from '../components/VehicleImage';
import { EmptyState, ErrorState, VehicleCardSkeleton } from '../components/StateViews';
import { ApiError, autosApi } from '../lib/api';
import { useBooking } from '../lib/booking-context';
import { cityLabel, useAgencies } from '../lib/depots';

function formatRange(from: string, to: string) {
  const fmt = new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${fmt.format(new Date(from))} → ${fmt.format(new Date(to))}`;
}

export function ResultsPage() {
  const navigate = useNavigate();
  const { searchRequest, searchResponse, detailsById: details, setDetailsById } = useBooking();

  const { byId: agencyById } = useAgencies();
  const [agencyFilter, setAgencyFilter] = useState<number | null>(null);

  const summary = searchRequest && {
    city: cityLabel(searchRequest.route.pickup.location.city_id),
    dates: formatRange(searchRequest.route.pickup.datetime, searchRequest.route.dropoff.datetime),
    age: searchRequest.driver.age,
    days: Math.max(
      1,
      Math.ceil(
        (new Date(searchRequest.route.dropoff.datetime).getTime() -
          new Date(searchRequest.route.pickup.datetime).getTime()) /
          86400000,
      ),
    ),
  };
  const driverAge = searchRequest?.driver.age ?? 0;
  const availableCount =
    searchResponse?.data.filter((v) => v.available && driverAge >= v.min_driver_age).length ?? 0;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Agencias presentes en esta búsqueda, con cuántos autos tiene cada una.
  const agencyCounts = new Map<number, number>();
  for (const r of searchResponse?.data ?? []) {
    agencyCounts.set(r.depot_id, (agencyCounts.get(r.depot_id) ?? 0) + 1);
  }
  const visible = (searchResponse?.data ?? []).filter(
    (r) => agencyFilter === null || r.depot_id === agencyFilter,
  );

  useEffect(() => {
    if (!searchResponse) return;

    let cancelled = false;
    setAgencyFilter(null);
    setLoading(true);
    setError(null);

    autosApi
      .details()
      .then((res) => {
        if (cancelled) return;
        const map: Record<string, typeof res.data[number]> = {};
        for (const d of res.data) map[d.vehicle_id] = d;
        setDetailsById(map);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar el detalle de los autos.');
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [searchResponse]);

  if (!searchResponse) {
    return (
      <PageContainer>
        <EmptyState
          title="Todavía no hay una búsqueda activa"
          description="Vuelve al buscador para indicar ciudad y fechas de renta."
          actionLabel="Ir a buscar"
          onAction={() => navigate('/')}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <div className="flex items-baseline justify-between">
          <h1 className="display-heading text-2xl text-neutral-900 sm:text-3xl">
            {availableCount} {availableCount === 1 ? 'auto disponible' : 'autos disponibles'}
          </h1>
          <Link to="/" className="text-sm font-bold text-brand-600 hover:underline">
            Modificar búsqueda
          </Link>
        </div>

        {summary && (
          <div className="flex flex-wrap gap-2">
            {[
              { icon: MapPinIcon, text: summary.city },
              { icon: CalendarIcon, text: summary.dates },
              { icon: UsersIcon, text: `Conductor ${summary.age} años` },
            ].map((chip) => (
              <span
                key={chip.text}
                className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm"
              >
                <chip.icon className="size-3.5 text-brand-500" />
                {chip.text}
              </span>
            ))}
          </div>
        )}

        {agencyCounts.size > 1 && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por agencia">
            {[
              { id: null, label: 'Todas las agencias', count: searchResponse.data.length },
              ...[...agencyCounts.entries()].map(([id, count]) => ({
                id,
                label: agencyById[id]?.name ?? `Agencia ${id}`,
                count,
              })),
            ].map((chip) => {
              const active = agencyFilter === chip.id;
              return (
                <button
                  key={chip.id ?? 'all'}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setAgencyFilter(chip.id)}
                  className={`flex max-w-full items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
                    active
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-800'
                  }`}
                >
                  <span className="truncate">{chip.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                      active ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {error && <ErrorState message={error} />}

        {loading && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <VehicleCardSkeleton key={i} />
            ))}
          </div>
        )}

        {!loading && searchResponse.data.length === 0 && (
          <EmptyState
            title={`No hay autos en ${summary?.city ?? 'esa ciudad'}`}
            description="Prueba con otra ciudad o ajusta la búsqueda."
            actionLabel="Ajustar búsqueda"
            onAction={() => navigate('/')}
          />
        )}

        {!loading && visible.length > 0 && (
          <div className="flex flex-col gap-3">
            {visible.map((result, index) => {
              const detail = details[result.vehicle_id];
              const reserved = !result.available;
              const underAge = driverAge < result.min_driver_age;
              const blocked = reserved || underAge;
              return (
                <Card
                  key={result.vehicle_id}
                  style={{ animationDelay: `${index * 60}ms` }}
                  className={`fade-up group flex flex-col items-stretch gap-4 !p-3 transition-all duration-200 sm:flex-row sm:items-center sm:!pr-6 ${
                    blocked
                      ? 'bg-neutral-50'
                      : 'hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg'
                  }`}
                >
                  <VehicleImage
                    src={detail?.image_url}
                    alt={detail ? `${detail.make} ${detail.model}` : result.vehicle_id}
                    className={`h-44 w-full shrink-0 rounded-md sm:h-32 sm:w-52 ${blocked ? 'opacity-50 grayscale' : ''}`}
                  />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-bold text-neutral-900">
                        {detail ? `${detail.make} ${detail.model}` : result.vehicle_id}
                      </p>
                      {reserved && <Badge tone="danger">Reservado</Badge>}
                      {!reserved && underAge && (
                        <Badge tone="warning">Desde {result.min_driver_age} años</Badge>
                      )}
                    </div>
                    <AgencyLine agency={agencyById[result.depot_id]} />
                    {detail && (
                      <div className="flex flex-wrap gap-3 text-xs font-semibold text-neutral-500">
                        <span className="flex items-center gap-1">
                          <UsersIcon className="size-3.5" /> {detail.seats}
                        </span>
                        <span className="flex items-center gap-1">
                          <DoorIcon className="size-3.5" /> {detail.doors}
                        </span>
                        <span className="flex items-center gap-1">
                          <BagIcon className="size-3.5" /> {detail.bag_capacity}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex w-full items-center justify-between gap-4 sm:w-auto sm:flex-col sm:items-end">
                    <div className="sm:text-right">
                      <p className="text-2xl font-extrabold leading-none text-neutral-900">
                        ${result.price.toFixed(2)}
                        <span className="ml-1 text-xs font-medium text-neutral-400">total</span>
                      </p>
                      {summary && (
                        <p className="mt-1 text-xs font-semibold text-brand-600">
                          ${(result.price / summary.days).toFixed(2)} / día · {summary.days}{' '}
                          {summary.days === 1 ? 'día' : 'días'}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      disabled={blocked}
                      onClick={() => navigate(`/auto/${result.vehicle_id}`)}
                    >
                      {blocked ? 'No disponible' : 'Seleccionar'}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
