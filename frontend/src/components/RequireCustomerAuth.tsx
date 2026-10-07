import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getCustomerToken } from '../lib/api';

/**
 * Protege /cuenta y /checkout: sin token guardado, redirige al login de cliente
 * recordando a dónde quería ir (`from`) para volver ahí tras ingresar.
 */
export function RequireCustomerAuth({ children }: { children: ReactNode }) {
  const token = getCustomerToken();
  const location = useLocation();
  if (!token) {
    return <Navigate to="/cuenta/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
