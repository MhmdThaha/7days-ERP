/**
 * Import Review view models — client-safe DTOs for the read-only Review UI.
 *
 * All engine outputs are attached per row by upstream analysis; React components
 * display them only and must not re-run detection, matching, or scoring.
 */

import type { NormalizedValue } from '@/lib/import/engine/types';
import type { ReportDetectionResult } from '@/lib/import/reports/types';
import type { SalesImportPreparationSummary } from '@/lib/import/preparation/sales-import-preparation.types';
import type { PreparedFieldSources } from '@/lib/import/preparation/sales-import-preparation.types';
import type { ConflictEngineResult } from '@/lib/import/services/conflict-engine.service';
import type { ConfidenceEngineResult } from '@/lib/import/services/confidence-engine.service';
import type { ProductMatchResult } from '@/lib/import/services/product-matching.service';

export type ImportReviewMatchedColumnViewModel = {
  key: string;
  label: string;
  header: string;
};

export type ImportReviewMissingColumnViewModel = {
  key: string;
  label: string;
};

export type ImportReviewOverviewViewModel = {
  fileName: string;
  detectedReportName: string;
  detectedReportType: string;
  /** Report detection confidence in [0, 1] or [0, 100] — display layer normalizes. */
  reportConfidence: number;
  headerRowIndex: number;
  totalRows: number;
  readyRows: number;
  warningRows: number;
  errorRows: number;
  averageConfidence: number;
  autoImportEligibleRows: number;
  blockedRows: number;
  preparationSummary?: SalesImportPreparationSummary;
};

export type ImportReviewReportSummaryViewModel = {
  matchedColumns: readonly ImportReviewMatchedColumnViewModel[];
  missingRequiredColumns: readonly ImportReviewMissingColumnViewModel[];
  extraColumns: readonly string[];
  unknownHeaders: readonly string[];
  detectionReasons: readonly string[];
};

export type ImportReviewRowProductResolution = {
  action: 'select-existing' | 'skip-row' | 'create-placeholder' | 'accept-inactive';
  selectedProductId?: string;
  placeholderProductName?: string;
  resolvedInMemory: true;
};

export type ImportReviewRowViewModel = {
  rowNumber: number;
  originalValues: Readonly<Record<string, unknown>>;
  normalizedValues: Readonly<Record<string, NormalizedValue>>;
  reportDetectionResult: ReportDetectionResult;
  productMatchResult: ProductMatchResult | null;
  conflictEngineResult: ConflictEngineResult;
  confidenceResult: ConfidenceEngineResult;
  preparedFieldSources?: PreparedFieldSources;
  productResolution?: ImportReviewRowProductResolution;
};

export type ImportReviewViewModel = {
  overview: ImportReviewOverviewViewModel;
  reportSummary: ImportReviewReportSummaryViewModel;
  rows: readonly ImportReviewRowViewModel[];
};
