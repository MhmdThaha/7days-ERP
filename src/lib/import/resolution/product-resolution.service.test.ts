/**
 * Product Resolution service tests — single-row re-analysis without pipeline rebuild.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  applySingleRowResolution,
  extractDuplicateRowNumbers,
  getProductResolutionActionLabel,
  getProductResolutionCase,
  getResolutionCandidates,
  getReviewProductMatchDisplay,
  isReadOnlyProductResolution,
  needsProductResolution,
  recalculateReviewRowAfterResolution,
  recomputeImportReviewOverview,
} from '@/lib/import/resolution/product-resolution.service';
import { PRODUCT_RESOLUTION_CASE } from '@/lib/import/resolution/types';
import type { ImportReviewOverviewViewModel, ImportReviewRowViewModel } from '@/lib/import/review/types';
import { SALES_DETAIL_REPORT } from '@/lib/import/reports/definitions';
import { buildImportReview } from '@/lib/import/pipeline/analysis-pipeline';
import * as analysisPipeline from '@/lib/import/pipeline/analysis-pipeline';
import { validateSalesImportReview } from '@/lib/import/integration/validate-sales-import-review';
import { DomainError } from '@/lib/domain/errors';
import { SALE_IMPORT_COLUMNS } from '@/lib/import/definitions/sale.definition';
import { buildAutoMapping } from '@/lib/import/services/auto-mapping';
import { prepareImportFile } from '@/lib/import/services/import.service';
import {
  AUTO_IMPORT_RECOMMENDATION,
  CONFIDENCE_LEVEL,
} from '@/lib/import/services/confidence-engine.service';
import {
  classifyImportRowConflict,
  CONFLICT_ENGINE_STATUS,
  IMPORT_CONFLICT_CODE,
} from '@/lib/import/services/conflict-engine.service';
import {
  buildProductMatchCatalog,
  matchProduct,
  PRODUCT_MATCH_STATUS,
  type ProductMatchCatalogEntry,
} from '@/lib/import/services/product-matching.service';

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

const inactiveBread: ProductMatchCatalogEntry = {
  id: 'prod-inactive',
  name: 'Garlic Bread',
  code: 'GB-001',
  unit: 'pcs',
  isActive: false,
  deletedAt: null,
};

function reportDetection(confidence = 0.92) {
  return {
    profile: SALES_DETAIL_REPORT,
    reportType: 'sales-detail' as const,
    confidence,
    matchedColumns: [
      { key: 'saleDate', label: 'Sale Date', header: 'Date', required: true, similarity: 1 },
      { key: 'quantity', label: 'Quantity', header: 'Qty', required: true, similarity: 1 },
    ],
    missingColumns: [],
    matchedHeaders: ['Date', 'Qty'],
    missingHeaders: [],
    unmatchedHeaders: ['Notes'],
    explanation: ['Classified as Sales Detail with confidence 0.92.'],
    candidates: [],
  };
}
function baseOverview(totalRows: number): ImportReviewOverviewViewModel {
  return {
    fileName: 'sales.csv',
    detectedReportName: 'Sales Detail',
    detectedReportType: 'sales-detail',
    reportConfidence: 0.9,
    headerRowIndex: 0,
    totalRows,
    readyRows: 0,
    warningRows: 0,
    errorRows: totalRows,
    averageConfidence: 40,
    autoImportEligibleRows: 0,
    blockedRows: totalRows,
  };
}

function unknownProductRow(): ImportReviewRowViewModel {
  return {
    rowNumber: 2,
    originalValues: { productName: 'Moon Cheese' },
    normalizedValues: {
      customerName: 'Corner Store',
      productName: 'Moon Cheese',
      productCode: null,
      quantity: 1,
      saleDate: '2026-03-01',
    },
    reportDetectionResult: reportDetection(),
    productMatchResult: {
      status: PRODUCT_MATCH_STATUS.NOT_FOUND,
      matchedProductId: null,
      matchedProductName: null,
      confidence: 0,
      reason: 'No product match found',
    },
    conflictEngineResult: {
      status: CONFLICT_ENGINE_STATUS.ERROR,
      conflicts: [
        {
          code: IMPORT_CONFLICT_CODE.UNKNOWN_PRODUCT,
          message: 'Product was not found in BakeryOS.',
          field: 'productName',
        },
      ],
      warnings: [],
      blockingReason: 'Product was not found in BakeryOS.',
      recommendedAction: 'Map this row to an existing product.',
      confidencePenalty: 40,
    },
    confidenceResult: {
      confidenceScore: 35,
      confidenceLevel: CONFIDENCE_LEVEL.LOW,
      confidenceReasons: ['Unknown product'],
      autoImportRecommendation: AUTO_IMPORT_RECOMMENDATION.BLOCK_IMPORT,
    },
  };
}

function multipleMatchRow(): ImportReviewRowViewModel {
  return {
    ...unknownProductRow(),
    rowNumber: 3,
    normalizedValues: {
      customerName: 'Corner Store',
      productName: 'Bread',
      productCode: null,
      quantity: 1,
      saleDate: '2026-03-01',
    },
    productMatchResult: {
      status: PRODUCT_MATCH_STATUS.MULTIPLE_MATCHES,
      matchedProductId: null,
      matchedProductName: null,
      confidence: 0,
      reason: 'Multiple products match',
      candidates: [
        { productId: 'prod-big', productName: 'Big Bread', confidence: 80 },
        { productId: 'prod-small', productName: 'Small Bread', confidence: 78 },
      ],
    },
    conflictEngineResult: {
      status: CONFLICT_ENGINE_STATUS.ERROR,
      conflicts: [
        {
          code: IMPORT_CONFLICT_CODE.MULTIPLE_PRODUCTS,
          message: 'Multiple products match this row.',
          field: 'productName',
          metadata: {
            candidates: [
              { productId: 'prod-big', productName: 'Big Bread', confidence: 80 },
              { productId: 'prod-small', productName: 'Small Bread', confidence: 78 },
            ],
          },
        },
      ],
      warnings: [],
      blockingReason: 'Multiple products match this row.',
      recommendedAction: 'Choose one product.',
      confidencePenalty: 35,
    },
  };
}

function inactiveProductRow(): ImportReviewRowViewModel {
  return {
    ...unknownProductRow(),
    rowNumber: 4,
    normalizedValues: {
      customerName: 'Corner Store',
      productName: 'Garlic Bread',
      productCode: 'GB-001',
      quantity: 1,
      saleDate: '2026-03-01',
    },
    productMatchResult: {
      status: PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION,
      matchedProductId: 'prod-inactive',
      matchedProductName: 'Garlic Bread',
      confidence: 98,
      reason: 'Inactive Product',
    },
    conflictEngineResult: {
      status: CONFLICT_ENGINE_STATUS.WARNING,
      conflicts: [],
      warnings: [
        {
          code: IMPORT_CONFLICT_CODE.INACTIVE_PRODUCT,
          message: 'Matched product is inactive.',
          field: 'productName',
          metadata: {
            matchedProductId: 'prod-inactive',
            matchedProductName: 'Garlic Bread',
          },
        },
      ],
      blockingReason: null,
      recommendedAction: 'Activate the product or choose a different match before importing.',
      confidencePenalty: 12,
    },
    confidenceResult: {
      confidenceScore: 72,
      confidenceLevel: CONFIDENCE_LEVEL.MEDIUM,
      confidenceReasons: ['Inactive product'],
      autoImportRecommendation: AUTO_IMPORT_RECOMMENDATION.USER_CONFIRMATION,
    },
  };
}

function fuzzyMatchRow(): ImportReviewRowViewModel {
  return {
    rowNumber: 6,
    originalValues: { productName: 'Large Milk Bread' },
    normalizedValues: {
      customerName: 'Corner Store',
      productName: 'Large Milk Bread',
      productCode: '389681957388',
      quantity: 58,
      saleDate: '2026-03-01',
    },
    reportDetectionResult: reportDetection(0.5),
    productMatchResult: {
      status: PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION,
      matchedProductId: 'prod-bread-generic',
      matchedProductName: 'Bread',
      confidence: 70,
      reason: 'Fuzzy Name Match',
    },
    conflictEngineResult: {
      status: CONFLICT_ENGINE_STATUS.READY,
      conflicts: [],
      warnings: [],
      blockingReason: null,
      recommendedAction: null,
      confidencePenalty: 0,
    },
    confidenceResult: {
      confidenceScore: 60,
      confidenceLevel: CONFIDENCE_LEVEL.MEDIUM,
      confidenceReasons: ['Fuzzy product name match'],
      autoImportRecommendation: AUTO_IMPORT_RECOMMENDATION.USER_CONFIRMATION,
    },
  };
}

function systemConfigRow(): ImportReviewRowViewModel {
  return {
    ...unknownProductRow(),
    rowNumber: 5,
    productMatchResult: {
      status: PRODUCT_MATCH_STATUS.SYSTEM_CONFIGURATION_ERROR,
      matchedProductId: null,
      matchedProductName: null,
      confidence: 0,
      reason: 'Duplicate barcode in BakeryOS catalog',
    },
    conflictEngineResult: {
      status: CONFLICT_ENGINE_STATUS.ERROR,
      conflicts: [
        {
          code: IMPORT_CONFLICT_CODE.SYSTEM_CONFIGURATION_ERROR,
          message: 'Duplicate barcode in BakeryOS catalog',
          field: 'productCode',
        },
      ],
      warnings: [],
      blockingReason: 'Duplicate barcode in BakeryOS catalog',
      recommendedAction: 'Fix duplicate master data in BakeryOS before importing.',
      confidencePenalty: 50,
    },
  };
}

describe('matchProduct integration with resolution pipeline', () => {
  it('resolves name/code conflict rows to the chosen product id', () => {
    const bigWithCode = {
      ...bigBread,
      code: 'PRD-001',
    };
    const smallWithCode = {
      ...smallBread,
      code: 'PRD-002',
    };
    const catalogProducts = [bigWithCode, smallWithCode];
    const catalog = buildProductMatchCatalog(catalogProducts);

    const match = matchProduct(
      { productName: 'Small Bread', productCode: 'PRD-001' },
      catalog,
    );

    expect(match.status).toBe(PRODUCT_MATCH_STATUS.MULTIPLE_MATCHES);

    const row: ImportReviewRowViewModel = {
      ...unknownProductRow(),
      normalizedValues: {
        customerName: 'Corner Store',
        productName: 'Small Bread',
        productCode: 'PRD-001',
        quantity: 1,
        saleDate: '2026-03-01',
      },
      productMatchResult: match,
      conflictEngineResult: classifyImportRowConflict({
        rowNumber: 2,
        values: {
          customerName: 'Corner Store',
          productName: 'Small Bread',
          productCode: 'PRD-001',
          quantity: 1,
          saleDate: '2026-03-01',
        },
        productMatchResult: match,
        reportDetectionResult: reportDetection(),
      }),
    };

    const updated = recalculateReviewRowAfterResolution({
      row,
      action: { type: 'select-existing', productId: 'prod-big' },
      catalogProducts,
    });

    expect(updated.productMatchResult?.status).toBe(PRODUCT_MATCH_STATUS.MATCHED);
    expect(updated.productMatchResult?.matchedProductId).toBe('prod-big');
    expect(updated.conflictEngineResult.status).toBe(CONFLICT_ENGINE_STATUS.READY);
  });
});

describe('getProductResolutionCase', () => {
  it('classifies unknown, multiple, inactive, and system configuration rows', () => {
    expect(getProductResolutionCase(unknownProductRow())).toBe(
      PRODUCT_RESOLUTION_CASE.UNKNOWN_PRODUCT,
    );
    expect(getProductResolutionCase(multipleMatchRow())).toBe(
      PRODUCT_RESOLUTION_CASE.MULTIPLE_MATCHES,
    );
    expect(getProductResolutionCase(inactiveProductRow())).toBe(
      PRODUCT_RESOLUTION_CASE.INACTIVE_PRODUCT,
    );
    expect(getProductResolutionCase(fuzzyMatchRow())).toBe(PRODUCT_RESOLUTION_CASE.FUZZY_MATCH);
    expect(getProductResolutionCase(systemConfigRow())).toBe(
      PRODUCT_RESOLUTION_CASE.SYSTEM_CONFIGURATION_ERROR,
    );
  });
});

describe('needsProductResolution / isReadOnlyProductResolution', () => {
  it('flags resolvable rows and read-only system configuration rows', () => {
    expect(needsProductResolution(unknownProductRow())).toBe(true);
    expect(needsProductResolution(multipleMatchRow())).toBe(true);
    expect(needsProductResolution(inactiveProductRow())).toBe(true);
    expect(needsProductResolution(fuzzyMatchRow())).toBe(true);
    expect(needsProductResolution(systemConfigRow())).toBe(false);
    expect(isReadOnlyProductResolution(systemConfigRow())).toBe(true);
    expect(isReadOnlyProductResolution(unknownProductRow())).toBe(false);
  });
});

describe('getReviewProductMatchDisplay', () => {
  it('labels fuzzy suggestions separately from confirmed matches', () => {
    expect(getReviewProductMatchDisplay(fuzzyMatchRow())).toEqual({
      kind: 'suggested',
      label: 'Suggested product',
      value: 'Bread',
      needsAction: true,
    });
  });

  it('labels exact matches as matched products', () => {
    const exactRow: ImportReviewRowViewModel = {
      ...fuzzyMatchRow(),
      productMatchResult: {
        status: PRODUCT_MATCH_STATUS.MATCHED,
        matchedProductId: 'prod-big',
        matchedProductName: 'Large Milk Bread',
        confidence: 98,
        reason: 'Exact Name Match',
      },
    };

    expect(getReviewProductMatchDisplay(exactRow)).toEqual({
      kind: 'matched',
      label: 'Matched product',
      value: 'Large Milk Bread',
      needsAction: false,
    });
  });

  it('uses choose-product action label for fuzzy rows', () => {
    expect(getProductResolutionActionLabel(fuzzyMatchRow())).toBe('Choose product');
  });
});

describe('validateSalesImportReview — partial import', () => {
  it('blocks import when no rows are importable', () => {
    expect(() =>
      validateSalesImportReview({
        overview: baseOverview(1),
        reportSummary: {
          matchedColumns: [],
          missingRequiredColumns: [],
          extraColumns: [],
          unknownHeaders: [],
          detectionReasons: [],
        },
        rows: [fuzzyMatchRow()],
      }),
    ).toThrow(DomainError);
  });

  it('allows import when at least one row is importable even if others are unresolved', () => {
    expect(() =>
      validateSalesImportReview({
        overview: baseOverview(2),
        reportSummary: {
          matchedColumns: [],
          missingRequiredColumns: [],
          extraColumns: [],
          unknownHeaders: [],
          detectionReasons: [],
        },
        rows: [fuzzyMatchRow(), baseRowFromExact()],
      }),
    ).not.toThrow();
  });
});

function baseRowFromExact(): ImportReviewRowViewModel {
  return {
    rowNumber: 1,
    originalValues: { productName: 'Large Milk Bread' },
    normalizedValues: {
      customerName: 'Store',
      productName: 'Large Milk Bread',
      quantity: 1,
      saleDate: '2026-03-01',
    },
    reportDetectionResult: reportDetection(),
    productMatchResult: {
      status: PRODUCT_MATCH_STATUS.MATCHED,
      matchedProductId: 'prod-large',
      matchedProductName: 'Large Milk Bread',
      confidence: 98,
      reason: 'Exact Name Match',
    },
    conflictEngineResult: {
      status: CONFLICT_ENGINE_STATUS.READY,
      conflicts: [],
      warnings: [],
      blockingReason: null,
      recommendedAction: null,
      confidencePenalty: 0,
    },
    confidenceResult: {
      confidenceScore: 85,
      confidenceLevel: CONFIDENCE_LEVEL.HIGH,
      confidenceReasons: [],
      autoImportRecommendation: AUTO_IMPORT_RECOMMENDATION.PREVIEW_FIRST,
    },
  };
}

describe('screenshot scenario — bread suggestions in review pipeline', () => {
  const genericBread = { id: 'prod-bread', name: 'Bread', code: 'BRD', isActive: true };

  it('shows suggested Bread for imported bread variants when only generic Bread exists', () => {
    const csv = [
      'Item Name,Item Code,Qty',
      'White Sandwich Bread,569436131123,10',
      'Large Milk Bread,389681957388,58',
      'Small Milk Bread,111111111111,5',
      'Wheat Bread,222222222222,3',
    ].join('\n');
    const bytes = new TextEncoder().encode(csv);
    const prepared = prepareImportFile(bytes, 'sale', { fileName: 'bread-rows.csv' });
    const autoMapping = buildAutoMapping(prepared.parsed.headers, SALE_IMPORT_COLUMNS, {
      profile: prepared.reportDetection.profile,
    });

    const { viewModel } = buildImportReview({
      fileName: 'bread-rows.csv',
      entityType: 'sale',
      parsed: prepared.parsed,
      headerDetection: prepared.headerDetection,
      reportDetection: prepared.reportDetection,
      mapping: autoMapping.mapping,
      productCatalog: [genericBread],
      preparation: { bulkSaleDate: '2026-08-05' },
    });

    for (const row of viewModel.rows) {
      expect(getProductResolutionCase(row)).toBe(PRODUCT_RESOLUTION_CASE.FUZZY_MATCH);
      expect(getReviewProductMatchDisplay(row)).toMatchObject({
        kind: 'suggested',
        label: 'Suggested product',
        value: 'Bread',
        needsAction: true,
      });
    }
  });
});

describe('getResolutionCandidates', () => {
  it('returns full catalog for unknown products and candidate subset for multiple matches', () => {
    const catalog = buildProductMatchCatalog([bread, bigBread, smallBread]);

    expect(getResolutionCandidates(unknownProductRow(), catalog)).toHaveLength(3);
    expect(getResolutionCandidates(multipleMatchRow(), catalog).map((entry) => entry.id)).toEqual([
      'prod-big',
      'prod-small',
    ]);
  });

  it('returns suggested product only for fuzzy matches', () => {
    const genericBread: ProductMatchCatalogEntry = {
      id: 'prod-bread-generic',
      name: 'Bread',
      code: 'BRD',
      unit: 'pcs',
      isActive: true,
      deletedAt: null,
    };
    const catalog = buildProductMatchCatalog([genericBread, bigBread, smallBread]);

    expect(getResolutionCandidates(fuzzyMatchRow(), catalog).map((entry) => entry.id)).toEqual([
      'prod-bread-generic',
    ]);
  });
});

describe('recalculateReviewRowAfterResolution', () => {
  it('requires explicit confirmation before fuzzy rows become matched', () => {
    const genericBread: ProductMatchCatalogEntry = {
      id: 'prod-bread-generic',
      name: 'Bread',
      code: 'BRD',
      unit: 'pcs',
      isActive: true,
      deletedAt: null,
    };
    const largeMilkBread: ProductMatchCatalogEntry = {
      id: 'prod-large-milk',
      name: 'Large Milk Bread',
      code: 'LMB-001',
      unit: 'pcs',
      isActive: true,
      deletedAt: null,
    };

    expect(needsProductResolution(fuzzyMatchRow())).toBe(true);

    const confirmedSuggested = recalculateReviewRowAfterResolution({
      row: fuzzyMatchRow(),
      action: { type: 'select-existing', productId: 'prod-bread-generic' },
      catalogProducts: [genericBread, largeMilkBread],
    });

    expect(confirmedSuggested.productMatchResult?.status).toBe(PRODUCT_MATCH_STATUS.MATCHED);
    expect(confirmedSuggested.productMatchResult?.matchedProductId).toBe('prod-bread-generic');
    expect(needsProductResolution(confirmedSuggested)).toBe(false);

    const switchedProduct = recalculateReviewRowAfterResolution({
      row: fuzzyMatchRow(),
      action: { type: 'select-existing', productId: 'prod-large-milk' },
      catalogProducts: [genericBread, largeMilkBread],
    });

    expect(switchedProduct.productMatchResult?.matchedProductId).toBe('prod-large-milk');
  });

  it('resolves unknown product by selecting an existing catalog product', () => {
    const row = unknownProductRow();
    const updated = recalculateReviewRowAfterResolution({
      row,
      action: { type: 'select-existing', productId: 'prod-bread' },
      catalogProducts: [bread, bigBread],
    });

    expect(updated.productMatchResult?.status).toBe(PRODUCT_MATCH_STATUS.MATCHED);
    expect(updated.productMatchResult?.matchedProductId).toBe('prod-bread');
    expect(updated.productMatchResult?.reason).toBe('Manual Resolution');
    expect(updated.conflictEngineResult.status).toBe(CONFLICT_ENGINE_STATUS.READY);
    expect(updated.productResolution?.action).toBe('select-existing');
    expect(updated.productResolution?.resolvedInMemory).toBe(true);
  });

  it('resolves multiple matches by selecting one candidate', () => {
    const updated = recalculateReviewRowAfterResolution({
      row: multipleMatchRow(),
      action: { type: 'select-existing', productId: 'prod-big' },
      catalogProducts: [bigBread, smallBread],
    });

    expect(updated.productMatchResult?.matchedProductId).toBe('prod-big');
    expect(updated.conflictEngineResult.conflicts).toEqual([]);
  });

  it('accepts inactive product or switches to another active product', () => {
    const accepted = recalculateReviewRowAfterResolution({
      row: inactiveProductRow(),
      action: { type: 'accept-inactive', productId: 'prod-inactive' },
      catalogProducts: [inactiveBread, bread],
    });

    expect(accepted.productMatchResult?.reason).toBe('Inactive product accepted manually');
    expect(accepted.conflictEngineResult.status).toBe(CONFLICT_ENGINE_STATUS.READY);

    const switched = recalculateReviewRowAfterResolution({
      row: inactiveProductRow(),
      action: { type: 'select-existing', productId: 'prod-bread' },
      catalogProducts: [inactiveBread, bread],
    });

    expect(switched.productMatchResult?.matchedProductId).toBe('prod-bread');
    expect(switched.conflictEngineResult.status).toBe(CONFLICT_ENGINE_STATUS.READY);
  });

  it('marks skipped rows as warnings without a matched product', () => {
    const updated = recalculateReviewRowAfterResolution({
      row: unknownProductRow(),
      action: { type: 'skip-row' },
      catalogProducts: [bread],
    });

    expect(updated.productMatchResult).toBeNull();
    expect(updated.conflictEngineResult.status).toBe(CONFLICT_ENGINE_STATUS.WARNING);
    expect(updated.productResolution?.action).toBe('skip-row');
  });

  it('creates an in-memory placeholder product without persisting it', () => {
    const updated = recalculateReviewRowAfterResolution({
      row: unknownProductRow(),
      action: { type: 'create-placeholder', productName: 'Moon Cheese' },
      catalogProducts: [bread],
    });

    expect(updated.productMatchResult?.status).toBe(PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION);
    expect(updated.productMatchResult?.matchedProductName).toBe('Moon Cheese');
    expect(updated.productMatchResult?.reason).toBe('Create Product Placeholder');
    expect(updated.productResolution?.action).toBe('create-placeholder');
  });
});

describe('applySingleRowResolution / recomputeImportReviewOverview', () => {
  it('updates only one row and refreshes overview totals', () => {
    const rows = [unknownProductRow(), multipleMatchRow()];
    const viewModel = {
      overview: baseOverview(2),
      rows,
    };

    const updatedRow = recalculateReviewRowAfterResolution({
      row: rows[0]!,
      action: { type: 'select-existing', productId: 'prod-bread' },
      catalogProducts: [bread, bigBread, smallBread],
    });

    const next = applySingleRowResolution(viewModel, updatedRow);

    expect(next.rows).toHaveLength(2);
    expect(next.rows[0]?.rowNumber).toBe(2);
    expect(next.rows[0]?.productMatchResult?.matchedProductId).toBe('prod-bread');
    expect(next.rows[1]?.productMatchResult?.status).toBe(PRODUCT_MATCH_STATUS.MULTIPLE_MATCHES);
    expect(next.overview.errorRows).toBe(1);
    expect(next.overview.readyRows).toBe(1);
    expect(next.overview.totalRows).toBe(2);
  });

  it('recomputes overview averages from row confidence scores', () => {
    const rows = [unknownProductRow(), inactiveProductRow()];
    const overview = recomputeImportReviewOverview(baseOverview(2), rows);

    expect(overview.averageConfidence).toBeCloseTo(
      (rows[0]!.confidenceResult.confidenceScore + rows[1]!.confidenceResult.confidenceScore) / 2,
      5,
    );
  });
});

describe('extractDuplicateRowNumbers', () => {
  it('reads duplicate row metadata from conflict warnings', () => {
    const row: ImportReviewRowViewModel = {
      ...unknownProductRow(),
      conflictEngineResult: {
        ...unknownProductRow().conflictEngineResult,
        warnings: [
          {
            code: IMPORT_CONFLICT_CODE.DUPLICATE_ROW_IN_FILE,
            message: 'Duplicate row in file.',
            field: 'saleNumber',
            metadata: { duplicateRowNumbers: [3, 7] },
          },
        ],
      },
    };

    expect(extractDuplicateRowNumbers(row)).toEqual([3, 7]);
  });
});

describe('single-row resolution performance contract', () => {
  it('does not rebuild the full analysis pipeline when resolving one row', () => {
    const pipelineSpy = vi.spyOn(analysisPipeline, 'buildImportReview');
    const row = unknownProductRow();

    recalculateReviewRowAfterResolution({
      row,
      action: { type: 'select-existing', productId: 'prod-bread' },
      catalogProducts: [bread],
    });

    expect(pipelineSpy).not.toHaveBeenCalled();
    pipelineSpy.mockRestore();
  });

  it('can resolve a row produced by the pipeline without calling buildImportReview again', () => {
    const csv = [
      'Date,Party Name,Item Name,Item Code,Qty,Invoice No',
      '2026-03-01,Corner Store,Moon Cheese,,1,INV-1',
    ].join('\n');

    const csvBytes = new TextEncoder().encode(csv);
    const prepared = prepareImportFile(csvBytes, 'sale', { fileName: 'sales.csv' });

    const { viewModel } = buildImportReview({
      fileName: 'sales.csv',
      entityType: 'sale',
      parsed: prepared.parsed,
      headerDetection: prepared.headerDetection,
      reportDetection: prepared.reportDetection,
      mapping: {
        columnMappings: [
          { sourceHeader: 'Date', targetField: 'saleDate' },
          { sourceHeader: 'Party Name', targetField: 'customerName' },
          { sourceHeader: 'Item Name', targetField: 'productName' },
          { sourceHeader: 'Item Code', targetField: 'productCode' },
          { sourceHeader: 'Qty', targetField: 'quantity' },
          { sourceHeader: 'Invoice No', targetField: 'saleNumber' },
        ],
      },
      productCatalog: [bread],
    });

    const pipelineSpy = vi.spyOn(analysisPipeline, 'buildImportReview');
    pipelineSpy.mockClear();

    const updated = recalculateReviewRowAfterResolution({
      row: viewModel.rows[0]!,
      action: { type: 'select-existing', productId: 'prod-bread' },
      catalogProducts: [bread],
    });

    const next = applySingleRowResolution(viewModel, updated);

    expect(pipelineSpy).not.toHaveBeenCalled();
    expect(next.overview.errorRows).toBe(0);
    expect(next.overview.readyRows).toBe(1);

    pipelineSpy.mockRestore();
  });
});
