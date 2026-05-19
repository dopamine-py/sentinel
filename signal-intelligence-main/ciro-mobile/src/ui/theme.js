// Sentinel design tokens — graphite + single cyan accent (mirrors web)
import { Platform } from 'react-native';

export const colors = {
  // graphite surface scale
  surface0: '#0a0b0d',   // page
  surface1: '#0e1014',   // card
  surface2: '#131519',   // raised card
  surface3: '#1a1d22',   // input

  // hairline borders
  line: 'rgba(255, 255, 255, 0.07)',
  lineStrong: 'rgba(255, 255, 255, 0.12)',

  // text
  textPrimary: '#e8e9eb',
  textSecondary: '#9a9ea5',
  textTertiary: '#6b6f76',

  // single brand accent
  accentCyan: '#67e8f9',
  accentCyanSoft: 'rgba(103, 232, 249, 0.14)',
  accentCyanOutline: 'rgba(103, 232, 249, 0.32)',

  // operational status
  statusOk: '#34d399',
  statusWarn: '#f59e0b',
  statusAlert: '#fb7185',
  statusCritical: '#ef4444',

  // severity badge fills
  severityFills: {
    critical: { fg: '#fda4af', bg: 'rgba(239, 68, 68, 0.10)',  border: 'rgba(239, 68, 68, 0.30)' },
    high:     { fg: '#fbbf24', bg: 'rgba(245, 158, 11, 0.10)', border: 'rgba(245, 158, 11, 0.30)' },
    medium:   { fg: '#fde68a', bg: 'rgba(245, 158, 11, 0.06)', border: 'rgba(245, 158, 11, 0.20)' },
    low:      { fg: '#6ee7b7', bg: 'rgba(52, 211, 153, 0.08)', border: 'rgba(52, 211, 153, 0.22)' },
    ok:       { fg: '#67e8f9', bg: 'rgba(103, 232, 249, 0.08)', border: 'rgba(103, 232, 249, 0.24)' },
    muted:    { fg: '#9a9ea5', bg: '#131519',                   border: 'rgba(255,255,255,0.08)' },
  },
};

export const radii = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
  pill: 999,
};

export const spacing = (n) => n * 4;

export const fonts = {
  // Use the platform's native UI font — avoids expo-font config overhead and
  // gives an Apple-system / Roboto feel for free.
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
  sansMedium: Platform.select({ ios: 'System', android: 'sans-serif-medium', default: 'System' }),
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};

export const type = {
  display: {
    fontFamily: fonts.sansMedium,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  title: {
    fontFamily: fonts.sansMedium,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  body: {
    fontFamily: fonts.sans,
    fontWeight: '400',
  },
  mono: {
    fontFamily: fonts.mono,
    fontWeight: '400',
  },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    fontWeight: '500',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.textTertiary,
  },
};
