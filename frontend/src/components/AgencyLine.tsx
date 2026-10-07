import type { Agency } from '../lib/depots';
import { MapPinIcon, PlaneIcon, StarIcon } from './icons';

/** Línea compacta con la agencia: ícono, nombre y puntuación. */
export function AgencyLine({ agency, className = '' }: { agency?: Agency; className?: string }) {
  if (!agency) return null;
  const Icon = agency.airport ? PlaneIcon : MapPinIcon;
  return (
    <p className={`flex min-w-0 items-center gap-1.5 text-xs font-medium text-neutral-500 ${className}`}>
      <Icon className="size-3.5 shrink-0 text-brand-500" />
      <span className="truncate" title={agency.name}>
        {agency.name}
      </span>
      {agency.score !== null && (
        <span className="flex shrink-0 items-center gap-0.5 font-bold tabular-nums text-neutral-700">
          <StarIcon className="size-3 text-warning-600" />
          {agency.score.toFixed(1)}
        </span>
      )}
    </p>
  );
}
