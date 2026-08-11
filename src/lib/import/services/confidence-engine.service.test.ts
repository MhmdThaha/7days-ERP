/**
 * Import Confidence Engine tests — scoring only, no import execution.
 */

import { describe, expect, it } from 'vitest';

import { SALES_DETAIL_REPORT, UNKNOWN_REPORT } from '@/lib/import/reports/definitions';
import type { ReportDetectionResult } from '@/lib/import/reports/types';
import {
  calculateImportConfidence,
  CONFIDENCE_LEVEL,
  AUTO_IMPORT_RECOMMENDATION,
  PRODUCT_MATCH_SCORE,
  REPORT_CONFIDENCE_SCORE,
  scoreProductMatching,
  scoreReportDetection,
} from '@/lib/import/services/confidence-engine.service';
import {
  classifyImportRowConflict,
  CONFLICT_ENGINE_STATUS,
} from '@/lib/import/services/conflict-engine.service';
import {
  PRODUCT_MATCH_STATUS,
  type ProductMatchResult,
} from '@/lib/import/services/product-matching.service';

function report(confidence: number, reportType: ReportDetectionResult['reportType'] = 'sales-detail'): ReportDetectionResult {
  return {
    profile: reportType === 'unknown' ? UNKNOWN_REPORT : SALES_DETAIL_REPORT,
    reportType,
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

function product(overrides: Partial<ProductMatchResult>): ProductMatchResult {
  return {
    status: PRODUCT_MATCH_STATUS.MATCHED,
    matchedProductId: 'prod-1',
    matchedProductName: 'Milk Bread',
    confidence: 98,
    reason: 'Exact Name Match',
    ...overrides,
  };
}

function conflictForRow(
  values: Record<string, unknown>,
  extras: {
    productMatchResult?: ProductMatchResult;
    reportDetectionResult?: ReportDetectionResult;
    duplicateRowNumbers?: number[];
    currentStock?: number;
  } = {},
) {
  return classifyImportRowConflict(
    {
      rowNumber: 2,
      values: values as never,
      productMatchResult: extras.productMatchResult ?? null,
      reportDetectionResult: extras.reportDetectionResult ?? report(0.9),
    },
    {
      duplicateRowNumbers: extras.duplicateRowNumbers,
      currentStock: extras.currentStock,
    },
  );
}

describe('calculateImportConfidence — product matching component', () => {
  it('scores barcode matches at 100 with VERY_HIGH and AUTO_IMPORT', () => {
    const match = product({ reason: 'Barcode Match', confidence: 100, matchedProductName: 'Milk Bread' });
    const conflict = conflictForRow(
      { productCode: 'BRD-001', productName: 'Milk Bread', quantity: 2, saleDate: '2026-03-01' },
      { productMatchResult: match },
    );

    const result = calculateImportConfidence({
      reportDetectionResult: report(0.95),
      productMatchResult: match,
      conflictEngineResult: conflict,
    });

    expect(result.confidenceScore).toBe(100);
    expect(result.confidenceLevel).toBe(CONFIDENCE_LEVEL.VERY_HIGH);
    expect(result.autoImportRecommendation).toBe(AUTO_IMPORT_RECOMMENDATION.AUTO_IMPORT);
    expect(result.confidenceReasons).toContain('Barcode matched');
  });

  it('scores saved mappings at 100', () => {
    const conflict = conflictForRow(
      { productName: 'Large Bread', quantity: 1, saleDate: '2026-03-01' },
      { productMatchResult: product({ reason: 'Saved Mapping', confidence: 100 }) },
    );

    const result = calculateImportConfidence({
      reportDetectionResult: report(0.92),
      productMatchResult: product({ reason: 'Saved Mapping', confidence: 100 }),
      conflictEngineResult: conflict,
    });

    expect(result.confidenceScore).toBe(100);
    expect(result.confidenceReasons).toContain('Saved mapping reused');
  });

  it('scores exact name matches in the HIGH band', () => {
    const conflict = conflictForRow(
      { productName: 'Milk Bread', quantity: 2, saleDate: '2026-03-01' },
      { productMatchResult: product({ reason: 'Exact Name Match' }) },
    );

    const result = calculateImportConfidence({
      reportDetectionResult: report(0.9),
      productMatchResult: product({ reason: 'Exact Name Match' }),
      conflictEngineResult: conflict,
    });

    expect(result.confidenceScore).toBeGreaterThanOrEqual(80);
    expect(result.confidenceLevel).toBe(CONFIDENCE_LEVEL.HIGH);
    expect(result.autoImportRecommendation).toBe(AUTO_IMPORT_RECOMMENDATION.PREVIEW_FIRST);
  });

  it('scores fuzzy matches in the MEDIUM band', () => {
    const conflict = conflictForRow(
      { productName: 'Large Bread', quantity: 2, saleDate: '2026-03-01' },
      {
        productMatchResult: {
          status: PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION,
          matchedProductId: 'prod-1',
          matchedProductName: 'Large Milk Bread',
          confidence: 85,
          reason: 'Fuzzy Name Match',
        },
      },
    );

    const result = calculateImportConfidence({
      reportDetectionResult: report(0.85),
      productMatchResult: {
        status: PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION,
        matchedProductId: 'prod-1',
        matchedProductName: 'Large Milk Bread',
        confidence: 85,
        reason: 'Fuzzy Name Match',
      },
      conflictEngineResult: conflict,
    });

    expect(result.confidenceScore).toBeGreaterThanOrEqual(60);
    expect(result.confidenceScore).toBeLessThan(80);
    expect(result.confidenceLevel).toBe(CONFIDENCE_LEVEL.MEDIUM);
    expect(result.confidenceReasons).toContain('Fuzzy product name match');
  });

  it('scores unknown products as VERY_LOW', () => {
    const conflict = conflictForRow(
      { productName: 'Moon Cheese', quantity: 1, saleDate: '2026-03-01' },
      {
        productMatchResult: {
          status: PRODUCT_MATCH_STATUS.NOT_FOUND,
          matchedProductId: null,
          matchedProductName: null,
          confidence: 0,
          reason: 'No matching product',
        },
      },
    );

    const result = calculateImportConfidence({
      reportDetectionResult: report(0.9),
      productMatchResult: {
        status: PRODUCT_MATCH_STATUS.NOT_FOUND,
        matchedProductId: null,
        matchedProductName: null,
        confidence: 0,
        reason: 'No matching product',
      },
      conflictEngineResult: conflict,
    });

    expect(result.confidenceLevel).toBe(CONFIDENCE_LEVEL.VERY_LOW);
    expect(result.autoImportRecommendation).toBe(AUTO_IMPORT_RECOMMENDATION.BLOCK_IMPORT);
  });

  it('scores multiple products as VERY_LOW', () => {
    const conflict = conflictForRow(
      { productName: 'Bread', quantity: 1, saleDate: '2026-03-01' },
      {
        productMatchResult: {
          status: PRODUCT_MATCH_STATUS.MULTIPLE_MATCHES,
          matchedProductId: null,
          matchedProductName: null,
          confidence: 80,
          reason: 'Multiple similar products',
        },
      },
    );

    const result = calculateImportConfidence({
      reportDetectionResult: report(0.9),
      productMatchResult: {
        status: PRODUCT_MATCH_STATUS.MULTIPLE_MATCHES,
        matchedProductId: null,
        matchedProductName: null,
        confidence: 80,
        reason: 'Multiple similar products',
      },
      conflictEngineResult: conflict,
    });

    expect(result.confidenceLevel).toBe(CONFIDENCE_LEVEL.VERY_LOW);
  });

  it('scores system configuration errors as VERY_LOW', () => {
    const conflict = conflictForRow(
      { productCode: 'DUP', productName: 'Bread', quantity: 1, saleDate: '2026-03-01' },
      {
        productMatchResult: {
          status: PRODUCT_MATCH_STATUS.SYSTEM_CONFIGURATION_ERROR,
          matchedProductId: null,
          matchedProductName: null,
          confidence: 0,
          reason: 'Duplicate barcode in BakeryOS catalog',
        },
      },
    );

    const result = calculateImportConfidence({
      reportDetectionResult: report(0.9),
      productMatchResult: {
        status: PRODUCT_MATCH_STATUS.SYSTEM_CONFIGURATION_ERROR,
        matchedProductId: null,
        matchedProductName: null,
        confidence: 0,
        reason: 'Duplicate barcode in BakeryOS catalog',
      },
      conflictEngineResult: conflict,
    });

    expect(result.confidenceLevel).toBe(CONFIDENCE_LEVEL.VERY_LOW);
    expect(result.autoImportRecommendation).toBe(AUTO_IMPORT_RECOMMENDATION.BLOCK_IMPORT);
  });
});

describe('calculateImportConfidence — conflict penalties', () => {
  it('scores missing quantity as VERY_LOW', () => {
    const conflict = conflictForRow(
      { productName: 'Bread', saleDate: '2026-03-01' },
      { productMatchResult: product({ reason: 'Exact Name Match' }) },
    );

    const result = calculateImportConfidence({
      reportDetectionResult: report(0.9),
      productMatchResult: product({ reason: 'Exact Name Match' }),
      conflictEngineResult: conflict,
    });

    expect(conflict.status).toBe(CONFLICT_ENGINE_STATUS.ERROR);
    expect(result.confidenceLevel).toBe(CONFIDENCE_LEVEL.VERY_LOW);
    expect(result.confidenceReasons).toContain('Missing quantity');
  });

  it('includes missing sale date in reasons and lowers score', () => {
    const conflict = conflictForRow(
      { productName: 'Bread', quantity: 1 },
      { productMatchResult: product({ reason: 'Exact Name Match' }) },
    );

    const result = calculateImportConfidence({
      reportDetectionResult: report(0.9),
      productMatchResult: product({ reason: 'Exact Name Match' }),
      conflictEngineResult: conflict,
    });

    expect(result.confidenceReasons).toContain('Missing sale date');
    expect(result.autoImportRecommendation).toBe(AUTO_IMPORT_RECOMMENDATION.BLOCK_IMPORT);
  });

  it('scores duplicate rows in the MEDIUM band', () => {
    const match = product({ reason: 'Exact Name Match' });
    const conflict = conflictForRow(
      { productName: 'Bread', quantity: 20, saleDate: '2026-03-01' },
      { productMatchResult: match, duplicateRowNumbers: [4] },
    );

    const result = calculateImportConfidence({
      reportDetectionResult: report(0.9),
      productMatchResult: match,
      conflictEngineResult: conflict,
    });

    expect(conflict.status).toBe(CONFLICT_ENGINE_STATUS.WARNING);
    expect(result.confidenceLevel).toBe(CONFIDENCE_LEVEL.MEDIUM);
    expect(result.confidenceReasons).toContain('Duplicate row in file');
  });

  it('scores unit mismatch warnings in the MEDIUM band', () => {
    const match = product({
      reason: 'Barcode Match',
      confidence: 100,
      warnings: [
        {
          code: 'UNIT_MISMATCH',
          message: 'Import unit "PCS" differs from catalog unit "PACK"',
          importUnit: 'PCS',
          catalogUnit: 'PACK',
        },
      ],
    });
    const conflict = conflictForRow(
      { productCode: 'BRD-001', productName: 'Bread', quantity: 1, saleDate: '2026-03-01', unit: 'PCS' },
      { productMatchResult: match },
    );

    const result = calculateImportConfidence({
      reportDetectionResult: report(0.95),
      productMatchResult: match,
      conflictEngineResult: conflict,
    });

    expect(result.confidenceReasons).toContain('Unit mismatch');
    expect(result.confidenceLevel).toBe(CONFIDENCE_LEVEL.MEDIUM);
  });

  it('scores negative quantity warnings in the MEDIUM band', () => {
    const match = product({ reason: 'Exact Name Match' });
    const conflict = conflictForRow(
      { productName: 'Bread', quantity: -2, saleDate: '2026-03-01' },
      { productMatchResult: match },
    );

    const result = calculateImportConfidence({
      reportDetectionResult: report(0.9),
      productMatchResult: match,
      conflictEngineResult: conflict,
    });

    expect(result.confidenceReasons).toContain('Negative quantity');
    expect(result.confidenceLevel).toBe(CONFIDENCE_LEVEL.MEDIUM);
  });
});

describe('calculateImportConfidence — report detection component', () => {
  it('adds high report confidence bonus', () => {
    const reasons: string[] = [];
    const bonus = scoreReportDetection(report(0.95), reasons);

    expect(bonus).toBe(REPORT_CONFIDENCE_SCORE.VERY_HIGH);
    expect(reasons).toContain('Report detected confidently');
  });

  it('adds low report confidence bonus for unknown reports', () => {
    const reasons: string[] = [];
    const bonus = scoreReportDetection(report(0.95, 'unknown'), reasons);

    expect(bonus).toBe(REPORT_CONFIDENCE_SCORE.LOW);
    expect(reasons).toContain('Unknown report structure');
  });

  it('adds medium report confidence bonus between 60 and 79 percent', () => {
    const reasons: string[] = [];
    const bonus = scoreReportDetection(report(0.65), reasons);

    expect(bonus).toBe(REPORT_CONFIDENCE_SCORE.MEDIUM);
    expect(reasons).toContain('Report detected with moderate confidence');
  });
});

describe('calculateImportConfidence — bounds and blank rows', () => {
  it('returns 0 for blank rows', () => {
    const result = calculateImportConfidence({ isBlankRow: true });

    expect(result.confidenceScore).toBe(0);
    expect(result.confidenceLevel).toBe(CONFIDENCE_LEVEL.VERY_LOW);
    expect(result.autoImportRecommendation).toBe(AUTO_IMPORT_RECOMMENDATION.BLOCK_IMPORT);
    expect(result.confidenceReasons).toContain('Blank row');
  });

  it('never returns a score below 0', () => {
    const conflict = conflictForRow(
      { productName: 'Bread', quantity: 1, saleDate: '2026-03-01' },
      {
        productMatchResult: {
          status: PRODUCT_MATCH_STATUS.SYSTEM_CONFIGURATION_ERROR,
          matchedProductId: null,
          matchedProductName: null,
          confidence: 0,
          reason: 'Duplicate barcode',
        },
      },
    );

    const result = calculateImportConfidence({
      reportDetectionResult: report(0.5),
      productMatchResult: {
        status: PRODUCT_MATCH_STATUS.NOT_FOUND,
        matchedProductId: null,
        matchedProductName: null,
        confidence: 0,
        reason: 'No matching product',
      },
      conflictEngineResult: conflict,
    });

    expect(result.confidenceScore).toBeGreaterThanOrEqual(0);
  });

  it('never returns a score above 100', () => {
    const conflict = conflictForRow(
      { productCode: 'BRD-001', productName: 'Bread', quantity: 1, saleDate: '2026-03-01' },
      { productMatchResult: product({ reason: 'Barcode Match', confidence: 100 }) },
    );

    const result = calculateImportConfidence({
      reportDetectionResult: report(1),
      productMatchResult: product({ reason: 'Barcode Match', confidence: 100 }),
      conflictEngineResult: conflict,
    });

    expect(result.confidenceScore).toBeLessThanOrEqual(100);
  });
});

describe('scoreProductMatching', () => {
  it('uses the documented product match score table', () => {
    const reasons: string[] = [];

    expect(scoreProductMatching(product({ reason: 'Barcode Match' }), reasons)).toBe(
      PRODUCT_MATCH_SCORE.BARCODE,
    );
    expect(scoreProductMatching(product({ reason: 'Saved Mapping' }), [])).toBe(
      PRODUCT_MATCH_SCORE.SAVED_MAPPING,
    );
    expect(scoreProductMatching(product({ reason: 'Exact Name Match' }), [])).toBe(
      PRODUCT_MATCH_SCORE.EXACT_NAME,
    );
    expect(
      scoreProductMatching(
        {
          status: PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION,
          matchedProductId: 'prod-1',
          matchedProductName: 'Bread',
          confidence: 80,
          reason: 'Fuzzy Name Match',
        },
        [],
      ),
    ).toBe(PRODUCT_MATCH_SCORE.FUZZY);
  });
});

describe('calculateImportConfidence — reasons', () => {
  it('returns human-readable confidence reasons instead of only a number', () => {
    const conflict = conflictForRow(
      { productCode: 'BRD-001', productName: 'Bread', quantity: 2, saleDate: '2026-03-01' },
      { productMatchResult: product({ reason: 'Barcode Match', confidence: 100 }) },
    );

    const result = calculateImportConfidence({
      reportDetectionResult: report(0.95),
      productMatchResult: product({ reason: 'Barcode Match', confidence: 100 }),
      conflictEngineResult: conflict,
    });

    expect(result.confidenceReasons.length).toBeGreaterThan(0);
    expect(result.confidenceReasons).toEqual(
      expect.arrayContaining(['Barcode matched', 'Report detected confidently']),
    );
  });
});
