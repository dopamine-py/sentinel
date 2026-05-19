// Sentinel brand mark — the red alert shield with signal waves, recreated as
// a crisp inline SVG so it scales to any size and needs no raster asset.
// Used by SentinelMark (headers) and the favicon.

export function SentinelLogo({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      className={className}
      aria-label="Sentinel"
      role="img"
    >
      <defs>
        <linearGradient id="snShield" x1="48" y1="14" x2="48" y2="84" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FF7A45" />
          <stop offset="0.45" stopColor="#F5402C" />
          <stop offset="1" stopColor="#C2160C" />
        </linearGradient>
        <linearGradient id="snWave" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF6A3D" />
          <stop offset="1" stopColor="#D81E10" />
        </linearGradient>
        <linearGradient id="snSheen" x1="48" y1="16" x2="48" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.34" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Signal waves — left, behind the shield */}
      <g stroke="url(#snWave)" strokeWidth="5" strokeLinecap="round" fill="none">
        <path d="M30 30 Q20 48 30 66" opacity="0.95" />
        <path d="M21 24 Q7 48 21 72" opacity="0.6" />
        <path d="M12 19 Q-6 48 12 77" opacity="0.32" />
        {/* right (mirrored) */}
        <path d="M66 30 Q76 48 66 66" opacity="0.95" />
        <path d="M75 24 Q89 48 75 72" opacity="0.6" />
        <path d="M84 19 Q102 48 84 77" opacity="0.32" />
      </g>

      {/* Shield */}
      <path
        d="M48 13 L73 21 C74 21 74 22 74 23 C74 38 73 47 70 54 C66 64 58 71 48 76
           C38 71 30 64 26 54 C23 47 22 38 22 23 C22 22 22 21 23 21 Z"
        fill="url(#snShield)"
        stroke="#FF9A6B"
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />
      {/* Glossy top sheen */}
      <path
        d="M48 16 L70 23 C70 23 70 33 69 40 C61 44 55 46 48 46 C41 46 35 44 27 40
           C26 33 26 23 26 23 Z"
        fill="url(#snSheen)"
      />

      {/* Exclamation */}
      <path
        d="M44.4 30 C44.4 28 45.9 26.5 48 26.5 C50.1 26.5 51.6 28 51.5 30 L50.4 49
           C50.3 50.4 49.3 51.4 48 51.4 C46.7 51.4 45.7 50.4 45.6 49 Z"
        fill="#FFFFFF"
      />
      <rect x="44.3" y="55.5" width="7.4" height="7.4" rx="2.4" fill="#FFFFFF" />
    </svg>
  );
}
