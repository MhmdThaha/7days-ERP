/**
 * Phase 10 — End-to-end pipeline validation.
 *
 * Exercises the complete import framework through every pipeline stage for
 * all six report profiles. Does not add user-facing features — validates
 * production readiness of the existing architecture.
 */

import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { PRODUCT_IMPORT_COLUMNS } from '@/lib/import/definitions/product.definition';
import { SALE_IMPORT_COLUMNS } from '@/lib/import/definitions/sale.definition';
import {
  ITEM_SUMMARY_REPORT,
  PRODUCT_IMPORT_REPORT,
  PURCHASE_DETAIL_REPORT,
  SALES_DETAIL_REPORT,
  SALES_SUMMARY_REPORT,
  UNKNOWN_REPORT,
} from '@/lib/import/reports';
import { buildAutoMapping } from '@/lib/import/services/auto-mapping';
import {
  buildImportDiagnostics,
  createImportDiagnosticsTimer,
} from '@/lib/import/services/import-diagnostics.service';
import { buildImportGuidance } from '@/lib/import/services/import-guidance.service';
import { detectHeaderRow } from '@/lib/import/services/header-detection.service';
import { detectReport } from '@/lib/import/reports/report-detection.service';
import {
  emptyImportRunReport,
  prepareImportFile,
  runImport,
  runImportFromParsed,
  type ImportRunReport,
} from '@/lib/import/services/import.service';
import { buildImportReview } from '@/lib/import/pipeline/analysis-pipeline';
import { normalizedSaleDateToIso } from '@/lib/import/preparation/sales-import-preparation.types';
import { buildMappingReviewBundle, CUSTOM_SPREADSHEET_DISPLAY_NAME } from '@/lib/import/services/mapping-review.service';
import { applySavedMapping } from '@/lib/import/services/saved-mapping.service';
import type { SavedMappingDocument } from '@/lib/import/saved-mapping/types';
import { SAVED_MAPPING_SCHEMA_VERSION } from '@/lib/import/saved-mapping/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function csvBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function xlsxBytes(rows: unknown[][], sheetName = 'Sheet1'): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

function buildRows(rowCount: number, columnCount: number): unknown[][] {
  const headers = Array.from({ length: columnCount }, (_, index) => `Col ${index + 1}`);
  headers[0] = 'Product Name';
  headers[1] = 'Selling Price';

  const rows: unknown[][] = [headers];
  for (let row = 0; row < rowCount; row += 1) {
    rows.push([`Product ${row + 1}`, 10 + (row % 50)]);
  }

  return rows;
}

const REPORT_FIXTURES = {
  'product-import': {
    entityType: 'product' as const,
    csv: [
      'Product Name,Product Code,Selling Price,Unit,Category',
      'Milk Bread,BRD-001,45,pcs,Bread',
      'Veg Puff,PUF-002,25,pcs,Savory',
    ].join('\n'),
    fileName: 'products.csv',
    expectedProfile: PRODUCT_IMPORT_REPORT,
    columns: PRODUCT_IMPORT_COLUMNS,
  },
  'sales-summary': {
    entityType: 'sale' as const,
    csv: [
      'Invoice No,Invoice Date,Amount,Contact Name',
      'INV-001,2026-03-01,1250,Walk-in',
      'INV-002,2026-03-02,890,Regular',
    ].join('\n'),
    fileName: 'sales-summary.csv',
    expectedProfile: SALES_SUMMARY_REPORT,
    columns: SALE_IMPORT_COLUMNS,
  },
  'sales-detail': {
    entityType: 'sale' as const,
    csv: [
      'Invoice No,Date,Item Name,Qty,Rate',
      'INV-001,2026-03-01,Milk Bread,2,45',
      'INV-001,2026-03-01,Veg Puff,1,25',
    ].join('\n'),
    fileName: 'sales-detail.csv',
    expectedProfile: SALES_DETAIL_REPORT,
    columns: SALE_IMPORT_COLUMNS,
  },
  'item-summary': {
    entityType: 'product' as const,
    csv: [
      'Item Name,Item Code,Qty Sold,Amount',
      'Milk Bread,BRD-001,120,5400',
      'Veg Puff,PUF-002,80,2000',
    ].join('\n'),
    fileName: 'item-summary.csv',
    expectedProfile: ITEM_SUMMARY_REPORT,
    columns: PRODUCT_IMPORT_COLUMNS,
  },
  'purchase-detail': {
    entityType: 'product' as const,
    csv: [
      'Bill Date,Supplier,Item Name,Qty,Rate',
      '2026-03-01,Flour Co,Refined Flour,100,42',
      '2026-03-01,Flour Co,Butter,20,180',
    ].join('\n'),
    fileName: 'purchase-detail.csv',
    expectedProfile: PURCHASE_DETAIL_REPORT,
    entityForDetection: 'purchase' as const,
    columns: PRODUCT_IMPORT_COLUMNS,
  },
  unknown: {
    entityType: 'sale' as const,
    csv: ['Foo,Bar,Baz', '1,2,3'].join('\n'),
    fileName: 'unknown.csv',
    expectedProfile: UNKNOWN_REPORT,
    columns: SALE_IMPORT_COLUMNS,
  },
} as const;

function emptyReportForEntity(entityType: 'product' | 'sale'): ImportRunReport {
  return {
    entityType,
    sheetName: 'Sheet1',
    headers: [],
    skippedEmptyRowCount: 0,
    ignoredHeaders: [],
    missingSourceHeaders: [],
    missingRequiredFields: [],
    result: {
      rows: [],
      summary: { totalRows: 0, validRows: 0, warningRows: 0, errorRows: 0 },
    },
  };
}

type RunnableFixture = {
  key: keyof typeof REPORT_FIXTURES;
  entityType: 'product' | 'sale';
  detectionEntityType?: 'product' | 'sale' | 'purchase';
  csv: string;
  fileName: string;
  expectedProfile: typeof PRODUCT_IMPORT_REPORT;
  columns: typeof PRODUCT_IMPORT_COLUMNS | typeof SALE_IMPORT_COLUMNS;
};

