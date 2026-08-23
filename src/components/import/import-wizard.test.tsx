// @vitest-environment jsdom
/**
 * Wizard flow tests for Preview → Conflict Detection → Conflict Review → Commit.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '@/lib/utils/action-result';
import type { ConflictDetectionResult } from '@/lib/import/services/conflict.service';
import type { ImportAnalysis } from '@/types/import';

vi.mock('@/actions/import', () => ({
  getImportSheetsAction: vi.fn(),
  analyzeImportAction: vi.fn(),
  revalidateImportMappingAction: vi.fn(),
  buildImportReviewAction: vi.fn(),
  analyzeSalesImportDuplicateReviewAction: vi.fn(),
  detectImportConflictsAction: vi.fn(),
  commitImportWithResolutionAction: vi.fn(),
  commitSalesImportAction: vi.fn(),
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'test-uid' },
    isAuthenticated: true,
    isLoading: false,
  })),
}));

import {
  analyzeImportAction,
  analyzeSalesImportDuplicateReviewAction,
  buildImportReviewAction,
  commitImportWithResolutionAction,
  commitSalesImportAction,
  detectImportConflictsAction,
  getImportSheetsAction,
  revalidateImportMappingAction,
} from '@/actions/import';
import { ImportWizard } from '@/components/import/import-wizard';
import { PRODUCT_IMPORT_REPORT, SALES_DETAIL_REPORT } from '@/lib/import/reports';
import type { ImportReviewBuildResult } from '@/types/import';
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

type MappingReviewFixtureReport = {
  reportType: string;
  displayName: string;
};

function withMappingReview(
  base: Omit<ImportAnalysis, 'mappingReview' | 'autoMappingSnapshot' | 'guidance' | 'diagnostics'>,
  report: MappingReviewFixtureReport = {
    reportType: PRODUCT_IMPORT_REPORT.reportType,
    displayName: PRODUCT_IMPORT_REPORT.displayName,
  },
): ImportAnalysis {
  return {
    ...base,
    mappingReview: {
      reportType: report.reportType,
      viewModel: {
        reportDisplayName: report.displayName,
        reportConfidence: 0.85,
        mappingConfidence: 0.8,
        reportType: report.reportType,
        canSaveMapping: report.reportType !== 'unknown',
        mappedHeaders: base.mapping.columnMappings.map((entry) => entry.sourceHeader),
        unmappedHeaders: base.unmappedHeaders,
        ignoredHeaders: [],
        ambiguousHeaders: [],
        rows: base.mapping.columnMappings.map((entry) => ({
          sourceHeader: entry.sourceHeader,
          status: 'mapped' as const,
          targetField: entry.targetField,
          targetFieldLabel: entry.targetField,
          mappingSource: 'auto' as const,
          autoSuggestion: null,
          ambiguousCandidates: [],
        })),
      },
      baseline: {
        entries: Object.fromEntries(
          base.mapping.columnMappings.map((entry) => [
            entry.sourceHeader,
            { kind: 'mapped' as const, targetField: entry.targetField, origin: 'auto' as const },
          ]),
        ),
      },
    },
    autoMappingSnapshot: {
      mappedFields: base.mapping.columnMappings.map((entry) => ({
        sourceHeader: entry.sourceHeader,
        targetField: entry.targetField,
        score: 90,
      })),
      ambiguousMappings: [],
      ignoredHeaders: [],
      unmappedHeaders: base.unmappedHeaders,
    },
    guidance: { items: [] },
    diagnostics: {
      pipelineStages: [],
      executionTime: {
        totalMs: 0,
        startedAt: '2026-07-24T00:00:00.000Z',
        completedAt: '2026-07-24T00:00:00.000Z',
      },
      detectedHeaderRow: 0,
      detectedHeaders: [],
      reportType: report.reportType,
      reportConfidence: 0.85,
      profileId: report.reportType,
      mappingStatistics: {
        mappedCount: base.mapping.columnMappings.length,
        unmappedCount: base.unmappedHeaders.length,
        ignoredCount: 0,
        ambiguousCount: 0,
        mappingConfidence: 0.8,
      },
      savedMappingStatistics: {
        usedSavedMapping: false,
        appliedCount: base.mapping.columnMappings.length,
        appliedFromSavedCount: 0,
        appliedFromAutoCount: base.mapping.columnMappings.length,
        skippedCount: 0,
        outdatedCount: 0,
        newMappingsNeededCount: base.unmappedHeaders.length,
        versionMismatch: false,
        savedMappingVersion: null,
        confidence: 0.8,
      },
      validationSummary: {
        totalRows: base.report.result.summary.totalRows,
        validRows: base.report.result.summary.validRows,
        warningRows: base.report.result.summary.warningRows,
        errorRows: base.report.result.summary.errorRows,
        missingRequiredFields: base.report.missingRequiredFields,
        missingSourceHeaders: base.report.missingSourceHeaders,
        ignoredHeaders: base.report.ignoredHeaders,
        issueCodeCounts: {},
        skippedEmptyRowCount: base.report.skippedEmptyRowCount,
      },
      guidanceSummary: {
        totalItems: 0,
        infoCount: 0,
        warningCount: 0,
        errorCount: 0,
        codes: [],
      },
      warnings: [],
      errors: [],
    },
  };
}

const analysis = withMappingReview({
  fileName: 'items.xlsx',
  sheetName: 'Items',
  mapping: {
    columnMappings: [
      { sourceHeader: 'Item Name', targetField: 'name' },
      { sourceHeader: 'Sale Price', targetField: 'sellingPrice' },
    ],
  },
  unmappedHeaders: [],
  report: {
    entityType: 'product',
    sheetName: 'Items',
    headers: ['Item Name', 'Sale Price'],
    skippedEmptyRowCount: 0,
    ignoredHeaders: [],
    missingSourceHeaders: [],
    missingRequiredFields: [],
    result: {
      rows: [
        {
          rowNumber: 2,
          values: { name: 'Milk Bread', sellingPrice: 45 },
          issues: [],
          status: 'valid',
        },
        {
          rowNumber: 3,
          values: { name: 'Veg Puff', sellingPrice: 25 },
          issues: [],
          status: 'valid',
        },
      ],
      summary: { totalRows: 2, validRows: 2, warningRows: 0, errorRows: 0 },
    },
  },
});

const saleAnalysis = withMappingReview(
  {
  fileName: 'sales.xlsx',
  sheetName: 'Sales',
  mapping: {
    columnMappings: [
      { sourceHeader: 'Sale Date', targetField: 'saleDate' },
      { sourceHeader: 'Product Name', targetField: 'productName' },
      { sourceHeader: 'Qty', targetField: 'quantity' },
    ],
  },
  unmappedHeaders: [],
  report: {
    entityType: 'sale',
    sheetName: 'Sales',
    headers: ['Sale Date', 'Product Name', 'Qty'],
    skippedEmptyRowCount: 0,
    ignoredHeaders: [],
    missingSourceHeaders: [],
    missingRequiredFields: [],
    result: {
      rows: [
        {
          rowNumber: 2,
          values: {
            saleDate: '2026-03-01',
            productName: 'Milk Bread',
            quantity: 2,
          },
          issues: [],
          status: 'valid',
        },
        {
          rowNumber: 3,
          values: {
            saleDate: '2026-03-02',
            productName: 'Veg Puff',
            quantity: 1,
          },
          issues: [],
          status: 'valid',
        },
      ],
      summary: { totalRows: 2, validRows: 2, warningRows: 0, errorRows: 0 },
    },
  },
  },
  {
    reportType: SALES_DETAIL_REPORT.reportType,
    displayName: SALES_DETAIL_REPORT.displayName,
  },
);

const saleReviewBuild: ImportReviewBuildResult = {
  fileName: 'sales.xlsx',
  sheetName: 'Sales',
  mapping: saleAnalysis.mapping,
  catalogItems: [
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
      id: 'prod-puff',
      name: 'Veg Puff',
      code: 'VP-001',
      unit: 'pcs',
      isActive: true,
      deletedAt: null,
      category: 'Snacks',
    },
  ],
  stockByProductId: {
    'prod-bread': 12,
    'prod-puff': 4,
  },
  pipelineErrors: [],
  preparationContext: {},
  viewModel: {
    overview: {
      fileName: 'sales.xlsx',
      detectedReportName: 'Sales Detail',
      detectedReportType: 'sales-detail',
      reportConfidence: 0.86,
      headerRowIndex: 0,
      totalRows: 2,
      readyRows: 2,
      warningRows: 0,
      errorRows: 0,
      averageConfidence: 88,
      autoImportEligibleRows: 0,
      blockedRows: 0,
    },
    reportSummary: {
      matchedColumns: [
        { key: 'saleDate', label: 'Sale Date', header: 'Sale Date' },
        { key: 'productName', label: 'Product Name', header: 'Product Name' },
        { key: 'quantity', label: 'Quantity', header: 'Qty' },
      ],
      missingRequiredColumns: [],
      extraColumns: [],
      unknownHeaders: [],
      detectionReasons: ['Classified as Sales Detail.'],
    },
    rows: [
      {
        rowNumber: 2,
        originalValues: {
          saleDate: '2026-03-01',
          productName: 'Milk Bread',
          quantity: '2',
        },
        normalizedValues: {
          saleDate: '2026-03-01',
          productName: 'Milk Bread',
          quantity: 2,
        },
        reportDetectionResult: {
          profile: SALES_DETAIL_REPORT,
          reportType: 'sales-detail',
          confidence: 0.86,
          matchedColumns: [],
          missingColumns: [],
          matchedHeaders: [],
          missingHeaders: [],
          unmatchedHeaders: [],
          explanation: [],
          candidates: [],
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
          confidenceScore: 88,
          confidenceLevel: CONFIDENCE_LEVEL.HIGH,
          confidenceReasons: ['Exact product name match'],
          autoImportRecommendation: AUTO_IMPORT_RECOMMENDATION.PREVIEW_FIRST,
        },
      },
      {
        rowNumber: 3,
        originalValues: {
          saleDate: '2026-03-02',
          productName: 'Veg Puff',
          quantity: '1',
        },
        normalizedValues: {
          saleDate: '2026-03-02',
          productName: 'Veg Puff',
          quantity: 1,
        },
        reportDetectionResult: {
          profile: SALES_DETAIL_REPORT,
          reportType: 'sales-detail',
          confidence: 0.86,
          matchedColumns: [],
          missingColumns: [],
          matchedHeaders: [],
          missingHeaders: [],
          unmatchedHeaders: [],
          explanation: [],
          candidates: [],
        },
        productMatchResult: {
          status: PRODUCT_MATCH_STATUS.MATCHED,
          matchedProductId: 'prod-puff',
          matchedProductName: 'Veg Puff',
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
          confidenceScore: 88,
          confidenceLevel: CONFIDENCE_LEVEL.HIGH,
          confidenceReasons: ['Exact product name match'],
          autoImportRecommendation: AUTO_IMPORT_RECOMMENDATION.PREVIEW_FIRST,
        },
      },
    ],
  },
};

const noConflicts: ConflictDetectionResult = {
  duplicateRowsInFile: [],
  exactDuplicateRows: [],
  existingProducts: [],
  duplicateProductCodes: [],
  cleanRows: [2, 3],
  summary: {
    totalChecked: 2,
    exactDuplicateRowCount: 0,
    exactDuplicateNameCount: 0,
    conflictingDuplicateRowCount: 0,
    conflictingDuplicateNameCount: 0,
    duplicateNameCount: 0,
    duplicateRowCount: 0,
    existingProductCount: 0,
    existingProductNameCount: 0,
    cleanRowCount: 2,
    duplicateProductCodeCount: 0,
  },
};

function renderSaleWizard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ImportWizard
        entityType="sale"
        entityLabel="Sales"
        entityLabelSingular="Sale"
        returnHref="/sales"
        returnLabel="Return to Sales"
      />
    </QueryClientProvider>,
  );
}

function renderWizard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ImportWizard
        entityType="product"
        entityLabel="Products"
        entityLabelSingular="Product"
        returnHref="/products"
        returnLabel="Return to Products"
      />
    </QueryClientProvider>,
  );
}

async function goToPreview(container: HTMLElement) {
  vi.mocked(getImportSheetsAction).mockResolvedValue({
    success: true,
    data: { sheetNames: ['Items'] },
  });
  vi.mocked(analyzeImportAction).mockResolvedValue({ success: true, data: analysis });
  vi.mocked(revalidateImportMappingAction).mockResolvedValue({ success: true, data: analysis });

  const input = container.querySelector('input[type="file"]');
  const file = new File(['Item Name,Sale Price\nMilk Bread,45\n'], 'items.xlsx');

  fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));

  await screen.findByText('Column mapping');
  fireEvent.click(screen.getByRole('button', { name: /continue to preview/i }));

  return screen.findByRole('button', { name: /import 2 products/i });
}

async function goToSalePreview(container: HTMLElement) {
  vi.mocked(getImportSheetsAction).mockResolvedValue({
    success: true,
    data: { sheetNames: ['Sales'] },
  });
  vi.mocked(analyzeImportAction).mockResolvedValue({ success: true, data: saleAnalysis });
  vi.mocked(buildImportReviewAction).mockResolvedValue({ success: true, data: saleReviewBuild });

  const input = container.querySelector('input[type="file"]');
  const file = new File(['Sale Date,Product Name,Qty\n2026-03-01,Milk Bread,2\n'], 'sales.xlsx');

  fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));

  await screen.findByText('Column mapping');
  fireEvent.click(screen.getByRole('button', { name: /continue to preview/i }));

  return screen.findByRole('button', { name: /import \d+ sales/i });
}

beforeEach(() => {
  vi.mocked(getImportSheetsAction).mockReset();
  vi.mocked(analyzeImportAction).mockReset();
  vi.mocked(revalidateImportMappingAction).mockReset();
  vi.mocked(buildImportReviewAction).mockReset();
  vi.mocked(analyzeSalesImportDuplicateReviewAction).mockReset();
  vi.mocked(detectImportConflictsAction).mockReset();
  vi.mocked(commitImportWithResolutionAction).mockReset();
  vi.mocked(commitSalesImportAction).mockReset();
});

describe('ImportWizard mapping review flow', () => {
  it('shows Mapping Review after analyze and revalidates before preview', async () => {
    const { container } = renderWizard();

    vi.mocked(getImportSheetsAction).mockResolvedValue({
      success: true,
      data: { sheetNames: ['Items'] },
    });
    vi.mocked(analyzeImportAction).mockResolvedValue({ success: true, data: analysis });
    vi.mocked(revalidateImportMappingAction).mockResolvedValue({ success: true, data: analysis });

    const input = container.querySelector('input[type="file"]');
    const file = new File(['Item Name,Sale Price\nMilk Bread,45\n'], 'items.xlsx');

    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText('Column mapping')).toBeDefined();
    expect(screen.getByText('Product Import')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /continue to preview/i }));

    expect(await screen.findByRole('button', { name: /import 2 products/i })).toBeDefined();
    expect(vi.mocked(revalidateImportMappingAction)).toHaveBeenCalledWith(
      'product',
      expect.any(FormData),
      analysis.mapping,
      undefined,
    );
  });

  it('passes saveMapping option on commit when enabled in mapping step', async () => {
    const { container } = renderWizard();

    vi.mocked(getImportSheetsAction).mockResolvedValue({
      success: true,
      data: { sheetNames: ['Items'] },
    });
    vi.mocked(analyzeImportAction).mockResolvedValue({ success: true, data: analysis });
    vi.mocked(revalidateImportMappingAction).mockResolvedValue({ success: true, data: analysis });
    vi.mocked(detectImportConflictsAction).mockResolvedValue({
      success: true,
      data: noConflicts,
    });
    vi.mocked(commitImportWithResolutionAction).mockResolvedValue({
      success: true,
      data: {
        strategy: 'new-only',
        durationMs: 500,
        result: {
          importedCount: 2,
          skippedCount: 0,
          failedCount: 0,
          updatedCount: 0,
          documentIds: ['doc-1', 'doc-2'],
          updatedDocumentIds: [],
          rowResults: [],
          commitErrors: [],
        },
      },
    });

    const input = container.querySelector('input[type="file"]');
    const file = new File(['Item Name,Sale Price\nMilk Bread,45\n'], 'items.xlsx');

    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await screen.findByText('Column mapping');

    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: /continue to preview/i }));
    await screen.findByRole('button', { name: /import 2 products/i });

    fireEvent.click(screen.getByRole('button', { name: /import 2 products/i }));
    await screen.findByText('No conflicts detected');
    fireEvent.click(screen.getByRole('button', { name: /import new products only/i }));

    expect(await screen.findByText('Import complete')).toBeDefined();
    expect(vi.mocked(commitImportWithResolutionAction)).toHaveBeenCalledWith(
      analysis.report,
      noConflicts,
      'new-only',
      {
        saveMapping: true,
        mapping: analysis.mapping,
        reportType: 'product-import',
      },
    );
  });
});

describe('ImportWizard conflict review flow', () => {
  it('runs conflict detection on Import and shows the conflict review screen', async () => {
    const { container } = renderWizard();
    const importButton = await goToPreview(container);

    let resolveDetect!: (value: ActionResult<ConflictDetectionResult>) => void;
    vi.mocked(detectImportConflictsAction).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDetect = resolve;
        }),
    );

    fireEvent.click(importButton);
    fireEvent.click(importButton);

    expect(vi.mocked(detectImportConflictsAction)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(detectImportConflictsAction)).toHaveBeenCalledWith(analysis.report);

    expect(await screen.findByText(/checking for conflicts/i)).toBeDefined();

    resolveDetect({ success: true, data: noConflicts });

    expect(await screen.findByText('No conflicts detected')).toBeDefined();
    expect(screen.getByRole('button', { name: /import new products only/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /update existing products/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDefined();
  });

  it('returns to preview when Cancel is clicked on the conflict screen', async () => {
    const { container } = renderWizard();
    const importButton = await goToPreview(container);

    vi.mocked(detectImportConflictsAction).mockResolvedValue({
      success: true,
      data: noConflicts,
    });

    fireEvent.click(importButton);
    await screen.findByText('No conflicts detected');

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(
      await screen.findByRole('button', { name: /import 2 products/i }),
    ).toBeDefined();
  });

  it('commits with new-only strategy and shows the result screen', async () => {
    const { container } = renderWizard();
    const importButton = await goToPreview(container);

    vi.mocked(detectImportConflictsAction).mockResolvedValue({
      success: true,
      data: noConflicts,
    });
    vi.mocked(commitImportWithResolutionAction).mockResolvedValue({
      success: true,
      data: {
        strategy: 'new-only',
        durationMs: 500,
        result: {
          importedCount: 2,
          skippedCount: 0,
          failedCount: 0,
          updatedCount: 0,
          documentIds: ['doc-1', 'doc-2'],
          updatedDocumentIds: [],
          rowResults: [
            { rowNumber: 2, status: 'imported', documentId: 'doc-1' },
            { rowNumber: 3, status: 'imported', documentId: 'doc-2' },
          ],
          commitErrors: [],
        },
      },
    });

    fireEvent.click(importButton);
    await screen.findByText('No conflicts detected');

    fireEvent.click(screen.getByRole('button', { name: /import new products only/i }));

    expect(await screen.findByText('Import complete')).toBeDefined();
    expect(vi.mocked(commitImportWithResolutionAction)).toHaveBeenCalledWith(
      analysis.report,
      noConflicts,
      'new-only',
      {
        saveMapping: false,
        mapping: analysis.mapping,
        reportType: 'product-import',
      },
    );
  });

  it('commits with update-existing strategy when chosen', async () => {
    const { container } = renderWizard();
    const importButton = await goToPreview(container);

    const withExisting: ConflictDetectionResult = {
      ...noConflicts,
      existingProducts: [
        {
          rowNumber: 2,
          name: 'Milk Bread',
          normalizedName: 'milk bread',
          existingProduct: { id: 'p1', name: 'Milk Bread', code: 'MB-1' },
        },
      ],
      cleanRows: [3],
      summary: {
        totalChecked: 2,
        exactDuplicateRowCount: 0,
        exactDuplicateNameCount: 0,
        conflictingDuplicateRowCount: 0,
        conflictingDuplicateNameCount: 0,
        duplicateNameCount: 0,
        duplicateRowCount: 0,
        existingProductCount: 1,
        existingProductNameCount: 1,
        cleanRowCount: 1,
        duplicateProductCodeCount: 0,
      },
    };

    vi.mocked(detectImportConflictsAction).mockResolvedValue({
      success: true,
      data: withExisting,
    });
    vi.mocked(commitImportWithResolutionAction).mockResolvedValue({
      success: true,
      data: {
        strategy: 'update-existing',
        durationMs: 800,
        result: {
          importedCount: 1,
          updatedCount: 1,
          skippedCount: 0,
          failedCount: 0,
          documentIds: ['doc-2'],
          updatedDocumentIds: ['p1'],
          rowResults: [
            { rowNumber: 2, status: 'imported', documentId: 'p1' },
            { rowNumber: 3, status: 'imported', documentId: 'doc-2' },
          ],
          commitErrors: [],
        },
      },
    });

    fireEvent.click(importButton);
    await screen.findByText(/already exist in BakeryOS/i);

    fireEvent.click(screen.getByRole('button', { name: /update existing products/i }));

    expect(await screen.findByText('Import complete')).toBeDefined();
    expect(vi.mocked(commitImportWithResolutionAction)).toHaveBeenCalledWith(
      analysis.report,
      withExisting,
      'update-existing',
      {
        saveMapping: false,
        mapping: analysis.mapping,
        reportType: 'product-import',
      },
    );
  });

  it('stays on preview when conflict detection fails', async () => {
    const { container } = renderWizard();
    const importButton = await goToPreview(container);

    vi.mocked(detectImportConflictsAction).mockResolvedValue({
      success: false,
      error: 'Organization context is not configured.',
      code: 'ORG_NOT_CONFIGURED',
    });

    fireEvent.click(importButton);

    const retryButton = await screen.findByRole('button', {
      name: /import 2 products/i,
    });
    expect(retryButton.hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText('No conflicts detected')).toBeNull();
  });
});

describe('ImportWizard sale review flow', () => {
  it('builds import review after mapping and shows the new review screen', async () => {
    const { container } = renderSaleWizard();
    const continueButton = await goToSalePreview(container);

    expect(screen.getByText('Import Review')).toBeDefined();
    expect(screen.getByText(/sales found/i)).toBeDefined();
    expect(vi.mocked(buildImportReviewAction)).toHaveBeenCalledWith(
      'sale',
      expect.any(FormData),
      saleAnalysis.mapping,
      undefined,
      {},
    );
    expect(vi.mocked(revalidateImportMappingAction)).not.toHaveBeenCalled();
    expect(continueButton).toBeDefined();
  });

  it('imports sales after review and shows the result screen', async () => {
    const { container } = renderSaleWizard();
    const importButton = await goToSalePreview(container);

    vi.mocked(analyzeSalesImportDuplicateReviewAction).mockResolvedValue({
      success: true,
      data: {
        status: 'ok',
        duplicateResult: {
          status: 'NO_DUPLICATE',
          confidence: 0,
          matchedImport: null,
          matchedInvoices: [],
          matchedRows: 0,
          duplicateRowFingerprints: [],
          duplicateReasons: [],
          recommendation: 'CONTINUE',
        },
        warning: null,
      },
    });

    vi.mocked(commitSalesImportAction).mockResolvedValue({
      success: true,
      data: {
        status: 'success',
        duplicateResult: null,
        execution: {
          importId: 'imp-1',
          imported: 1,
          skipped: 0,
          failed: 0,
          status: 'IMPORTED',
          saleIds: ['sale-1'],
          rowResults: [{ rowNumber: 2, status: 'imported', saleId: 'sale-1' }],
          startedAt: '2026-03-15T10:00:00.000Z',
          completedAt: '2026-03-15T10:00:01.000Z',
          durationMs: 1000,
          warnings: [],
          errors: [],
        },
        finalization: {
          status: 'COMPLETED',
          completedSales: 1,
          failedSales: 0,
          completedSaleIds: ['sale-1'],
          outcomes: [{ saleId: 'sale-1', status: 'completed' }],
          warnings: [],
          errors: [],
          startedAt: '2026-03-15T10:00:01.000Z',
          completedAt: '2026-03-15T10:00:02.000Z',
          durationMs: 1000,
        },
        durationMs: 1500,
        fileName: 'sales.xlsx',
      },
    });

    fireEvent.click(importButton);

    expect(await screen.findByText('Import complete')).toBeDefined();
    expect(vi.mocked(commitSalesImportAction)).toHaveBeenCalledWith(
      expect.any(FormData),
      saleAnalysis.mapping,
      [],
      expect.objectContaining({
        reportType: 'sales-detail',
        preparation: {},
      }),
    );
    expect(vi.mocked(detectImportConflictsAction)).not.toHaveBeenCalled();
    expect(vi.mocked(commitImportWithResolutionAction)).not.toHaveBeenCalled();
  });

  it('returns to mapping from the sales review screen', async () => {
    const { container } = renderSaleWizard();
    await goToSalePreview(container);

    fireEvent.click(screen.getByRole('button', { name: 'Back to mapping' }));

    expect(await screen.findByText('Column mapping')).toBeDefined();
  });
});
