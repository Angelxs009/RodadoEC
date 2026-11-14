import { useEffect, useRef } from 'react';

export const POLL_INTERVAL_MS = 5000;

/**
 * Silent background polling: ejecuta `tick` cada `intervalMs` sin loaders ni interrupciones (el llamador decide
 * qué actualizar en memoria). No se solapa con una ejecución en curso, se pausa con la pestaña oculta y vuelve a
 * consultar apenas el usuario regresa a ella.
 */
export function usePolling(tick: () => Promise<unknown> | void, intervalMs: number = POLL_INTERVAL_MS, enabled = true) {
  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let running = false;

    async function run() {
      if (stopped || running || document.hidden) return;
      running = true;
      try {
        await tickRef.current();
      } catch {
        // Un fallo de red en segundo plano no debe molestar al usuario: se conserva lo que ya está en pantalla.
      } finally {
        running = false;
      }
    }

    const timer = window.setInterval(run, intervalMs);
    const onVisible = () => !document.hidden && void run();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs, enabled]);
}

/**
 * Combina la lista nueva con la que ya está en memoria: reutiliza el mismo objeto de las filas que no cambiaron
 * (React no las vuelve a pintar) y devuelve la lista anterior tal cual si no cambió nada.
 */
export function mergeById<T extends { id: string }>(prev: T[], fresh: T[]): T[] {
  const before = new Map(prev.map((p) => [p.id, p]));
  let changed = fresh.length !== prev.length;
  const merged = fresh.map((f, i) => {
    const old = before.get(f.id);
    if (old && JSON.stringify(old) === JSON.stringify(f)) {
      if (prev[i] !== old) changed = true;
      return old;
    }
    changed = true;
    return f;
  });
  return changed ? merged : prev;
}
