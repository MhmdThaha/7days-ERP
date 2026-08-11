// @vitest-environment jsdom
/**
 * Import Review UI tests — read-only presentation of pre-analyzed engine outputs.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ImportReview } from '@/components/import/review/import-review';
import { ImportReviewOverview } from '@/components/import/review/import-review-overview';
import { ImportReviewReportSummary } from '@/components/import/review/import-review-report-summary';
import { ConfidenceBadge } from '@/components/import/review/confidence-badge';
import {
  IMPORT_REVIEW_PAGE_SIZE,
  ImportReviewRowTable,
} from '@/components/import/review/import-review-row-table';
import { ReviewStatusBadge } from '@/components/import/review/review-status-badge';
import { SALES_DETAIL_REPORT } from '@/lib/import/reports/definitions';
import type { ImportReviewRowViewModel, ImportReviewViewModel } from '@/lib/import/review/types';
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

function reviewRow(
  rowNumber: number,
  overrides: Partial<ImportReviewRowViewModel> = {},
): ImportReviewRowViewModel {
  const base: ImportReviewRowViewModel = {
    rowNumber,
    originalValues: {
      customerName: 'Corner Store',
      productName: 'Milk Bread',
      quantity: '2',
    },
    normalizedValues: {
      customerName: 'Corner Store',
      productName: 'Milk Bread',
      productCode: 'BRD-001',
      quantity: 2,
      saleDate: '2026-03-01',
      saleNumber: 'INV-100',
    },
    reportDetectionResult: reportDetection(),
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
      confidenceReasons: ['Exact product name match', 'Report detected confidently'],
      autoImportRecommendation: AUTO_IMPORT_RECOMMENDATION.PREVIEW_FIRST,
    },
  };

  return { ...base, ...overrides };
}

function viewModel(rows: ImportReviewRowViewModel[]): ImportReviewViewModel {
  const readyRows = rows.filter((row) => row.conflictEngineResult.status === CONFLICT_ENGINE_STATUS.READY).length;
  const warningRows = rows.filter((row) => row.conflictEngineResult.status === CONFLICT_ENGINE_STATUS.WARNING).length;
  const errorRows = rows.filter((row) => row.conflictEngineResult.status === CONFLICT_ENGINE_STATUS.ERROR).length;

  return {
    overview: {
      fileName: 'march-sales.csv',
      detectedReportName: 'Sales Detail',
      detectedReportType: 'sales-detail',
      reportConfidence: 0.92,
      headerRowIndex: 0,
      totalRows: rows.length,
      readyRows,
      warningRows,
      errorRows,
      averageConfidence:
        rows.length === 0
          ? 0
          : rows.reduce((sum, row) => sum + row.confidenceResult.confidenceScore, 0) / rows.length,
      autoImportEligibleRows: rows.filter(
        (row) => row.confidenceResult.autoImportRecommendation === AUTO_IMPORT_RECOMMENDATION.AUTO_IMPORT,
      ).length,
      blockedRows: rows.filter(
        (row) => row.confidenceResult.autoImportRecommendation === AUTO_IMPORT_RECOMMENDATION.BLOCK_IMPORT,
      ).length,
    },
    reportSummary: {
      matchedColumns: [
        { key: 'saleDate', label: 'Sale Date', header: 'Date' },
        { key: 'quantity', label: 'Quantity', header: 'Qty' },
      ],
      missingRequiredColumns: [],
      extraColumns: ['Notes'],
      unknownHeaders: ['Notes'],
      detectionReasons: ['Classified as Sales Detail with confidence 0.92.'],
    },
    rows,
  };
}

describe('ImportReviewOverview', () => {
  it('renders overview cards with file and row counts', () => {
    render(<ImportReviewOverview overview={viewModel([reviewRow(2), reviewRow(3)]).overview} />);

    expect(screen.getByText('march-sales.csv')).toBeDefined();
    expect(screen.getByText('Sales Detail')).toBeDefined();
    expect(screen.getByText('92%')).toBeDefined();
    expect(screen.getByText('Total rows', { selector: 'dt' })).toBeDefined();
    expect(screen.getByText('Yes')).toBeDefined();
  });
});

describe('ImportReviewReportSummary', () => {
  it('renders matched and unknown columns', () => {
    render(<ImportReviewReportSummary summary={viewModel([reviewRow(2)]).reportSummary} />);

    expect(screen.getByText(/Date → Sale Date/)).toBeDefined();
    expect(screen.getAllByText('Notes').length).toBeGreaterThan(0);
    expect(screen.getByText(/Classified as Sales Detail/)).toBeDefined();
  });
});

describe('ReviewStatusBadge and ConfidenceBadge', () => {
  it('renders status badges with text labels', () => {
    render(
      <div>
        <ReviewStatusBadge status={CONFLICT_ENGINE_STATUS.READY} />
        <ReviewStatusBadge status={CONFLICT_ENGINE_STATUS.WARNING} />
        <ReviewStatusBadge status={CONFLICT_ENGINE_STATUS.ERROR} />
      </div>,
    );

    expect(screen.getByText('Ready')).toBeDefined();
    expect(screen.getByText('Warning')).toBeDefined();
    expect(screen.getByText('Error')).toBeDefined();
  });

  it('renders confidence badge with level and numeric percent', () => {
    render(<ConfidenceBadge level={CONFIDENCE_LEVEL.HIGH} score={85} />);

    expect(screen.getByText('High')).toBeDefined();
    expect(screen.getByText('85%')).toBeDefined();
  });
});

describe('ImportReviewRowTable', () => {
  it('renders row columns from pre-analyzed data', () => {
    render(<ImportReviewRowTable rows={[reviewRow(2)]} />);

    expect(screen.getByText('Corner Store')).toBeDefined();
    expect(screen.getByText('Matched product')).toBeDefined();
    expect(screen.getAllByText('Milk Bread').length).toBeGreaterThan(0);
    expect(screen.getByText('Preview')).toBeDefined();
  });

  it('labels fuzzy suggestions instead of confirmed matches', () => {
    render(
      <ImportReviewRowTable
        rows={[
          reviewRow(2, {
            normalizedValues: {
              customerName: 'Corner Store',
              productName: 'Large Milk Bread',
              productCode: '389681957388',
              quantity: 58,
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
          }),
        ]}
        resolution={{
          onResolve: () => undefined,
          needsResolution: () => true,
          isReadOnly: () => false,
        }}
      />,
    );

    expect(screen.getByText('Suggested product')).toBeDefined();
    expect(screen.getByText('Bread')).toBeDefined();
    expect(screen.queryByText('Matched product')).toBeNull();
    expect(screen.getByRole('button', { name: 'Choose product' })).toBeDefined();
  });

  it('expands a row to show engine outputs', () => {
    render(<ImportReviewRowTable rows={[reviewRow(2)]} />);

    fireEvent.click(screen.getByLabelText('Expand row details'));

    expect(screen.getByText('Original values')).toBeDefined();
    expect(screen.getByText('Normalized values')).toBeDefined();
    expect(screen.getByText('Exact Name Match')).toBeDefined();
    expect(screen.getByText('Exact product name match')).toBeDefined();
  });

  it('filters error rows', () => {
    const rows = [
      reviewRow(2),
      reviewRow(3, {
        normalizedValues: {
          customerName: 'Error Customer',
          productName: 'Missing Product',
          quantity: 1,
          saleDate: '2026-03-01',
        },
        conflictEngineResult: {
          status: CONFLICT_ENGINE_STATUS.ERROR,
          conflicts: [
            {
              code: IMPORT_CONFLICT_CODE.UNKNOWN_PRODUCT,
              message: 'Product was not found',
            },
          ],
          warnings: [],
          blockingReason: 'Product was not found',
          recommendedAction: 'Map this row',
          confidencePenalty: 40,
        },
        confidenceResult: {
          confidenceScore: 15,
          confidenceLevel: CONFIDENCE_LEVEL.VERY_LOW,
          confidenceReasons: ['Product not found'],
          autoImportRecommendation: AUTO_IMPORT_RECOMMENDATION.BLOCK_IMPORT,
        },
        productMatchResult: {
          status: PRODUCT_MATCH_STATUS.NOT_FOUND,
          matchedProductId: null,
          matchedProductName: null,
          confidence: 0,
          reason: 'No matching product',
        },
      }),
    ];

    render(<ImportReviewRowTable rows={rows} />);
    fireEvent.click(screen.getByRole('button', { name: /^Errors/i }));

    expect(screen.queryByText('Milk Bread')).toBeNull();
    expect(screen.getByText('Missing Product')).toBeDefined();
    expect(screen.getByText('Block')).toBeDefined();
  });

  it('searches by customer name', () => {
    const rows = [
      reviewRow(2),
      reviewRow(3, {
        normalizedValues: {
          customerName: 'Metro Mart',
          productName: 'Cake',
          quantity: 1,
          saleDate: '2026-03-01',
        },
        originalValues: { customerName: 'Metro Mart', productName: 'Cake', quantity: '1' },
      }),
    ];

    render(<ImportReviewRowTable rows={rows} />);

    fireEvent.change(screen.getByLabelText('Search rows'), {
      target: { value: 'metro' },
    });

    expect(screen.queryByText('Corner Store')).toBeNull();
    expect(screen.getByText('Metro Mart')).toBeDefined();
  });

  it('sorts rows by confidence descending', () => {
    const rows = [
      reviewRow(2, {
        confidenceResult: {
          confidenceScore: 60,
          confidenceLevel: CONFIDENCE_LEVEL.MEDIUM,
          confidenceReasons: [],
          autoImportRecommendation: AUTO_IMPORT_RECOMMENDATION.USER_CONFIRMATION,
        },
      }),
      reviewRow(3, {
        normalizedValues: {
          customerName: 'High Score',
          productName: 'Bread',
          quantity: 1,
          saleDate: '2026-03-01',
        },
        confidenceResult: {
          confidenceScore: 95,
          confidenceLevel: CONFIDENCE_LEVEL.VERY_HIGH,
          confidenceReasons: [],
          autoImportRecommendation: AUTO_IMPORT_RECOMMENDATION.AUTO_IMPORT,
        },
      }),
    ];

    render(<ImportReviewRowTable rows={rows} />);

    fireEvent.change(screen.getByLabelText('Sort rows'), {
      target: { value: 'confidence' },
    });

    const table = screen.getByRole('table');
    const body = within(table).getAllByRole('rowgroup')[1]!;
    const dataRows = within(body).getAllByRole('row');
    expect(within(dataRows[0]!).getByText('3')).toBeDefined();
  });

  it('paginates large datasets without rendering every row', () => {
    const rows = Array.from({ length: 120 }, (_, index) => reviewRow(index + 2));

    render(<ImportReviewRowTable rows={rows} />);

    const table = screen.getByRole('table');
    const body = within(table).getAllByRole('rowgroup')[1]!;
    expect(within(body).getAllByRole('row')).toHaveLength(IMPORT_REVIEW_PAGE_SIZE);
    expect(screen.getByText(/Showing 1–50 of 120 rows/)).toBeDefined();
  });
});

describe('ImportReview', () => {
  it('shows the no-file empty state', () => {
    render(<ImportReview viewModel={null} />);

    expect(screen.getByText('No file uploaded')).toBeDefined();
  });

  it('shows the no-rows empty state', () => {
    render(<ImportReview viewModel={viewModel([])} />);

    expect(screen.getByText('No rows')).toBeDefined();
  });

  it('shows no-errors and no-warnings banners for clean files', () => {
    render(<ImportReview viewModel={viewModel([reviewRow(2)])} />);

    expect(screen.getByText(/No error rows/)).toBeDefined();
    expect(screen.getByText(/No warning rows/)).toBeDefined();
    expect(screen.getByText('Row review')).toBeDefined();
  });
});
