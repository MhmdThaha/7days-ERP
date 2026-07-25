/** BakeryOS border radius tokens */

export const radius = {
  sm: 'var(--bos-radius-sm)',
  md: 'var(--bos-radius-md)',
  lg: 'var(--bos-radius-lg)',
  xl: 'var(--bos-radius-xl)',
  full: 'var(--bos-radius-full)',
} as const;

export const radiusPx = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

/** Tailwind-aligned utility class presets */
export const radiusClass = {
  sm: 'rounded-sm-token',
  md: 'rounded-md-token',
  lg: 'rounded-lg-token',
  xl: 'rounded-xl-token',
  full: 'rounded-full',
} as const;

export type RadiusToken = keyof typeof radius;
