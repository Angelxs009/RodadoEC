import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { getCustomerToken } from '../lib/api';

/** Protege /cuenta: sin token guardado, redirige al login de cliente. */
export function RequireCustomerAuth({ children }: { children: ReactNode }) {
  const token = getCustomerToken();
  if (!token) {
    return <Navigate to="/cuenta/login" replace />;
  }
  return <>{children}</>;
}
