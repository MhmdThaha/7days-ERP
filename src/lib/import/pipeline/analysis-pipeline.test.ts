/**
 * Analysis Pipeline tests — orchestrates engines into ImportReviewViewModel.
 */

import { describe, expect, it, vi } from 'vitest';

import type { MappingConfig } from '@/lib/import/engine/types';
import { buildImportReview, type BuildImportReviewInput } from '@/lib/import/pipeline/analysis-pipeline';
import { AUTO_IMPORT_RECOMMENDATION } from '@/lib/import/services/confidence-engine.service';
import { CONFLICT_ENGINE_STATUS, IMPORT_CONFLICT_CODE } from '@/lib/import/services/conflict-engine.service';
import { prepareImportFile } from '@/lib/import/services/import.service';
import * as productMatching from '@/lib/import/services/product-matching.service';
import {
  PRODUCT_MATCH_STATUS,
  type ProductMatchCatalogEntry,
} from '@/lib/import/services/product-matching.service';

function csvBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const saleMapping: MappingConfig = {
  columnMappings: [
    { sourceHeader: 'Date', targetField: 'saleDate' },
    { sourceHeader: 'Party Name', targetField: 'customerName' },
    { sourceHeader: 'Item Name', targetField: 'productName' },
    { sourceHeader: 'Item Code', targetField: 'productCode' },
    { sourceHeader: 'Qty', targetField: 'quantity' },
    { sourceHeader: 'Invoice No', targetField: 'saleNumber' },
  ],
};

const bread: ProductMatchCatalogEntry = {
  id: 'prod-bread',
  name: 'Milk Bread',
  code: 'BRD-001',
  unit: 'pcs',
  isActive: true,
  deletedAt: null,
};

const bigBread: ProductMatchCatalogEntry = {
  id: 'prod-big',
  name: 'Big Bread',
  code: 'BB-001',
  unit: 'pcs',
  isActive: true,
  deletedAt: null,
};

const smallBread: ProductMatchCatalogEntry = {
  id: 'prod-small',
  name: 'Small Bread',
  code: 'SB-001',
  unit: 'pcs',
  isActive: true,
  deletedAt: null,
};

function buildInput(
  csv: string,
  catalog: readonly ProductMatchCatalogEntry[],
  overrides: Partial<BuildImportReviewInput> = {},
): BuildImportReviewInput {
  const prepared = prepareImportFile(csvBytes(csv), 'sale', { fileName: 'sales.csv' });

  return {
    fileName: 'sales.csv',
    entityType: 'sale',
    parsed: prepared.parsed,
    headerDetection: prepared.headerDetection,
    reportDetection: prepared.reportDetection,
    mapping: saleMapping,
    productCatalog: catalog,
    ...overrides,
  };
}

