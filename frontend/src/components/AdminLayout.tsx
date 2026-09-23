import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { PageContainer } from './PageContainer';

const TABS = [
  { to: '/admin', label: 'Vehículos', end: true },
  { to: '/admin/depots', label: 'Agencias' },
  { to: '/admin/orders', label: 'Órdenes' },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <nav className="flex gap-1 border-b border-neutral-200">
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
        </nav>
        {children}
      </div>
    </PageContainer>
  );
}
