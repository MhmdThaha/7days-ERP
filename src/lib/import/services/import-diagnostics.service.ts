/**
 * Import Diagnostics service — records structured audit data from every
 * pipeline stage without influencing business logic.
 *
 * Pure: no React, no Firestore, no UI. Consumes outputs from Header Detection,
 * Report Detection, Report Profile, Auto Mapping, Saved Mapping, Validation,
 * and Import Guidance.
 */

import type { ImportEntityType } from '@/lib/import/definitions';
import type {
  ImportDiagnosticMessage,
  ImportDiagnosticsResult,
  ImportDiagnosticsStage,
  ImportDiagnosticsStageName,
  ImportDiagnosticsStageStatus,
} from '@/lib/import/diagnostics/types';
import type { ImportGuidanceResult } from '@/lib/import/guidance/types';
import type { AutoMappingResult } from '@/lib/import/services/auto-mapping';
import type { HeaderDetectionResult } from '@/lib/import/services/header-detection.service';
import type { ImportRunReport } from '@/lib/import/services/import.service';
import type { ResolveImportMappingResult } from '@/lib/import/services/saved-mapping.service';
import type { ReportDetectionResult } from '@/lib/import/reports/types';

export type ImportDiagnosticsStageTiming = Partial<
  Record<ImportDiagnosticsStageName, number>
>;

export type ImportDiagnosticsFailure = {
  code: string;
  message: string;
  stage: ImportDiagnosticsStageName;
  details?: Record<string, unknown>;
};

export type BuildImportDiagnosticsInput = {
  entityType: ImportEntityType;
  fileName?: string;
  sheetName?: string;
  startedAt: number;
  completedAt: number;
  stageTimings?: ImportDiagnosticsStageTiming;
  headerDetection?: HeaderDetectionResult;
  reportDetection?: ReportDetectionResult;
  autoMapping?: AutoMappingResult;
  resolved?: ResolveImportMappingResult;
  report?: ImportRunReport;
  guidance?: ImportGuidanceResult;
  failure?: ImportDiagnosticsFailure;
};

export type ImportDiagnosticsTimer = {
  readonly startedAt: number;
  markStageStart: (name: ImportDiagnosticsStageName) => void;
  markStageEnd: (name: ImportDiagnosticsStageName) => void;
  getStageTimings: () => ImportDiagnosticsStageTiming;
  now: () => number;
};

/** Creates a lightweight stage timer for orchestration layers. */
export function createImportDiagnosticsTimer(startedAt: number = Date.now()): ImportDiagnosticsTimer {
  const stageStarts = new Map<ImportDiagnosticsStageName, number>();
  const stageTimings: ImportDiagnosticsStageTiming = {};

  return {
    startedAt,
    markStageStart(name) {
      stageStarts.set(name, Date.now());
    },
    markStageEnd(name) {
      const stageStart = stageStarts.get(name);
      if (stageStart !== undefined) {
        stageTimings[name] = Date.now() - stageStart;
      }
    },
    getStageTimings() {
      return { ...stageTimings };
    },
    now() {
      return Date.now();
    },
  };
}

/** Builds the full or partial diagnostics bundle from pipeline outputs. */
export function buildImportDiagnostics(
  input: BuildImportDiagnosticsInput,
): ImportDiagnosticsResult {
  const warnings: ImportDiagnosticMessage[] = [];
  const errors: ImportDiagnosticMessage[] = [];
  const failedStage = input.failure?.stage;

  if (input.failure) {
    errors.push({
      code: input.failure.code,
      message: input.failure.message,
      stage: input.failure.stage,
      details: input.failure.details,
    });
  }

  const pipelineStages = buildPipelineStages(input, failedStage);
  collectCrossStageMessages(input, warnings, errors);

  const reportDetection = input.reportDetection;
  const headerDetection = input.headerDetection;
  const autoMapping = input.autoMapping;
  const resolved = input.resolved;
  const report = input.report;
  const guidance = input.guidance;

  return {
    pipelineStages,
    executionTime: {
      totalMs: Math.max(0, input.completedAt - input.startedAt),
      startedAt: new Date(input.startedAt).toISOString(),
      completedAt: new Date(input.completedAt).toISOString(),
    },
    detectedHeaderRow: headerDetection?.headerRowIndex ?? -1,
    detectedHeaders: headerDetection?.detectedHeaders ?? [],
    reportType: reportDetection?.profile.reportType ?? 'unknown',
    reportConfidence: reportDetection?.confidence ?? 0,
    profileId: reportDetection?.profile.id ?? 'unknown',
    mappingStatistics: buildMappingStatistics(autoMapping),
    savedMappingStatistics: buildSavedMappingStatistics(resolved),
    validationSummary: buildValidationSummary(report),
    guidanceSummary: buildGuidanceSummary(guidance),
    warnings,
    errors,
  };
}

