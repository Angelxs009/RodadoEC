import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { PageContainer } from '../../components/PageContainer';
import { EmptyState, ErrorState, VehicleCardSkeleton } from '../../components/StateViews';
import { UserIcon } from '../../components/icons';
import { ApiError, customerApi } from '../../lib/api';
import { useCustomerAuth } from '../../lib/customer-auth-context';
import type { CustomerOrder } from '../../types/customer';

const STATUS_TONE: Record<CustomerOrder['status'], 'success' | 'danger' | 'warning'> = {
  CONFIRMED: 'success',
  CANCELLED: 'danger',
  PENDING: 'warning',
};

export function MyAccountPage() {
  const navigate = useNavigate();
  const { profile, logout } = useCustomerAuth();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    customerApi
      .myOrders()
      .then(setOrders)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar tus reservas.'),
      )
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function handleLogout() {
    logout();
    navigate('/');
  }

  if (!profile) return null; // RequireCustomerAuth ya redirige antes de llegar aquí

  return (
    <PageContainer>
      <div className="flex max-w-2xl flex-col gap-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <UserIcon className="size-6" />
            </span>
            <div>
              <h1 className="display-heading text-xl text-neutral-900 sm:text-2xl">
                {profile.first_name} {profile.last_name}
              </h1>
              <p className="text-sm text-neutral-500">{profile.email}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Cerrar sesión
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-neutral-800">Mis reservas</p>

          {error && <ErrorState message={error} onRetry={load} />}

          {loading && (
            <div className="flex flex-col gap-3">
              <VehicleCardSkeleton />
              <VehicleCardSkeleton />
            </div>
          )}

          {!loading && orders.length === 0 && !error && (
            <EmptyState
              title="Todavía no tienes reservas"
              description="Cuando reserves un auto con esta cuenta, aparecerá aquí."
              actionLabel="Buscar autos"
              onAction={() => navigate('/')}
            />
          )}

          {!loading &&
            orders.map((o) => (
              <Card key={o.id} className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-bold text-neutral-900">
                    {o.vehicle_details.make} {o.vehicle_details.model}
                  </p>
                  <p className="font-mono text-xs text-neutral-500">{o.locator}</p>
                  <p className="text-xs text-neutral-500">
                    {new Date(o.creation_date).toLocaleString('es-EC')}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge>
                  <p className="text-sm font-bold text-neutral-900">
                    ${o.total_price.toFixed(2)} {o.currency}
                  </p>
                  <Link
                    to={`/orden/${o.id}`}
                    className="text-xs font-semibold text-brand-600 hover:underline"
                  >
                    Ver detalle
                  </Link>
                </div>
              </Card>
            ))}
        </div>
      </div>
    </PageContainer>
  );
}
