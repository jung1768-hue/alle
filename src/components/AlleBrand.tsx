interface AlleLogoProps {
  className?: string;
}

export function AlleLogo({ className = '' }: AlleLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 select-none ${className}`}>
      <svg
        width="28"
        height="22"
        viewBox="0 0 28 22"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <path
          d="M4.5 9.5C6.2 15.2 10.6 18 15.2 18C19.8 18 23.8 14.8 25 8.5"
          stroke="#5D8C32"
          strokeWidth="3.8"
          strokeLinecap="round"
        />
        <circle cx="24.2" cy="4.2" r="2.2" fill="#8BC34A" />
      </svg>
      <span className="font-display text-[22px] font-bold tracking-tight text-[#141812] leading-none">
        alle
      </span>
    </span>
  );
}

export function AlleBotIllustration({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const dimensions = size === 'sm' ? 'w-11 h-11' : 'w-20 h-20 sm:w-24 sm:h-24';
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={`${dimensions} shrink-0`}
    >
      {/* Soft shadow */}
      <ellipse cx="50" cy="90" rx="26" ry="5" fill="#CBDCC0" />
      {/* Antenna */}
      <line
        x1="50"
        y1="14"
        x2="50"
        y2="27"
        stroke="#5D8C32"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="50" cy="12" r="5" fill="#8BC34A" />
      {/* Side earpieces */}
      <rect x="10" y="46" width="11" height="22" rx="5.5" fill="#5D8C32" />
      <rect x="79" y="46" width="11" height="22" rx="5.5" fill="#5D8C32" />
      {/* Head body */}
      <rect
        x="17"
        y="26"
        width="66"
        height="56"
        rx="24"
        fill="#FFFFFF"
        stroke="#D3DFC9"
        strokeWidth="2"
      />
      {/* Dark visor */}
      <rect x="26" y="37" width="48" height="34" rx="14" fill="#141812" />
      {/* Happy curved eyes */}
      <path
        d="M36 52C37.5 48.5 42.5 48.5 44 52"
        stroke="#8BC34A"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M56 52C57.5 48.5 62.5 48.5 64 52"
        stroke="#8BC34A"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      {/* Smile */}
      <path
        d="M44 60C46.5 63 53.5 63 56 60"
        stroke="#8BC34A"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
