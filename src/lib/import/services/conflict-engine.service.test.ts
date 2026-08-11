/**
 * Import Conflict Engine tests — classification only, no import execution.
 */

import { describe, expect, it } from 'vitest';

import type { NormalizedValue } from '@/lib/import/engine/types';
import { SALES_DETAIL_REPORT } from '@/lib/import/reports/definitions';
import type { ReportDetectionResult } from '@/lib/import/reports/types';
import {
  classifyImportRowConflict,
  CONFLICT_ENGINE_STATUS,
  detectDuplicateRowsInFile,
  IMPORT_CONFLICT_CODE,
  type ImportRowConflictInput,
} from '@/lib/import/services/conflict-engine.service';
import {
  PRODUCT_MATCH_STATUS,
  type ProductMatchResult,
} from '@/lib/import/services/product-matching.service';

function row(
  rowNumber: number,
  values: Record<string, NormalizedValue>,
  extras: {
    productMatchResult?: ProductMatchResult | null;
    reportDetectionResult?: ReportDetectionResult | null;
  } = {},
): ImportRowConflictInput {
  return {
    rowNumber,
    values,
    productMatchResult: extras.productMatchResult ?? null,
    reportDetectionResult: extras.reportDetectionResult ?? null,
  };
}

function salesDetailReport(): ReportDetectionResult {
  return {
    profile: SALES_DETAIL_REPORT,
    reportType: 'sales-detail',
    confidence: 0.9,
    matchedColumns: [],
    missingColumns: [],
    matchedHeaders: [],
    missingHeaders: [],
    unmatchedHeaders: [],
    explanation: [],
    candidates: [],
  };
}

function matchedProduct(overrides: Partial<ProductMatchResult> = {}): ProductMatchResult {
  return {
    status: PRODUCT_MATCH_STATUS.MATCHED,
    matchedProductId: 'prod-bread',
    matchedProductName: 'Milk Bread',
    confidence: 98,
    reason: 'Exact Name Match',
    ...overrides,
  };
}

describe('classifyImportRowConflict — product matching', () => {
  it('returns ERROR for unknown products', () => {
    const result = classifyImportRowConflict(
      row(2, { productName: 'Moon Cheese', quantity: 5, saleDate: '2026-03-01' }, {
        productMatchResult: {
          status: PRODUCT_MATCH_STATUS.NOT_FOUND,
          matchedProductId: null,
          matchedProductName: null,
          confidence: 0,
          reason: 'No matching product in BakeryOS catalog',
        },
        reportDetectionResult: salesDetailReport(),
      }),
    );

    expect(result.status).toBe(CONFLICT_ENGINE_STATUS.ERROR);
    expect(result.conflicts).toEqual([
      expect.objectContaining({ code: IMPORT_CONFLICT_CODE.UNKNOWN_PRODUCT }),
    ]);
    expect(result.confidencePenalty).toBeGreaterThan(0);
  });

  it('returns ERROR for multiple matching products', () => {
    const result = classifyImportRowConflict(
      row(3, { productName: 'Bread', quantity: 2, saleDate: '2026-03-01' }, {
        productMatchResult: {
          status: PRODUCT_MATCH_STATUS.MULTIPLE_MATCHES,
          matchedProductId: null,
          matchedProductName: null,
          confidence: 80,
          reason: 'Multiple similar products',
          candidates: [
            { productId: 'prod-big', productName: 'Big Bread', confidence: 80 },
            { productId: 'prod-small', productName: 'Small Bread', confidence: 78 },
          ],
        },
      }),
    );

    expect(result.status).toBe(CONFLICT_ENGINE_STATUS.ERROR);
    expect(result.conflicts).toEqual([
      expect.objectContaining({ code: IMPORT_CONFLICT_CODE.MULTIPLE_PRODUCTS }),
    ]);
  });

  it('returns WARNING for inactive products', () => {
    const result = classifyImportRowConflict(
      row(4, { productName: 'Garlic Bread', quantity: 1, saleDate: '2026-03-01' }, {
        productMatchResult: {
          status: PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION,
          matchedProductId: 'prod-inactive',
          matchedProductName: 'Garlic Bread',
          confidence: 98,
          reason: 'Inactive Product',
        },
      }),
    );

    expect(result.status).toBe(CONFLICT_ENGINE_STATUS.WARNING);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: IMPORT_CONFLICT_CODE.INACTIVE_PRODUCT }),
    ]);
  });

  it('returns ERROR for duplicate barcode configuration errors', () => {
    const result = classifyImportRowConflict(
      row(5, { productCode: 'DUP-001', productName: 'Bread', quantity: 1, saleDate: '2026-03-01' }, {
        productMatchResult: {
          status: PRODUCT_MATCH_STATUS.SYSTEM_CONFIGURATION_ERROR,
          matchedProductId: null,
          matchedProductName: null,
          confidence: 0,
          reason: 'Duplicate barcode in BakeryOS catalog',
        },
      }),
    );

    expect(result.status).toBe(CONFLICT_ENGINE_STATUS.ERROR);
    expect(result.conflicts).toEqual([
      expect.objectContaining({ code: IMPORT_CONFLICT_CODE.SYSTEM_CONFIGURATION_ERROR }),
    ]);
  });
});

