// @vitest-environment jsdom
/**
 * Product Resolution UI tests — dialog and in-memory row resolution wrapper.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImportReviewWithResolution } from '@/components/import/review/import-review-with-resolution';
import { ProductResolutionDialog } from '@/components/import/review/product-resolution-dialog';
import type { ImportReviewRowViewModel, ImportReviewViewModel } from '@/lib/import/review/types';
import { SALES_DETAIL_REPORT } from '@/lib/import/reports/definitions';
import { buildProductMatchCatalog } from '@/lib/import/services/product-matching.service';
import {
  AUTO_IMPORT_RECOMMENDATION,
  CONFIDENCE_LEVEL,
} from '@/lib/import/services/confidence-engine.service';
import {
  CONFLICT_ENGINE_STATUS,
  IMPORT_CONFLICT_CODE,
} from '@/lib/import/services/conflict-engine.service';
import { PRODUCT_MATCH_STATUS } from '@/lib/import/services/product-matching.service';

afterEach(cleanup);

const catalogItems = [
  {
    id: 'prod-bread',
    name: 'Milk Bread',
    code: 'BRD-001',
    unit: 'pcs',
    isActive: true,
    deletedAt: null,
    category: 'Breads',
  },
  {
    id: 'prod-generic-bread',
    name: 'Bread',
    code: 'BRD',
    unit: 'pcs',
    isActive: true,
    deletedAt: null,
    category: 'Breads',
  },
  {
    id: 'prod-big',
    name: 'Big Bread',
    code: 'BB-001',
    unit: 'pcs',
    isActive: true,
    deletedAt: null,
    category: 'Breads',
  },
];

function unknownRow(): ImportReviewRowViewModel {
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
    reportDetectionResult: {
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
    },
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

function reviewViewModel(): ImportReviewViewModel {
  return {
    overview: {
      fileName: 'sales.csv',
      detectedReportName: 'Sales Detail',
      detectedReportType: 'sales-detail',
      reportConfidence: 0.9,
      headerRowIndex: 0,
      totalRows: 1,
      readyRows: 0,
      warningRows: 0,
      errorRows: 1,
      averageConfidence: 35,
      autoImportEligibleRows: 0,
      blockedRows: 1,
    },
    reportSummary: {
      matchedColumns: [],
      missingRequiredColumns: [],
      extraColumns: [],
      unknownHeaders: [],
      detectionReasons: [],
    },
    rows: [unknownRow()],
  };
}

function multipleMatchRow(): ImportReviewRowViewModel {
  return {
    rowNumber: 3,
    originalValues: { productName: 'Bread' },
    normalizedValues: {
      customerName: 'Corner Store',
      productName: 'Bread',
      productCode: null,
      quantity: 1,
      saleDate: '2026-03-01',
    },
    reportDetectionResult: {
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
    },
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
    conflictEngineResult: {
      status: CONFLICT_ENGINE_STATUS.ERROR,
      conflicts: [
        {
          code: IMPORT_CONFLICT_CODE.MULTIPLE_PRODUCTS,
          message: 'Multiple similar products',
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
      blockingReason: 'Multiple similar products',
      recommendedAction: 'Choose one product.',
      confidencePenalty: 35,
    },
    confidenceResult: {
      confidenceScore: 35,
      confidenceLevel: CONFIDENCE_LEVEL.LOW,
      confidenceReasons: ['Multiple matching products'],
      autoImportRecommendation: AUTO_IMPORT_RECOMMENDATION.BLOCK_IMPORT,
    },
  };
}

function fuzzyRow(): ImportReviewRowViewModel {
  return {
    rowNumber: 4,
    originalValues: { productName: 'Large Milk Bread' },
    normalizedValues: {
      customerName: 'Corner Store',
      productName: 'Large Milk Bread',
      productCode: '389681957388',
      quantity: 58,
      saleDate: '2026-03-01',
    },
    reportDetectionResult: {
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
    },
    productMatchResult: {
      status: PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION,
      matchedProductId: 'prod-generic-bread',
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

describe('ProductResolutionDialog — fuzzy suggestions', () => {
  it('shows suggested product language and explicit confirmation actions', () => {
    const onApply = vi.fn();
    const row = fuzzyRow();
    const catalog = buildProductMatchCatalog(catalogItems);

    render(
      <ProductResolutionDialog
        row={row}
        catalog={catalog}
        catalogItems={catalogItems}
        open
        onOpenChange={() => undefined}
        onApply={onApply}
      />,
    );

    expect(screen.getByText('File says')).toBeDefined();
    expect(screen.getByText('Is this correct?')).toBeDefined();
    expect(screen.getByText('BakeryOS suggests:')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Yes, use Bread' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Choose another product' })).toBeDefined();
    expect(screen.queryByText('Matched product')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Yes, use Bread' }));
    expect(onApply).toHaveBeenCalledWith({
      type: 'select-existing',
      productId: 'prod-generic-bread',
    });
  });
});

describe('ProductResolutionDialog — ambiguous matches', () => {
  it('shows bakery-friendly guidance and candidate choices without internal jargon', () => {
    const onApply = vi.fn();
    const row = multipleMatchRow();
    const catalog = buildProductMatchCatalog(catalogItems);

    render(
      <ProductResolutionDialog
        row={row}
        catalog={catalog}
        catalogItems={catalogItems}
        open
        onOpenChange={() => undefined}
        onApply={onApply}
      />,
    );

    expect(screen.getByText(/Possible BakeryOS products/i)).toBeDefined();
    expect(
      screen.getByText(
        'BakeryOS found more than one possible product. Choose the correct one.',
      ),
    ).toBeDefined();
    expect(screen.queryByText(/candidateScore|normalizedSimilarity|resolutionConfidence/i)).toBeNull();
    expect(screen.getByLabelText('Select Big Bread')).toBeDefined();
    expect(screen.queryByLabelText('Select Milk Bread')).toBeNull();
  });
});

describe('ProductResolutionDialog', () => {
  it('shows original values, filters catalog search, and applies a selection', () => {
    const onApply = vi.fn();
    const row = unknownRow();
    const catalog = buildProductMatchCatalog(catalogItems);

    render(
      <ProductResolutionDialog
        row={row}
        catalog={catalog}
        catalogItems={catalogItems}
        open
        onOpenChange={() => undefined}
        onApply={onApply}
      />,
    );

    expect(screen.getByText('Product not found')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Search product catalog'), {
      target: { value: 'Big Bread' },
    });

    const table = screen.getByRole('table');
    expect(within(table).getByText('Big Bread')).toBeDefined();
    expect(within(table).queryByText('Milk Bread')).toBeNull();

    fireEvent.click(screen.getByLabelText('Select Big Bread'));
    fireEvent.click(screen.getByRole('button', { name: 'Use selected product' }));

    expect(onApply).toHaveBeenCalledWith({
      type: 'select-existing',
      productId: 'prod-big',
    });
  });

  it('supports cancel and skip-row without applying a product selection', () => {
    const onApply = vi.fn();
    const onOpenChange = vi.fn();
    const row = unknownRow();
    const catalog = buildProductMatchCatalog(catalogItems);

    render(
      <ProductResolutionDialog
        row={row}
        catalog={catalog}
        catalogItems={catalogItems}
        open
        onOpenChange={onOpenChange}
        onApply={onApply}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: 'Skip row' }));
    expect(onApply).toHaveBeenCalledWith({ type: 'skip-row' });
  });
});

describe('ImportReviewWithResolution', () => {
  it('shows Resolve button and updates overview after resolving one row', () => {
    render(
      <ImportReviewWithResolution
        initialViewModel={reviewViewModel()}
        catalogItems={catalogItems}
      />,
    );

    expect(screen.getByRole('button', { name: 'Choose product' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Choose product' }));
    fireEvent.click(screen.getByLabelText('Select Milk Bread'));
    fireEvent.click(screen.getByRole('button', { name: 'Use selected product' }));

    expect(screen.queryByRole('button', { name: 'Choose product' })).toBeNull();
  });
});
