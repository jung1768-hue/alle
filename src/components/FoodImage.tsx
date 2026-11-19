import { useEffect, useState } from 'react';
import { Utensils } from 'lucide-react';

interface FoodImageProps {
  src: string;
  alt: string;
  className?: string;
}

export function FoodImage({ src, alt, className = '' }: FoodImageProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (hasError || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-stone-100 text-zinc-500 ${className}`}
        role="img"
        aria-label={alt}
      >
        <Utensils className="w-7 h-7 text-zinc-400 mb-1.5" strokeWidth={1.6} />
        <span className="text-xs font-medium text-zinc-600 px-3 text-center line-clamp-1">
          {alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={`object-cover bg-stone-100 ${className}`}
    />
  );
}
