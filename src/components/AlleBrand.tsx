export const BARO_LOGO_SRC = '/assets/brand/baro-logo.png';
export const BARO_APP_ICON_SRC = '/assets/brand/baro-app-icon.png';
export const ALLE_ICON_SRC = BARO_APP_ICON_SRC;
export const BARO_CHARACTER_MAIN_SRC = '/assets/brand/baro-character-main.png';
export const BARO_CHARACTER_BOWL_SRC = '/assets/brand/baro-character-bowl.png';
export const BARO_CHARACTER_WAVE_SRC = '/assets/brand/baro-character-wave.png';
export const BARO_CHARACTER_WAVE_LIGHT_SRC =
  '/assets/brand/baro-character-wave-light.png';
export const BARO_PARTNER_KIT_SRC = '/assets/brand/baro-partner-kit.jpg';
export const BARO_PARTNER_GEAR_SRC = '/assets/brand/baro-partner-gear.jpg';

interface AlleLogoProps {
  className?: string;
}

export function AlleLogo({ className = '' }: AlleLogoProps) {
  return (
    <span className={`inline-flex items-center select-none ${className}`}>
      <img
        src={BARO_LOGO_SRC}
        alt="Baro 바로"
        className="h-[26px] sm:h-[30px] w-auto object-contain block"
      />
    </span>
  );
}

export function AlleBotIllustration({
  size = 'md',
  variant = 'main',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'main' | 'bowl' | 'wave' | 'wave-light';
  className?: string;
}) {
  const dimensions =
    size === 'sm'
      ? 'w-10 h-10'
      : size === 'lg'
        ? 'w-20 h-20 sm:w-24 sm:h-24'
        : 'w-16 h-16 sm:w-20 sm:h-20';
  const src =
    variant === 'bowl'
      ? BARO_CHARACTER_BOWL_SRC
      : variant === 'wave'
        ? BARO_CHARACTER_WAVE_SRC
        : variant === 'wave-light'
          ? BARO_CHARACTER_WAVE_LIGHT_SRC
          : BARO_CHARACTER_MAIN_SRC;

  return (
    <img
      src={src}
      alt="Baro 바로 캐릭터"
      className={`${dimensions} object-contain shrink-0 select-none ${className}`}
    />
  );
}
