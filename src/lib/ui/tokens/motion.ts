/** BakeryOS motion / animation tokens */

export const duration = {
  instant: 'var(--bos-duration-instant)',
  fast: 'var(--bos-duration-fast)',
  normal: 'var(--bos-duration-normal)',
  slow: 'var(--bos-duration-slow)',
  dialog: 'var(--bos-duration-dialog)',
} as const;

export const durationMs = {
  instant: 100,
  fast: 150,
  normal: 200,
  slow: 300,
  dialog: 250,
} as const;

export const easing = {
  standard: 'var(--bos-ease-standard)',
  emphasized: 'var(--bos-ease-emphasized)',
  decelerate: 'var(--bos-ease-decelerate)',
} as const;

/** Preset transition classes for common interactions */
export const transition = {
  hover: 'transition-colors duration-[var(--bos-duration-fast)] ease-[var(--bos-ease-standard)]',
  focus: 'transition-shadow duration-[var(--bos-duration-fast)] ease-[var(--bos-ease-standard)]',
  press: 'transition-transform duration-[var(--bos-duration-instant)] ease-[var(--bos-ease-emphasized)]',
  dialog: 'transition-all duration-[var(--bos-duration-dialog)] ease-[var(--bos-ease-decelerate)]',
  drawer: 'transition-transform duration-[var(--bos-duration-slow)] ease-[var(--bos-ease-decelerate)]',
  accordion: 'transition-[grid-template-rows,opacity] duration-[var(--bos-duration-normal)] ease-[var(--bos-ease-standard)]',
} as const;

export type DurationToken = keyof typeof duration;
