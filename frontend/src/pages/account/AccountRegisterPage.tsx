import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { ErrorState } from '../../components/StateViews';
import { UserIcon } from '../../components/icons';
import { ApiError } from '../../lib/api';
import { useCustomerAuth } from '../../lib/customer-auth-context';

export function AccountRegisterPage() {
  const navigate = useNavigate();
  const { register } = useCustomerAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await register({
        first_name: firstName,
        last_name: lastName,
        email,
        phone_number: phone || undefined,
        password,
      });
      navigate('/cuenta', { replace: true });
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
            <h1 className="display-heading text-xl text-neutral-900">Crea tu cuenta</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Guarda tus datos para reservar más rápido.
            </p>
          </div>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Nombres"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                autoFocus
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
              autoComplete="email"
              required
            />
            <Input
              label="Teléfono (opcional)"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              label="Contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />

            {error && <ErrorState message={error} />}

            <Button type="submit" loading={loading} className="mt-1">
              Crear cuenta
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm text-neutral-500">
          ¿Ya tienes cuenta?{' '}
          <Link to="/cuenta/login" className="font-semibold text-brand-600 hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
