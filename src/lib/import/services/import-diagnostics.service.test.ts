/**
 * Import Diagnostics service tests.
 */

import { describe, expect, it } from 'vitest';

import { PRODUCT_IMPORT_COLUMNS } from '@/lib/import/definitions/product.definition';
import { SALE_IMPORT_COLUMNS } from '@/lib/import/definitions/sale.definition';
import {
  PRODUCT_IMPORT_REPORT,
  SALES_DETAIL_REPORT,
  SALES_SUMMARY_REPORT,
  UNKNOWN_REPORT,
} from '@/lib/import/reports';
import type { ReportDetectionResult } from '@/lib/import/reports/types';
import { buildAutoMapping } from '@/lib/import/services/auto-mapping';
import { buildImportGuidance } from '@/lib/import/services/import-guidance.service';
import {
  buildImportDiagnostics,
  createImportDiagnosticsTimer,
  serializeImportDiagnostics,
} from '@/lib/import/services/import-diagnostics.service';
import type { HeaderDetectionResult } from '@/lib/import/services/header-detection.service';
import type { ImportRunReport } from '@/lib/import/services/import.service';
import { applySavedMapping } from '@/lib/import/services/saved-mapping.service';
import type { SavedMappingDocument } from '@/lib/import/saved-mapping/types';

function reportDetection(
  profile: ReportDetectionResult['profile'],
  confidence: number,
  overrides: Partial<ReportDetectionResult> = {},
): ReportDetectionResult {
  return {
    profile,
    reportType: profile.reportType,
    confidence,
    matchedColumns: [],
    missingColumns: [],
    matchedHeaders: ['Product Name', 'Selling Price'],
    missingHeaders: [],
    unmatchedHeaders: [],
    explanation: ['Matched product import structure.'],
    candidates: [
      {
        definitionId: profile.id,
        displayName: profile.displayName,
        confidence,
        coverage: {
          matchedRequiredKeys: ['name'],
          missingRequiredKeys: [],
          matchedOptionalKeys: [],
          unmatchedFileHeaders: [],
          matchedFileHeaders: ['Product Name'],
          matchedColumns: [],
          missingColumns: [],
          requiredTotal: profile.requiredFields.length,
          optionalTotal: profile.optionalFields.length,
          fileHeaderTotal: 2,
        },
      },
    ],
    ...overrides,
  };
}

function headerDetection(
  overrides: Partial<HeaderDetectionResult> = {},
): HeaderDetectionResult {
  return {
    headerRowIndex: 2,
    detectedHeaders: ['Product Name', 'Selling Price', 'Notes'],
    confidence: 0.91,
    scoreBreakdown: {
      aliasMatches: 2,
      requiredFieldMatches: 2,
      headerDensity: 1,
      duplicateHeaderCount: 0,
      emptyCellCount: 0,
      totalScore: 45,
    },
    reasoning: ['Row 3 matched 2 required aliases.'],
    ...overrides,
  };
}

function emptyReport(overrides: Partial<ImportRunReport> = {}): ImportRunReport {
  return {
    entityType: 'product',
    sheetName: 'Items',
    headers: ['Product Name', 'Selling Price'],
    skippedEmptyRowCount: 1,
    ignoredHeaders: ['Notes'],
    missingSourceHeaders: [],
    missingRequiredFields: [],
    result: {
      rows: [
        {
          rowNumber: 2,
          values: { name: 'Bread', sellingPrice: 45 },
          issues: [],
          status: 'valid',
        },
        {
          rowNumber: 3,
          values: { name: '', sellingPrice: 10 },
          issues: [
            {
              severity: 'error',
              code: 'REQUIRED_FIELD_MISSING',
              message: 'Product name is required.',
              field: 'name',
            },
          ],
          status: 'error',
        },
      ],
      summary: { totalRows: 2, validRows: 1, warningRows: 0, errorRows: 1 },
    },
    ...overrides,
  };
}

function savedDoc(
  overrides: Partial<SavedMappingDocument> &
    Pick<SavedMappingDocument, 'entity' | 'reportType' | 'mappings'>,
): SavedMappingDocument {
  const now = new Date('2026-07-01T00:00:00.000Z');

  return {
    organizationId: 'org-1',
    version: 1,
    createdAt: now,
    lastUsedAt: now,
    ...overrides,
  };
}