function runFullPipeline(fixture: RunnableFixture) {
  const timer = createImportDiagnosticsTimer();
  const detectionEntity = fixture.detectionEntityType ?? fixture.entityType;
  const bytes = csvBytes(fixture.csv);

  timer.markStageStart('header-detection');
  timer.markStageStart('report-detection');
  const prepared = prepareImportFile(bytes, fixture.entityType, {
    fileName: fixture.fileName,
  });
  timer.markStageEnd('header-detection');
  timer.markStageEnd('report-detection');

  const reportDetectionOverride =
    fixture.detectionEntityType !== undefined
      ? detectReport(prepared.parsed.headers, { entityType: fixture.detectionEntityType })
      : prepared.reportDetection;

  timer.markStageStart('auto-mapping');
  const autoMapping = buildAutoMapping(prepared.parsed.headers, fixture.columns, {
    profile: reportDetectionOverride.profile,
  });
  timer.markStageEnd('auto-mapping');

  timer.markStageStart('saved-mapping');
  const resolved = applySavedMapping({
    headers: prepared.parsed.headers,
    columns: fixture.columns,
    autoMapping,
    savedMapping: null,
  });
  timer.markStageEnd('saved-mapping');

  timer.markStageStart('validation');
  let report;
  if (resolved.mapping.columnMappings.length === 0) {
    report = undefined;
  } else {
    report = runImportFromParsed(
      prepared.parsed,
      fixture.entityType,
      resolved.mapping,
    );
  }
  timer.markStageEnd('validation');

  timer.markStageStart('import-guidance');
  const guidance = buildImportGuidance({
    columns: fixture.columns,
    headerDetection: prepared.headerDetection,
    reportDetection: reportDetectionOverride,
    autoMapping,
    resolved,
    report: report ?? emptyReportForEntity(fixture.entityType),
  });
  timer.markStageEnd('import-guidance');

  const mappingReview = buildMappingReviewBundle({
    headers: prepared.parsed.headers,
    columns: fixture.columns,
    reportDetection: reportDetectionOverride,
    autoMapping,
    resolved,
  });

  const diagnostics = buildImportDiagnostics({
    entityType: fixture.entityType,
    fileName: fixture.fileName,
    startedAt: timer.startedAt,
    completedAt: timer.now(),
    stageTimings: timer.getStageTimings(),
    headerDetection: prepared.headerDetection,
    reportDetection: reportDetectionOverride,
    autoMapping,
    resolved,
    report: report ?? emptyReportForEntity(fixture.entityType),
    guidance,
  });

  return {
    prepared,
    reportDetection: reportDetectionOverride,
    autoMapping,
    resolved,
    report,
    guidance,
    mappingReview,
    diagnostics,
    timer,
  };
}

// ---------------------------------------------------------------------------
// 1. End-to-end pipeline — all six report types
// ---------------------------------------------------------------------------