describe('classifyImportRowConflict — quantity', () => {
  it('returns ERROR for missing quantity', () => {
    const result = classifyImportRowConflict(
      row(6, { productName: 'Bread', saleDate: '2026-03-01' }, {
        productMatchResult: matchedProduct(),
      }),
    );

    expect(result.status).toBe(CONFLICT_ENGINE_STATUS.ERROR);
    expect(result.conflicts).toEqual([
      expect.objectContaining({ code: IMPORT_CONFLICT_CODE.MISSING_QUANTITY }),
    ]);
  });

  it('returns WARNING for zero quantity', () => {
    const result = classifyImportRowConflict(
      row(7, { productName: 'Bread', quantity: 0, saleDate: '2026-03-01' }, {
        productMatchResult: matchedProduct(),
      }),
    );

    expect(result.status).toBe(CONFLICT_ENGINE_STATUS.WARNING);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: IMPORT_CONFLICT_CODE.ZERO_QUANTITY }),
    ]);
  });

  it('returns WARNING for negative quantity', () => {
    const result = classifyImportRowConflict(
      row(8, { productName: 'Bread', quantity: -3, saleDate: '2026-03-01' }, {
        productMatchResult: matchedProduct(),
      }),
    );

    expect(result.status).toBe(CONFLICT_ENGINE_STATUS.WARNING);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: IMPORT_CONFLICT_CODE.NEGATIVE_QUANTITY }),
    ]);
  });

  it('allows decimal quantities without conflict', () => {
    const result = classifyImportRowConflict(
      row(9, { productName: 'Bread', quantity: 2.5, saleDate: '2026-03-01' }, {
        productMatchResult: matchedProduct(),
      }),
    );

    expect(result.status).toBe(CONFLICT_ENGINE_STATUS.READY);
  });

  it('returns WARNING for extremely large quantities', () => {
    const result = classifyImportRowConflict(
      row(10, { productName: 'Bread', quantity: 2_000_000, saleDate: '2026-03-01' }, {
        productMatchResult: matchedProduct(),
      }),
    );

    expect(result.status).toBe(CONFLICT_ENGINE_STATUS.WARNING);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: IMPORT_CONFLICT_CODE.INVALID_QUANTITY,
        metadata: expect.objectContaining({ extremelyLarge: true }),
      }),
    ]);
  });
});

describe('classifyImportRowConflict — amounts and dates', () => {
  it('returns ERROR for invalid amount values', () => {
    const result = classifyImportRowConflict(
      row(11, {
        productName: 'Bread',
        quantity: 1,
        saleDate: '2026-03-01',
        amount: 'not-a-number',
      }, {
        productMatchResult: matchedProduct(),
      }),
    );

    expect(result.status).toBe(CONFLICT_ENGINE_STATUS.ERROR);
    expect(result.conflicts).toEqual([
      expect.objectContaining({ code: IMPORT_CONFLICT_CODE.INVALID_AMOUNT }),
    ]);
  });

  it('returns ERROR for missing sale date on sales-detail reports', () => {
    const result = classifyImportRowConflict(
      row(12, { productName: 'Bread', quantity: 1 }, {
        productMatchResult: matchedProduct(),
        reportDetectionResult: salesDetailReport(),
      }),
    );

    expect(result.status).toBe(CONFLICT_ENGINE_STATUS.ERROR);
    expect(result.conflicts).toEqual([
      expect.objectContaining({ code: IMPORT_CONFLICT_CODE.MISSING_SALE_DATE }),
    ]);
  });

  it('returns WARNING for missing customer when required by context', () => {
    const result = classifyImportRowConflict(
      row(13, { productName: 'Bread', quantity: 1, saleDate: '2026-03-01' }, {
        productMatchResult: matchedProduct(),
      }),
      { requireCustomer: true },
    );

    expect(result.status).toBe(CONFLICT_ENGINE_STATUS.WARNING);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: IMPORT_CONFLICT_CODE.MISSING_CUSTOMER }),
    ]);
  });
});

