/**
 * Import Guidance service — converts structured pipeline outputs into
 * user-facing guidance messages.
 *
 * Pure: no React, no Firestore, no vendor-specific wording.
 * Consumes data from Header Detection, Report Detection, Auto Mapping,
 * Saved Mapping, and Validation — never generates mapping or detection logic.
 */

import type { ColumnDefinition } from '@/lib/import/engine/types';
import type { ImportGuidanceItem, ImportGuidanceResult } from '@/lib/import/guidance/types';
import type { ReportDefinition } from '@/lib/import/reports/types';
import type { AutoMappingResult } from '@/lib/import/services/auto-mapping';
import type { HeaderDetectionResult } from '@/lib/import/services/header-detection.service';
import type { ImportRunReport } from '@/lib/import/services/import.service';
import type { ResolveImportMappingResult } from '@/lib/import/services/saved-mapping.service';
import type { ReportDetectionResult } from '@/lib/import/reports/types';

export type BuildImportGuidanceInput = {
  columns: readonly ColumnDefinition[];
  headerDetection: HeaderDetectionResult;
  reportDetection: ReportDetectionResult;
  autoMapping: AutoMappingResult;
  resolved: ResolveImportMappingResult;
  report: ImportRunReport;
  /** When true, include guidance that the mapping will be saved after import. */
  saveMappingEnabled?: boolean;
};

const UNKNOWN_CONFIDENCE_THRESHOLD = 0.4;

/** Builds the full guidance bundle from pipeline outputs. */
export function buildImportGuidance(input: BuildImportGuidanceInput): ImportGuidanceResult {
  const items: ImportGuidanceItem[] = [
    ...buildReportDetectionGuidance(input.reportDetection),
    ...buildInventoryGuidance(input.reportDetection.profile),
    ...buildMissingRequiredGuidance(input.report, input.columns),
    ...buildUnknownReportGuidance(input.reportDetection),
    ...buildHeaderDetectionGuidance(input.headerDetection),
    ...buildIgnoredFieldsGuidance(
      input.autoMapping,
      input.reportDetection.profile,
      input.columns,
    ),
    ...buildAmbiguousMappingGuidance(input.autoMapping, input.columns),
    ...buildSavedMappingGuidance(input.resolved, input.reportDetection.profile),
    ...buildSaveMappingToggleGuidance(
      input.saveMappingEnabled ?? false,
      input.reportDetection.profile.reportType,
    ),
  ];

  return { items: sortGuidanceItems(items) };
}

/**
 * Adds or removes the "will be remembered" item when the user toggles
 * save mapping in the Mapping Review UI.
 */
export function applySaveMappingToggleGuidance(
  result: ImportGuidanceResult,
  saveMappingEnabled: boolean,
  reportType: string,
): ImportGuidanceResult {
  const withoutToggle = result.items.filter((item) => item.code !== 'SAVE_MAPPING_PENDING');
  const toggleItems = buildSaveMappingToggleGuidance(saveMappingEnabled, reportType);

  return { items: sortGuidanceItems([...withoutToggle, ...toggleItems]) };
}

function buildReportDetectionGuidance(
  reportDetection: ReportDetectionResult,
): ImportGuidanceItem[] {
  const { profile, confidence } = reportDetection;

  if (profile.reportType === 'unknown') {
    return [];
  }

  const confidenceLabel = formatPercent(confidence);

  return [
    {
      code: 'REPORT_DETECTED',
      severity: confidence >= UNKNOWN_CONFIDENCE_THRESHOLD ? 'info' : 'warning',
      title: 'Report detected',
      message: `This file was detected as a ${profile.displayName}.`,
      recommendation:
        confidence < UNKNOWN_CONFIDENCE_THRESHOLD
          ? 'Review the column mapping carefully — detection confidence is lower than usual.'
          : null,
      relatedFields: reportDetection.matchedHeaders,
    },
    ...(confidence < UNKNOWN_CONFIDENCE_THRESHOLD
      ? [
          {
            code: 'REPORT_LOW_CONFIDENCE',
            severity: 'warning' as const,
            title: 'Detection confidence is moderate',
            message: `Report detection confidence is ${confidenceLabel}. The file may not fully match the expected ${profile.displayName} structure.`,
            recommendation:
              'Confirm the detected report type and adjust column mappings before importing.',
            relatedFields: reportDetection.missingHeaders,
          },
        ]
      : []),
  ];
}

