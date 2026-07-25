/**
 * BakeryOS Design System — Phase 1
 *
 * Import tokens in components via:
 *   import { colorVar, typography, space, shadow } from '@/lib/ui';
 *
 * CSS variables are defined in src/styles/tokens.css
 * and wired through src/app/globals.css.
 */

export const designSystemVersion = '1.0.0' as const;

export const theme = {
  name: 'Slate Blue',
  personality: ['Premium', 'Modern', 'Clean', 'Professional', 'Minimal', 'Calm', 'Trustworthy', 'Fast'],
} as const;
