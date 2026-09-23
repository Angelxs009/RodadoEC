import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { ErrorState } from '../../components/StateViews';
import { VehicleImage } from '../../components/VehicleImage';
import { Table, TableBody, TableHead, Td, Th, Tr } from '../../components/Table';
import { ApiError, adminApi } from '../../lib/api';
import type { AdminVehicle, CreateVehicleInput } from '../../types/admin';

const CAR_TYPES = ['Compacto', 'Sedan', 'SUV'];
const TRANSMISSIONS = ['Manual', 'Automatica'];

const EMPTY_FORM: CreateVehicleInput = {
  vehicle_id: '',
  make: '',
  model: '',
  car_type: 'Sedan',
  transmission: 'Automatica',
  doors: 4,
  bag_capacity: 2,
  seats: 5,
  price_per_day: 30,
  supplier_id: 1,
  depot_id: 100,
};

export function AdminVehiclesPage() {
  const [vehicles, setVehicles] = useState<AdminVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateVehicleInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CreateVehicleInput>(EMPTY_FORM);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    adminApi
      .listVehicles()
      .then(setVehicles)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los vehículos.'),
      )
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await adminApi.createVehicle(form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el vehículo.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(vehicle: AdminVehicle) {
    const { id: _id, ...rest } = vehicle;
    setEditingId(vehicle.id);
    setEditForm(rest);
  }

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateVehicle(editingId, editForm);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar el vehículo.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      await adminApi.deleteVehicle(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar el vehículo.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="display-heading text-2xl text-neutral-900 sm:text-3xl">
            Catálogo de vehículos
          </h1>
          <p className="text-sm text-neutral-500">
            Los cambios se reflejan de inmediato en la búsqueda pública.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancelar' : 'Agregar vehículo'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Input
              label="ID público"
              value={form.vehicle_id}
              onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}
              required
            />
            <Input
              label="Marca"
              value={form.make}
              onChange={(e) => setForm({ ...form, make: e.target.value })}
              required
            />
            <Input
              label="Modelo"
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              required
            />
            <Select
              label="Tipo"
              value={form.car_type}
              onChange={(e) => setForm({ ...form, car_type: e.target.value })}
            >
              {CAR_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
            <Select
              label="Transmisión"
              value={form.transmission}
              onChange={(e) => setForm({ ...form, transmission: e.target.value })}
            >
              {TRANSMISSIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
            <Input
              label="Puertas"
              type="number"
              value={form.doors}
              onChange={(e) => setForm({ ...form, doors: Number(e.target.value) })}
            />
            <Input
              label="Maletas"
              type="number"
              value={form.bag_capacity}
              onChange={(e) => setForm({ ...form, bag_capacity: Number(e.target.value) })}
            />
            <Input
              label="Asientos"
              type="number"
              value={form.seats}
              onChange={(e) => setForm({ ...form, seats: Number(e.target.value) })}
            />
            <Input
              label="Precio/día (USD)"
              type="number"
              step="0.01"
              value={form.price_per_day}
              onChange={(e) => setForm({ ...form, price_per_day: Number(e.target.value) })}
            />
            <Input
              label="Supplier ID"
              type="number"
              value={form.supplier_id}
              onChange={(e) => setForm({ ...form, supplier_id: Number(e.target.value) })}
            />
            <Input
              label="Depot ID"
              type="number"
              value={form.depot_id}
              onChange={(e) => setForm({ ...form, depot_id: Number(e.target.value) })}
            />
            <div className="col-span-2 sm:col-span-4">
              <Input
                label="URL de la foto (opcional, ej. /cars/veh-009.jpg o https://…)"
                value={form.image_url ?? ''}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              />
            </div>
            <div className="col-span-2 flex items-end sm:col-span-4">
              <Button type="submit" loading={saving}>Guardar vehículo</Button>
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
            <Th>Marca / Modelo</Th>
            <Th>Tipo</Th>
            <Th>Precio/día</Th>
            <Th>Depot</Th>
            <Th></Th>
          </TableHead>
          <TableBody>
            {vehicles.map((v) =>
              editingId === v.id ? (
                <Tr key={v.id}>
                  <Td colSpan={6} className="!p-2">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      <input
                        className="h-9 rounded-sm border border-neutral-300 px-2 text-sm"
                        value={editForm.make}
                        onChange={(e) => setEditForm({ ...editForm, make: e.target.value })}
                        placeholder="Marca"
                      />
                      <input
                        className="h-9 rounded-sm border border-neutral-300 px-2 text-sm"
                        value={editForm.model}
                        onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                        placeholder="Modelo"
                      />
                      <input
                        className="h-9 rounded-sm border border-neutral-300 px-2 text-sm"
                        type="number"
                        step="0.01"
                        value={editForm.price_per_day}
                        onChange={(e) =>
                          setEditForm({ ...editForm, price_per_day: Number(e.target.value) })
                        }
                        placeholder="Precio/día"
                      />
                      <input
                        className="h-9 rounded-sm border border-neutral-300 px-2 text-sm"
                        type="number"
                        value={editForm.depot_id}
                        onChange={(e) =>
                          setEditForm({ ...editForm, depot_id: Number(e.target.value) })
                        }
                        placeholder="Depot ID"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" loading={saving} onClick={saveEdit}>Guardar</Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          onClick={() => setEditingId(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  </Td>
                </Tr>
              ) : (
                <Tr key={v.id}>
                  <Td className="font-mono text-xs">{v.vehicle_id}</Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <VehicleImage
                        src={v.image_url}
                        alt={`${v.make} ${v.model}`}
                        className="h-10 w-16 shrink-0 rounded-sm"
                      />
                      <span>{v.make} {v.model}</span>
                    </div>
                  </Td>
                  <Td>{v.car_type}</Td>
                  <Td>${v.price_per_day.toFixed(2)}</Td>
                  <Td>{v.depot_id}</Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(v)}>
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={deletingId === v.id}
                        onClick={() => handleDelete(v.id)}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ),
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
