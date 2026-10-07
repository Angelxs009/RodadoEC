import { useEffect, useState } from 'react';
import { autosApi } from './api';

export const CITIES = [
  { id: 1, label: 'Quito' },
  { id: 2, label: 'Guayaquil' },
  { id: 3, label: 'Cuenca' },
] as const;

export const cityLabel = (cityId?: number | null) =>
  CITIES.find((c) => c.id === cityId)?.label ?? 'Ecuador';

export interface Agency {
  depot_id: number;
  name: string;
  city_id: number;
  airport?: string;
  /** Puntuación de 0 a 5; null si todavía no tiene reseñas. */
  score: number | null;
}

// Las agencias casi no cambian: se piden una sola vez por carga de página y se comparten.
let cache: Promise<Agency[]> | null = null;

function loadAgencies(): Promise<Agency[]> {
  cache ??= Promise.all([autosApi.depots(), autosApi.depotScores()])
    .then(([depots, scores]) => {
      const scoreById = new Map(scores.data.map((s) => [s.depot_id, s.score]));
      return depots.data.map((d) => ({
        depot_id: d.depot_id,
        name: d.name,
        city_id: d.location.city_id ?? 0,
        airport: d.location.airport,
        score: scoreById.get(d.depot_id) || null,
      }));
    })
    .catch((err) => {
      cache = null;
      throw err;
    });
  return cache;
}

export function useAgencies() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadAgencies()
      .then((list) => !cancelled && setAgencies(list))
      .catch(() => !cancelled && setAgencies([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const byId: Record<number, Agency> = {};
  for (const a of agencies) byId[a.depot_id] = a;
  return { agencies, byId, loading };
}