function buildInventoryGuidance(profile: ReportDefinition): ImportGuidanceItem[] {
  const allowsInventory =
    profile.capabilities.supportsInventory &&
    profile.validationHints.allowInventoryMutation !== false;

  if (profile.supportedEntity === 'sale') {
    if (allowsInventory) {
      return [
        {
          code: 'INVENTORY_WILL_UPDATE',
          severity: 'info',
          title: 'Inventory will be updated',
          message:
            'This report includes line-item quantities, so product inventory will be adjusted when you import.',
          recommendation: 'Ensure product names or codes in the file match your catalog.',
          relatedFields: ['quantity', 'productName', 'productCode'],
        },
      ];
    }

    return [
      {
        code: 'INVENTORY_WILL_NOT_UPDATE',
        severity: 'info',
        title: 'Inventory will not be updated',
        message:
          'This report does not contain line-item quantities, so inventory will not change.',
        recommendation:
          'Use a line-item sales report if you need stock levels adjusted automatically.',
        relatedFields: [],
      },
    ];
  }

  if (profile.supportedEntity === 'purchase' && allowsInventory) {
    return [
      {
        code: 'INVENTORY_WILL_UPDATE',
        severity: 'info',
        title: 'Inventory will be updated',
        message:
          'This purchase report includes quantities, so raw material inventory will be adjusted when you import.',
        recommendation: null,
        relatedFields: ['quantity'],
      },
    ];
  }

  return [];
}

function buildMissingRequiredGuidance(
  report: ImportRunReport,
  columns: readonly ColumnDefinition[],
): ImportGuidanceItem[] {
  if (report.missingRequiredFields.length === 0) {
    return [];
  }

  const labelByField = new Map(columns.map((column) => [column.field, column.label]));
  const labels = report.missingRequiredFields.map(
    (field) => labelByField.get(field) ?? field,
  );

  return [
    {
      code: 'MISSING_REQUIRED_FIELDS',
      severity: 'error',
      title: 'Required fields are not mapped',
      message: `The following required fields have no column mapped: ${formatList(labels)}.`,
      recommendation: 'Map a source column to each required field before continuing.',
      relatedFields: report.missingRequiredFields,
    },
  ];
}

function buildUnknownReportGuidance(
  reportDetection: ReportDetectionResult,
): ImportGuidanceItem[] {
  if (reportDetection.profile.reportType !== 'unknown') {
    return [];
  }

  return [
    {
      code: 'UNKNOWN_REPORT',
      severity: 'info',
      title: 'Custom spreadsheet',
      message:
        'This file does not match a known export format. Map your file columns to BakeryOS fields below.',
      recommendation: 'Match each required field to a column in your file before continuing.',
      relatedFields: reportDetection.unmatchedHeaders,
    },
  ];
}

function buildHeaderDetectionGuidance(
  headerDetection: HeaderDetectionResult,
): ImportGuidanceItem[] {
  if (headerDetection.confidence >= 0.5) {
    return [];
  }

  return [
    {
      code: 'LOW_HEADER_CONFIDENCE',
      severity: 'warning',
      title: 'Header row may be uncertain',
      message: `Header detection confidence is ${formatPercent(headerDetection.confidence)}. The selected header row may not contain recognizable column names.`,
      recommendation:
        'Check that the first row of your file contains column headers matching your data fields.',
      relatedFields: headerDetection.detectedHeaders,
    },
  ];
}

