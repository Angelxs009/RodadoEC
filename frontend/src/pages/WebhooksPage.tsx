import { useEffect, useState, type FormEvent } from 'react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { WebhookIcon } from '../components/icons';
import { PageContainer } from '../components/PageContainer';
import { EmptyState, ErrorState } from '../components/StateViews';
import { Input } from '../components/Input';
import { ApiError, autosApi } from '../lib/api';
import type { WebhookEvent, WebhookSubscription } from '../types/autos';

const AVAILABLE_EVENTS: { id: WebhookEvent; label: string }[] = [
  { id: 'CAR_ORDER_CONFIRMED', label: 'Orden confirmada' },
  { id: 'CAR_ORDER_CANCELLED', label: 'Orden cancelada' },
  { id: 'DEPOT_UPDATE', label: 'Actualización de agencia' },
];

export function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function loadWebhooks() {
    setLoading(true);
    setError(null);
    autosApi
      .listWebhooks()
      .then(setWebhooks)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los webhooks.'),
      )
      .finally(() => setLoading(false));
  }

  useEffect(loadWebhooks, []);

  function toggleEvent(id: WebhookEvent) {
    setEvents((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (events.length === 0) {
      setError('Selecciona al menos un evento para el webhook.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await autosApi.createWebhook({ url, events });
      setUrl('');
      setEvents([]);
      loadWebhooks();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar el webhook.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      await autosApi.deleteWebhook(id);
      loadWebhooks();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar el webhook.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <PageContainer>
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <WebhookIcon className="size-5" />
          </span>
          <h1 className="display-heading text-2xl text-neutral-900 sm:text-3xl">
            Webhooks de Autos
          </h1>
        </div>
        <p className="mt-2 text-sm text-neutral-500">
          Registra endpoints externos para recibir notificaciones de eventos de renta en tiempo
          real.
        </p>
      </div>

      <Card className="flex flex-col gap-4">
        <p className="text-sm font-semibold text-neutral-800">Registrar nuevo webhook</p>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <Input
            label="URL del endpoint"
            type="url"
            placeholder="https://tu-sistema.com/webhooks/autos"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-neutral-700">Eventos</span>
            {AVAILABLE_EVENTS.map((event) => (
              <label
                key={event.id}
                className="flex cursor-pointer items-center gap-2 rounded-sm border border-neutral-200 px-3 py-2.5 hover:bg-neutral-50"
              >
                <input
                  type="checkbox"
                  checked={events.includes(event.id)}
                  onChange={() => toggleEvent(event.id)}
                  className="size-4 accent-[var(--color-brand-500)]"
                />
                <span className="text-sm text-neutral-800">{event.label}</span>
              </label>
            ))}
          </div>

          {error && <ErrorState message={error} />}

          <Button type="submit" loading={creating} className="self-start">
            Registrar webhook
          </Button>
        </form>
      </Card>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-neutral-800">Webhooks activos</p>

        {loading && <div className="h-24 animate-pulse rounded-md bg-neutral-100" />}

        {!loading && webhooks.length === 0 && (
          <EmptyState
            title="Sin webhooks registrados"
            description="Registra el primero usando el formulario de arriba."
          />
        )}

        {!loading &&
          webhooks.map((hook) => (
            <Card key={hook.id} className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <p className="break-all text-sm font-medium text-neutral-800">{hook.url}</p>
                <div className="flex flex-wrap gap-1.5">
                  {hook.events.map((event) => (
                    <Badge key={event} tone="brand">
                      {AVAILABLE_EVENTS.find((e) => e.id === event)?.label ?? event}
                    </Badge>
                  ))}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                loading={deletingId === hook.id}
                onClick={() => handleDelete(hook.id)}
              >
                Eliminar
              </Button>
            </Card>
          ))}
      </div>
    </div>
    </PageContainer>
  );
}