describe('buildImportReview', () => {
  it('returns an empty review for an empty spreadsheet', () => {
    const csv = 'Date,Party Name,Item Name,Item Code,Qty,Invoice No\n';
    const { viewModel } = buildImportReview(buildInput(csv, [bread]));

    expect(viewModel.overview.totalRows).toBe(0);
    expect(viewModel.rows).toEqual([]);
    expect(viewModel.reportSummary.matchedColumns.length).toBeGreaterThan(0);
  });

  it('handles unknown report structures', () => {
    const csv = [
      'Foo,Bar,Baz',
      '1,2,3',
    ].join('\n');
    const prepared = prepareImportFile(csvBytes(csv), 'sale', { fileName: 'unknown.csv' });

    const { viewModel } = buildImportReview({
      fileName: 'unknown.csv',
      entityType: 'sale',
      parsed: prepared.parsed,
      headerDetection: prepared.headerDetection,
      reportDetection: prepared.reportDetection,
      mapping: {
        columnMappings: [
          { sourceHeader: 'Foo', targetField: 'productName' },
          { sourceHeader: 'Bar', targetField: 'quantity' },
        ],
      },
      productCatalog: [bread],
      preparation: { bulkSaleDate: '2026-08-08' },
    });

    expect(viewModel.overview.detectedReportType).toBe('unknown');
    expect(viewModel.reportSummary.detectionReasons.length).toBeGreaterThan(0);
  });

  it('processes one valid row end-to-end', () => {
    const csv = [
      'Date,Party Name,Item Name,Item Code,Qty,Invoice No',
      '2026-03-01,Corner Store,Milk Bread,BRD-001,2,INV-1',
    ].join('\n');

    const { viewModel } = buildImportReview(buildInput(csv, [bread]));

    expect(viewModel.overview.totalRows).toBe(1);
    expect(viewModel.overview.readyRows).toBe(1);
    expect(viewModel.rows[0]?.productMatchResult?.matchedProductId).toBe('prod-bread');
    expect(viewModel.rows[0]?.conflictEngineResult.status).toBe(CONFLICT_ENGINE_STATUS.READY);
    expect(viewModel.rows[0]?.confidenceResult.confidenceScore).toBeGreaterThan(0);
  });

  it('processes 100 rows', () => {
    const header = 'Date,Party Name,Item Name,Item Code,Qty,Invoice No';
    const body = Array.from(
      { length: 100 },
      (_, index) => `2026-03-01,Store ${index},Milk Bread,BRD-001,1,INV-${index}`,
    ).join('\n');
    const { viewModel } = buildImportReview(buildInput(`${header}\n${body}`, [bread]));

    expect(viewModel.rows).toHaveLength(100);
    expect(viewModel.overview.totalRows).toBe(100);
  });

  it('processes 1000 rows', () => {
    const header = 'Date,Party Name,Item Name,Item Code,Qty,Invoice No';
    const body = Array.from(
      { length: 1000 },
      (_, index) => `2026-03-01,Store ${index},Milk Bread,BRD-001,1,INV-${index}`,
    ).join('\n');

    const started = performance.now();
    const { viewModel } = buildImportReview(buildInput(`${header}\n${body}`, [bread]));
    const elapsed = performance.now() - started;

    expect(viewModel.rows).toHaveLength(1000);
    expect(elapsed).toBeLessThan(5000);
  });

  it('aggregates mixed ready, warning, and error rows', () => {
    const csv = [
      'Date,Party Name,Item Name,Item Code,Qty,Invoice No',
      '2026-03-01,Corner Store,Milk Bread,BRD-001,2,INV-1',
      '2026-03-01,Corner Store,Milk Bread,BRD-001,0,INV-2',
      '2026-03-01,Corner Store,Missing Product,,1,INV-3',
    ].join('\n');

    const { viewModel } = buildImportReview(buildInput(csv, [bread]));

    expect(viewModel.overview.readyRows).toBe(1);
    expect(viewModel.overview.warningRows).toBe(1);
    expect(viewModel.overview.errorRows).toBe(1);
    expect(viewModel.overview.totalRows).toBe(3);
  });

  it('flags duplicate rows in file', () => {
    const csv = [
      'Date,Party Name,Item Name,Item Code,Qty,Invoice No',
      '2026-03-01,Corner Store,Milk Bread,BRD-001,2,INV-1',
      '2026-03-01,Corner Store,Milk Bread,BRD-001,2,INV-1',
    ].join('\n');

    const { viewModel } = buildImportReview(buildInput(csv, [bread]));

    expect(
      viewModel.rows.some((row) =>
        row.conflictEngineResult.warnings.some(
          (warning) => warning.code === IMPORT_CONFLICT_CODE.DUPLICATE_ROW_IN_FILE,
        ),
      ),
    ).toBe(true);
  });

  it('returns unknown product rows as errors', () => {
    const csv = [
      'Date,Party Name,Item Name,Item Code,Qty,Invoice No',
      '2026-03-01,Corner Store,Moon Cheese,,1,INV-1',
    ].join('\n');

    const { viewModel } = buildImportReview(buildInput(csv, [bread]));

    expect(viewModel.rows[0]?.productMatchResult?.status).toBe(PRODUCT_MATCH_STATUS.NOT_FOUND);
    expect(viewModel.rows[0]?.conflictEngineResult.status).toBe(CONFLICT_ENGINE_STATUS.ERROR);
    expect(viewModel.overview.blockedRows).toBe(1);
  });

  it('returns multiple product matches as errors', () => {
    const csv = [
      'Date,Party Name,Item Name,Item Code,Qty,Invoice No',
      '2026-03-01,Corner Store,Bread,,1,INV-1',
    ].join('\n');

    const { viewModel } = buildImportReview(buildInput(csv, [bigBread, smallBread]));

    expect(viewModel.rows[0]?.productMatchResult?.status).toBe(PRODUCT_MATCH_STATUS.MULTIPLE_MATCHES);
    expect(viewModel.rows[0]?.conflictEngineResult.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: IMPORT_CONFLICT_CODE.MULTIPLE_PRODUCTS }),
      ]),
    );
  });

  it('flags missing quantity rows as errors', () => {
    const csv = [
      'Date,Party Name,Item Name,Item Code,Qty,Invoice No',
      '2026-03-01,Corner Store,Milk Bread,BRD-001,,INV-1',
    ].join('\n');

    const { viewModel } = buildImportReview(buildInput(csv, [bread]));

    expect(viewModel.rows[0]?.conflictEngineResult.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: IMPORT_CONFLICT_CODE.MISSING_QUANTITY }),
      ]),
    );
  });

  it('continues processing when one row throws inside the pipeline loop', () => {
    const csv = [
      'Date,Party Name,Item Name,Item Code,Qty,Invoice No',
      '2026-03-01,Corner Store,Milk Bread,BRD-001,2,INV-1',
      '2026-03-01,Corner Store,Milk Bread,BRD-001,1,INV-2',
    ].join('\n');

    const originalMatch = productMatching.matchProduct;
    let callCount = 0;

    const matchSpy = vi.spyOn(productMatching, 'matchProduct').mockImplementation((...args) => {
      callCount += 1;

      if (callCount === 1) {
        throw new Error('simulated row failure');
      }

      return originalMatch(...args);
    });

    const { viewModel, pipelineErrors } = buildImportReview(buildInput(csv, [bread]));

    matchSpy.mockRestore();

    expect(pipelineErrors).toEqual([2]);
    expect(viewModel.rows).toHaveLength(2);
    expect(viewModel.rows[0]?.conflictEngineResult.status).toBe(CONFLICT_ENGINE_STATUS.ERROR);
    expect(viewModel.rows[1]?.conflictEngineResult.status).toBe(CONFLICT_ENGINE_STATUS.READY);
  });

  it('builds correct overview totals and averages', () => {
    const csv = [
      'Date,Party Name,Item Name,Item Code,Qty,Invoice No',
      '2026-03-01,Corner Store,Milk Bread,BRD-001,2,INV-1',
      '2026-03-01,Corner Store,Milk Bread,BRD-001,0,INV-2',
    ].join('\n');

    const { viewModel } = buildImportReview(buildInput(csv, [bread]));
    const average =
      viewModel.rows.reduce((sum, row) => sum + row.confidenceResult.confidenceScore, 0) /
      viewModel.rows.length;

    expect(viewModel.overview.averageConfidence).toBeCloseTo(average, 5);
    expect(viewModel.overview.autoImportEligibleRows).toBe(
      viewModel.rows.filter(
        (row) =>
          row.confidenceResult.autoImportRecommendation === AUTO_IMPORT_RECOMMENDATION.AUTO_IMPORT,
      ).length,
    );
  });

  it('populates report summary from report detection output', () => {
    const csv = [
      'Date,Party Name,Item Name,Item Code,Qty,Invoice No,Notes',
      '2026-03-01,Corner Store,Milk Bread,BRD-001,2,INV-1,Fresh',
    ].join('\n');

    const mapping: MappingConfig = {
      columnMappings: [
        ...saleMapping.columnMappings,
        { sourceHeader: 'Notes', targetField: 'notes' },
      ],
    };

    const input = buildInput(csv, [bread], { mapping });
    const { viewModel } = buildImportReview(input);

    expect(viewModel.reportSummary.matchedColumns.some((column) => column.header === 'Date')).toBe(true);
    expect(viewModel.reportSummary.detectionReasons.length).toBeGreaterThan(0);
    expect(viewModel.reportSummary.missingRequiredColumns).toEqual([]);
    expect(viewModel.reportSummary.unknownHeaders.length).toBeGreaterThanOrEqual(0);
  });

  it('builds the product catalog once for all rows', () => {
    const catalogSpy = vi.spyOn(productMatching, 'buildProductMatchCatalog');
    const csv = [
      'Date,Party Name,Item Name,Item Code,Qty,Invoice No',
      '2026-03-01,Corner Store,Milk Bread,BRD-001,2,INV-1',
      '2026-03-01,Metro Mart,Milk Bread,BRD-001,1,INV-2',
    ].join('\n');

    buildImportReview(buildInput(csv, [bread]));

    expect(catalogSpy).toHaveBeenCalledTimes(1);
    catalogSpy.mockRestore();
  });
});
