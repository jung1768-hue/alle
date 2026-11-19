export const ALLE_ICON_SRC = '/assets/aistudio/IMG_8626_97d5135f.PNG';

interface AlleLogoProps {
  className?: string;
}

export function AlleLogo({ className = '' }: AlleLogoProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 select-none ${className}`}>
      <img
        src={ALLE_ICON_SRC}
        alt="alle 아이콘"
        className="w-8 h-8 object-contain mix-blend-multiply -mt-1 shrink-0"
      />
      <span className="font-display text-[24px] font-extrabold tracking-[-0.045em] text-[#1A1D1A] leading-none">
        alle
      </span>
    </span>
  );
}

export function AlleBotIllustration({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const dimensions = size === 'sm' ? 'w-11 h-11' : 'w-20 h-20 sm:w-22 sm:h-22';
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={`${dimensions} shrink-0`}
    >
      {/* Antenna */}
      <line
        x1="50"
        y1="14"
        x2="50"
        y2="27"
        stroke="#82B440"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="50" cy="13" r="5" fill="#82B440" />
      {/* Spark lines */}
      <path
        d="M64 16L68 12M68 23L73 21"
        stroke="#4E6E2A"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Side ear pods */}
      <rect x="13" y="45" width="9" height="18" rx="4.5" fill="#82B440" />
      <rect x="78" y="45" width="9" height="18" rx="4.5" fill="#82B440" />
      {/* Soft white rounded head */}
      <rect
        x="20"
        y="26"
        width="60"
        height="52"
        rx="22"
        fill="#FFFFFF"
        stroke="#E8ECE4"
        strokeWidth="2"
      />
      {/* Deep charcoal face visor */}
      <rect x="28" y="36" width="44" height="32" rx="14" fill="#1A1D1A" />
      {/* Happy fresh lime eyes & smile */}
      <path
        d="M36 50C37.5 46.8 40.5 46.8 42 50"
        stroke="#82B440"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M58 50C59.5 46.8 62.5 46.8 64 50"
        stroke="#82B440"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M44.5 55.5C46.5 58.5 53.5 58.5 55.5 55.5"
        stroke="#82B440"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
