// @vitest-environment jsdom
/**
 * Sales Import Review step — simplified owner-facing review + partial import.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SalesImportReviewStep } from '@/components/import/sales-import-review-step';
import type { ImportReviewViewModel } from '@/lib/import/review/types';
import { SALES_DETAIL_REPORT } from '@/lib/import/reports/definitions';
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
];

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
    rows: [
      {
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
      },
    ],
  };
}

describe('SalesImportReviewStep', () => {
  it('resolves a row and imports after choosing a product', () => {
    const onImport = vi.fn();

    render(
      <SalesImportReviewStep
        initialViewModel={reviewViewModel()}
        catalogItems={catalogItems}
        onImport={onImport}
        onBack={() => undefined}
        onStartOver={() => undefined}
      />,
    );

    expect(screen.getByText('Import Review')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Choose product' }));
    fireEvent.click(screen.getByLabelText('Select Milk Bread'));
    fireEvent.click(screen.getByRole('button', { name: 'Use selected product' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 Sales' }));

    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0]?.[0]?.rows[0]?.productMatchResult?.matchedProductId).toBe(
      'prod-bread',
    );
  });

  it('allows partial import when some rows are ready and others need attention', () => {
    const onImport = vi.fn();

    render(
      <SalesImportReviewStep
        initialViewModel={{
          ...reviewViewModel(),
          rows: [
            {
              ...reviewViewModel().rows[0]!,
              rowNumber: 2,
              normalizedValues: {
                customerName: 'Store',
                productName: 'Large Milk Bread',
                quantity: 10,
                saleDate: '2026-03-01',
              },
              productMatchResult: {
                status: PRODUCT_MATCH_STATUS.MATCHED,
                matchedProductId: 'prod-bread',
                matchedProductName: 'Milk Bread',
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
            },
            {
              ...reviewViewModel().rows[0]!,
              rowNumber: 3,
              normalizedValues: {
                customerName: 'Store',
                productName: 'Large Milk Bread',
                quantity: 5,
                saleDate: '2026-03-01',
              },
              productMatchResult: {
                status: PRODUCT_MATCH_STATUS.NEEDS_CONFIRMATION,
                matchedProductId: 'prod-bread',
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
            },
          ],
        }}
        catalogItems={[
          ...catalogItems,
          {
            id: 'prod-generic',
            name: 'Bread',
            code: 'BRD',
            unit: 'pcs',
            isActive: true,
            deletedAt: null,
            category: 'Breads',
          },
        ]}
        onImport={onImport}
        onBack={() => undefined}
        onStartOver={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Import 1 Ready Sales' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 Ready Sales' }));
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it('blocks import when zero rows are ready', () => {
    const onImport = vi.fn();

    render(
      <SalesImportReviewStep
        initialViewModel={reviewViewModel()}
        catalogItems={catalogItems}
        onImport={onImport}
        onBack={() => undefined}
        onStartOver={() => undefined}
      />,
    );

    const resolveButton = screen.getByRole('button', { name: 'Resolve issues' });
    expect((resolveButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(resolveButton);
    expect(onImport).not.toHaveBeenCalled();
  });

  it('supports back and start over actions', () => {
    const onBack = vi.fn();
    const onStartOver = vi.fn();

    render(
      <SalesImportReviewStep
        initialViewModel={reviewViewModel()}
        catalogItems={catalogItems}
        onImport={() => undefined}
        onBack={onBack}
        onStartOver={onStartOver}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back to mapping' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });
});
