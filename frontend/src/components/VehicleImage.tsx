import { useState } from 'react';
import { CarIcon } from './icons';

interface Props {
  src?: string | null;
  alt: string;
  className?: string;
}

export function VehicleImage({ src, alt, className = '' }: Props) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-brand-50 text-brand-500 ${className}`}>
        <CarIcon className="size-1/3" />
      </div>
    );
  }

  return (
    <div className={`overflow-hidden bg-neutral-100 ${className}`}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
      />
    </div>
  );
}