function buildIgnoredFieldsGuidance(
  autoMapping: AutoMappingResult,
  profile: ReportDefinition,
  columns: readonly ColumnDefinition[],
): ImportGuidanceItem[] {
  if (autoMapping.ignoredHeaders.length === 0) {
    return [];
  }

  const labelByField = new Map(columns.map((column) => [column.field, column.label]));
  const ignoredFieldKeys = profile.mappingHints.ignoreFields ?? [];
  const ignoredFieldLabels = ignoredFieldKeys.map(
    (field) => labelByField.get(field) ?? field,
  );

  const profileReason =
    ignoredFieldLabels.length > 0
      ? ` Columns such as ${formatList(ignoredFieldLabels)} are not used for ${profile.displayName} imports.`
      : '';

  return [
    {
      code: 'IGNORED_HEADERS',
      severity: 'info',
      title: 'Some columns were ignored',
      message: `${formatList(autoMapping.ignoredHeaders)} ${autoMapping.ignoredHeaders.length === 1 ? 'was' : 'were'} not mapped because ${profile.displayName} does not use ${autoMapping.ignoredHeaders.length === 1 ? 'this field' : 'these fields'}.${profileReason}`,
      recommendation: null,
      relatedFields: autoMapping.ignoredHeaders,
    },
  ];
}

function buildAmbiguousMappingGuidance(
  autoMapping: AutoMappingResult,
  columns: readonly ColumnDefinition[],
): ImportGuidanceItem[] {
  if (autoMapping.ambiguousMappings.length === 0) {
    return [];
  }

  const labelByField = new Map(columns.map((column) => [column.field, column.label]));

  return autoMapping.ambiguousMappings.map((entry) => {
    const candidateLabels = entry.candidates.map(
      (candidate) => labelByField.get(candidate.targetField) ?? candidate.targetField,
    );

    const message =
      entry.candidates.length === 2
        ? `Two columns could map to ${formatList(candidateLabels)}. The column "${entry.sourceHeader}" needs your choice.`
        : `The column "${entry.sourceHeader}" could map to multiple fields: ${formatList(candidateLabels)}.`;

    return {
      code: 'AMBIGUOUS_MAPPING',
      severity: 'warning' as const,
      title: 'Ambiguous column mapping',
      message,
      recommendation: 'Choose the correct field for this column in the mapping table.',
      relatedFields: [entry.sourceHeader, ...entry.candidates.map((c) => c.targetField)],
    };
  });
}

function buildSavedMappingGuidance(
  resolved: ResolveImportMappingResult,
  profile: ReportDefinition,
): ImportGuidanceItem[] {
  if (!resolved.usedSavedMapping) {
    return [];
  }

  const appliedCount = resolved.appliedMappings.filter((entry) => entry.source === 'saved').length;

  return [
    {
      code: 'SAVED_MAPPING_APPLIED',
      severity: 'info',
      title: 'Saved mapping applied',
      message: `A previously saved column mapping was applied to this ${profile.displayName} file${appliedCount > 0 ? ` (${appliedCount} column${appliedCount === 1 ? '' : 's'})` : ''}.`,
      recommendation: 'Review the mapping below and adjust any columns that changed since your last import.',
      relatedFields: resolved.appliedMappings
        .filter((entry) => entry.source === 'saved')
        .map((entry) => entry.sourceHeader),
    },
  ];
}

function buildSaveMappingToggleGuidance(
  saveMappingEnabled: boolean,
  reportType: string,
): ImportGuidanceItem[] {
  if (!saveMappingEnabled || reportType === 'unknown') {
    return [];
  }

  return [
    {
      code: 'SAVE_MAPPING_PENDING',
      severity: 'info',
      title: 'Mapping will be saved',
      message: 'This mapping will be remembered for future imports.',
      recommendation: null,
      relatedFields: [],
    },
  ];
}

function sortGuidanceItems(items: ImportGuidanceItem[]): ImportGuidanceItem[] {
  const severityOrder: Record<ImportGuidanceItem['severity'], number> = {
    error: 0,
    warning: 1,
    info: 2,
  };

  return [...items].sort(
    (left, right) => severityOrder[left.severity] - severityOrder[right.severity],
  );
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatList(items: readonly string[]): string {
  if (items.length === 0) {
    return '';
  }

  if (items.length === 1) {
    return `"${items[0]}"`;
  }

  if (items.length === 2) {
    return `"${items[0]}" and "${items[1]}"`;
  }

  const head = items.slice(0, -1).map((item) => `"${item}"`).join(', ');
  return `${head}, and "${items[items.length - 1]}"`;
}
