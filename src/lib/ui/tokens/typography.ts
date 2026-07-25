/** BakeryOS typography scale — Geist / Inter family via CSS variables */

export const fontFamily = {
  sans: 'var(--bos-font-sans)',
  mono: 'var(--bos-font-mono)',
} as const;

export const fontWeight = {
  regular: 'var(--bos-font-weight-regular)',
  medium: 'var(--bos-font-weight-medium)',
  semibold: 'var(--bos-font-weight-semibold)',
  bold: 'var(--bos-font-weight-bold)',
} as const;

export const fontWeightNumeric = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

/** Tailwind utility class presets for typography roles */
export const typography = {
  pageTitle: 'text-page-title',
  sectionTitle: 'text-section-title',
  cardTitle: 'text-card-title',
  body: 'text-body',
  small: 'text-small',
  caption: 'text-caption',
  label: 'text-label',
  button: 'text-button',
} as const;

export const typographyTokens = {
  pageTitle: {
    size: 'var(--bos-text-page-title-size)',
    lineHeight: 'var(--bos-text-page-title-line)',
    weight: 'var(--bos-text-page-title-weight)',
    letterSpacing: 'var(--bos-text-page-title-tracking)',
  },
  sectionTitle: {
    size: 'var(--bos-text-section-title-size)',
    lineHeight: 'var(--bos-text-section-title-line)',
    weight: 'var(--bos-text-section-title-weight)',
    letterSpacing: 'var(--bos-text-section-title-tracking)',
  },
  cardTitle: {
    size: 'var(--bos-text-card-title-size)',
    lineHeight: 'var(--bos-text-card-title-line)',
    weight: 'var(--bos-text-card-title-weight)',
    letterSpacing: 'var(--bos-text-card-title-tracking)',
  },
  body: {
    size: 'var(--bos-text-body-size)',
    lineHeight: 'var(--bos-text-body-line)',
    weight: 'var(--bos-text-body-weight)',
  },
  small: {
    size: 'var(--bos-text-small-size)',
    lineHeight: 'var(--bos-text-small-line)',
    weight: 'var(--bos-text-small-weight)',
  },
  caption: {
    size: 'var(--bos-text-caption-size)',
    lineHeight: 'var(--bos-text-caption-line)',
    weight: 'var(--bos-text-caption-weight)',
  },
  label: {
    size: 'var(--bos-text-label-size)',
    lineHeight: 'var(--bos-text-label-line)',
    weight: 'var(--bos-text-label-weight)',
  },
  button: {
    size: 'var(--bos-text-button-size)',
    lineHeight: 'var(--bos-text-button-line)',
    weight: 'var(--bos-text-button-weight)',
  },
} as const;
