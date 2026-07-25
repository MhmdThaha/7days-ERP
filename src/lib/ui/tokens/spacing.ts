/** BakeryOS spacing scale — single source of truth */

export const space = {
  1: 'var(--bos-space-1)',
  2: 'var(--bos-space-2)',
  3: 'var(--bos-space-3)',
  4: 'var(--bos-space-4)',
  5: 'var(--bos-space-5)',
  6: 'var(--bos-space-6)',
  8: 'var(--bos-space-8)',
  10: 'var(--bos-space-10)',
  12: 'var(--bos-space-12)',
  16: 'var(--bos-space-16)',
} as const;

/** Pixel values for reference / tests */
export const spacePx = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export type SpaceToken = keyof typeof space;
