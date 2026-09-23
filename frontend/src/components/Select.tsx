import type { ReactNode, SelectHTMLAttributes } from 'react';
import { useId } from 'react';

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  children: ReactNode;
}

export function Select({ label, className = '', id, children, ...rest }: Props) {
  const autoId = useId();
  const selectId = id ?? autoId;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium text-neutral-700">
        {label}
      </label>
      <select
        id={selectId}
        className={`h-11 rounded-sm border border-neutral-300 bg-white px-3 text-sm text-neutral-900
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 ${className}`}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
}
