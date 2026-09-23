import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { BagIcon, CalendarIcon, DoorIcon, MapPinIcon, UsersIcon } from '../components/icons';
import { PageContainer } from '../components/PageContainer';
import { VehicleImage } from '../components/VehicleImage';
import { EmptyState, ErrorState, VehicleCardSkeleton } from '../components/StateViews';
import { ApiError, autosApi } from '../lib/api';
import { useBooking } from '../lib/booking-context';

const CITY_LABELS: Record<number, string> = { 1: 'Quito', 2: 'Guayaquil', 3: 'Cuenca' };

function formatRange(from: string, to: string) {
  const fmt = new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${fmt.format(new Date(from))} → ${fmt.format(new Date(to))}`;
}

export function ResultsPage() {
  const navigate = useNavigate();
  const { searchRequest, searchResponse, detailsById: details, setDetailsById } = useBooking();

  const summary = searchRequest && {
    city:
      CITY_LABELS[searchRequest.route.pickup.location.city_id ?? 0] ?? 'Ecuador',
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!searchResponse) return;

    let cancelled = false;
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
            {searchResponse.metadata.total_results} autos disponibles
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
            title="No encontramos autos para esos filtros"
            description="Prueba con otra ciudad o un rango de fechas distinto."
            actionLabel="Ajustar búsqueda"
            onAction={() => navigate('/')}
          />
        )}

        {!loading && searchResponse.data.length > 0 && (
          <div className="flex flex-col gap-3">
            {searchResponse.data.map((result, index) => {
              const detail = details[result.vehicle_id];
              return (
                <Card
                  key={result.vehicle_id}
                  style={{ animationDelay: `${index * 60}ms` }}
                  className="fade-up group flex flex-col items-stretch gap-4 !p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg sm:flex-row sm:items-center sm:!pr-6"
                >
                  <VehicleImage
                    src={detail?.image_url}
                    alt={detail ? `${detail.make} ${detail.model}` : result.vehicle_id}
                    className="h-44 w-full shrink-0 rounded-md sm:h-32 sm:w-52"
                  />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <p className="text-base font-bold text-neutral-900">
                      {detail ? `${detail.make} ${detail.model}` : result.vehicle_id}
                    </p>
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
                    <Button size="sm" onClick={() => navigate(`/auto/${result.vehicle_id}`)}>
                      Seleccionar
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
