/**
 * Import Guidance DTOs — user-facing messages derived from pipeline outputs.
 *
 * Produced exclusively by the Import Guidance service. React components
 * render these as-is without generating copy.
 */

export type ImportGuidanceSeverity = 'info' | 'warning' | 'error';

export type ImportGuidanceItem = {
  severity: ImportGuidanceSeverity;
  title: string;
  message: string;
  recommendation: string | null;
  relatedFields: readonly string[];
  /** Stable identifier for filtering or UI grouping. */
  code?: string;
};

export type ImportGuidanceResult = {
  items: readonly ImportGuidanceItem[];
};
