/** BakeryOS elevation / shadow tokens */

export const shadow = {
  sm: 'var(--bos-shadow-sm)',
  md: 'var(--bos-shadow-md)',
  lg: 'var(--bos-shadow-lg)',
  focus: 'var(--bos-shadow-focus)',
} as const;

/** Tailwind utility class presets */
export const shadowClass = {
  sm: 'shadow-bos-sm',
  md: 'shadow-bos-md',
  lg: 'shadow-bos-lg',
  focus: 'shadow-bos-focus',
} as const;

export type ShadowToken = keyof typeof shadow;
