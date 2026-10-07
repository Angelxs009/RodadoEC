import { useEffect, useState, type FormEvent } from 'react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { ErrorState } from '../../components/StateViews';
import { Table, TableBody, TableHead, Td, Th, Tr } from '../../components/Table';
import { ApiError, adminApi } from '../../lib/api';
import type { AdminUserAccount, CreateUserInput, UserRole } from '../../types/admin';

const EMPTY_FORM: CreateUserInput = {
  role: 'CUSTOMER',
  username: '',
  email: '',
  password: '',
  first_name: '',
  last_name: '',
  phone_number: '',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium' }).format(new Date(iso));
}

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateUserInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isAdminForm = form.role === 'ADMIN';

  function load() {
    setLoading(true);
    setError(null);
    adminApi
      .listUsers()
      .then(setUsers)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los usuarios.'),
      )
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: CreateUserInput = isAdminForm
        ? {
            role: 'ADMIN',
            username: form.username,
            password: form.password,
            first_name: form.first_name || undefined,
            last_name: form.last_name || undefined,
          }
        : {
            role: 'CUSTOMER',
            email: form.email,
            password: form.password,
            first_name: form.first_name,
            last_name: form.last_name,
            phone_number: form.phone_number || undefined,
          };
      const created = await adminApi.createUser(payload);
      setSuccess(
        `${created.role === 'ADMIN' ? 'Administrador' : 'Cliente'} "${created.login}" creado. Ya puede iniciar sesión.`,
      );
      setForm({ ...EMPTY_FORM, role: form.role });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el usuario.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(u: AdminUserAccount) {
    if (!u.id) return;
    if (!window.confirm(`¿Eliminar a "${u.login}"? Esta acción no se puede deshacer.`)) return;
    setDeletingId(u.id);
    setError(null);
    setSuccess(null);
    try {
      await adminApi.deleteUser(u.role, u.id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar el usuario.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="display-heading text-2xl text-neutral-900 sm:text-3xl">Usuarios</h1>
          <p className="text-sm text-neutral-500">
            Crea administradores y clientes. Las cuentas creadas aquí son válidas de inmediato.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancelar' : 'Crear usuario'}
        </Button>
      </div>

      {success && (
        <div
          role="status"
          className="rounded-md border border-success-600/30 bg-success-50 px-4 py-3 text-sm font-medium text-success-600"
        >
          {success}
        </div>
      )}

      {showForm && (
        <Card>
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Select
                label="Tipo de usuario"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
              >
                <option value="CUSTOMER">Cliente (reserva autos desde la web)</option>
                <option value="ADMIN">Administrador (entra a este panel)</option>
              </Select>
            </div>

            {isAdminForm ? (
              <Input
                label="Usuario (username)"
                value={form.username ?? ''}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                pattern="[a-zA-Z0-9._\-]{3,60}"
                title="3–60 caracteres: letras, números, punto, guion o guion bajo"
                autoComplete="off"
                required
              />
            ) : (
              <Input
                label="Correo electrónico"
                type="email"
                value={form.email ?? ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                autoComplete="off"
                required
              />
            )}
            <Input
              label="Contraseña (mín. 6 caracteres)"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              minLength={6}
              autoComplete="new-password"
              required
            />
            <Input
              label={isAdminForm ? 'Nombres (opcional)' : 'Nombres'}
              value={form.first_name ?? ''}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              required={!isAdminForm}
            />
            <Input
              label={isAdminForm ? 'Apellidos (opcional)' : 'Apellidos'}
              value={form.last_name ?? ''}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              required={!isAdminForm}
            />
            {!isAdminForm && (
              <Input
                label="Teléfono (opcional)"
                type="tel"
                value={form.phone_number ?? ''}
                onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
              />
            )}
            <div className="flex items-end sm:col-span-2">
              <Button type="submit" loading={saving}>
                Guardar usuario
              </Button>
            </div>
          </form>
        </Card>
      )}

      {error && <ErrorState message={error} onRetry={load} />}

      {loading && <div className="h-40 animate-pulse rounded-md bg-neutral-100" />}

      {!loading && (
        <Table>
          <TableHead>
            <Th>Usuario / correo</Th>
            <Th>Rol</Th>
            <Th>Nombre</Th>
            <Th>Creado</Th>
            <Th></Th>
          </TableHead>
          <TableBody>
            {users.map((u) => (
              <Tr key={`${u.role}-${u.id ?? 'env'}`}>
                <Td className="max-w-[16rem] truncate font-medium text-neutral-900" >
                  <span title={u.login}>{u.login}</span>
                </Td>
                <Td>
                  <Badge tone={u.role === 'ADMIN' ? 'brand' : 'neutral'}>
                    {u.role === 'ADMIN' ? 'Administrador' : 'Cliente'}
                  </Badge>
                </Td>
                <Td>{[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</Td>
                <Td className="tabular-nums">{formatDate(u.created_at)}</Td>
                <Td>
                  <div className="flex justify-end">
                    {u.protected ? (
                      <span className="text-xs font-semibold text-neutral-400">Cuenta principal</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={deletingId === u.id}
                        onClick={() => handleDelete(u)}
                      >
                        Eliminar
                      </Button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
