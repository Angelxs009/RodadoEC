import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { CreditCardIcon, LockIcon } from '../components/icons';
import { PageContainer } from '../components/PageContainer';
import { EmptyState, ErrorState } from '../components/StateViews';
import { Input } from '../components/Input';
import { ApiError, autosApi } from '../lib/api';
import { useBooking } from '../lib/booking-context';
import { useCustomerAuth } from '../lib/customer-auth-context';

// Tarjeta de prueba aprobada por la pasarela simulada (ver POST /payments en Swagger).
const TEST_CARD = { number: '4242 4242 4242 4242', expiry: '12/30', cvv: '123' };

function formatCardNumber(value: string) {
  return value
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

function formatExpiry(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

export function CheckoutPage() {
  const navigate = useNavigate();
  const { previewId, previewTotal, reset } = useBooking();
  const { profile } = useCustomerAuth();
  const [firstName, setFirstName] = useState(profile?.first_name ?? '');
  const [lastName, setLastName] = useState(profile?.last_name ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [phone, setPhone] = useState(profile?.phone_number ?? '');
  const [cardHolder, setCardHolder] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
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

  function fillTestCard() {
    setCardHolder(cardHolder || `${firstName} ${lastName}`.trim() || 'Cliente Prueba');
    setCardNumber(TEST_CARD.number);
    setExpiry(TEST_CARD.expiry);
    setCvv(TEST_CARD.cvv);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const [mm, yy] = expiry.split('/');
    const month = Number(mm);
    const year = 2000 + Number(yy);
    if (!mm || !yy || yy.length !== 2 || month < 1 || month > 12) {
      setError('La fecha de vencimiento debe tener el formato MM/AA.');
      return;
    }

    setLoading(true);
    try {
      // 1) Pago simulado: sin un pago aprobado el backend no crea la reserva.
      const payment = await autosApi.pay({
        order_preview_id: previewId!,
        card: {
          holder_name: cardHolder,
          number: cardNumber.replace(/\s/g, ''),
          expiry_month: month,
          expiry_year: year,
          cvv,
        },
      });

      // 2) Reserva ligada a ese pago.
      const order = await autosApi.createOrder({
        order_preview_id: previewId!,
        payment_reference: payment.payment_reference,
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
          : 'No se pudo completar el pago y la reserva. Intenta nuevamente.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageContainer>
      <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-6">
        <h1 className="display-heading text-2xl text-neutral-900 sm:text-3xl">
          Datos del conductor
        </h1>

        <p className="text-sm text-neutral-500">
          Reservando como{' '}
          <span className="font-semibold text-neutral-800">{profile?.email ?? 'tu cuenta'}</span>.
          Esta reserva quedará guardada en tu cuenta.
        </p>

        <Card className="flex flex-col gap-4">
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
        </Card>

        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CreditCardIcon className="size-5 text-brand-500" />
              <h2 className="text-base font-bold text-neutral-900">Pago con tarjeta</h2>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={fillTestCard}>
              Usar tarjeta de prueba
            </Button>
          </div>

          <Input
            label="Nombre en la tarjeta"
            value={cardHolder}
            onChange={(e) => setCardHolder(e.target.value)}
            autoComplete="cc-name"
            required
          />
          <Input
            label="Número de tarjeta"
            inputMode="numeric"
            placeholder="0000 0000 0000 0000"
            value={cardNumber}
            onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
            autoComplete="cc-number"
            className="tabular-nums"
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Vencimiento (MM/AA)"
              inputMode="numeric"
              placeholder="12/30"
              value={expiry}
              onChange={(e) => setExpiry(formatExpiry(e.target.value))}
              autoComplete="cc-exp"
              className="tabular-nums"
              required
            />
            <Input
              label="CVV"
              inputMode="numeric"
              placeholder="123"
              maxLength={4}
              value={cvv}
              onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))}
              autoComplete="cc-csc"
              className="tabular-nums"
              required
            />
          </div>

          <p className="flex items-center gap-1.5 text-xs text-neutral-500">
            <LockIcon className="size-3.5" />
            Pago simulado: no se cobra dinero real ni se guarda el número completo de la tarjeta.
          </p>
        </Card>

        <div className="flex items-center justify-between rounded-sm bg-neutral-50 px-4 py-3">
          <span className="text-sm font-medium text-neutral-600">Total a pagar</span>
          <span className="text-xl font-bold tabular-nums text-brand-600">
            ${previewTotal.toFixed(2)}
          </span>
        </div>

        {error && <ErrorState message={error} />}

        <Button type="submit" size="lg" loading={loading} className="self-start px-10">
          Pagar ${previewTotal.toFixed(2)} y reservar
        </Button>
      </form>
    </PageContainer>
  );
}
