import { useEffect, useState } from 'react';
import { autosApi } from './api';

// Proveedores (Localiza, Hertz, Avis…): se piden una sola vez y se comparten.
let cache: Promise<Record<number, string>> | null = null;

function loadSuppliers(): Promise<Record<number, string>> {
  cache ??= autosApi
    .suppliers()
    .then((res) => Object.fromEntries(res.data.map((s) => [s.supplier_id, s.name])))
    .catch((err) => {
      cache = null;
      throw err;
    });
  return cache;
}

export function useSuppliers(): Record<number, string> {
  const [names, setNames] = useState<Record<number, string>>({});
  useEffect(() => {
    let cancelled = false;
    loadSuppliers()
      .then((n) => !cancelled && setNames(n))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return names;
}
