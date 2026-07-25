/** BakeryOS color tokens — Slate Blue theme */

export const colorHex = {
  primary: '#334155',
  primaryHover: '#1E293B',
  primarySoft: '#E2E8F0',
  primaryForeground: '#FFFFFF',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  success: '#22C55E',
  successForeground: '#14532D',
  successSoft: '#DCFCE7',
  warning: '#F59E0B',
  warningForeground: '#78350F',
  warningSoft: '#FEF3C7',
  danger: '#EF4444',
  dangerForeground: '#FFFFFF',
  dangerSoft: '#FEE2E2',
  info: '#3B82F6',
  infoForeground: '#1E3A8A',
  infoSoft: '#DBEAFE',
} as const;

/** CSS custom property references for use in styles */
export const colorVar = {
  primary: 'var(--bos-color-primary)',
  primaryHover: 'var(--bos-color-primary-hover)',
  primarySoft: 'var(--bos-color-primary-soft)',
  primaryForeground: 'var(--bos-color-primary-foreground)',
  background: 'var(--bos-color-background)',
  surface: 'var(--bos-color-surface)',
  textPrimary: 'var(--bos-color-text-primary)',
  textSecondary: 'var(--bos-color-text-secondary)',
  border: 'var(--bos-color-border)',
  borderStrong: 'var(--bos-color-border-strong)',
  success: 'var(--bos-color-success)',
  successForeground: 'var(--bos-color-success-foreground)',
  successSoft: 'var(--bos-color-success-soft)',
  warning: 'var(--bos-color-warning)',
  warningForeground: 'var(--bos-color-warning-foreground)',
  warningSoft: 'var(--bos-color-warning-soft)',
  danger: 'var(--bos-color-danger)',
  dangerForeground: 'var(--bos-color-danger-foreground)',
  dangerSoft: 'var(--bos-color-danger-soft)',
  info: 'var(--bos-color-info)',
  infoForeground: 'var(--bos-color-info-foreground)',
  infoSoft: 'var(--bos-color-info-soft)',
} as const;

export type ColorToken = keyof typeof colorHex;
