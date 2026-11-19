import { useEffect, useState } from 'react';
import { Utensils } from 'lucide-react';
import { resolveFallbackFoodImage } from '../data/seedData';

interface FoodImageProps {
  src: string;
  alt: string;
  className?: string;
}

export function FoodImage({ src, alt, className = '' }: FoodImageProps) {
  const [fallbackLevel, setFallbackLevel] = useState<0 | 1 | 2>(src ? 0 : 1);

  useEffect(() => {
    setFallbackLevel(src ? 0 : 1);
  }, [src, alt]);

  if (fallbackLevel === 2) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-[#F0F3EC] text-[#687064] ${className}`}
        role="img"
        aria-label={alt}
      >
        <Utensils className="w-7 h-7 text-[#82B440] mb-1.5" strokeWidth={1.6} />
        <span className="text-xs font-medium text-[#687064] px-3 text-center line-clamp-1">
          {alt}
        </span>
      </div>
    );
  }

  const effectiveSrc =
    fallbackLevel === 0 && src ? src : resolveFallbackFoodImage(alt);

  return (
    <img
      src={effectiveSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() =>
        setFallbackLevel((prev) => (prev === 0 ? 1 : 2))
      }
      className={`object-cover bg-[#F0F3EC] ${className}`}
    />
  );
}