describe('Phase 10 — full pipeline by report type', () => {
  const runnableFixtures: RunnableFixture[] = [
    { key: 'product-import', ...REPORT_FIXTURES['product-import'] },
    { key: 'sales-summary', ...REPORT_FIXTURES['sales-summary'] },
    { key: 'sales-detail', ...REPORT_FIXTURES['sales-detail'] },
    { key: 'item-summary', ...REPORT_FIXTURES['item-summary'] },
    {
      key: 'purchase-detail',
      ...REPORT_FIXTURES['purchase-detail'],
      detectionEntityType: 'purchase',
    },
    { key: 'unknown', ...REPORT_FIXTURES.unknown },
  ];

  it.each(runnableFixtures.map((fixture) => [fixture.key, fixture] as const))(
    '%s — runs every pipeline stage',
    (_key, fixture) => {
      const result = runFullPipeline(fixture);

      expect(result.reportDetection.profile.id).toBe(fixture.expectedProfile.id);
      expect(result.reportDetection.profile.reportType).toBe(fixture.expectedProfile.reportType);

      expect(result.prepared.headerDetection.headerRowIndex).toBeGreaterThanOrEqual(0);
      expect(result.prepared.headerDetection.detectedHeaders.length).toBeGreaterThan(0);

      expect(result.autoMapping.mapping.columnMappings.length).toBeGreaterThanOrEqual(0);
      expect(result.resolved.mapping.columnMappings).toBeDefined();

      if (result.report) {
        expect(result.report.result.summary.totalRows).toBeGreaterThanOrEqual(0);
      }

      expect(result.guidance.items.length).toBeGreaterThanOrEqual(0);
      expect(result.mappingReview.viewModel.reportDisplayName).toBe(
        fixture.expectedProfile.reportType === 'unknown'
          ? CUSTOM_SPREADSHEET_DISPLAY_NAME
          : fixture.expectedProfile.displayName,
      );

      expect(result.diagnostics.profileId).toBe(fixture.expectedProfile.id);
      expect(result.diagnostics.pipelineStages.length).toBe(7);
      const completedStages = result.diagnostics.pipelineStages.filter(
        (stage) => stage.status === 'completed',
      );
      expect(completedStages.length).toBeGreaterThanOrEqual(
        fixture.expectedProfile.reportType === 'unknown' ? 5 : 7,
      );
    },
  );

  it('product import produces valid rows and importable mapping review', () => {
    const result = runFullPipeline({ key: 'product-import', ...REPORT_FIXTURES['product-import'] });

    expect(result.report.result.summary.validRows).toBe(2);
    expect(result.report.missingRequiredFields).toEqual([]);
    expect(result.mappingReview.viewModel.mappedHeaders.length).toBeGreaterThan(0);
    expect(result.diagnostics.mappingStatistics.mappedCount).toBeGreaterThan(0);
  });

  it('sales summary guidance explains inventory will not update', () => {
    const result = runFullPipeline({ key: 'sales-summary', ...REPORT_FIXTURES['sales-summary'] });

    expect(result.guidance.items.some((item) => item.code === 'INVENTORY_WILL_NOT_UPDATE')).toBe(
      true,
    );
    expect(result.diagnostics.guidanceSummary.codes).toContain('INVENTORY_WILL_NOT_UPDATE');
  });

  it('sales detail guidance explains inventory will update', () => {
    const result = runFullPipeline({ key: 'sales-detail', ...REPORT_FIXTURES['sales-detail'] });

    expect(result.guidance.items.some((item) => item.code === 'INVENTORY_WILL_UPDATE')).toBe(true);
  });

  it('unknown report produces low confidence diagnostics', () => {
    const result = runFullPipeline({ key: 'unknown', ...REPORT_FIXTURES.unknown });

    expect(result.reportDetection.confidence).toBeLessThan(0.4);
    expect(result.diagnostics.reportConfidence).toBeLessThan(0.4);
    expect(result.diagnostics.warnings.some((entry) => entry.code === 'LOW_REPORT_CONFIDENCE')).toBe(
      true,
    );
    expect(result.mappingReview.viewModel.canSaveMapping).toBe(false);
  });

  it('purchase detail is detected with purchase capabilities', () => {
    const headers = ['Bill Date', 'Supplier', 'Item Name', 'Qty', 'Rate'];
    const detection = detectReport(headers, { entityType: 'purchase' });

    expect(detection.profile).toBe(PURCHASE_DETAIL_REPORT);
    expect(detection.profile.capabilities.supportsPurchaseImport).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Regression — product import + legacy parser + saved mapping
// ---------------------------------------------------------------------------

describe('Phase 10 — regression', () => {
  it('existing product import Vyapar-style CSV still works end-to-end', () => {
    const csv = [
      'Item Name,Item Code,Category,Unit,Sale Price,Purchase Price,GST %,Stock,Min Stock',
      'Milk Bread,BRD-001,Bread,pcs,45,22,5,120,20',
    ].join('\n');

    const report = runImport({
      data: csvBytes(csv),
      fileName: 'vyapar-items.csv',
      entityType: 'product',
      mapping: {
        columnMappings: [
          { sourceHeader: 'Item Name', targetField: 'name' },
          { sourceHeader: 'Item Code', targetField: 'code' },
          { sourceHeader: 'Sale Price', targetField: 'sellingPrice' },
        ],
      },
    });

    expect(report.result.summary.validRows).toBe(1);
    expect(report.result.rows[0]?.values.name).toBe('Milk Bread');
  });

  it('legacy parser path (detectHeaders: false) uses first non-empty row', () => {
    const csv = [
      'Report generated on 2026-03-01',
      '',
      'Product Name,Selling Price',
      'Bread,45',
    ].join('\n');

    const modern = runImport({
      data: csvBytes(csv),
      fileName: 'legacy.csv',
      entityType: 'product',
      mapping: {
        columnMappings: [
          { sourceHeader: 'Product Name', targetField: 'name' },
          { sourceHeader: 'Selling Price', targetField: 'sellingPrice' },
        ],
      },
      detectHeaders: true,
    });

    const legacy = runImport({
      data: csvBytes(csv),
      fileName: 'legacy.csv',
      entityType: 'product',
      mapping: {
        columnMappings: [
          { sourceHeader: 'Product Name', targetField: 'name' },
          { sourceHeader: 'Selling Price', targetField: 'sellingPrice' },
        ],
      },
      detectHeaders: false,
    });

    expect(modern.headers).toContain('Product Name');
    expect(legacy.headers[0]).toBe('Report generated on 2026-03-01');
    expect(legacy.result.summary.totalRows).toBe(2);
  });

  it('saved mapping remains compatible with auto mapping overlay', () => {
    const headers = ['Product Name', 'Product Code', 'Selling Price'];
    const autoMapping = buildAutoMapping(headers, PRODUCT_IMPORT_COLUMNS, {
      profile: PRODUCT_IMPORT_REPORT,
    });
    const savedMapping: SavedMappingDocument = {
      organizationId: 'org-1',
      entity: 'product',
      reportType: 'product-import',
      version: SAVED_MAPPING_SCHEMA_VERSION,
      mappings: [{ sourceHeader: 'Product Code', targetField: 'code' }],
      createdAt: new Date(),
      lastUsedAt: new Date(),
    };

    const resolved = applySavedMapping({
      headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      autoMapping,
      savedMapping,
    });

    expect(resolved.usedSavedMapping).toBe(true);
    expect(resolved.appliedMappings.some((entry) => entry.source === 'saved')).toBe(true);
    expect(resolved.mapping.columnMappings.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Performance — stage timing smoke tests
// ---------------------------------------------------------------------------

describe('Phase 10 — performance smoke tests', () => {
  const PERF_BUDGET_MS = {
    headerDetection: 500,
    reportDetection: 100,
    autoMapping: 500,
    fullPipeline: 5_000,
  };

  it('header detection on 50 columns × 200 rows completes within budget', () => {
    const matrix = buildRows(200, 50);
    const sheet = XLSX.utils.aoa_to_sheet(matrix);
    const matrixData = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: null,
    });

    const started = performance.now();
    const result = detectHeaderRow(matrixData, PRODUCT_IMPORT_COLUMNS);
    const elapsed = performance.now() - started;

    expect(result.headerRowIndex).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThan(PERF_BUDGET_MS.headerDetection);
  });

  it('report detection on 50 headers completes within budget', () => {
    const headers = Array.from({ length: 50 }, (_, index) => `Header ${index + 1}`);
    headers[0] = 'Product Name';
    headers[1] = 'Selling Price';

    const started = performance.now();
    const result = detectReport(headers, { entityType: 'product' });
    const elapsed = performance.now() - started;

    expect(result.profile.id).toBeDefined();
    expect(elapsed).toBeLessThan(PERF_BUDGET_MS.reportDetection);
  });

  it('auto mapping on 50 headers completes within budget', () => {
    const headers = Array.from({ length: 50 }, (_, index) => `Header ${index + 1}`);
    headers[0] = 'Product Name';
    headers[1] = 'Selling Price';

    const started = performance.now();
    const result = buildAutoMapping(headers, PRODUCT_IMPORT_COLUMNS, {
      profile: PRODUCT_IMPORT_REPORT,
    });
    const elapsed = performance.now() - started;

    expect(result.mappedFields.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(PERF_BUDGET_MS.autoMapping);
  });

  it('full product pipeline on 1000 rows completes within budget', () => {
    const bytes = xlsxBytes(buildRows(1000, 5));

    const started = performance.now();
    const prepared = prepareImportFile(bytes, 'product', { fileName: 'large.xlsx' });
    const autoMapping = buildAutoMapping(prepared.parsed.headers, PRODUCT_IMPORT_COLUMNS, {
      profile: prepared.reportDetection.profile,
    });
    const resolved = applySavedMapping({
      headers: prepared.parsed.headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: null,
    });
    runImportFromParsed(prepared.parsed, 'product', resolved.mapping);
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(PERF_BUDGET_MS.fullPipeline);
  });

  it('file with many blank rows skips empties without excessive cost', () => {
    const rows: unknown[][] = [['Product Name', 'Selling Price']];
    for (let index = 0; index < 100; index += 1) {
      rows.push(['', '']);
    }
    rows.push(['Bread', 45]);

    const bytes = xlsxBytes(rows);
    const started = performance.now();
    const prepared = prepareImportFile(bytes, 'product', { fileName: 'blanks.xlsx' });
    const elapsed = performance.now() - started;

    expect(prepared.parsed.skippedEmptyRowCount).toBe(100);
    expect(elapsed).toBeLessThan(PERF_BUDGET_MS.fullPipeline);
  });
});

// ---------------------------------------------------------------------------
// 4. Failure scenarios — diagnostics still produced
// ---------------------------------------------------------------------------

describe('Phase 10 — failure scenarios', () => {
  it('empty file throws and partial diagnostics can be built from header failure', () => {
    const bytes = csvBytes('\n\n');
    const timer = createImportDiagnosticsTimer();

    expect(() =>
      prepareImportFile(bytes, 'product', { fileName: 'empty.csv' }),
    ).toThrow(/header row/i);

    const diagnostics = buildImportDiagnostics({
      entityType: 'product',
      fileName: 'empty.csv',
      startedAt: timer.startedAt,
      completedAt: timer.now(),
      failure: {
        code: 'NO_HEADER_ROW',
        message: 'No header row could be detected.',
        stage: 'header-detection',
      },
    });

    expect(diagnostics.errors.some((entry) => entry.code === 'NO_HEADER_ROW')).toBe(true);
    expect(diagnostics.pipelineStages.find((s) => s.name === 'header-detection')?.status).toBe(
      'failed',
    );
  });

  it('unknown report produces diagnostics with warnings', () => {
    const result = runFullPipeline({ key: 'unknown', ...REPORT_FIXTURES.unknown });

    expect(result.diagnostics.reportType).toBe('unknown');
    expect(result.diagnostics.warnings.length).toBeGreaterThan(0);
  });

  it('missing required fields appear in validation diagnostics', () => {
    const csv = [
      'Date,Item Name,Qty',
      '2026-03-01,Milk Bread,2',
    ].join('\n');
    const prepared = prepareImportFile(csvBytes(csv), 'sale', { fileName: 'partial.csv' });
    const report = runImportFromParsed(prepared.parsed, 'sale', {
      columnMappings: [{ sourceHeader: 'Item Name', targetField: 'productName' }],
    });

    const diagnostics = buildImportDiagnostics({
      entityType: 'sale',
      startedAt: Date.now() - 10,
      completedAt: Date.now(),
      headerDetection: prepared.headerDetection,
      reportDetection: prepared.reportDetection,
      report,
    });

    expect(report.missingRequiredFields).toContain('quantity');
    expect(report.missingRequiredFields).not.toContain('saleDate');
    expect(diagnostics.validationSummary.missingRequiredFields).toContain('quantity');
    expect(diagnostics.validationSummary.missingRequiredFields).not.toContain('saleDate');
    expect(diagnostics.errors.some((entry) => entry.code === 'MISSING_REQUIRED_FIELDS')).toBe(true);
  });

  it('duplicate headers are detected and reported in header stage output', () => {
    const csv = [
      'Product Name,Product Name,Selling Price',
      'Bread,Bread Duplicate,45',
    ].join('\n');
    const prepared = prepareImportFile(csvBytes(csv), 'product', { fileName: 'dup.csv' });

    expect(prepared.headerDetection.scoreBreakdown.duplicateHeaderCount).toBeGreaterThan(0);
    expect(prepared.parsed.headers.filter((header) => header.startsWith('Product Name')).length).toBe(
      2,
    );
  });

  it('ambiguous mappings produce guidance and diagnostics warnings', () => {
    const headers = ['Shared'];
    const columns = [
      {
        field: 'alpha',
        label: 'Alpha',
        dataType: 'string' as const,
        required: false,
        synonyms: ['Shared'],
      },
      {
        field: 'beta',
        label: 'Beta',
        dataType: 'string' as const,
        required: false,
        synonyms: ['Shared'],
      },
    ];
    const autoMapping = buildAutoMapping(headers, columns, { profile: UNKNOWN_REPORT });
    const diagnostics = buildImportDiagnostics({
      entityType: 'product',
      startedAt: Date.now() - 5,
      completedAt: Date.now(),
      autoMapping,
      reportDetection: detectReport(headers, { entityType: 'product' }),
    });

    expect(autoMapping.ambiguousMappings).toHaveLength(1);
    expect(diagnostics.warnings.some((entry) => entry.code === 'AMBIGUOUS_MAPPINGS')).toBe(true);
  });

  it('invalid saved mapping target is marked outdated gracefully', () => {
    const headers = ['Product Name', 'Selling Price'];
    const autoMapping = buildAutoMapping(headers, PRODUCT_IMPORT_COLUMNS, {
      profile: PRODUCT_IMPORT_REPORT,
    });
    const resolved = applySavedMapping({
      headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: {
        organizationId: 'org-1',
        entity: 'product',
        reportType: 'product-import',
        version: SAVED_MAPPING_SCHEMA_VERSION,
        mappings: [{ sourceHeader: 'Product Name', targetField: 'nonexistent_field' }],
        createdAt: new Date(),
        lastUsedAt: new Date(),
      },
    });

    expect(resolved.outdatedMappings.length).toBe(1);
    expect(resolved.mapping.columnMappings.length).toBeGreaterThan(0);
  });

  it('saved mapping version mismatch is flagged in diagnostics', () => {
    const headers = ['Product Name', 'Selling Price'];
    const autoMapping = buildAutoMapping(headers, PRODUCT_IMPORT_COLUMNS, {
      profile: PRODUCT_IMPORT_REPORT,
    });
    const resolved = applySavedMapping({
      headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: {
        organizationId: 'org-1',
        entity: 'product',
        reportType: 'product-import',
        version: 999,
        mappings: [{ sourceHeader: 'Product Name', targetField: 'name' }],
        createdAt: new Date(),
        lastUsedAt: new Date(),
      },
      currentVersion: SAVED_MAPPING_SCHEMA_VERSION,
    });

    const diagnostics = buildImportDiagnostics({
      entityType: 'product',
      startedAt: Date.now() - 5,
      completedAt: Date.now(),
      resolved,
      autoMapping,
    });

    expect(resolved.versionMismatch).toBe(true);
    expect(
      diagnostics.warnings.some((entry) => entry.code === 'SAVED_MAPPING_VERSION_MISMATCH'),
    ).toBe(true);
  });

  it('corrupted xlsx bytes throw parse error before pipeline stages', () => {
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);

    expect(() =>
      prepareImportFile(garbage, 'product', { fileName: 'corrupt.xlsx' }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Phase U1 — Universal Import Foundation
// ---------------------------------------------------------------------------

describe('Phase U1 — Universal Import Foundation', () => {
  it('unknown Excel opens Mapping Review with zero auto-mappings (no pipeline throw)', () => {
    const prepared = prepareImportFile(
      csvBytes('Foo,Bar,Baz\n1,2,3'),
      'sale',
      { fileName: 'custom.csv' },
    );

    expect(prepared.reportDetection.profile.reportType).toBe('unknown');

    const autoMapping = buildAutoMapping(prepared.parsed.headers, SALE_IMPORT_COLUMNS, {
      profile: prepared.reportDetection.profile,
    });
    const resolved = applySavedMapping({
      headers: prepared.parsed.headers,
      columns: SALE_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: null,
    });

    expect(resolved.mapping.columnMappings.length).toBe(0);

    const report = emptyImportRunReport('sale', prepared.parsed, SALE_IMPORT_COLUMNS);
    expect(report.missingRequiredFields).toEqual(['quantity']);

    const bundle = buildMappingReviewBundle({
      headers: prepared.parsed.headers,
      columns: SALE_IMPORT_COLUMNS,
      reportDetection: prepared.reportDetection,
      autoMapping,
      resolved,
    });

    expect(bundle.viewModel.reportDisplayName).toBe(CUSTOM_SPREADSHEET_DISPLAY_NAME);
    expect(bundle.viewModel.rows.every((row) => row.status === 'unmapped')).toBe(true);
  });

  it('Vyapar-style sales detail still auto-maps known columns', () => {
    const fixture = REPORT_FIXTURES['sales-detail'];
    const prepared = prepareImportFile(csvBytes(fixture.csv), 'sale', {
      fileName: 'vyapar-sales.csv',
    });

    expect(prepared.reportDetection.profile).toBe(SALES_DETAIL_REPORT);

    const autoMapping = buildAutoMapping(prepared.parsed.headers, SALE_IMPORT_COLUMNS, {
      profile: prepared.reportDetection.profile,
    });

    expect(autoMapping.mapping.columnMappings.length).toBeGreaterThan(0);
    expect(autoMapping.mappedFields.some((field) => field.targetField === 'saleDate')).toBe(true);
    expect(autoMapping.mappedFields.some((field) => field.targetField === 'quantity')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase U2 — Import Preparation (Sale Date)
// ---------------------------------------------------------------------------

describe('Phase U2 — Import Preparation (Sale Date)', () => {
  it('preserves imported sale dates in review when saleDate is mapped', () => {
    const fixture = REPORT_FIXTURES['sales-detail'];
    const prepared = prepareImportFile(csvBytes(fixture.csv), 'sale', {
      fileName: 'vyapar-sales.csv',
    });
    const autoMapping = buildAutoMapping(prepared.parsed.headers, SALE_IMPORT_COLUMNS, {
      profile: prepared.reportDetection.profile,
    });

    const { viewModel } = buildImportReview({
      fileName: 'vyapar-sales.csv',
      entityType: 'sale',
      parsed: prepared.parsed,
      headerDetection: prepared.headerDetection,
      reportDetection: prepared.reportDetection,
      mapping: autoMapping.mapping,
      productCatalog: [],
      preparation: {},
    });

    expect(
      viewModel.rows.every(
        (row) => normalizedSaleDateToIso(row.normalizedValues['saleDate']) === '2026-03-01',
      ),
    ).toBe(true);
    expect(viewModel.overview.preparationSummary?.bulkSaleDateApplied).toBeUndefined();
  });

  it('applies bulk sale date to every review row when saleDate is not mapped', () => {
    const csv = ['Product Name,Qty', 'Milk Bread,2', 'Veg Puff,1'].join('\n');
    const prepared = prepareImportFile(csvBytes(csv), 'sale', { fileName: 'manual.csv' });
    const mapping = {
      columnMappings: [
        { sourceHeader: 'Product Name', targetField: 'productName' },
        { sourceHeader: 'Qty', targetField: 'quantity' },
      ],
    };

    const { viewModel } = buildImportReview({
      fileName: 'manual.csv',
      entityType: 'sale',
      parsed: prepared.parsed,
      headerDetection: prepared.headerDetection,
      reportDetection: prepared.reportDetection,
      mapping,
      productCatalog: [],
      preparation: { bulkSaleDate: '2026-08-08' },
    });

    expect(viewModel.rows).toHaveLength(2);
    expect(
      viewModel.rows.every(
        (row) => normalizedSaleDateToIso(row.normalizedValues['saleDate']) === '2026-08-08',
      ),
    ).toBe(true);
    expect(viewModel.overview.preparationSummary?.bulkSaleDateApplied).toEqual({
      value: '2026-08-08',
      source: 'user_entered',
      rowCount: 2,
    });
    expect(viewModel.rows[0]?.preparedFieldSources?.saleDate).toBe('user_entered');
  });

  it('review and re-parse commit preparation produce identical sale dates', () => {
    const csv = ['Product Name,Qty', 'Milk Bread,2'].join('\n');
    const prepared = prepareImportFile(csvBytes(csv), 'sale', { fileName: 'manual.csv' });
    const mapping = {
      columnMappings: [
        { sourceHeader: 'Product Name', targetField: 'productName' },
        { sourceHeader: 'Qty', targetField: 'quantity' },
      ],
    };
    const preparation = { bulkSaleDate: '2026-08-08' };
    const input = {
      fileName: 'manual.csv',
      entityType: 'sale' as const,
      parsed: prepared.parsed,
      headerDetection: prepared.headerDetection,
      reportDetection: prepared.reportDetection,
      mapping,
      productCatalog: [],
      preparation,
    };

    const review = buildImportReview(input);
    const commitReview = buildImportReview(input);

    expect(review.viewModel.rows.map((row) => normalizedSaleDateToIso(row.normalizedValues['saleDate']))).toEqual(
      commitReview.viewModel.rows.map((row) => normalizedSaleDateToIso(row.normalizedValues['saleDate'])),
    );
  });
});

// ---------------------------------------------------------------------------
// Phase U3.1 — Money Semantics (Rate vs Amount)
// ---------------------------------------------------------------------------

describe('Phase U3.1 — Money Semantics', () => {
  it('Net Amount regression: Qty=100, Net Amount=4500 → unit price 45, line total 4500', () => {
    const csv = ['Product Name,Qty,Net Amount', 'Bread,100,4500'].join('\n');
    const prepared = prepareImportFile(csvBytes(csv), 'sale', { fileName: 'net-amount.csv' });
    const mapping = {
      columnMappings: [
        { sourceHeader: 'Product Name', targetField: 'productName' },
        { sourceHeader: 'Qty', targetField: 'quantity' },
        { sourceHeader: 'Net Amount', targetField: 'amount' },
      ],
    };

    const { viewModel } = buildImportReview({
      fileName: 'net-amount.csv',
      entityType: 'sale',
      parsed: prepared.parsed,
      headerDetection: prepared.headerDetection,
      reportDetection: prepared.reportDetection,
      mapping,
      productCatalog: [{ id: 'prod-bread', name: 'Bread', code: 'BRD', isActive: true }],
      preparation: { bulkSaleDate: '2026-08-08' },
    });

    const reviewRow = viewModel.rows[0];

    expect(reviewRow?.normalizedValues['amount']).toBe(4500);
    expect(reviewRow?.normalizedValues['sellingPrice']).toBe(45);
    expect(reviewRow?.preparedFieldSources?.amount).toBe('imported');
    expect(reviewRow?.preparedFieldSources?.sellingPrice).toBe('derived');
  });

  it('blocks inconsistent Rate and Amount in review', () => {
    const csv = ['Product Name,Qty,Rate,Amount', 'Bread,100,45,5000'].join('\n');
    const prepared = prepareImportFile(csvBytes(csv), 'sale', { fileName: 'mismatch.csv' });
    const mapping = {
      columnMappings: [
        { sourceHeader: 'Product Name', targetField: 'productName' },
        { sourceHeader: 'Qty', targetField: 'quantity' },
        { sourceHeader: 'Rate', targetField: 'sellingPrice' },
        { sourceHeader: 'Amount', targetField: 'amount' },
      ],
    };

    const { viewModel } = buildImportReview({
      fileName: 'mismatch.csv',
      entityType: 'sale',
      parsed: prepared.parsed,
      headerDetection: prepared.headerDetection,
      reportDetection: prepared.reportDetection,
      mapping,
      productCatalog: [],
      preparation: { bulkSaleDate: '2026-08-08' },
    });

    expect(viewModel.rows[0]?.conflictEngineResult.status).toBe('ERROR');
    expect(viewModel.rows[0]?.conflictEngineResult.blockingReason).toContain('≠');
  });

  it('review and commit re-parse produce identical money values', () => {
    const csv = ['Product Name,Qty,Net Amount', 'Bread,100,4500'].join('\n');
    const prepared = prepareImportFile(csvBytes(csv), 'sale', { fileName: 'net-amount.csv' });
    const mapping = {
      columnMappings: [
        { sourceHeader: 'Product Name', targetField: 'productName' },
        { sourceHeader: 'Qty', targetField: 'quantity' },
        { sourceHeader: 'Net Amount', targetField: 'amount' },
      ],
    };
    const preparation = { bulkSaleDate: '2026-08-08' };
    const input = {
      fileName: 'net-amount.csv',
      entityType: 'sale' as const,
      parsed: prepared.parsed,
      headerDetection: prepared.headerDetection,
      reportDetection: prepared.reportDetection,
      mapping,
      productCatalog: [],
      preparation,
    };

    const review = buildImportReview(input);
    const commitReview = buildImportReview(input);

    expect(review.viewModel.rows[0]?.normalizedValues['sellingPrice']).toBe(45);
    expect(review.viewModel.rows[0]?.normalizedValues['amount']).toBe(4500);
    expect(commitReview.viewModel.rows[0]?.normalizedValues['sellingPrice']).toBe(45);
    expect(commitReview.viewModel.rows[0]?.normalizedValues['amount']).toBe(4500);
  });

  it('maps ambiguous Price header to Mapping Review ambiguity', () => {
    const headers = ['Product Name', 'Qty', 'Price'];
    const autoMapping = buildAutoMapping(headers, SALE_IMPORT_COLUMNS, {
      profile: SALES_DETAIL_REPORT,
    });

    expect(autoMapping.ambiguousMappings.some((entry) => entry.sourceHeader === 'Price')).toBe(true);
    expect(
      autoMapping.ambiguousMappings
        .find((entry) => entry.sourceHeader === 'Price')
        ?.candidates.map((candidate) => candidate.targetField)
        .sort(),
    ).toEqual(['amount', 'sellingPrice']);
  });

  it('auto-maps Net Amount to amount and Rate to sellingPrice', () => {
    const headers = ['Product Name', 'Qty', 'Rate', 'Net Amount'];
    const autoMapping = buildAutoMapping(headers, SALE_IMPORT_COLUMNS, {
      profile: SALES_DETAIL_REPORT,
    });
    const byHeader = Object.fromEntries(
      autoMapping.mapping.columnMappings.map((entry) => [entry.sourceHeader, entry.targetField]),
    );

    expect(byHeader['Rate']).toBe('sellingPrice');
    expect(byHeader['Net Amount']).toBe('amount');
  });
});

// ---------------------------------------------------------------------------
// Phase U3.2 — Customer Preparation
// ---------------------------------------------------------------------------

describe('Phase U3.2 — Customer Preparation', () => {
  it('preserves imported customer in review', () => {
    const csv = ['Product Name,Qty,Customer', 'Bread,1,Kabeer Bakery'].join('\n');
    const prepared = prepareImportFile(csvBytes(csv), 'sale', { fileName: 'customer.csv' });
    const mapping = {
      columnMappings: [
        { sourceHeader: 'Product Name', targetField: 'productName' },
        { sourceHeader: 'Qty', targetField: 'quantity' },
        { sourceHeader: 'Customer', targetField: 'customerName' },
      ],
    };

    const { viewModel } = buildImportReview({
      fileName: 'customer.csv',
      entityType: 'sale',
      parsed: prepared.parsed,
      headerDetection: prepared.headerDetection,
      reportDetection: prepared.reportDetection,
      mapping,
      productCatalog: [{ id: 'prod-bread', name: 'Bread', code: 'BRD', isActive: true }],
      preparation: { bulkSaleDate: '2026-08-08' },
    });

    expect(viewModel.rows[0]?.normalizedValues['customerName']).toBe('Kabeer Bakery');
    expect(viewModel.rows[0]?.preparedFieldSources?.customerName).toBe('imported');
  });

  it('shows Walk-in when customer is missing and does not block the row for customer', () => {
    const csv = ['Product Name,Qty', 'Bread,1'].join('\n');
    const prepared = prepareImportFile(csvBytes(csv), 'sale', { fileName: 'walk-in.csv' });
    const mapping = {
      columnMappings: [
        { sourceHeader: 'Product Name', targetField: 'productName' },
        { sourceHeader: 'Qty', targetField: 'quantity' },
      ],
    };

    const { viewModel } = buildImportReview({
      fileName: 'walk-in.csv',
      entityType: 'sale',
      parsed: prepared.parsed,
      headerDetection: prepared.headerDetection,
      reportDetection: prepared.reportDetection,
      mapping,
      productCatalog: [{ id: 'prod-bread', name: 'Bread', code: 'BRD', isActive: true }],
      preparation: { bulkSaleDate: '2026-08-08' },
    });

    expect(viewModel.rows[0]?.normalizedValues['customerName']).toBeNull();
    expect(viewModel.rows[0]?.preparedFieldSources?.customerName).toBe('defaulted');
    expect(
      viewModel.rows[0]?.conflictEngineResult.blockingReason?.includes('customer'),
    ).not.toBe(true);
  });

  it('review and commit re-parse produce identical customer values', () => {
    const csv = ['Product Name,Qty,Customer', 'Bread,1,Kabeer Bakery'].join('\n');
    const prepared = prepareImportFile(csvBytes(csv), 'sale', { fileName: 'customer.csv' });
    const mapping = {
      columnMappings: [
        { sourceHeader: 'Product Name', targetField: 'productName' },
        { sourceHeader: 'Qty', targetField: 'quantity' },
        { sourceHeader: 'Customer', targetField: 'customerName' },
      ],
    };
    const preparation = { bulkSaleDate: '2026-08-08' };
    const input = {
      fileName: 'customer.csv',
      entityType: 'sale' as const,
      parsed: prepared.parsed,
      headerDetection: prepared.headerDetection,
      reportDetection: prepared.reportDetection,
      mapping,
      productCatalog: [{ id: 'prod-bread', name: 'Bread', code: 'BRD', isActive: true }],
      preparation,
    };

    const review = buildImportReview(input);
    const commitReview = buildImportReview(input);

    expect(review.viewModel.rows[0]?.normalizedValues['customerName']).toBe('Kabeer Bakery');
    expect(commitReview.viewModel.rows[0]?.normalizedValues['customerName']).toBe('Kabeer Bakery');
    expect(review.viewModel.rows[0]?.preparedFieldSources?.customerName).toBe('imported');
    expect(commitReview.viewModel.rows[0]?.preparedFieldSources?.customerName).toBe('imported');
  });
});

// ---------------------------------------------------------------------------
// Phase U3.3 — Invoice Number Preparation
// ---------------------------------------------------------------------------

describe('Phase U3.3 — Invoice Number Preparation', () => {
  it('preserves imported invoice in review', () => {
    const csv = ['Invoice No,Product Name,Qty,Date', 'INV-1234,Bread,1,2026-08-08'].join('\n');
    const prepared = prepareImportFile(csvBytes(csv), 'sale', { fileName: 'invoice.csv' });
    const mapping = {
      columnMappings: [
        { sourceHeader: 'Invoice No', targetField: 'saleNumber' },
        { sourceHeader: 'Product Name', targetField: 'productName' },
        { sourceHeader: 'Qty', targetField: 'quantity' },
        { sourceHeader: 'Date', targetField: 'saleDate' },
      ],
    };

    const { viewModel } = buildImportReview({
      fileName: 'invoice.csv',
      entityType: 'sale',
      parsed: prepared.parsed,
      headerDetection: prepared.headerDetection,
      reportDetection: prepared.reportDetection,
      mapping,
      productCatalog: [{ id: 'prod-bread', name: 'Bread', code: 'BRD', isActive: true }],
      preparation: {},
    });

    expect(viewModel.rows[0]?.normalizedValues['saleNumber']).toBe('INV-1234');
    expect(viewModel.rows[0]?.preparedFieldSources?.saleNumber).toBe('imported');
    expect(
      viewModel.rows[0]?.conflictEngineResult.warnings.some(
        (entry) => entry.code === 'MISSING_INVOICE_NUMBER',
      ),
    ).toBe(false);
  });

  it('shows Not provided and warning when invoice is missing without blocking', () => {
    const csv = ['Product Name,Qty,Date', 'Bread,1,2026-08-08'].join('\n');
    const prepared = prepareImportFile(csvBytes(csv), 'sale', { fileName: 'no-invoice.csv' });
    const mapping = {
      columnMappings: [
        { sourceHeader: 'Product Name', targetField: 'productName' },
        { sourceHeader: 'Qty', targetField: 'quantity' },
        { sourceHeader: 'Date', targetField: 'saleDate' },
      ],
    };

    const { viewModel } = buildImportReview({
      fileName: 'no-invoice.csv',
      entityType: 'sale',
      parsed: prepared.parsed,
      headerDetection: prepared.headerDetection,
      reportDetection: prepared.reportDetection,
      mapping,
      productCatalog: [{ id: 'prod-bread', name: 'Bread', code: 'BRD', isActive: true }],
      preparation: {},
    });

    expect(viewModel.rows[0]?.normalizedValues['saleNumber']).toBeNull();
    expect(viewModel.rows[0]?.preparedFieldSources?.saleNumber).toBe('defaulted');
    expect(
      viewModel.rows[0]?.conflictEngineResult.warnings.some(
        (entry) => entry.code === 'MISSING_INVOICE_NUMBER',
      ),
    ).toBe(true);
    expect(viewModel.rows[0]?.conflictEngineResult.status).not.toBe('ERROR');
  });

  it('review and commit re-parse produce identical invoice values', () => {
    const csv = ['Invoice No,Product Name,Qty,Date', 'INV-5678,Bread,1,2026-08-08'].join('\n');
    const prepared = prepareImportFile(csvBytes(csv), 'sale', { fileName: 'invoice.csv' });
    const mapping = {
      columnMappings: [
        { sourceHeader: 'Invoice No', targetField: 'saleNumber' },
        { sourceHeader: 'Product Name', targetField: 'productName' },
        { sourceHeader: 'Qty', targetField: 'quantity' },
        { sourceHeader: 'Date', targetField: 'saleDate' },
      ],
    };

    const review = buildImportReview({
      fileName: 'invoice.csv',
      entityType: 'sale',
      parsed: prepared.parsed,
      headerDetection: prepared.headerDetection,
      reportDetection: prepared.reportDetection,
      mapping,
      productCatalog: [{ id: 'prod-bread', name: 'Bread', code: 'BRD', isActive: true }],
      preparation: {},
    });

    const commitReview = buildImportReview({
      fileName: 'invoice.csv',
      entityType: 'sale',
      parsed: prepared.parsed,
      headerDetection: prepared.headerDetection,
      reportDetection: prepared.reportDetection,
      mapping,
      productCatalog: [{ id: 'prod-bread', name: 'Bread', code: 'BRD', isActive: true }],
      preparation: {},
    });

    expect(review.viewModel.rows[0]?.normalizedValues['saleNumber']).toBe('INV-5678');
    expect(commitReview.viewModel.rows[0]?.normalizedValues['saleNumber']).toBe('INV-5678');
    expect(review.viewModel.rows[0]?.preparedFieldSources?.saleNumber).toBe('imported');
    expect(commitReview.viewModel.rows[0]?.preparedFieldSources?.saleNumber).toBe('imported');
  });
});

// ---------------------------------------------------------------------------
// Phase R — Real-world Item Report By Party audit fixture
// ---------------------------------------------------------------------------

describe('Phase R — Arabian Sweets Item Report By Party', () => {
  function buildRealWorldItemReportRows(): unknown[][] {
    return [
      ['Company Name: 7Days Bakery & Arabian Sweets', null, null, null, null, null, null],
      ['Phone No: 7373229777', null, null, null, null, null, null],
      [null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null],
      ['Item Report By Party', null, null, null, null, null, null],
      ['Dated: 05/08/2026 - 05/08/2026', null, null, null, null, null, null],
      ['Party Name: All Parties', null, null, null, null, null, null],
      [null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null],
      ['Party Name', 'Item Name', 'Item Code', 'Sales Qty.', 'Sales Amt.', 'Purchase Qty.', 'Purchase Amt.'],
      ['Kabeer Burgar Village ', 'Arabic Kuboos Pac', '223561583920', '4.0 PAC', '160', '0.0 PAC', '0'],
      ['Kabeer Burgar Village ', 'Burgar  Bun', '935532178976', '32.0 PCS', '384', '0.0 PCS', '0'],
      ['Ashraf Filipino Cafe', 'White Sandwich Bread', '569436131123', '10.0 PKT', '1000', '0.0 PKT', '0'],
      ['Safeer Bai', 'Large Milk Bread', '389681957388', '58.0 PAC', '4060', '0.0 PAC', '0'],
    ];
  }

  const catalog = [
    { id: 'p1', name: 'Arabic Kuboos Pac', code: 'AKP-001', isActive: true },
    { id: 'p2', name: 'Burgar Bun', code: 'BB-001', isActive: true },
    { id: 'p3', name: 'White Sandwich Bread', code: 'WSB-001', isActive: true },
    { id: 'p6', name: 'Large Milk Bread', code: 'LMB-001', isActive: true },
  ];

  it('detects header row 9 and auto-maps Sales Qty. and Sales Amt.', () => {
    const bytes = xlsxBytes(buildRealWorldItemReportRows(), '7days_bakery_arabian_sweets_ite');
    const prepared = prepareImportFile(bytes, 'sale', {
      fileName: '7days_bakery_arabian_sweets_item_report_by_party.xlsx',
    });

    expect(prepared.headerDetection.headerRowIndex).toBe(9);
    expect(prepared.reportDetection.reportType).toBe('unknown');

    const autoMapping = buildAutoMapping(prepared.parsed.headers, SALE_IMPORT_COLUMNS, {
      profile: prepared.reportDetection.profile,
    });

    expect(autoMapping.mapping.columnMappings).toEqual(
      expect.arrayContaining([
        { sourceHeader: 'Sales Qty.', targetField: 'quantity' },
        { sourceHeader: 'Sales Amt.', targetField: 'amount' },
        { sourceHeader: 'Party Name', targetField: 'customerName' },
        { sourceHeader: 'Item Name', targetField: 'productName' },
      ]),
    );
  });

  it('parses quantity suffixes and derives unit price from line totals', () => {
    const bytes = xlsxBytes(buildRealWorldItemReportRows(), '7days_bakery_arabian_sweets_ite');
    const prepared = prepareImportFile(bytes, 'sale', {
      fileName: '7days_bakery_arabian_sweets_item_report_by_party.xlsx',
    });
    const autoMapping = buildAutoMapping(prepared.parsed.headers, SALE_IMPORT_COLUMNS, {
      profile: prepared.reportDetection.profile,
    });

    const { viewModel } = buildImportReview({
      fileName: '7days_bakery_arabian_sweets_item_report_by_party.xlsx',
      entityType: 'sale',
      parsed: prepared.parsed,
      headerDetection: prepared.headerDetection,
      reportDetection: prepared.reportDetection,
      mapping: autoMapping.mapping,
      productCatalog: catalog,
      preparation: { bulkSaleDate: '2026-08-05' },
    });

    const kuboos = viewModel.rows.find((row) => row.rowNumber === 11);
    const largeBread = viewModel.rows.find((row) => row.rowNumber === 14);

    expect(kuboos?.normalizedValues['quantity']).toBe(4);
    expect(kuboos?.normalizedValues['amount']).toBe(160);
    expect(kuboos?.normalizedValues['sellingPrice']).toBe(40);
    expect(kuboos?.preparedFieldSources?.sellingPrice).toBe('derived');
    expect(
      kuboos?.conflictEngineResult.conflicts.some((entry) => entry.code === 'MISSING_QUANTITY'),
    ).toBe(false);

    expect(largeBread?.normalizedValues['quantity']).toBe(58);
    expect(largeBread?.normalizedValues['amount']).toBe(4060);
    expect(largeBread?.normalizedValues['sellingPrice']).toBe(70);
    expect(largeBread?.normalizedValues['sellingPrice']).not.toBe(4060);
  });
});

// ---------------------------------------------------------------------------
// Quantity normalization — unit suffix in quantity cells
// ---------------------------------------------------------------------------

describe('Quantity normalization with unit suffix', () => {
  it('parses "58.0 PAC" in review and avoids MISSING_QUANTITY', () => {
    const csv = ['Product Name,Qty', 'Bread,58.0 PAC'].join('\n');
    const prepared = prepareImportFile(csvBytes(csv), 'sale', { fileName: 'qty-unit.csv' });
    const mapping = {
      columnMappings: [
        { sourceHeader: 'Product Name', targetField: 'productName' },
        { sourceHeader: 'Qty', targetField: 'quantity' },
      ],
    };

    const { viewModel } = buildImportReview({
      fileName: 'qty-unit.csv',
      entityType: 'sale',
      parsed: prepared.parsed,
      headerDetection: prepared.headerDetection,
      reportDetection: prepared.reportDetection,
      mapping,
      productCatalog: [{ id: 'prod-bread', name: 'Bread', code: 'BRD', isActive: true }],
      preparation: { bulkSaleDate: '2026-08-08' },
    });

    const reviewRow = viewModel.rows[0];

    expect(reviewRow?.originalValues['quantity']).toBe('58.0 PAC');
    expect(reviewRow?.normalizedValues['quantity']).toBe(58);
    expect(
      reviewRow?.conflictEngineResult.conflicts.some((entry) => entry.code === 'MISSING_QUANTITY'),
    ).toBe(false);
  });
});
