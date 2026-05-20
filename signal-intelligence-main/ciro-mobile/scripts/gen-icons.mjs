// Rasterizes the Sentinel brand mark into the full mobile icon set.
// Source of truth for the geometry is urban-sentinel-main/public/favicon.svg
// (viewBox 0 0 96 96). Run: node scripts/gen-icons.mjs

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const BG = '#0a0b0d';

const DEFS = `
  <linearGradient id="s" x1="48" y1="14" x2="48" y2="84" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#FF7A45"/><stop offset="0.45" stop-color="#F5402C"/><stop offset="1" stop-color="#C2160C"/>
  </linearGradient>
  <linearGradient id="w" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FF6A3D"/><stop offset="1" stop-color="#D81E10"/>
  </linearGradient>`;

const SHIELD = 'M48 13 L73 21 C74 21 74 22 74 23 C74 38 73 47 70 54 C66 64 58 71 48 76 C38 71 30 64 26 54 C23 47 22 38 22 23 C22 22 22 21 23 21 Z';
const BANG = 'M44.4 30 C44.4 28 45.9 26.5 48 26.5 C50.1 26.5 51.6 28 51.5 30 L50.4 49 C50.3 50.4 49.3 51.4 48 51.4 C46.7 51.4 45.7 50.4 45.6 49 Z';

const WAVES = `
  <g stroke="url(#w)" stroke-width="5" stroke-linecap="round" fill="none">
    <path d="M30 30 Q20 48 30 66" opacity="0.95"/><path d="M21 24 Q7 48 21 72" opacity="0.6"/>
    <path d="M66 30 Q76 48 66 66" opacity="0.95"/><path d="M75 24 Q89 48 75 72" opacity="0.6"/>
  </g>`;

const LOGO = `${WAVES}
  <path d="${SHIELD}" fill="url(#s)"/>
  <path d="${BANG}" fill="#fff"/>
  <rect x="44.3" y="55.5" width="7.4" height="7.4" rx="2.4" fill="#fff"/>`;

// Place the 96x96 logo centered inside a `size` canvas occupying `coverage`
// of the smaller dimension. bg=null → transparent.
function composed(size, coverage, bg, { rounded = false } = {}) {
  const box = size * coverage;
  const scale = box / 96;
  const off = (size - box) / 2;
  const bgEl = bg
    ? rounded
      ? `<rect width="${size}" height="${size}" rx="${size * 0.2}" fill="${bg}"/>`
      : `<rect width="${size}" height="${size}" fill="${bg}"/>`
    : '';
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none">
      <defs>${DEFS}</defs>
      ${bgEl}
      <g transform="translate(${off} ${off}) scale(${scale})">${LOGO}</g>
    </svg>`
  );
}

// White-on-transparent silhouette for the Android status-bar icon.
// Android keeps only the alpha channel, so the "!" is punched out via a mask.
function notification(size) {
  const scale = size / 96;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96" fill="none">
      <defs>
        <mask id="m">
          <rect width="96" height="96" fill="black"/>
          <path d="${SHIELD}" fill="white"/>
          <path d="${BANG}" fill="black"/>
          <rect x="44.3" y="55.5" width="7.4" height="7.4" rx="2.4" fill="black"/>
        </mask>
      </defs>
      <g stroke="white" stroke-width="5" stroke-linecap="round" fill="none">
        <path d="M30 30 Q20 48 30 66"/><path d="M21 24 Q7 48 21 72"/>
        <path d="M66 30 Q76 48 66 66"/><path d="M75 24 Q89 48 75 72"/>
      </g>
      <rect width="96" height="96" fill="white" mask="url(#m)"/>
    </svg>`.replace(/width="\d+" height="\d+" viewBox/, `width="${size}" height="${size}" viewBox`)
  );
}

const png = (buf, file) =>
  sharp(buf, { density: 384 }).png().toFile(join(ASSETS, file));

await Promise.all([
  // iOS / general app icon — full-bleed dark, logo with breathing room.
  png(composed(1024, 0.62, BG), 'icon.png'),
  // Android adaptive foreground — transparent, logo inside the safe zone.
  png(composed(1024, 0.54, null), 'adaptive-icon.png'),
  // Splash — transparent, shown centered (contain) on #0a0b0d.
  png(composed(1024, 0.46, null), 'splash-icon.png'),
  // Browser/web favicon — rounded dark tile.
  png(composed(256, 0.66, BG, { rounded: true }), 'favicon.png'),
  // Android notification small icon — white silhouette, alpha only.
  png(notification(256), 'notification-icon.png'),
]);

console.log('icons written to', ASSETS);
