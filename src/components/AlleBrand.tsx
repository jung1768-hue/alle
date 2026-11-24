import { useId } from 'react';

export const ALLE_ICON_SRC = '/assets/aistudio/IMG_8626_97d5135f.PNG';

interface AlleLogoProps {
  className?: string;
}

export function AlleLogo({ className = '' }: AlleLogoProps) {
  const gradId = useId();
  return (
    <span className={`inline-flex items-center gap-1.5 select-none ${className}`}>
      <svg
        viewBox="0 0 40 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="w-7 h-7 sm:w-8 sm:h-8 shrink-0"
      >
        <defs>
          <linearGradient id={gradId} x1="6" y1="16" x2="34" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4A9132" />
            <stop offset="100%" stopColor="#8EC73F" />
          </linearGradient>
        </defs>
        <path
          d="M8.5 16.5C8.5 25.2 13.8 30.2 20.5 30.2C27.2 30.2 31.8 25.4 32.4 18.8"
          stroke={`url(#${gradId})`}
          strokeWidth="5.4"
          strokeLinecap="round"
        />
        <circle cx="32.2" cy="8.8" r="3.4" fill="#497226" />
      </svg>
      <span className="font-display text-[21px] sm:text-[23px] font-extrabold tracking-[-0.045em] text-[#111411] leading-none">
        Baro
      </span>
      <span className="text-[11.5px] font-bold text-[#3B5B1E] tracking-[-0.02em] leading-none mt-0.5">
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
      {/* Soft warm ground shadow */}
      <ellipse cx="50" cy="91.5" rx="22" ry="3.6" fill="#E9DFD1" />

      {/* Stubby golden-yellow feet */}
      <path
        d="M36 82.5C36 81 44.5 81 44.5 83.5V88.5C44.5 90.2 42.5 91 39.8 91C37.2 91 35.8 90 35.8 88.2L36 82.5Z"
        fill="#FFC119"
      />
      <path
        d="M36 88.2C36 90 37.5 91 39.8 91C42.5 91 44.5 90.2 44.5 88.5V87.3C43 88.6 37.8 88.8 36 88.2Z"
        fill="#F2A400"
      />
      <path
        d="M55.5 82.5C55.5 81 64 81 64 83.5V88.2C64 90 62.6 91 60 91C57.3 91 55.3 90.2 55.3 88.5L55.5 82.5Z"
        fill="#FFC119"
      />
      <path
        d="M55.3 88.5C55.3 90.2 57.3 91 60 91C62.6 91 64 90 64 88.2V87.3C62.2 88.7 57 88.7 55.3 88.5Z"
        fill="#F2A400"
      />

      {/* Tall creamy ears rising behind cap */}
      <ellipse
        cx="47.5"
        cy="19"
        rx="8.2"
        ry="15"
        transform="rotate(-5 47.5 19)"
        fill="#FFF2E0"
        stroke="#EAD8C0"
        strokeWidth="1.2"
      />
      <ellipse
        cx="60.5"
        cy="21"
        rx="7.8"
        ry="14.5"
        transform="rotate(24 60.5 21)"
        fill="#FFF2E0"
        stroke="#EAD8C0"
        strokeWidth="1.2"
      />

      {/* Left & right tucked cream wings */}
      <path
        d="M21.5 60C16 61.5 14 69 18 73.5C20.5 76.2 24.5 74.5 25.5 70.5"
        fill="#FFF1DE"
        stroke="#E2CEB4"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M78.5 60C84 61.5 86 69 82 73.5C79.5 76.2 75.5 74.5 74.5 70.5"
        fill="#FFF1DE"
        stroke="#E2CEB4"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Plump creamy-white pear-shaped body */}
      <path
        d="M50 32C66.5 32 79 44.5 79 62.5C79 77.5 67.5 85.8 50 85.8C32.5 85.8 21 77.5 21 62.5C21 44.5 33.5 32 50 32Z"
        fill="#FFF6E9"
        stroke="#E6D7C3"
        strokeWidth="1.5"
      />
      {/* Soft warm lower belly shade */}
      <path
        d="M22.5 66.5C25.5 78.5 36.2 84.8 50 84.8C63.8 84.8 74.5 78.5 77.5 66.5C72 75.2 62.2 80 50 80C37.8 80 28 75.2 22.5 66.5Z"
        fill="#F4E5D2"
      />

      {/* Large white circular eye patches */}
      <circle
        cx="41.5"
        cy="56"
        r="10.2"
        fill="#FFFFFF"
        stroke="#EFE3D4"
        strokeWidth="1"
      />
      <circle
        cx="59"
        cy="56"
        r="10.2"
        fill="#FFFFFF"
        stroke="#EFE3D4"
        strokeWidth="1"
      />

      {/* Dark forest-green friendly eyes */}
      <ellipse cx="44" cy="56.2" rx="4.4" ry="5.1" fill="#0E3A22" />
      <circle cx="42.4" cy="54.2" r="1.45" fill="#FFFFFF" opacity="0.92" />

      <ellipse cx="56.5" cy="56.2" rx="4.4" ry="5.1" fill="#0E3A22" />
      <circle cx="54.9" cy="54.2" r="1.45" fill="#FFFFFF" opacity="0.92" />

      {/* Golden-yellow rounded beak between the eyes */}
      <path
        d="M46 58.2C46 56.2 48.2 55 50.2 55C52.2 55 54.4 56.2 54.4 58.2C54.4 60.5 51.8 64.2 50.2 64.2C48.6 64.2 46 60.5 46 58.2Z"
        fill="#FFC119"
      />
      <path
        d="M46.6 59.5C47.7 61.7 49.2 64.2 50.2 64.2C51.2 64.2 52.7 61.7 53.8 59.5C52.4 60.6 51.2 61.1 50.2 61.1C49.2 61.1 48 60.6 46.6 59.5Z"
        fill="#F2A400"
      />

      {/* Tilted vibrant green cap */}
      <g transform="rotate(6 52 34)">
        {/* Cap crown */}
        <path
          d="M27.5 39.5C29.5 26 40 19.5 52.5 19.5C65.5 19.5 74.5 27 75.5 40C75.7 42 74 43.2 71.5 42.6C60.5 39.8 44 39.4 29 41.2C27.8 41.4 27.3 40.6 27.5 39.5Z"
          fill="#238A35"
        />
        {/* Subtle cap crown highlight */}
        <path
          d="M34 31C38 24.5 45 21.5 53 21.5C60.5 21.5 66.5 24 70 29"
          stroke="#2FA344"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.65"
        />
        {/* Left-extending curved visor brim */}
        <path
          d="M29 38.5C22.5 39 17.2 42 16.5 45.2C16.1 47 18.2 48.2 21.8 47.4C27.5 46.1 34.5 43.4 42.5 41.6C44.5 41.1 45 39.2 42.8 38.6C38 37.5 33 38.2 29 38.5Z"
          fill="#1B6E2A"
        />
        {/* Clean white lowercase 'a' emblem */}
        <g transform="translate(52.5 31.2)">
          <circle cx="0" cy="0" r="4.1" stroke="#FFFFFF" strokeWidth="2.8" />
          <path
            d="M4.1 -3.8V3.9"
            stroke="#FFFFFF"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
        </g>
      </g>
    </svg>
  );
}
