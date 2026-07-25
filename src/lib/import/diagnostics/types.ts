/**
 * Import Diagnostics DTOs — structured pipeline audit records.
 *
 * Produced exclusively by the Import Diagnostics service. Intended for
 * developers, support, and advanced users — never consumed by business logic.
 */

export type ImportDiagnosticsStageStatus = 'completed' | 'skipped' | 'failed';

export type ImportDiagnosticsStageName =
  | 'header-detection'
  | 'report-detection'
  | 'report-profile'
  | 'auto-mapping'
  | 'saved-mapping'
  | 'validation'
  | 'import-guidance';

export type ImportDiagnosticsStage = {
  name: ImportDiagnosticsStageName;
  status: ImportDiagnosticsStageStatus;
  durationMs: number;
  /** Stage-specific structured output for inspection / export. */
  output: Record<string, unknown>;
};

export type ImportDiagnosticsExecutionTime = {
  totalMs: number;
  startedAt: string;
  completedAt: string;
};

export type ImportDiagnosticsMappingStatistics = {
  mappedCount: number;
  unmappedCount: number;
  ignoredCount: number;
  ambiguousCount: number;
  mappingConfidence: number;
};

export type ImportDiagnosticsSavedMappingStatistics = {
  usedSavedMapping: boolean;
  appliedCount: number;
  appliedFromSavedCount: number;
  appliedFromAutoCount: number;
  skippedCount: number;
  outdatedCount: number;
  newMappingsNeededCount: number;
  versionMismatch: boolean;
  savedMappingVersion: number | null;
  confidence: number;
};

export type ImportDiagnosticsValidationSummary = {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  missingRequiredFields: readonly string[];
  missingSourceHeaders: readonly string[];
  ignoredHeaders: readonly string[];
  issueCodeCounts: Record<string, number>;
  skippedEmptyRowCount: number;
};

export type ImportDiagnosticsGuidanceSummary = {
  totalItems: number;
  infoCount: number;
  warningCount: number;
  errorCount: number;
  codes: readonly string[];
};

export type ImportDiagnosticMessage = {
  code: string;
  message: string;
  stage?: ImportDiagnosticsStageName;
  details?: Record<string, unknown>;
};

export type ImportDiagnosticsResult = {
  pipelineStages: readonly ImportDiagnosticsStage[];
  executionTime: ImportDiagnosticsExecutionTime;
  detectedHeaderRow: number;
  detectedHeaders: readonly string[];
  reportType: string;
  reportConfidence: number;
  profileId: string;
  mappingStatistics: ImportDiagnosticsMappingStatistics;
  savedMappingStatistics: ImportDiagnosticsSavedMappingStatistics;
  validationSummary: ImportDiagnosticsValidationSummary;
  guidanceSummary: ImportDiagnosticsGuidanceSummary;
  warnings: readonly ImportDiagnosticMessage[];
  errors: readonly ImportDiagnosticMessage[];
};
