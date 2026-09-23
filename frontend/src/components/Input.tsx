import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Input({ label, error, className = '', id, ...rest }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-neutral-700">
        {label}
      </label>
      <input
        id={inputId}
        className={`h-11 rounded-sm border px-3 text-sm text-neutral-900 placeholder:text-neutral-400
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1
          disabled:bg-neutral-100 disabled:text-neutral-400
          ${error ? 'border-danger-600' : 'border-neutral-300'} ${className}`}
        aria-invalid={Boolean(error)}
        {...rest}
      />
      {error && <span className="text-xs font-medium text-danger-600">{error}</span>}
    </div>
  );
}
