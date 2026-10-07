import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { SWAGGER_URL, setAdminToken } from '../lib/api';
import { ExternalLinkIcon } from './icons';
import { PageContainer } from './PageContainer';

const TABS = [
  { to: '/admin', label: 'Vehículos', end: true },
  { to: '/admin/depots', label: 'Agencias' },
  { to: '/admin/orders', label: 'Órdenes' },
  { to: '/admin/users', label: 'Usuarios' },
  { to: '/admin/webhooks', label: 'Webhooks' },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  function handleLogout() {
    setAdminToken(null);
    navigate('/admin/login', { replace: true });
  }

  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <nav className="flex items-center justify-between gap-1 border-b border-neutral-200">
          <div className="flex gap-1">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `px-3 py-2 text-sm font-bold transition-colors ${
                    isActive
                      ? 'border-b-2 border-brand-500 text-brand-600'
                      : 'text-neutral-500 hover:text-neutral-800'
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </div>
          <div className="mb-2 flex items-center gap-1">
            <a
              href={SWAGGER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
            >
              Swagger
              <ExternalLinkIcon className="size-3.5" />
            </a>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full px-3 py-1.5 text-xs font-bold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
            >
              Cerrar sesión
            </button>
          </div>
        </nav>
        {children}
      </div>
    </PageContainer>
  );
}
