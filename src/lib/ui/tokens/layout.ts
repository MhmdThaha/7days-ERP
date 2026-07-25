/** BakeryOS layout tokens — containers, breakpoints, z-index, opacity */

export const container = {
  sm: 'var(--bos-container-sm)',
  md: 'var(--bos-container-md)',
  lg: 'var(--bos-container-lg)',
  xl: 'var(--bos-container-xl)',
  '2xl': 'var(--bos-container-2xl)',
  content: 'var(--bos-container-content)',
} as const;

export const breakpoint = {
  sm: 'var(--bos-breakpoint-sm)',
  md: 'var(--bos-breakpoint-md)',
  lg: 'var(--bos-breakpoint-lg)',
  xl: 'var(--bos-breakpoint-xl)',
  '2xl': 'var(--bos-breakpoint-2xl)',
} as const;

export const breakpointPx = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export const zIndex = {
  base: 'var(--bos-z-base)',
  dropdown: 'var(--bos-z-dropdown)',
  sticky: 'var(--bos-z-sticky)',
  overlay: 'var(--bos-z-overlay)',
  modal: 'var(--bos-z-modal)',
  toast: 'var(--bos-z-toast)',
  tooltip: 'var(--bos-z-tooltip)',
} as const;

export const opacity = {
  disabled: 'var(--bos-opacity-disabled)',
  muted: 'var(--bos-opacity-muted)',
  overlay: 'var(--bos-opacity-overlay)',
} as const;
