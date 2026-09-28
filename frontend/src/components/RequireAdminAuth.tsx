import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { getAdminToken } from '../lib/api';

/**
 * Protege las rutas /admin/*: si no hay token guardado, redirige al login.
 * No valida la firma/expiración del token en el cliente (eso lo hace el
 * backend en cada request); solo evita mostrar el panel sin haber iniciado
 * sesión antes. Un token expirado se limpia solo en el primer request que
 * responda 401 (ver lib/api.ts) y la vista muestra el error correspondiente.
 */
export function RequireAdminAuth({ children }: { children: ReactNode }) {
  const token = getAdminToken();
  if (!token) {
    return <Navigate to="/admin/login" replace />;
  }
  return <>{children}</>;
}
