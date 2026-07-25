/**
 * Public barrel for Report Detection (types, definitions, detector).
 *
 * ReportDefinition === ReportProfile (single source of truth).
 */

export {
  BUILTIN_REPORT_DEFINITIONS,
  ITEM_SUMMARY_REPORT,
  PRODUCT_IMPORT_REPORT,
  PURCHASE_DETAIL_REPORT,
  SALES_DETAIL_REPORT,
  SALES_SUMMARY_REPORT,
} from '@/lib/import/reports/definitions';
export {
  DEFAULT_UNKNOWN_CONFIDENCE_THRESHOLD,
  calculateDefaultConfidence,
  detectReport,
  type DetectReportOptions,
} from '@/lib/import/reports/report-detection.service';
export {
  EMPTY_CAPABILITIES,
  UNKNOWN_REPORT,
  createCapabilities,
  type DetectedReport,
  type RecommendedImportMode,
  type ReportCandidateScore,
  type ReportCapabilities,
  type ReportConfidenceWeights,
  type ReportCoverage,
  type ReportDefinition,
  type ReportDetectionResult,
  type ReportEntitySupport,
  type ReportFieldRequirement,
  type ReportHeaderRequirement,
  type ReportMappingHints,
  type ReportProfile,
  type ReportType,
  type ReportValidationHints,
} from '@/lib/import/reports/types';
