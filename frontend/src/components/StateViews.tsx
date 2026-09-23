import { Button } from './Button';
import { CarIcon } from './icons';

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-500">
        <CarIcon className="size-6" />
      </div>
      <p className="text-base font-bold text-neutral-800">{title}</p>
      <p className="max-w-sm text-sm text-neutral-500">{description}</p>
      {actionLabel && onAction && (
        <Button size="sm" variant="secondary" onClick={onAction} className="mt-2">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-danger-600/20 bg-danger-50 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-danger-600">No se pudo completar la acción</p>
      <p className="max-w-sm text-sm text-neutral-600">{message}</p>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry} className="mt-1">
          Reintentar
        </Button>
      )}
    </div>
  );
}

export function VehicleCardSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-md border border-neutral-200 bg-white p-4">
      <div className="size-16 shrink-0 animate-pulse rounded-sm bg-neutral-200" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="h-4 w-2/5 animate-pulse rounded-sm bg-neutral-200" />
        <div className="h-3 w-1/3 animate-pulse rounded-sm bg-neutral-100" />
      </div>
      <div className="h-8 w-20 animate-pulse rounded-sm bg-neutral-200" />
    </div>
  );
}