describe('buildImportDiagnostics', () => {
  const startedAt = Date.parse('2026-07-24T00:00:00.000Z');
  const completedAt = startedAt + 128;

  it('1. captures Header Detection', () => {
    const header = headerDetection();
    const diagnostics = buildImportDiagnostics({
      entityType: 'product',
      startedAt,
      completedAt,
      headerDetection: header,
      stageTimings: { 'header-detection': 12 },
    });

    expect(diagnostics.detectedHeaderRow).toBe(2);
    expect(diagnostics.detectedHeaders).toEqual(['Product Name', 'Selling Price', 'Notes']);

    const stage = diagnostics.pipelineStages.find((entry) => entry.name === 'header-detection');
    expect(stage?.status).toBe('completed');
    expect(stage?.durationMs).toBe(12);
    expect(stage?.output.confidence).toBe(0.91);
    expect(stage?.output.reasoning).toEqual(['Row 3 matched 2 required aliases.']);
  });

  it('2. captures Report Detection', () => {
    const report = reportDetection(PRODUCT_IMPORT_REPORT, 0.88);
    const diagnostics = buildImportDiagnostics({
      entityType: 'product',
      startedAt,
      completedAt,
      reportDetection: report,
      stageTimings: { 'report-detection': 8 },
    });

    expect(diagnostics.reportType).toBe('product-import');
    expect(diagnostics.reportConfidence).toBe(0.88);
    expect(diagnostics.profileId).toBe('product-import');

    const stage = diagnostics.pipelineStages.find((entry) => entry.name === 'report-detection');
    expect(stage?.output.displayName).toBe('Product Import');
    expect(stage?.output.topCandidates).toHaveLength(1);
  });

  it('3. captures Auto Mapping statistics', () => {
    const headers = ['Product Name', 'Selling Price', 'Unit'];
    const autoMapping = buildAutoMapping(headers, PRODUCT_IMPORT_COLUMNS, {
      profile: PRODUCT_IMPORT_REPORT,
    });

    const diagnostics = buildImportDiagnostics({
      entityType: 'product',
      startedAt,
      completedAt,
      autoMapping,
      stageTimings: { 'auto-mapping': 5 },
    });

    expect(diagnostics.mappingStatistics.mappedCount).toBe(autoMapping.mappedFields.length);
    expect(diagnostics.mappingStatistics.mappingConfidence).toBe(autoMapping.mappingConfidence);
    expect(diagnostics.mappingStatistics.ambiguousCount).toBe(0);

    const stage = diagnostics.pipelineStages.find((entry) => entry.name === 'auto-mapping');
    expect(stage?.output.mappedFields).toEqual(autoMapping.mappedFields);
  });

  it('4. captures Saved Mapping usage', () => {
    const headers = ['Product Name', 'Product Code', 'Selling Price'];
    const autoMapping = buildAutoMapping(headers, PRODUCT_IMPORT_COLUMNS, {
      profile: PRODUCT_IMPORT_REPORT,
    });
    const resolved = applySavedMapping({
      headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: savedDoc({
        entity: 'product',
        reportType: 'product-import',
        mappings: [
          { sourceHeader: 'Product Name', targetField: 'name' },
          { sourceHeader: 'Product Code', targetField: 'code' },
        ],
      }),
    });

    const diagnostics = buildImportDiagnostics({
      entityType: 'product',
      startedAt,
      completedAt,
      resolved,
    });

    expect(diagnostics.savedMappingStatistics.usedSavedMapping).toBe(true);
    expect(diagnostics.savedMappingStatistics.appliedFromSavedCount).toBe(2);
    expect(diagnostics.savedMappingStatistics.appliedFromAutoCount).toBe(1);

    const stage = diagnostics.pipelineStages.find((entry) => entry.name === 'saved-mapping');
    expect(stage?.output.usedSavedMapping).toBe(true);
    expect(stage?.output.explanation).toEqual(expect.arrayContaining([expect.stringMatching(/Saved Mapping/i)]));
  });

  it('5. captures Validation summary', () => {
    const report = emptyReport();

    const diagnostics = buildImportDiagnostics({
      entityType: 'product',
      startedAt,
      completedAt,
      report,
      stageTimings: { validation: 18 },
    });

    expect(diagnostics.validationSummary.totalRows).toBe(2);
    expect(diagnostics.validationSummary.validRows).toBe(1);
    expect(diagnostics.validationSummary.errorRows).toBe(1);
    expect(diagnostics.validationSummary.issueCodeCounts.REQUIRED_FIELD_MISSING).toBe(1);
    expect(diagnostics.validationSummary.skippedEmptyRowCount).toBe(1);

    const stage = diagnostics.pipelineStages.find((entry) => entry.name === 'validation');
    expect(stage?.output.summary).toEqual(report.result.summary);
  });

  it('6. captures Guidance summary', () => {
    const headers = ['Invoice No', 'Invoice Date', 'Amount', 'Description', 'Qty'];
    const autoMapping = buildAutoMapping(headers, SALE_IMPORT_COLUMNS, {
      profile: SALES_SUMMARY_REPORT,
    });
    const resolved = applySavedMapping({
      headers,
      columns: SALE_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: null,
    });
    const reportDet = reportDetection(SALES_SUMMARY_REPORT, 0.85, {
      matchedHeaders: ['Invoice No', 'Invoice Date', 'Amount'],
    });
    const header = headerDetection({
      detectedHeaders: headers,
      headerRowIndex: 0,
    });
    const report = emptyReport({
      entityType: 'sale',
      sheetName: 'Sales',
      headers,
      missingRequiredFields: [],
      result: {
        rows: [],
        summary: { totalRows: 0, validRows: 0, warningRows: 0, errorRows: 0 },
      },
    });
    const guidance = buildImportGuidance({
      columns: SALE_IMPORT_COLUMNS,
      headerDetection: header,
      reportDetection: reportDet,
      autoMapping,
      resolved,
      report,
    });

    const diagnostics = buildImportDiagnostics({
      entityType: 'sale',
      startedAt,
      completedAt,
      headerDetection: header,
      reportDetection: reportDet,
      autoMapping,
      resolved,
      report,
      guidance,
    });

    expect(diagnostics.guidanceSummary.totalItems).toBeGreaterThan(0);
    expect(diagnostics.guidanceSummary.codes).toEqual(
      expect.arrayContaining(['REPORT_DETECTED', 'INVENTORY_WILL_NOT_UPDATE']),
    );

    const stage = diagnostics.pipelineStages.find((entry) => entry.name === 'import-guidance');
    expect(stage?.output.totalItems).toBe(guidance.items.length);
  });

  it('7. failed imports still produce diagnostics', () => {
    const header = headerDetection();
    const reportDet = reportDetection(PRODUCT_IMPORT_REPORT, 0.88);
    const autoMapping = buildAutoMapping(
      ['Unknown Column'],
      PRODUCT_IMPORT_COLUMNS,
      { profile: PRODUCT_IMPORT_REPORT },
    );

    const diagnostics = buildImportDiagnostics({
      entityType: 'product',
      fileName: 'broken.xlsx',
      startedAt,
      completedAt,
      headerDetection: header,
      reportDetection: reportDet,
      autoMapping,
      failure: {
        code: 'VALIDATION_ERROR',
        message: 'None of the columns in this file were recognized as product fields.',
        stage: 'saved-mapping',
      },
    });

    expect(diagnostics.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'VALIDATION_ERROR',
          stage: 'saved-mapping',
        }),
      ]),
    );
    expect(diagnostics.detectedHeaderRow).toBe(2);
    expect(diagnostics.mappingStatistics.mappedCount).toBe(autoMapping.mappedFields.length);
    expect(diagnostics.validationSummary.totalRows).toBe(0);

    const savedStage = diagnostics.pipelineStages.find((entry) => entry.name === 'saved-mapping');
    expect(savedStage?.status).toBe('failed');

    const validationStage = diagnostics.pipelineStages.find((entry) => entry.name === 'validation');
    expect(validationStage?.status).toBe('skipped');
  });

  it('records report profile stage output from profile data', () => {
    const reportDet = reportDetection(SALES_DETAIL_REPORT, 0.9);

    const diagnostics = buildImportDiagnostics({
      entityType: 'sale',
      startedAt,
      completedAt,
      reportDetection: reportDet,
    });

    const profileStage = diagnostics.pipelineStages.find((entry) => entry.name === 'report-profile');
    expect(profileStage?.output.capabilities).toEqual(SALES_DETAIL_REPORT.capabilities);
    expect(profileStage?.output.recommendedImportMode).toBe('line-item-commit');
  });

  it('collects cross-stage warnings for low confidence and validation errors', () => {
    const report = emptyReport({
      missingRequiredFields: ['sellingPrice'],
    });

    const diagnostics = buildImportDiagnostics({
      entityType: 'product',
      startedAt,
      completedAt,
      headerDetection: headerDetection({ confidence: 0.3 }),
      reportDetection: reportDetection(UNKNOWN_REPORT, 0.2),
      autoMapping: buildAutoMapping(['Shared'], PRODUCT_IMPORT_COLUMNS, {
        profile: UNKNOWN_REPORT,
      }),
      report,
    });

    expect(diagnostics.warnings.some((entry) => entry.code === 'LOW_HEADER_CONFIDENCE')).toBe(true);
    expect(diagnostics.warnings.some((entry) => entry.code === 'LOW_REPORT_CONFIDENCE')).toBe(true);
    expect(diagnostics.errors.some((entry) => entry.code === 'MISSING_REQUIRED_FIELDS')).toBe(true);
    expect(diagnostics.warnings.some((entry) => entry.code === 'VALIDATION_ERRORS')).toBe(true);
  });
});

describe('createImportDiagnosticsTimer', () => {
  it('records stage durations', () => {
    const timer = createImportDiagnosticsTimer(1000);
    timer.markStageStart('header-detection');
    timer.markStageEnd('header-detection');

    expect(timer.getStageTimings()['header-detection']).toBeGreaterThanOrEqual(0);
    expect(timer.now()).toBeGreaterThanOrEqual(1000);
  });
});

describe('serializeImportDiagnostics', () => {
  it('produces JSON suitable for export', () => {
    const diagnostics = buildImportDiagnostics({
      entityType: 'product',
      startedAt: Date.parse('2026-07-24T00:00:00.000Z'),
      completedAt: Date.parse('2026-07-24T00:00:00.128Z'),
      headerDetection: headerDetection(),
    });

    const json = serializeImportDiagnostics(diagnostics);
    const parsed = JSON.parse(json) as typeof diagnostics;

    expect(parsed.detectedHeaderRow).toBe(2);
    expect(parsed.executionTime.totalMs).toBe(128);
    expect(parsed.pipelineStages.length).toBe(7);
  });
});
