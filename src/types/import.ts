import type { MappingConfig } from '@/lib/import/engine/types';
import type { ImportDiagnosticsResult } from '@/lib/import/diagnostics/types';
import type { ImportGuidanceResult } from '@/lib/import/guidance/types';
import type { MappingReviewBundle } from '@/lib/import/mapping-review/types';
import type { AutoMappingResult } from '@/lib/import/services/auto-mapping';
import type { ImportRunReport } from '@/lib/import/services/import.service';

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
