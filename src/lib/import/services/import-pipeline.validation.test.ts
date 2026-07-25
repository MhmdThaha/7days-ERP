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
  prepareImportFile,
  runImport,
  runImportFromParsed,
  type ImportRunReport,
} from '@/lib/import/services/import.service';
import { buildMappingReviewBundle } from '@/lib/import/services/mapping-review.service';
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
        fixture.expectedProfile.displayName,
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

    expect(report.missingRequiredFields).toContain('saleDate');
    expect(report.missingRequiredFields).toContain('quantity');
    expect(diagnostics.validationSummary.missingRequiredFields).toContain('saleDate');
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