/** Serializes diagnostics for JSON export, logs, or support bundles. */
export function serializeImportDiagnostics(result: ImportDiagnosticsResult): string {
  return JSON.stringify(result, null, 2);
}

function buildPipelineStages(
  input: BuildImportDiagnosticsInput,
  failedStage?: ImportDiagnosticsStageName,
): ImportDiagnosticsStage[] {
  const timings = input.stageTimings ?? {};
  const stages: ImportDiagnosticsStage[] = [
    buildHeaderDetectionStage(input.headerDetection, timings['header-detection'], failedStage),
    buildReportDetectionStage(input.reportDetection, timings['report-detection'], failedStage),
    buildReportProfileStage(input.reportDetection, timings['report-detection'], failedStage),
    buildAutoMappingStage(input.autoMapping, timings['auto-mapping'], failedStage),
    buildSavedMappingStage(input.resolved, timings['saved-mapping'], failedStage),
    buildValidationStage(input.report, timings['validation'], failedStage),
    buildGuidanceStage(input.guidance, timings['import-guidance'], failedStage),
  ];

  return stages;
}

function buildHeaderDetectionStage(
  headerDetection: HeaderDetectionResult | undefined,
  durationMs: number | undefined,
  failedStage?: ImportDiagnosticsStageName,
): ImportDiagnosticsStage {
  if (!headerDetection) {
    return emptyStage('header-detection', failedStage);
  }

  return {
    name: 'header-detection',
    status: stageStatus('header-detection', failedStage, true),
    durationMs: durationMs ?? 0,
    output: {
      headerRowIndex: headerDetection.headerRowIndex,
      detectedHeaders: headerDetection.detectedHeaders,
      confidence: headerDetection.confidence,
      scoreBreakdown: headerDetection.scoreBreakdown,
      reasoning: headerDetection.reasoning,
    },
  };
}

function buildReportDetectionStage(
  reportDetection: ReportDetectionResult | undefined,
  durationMs: number | undefined,
  failedStage?: ImportDiagnosticsStageName,
): ImportDiagnosticsStage {
  if (!reportDetection) {
    return emptyStage('report-detection', failedStage);
  }

  return {
    name: 'report-detection',
    status: stageStatus('report-detection', failedStage, true),
    durationMs: durationMs ?? 0,
    output: {
      profileId: reportDetection.profile.id,
      reportType: reportDetection.profile.reportType,
      displayName: reportDetection.profile.displayName,
      confidence: reportDetection.confidence,
      matchedHeaders: reportDetection.matchedHeaders,
      missingHeaders: reportDetection.missingHeaders,
      unmatchedHeaders: reportDetection.unmatchedHeaders,
      explanation: reportDetection.explanation,
      candidateCount: reportDetection.candidates.length,
      topCandidates: reportDetection.candidates.slice(0, 3).map((candidate) => ({
        definitionId: candidate.definitionId,
        displayName: candidate.displayName,
        confidence: candidate.confidence,
        missingRequiredKeys: candidate.coverage.missingRequiredKeys,
      })),
    },
  };
}

function buildReportProfileStage(
  reportDetection: ReportDetectionResult | undefined,
  durationMs: number | undefined,
  failedStage?: ImportDiagnosticsStageName,
): ImportDiagnosticsStage {
  if (!reportDetection) {
    return emptyStage('report-profile', failedStage);
  }

  const profile = reportDetection.profile;

  return {
    name: 'report-profile',
    status: stageStatus('report-profile', failedStage, true),
    durationMs: durationMs ?? 0,
    output: {
      id: profile.id,
      displayName: profile.displayName,
      reportType: profile.reportType,
      supportedEntity: profile.supportedEntity,
      recommendedImportMode: profile.recommendedImportMode,
      capabilities: profile.capabilities,
      validationHints: profile.validationHints,
      mappingHints: profile.mappingHints,
      requiredFieldCount: profile.requiredFields.length,
      optionalFieldCount: profile.optionalFields.length,
    },
  };
}

