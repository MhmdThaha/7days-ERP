import type { MappingConfig } from '@/lib/import/engine/types';
import type { ImportDiagnosticsResult } from '@/lib/import/diagnostics/types';
import type { ImportGuidanceResult } from '@/lib/import/guidance/types';
import type { MappingReviewBundle } from '@/lib/import/mapping-review/types';
import type { AutoMappingResult } from '@/lib/import/services/auto-mapping';
import type { ImportRunReport } from '@/lib/import/services/import.service';
import type { ImportReviewViewModel } from '@/lib/import/review/types';
import type { ProductResolutionCatalogItem } from '@/lib/import/resolution/types';
import type { SalesImportPreparationContext } from '@/lib/import/preparation/sales-import-preparation.types';
import type { SalesImportPreparationSummary } from '@/lib/import/preparation/sales-import-preparation.types';
import type { DuplicateImportResult } from '@/lib/import/duplicate';
import type { ImportExecutionResult } from '@/lib/import/execution/sales-import-execution.types';
import type { InventoryFinalizationResult } from '@/lib/import/finalization/inventory-finalization.types';

/** Serializable Auto Mapping facts needed for restore in the Mapping Review UI. */
export type ImportAutoMappingSnapshot = Pick<
  AutoMappingResult,
  'mappedFields' | 'ambiguousMappings' | 'ignoredHeaders' | 'unmappedHeaders'
>;

/** Result of analyzing an uploaded file: pipeline report + mapping review DTOs. */
export type ImportAnalysis = {
  fileName: string;
  sheetName: string;
  report: ImportRunReport;
  /** Active mapping used for validation / preview. */
  mapping: MappingConfig;
  /** Headers still without a mapping after merge. */
  unmappedHeaders: readonly string[];
  /** View model + baseline for Mapping Review. */
  mappingReview: MappingReviewBundle;
  /** Auto-mapping snapshot for restore actions. */
  autoMappingSnapshot: ImportAutoMappingSnapshot;
  /** User-facing guidance derived from pipeline outputs. */
  guidance: ImportGuidanceResult;
  /** Structured pipeline audit record for support / export. */
  diagnostics: ImportDiagnosticsResult;
};

/** Result of buildImportReviewAction — review payload for Sales Import wizard. */
export type ImportReviewBuildResult = {
  fileName: string;
  sheetName: string;
  mapping: MappingConfig;
  viewModel: ImportReviewViewModel;
  catalogItems: readonly ProductResolutionCatalogItem[];
  stockByProductId: Record<string, number>;
  pipelineErrors: readonly number[];
  preparationSummary?: SalesImportPreparationSummary;
  preparationContext?: SalesImportPreparationContext;
};

/** Result of commitSalesImportAction — Phase 10A + 10B pipeline outcome. */
export type SalesImportCommitOutcome = {
  status: 'success' | 'partial' | 'failed' | 'blocked' | 'duplicate_review';
  duplicateResult: DuplicateImportResult | null;
  execution: ImportExecutionResult | null;
  finalization: InventoryFinalizationResult | null;
  durationMs: number;
  fileName: string;
};
