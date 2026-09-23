import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { PageContainer } from '../components/PageContainer';
import { EmptyState, ErrorState } from '../components/StateViews';
import { Input } from '../components/Input';
import { ApiError, autosApi } from '../lib/api';
import { useBooking } from '../lib/booking-context';

export function CheckoutPage() {
  const navigate = useNavigate();
  const { previewId, previewTotal, reset } = useBooking();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!previewId || previewTotal === null) {
    return (
      <PageContainer>
        <EmptyState
          title="No hay una reserva en curso"
          description="Selecciona un auto desde los resultados para continuar con el checkout."
          actionLabel="Ir a buscar"
          onAction={() => navigate('/')}
        />
      </PageContainer>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const order = await autosApi.createOrder({
        order_preview_id: previewId!,
        payment_reference: `MOCK-${Date.now()}`,
        driver_details: {
          first_name: firstName,
          last_name: lastName,
          email,
          phone_number: phone,
        },
      });
      reset();
      navigate(`/orden/${order.order_id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo confirmar la reserva. Intenta nuevamente.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageContainer>
      <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="display-heading text-2xl text-neutral-900 sm:text-3xl">
        Datos del conductor
      </h1>

      <Card className="flex flex-col gap-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Nombres"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
            <Input
              label="Apellidos"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>
          <Input
            label="Correo electrónico"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Teléfono"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />

          <div className="flex items-center justify-between rounded-sm bg-neutral-50 px-4 py-3">
            <span className="text-sm font-medium text-neutral-600">Total a pagar</span>
            <span className="text-xl font-bold text-brand-600">${previewTotal.toFixed(2)}</span>
          </div>

          {error && <ErrorState message={error} />}

          <Button type="submit" size="lg" loading={loading} className="self-start px-10">
            Confirmar reserva
          </Button>
        </form>
      </Card>
      </div>
    </PageContainer>
  );
}