function buildAutoMappingStage(
  autoMapping: AutoMappingResult | undefined,
  durationMs: number | undefined,
  failedStage?: ImportDiagnosticsStageName,
): ImportDiagnosticsStage {
  if (!autoMapping) {
    return emptyStage('auto-mapping', failedStage);
  }

  return {
    name: 'auto-mapping',
    status: stageStatus('auto-mapping', failedStage, true),
    durationMs: durationMs ?? 0,
    output: {
      mappingConfidence: autoMapping.mappingConfidence,
      mappedCount: autoMapping.mappedFields.length,
      unmappedCount: autoMapping.unmappedHeaders.length,
      ignoredCount: autoMapping.ignoredHeaders.length,
      ambiguousCount: autoMapping.ambiguousMappings.length,
      mappedFields: autoMapping.mappedFields,
      unmappedHeaders: autoMapping.unmappedHeaders,
      ignoredHeaders: autoMapping.ignoredHeaders,
      ambiguousMappings: autoMapping.ambiguousMappings,
      explanation: autoMapping.explanation,
    },
  };
}

function buildSavedMappingStage(
  resolved: ResolveImportMappingResult | undefined,
  durationMs: number | undefined,
  failedStage?: ImportDiagnosticsStageName,
): ImportDiagnosticsStage {
  if (!resolved) {
    return emptyStage('saved-mapping', failedStage);
  }

  return {
    name: 'saved-mapping',
    status: stageStatus('saved-mapping', failedStage, true),
    durationMs: durationMs ?? 0,
    output: {
      usedSavedMapping: resolved.usedSavedMapping,
      confidence: resolved.confidence,
      versionMismatch: resolved.versionMismatch,
      savedMappingVersion: resolved.savedMappingVersion,
      appliedMappings: resolved.appliedMappings,
      skippedMappings: resolved.skippedMappings,
      outdatedMappings: resolved.outdatedMappings,
      newMappingsNeeded: resolved.newMappingsNeeded,
      finalMappingCount: resolved.mapping.columnMappings.length,
      explanation: resolved.explanation,
    },
  };
}

function buildValidationStage(
  report: ImportRunReport | undefined,
  durationMs: number | undefined,
  failedStage?: ImportDiagnosticsStageName,
): ImportDiagnosticsStage {
  if (!report) {
    return emptyStage('validation', failedStage);
  }

  const issueCodeCounts = countIssueCodes(report);

  return {
    name: 'validation',
    status: stageStatus('validation', failedStage, true),
    durationMs: durationMs ?? 0,
    output: {
      entityType: report.entityType,
      sheetName: report.sheetName,
      headers: report.headers,
      skippedEmptyRowCount: report.skippedEmptyRowCount,
      ignoredHeaders: report.ignoredHeaders,
      missingSourceHeaders: report.missingSourceHeaders,
      missingRequiredFields: report.missingRequiredFields,
      summary: report.result.summary,
      issueCodeCounts,
      rowStatusCounts: {
        valid: report.result.summary.validRows,
        warning: report.result.summary.warningRows,
        error: report.result.summary.errorRows,
      },
    },
  };
}

function buildGuidanceStage(
  guidance: ImportGuidanceResult | undefined,
  durationMs: number | undefined,
  failedStage?: ImportDiagnosticsStageName,
): ImportDiagnosticsStage {
  if (!guidance) {
    return emptyStage('import-guidance', failedStage);
  }

  return {
    name: 'import-guidance',
    status: stageStatus('import-guidance', failedStage, true),
    durationMs: durationMs ?? 0,
    output: {
      totalItems: guidance.items.length,
      items: guidance.items.map((item) => ({
        code: item.code,
        severity: item.severity,
        title: item.title,
        message: item.message,
        recommendation: item.recommendation,
        relatedFields: item.relatedFields,
      })),
    },
  };
}

function buildMappingStatistics(autoMapping: AutoMappingResult | undefined) {
  return {
    mappedCount: autoMapping?.mappedFields.length ?? 0,
    unmappedCount: autoMapping?.unmappedHeaders.length ?? 0,
    ignoredCount: autoMapping?.ignoredHeaders.length ?? 0,
    ambiguousCount: autoMapping?.ambiguousMappings.length ?? 0,
    mappingConfidence: autoMapping?.mappingConfidence ?? 0,
  };
}

function buildSavedMappingStatistics(resolved: ResolveImportMappingResult | undefined) {
  const appliedFromSavedCount =
    resolved?.appliedMappings.filter((entry) => entry.source === 'saved').length ?? 0;
  const appliedFromAutoCount =
    resolved?.appliedMappings.filter((entry) => entry.source === 'auto').length ?? 0;

  return {
    usedSavedMapping: resolved?.usedSavedMapping ?? false,
    appliedCount: resolved?.appliedMappings.length ?? 0,
    appliedFromSavedCount,
    appliedFromAutoCount,
    skippedCount: resolved?.skippedMappings.length ?? 0,
    outdatedCount: resolved?.outdatedMappings.length ?? 0,
    newMappingsNeededCount: resolved?.newMappingsNeeded.length ?? 0,
    versionMismatch: resolved?.versionMismatch ?? false,
    savedMappingVersion: resolved?.savedMappingVersion ?? null,
    confidence: resolved?.confidence ?? 0,
  };
}

