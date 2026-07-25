/** BakeryOS Lucide icon size tokens */

export const iconSize = {
  sm: 'var(--bos-icon-sm)',
  md: 'var(--bos-icon-md)',
  lg: 'var(--bos-icon-lg)',
  nav: 'var(--bos-icon-nav)',
  action: 'var(--bos-icon-action)',
  card: 'var(--bos-icon-card)',
} as const;

export const iconSizePx = {
  sm: 16,
  md: 20,
  lg: 24,
  nav: 20,
  action: 18,
  card: 20,
} as const;

/** Tailwind size utility presets */
export const iconClass = {
  sm: 'icon-sm',
  md: 'icon-md',
  lg: 'icon-lg',
  nav: 'icon-nav',
  action: 'icon-action',
  card: 'icon-card',
} as const;

export type IconSizeToken = keyof typeof iconSize;
