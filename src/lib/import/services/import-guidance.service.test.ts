/**
 * Import Guidance service tests.
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
import {
  applySaveMappingToggleGuidance,
  buildImportGuidance,
} from '@/lib/import/services/import-guidance.service';
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
    matchedHeaders: [],
    missingHeaders: [],
    unmatchedHeaders: [],
    explanation: [],
    candidates: [],
    ...overrides,
  };
}

function headerDetection(
  overrides: Partial<HeaderDetectionResult> = {},
): HeaderDetectionResult {
  return {
    headerRowIndex: 0,
    detectedHeaders: ['Invoice No', 'Invoice Date', 'Amount'],
    confidence: 0.9,
    scoreBreakdown: {
      aliasMatches: 3,
      requiredFieldMatches: 2,
      headerDensity: 1,
      duplicateHeaderCount: 0,
      emptyCellCount: 0,
      totalScore: 50,
    },
    reasoning: [],
    ...overrides,
  };
}

function emptyReport(overrides: Partial<ImportRunReport> = {}): ImportRunReport {
  return {
    entityType: 'sale',
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
    ...overrides,
  };
}

describe('buildImportGuidance', () => {
  it('1. Sales Summary explains inventory is not updated', () => {
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

    const guidance = buildImportGuidance({
      columns: SALE_IMPORT_COLUMNS,
      headerDetection: headerDetection({ detectedHeaders: headers }),
      reportDetection: reportDetection(SALES_SUMMARY_REPORT, 0.85, {
        matchedHeaders: ['Invoice No', 'Invoice Date', 'Amount'],
      }),
      autoMapping,
      resolved,
      report: emptyReport({ entityType: 'sale' }),
    });

    const inventory = guidance.items.find((item) => item.code === 'INVENTORY_WILL_NOT_UPDATE');
    expect(inventory).toBeDefined();
    expect(inventory?.message).toMatch(/inventory will not change/i);
    expect(inventory?.message).toMatch(/does not contain line-item quantities/i);

    const report = guidance.items.find((item) => item.code === 'REPORT_DETECTED');
    expect(report?.message).toBe('This file was detected as a Sales Summary.');
  });

  it('2. Sales Detail explains inventory will be updated', () => {
    const headers = ['Invoice No', 'Date', 'Item Name', 'Qty', 'Rate'];
    const autoMapping = buildAutoMapping(headers, SALE_IMPORT_COLUMNS, {
      profile: SALES_DETAIL_REPORT,
    });
    const resolved = applySavedMapping({
      headers,
      columns: SALE_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: null,
    });

    const guidance = buildImportGuidance({
      columns: SALE_IMPORT_COLUMNS,
      headerDetection: headerDetection({ detectedHeaders: headers }),
      reportDetection: reportDetection(SALES_DETAIL_REPORT, 0.88),
      autoMapping,
      resolved,
      report: emptyReport({ entityType: 'sale' }),
    });

    const inventory = guidance.items.find((item) => item.code === 'INVENTORY_WILL_UPDATE');
    expect(inventory).toBeDefined();
    expect(inventory?.message).toMatch(/inventory will be adjusted/i);
    expect(inventory?.recommendation).toMatch(/product names or codes/i);
  });

  it('3. Unknown report explains why detection confidence is low', () => {
    const headers = ['Col A', 'Col B'];
    const autoMapping = buildAutoMapping(headers, PRODUCT_IMPORT_COLUMNS, {
      profile: UNKNOWN_REPORT,
    });
    const resolved = applySavedMapping({
      headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: null,
    });

    const guidance = buildImportGuidance({
      columns: PRODUCT_IMPORT_COLUMNS,
      headerDetection: headerDetection({ detectedHeaders: headers, confidence: 0.2 }),
      reportDetection: reportDetection(UNKNOWN_REPORT, 0.2, {
        missingHeaders: ['Product Name', 'Selling Price'],
        unmatchedHeaders: headers,
        candidates: [
          {
            definitionId: 'product-import',
            displayName: 'Product Import',
            confidence: 0.35,
            coverage: {
              matchedRequiredKeys: [],
              missingRequiredKeys: ['name', 'sellingPrice'],
              matchedOptionalKeys: [],
              unmatchedFileHeaders: headers,
              matchedFileHeaders: [],
              matchedColumns: [],
              missingColumns: [],
              requiredTotal: 2,
              optionalTotal: 4,
              fileHeaderTotal: 2,
            },
          },
        ],
      }),
      autoMapping,
      resolved,
      report: emptyReport({ entityType: 'product' }),
    });

    const unknown = guidance.items.find((item) => item.code === 'UNKNOWN_REPORT');
    expect(unknown).toBeDefined();
    expect(unknown?.severity).toBe('info');
    expect(unknown?.title).toBe('Custom spreadsheet');
    expect(unknown?.message).toMatch(/does not match a known export format/i);
    expect(unknown?.recommendation).toMatch(/required field/i);
  });

  it('4. Ambiguous mappings produce actionable guidance', () => {
    const headers = ['Shared'];
    const columns = [
      {
        field: 'alpha',
        label: 'Alpha Field',
        dataType: 'string' as const,
        required: false,
        synonyms: ['Shared'],
      },
      {
        field: 'beta',
        label: 'Beta Field',
        dataType: 'string' as const,
        required: false,
        synonyms: ['Shared'],
      },
    ];
    const autoMapping = buildAutoMapping(headers, columns, { profile: UNKNOWN_REPORT });
    const resolved = applySavedMapping({
      headers,
      columns,
      autoMapping,
      savedMapping: null,
    });

    const guidance = buildImportGuidance({
      columns,
      headerDetection: headerDetection({ detectedHeaders: headers }),
      reportDetection: reportDetection(UNKNOWN_REPORT, 0.2),
      autoMapping,
      resolved,
      report: emptyReport({ entityType: 'product' }),
    });

    const ambiguous = guidance.items.filter((item) => item.code === 'AMBIGUOUS_MAPPING');
    expect(ambiguous).toHaveLength(1);
    expect(ambiguous[0]?.message).toMatch(/Two columns could map to/i);
    expect(ambiguous[0]?.recommendation).toMatch(/Choose the correct field/i);
    expect(ambiguous[0]?.relatedFields).toContain('Shared');
  });

  it('5. Saved Mapping usage is explained', () => {
    const headers = ['Product Name', 'Product Code', 'Selling Price'];
    const autoMapping = buildAutoMapping(headers, PRODUCT_IMPORT_COLUMNS, {
      profile: PRODUCT_IMPORT_REPORT,
    });
    const savedMapping: SavedMappingDocument = {
      organizationId: 'org-1',
      entity: 'product',
      reportType: 'product-import',
      version: 1,
      mappings: [
        { sourceHeader: 'Product Name', targetField: 'name' },
        { sourceHeader: 'Product Code', targetField: 'code' },
      ],
      createdAt: new Date(),
      lastUsedAt: new Date(),
    };
    const resolved = applySavedMapping({
      headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      autoMapping,
      savedMapping,
    });

    const guidance = buildImportGuidance({
      columns: PRODUCT_IMPORT_COLUMNS,
      headerDetection: headerDetection({ detectedHeaders: headers }),
      reportDetection: reportDetection(PRODUCT_IMPORT_REPORT, 0.9),
      autoMapping,
      resolved,
      report: emptyReport({ entityType: 'product' }),
    });

    const saved = guidance.items.find((item) => item.code === 'SAVED_MAPPING_APPLIED');
    expect(saved).toBeDefined();
    expect(saved?.message).toMatch(/previously saved column mapping was applied/i);
    expect(saved?.relatedFields).toEqual(
      expect.arrayContaining(['Product Name', 'Product Code']),
    );
  });

  it('6. Missing required fields generate recommendations', () => {
    const headers = ['Product Name'];
    const autoMapping = buildAutoMapping(headers, PRODUCT_IMPORT_COLUMNS, {
      profile: PRODUCT_IMPORT_REPORT,
    });
    const resolved = applySavedMapping({
      headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: null,
    });

    const guidance = buildImportGuidance({
      columns: PRODUCT_IMPORT_COLUMNS,
      headerDetection: headerDetection({ detectedHeaders: headers }),
      reportDetection: reportDetection(PRODUCT_IMPORT_REPORT, 0.7),
      autoMapping,
      resolved,
      report: emptyReport({
        entityType: 'product',
        missingRequiredFields: ['sellingPrice'],
      }),
    });

    const missing = guidance.items.find((item) => item.code === 'MISSING_REQUIRED_FIELDS');
    expect(missing).toBeDefined();
    expect(missing?.severity).toBe('error');
    expect(missing?.message).toMatch(/Selling Price/i);
    expect(missing?.recommendation).toMatch(/Map a source column to each required field/i);
    expect(missing?.relatedFields).toEqual(['sellingPrice']);
  });

  it('explains ignored headers for Sales Summary profile', () => {
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

    const guidance = buildImportGuidance({
      columns: SALE_IMPORT_COLUMNS,
      headerDetection: headerDetection({ detectedHeaders: headers }),
      reportDetection: reportDetection(SALES_SUMMARY_REPORT, 0.85),
      autoMapping,
      resolved,
      report: emptyReport({ entityType: 'sale' }),
    });

    const ignored = guidance.items.find((item) => item.code === 'IGNORED_HEADERS');
    expect(ignored).toBeDefined();
    expect(ignored?.relatedFields).toEqual(expect.arrayContaining(['Description', 'Qty']));
  });

  it('applySaveMappingToggleGuidance adds pending save message when enabled', () => {
    const base = buildImportGuidance({
      columns: PRODUCT_IMPORT_COLUMNS,
      headerDetection: headerDetection(),
      reportDetection: reportDetection(PRODUCT_IMPORT_REPORT, 0.9),
      autoMapping: buildAutoMapping(['Product Name', 'Selling Price'], PRODUCT_IMPORT_COLUMNS, {
        profile: PRODUCT_IMPORT_REPORT,
      }),
      resolved: applySavedMapping({
        headers: ['Product Name', 'Selling Price'],
        columns: PRODUCT_IMPORT_COLUMNS,
        autoMapping: buildAutoMapping(['Product Name', 'Selling Price'], PRODUCT_IMPORT_COLUMNS, {
          profile: PRODUCT_IMPORT_REPORT,
        }),
        savedMapping: null,
      }),
      report: emptyReport({ entityType: 'product' }),
    });

    const withToggle = applySaveMappingToggleGuidance(base, true, 'product-import');
    const pending = withToggle.items.find((item) => item.code === 'SAVE_MAPPING_PENDING');

    expect(pending).toBeDefined();
    expect(pending?.message).toBe('This mapping will be remembered for future imports.');
  });
});
