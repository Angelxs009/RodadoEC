import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { ErrorState } from '../../components/StateViews';
import { CarIcon } from '../../components/icons';
import { adminAuthApi, ApiError, setAdminToken } from '../../lib/api';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { token } = await adminAuthApi.login(username, password);
      setAdminToken(token);
      navigate('/admin', { replace: true });
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
            <CarIcon className="size-6" strokeWidth={2} />
          </span>
          <div>
            <h1 className="display-heading text-xl text-neutral-900">Acceso administrador</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Panel interno de RodadoEc, solo para el equipo.
            </p>
          </div>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
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
      </div>
    </div>
  );
}
