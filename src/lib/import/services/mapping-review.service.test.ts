/**
 * Mapping Review service tests.
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
import { buildAutoMapping } from '@/lib/import/services/auto-mapping';
import {
  buildMappingReviewBundle,
  changeMappedTargetField,
  createEditStateFromRows,
  ignoreSourceHeader,
  resetAllMappingReview,
  resolveAmbiguousMapping,
  restoreAutoSuggestion,
} from '@/lib/import/services/mapping-review.service';
import { applySavedMapping } from '@/lib/import/services/saved-mapping.service';
import type { ReportDetectionResult } from '@/lib/import/reports/types';

function reportResult(
  profile: ReportDetectionResult['profile'],
  confidence: number,
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
  };
}

describe('buildMappingReviewBundle', () => {
  it('1. renders existing product mappings correctly', () => {
    const headers = ['Product Name', 'Product Code', 'Selling Price', 'Unit'];
    const autoMapping = buildAutoMapping(headers, PRODUCT_IMPORT_COLUMNS, {
      profile: PRODUCT_IMPORT_REPORT,
    });
    const resolved = applySavedMapping({
      headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: null,
    });

    const bundle = buildMappingReviewBundle({
      headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      reportDetection: reportResult(PRODUCT_IMPORT_REPORT, 0.82),
      autoMapping,
      resolved,
    });

    expect(bundle.viewModel.reportDisplayName).toBe('Product Import');
    expect(bundle.viewModel.mappedHeaders).toEqual(
      expect.arrayContaining(['Product Name', 'Product Code', 'Selling Price', 'Unit']),
    );
    expect(bundle.viewModel.unmappedHeaders).toEqual([]);
    expect(bundle.baseline.entries['Product Name']).toEqual({
      kind: 'mapped',
      targetField: 'name',
      origin: 'auto',
    });
  });

  it('2. sales summary shows ignored product-related headers from auto mapping hints', () => {
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

    const bundle = buildMappingReviewBundle({
      headers,
      columns: SALE_IMPORT_COLUMNS,
      reportDetection: reportResult(SALES_SUMMARY_REPORT, 0.8),
      autoMapping,
      resolved,
    });

    expect(bundle.viewModel.reportDisplayName).toBe('Sales Summary');
    expect(bundle.viewModel.ignoredHeaders).toEqual(expect.arrayContaining(['Description', 'Qty']));
    expect(
      bundle.viewModel.rows.some(
        (row) => row.sourceHeader === 'Amount' && row.targetField === 'amount',
      ),
    ).toBe(true);
  });

  it('3. sales detail maps quantity, rate, and invoice number', () => {
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

    const bundle = buildMappingReviewBundle({
      headers,
      columns: SALE_IMPORT_COLUMNS,
      reportDetection: reportResult(SALES_DETAIL_REPORT, 0.88),
      autoMapping,
      resolved,
    });

    const byHeader = Object.fromEntries(
      bundle.viewModel.rows.map((row) => [row.sourceHeader, row.targetField]),
    );

    expect(byHeader['Invoice No']).toBe('saleNumber');
    expect(byHeader['Date']).toBe('saleDate');
    expect(byHeader['Item Name']).toBe('productName');
    expect(byHeader['Qty']).toBe('quantity');
    expect(byHeader['Rate']).toBe('sellingPrice');
  });

  it('4. unknown report has low mapping confidence cap via canSaveMapping false', () => {
    const headers = ['Product Name', 'Selling Price'];
    const autoMapping = buildAutoMapping(headers, PRODUCT_IMPORT_COLUMNS, {
      profile: UNKNOWN_REPORT,
    });
    const resolved = applySavedMapping({
      headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: null,
    });

    const bundle = buildMappingReviewBundle({
      headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      reportDetection: reportResult(UNKNOWN_REPORT, 0.2),
      autoMapping,
      resolved,
    });

    expect(bundle.viewModel.canSaveMapping).toBe(false);
    expect(bundle.viewModel.reportDisplayName).toBe('Custom Spreadsheet');
  });
});

describe('mapping review edits', () => {
  it('5. user edits update the mapping model', () => {
    const headers = ['Product Name', 'Product Code', 'Selling Price'];
    const autoMapping = buildAutoMapping(headers, PRODUCT_IMPORT_COLUMNS, {
      profile: PRODUCT_IMPORT_REPORT,
    });
    const resolved = applySavedMapping({
      headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: null,
    });
    const bundle = buildMappingReviewBundle({
      headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      reportDetection: reportResult(PRODUCT_IMPORT_REPORT, 0.8),
      autoMapping,
      resolved,
    });
    const state = createEditStateFromRows(bundle.viewModel.rows);

    const edited = changeMappedTargetField(
      state,
      bundle,
      PRODUCT_IMPORT_COLUMNS,
      'Product Code',
      'unit',
    );

    expect(edited.mapping.columnMappings).toEqual(
      expect.arrayContaining([{ sourceHeader: 'Product Code', targetField: 'unit' }]),
    );
    expect(edited.viewModel.rows.find((row) => row.sourceHeader === 'Product Code')?.targetField).toBe(
      'unit',
    );
  });

  it('6. ambiguous mappings can be resolved', () => {
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
    const resolved = applySavedMapping({
      headers,
      columns,
      autoMapping,
      savedMapping: null,
    });
    const bundle = buildMappingReviewBundle({
      headers,
      columns,
      reportDetection: reportResult(UNKNOWN_REPORT, 0.2),
      autoMapping,
      resolved,
    });
    const state = createEditStateFromRows(bundle.viewModel.rows);

    expect(bundle.viewModel.ambiguousHeaders).toEqual(['Shared']);

    const resolvedEdit = resolveAmbiguousMapping(
      state,
      bundle,
      columns,
      'Shared',
      'beta',
    );

    expect(resolvedEdit.viewModel.ambiguousHeaders).toEqual([]);
    expect(resolvedEdit.mapping.columnMappings).toEqual([
      { sourceHeader: 'Shared', targetField: 'beta' },
    ]);
  });

  it('7. ignored headers update correctly', () => {
    const headers = ['Product Name', 'Notes Column'];
    const columns = [
      ...PRODUCT_IMPORT_COLUMNS,
      {
        field: 'notes',
        label: 'Notes',
        dataType: 'string' as const,
        required: false,
        synonyms: ['Notes Column'],
      },
    ];
    const autoMapping = buildAutoMapping(headers, columns, { profile: PRODUCT_IMPORT_REPORT });
    const resolved = applySavedMapping({
      headers,
      columns,
      autoMapping,
      savedMapping: null,
    });
    const bundle = buildMappingReviewBundle({
      headers,
      columns,
      reportDetection: reportResult(PRODUCT_IMPORT_REPORT, 0.8),
      autoMapping,
      resolved,
    });
    const state = createEditStateFromRows(bundle.viewModel.rows);

    const ignored = ignoreSourceHeader(state, bundle, columns, 'Notes Column');

    expect(ignored.viewModel.ignoredHeaders).toContain('Notes Column');
    expect(
      ignored.mapping.columnMappings.some((entry) => entry.sourceHeader === 'Notes Column'),
    ).toBe(false);
  });

  it('8. reset restores the original auto/saved mapping', () => {
    const headers = ['Product Name', 'Product Code'];
    const autoMapping = buildAutoMapping(headers, PRODUCT_IMPORT_COLUMNS, {
      profile: PRODUCT_IMPORT_REPORT,
    });
    const resolved = applySavedMapping({
      headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: null,
    });
    const bundle = buildMappingReviewBundle({
      headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      reportDetection: reportResult(PRODUCT_IMPORT_REPORT, 0.8),
      autoMapping,
      resolved,
    });
    let state = createEditStateFromRows(bundle.viewModel.rows);
    state = changeMappedTargetField(
      state,
      bundle,
      PRODUCT_IMPORT_COLUMNS,
      'Product Code',
      'unit',
    ).state;

    const reset = resetAllMappingReview(bundle.baseline, bundle, PRODUCT_IMPORT_COLUMNS);

    expect(reset.mapping).toEqual(resolved.mapping);
    expect(reset.viewModel.rows.find((row) => row.sourceHeader === 'Product Code')?.targetField).toBe(
      'code',
    );
  });

  it('restore auto returns a header to auto suggestion', () => {
    const headers = ['Product Name', 'Product Code'];
    const autoMapping = buildAutoMapping(headers, PRODUCT_IMPORT_COLUMNS, {
      profile: PRODUCT_IMPORT_REPORT,
    });
    const resolved = applySavedMapping({
      headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      autoMapping,
      savedMapping: null,
    });
    const bundle = buildMappingReviewBundle({
      headers,
      columns: PRODUCT_IMPORT_COLUMNS,
      reportDetection: reportResult(PRODUCT_IMPORT_REPORT, 0.8),
      autoMapping,
      resolved,
    });
    let state = createEditStateFromRows(bundle.viewModel.rows);
    state = ignoreSourceHeader(state, bundle, PRODUCT_IMPORT_COLUMNS, 'Product Code').state;

    const restored = restoreAutoSuggestion(
      state,
      bundle,
      PRODUCT_IMPORT_COLUMNS,
      'Product Code',
      autoMapping,
    );

    expect(restored.viewModel.rows.find((row) => row.sourceHeader === 'Product Code')?.targetField).toBe(
      'code',
    );
  });
});
