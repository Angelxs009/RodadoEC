import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { ErrorState } from '../../components/StateViews';
import { Table, TableBody, TableHead, Td, Th, Tr } from '../../components/Table';
import { ApiError, adminApi } from '../../lib/api';
import type { AdminDepot, CreateDepotInput } from '../../types/admin';

const EMPTY_FORM: CreateDepotInput = {
  depot_id: 0,
  name: '',
  city_id: 1,
  airport: '',
  score: 4.5,
};

export function AdminDepotsPage() {
  const [depots, setDepots] = useState<AdminDepot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateDepotInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    adminApi
      .listDepots()
      .then(setDepots)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar las agencias.'),
      )
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await adminApi.createDepot(form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la agencia.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      await adminApi.deleteDepot(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar la agencia.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="display-heading text-2xl text-neutral-900 sm:text-3xl">
            Agencias (Depots)
          </h1>
          <p className="text-sm text-neutral-500">Puntos de recogida y entrega de vehículos.</p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancelar' : 'Agregar agencia'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Input
              label="Depot ID"
              type="number"
              value={form.depot_id}
              onChange={(e) => setForm({ ...form, depot_id: Number(e.target.value) })}
              required
            />
            <Input
              label="Nombre"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <Input
              label="Ciudad (city_id)"
              type="number"
              value={form.city_id}
              onChange={(e) => setForm({ ...form, city_id: Number(e.target.value) })}
            />
            <Input
              label="Aeropuerto (opcional)"
              value={form.airport ?? ''}
              onChange={(e) => setForm({ ...form, airport: e.target.value })}
            />
            <Input
              label="Puntuación"
              type="number"
              step="0.1"
              min={0}
              max={5}
              value={form.score}
              onChange={(e) => setForm({ ...form, score: Number(e.target.value) })}
            />
            <div className="col-span-2 flex items-end sm:col-span-5">
              <Button type="submit" loading={saving}>Guardar agencia</Button>
            </div>
          </form>
        </Card>
      )}

      {error && <ErrorState message={error} onRetry={load} />}

      {loading && <div className="h-40 animate-pulse rounded-md bg-neutral-100" />}

      {!loading && (
        <Table>
          <TableHead>
            <Th>ID</Th>
            <Th>Nombre</Th>
            <Th>Ciudad</Th>
            <Th>Aeropuerto</Th>
            <Th>Puntuación</Th>
            <Th></Th>
          </TableHead>
          <TableBody>
            {depots.map((d) => (
              <Tr key={d.id}>
                <Td>{d.depot_id}</Td>
                <Td>{d.name}</Td>
                <Td>{d.city_id}</Td>
                <Td>{d.airport || '—'}</Td>
                <Td>{Number(d.score).toFixed(1)}</Td>
                <Td>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={deletingId === d.id}
                      onClick={() => handleDelete(d.id)}
                    >
                      Eliminar
                    </Button>
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
