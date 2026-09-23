import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { ErrorState } from '../components/StateViews';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import {
  BagIcon,
  CarIcon,
  DoorIcon,
  MapPinIcon,
  ShieldCheckIcon,
  SparkleIcon,
  UsersIcon,
} from '../components/icons';
import { VehicleImage } from '../components/VehicleImage';
import { ApiError, autosApi } from '../lib/api';
import { useBooking } from '../lib/booking-context';
import type { CarDetailsResult } from '../types/autos';

const CITIES = [
  { id: 1, label: 'Quito' },
  { id: 2, label: 'Guayaquil' },
  { id: 3, label: 'Cuenca' },
];

const FEATURES = [
  {
    icon: MapPinIcon,
    title: 'Cobertura nacional',
    description: 'Agencias en las principales ciudades del Ecuador.',
  },
  {
    icon: CarIcon,
    title: 'Flota variada',
    description: 'Desde compactos económicos hasta SUV premium.',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Reserva sin sorpresas',
    description: 'Precio final claro antes de confirmar, sin costos ocultos.',
  },
];

function defaultDate(daysFromNow: number, hour: string) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return `${d.toISOString().slice(0, 10)}T${hour}`;
}

export function SearchPage() {
  const navigate = useNavigate();
  const { setSearch } = useBooking();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cityId, setCityId] = useState(1);
  const [pickupDate, setPickupDate] = useState(defaultDate(3, '10:00'));
  const [dropoffDate, setDropoffDate] = useState(defaultDate(6, '10:00'));
  const [driverAge, setDriverAge] = useState(25);
  const [fleet, setFleet] = useState<CarDetailsResult[]>([]);

  useEffect(() => {
    autosApi
      .details()
      .then((res) => setFleet(res.data.filter((c) => c.image_url).slice(0, 4)))
      .catch(() => setFleet([]));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const request = {
      booker: { country: 'ec' },
      currency: 'USD',
      driver: { age: driverAge },
      route: {
        pickup: { datetime: `${pickupDate}:00Z`, location: { city_id: cityId } },
        dropoff: { datetime: `${dropoffDate}:00Z`, location: { city_id: cityId } },
      },
    };

    try {
      const response = await autosApi.search(request);
      setSearch(request, response);
      navigate('/resultados');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden bg-neutral-900 pb-28 pt-16 sm:pb-36 sm:pt-20">
        <img
          src="/hero.jpg"
          alt=""
          className="pointer-events-none absolute inset-0 size-full object-cover object-[center_35%]"
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgb(20 19 16 / 0.94) 0%, rgb(20 19 16 / 0.78) 45%, rgb(20 19 16 / 0.35) 100%)',
          }}
        />
        <div
          className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--color-brand-500), transparent 70%)' }}
        />
        <div className="relative mx-auto max-w-6xl px-4">
          <div className="flex items-center gap-2 text-brand-500">
            <SparkleIcon className="size-4" />
            <span className="text-xs font-bold uppercase tracking-widest">Renta de autos en Ecuador</span>
          </div>
          <h1 className="display-heading mt-4 max-w-2xl text-4xl text-white sm:text-6xl">
            Renta tu auto ideal.
            <br />
            <span className="text-brand-500">Paga lo justo.</span>
          </h1>
          <p className="mt-4 max-w-md text-base text-neutral-300">
            Compara precios y reserva en segundos en las principales ciudades del país.
          </p>
        </div>
      </section>

      {/* Search card — floats over the hero */}
      <div className="relative mx-auto -mt-16 w-full max-w-5xl px-4 sm:-mt-20">
        <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-lg sm:p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Select
                label="Ciudad"
                value={cityId}
                onChange={(e) => setCityId(Number(e.target.value))}
              >
                {CITIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
              <Input
                label="Recogida"
                type="datetime-local"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
                required
              />
              <Input
                label="Entrega"
                type="datetime-local"
                value={dropoffDate}
                onChange={(e) => setDropoffDate(e.target.value)}
                required
              />
              <Input
                label="Edad del conductor"
                type="number"
                min={18}
                max={99}
                value={driverAge}
                onChange={(e) => setDriverAge(Number(e.target.value))}
                required
              />
            </div>

            {error && <ErrorState message={error} />}

            <Button type="submit" size="lg" loading={loading} className="self-start px-10">
              Buscar autos disponibles
            </Button>
          </form>
        </div>
      </div>

      {/* Fleet showcase */}
      {fleet.length > 0 && (
        <section className="mx-auto mt-20 w-full max-w-6xl px-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Nuestra flota</p>
              <h2 className="display-heading mt-1 text-2xl text-neutral-900 sm:text-3xl">
                Elige el auto para tu ruta
              </h2>
            </div>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="hidden text-sm font-bold text-brand-600 hover:underline sm:block"
            >
              Buscar disponibilidad ↑
            </button>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {fleet.map((car, index) => (
              <article
                key={car.vehicle_id}
                style={{ animationDelay: `${index * 80}ms` }}
                className="fade-up group overflow-hidden rounded-md border border-neutral-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              >
                <VehicleImage
                  src={car.image_url}
                  alt={`${car.make} ${car.model}`}
                  className="h-40 w-full"
                />
                <div className="flex flex-col gap-2 p-4">
                  <p className="text-base font-bold text-neutral-900">
                    {car.make} {car.model}
                  </p>
                  <div className="flex gap-3 text-xs font-semibold text-neutral-500">
                    <span className="flex items-center gap-1">
                      <UsersIcon className="size-3.5" /> {car.seats}
                    </span>
                    <span className="flex items-center gap-1">
                      <DoorIcon className="size-3.5" /> {car.doors}
                    </span>
                    <span className="flex items-center gap-1">
                      <BagIcon className="size-3.5" /> {car.bag_capacity}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Features */}
      <section className="mx-auto mt-20 w-full max-w-6xl px-4 pb-20">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex flex-col gap-3">
              <span className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <f.icon className="size-6" />
              </span>
              <p className="display-heading text-base text-neutral-900">{f.title}</p>
              <p className="text-sm text-neutral-500">{f.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
