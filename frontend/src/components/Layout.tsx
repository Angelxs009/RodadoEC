import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CarIcon, SettingsIcon, WebhookIcon } from './icons';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-neutral-900">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-full bg-brand-500 text-white">
              <CarIcon className="size-5" strokeWidth={2} />
            </span>
            <span className="display-heading text-lg text-white">
              Rodado<span className="text-brand-500">Ec</span>
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              to="/admin"
              className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
            >
              <SettingsIcon className="size-4" />
              Admin
            </Link>
            <Link
              to="/webhooks"
              className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
            >
              <WebhookIcon className="size-4" />
              Webhooks
            </Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="mt-10 bg-neutral-900 text-neutral-400">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <span className="display-heading text-lg text-white">
              Rodado<span className="text-brand-500">Ec</span>
            </span>
            <p className="max-w-xs text-sm">
              Renta de autos en Quito, Guayaquil y Cuenca. Precio claro, sin costos ocultos.
            </p>
          </div>
          <div className="flex flex-col gap-1 text-sm sm:items-end">
            <span className="font-semibold text-neutral-200">Proyecto integrador — PUCE</span>
            <span>Dominio Autos · Booking Prototipo</span>
            <span className="text-xs text-neutral-500">© 2026 RodadoEc</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
