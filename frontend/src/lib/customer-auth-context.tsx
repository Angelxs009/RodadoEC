import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { customerAuthApi, setCustomerToken, getCustomerToken } from './api';
import type {
  CustomerProfile,
  LoginCustomerInput,
  RegisterCustomerInput,
} from '../types/customer';

interface CustomerAuthState {
  profile: CustomerProfile | null;
  loading: boolean;
  login: (input: LoginCustomerInput) => Promise<void>;
  register: (input: RegisterCustomerInput) => Promise<void>;
  logout: () => void;
}

const CustomerAuthContext = createContext<CustomerAuthState | null>(null);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getCustomerToken()) {
      setLoading(false);
      return;
    }
    customerAuthApi
      .me()
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(input: LoginCustomerInput) {
    const res = await customerAuthApi.login(input);
    setCustomerToken(res.token);
    setProfile(res.profile);
  }

  async function register(input: RegisterCustomerInput) {
    const res = await customerAuthApi.register(input);
    setCustomerToken(res.token);
    setProfile(res.profile);
  }

  function logout() {
    setCustomerToken(null);
    setProfile(null);
  }

  return (
    <CustomerAuthContext.Provider value={{ profile, loading, login, register, logout }}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth(): CustomerAuthState {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomerAuth debe usarse dentro de <CustomerAuthProvider>');
  return ctx;
}
