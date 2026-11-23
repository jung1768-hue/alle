export const ALLE_ICON_SRC = '/assets/aistudio/IMG_8626_97d5135f.PNG';

interface AlleLogoProps {
  className?: string;
}

export function AlleLogo({ className = '' }: AlleLogoProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 select-none ${className}`}>
      <img
        src={ALLE_ICON_SRC}
        alt="baro 아이콘"
        className="w-8 h-8 object-contain mix-blend-multiply -mt-1 shrink-0"
      />
      <span className="font-display text-[24px] font-extrabold tracking-[-0.045em] text-[#1A1D1A] leading-none">
        baro
      </span>
      <span className="text-xs font-extrabold text-[#4E6E2A] tracking-tight leading-none mt-1">
        바로
      </span>
    </span>
  );
}

export function AlleBotIllustration({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const dimensions = size === 'sm' ? 'w-10 h-10' : 'w-20 h-20 sm:w-22 sm:h-22';
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={`${dimensions} shrink-0`}
    >
      {/* Cute bamboo leaf sprout on top (alle sage-green accent) */}
      <path
        d="M50 22C50 15 47 11 42 9"
        stroke="#4E6E2A"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M50 18C53 11 61 9 65 13C62 18 55 20 50 18Z"
        fill="#82B440"
        stroke="#4E6E2A"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M47 14C42 10 35 12 34 17C38 19 44 18 47 14Z"
        fill="#9AD052"
        stroke="#4E6E2A"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />

      {/* Fluffy round baby panda ears */}
      <circle cx="25" cy="29" r="12.5" fill="#232823" />
      <circle cx="25" cy="29" r="6" fill="#3B423B" opacity="0.65" />
      <circle cx="75" cy="29" r="12.5" fill="#232823" />
      <circle cx="75" cy="29" r="6" fill="#3B423B" opacity="0.65" />

      {/* Chubby baby panda head */}
      <ellipse
        cx="50"
        cy="54"
        rx="34"
        ry="30"
        fill="#FFFFFF"
        stroke="#DCE7CF"
        strokeWidth="2.2"
      />
      {/* Subtle warm chin shading */}
      <path
        d="M22 62C27 76 38 82 50 82C62 82 73 76 78 62C72 72 62 77 50 77C38 77 28 72 22 62Z"
        fill="#F2F6EE"
      />

      {/* Soft tilted panda eye patches */}
      <ellipse
        cx="35.5"
        cy="51.5"
        rx="9.5"
        ry="11.2"
        transform="rotate(-16 35.5 51.5)"
        fill="#232823"
      />
      <ellipse
        cx="64.5"
        cy="51.5"
        rx="9.5"
        ry="11.2"
        transform="rotate(16 64.5 51.5)"
        fill="#232823"
      />

      {/* Big sparkly friendly baby eyes */}
      <circle cx="36.2" cy="50.5" r="4.2" fill="#111411" />
      <circle cx="34.6" cy="48.6" r="2.1" fill="#FFFFFF" />
      <circle cx="38.2" cy="52.6" r="1" fill="#FFFFFF" />

      <circle cx="63.8" cy="50.5" r="4.2" fill="#111411" />
      <circle cx="62.2" cy="48.6" r="2.1" fill="#FFFFFF" />
      <circle cx="65.8" cy="52.6" r="1" fill="#FFFFFF" />

      {/* Rosy blushing cheeks */}
      <ellipse cx="24.5" cy="61" rx="5.2" ry="3.2" fill="#FF9AA8" opacity="0.65" />
      <ellipse cx="75.5" cy="61" rx="5.2" ry="3.2" fill="#FF9AA8" opacity="0.65" />

      {/* Cute rounded button nose */}
      <path
        d="M46 57.5C46 55.6 47.8 54.8 50 54.8C52.2 54.8 54 55.6 54 57.5C54 59.3 51.8 61 50 61C48.2 61 46 59.3 46 57.5Z"
        fill="#232823"
      />

      {/* Sweet baby panda ':3' smile */}
      <path
        d="M50 61V63.2M43.5 64.5C45.3 67.2 48.5 67 50 64C51.5 67 54.7 67.2 56.5 64.5"
        stroke="#232823"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Cute little waving/peeking baby paws at bottom */}
      <ellipse
        cx="28"
        cy="82"
        rx="8.5"
        ry="6.5"
        transform="rotate(-14 28 82)"
        fill="#232823"
      />
      <ellipse
        cx="28"
        cy="82.5"
        rx="3.4"
        ry="2.4"
        transform="rotate(-14 28 82.5)"
        fill="#FFB3BD"
        opacity="0.85"
      />
      <ellipse
        cx="72"
        cy="82"
        rx="8.5"
        ry="6.5"
        transform="rotate(14 72 82)"
        fill="#232823"
      />
      <ellipse
        cx="72"
        cy="82.5"
        rx="3.4"
        ry="2.4"
        transform="rotate(14 72 82.5)"
        fill="#FFB3BD"
        opacity="0.85"
      />
    </svg>
  );
}