describe('classifyImportRowConflict — warnings', () => {
  it('returns WARNING for unit mismatch without blocking', () => {
    const result = classifyImportRowConflict(
      row(14, { productName: 'Bread', quantity: 1, saleDate: '2026-03-01', unit: 'PCS' }, {
        productMatchResult: matchedProduct({
          warnings: [
            {
              code: 'UNIT_MISMATCH',
              message: 'Import unit "PCS" differs from catalog unit "PACK"',
              importUnit: 'PCS',
              catalogUnit: 'PACK',
            },
          ],
        }),
      }),
    );

    expect(result.status).toBe(CONFLICT_ENGINE_STATUS.WARNING);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: IMPORT_CONFLICT_CODE.UNIT_MISMATCH }),
    ]);
  });

  it('returns WARNING when barcode and name disagree', () => {
    const result = classifyImportRowConflict(
      row(15, { productCode: 'BRD-001', productName: 'Small Bread', quantity: 1, saleDate: '2026-03-01' }, {
        productMatchResult: matchedProduct({
          reason: 'Barcode Match',
          matchedProductName: 'Large Milk Bread',
        }),
      }),
    );

    expect(result.status).toBe(CONFLICT_ENGINE_STATUS.WARNING);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: IMPORT_CONFLICT_CODE.BARCODE_NAME_CONFLICT }),
    ]);
  });

  it('returns WARNING for duplicate rows in the uploaded file', () => {
    const result = classifyImportRowConflict(
      row(16, { productName: 'Bread', quantity: 20, saleDate: '2026-03-01' }, {
        productMatchResult: matchedProduct(),
      }),
      { duplicateRowNumbers: [4] },
    );

    expect(result.status).toBe(CONFLICT_ENGINE_STATUS.WARNING);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: IMPORT_CONFLICT_CODE.DUPLICATE_ROW_IN_FILE,
        metadata: expect.objectContaining({ duplicateRowNumbers: [4] }),
      }),
    ]);
  });

  it('returns WARNING for negative stock projections', () => {
    const result = classifyImportRowConflict(
      row(17, { productName: 'Bread', quantity: 10, saleDate: '2026-03-01' }, {
        productMatchResult: matchedProduct(),
        reportDetectionResult: salesDetailReport(),
      }),
      { currentStock: 5 },
    );

    expect(result.status).toBe(CONFLICT_ENGINE_STATUS.WARNING);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: IMPORT_CONFLICT_CODE.NEGATIVE_STOCK_WARNING }),
    ]);
  });
});

describe('classifyImportRowConflict — blank and null fields', () => {
  it('returns READY for blank rows', () => {
    const result = classifyImportRowConflict(row(18, {}));

    expect(result.status).toBe(CONFLICT_ENGINE_STATUS.READY);
    expect(result.conflicts).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('handles null and empty string fields', () => {
    const result = classifyImportRowConflict(
      row(19, {
        productName: null,
        productCode: '',
        quantity: null,
        saleDate: '2026-03-01',
      }),
      {},
    );

    expect(result.status).toBe(CONFLICT_ENGINE_STATUS.ERROR);
    expect(result.conflicts.map((conflict) => conflict.code)).toEqual(
      expect.arrayContaining([
        IMPORT_CONFLICT_CODE.MISSING_PRODUCT_NAME,
        IMPORT_CONFLICT_CODE.MISSING_QUANTITY,
      ]),
    );
  });

  it('handles leading spaces and unicode product names', () => {
    const result = classifyImportRowConflict(
      row(20, { productName: '  Bread\u2122  ', quantity: 1, saleDate: '2026-03-01' }, {
        productMatchResult: matchedProduct(),
      }),
    );

    expect(result.status).toBe(CONFLICT_ENGINE_STATUS.READY);
  });
});

describe('classifyImportRowConflict — ready state', () => {
  it('returns READY when there are no blocking conflicts or warnings', () => {
    const result = classifyImportRowConflict(
      row(21, {
        productName: 'Milk Bread',
        quantity: 2,
        saleDate: '2026-03-01',
        customerName: 'Corner Store',
      }, {
        productMatchResult: matchedProduct(),
        reportDetectionResult: salesDetailReport(),
      }),
    );

    expect(result.status).toBe(CONFLICT_ENGINE_STATUS.READY);
    expect(result.blockingReason).toBeNull();
    expect(result.recommendedAction).toBeNull();
    expect(result.confidencePenalty).toBe(0);
  });
});

describe('detectDuplicateRowsInFile', () => {
  it('flags duplicate rows without merging them', () => {
    const rows = [
      row(2, { productName: 'Bread', quantity: 20, saleDate: '2026-03-01' }),
      row(3, { productName: 'Cake', quantity: 1, saleDate: '2026-03-01' }),
      row(4, { productName: 'Bread', quantity: 20, saleDate: '2026-03-01' }),
    ];

    const duplicates = detectDuplicateRowsInFile(rows);

    expect(duplicates.get(2)).toEqual([4]);
    expect(duplicates.get(4)).toEqual([2]);
    expect(duplicates.has(3)).toBe(false);
  });
});

describe('classifyImportRowConflict — deleted and generic products', () => {
  it('treats deleted products as unknown via product matching', () => {
    const result = classifyImportRowConflict(
      row(22, { productName: 'Stale Bread', quantity: 1, saleDate: '2026-03-01' }, {
        productMatchResult: {
          status: PRODUCT_MATCH_STATUS.NOT_FOUND,
          matchedProductId: null,
          matchedProductName: null,
          confidence: 0,
          reason: 'No matching product in BakeryOS catalog',
        },
      }),
    );

    expect(result.status).toBe(CONFLICT_ENGINE_STATUS.ERROR);
    expect(result.conflicts).toEqual([
      expect.objectContaining({ code: IMPORT_CONFLICT_CODE.UNKNOWN_PRODUCT }),
    ]);
  });
});
