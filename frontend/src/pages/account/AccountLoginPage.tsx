import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { ErrorState } from '../../components/StateViews';
import { UserIcon } from '../../components/icons';
import { ApiError } from '../../lib/api';
import { useCustomerAuth } from '../../lib/customer-auth-context';

export function AccountLoginPage() {
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const { login } = useCustomerAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login({ email, password });
      navigate(from ?? '/cuenta', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-brand-500 text-white">
            <UserIcon className="size-6" strokeWidth={2} />
          </span>
          <div>
            <h1 className="display-heading text-xl text-neutral-900">Ingresa a tu cuenta</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {from === '/checkout'
                ? 'Necesitas una cuenta para completar tu reserva.'
                : 'Para agilizar tus reservas y ver tu historial.'}
            </p>
          </div>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Correo electrónico"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              autoFocus
            />
            <Input
              label="Contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />

            {error && <ErrorState message={error} />}

            <Button type="submit" loading={loading} className="mt-1">
              Iniciar sesión
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm text-neutral-500">
          ¿No tienes cuenta?{' '}
          <Link
            to="/cuenta/registro"
            state={from ? { from } : undefined}
            className="font-semibold text-brand-600 hover:underline">
            Regístrate
          </Link>
        </p>
      </div>
    </div>
  );
}