function buildValidationSummary(report: ImportRunReport | undefined) {
  return {
    totalRows: report?.result.summary.totalRows ?? 0,
    validRows: report?.result.summary.validRows ?? 0,
    warningRows: report?.result.summary.warningRows ?? 0,
    errorRows: report?.result.summary.errorRows ?? 0,
    missingRequiredFields: report?.missingRequiredFields ?? [],
    missingSourceHeaders: report?.missingSourceHeaders ?? [],
    ignoredHeaders: report?.ignoredHeaders ?? [],
    issueCodeCounts: countIssueCodes(report),
    skippedEmptyRowCount: report?.skippedEmptyRowCount ?? 0,
  };
}

function buildGuidanceSummary(guidance: ImportGuidanceResult | undefined) {
  const items = guidance?.items ?? [];

  return {
    totalItems: items.length,
    infoCount: items.filter((item) => item.severity === 'info').length,
    warningCount: items.filter((item) => item.severity === 'warning').length,
    errorCount: items.filter((item) => item.severity === 'error').length,
    codes: items.map((item) => item.code).filter((code): code is string => Boolean(code)),
  };
}

function countIssueCodes(report: ImportRunReport | undefined): Record<string, number> {
  if (!report) {
    return {};
  }

  const counts: Record<string, number> = {};

  for (const row of report.result.rows) {
    for (const issue of row.issues) {
      counts[issue.code] = (counts[issue.code] ?? 0) + 1;
    }
  }

  return counts;
}

function collectCrossStageMessages(
  input: BuildImportDiagnosticsInput,
  warnings: ImportDiagnosticMessage[],
  errors: ImportDiagnosticMessage[],
): void {
  if (input.headerDetection && input.headerDetection.confidence < 0.5) {
    warnings.push({
      code: 'LOW_HEADER_CONFIDENCE',
      message: `Header detection confidence is ${input.headerDetection.confidence.toFixed(2)}.`,
      stage: 'header-detection',
      details: { headerRowIndex: input.headerDetection.headerRowIndex },
    });
  }

  if (input.reportDetection && input.reportDetection.confidence < 0.4) {
    warnings.push({
      code: 'LOW_REPORT_CONFIDENCE',
      message: `Report detection confidence is ${input.reportDetection.confidence.toFixed(2)}.`,
      stage: 'report-detection',
      details: { profileId: input.reportDetection.profile.id },
    });
  }

  if (input.autoMapping && input.autoMapping.ambiguousMappings.length > 0) {
    warnings.push({
      code: 'AMBIGUOUS_MAPPINGS',
      message: `${input.autoMapping.ambiguousMappings.length} ambiguous column mapping(s) detected.`,
      stage: 'auto-mapping',
      details: {
        headers: input.autoMapping.ambiguousMappings.map((entry) => entry.sourceHeader),
      },
    });
  }

  if (input.resolved?.versionMismatch) {
    warnings.push({
      code: 'SAVED_MAPPING_VERSION_MISMATCH',
      message: 'Saved mapping schema version differs from the current version.',
      stage: 'saved-mapping',
      details: { savedMappingVersion: input.resolved.savedMappingVersion },
    });
  }

  if (input.report && input.report.missingRequiredFields.length > 0) {
    errors.push({
      code: 'MISSING_REQUIRED_FIELDS',
      message: `Missing required field mappings: ${input.report.missingRequiredFields.join(', ')}.`,
      stage: 'validation',
      details: { fields: input.report.missingRequiredFields },
    });
  }

  if (input.report && input.report.result.summary.errorRows > 0) {
    warnings.push({
      code: 'VALIDATION_ERRORS',
      message: `${input.report.result.summary.errorRows} row(s) failed validation.`,
      stage: 'validation',
      details: { issueCodeCounts: countIssueCodes(input.report) },
    });
  }
}

function stageStatus(
  stage: ImportDiagnosticsStageName,
  failedStage: ImportDiagnosticsStageName | undefined,
  hasOutput: boolean,
): ImportDiagnosticsStageStatus {
  if (!hasOutput) {
    return failedStage === stage ? 'failed' : 'skipped';
  }

  if (failedStage === stage) {
    return 'failed';
  }

  return 'completed';
}

function emptyStage(
  name: ImportDiagnosticsStageName,
  failedStage?: ImportDiagnosticsStageName,
): ImportDiagnosticsStage {
  return {
    name,
    status: failedStage === name ? 'failed' : 'skipped',
    durationMs: 0,
    output: {},
  };
}
